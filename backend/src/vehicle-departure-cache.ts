import type { Vehicle } from './types.js';

/**
 * A recorded STOPPED_AT → transit transition for a single vehicle:
 *   - stopId  — the stop the vehicle just left.
 *   - at      — epoch ms of the departure event (server clock).
 *   - lastSeen — epoch ms of the most recent event we saw for this vehicle,
 *                used by `sweep` to GC entries for vehicles that dropped
 *                off the SSE feed.
 */
export interface DepartureEntry {
  stopId: string;
  at: number;
  lastSeen: number;
}

/** Internal prev-state we need to classify a transition. Not exposed. */
interface PrevState {
  prevStatus: Vehicle['currentStatus'] | null;
  prevStopId: string | null;
  lastSeen: number;
}

/**
 * Tracks "just-departed" stop metadata per vehicle so the frontend tooltip
 * can render station-to-station progress bars without rebuilding the last
 * known sequence from raw predictions. The cache is a pure in-memory
 * Map keyed by vehicle id; nothing persists across process restarts — the
 * client treats missing fields as "we don't know yet" and degrades gracefully.
 *
 * Departure capture rules (see tests):
 *   - Only a STOPPED_AT → (IN_TRANSIT_TO | INCOMING_AT) transition records.
 *   - IN_TRANSIT_TO → IN_TRANSIT_TO does nothing (no stop involved).
 *   - IN_TRANSIT_TO → STOPPED_AT (arrival) keeps the prior entry — the
 *     "just-departed" field naturally becomes the just-arrived-from.
 *   - First event for an id seeds state only; no record.
 *
 * This class is intentionally tiny: no clock injection, no events, no
 * subscribers. `lastSeen` is refreshed on every call, so stale-entry
 * pruning is strictly a `sweep()` concern called from `index.ts` on an
 * interval.
 */
export class VehicleDepartureCache {
  private prev = new Map<string, PrevState>();
  private entries = new Map<string, DepartureEntry>();

  /**
   * Feed the next Vehicle event for a given id. Returns the newly recorded
   * DepartureEntry if this event captured a STOP→TRANSIT transition, else
   * null. `lastSeen` is always refreshed to `now` regardless of outcome.
   */
  onEvent(vehicleId: string, next: Vehicle, now: number): DepartureEntry | null {
    const prev = this.prev.get(vehicleId);
    const existingEntry = this.entries.get(vehicleId);

    // First event for this vehicle: seed prev-state, refresh lastSeen on
    // any existing entry (there shouldn't be one, but be defensive) and
    // return without recording.
    if (!prev) {
      this.prev.set(vehicleId, {
        prevStatus: next.currentStatus,
        prevStopId: next.stopId ?? null,
        lastSeen: now,
      });
      if (existingEntry) {
        this.entries.set(vehicleId, { ...existingEntry, lastSeen: now });
      }
      return null;
    }

    const isStopToTransit =
      prev.prevStatus === 'STOPPED_AT' &&
      (next.currentStatus === 'IN_TRANSIT_TO' || next.currentStatus === 'INCOMING_AT') &&
      prev.prevStopId != null &&
      prev.prevStopId.length > 0;

    let recorded: DepartureEntry | null = null;
    if (isStopToTransit) {
      // Non-null assertion is safe — guarded by isStopToTransit.
      const entry: DepartureEntry = { stopId: prev.prevStopId!, at: now, lastSeen: now };
      this.entries.set(vehicleId, entry);
      recorded = entry;
    } else if (existingEntry) {
      // Preserve the prior departure; just refresh lastSeen so sweep()
      // doesn't treat an actively-reporting vehicle as stale.
      this.entries.set(vehicleId, { ...existingEntry, lastSeen: now });
    }

    this.prev.set(vehicleId, {
      prevStatus: next.currentStatus,
      prevStopId: next.stopId ?? null,
      lastSeen: now,
    });
    return recorded;
  }

  /** Return the current DepartureEntry for a vehicle, or null if none. */
  get(vehicleId: string): DepartureEntry | null {
    return this.entries.get(vehicleId) ?? null;
  }

  /** Forget everything we know about a vehicle. */
  remove(vehicleId: string): void {
    this.prev.delete(vehicleId);
    this.entries.delete(vehicleId);
  }

  /**
   * Drop both prev-state and recorded entries whose `lastSeen` predates
   * `now - ttlMs`. Returns the number of vehicle ids evicted so callers can
   * log/monitor. Intended to be scheduled at ~5min cadence with a 30min TTL.
   */
  sweep(now: number, ttlMs: number): number {
    const cutoff = now - ttlMs;
    let removed = 0;
    // Iterate prev-state: it's the superset (an id always lands here after
    // its first event, even without a recorded departure).
    for (const [id, state] of this.prev) {
      if (state.lastSeen < cutoff) {
        this.prev.delete(id);
        this.entries.delete(id);
        removed++;
      }
    }
    // Belt-and-braces: evict any orphaned entries whose prev-state was
    // already cleared. Should be a no-op under normal operation.
    for (const [id, entry] of this.entries) {
      if (entry.lastSeen < cutoff) {
        this.entries.delete(id);
      }
    }
    return removed;
  }
}
