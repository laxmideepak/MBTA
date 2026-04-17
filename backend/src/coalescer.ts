import type { StateManager } from './state-manager.js';
import type { Alert, Prediction, Vehicle } from './types.js';

/**
 * Minimal surface of the WebSocket broadcaster used by the coalescer. Keeping
 * it structural lets tests inject a plain recorder without pulling in `ws` or
 * HTTP, and lets the coalescer stay ignorant of the wire transport.
 */
export interface BroadcasterLike {
  broadcastVehicles(data: unknown): void;
  broadcastPredictions(data: unknown): void;
  broadcastAlerts(data: unknown): void;
}

export interface CoalescerOptions {
  /** Minimum milliseconds between flushes. Default 250. */
  intervalMs?: number;
  /** Injectable setTimeout for tests. Default global `setTimeout`. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** Injectable clearTimeout for tests. Default global `clearTimeout`. */
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  /** Injectable clock for tests. Default `Date.now`. */
  now?: () => number;
}

/**
 * Buffers MBTA state mutations and broadcasts them as coalesced deltas on a
 * shared `intervalMs` tick with last-write-wins semantics. Every mutation is
 * written through to the backing `StateManager` synchronously so HTTP reads
 * (`/health`, `/ready`) and the initial snapshot sent to new WebSocket
 * clients always observe the latest state; only the WebSocket delta chatter
 * is deferred.
 *
 * Day-1 wire format is preserved: reset/upsert/remove messages are emitted
 * per slice in the same legacy shapes the frontend already consumes, so this
 * change is reversible without touching the client.
 */
export class Coalescer {
  private state: StateManager;
  private broadcaster: BroadcasterLike;
  private intervalMs: number;
  private setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;
  private now: () => number;

  private vehiclesPendingUpserts: Map<string, Vehicle> = new Map();
  private vehiclesPendingRemovals: Set<string> = new Set();
  private vehiclesResetPending: boolean = false;

  private predictionsPendingUpserts: Map<string, Prediction> = new Map();
  private predictionsPendingRemovals: Set<string> = new Set();
  private predictionsResetPending: boolean = false;

  private alertsPendingUpserts: Map<string, Alert> = new Map();
  private alertsPendingRemovals: Set<string> = new Set();
  private alertsResetPending: boolean = false;

