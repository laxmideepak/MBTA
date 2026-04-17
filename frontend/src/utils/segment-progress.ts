import type { Prediction, Vehicle } from '../types';

/**
 * What the tooltip needs to render a station-to-station progress bar:
 *   - `fraction` in [0, 1], or null when we don't have enough info to
 *     meaningfully interpolate (pre-connect, first-ever event, no next stop).
 *   - `fromStopName` / `toStopName` — already resolved display names, so the
 *     tooltip never has to do a second stop-name lookup.
 */
export interface SegmentProgress {
  fraction: number | null;
  fromStopName: string | null;
  toStopName: string | null;
}

export interface SegmentProgressInput {
  vehicle: Vehicle;
  /**
   * Server-timeline "now" in epoch ms (see `useServerNow` in systemStore).
   * Null means we don't have a valid clock baseline yet — treat as "no
   * animated fraction".
   */
  now: number | null;
  /** Resolve a stopId to its display name. Null for unknown ids. */
  stopName: (id: string | null | undefined) => string | null;
  /**
   * Pick the most relevant Prediction for `(tripId, stopId)`. Callers
   * typically build this as a memoized `(t, s) => predictionsByTrip[t]?.find(p => p.stopId === s) ?? null`.
   */
  prediction: (tripId: string, stopId: string) => Prediction | null;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Build a station-to-station progress summary for a single vehicle.
 *
 * Rules (first match wins):
 *  1. No server clock → only surface the next stop name.
 *  2. STOPPED_AT → fraction = 0, we're at currentStopName heading to next.
 *  3. We have a recorded last departure AND a next stop → interpolate time
 *     between departure and predicted arrival (fallback: updatedAt + etaSec).
 *  4. Otherwise fall through: next stop only, no bar.
 */
export function segmentProgress(input: SegmentProgressInput): SegmentProgress {
  const { vehicle, now, stopName, prediction } = input;
  const nextStops = vehicle.nextStops;
  const nextStop = nextStops && nextStops.length > 0 ? nextStops[0] : null;
  const toStopFromNext = nextStop?.stopName ?? null;

  if (now === null) {
    return { fraction: null, fromStopName: null, toStopName: toStopFromNext };
  }

  if (vehicle.currentStatus === 'STOPPED_AT') {
    return {
      fraction: 0,
      fromStopName: vehicle.currentStopName ?? null,
      toStopName: toStopFromNext,
    };
  }

  if (vehicle.lastDepartedAt != null && nextStop) {
    const pred = prediction(vehicle.tripId, nextStop.stopId);
    const predArrivalMs = pred?.arrivalTime ? Date.parse(pred.arrivalTime) : Number.NaN;
    // Prefer the server-side prediction's arrivalTime. Fall back to the
    // ETA carried on NextStop — anchored at the vehicle's `updatedAt` so the
    // countdown stays consistent with what the server computed at the last
    // SSE tick. Without either, progress has no meaningful "to" anchor.
    const toTs = Number.isFinite(predArrivalMs)
      ? predArrivalMs
      : Date.parse(vehicle.updatedAt) + nextStop.etaSec * 1000;
    const fromTs = vehicle.lastDepartedAt;
    if (Number.isFinite(toTs) && Number.isFinite(fromTs)) {
      const denom = Math.max(1, toTs - fromTs);
      const fraction = clamp01((now - fromTs) / denom);
      return {
        fraction,
        fromStopName: stopName(vehicle.lastDepartedStopId),
        toStopName: nextStop.stopName,
      };
    }
  }

  return { fraction: null, fromStopName: null, toStopName: toStopFromNext };
}
