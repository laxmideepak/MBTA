import { create } from 'zustand';
import type { Alert, Prediction, SystemSnapshot, Vehicle, WsMessage } from '../types';

/**
 * Live system state pushed from the backend over WebSocket.
 *
 * Exposed as a Zustand store so components can subscribe to thin slices
 * (e.g. just `vehicles`) without re-rendering on unrelated updates. The
 * `useSystemState` hook in ../hooks/useSystemState.ts wires the WS
 * connection up and dispatches incoming messages into here via
 * `handleWsMessage`.
 */
interface SystemState {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
  lastMessageTime: number;
  /**
   * Rough skew between server clock and client clock, in ms. Computed on
   * `full-state` using `message.timestamp - Date.now()` and invalidated when
   * the socket disconnects (server-origin stamps are worthless without a
   * recent baseline). `useServerNow()` applies this offset to build a
   * server-timeline clock usable for interpolating `lastDepartedAt` into
   * progress-bar fractions.
   */
  serverOffsetMs: number | null;

  applyFullState: (snapshot: SystemSnapshot) => void;

  resetVehicles: (vehicles: Vehicle[]) => void;
  upsertVehicle: (vehicle: Vehicle) => void;
  removeVehicle: (id: string) => void;

  resetPredictions: (predictions: Record<string, Prediction[]>) => void;
  upsertPrediction: (prediction: Prediction) => void;
  removePredictionById: (id: string) => void;

  resetAlerts: (alerts: Alert[]) => void;
  upsertAlert: (alert: Alert) => void;
  removeAlert: (id: string) => void;

  handleWsMessage: (msg: WsMessage) => void;
}

type VehiclesUpdate =
  | { type: 'reset'; vehicles: Vehicle[] }
  | { type: 'upsert'; vehicle: Vehicle }
  | { type: 'remove'; id: string };

type PredictionsUpdate =
  | { type: 'reset'; predictions: Record<string, Prediction[]> }
  | { type: 'upsert'; prediction: Prediction }
  | { type: 'remove'; id: string };

type AlertsUpdate =
  | { type: 'reset'; alerts: Alert[] }
  | { type: 'upsert'; alert: Alert }
  | { type: 'remove'; id: string };

type DeltaPayload = {
  vehicles: { reset?: Vehicle[]; updated?: Vehicle[]; removed?: string[] };
  predictions: {
    reset?: Record<string, Prediction[]>;
    updated?: Prediction[];
    removed?: string[];
  };
  alerts: { reset?: Alert[]; updated?: Alert[]; removed?: string[] };
};

// Pure reducers over a state slice — reused by both the public actions
// (for tests and direct calls) and the `handleWsMessage` dispatcher. Keeping
// them here lets handleWsMessage fold the data mutation AND the lastMessageTime
// stamp into a single `set()` call, so each WS message triggers subscribers
// exactly once instead of twice.
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

function upsertPredictionInto(
  predictions: Record<string, Prediction[]>,
  p: Prediction,
): Record<string, Prediction[]> {
  const existing = predictions[p.stopId] ?? [];
  return { ...predictions, [p.stopId]: upsertById(existing, p) };
}

function removePredictionFrom(
  predictions: Record<string, Prediction[]>,
  id: string,
): Record<string, Prediction[]> {
  const next: Record<string, Prediction[]> = {};
  for (const [stopId, preds] of Object.entries(predictions)) {
    next[stopId] = preds.filter((p) => p.id !== id);
  }
  return next;
}