  private lastFlushAt: number = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: StateManager, broadcaster: BroadcasterLike, opts?: CoalescerOptions) {
    this.state = state;
    this.broadcaster = broadcaster;
    this.intervalMs = opts?.intervalMs ?? 250;
    this.setTimeoutFn = opts?.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts?.clearTimeoutFn ?? ((id) => clearTimeout(id));
    this.now = opts?.now ?? Date.now;
  }

  /**
   * Replace the vehicle slice wholesale. Any upserts/removals that arrive
   * later in the same window are absorbed by the reset snapshot taken at
   * flush time, so only a single reset message goes out per window.
   */
  resetVehicles(vs: Vehicle[]): void {
    this.state.resetVehicles(vs);
    this.vehiclesResetPending = true;
    this.vehiclesPendingUpserts.clear();
    this.vehiclesPendingRemovals.clear();
    this.markDirty();
  }

  /**
   * Insert or replace a vehicle. If a reset is already pending for the
   * current window the write-through is enough — the reset flush will include
   * this vehicle via the fresh snapshot — otherwise it is queued as a delta.
   */
  upsertVehicle(v: Vehicle): void {
    this.state.upsertVehicle(v);
    if (this.vehiclesResetPending) {
      this.markDirty();
      return;
    }
    this.vehiclesPendingUpserts.set(v.id, v);
    this.vehiclesPendingRemovals.delete(v.id);
    this.markDirty();
  }

  /**
   * Remove a vehicle by id. Cancels any queued upsert for the same id so the
   * flushed wire sequence reflects only the terminal state of the window.
   */
  removeVehicle(id: string): void {
    this.state.removeVehicle(id);
    if (this.vehiclesResetPending) {
      this.markDirty();
      return;
    }
    this.vehiclesPendingRemovals.add(id);
    this.vehiclesPendingUpserts.delete(id);
    this.markDirty();
  }

  /** Replace the prediction slice wholesale. See `resetVehicles`. */
  resetPredictions(ps: Prediction[]): void {
    this.state.resetPredictions(ps);
    this.predictionsResetPending = true;
    this.predictionsPendingUpserts.clear();
    this.predictionsPendingRemovals.clear();
    this.markDirty();
  }

  /** Insert or replace a prediction. See `upsertVehicle`. */
  upsertPrediction(p: Prediction): void {
    this.state.upsertPrediction(p);
    if (this.predictionsResetPending) {
      this.markDirty();
      return;
    }
    this.predictionsPendingUpserts.set(p.id, p);
    this.predictionsPendingRemovals.delete(p.id);
    this.markDirty();
  }

  /** Remove a prediction by id across all stop buckets. See `removeVehicle`. */
  removePrediction(id: string): void {
    this.state.removePredictionById(id);
    if (this.predictionsResetPending) {
      this.markDirty();
      return;
    }
    this.predictionsPendingRemovals.add(id);
    this.predictionsPendingUpserts.delete(id);
    this.markDirty();
  }

  /** Replace the alert slice wholesale. See `resetVehicles`. */
  resetAlerts(as: Alert[]): void {
    this.state.resetAlerts(as);
    this.alertsResetPending = true;
    this.alertsPendingUpserts.clear();
    this.alertsPendingRemovals.clear();
    this.markDirty();
  }

  /** Insert or replace an alert. See `upsertVehicle`. */
  upsertAlert(a: Alert): void {
    this.state.upsertAlert(a);
    if (this.alertsResetPending) {
      this.markDirty();
      return;
    }
    this.alertsPendingUpserts.set(a.id, a);
    this.alertsPendingRemovals.delete(a.id);
    this.markDirty();
  }

  /** Remove an alert by id. See `removeVehicle`. */
  removeAlert(id: string): void {
    this.state.removeAlert(id);
    if (this.alertsResetPending) {
      this.markDirty();
      return;
    }
    this.alertsPendingRemovals.add(id);
    this.alertsPendingUpserts.delete(id);
    this.markDirty();
  }

  /**
   * Drain every dirty slice in one pass, emitting legacy Day-1 wire messages.
   * Idempotent and safe to call directly (e.g. from tests or shutdown): when
   * nothing is pending this is a cheap no-op and does not update the
   * last-flush timestamp, so it never disturbs the cadence.
   */
  flush(): void {
    if (this.pendingTimer !== null) {
      this.clearTimeoutFn(this.pendingTimer);
      this.pendingTimer = null;
    }

    if (!this.isDirty()) return;

    const snapshot = this.state.getSnapshot();

    if (this.vehiclesResetPending) {
      this.broadcaster.broadcastVehicles({ type: 'reset', vehicles: snapshot.vehicles });
      this.vehiclesResetPending = false;
    } else {
      for (const v of this.vehiclesPendingUpserts.values()) {
        this.broadcaster.broadcastVehicles({ type: 'upsert', vehicle: v });
      }
      for (const id of this.vehiclesPendingRemovals) {
        this.broadcaster.broadcastVehicles({ type: 'remove', id });
      }
    }
    this.vehiclesPendingUpserts.clear();
    this.vehiclesPendingRemovals.clear();

    if (this.predictionsResetPending) {
      this.broadcaster.broadcastPredictions({ type: 'reset', predictions: snapshot.predictions });
      this.predictionsResetPending = false;
    } else {
      for (const p of this.predictionsPendingUpserts.values()) {
        this.broadcaster.broadcastPredictions({ type: 'upsert', prediction: p });
      }
      for (const id of this.predictionsPendingRemovals) {
        this.broadcaster.broadcastPredictions({ type: 'remove', id });
      }
    }
    this.predictionsPendingUpserts.clear();
    this.predictionsPendingRemovals.clear();

    if (this.alertsResetPending) {
      this.broadcaster.broadcastAlerts({ type: 'reset', alerts: snapshot.alerts });
      this.alertsResetPending = false;
    } else {
      for (const a of this.alertsPendingUpserts.values()) {
        this.broadcaster.broadcastAlerts({ type: 'upsert', alert: a });
      }
      for (const id of this.alertsPendingRemovals) {
        this.broadcaster.broadcastAlerts({ type: 'remove', id });
      }
    }
    this.alertsPendingUpserts.clear();
    this.alertsPendingRemovals.clear();

    this.lastFlushAt = this.now();
  }

  /**
   * Cancel any pending timer and drop every buffered delta without
   * broadcasting. Intended for graceful shutdown alongside `WsBroadcaster.close`.
   */
  close(): void {
    if (this.pendingTimer !== null) {
      this.clearTimeoutFn(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.vehiclesPendingUpserts.clear();
    this.vehiclesPendingRemovals.clear();
    this.vehiclesResetPending = false;
    this.predictionsPendingUpserts.clear();
    this.predictionsPendingRemovals.clear();
    this.predictionsResetPending = false;
    this.alertsPendingUpserts.clear();
    this.alertsPendingRemovals.clear();
    this.alertsResetPending = false;
  }

  private markDirty(): void {
    if (this.pendingTimer !== null) return;
    const delay = Math.max(0, this.intervalMs - (this.now() - this.lastFlushAt));
    this.pendingTimer = this.setTimeoutFn(() => this.flush(), delay);
  }

  private isDirty(): boolean {
    return (
      this.vehiclesResetPending ||
      this.vehiclesPendingUpserts.size > 0 ||
      this.vehiclesPendingRemovals.size > 0 ||
      this.predictionsResetPending ||
      this.predictionsPendingUpserts.size > 0 ||
      this.predictionsPendingRemovals.size > 0 ||
      this.alertsResetPending ||
      this.alertsPendingUpserts.size > 0 ||
      this.alertsPendingRemovals.size > 0
    );
  }
}