export const useSystemStore = create<SystemState>((set) => ({
  vehicles: [],
  predictions: {},
  alerts: [],
  lastMessageTime: 0,
  serverOffsetMs: null,

  applyFullState: (snapshot) =>
    set({
      vehicles: snapshot.vehicles,
      predictions: snapshot.predictions,
      alerts: snapshot.alerts,
    }),

  resetVehicles: (vehicles) => set({ vehicles }),
  upsertVehicle: (vehicle) => set((s) => ({ vehicles: upsertById(s.vehicles, vehicle) })),
  removeVehicle: (id) => set((s) => ({ vehicles: s.vehicles.filter((v) => v.id !== id) })),

  resetPredictions: (predictions) => set({ predictions }),
  upsertPrediction: (prediction) =>
    set((s) => ({ predictions: upsertPredictionInto(s.predictions, prediction) })),
  removePredictionById: (id) =>
    set((s) => ({ predictions: removePredictionFrom(s.predictions, id) })),

  resetAlerts: (alerts) => set({ alerts }),
  upsertAlert: (alert) => set((s) => ({ alerts: upsertById(s.alerts, alert) })),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  handleWsMessage: (msg) => {
    if (!msg || typeof msg.type !== 'string') {
      console.warn('[WS] Dropping malformed message:', msg);
      return;
    }
    const lastMessageTime = Date.now();

    switch (msg.type) {
      case 'full-state': {
        const snapshot = msg.data as SystemSnapshot;
        // Rebaseline server clock offset on every full snapshot — this
        // message arrives at connect (and again on reconnect), so it's a
        // natural pin for drift correction.
        set({
          vehicles: snapshot.vehicles,
          predictions: snapshot.predictions,
          alerts: snapshot.alerts,
          lastMessageTime,
          serverOffsetMs: msg.timestamp - Date.now(),
        });
        return;
      }
      case 'vehicles-update': {
        const data = msg.data as VehiclesUpdate;
        switch (data.type) {
          case 'reset':
            set({ vehicles: data.vehicles, lastMessageTime });
            return;
          case 'upsert':
            set((s) => ({ vehicles: upsertById(s.vehicles, data.vehicle), lastMessageTime }));
            return;
          case 'remove':
            set((s) => ({
              vehicles: s.vehicles.filter((v) => v.id !== data.id),
              lastMessageTime,
            }));
            return;
        }
        return;
      }
      case 'predictions-update': {
        const data = msg.data as PredictionsUpdate;
        switch (data.type) {
          case 'reset':
            set({ predictions: data.predictions, lastMessageTime });
            return;
          case 'upsert':
            set((s) => ({
              predictions: upsertPredictionInto(s.predictions, data.prediction),
              lastMessageTime,
            }));
            return;
          case 'remove':
            set((s) => ({
              predictions: removePredictionFrom(s.predictions, data.id),
              lastMessageTime,
            }));
            return;
        }
        return;
      }
      case 'alerts-update': {
        const data = msg.data as AlertsUpdate;
        switch (data.type) {
          case 'reset':
            set({ alerts: data.alerts, lastMessageTime });
            return;
          case 'upsert':
            set((s) => ({ alerts: upsertById(s.alerts, data.alert), lastMessageTime }));
            return;
          case 'remove':
            set((s) => ({
              alerts: s.alerts.filter((a) => a.id !== data.id),
              lastMessageTime,
            }));
            return;
        }
        return;
      }
      case 'delta': {
        const delta = msg.data as DeltaPayload;
        set((s) => {
          const nextVehicles =
            delta.vehicles.reset ??
            (() => {
              let v = s.vehicles;
              for (const u of delta.vehicles.updated ?? []) v = upsertById(v, u);
              if ((delta.vehicles.removed?.length ?? 0) > 0) {
                const removed = new Set(delta.vehicles.removed);
                v = v.filter((x) => !removed.has(x.id));
              }
              return v;
            })();

          const nextPredictions =
            delta.predictions.reset ??
            (() => {
              let p = s.predictions;
              for (const u of delta.predictions.updated ?? []) p = upsertPredictionInto(p, u);
              for (const id of delta.predictions.removed ?? []) p = removePredictionFrom(p, id);
              return p;
            })();

          const nextAlerts =
            delta.alerts.reset ??
            (() => {
              let a = s.alerts;
              for (const u of delta.alerts.updated ?? []) a = upsertById(a, u);
              if ((delta.alerts.removed?.length ?? 0) > 0) {
                const removed = new Set(delta.alerts.removed);
                a = a.filter((x) => !removed.has(x.id));
              }
              return a;
            })();

          return {
            vehicles: nextVehicles,
            predictions: nextPredictions,
            alerts: nextAlerts,
            lastMessageTime,
          };
        });
        return;
      }
      case 'heartbeat': {
        set({ lastMessageTime });
        return;
      }
    }
  },
}));

/**
 * Build a server-clock `now()` function from the stored offset. Returns null
 * while we have no offset (pre-connect or post-disconnect). The closure is
 * stable across renders by virtue of being subscribed to `serverOffsetMs`
 * only — consumers can call the returned getter on every animation frame
 * without triggering re-renders.
 */
export function useServerNow(): () => number | null {
  const offset = useSystemStore((s) => s.serverOffsetMs);
  return () => (offset == null ? null : Date.now() + offset);
}

/**
 * Invalidate the server clock offset. Call from the WebSocket close / error
 * handler so stale server-origin timestamps don't continue driving
 * progress-bar interpolation during a disconnect.
 */
export function resetServerOffset(): void {
  useSystemStore.setState({ serverOffsetMs: null });
}
