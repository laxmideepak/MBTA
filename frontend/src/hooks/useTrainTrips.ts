import { useEffect, useMemo, useRef, useState } from 'react';
import type { Alert, Prediction, Stop, Vehicle } from '../types';
import { delayedRouteIds } from '../utils/alert-priority';
import { getRouteColor } from '../utils/mbta-colors';
import { DIRECTION_NAMES } from '../utils/mbta-routes';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { getStopName } from '../utils/stop-names';

// A single train for @deck.gl/geo-layers TripsLayer.
//
// INVARIANT: `path` is always oriented in the direction of travel. Index 0 is
// the oldest trail point, index `path.length - 1` is the furthest lookahead,
// and `path[headIdx]` is the train's current GPS fix. Backward-moving trips
// (along the raw MBTA shape's decreasing-index direction) have their slice
// reversed here so every downstream consumer can assume forward semantics.
//
// `timestamps[i]` is in SECONDS relative to the head sample, strictly
// increasing with `timestamps[headIdx] === 0`. Negative = trail (already
// passed), positive = lookahead. LiveMap feeds `currentTime = now - anchor`,
// starting at 0 at rebuild time and growing, so deck.gl's shader window
//   currentTime - trailLength <= timestamps[i] <= currentTime
// slides forward along the polyline between GPS updates — that's where the
// smooth worm motion comes from.
//
// `speed` is the animation rate in polyline-index units per second (always
// ≥ 0 since path is oriented in the direction of travel). LiveMap uses it to
// interpolate the bright head dot forward each frame so the dot tracks the
// trail's leading edge instead of freezing between GPS updates.
export interface TrainTrip {
  id: string;
  routeId: string;
  directionId: number;
  color: [number, number, number];
  /** Precomputed RGBA for the soft glow layer (route color + alpha 80). */
  colorGlow: [number, number, number, number];
  path: [number, number][];
  timestamps: number[];
  headIdx: number;
  /** Polyline indices per second (always ≥ 0; 0 when STOPPED_AT). */
  speed: number;
  label: string;
  currentStatus: string;
  stopId: string;
  delayed: boolean;
  /** Name of the trip's first scheduled stop (origin / starting terminus). */
  origin: string;
  /** Name of the trip's final scheduled stop (destination / headsign). */
  destination: string;
  progress: number;
  progressVelocity: number;
  /** Remaining upcoming stops for THIS specific trip (sorted by stopSequence). */
  futureStops: { stopId: string; name: string; time: string | null; status: string | null }[];
  /**
   * Polyline sub-path between the train's last-departed station and its next
   * station, oriented in the direction of travel. Used by the render loop to
   * interpolate the head dot purely by **time between stops** —
   * londonunderground.live-style — so the dot slides smoothly even when MBTA's
   * GPS feed is noisy. Null when we lack departure/arrival timing.
   */
  segmentPath: [number, number][] | null;
  /** Epoch ms of departure from the upstream station (server clock). */
  segmentFromTs: number | null;
  /** Epoch ms of predicted arrival at the downstream station (server clock). */
  segmentToTs: number | null;
}

const TRAIL_SECS = 45;
const LOOKAHEAD_SECS = 180;
const DEFAULT_SPEED = 1.5;
const MIN_SPEED = 0.3;
const MAX_SPEED = 6;
const STOPPED_SPEED = 0.05;

interface Anchor {
  routeId: string;
  directionId: number;
  /** Monotonic-clamped polyline index of the latest GPS fix. Used for speed estimation. */
  targetIdx: number;
  /** Wall-clock seconds when `targetIdx` was recorded. */
  t0: number;
  /** Signed polyline-index rate (indices per second). Used for speed estimation. */
  speed: number;
  /**
   * Polyline index where the head dot was LAST rendered (visual anchor).
   * Decoupled from `targetIdx` so a rebuild never snaps the dot backward: if
   * our between-fix interpolation overshot, we hold the visual position
   * instead of yanking it back to the new GPS fix.
   */
  visualIdx: number;
  /** Wall-clock seconds when `visualIdx` was recorded. */
  visualT0: number;
  /** Non-negative polyline-index rate actually used to animate the head dot. */
  visualSpeed: number;
}

function computeSpeed(prev: Anchor | undefined, targetIdx: number, nowSec: number): number {
  if (!prev) return DEFAULT_SPEED;
  const dt = nowSec - prev.t0;
  const didx = targetIdx - prev.targetIdx;
  if (dt < 0.5) return prev.speed;
  const est = didx / dt;
  if (Math.abs(est) < 0.05) return prev.speed;
  const sign = est >= 0 ? 1 : -1;
  return sign * Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.abs(est)));
}

/** Max polyline indices head dot may run ahead of latest GPS fix (seconds × speed). */
const MAX_OVERSHOOT_SECS = 8;

interface UseTrainTripsResult {
  trips: TrainTrip[];
  anchorTimeSec: number;
}

export function useTrainTrips(
  vehicles: Vehicle[],
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
  predictions: Record<string, Prediction[]>,
  alerts: Alert[],
  stops: Stop[],
): UseTrainTripsResult {
  const anchorsRef = useRef<Map<string, Anchor>>(new Map());
  const [state, setState] = useState<UseTrainTripsResult>(() => ({
    trips: [],
    // Avoid anchor=0 before first rebuild (would make playbackT huge vs head at 0).
    anchorTimeSec: performance.now() / 1000,
  }));

  // Route ids with a service-disrupting alert (severity ≥ 7, banner-flagged,
  // or a high-impact effect like SHUTTLE/SUSPENSION that's currently active).
  // Vehicles on these routes render with an amber delay marker.
  const delayedRoutes = useMemo(() => delayedRouteIds(alerts), [alerts]);

  const stopsById = useMemo(() => {
    const m = new Map<string, Stop>();
    for (const s of stops ?? []) m.set(s.id, s);
    return m;
  }, [stops]);

  const predictionsByTrip = useMemo(() => {
    // Day 5 migration: prefer server-provided `vehicle.nextStops` and avoid
    // rebuilding a full prediction index in steady state. We keep this as a
    // fallback for older backends that don't send `nextStops` yet.
    const hasAnyNextStops = vehicles.some((v) => (v.nextStops?.length ?? 0) > 0);
    if (hasAnyNextStops) return null;

    const m = new Map<string, Prediction[]>();
    for (const arr of Object.values(predictions)) {
      for (const p of arr) {
        if (!p.tripId) continue;
        const bucket = m.get(p.tripId);
        if (bucket) bucket.push(p);
        else m.set(p.tripId, [p]);
      }
    }
    for (const bucket of m.values()) {
      bucket.sort((a, b) => a.stopSequence - b.stopSequence);
    }
    return m;
  }, [predictions, vehicles]);

  useEffect(() => {
    if (routeShapes.size === 0) return;

    const anchorWallSec = performance.now() / 1000;
    const anchors = anchorsRef.current;
    const seen = new Set<string>();
    const next: TrainTrip[] = [];

    for (const v of vehicles) {
      seen.add(v.id);
      const shapes = routeShapes.get(v.routeId);
      if (!shapes || shapes.length === 0) continue;

      const shape = shapes[Math.min(v.directionId, shapes.length - 1)] ?? shapes[0];
      const coords = shape.path;
      if (coords.length < 2) continue;

      const rawTargetIdx = findNearestPointIndex(v.longitude, v.latitude, coords);
      const prevAnchor = anchors.get(v.id);
      const prevMatched =
        prevAnchor && prevAnchor.routeId === v.routeId && prevAnchor.directionId === v.directionId
          ? prevAnchor
          : undefined;

      // GPS jitter can make `findNearestPointIndex` hop backward by a few points,
      // which flips our forward/backward orientation and causes visible flicker.
      // Trains almost never reverse along a route shape, so clamp to monotonic
      // non-decreasing index within a continuous route+direction run.
      const targetIdx = prevMatched ? Math.max(rawTargetIdx, prevMatched.targetIdx) : rawTargetIdx;

      let speed = computeSpeed(prevMatched, targetIdx, anchorWallSec);
      const stopped = v.currentStatus === 'STOPPED_AT';
      if (stopped) speed = STOPPED_SPEED;

      // absSpeed drives trail length (how many polyline points to render on
      // each side of the head); MIN_SPEED keeps the trail visible even when
      // the train is nearly still so the worm doesn't shrink to a single dot.
      const absSpeed = Math.max(Math.abs(speed), MIN_SPEED);

      // Visual anchor: never snap backward on rebuild.
      //
      // If the head dot's previous interpolated position is AHEAD of the new
      // GPS fix (common — we over-predicted between fixes, or the train just
      // transitioned to STOPPED_AT which pins `targetIdx` at a station while
      // the dot was already past it), hold the visual position instead of
      // yanking it back. Cap overshoot so ground truth eventually catches up
      // rather than drifting forever. On first frame (no prevMatched) there's
      // nothing to snap from — use the GPS fix.
      //
      // Applies equally to moving and stopped trains: the important invariant
      // is "visual head must not regress between renders," which MBTA can
      // violate via STOPPED_AT events even without any GPS jitter.
      const maxOvershoot = Math.ceil(MAX_OVERSHOOT_SECS * absSpeed);
      let visualIdx = targetIdx;
      if (prevMatched) {
        const dt = Math.max(0, anchorWallSec - prevMatched.visualT0);
        const predicted = prevMatched.visualIdx + dt * prevMatched.visualSpeed;
        // max(prev, min(predicted, truth+cap)): never below prev visual (no
        // backward snap ever), never far ahead of truth (so GPS catches up).
        const capped = Math.min(predicted, targetIdx + maxOvershoot);
        visualIdx = Math.max(prevMatched.visualIdx, capped);
      }
      // Keep within polyline bounds.
      visualIdx = Math.max(0, Math.min(coords.length - 1, visualIdx));

      const trailIdx = Math.ceil(TRAIL_SECS * absSpeed);
      const lookIdx = Math.ceil(LOOKAHEAD_SECS * absSpeed);

      const forward = speed >= 0;
      // Slice is centered on the VISUAL head so path[headIdx] is exactly where
      // the dot renders at playbackT=0 — no reset snap when effect reruns.
      const centerIdx = Math.round(visualIdx);
      const start = Math.max(0, centerIdx - (forward ? trailIdx : lookIdx));
      const end = Math.min(coords.length - 1, centerIdx + (forward ? lookIdx : trailIdx));
      if (end - start < 1) continue;

      // Orient the sliced polyline in the direction of travel. For a forward
      // trip (increasing-index motion) that's the natural slice; for backward
      // we reverse so the path is uniformly [trail..head..lookahead] for all
      // downstream consumers. Without this, TripsLayer's strictly-increasing
      // timestamps requirement forces the fix-up loop to flatten the whole
      // array — and the whole trail becomes invisible.
      const sliced = coords.slice(start, end + 1);
      const path = forward ? sliced : sliced.slice().reverse();
      const headIdx = forward ? centerIdx - start : path.length - 1 - (centerIdx - start);

      // With path oriented in travel direction, timestamps are strictly
      // increasing by construction: head = 0, trail entries (i < headIdx)
      // are negative, lookahead (i > headIdx) positive. No fix-up needed.
      const timestamps = new Array<number>(path.length);
      for (let i = 0; i < path.length; i++) {
        timestamps[i] = (i - headIdx) / absSpeed;
      }
      // Path-oriented animation rate: always ≥ 0. Stopped trains get 0 so the
      // head dot doesn't drift when the train is sitting at a station.
      const animSpeed = stopped ? 0 : absSpeed;

      // All predictions belonging to this specific trip, pre-sorted ascending
      // by stopSequence. Last entry = destination. (We can't trust the first
      // entry as "origin" because MBTA's predictions endpoint drops stops the
      // train has already served — so tripPreds[0] is the earliest *remaining*
      // stop, not the trip's true terminus-of-origin.)
      const tripPreds =
        v.tripId && predictionsByTrip ? (predictionsByTrip.get(v.tripId) ?? []) : [];
      const destinationFromTrip = (() => {
        if (v.destination) return v.destination;
        if (tripPreds.length > 0) return getStopName(tripPreds[tripPreds.length - 1].stopId);
        return '';
      })();
      const destinationHeadsign =
        DIRECTION_NAMES[v.routeId]?.[v.directionId] ?? `Direction ${v.directionId}`;
      const destinationName = destinationFromTrip || destinationHeadsign;
      // Origin on MBTA heavy/light rail is the opposite-direction terminus —
      // trips run end-to-end (short-turns are rare and we fall back gracefully).
      const oppositeHeadsign = DIRECTION_NAMES[v.routeId]?.[1 - v.directionId];
      const originName = oppositeHeadsign ?? '';

      // Upcoming stops for THIS train. Start cut-off: the vehicle's own
      // stopSequence (if provided) or the stopSequence of its `stopId`.
      const cutoffSeq = (() => {
        if (typeof v.currentStopSequence === 'number') return v.currentStopSequence;
        const hit = tripPreds.find((p) => p.stopId === v.stopId);
        return hit?.stopSequence ?? -Infinity;
      })();

      const futureStops =
        v.nextStops && v.nextStops.length > 0
          ? v.nextStops.slice(0, 6).map((s) => ({
              stopId: s.stopId,
              name: s.stopName,
              time: null,
              status: s.status,
            }))
          : tripPreds
              .filter((p) => p.stopSequence >= cutoffSeq && (p.arrivalTime || p.departureTime))
              .slice(0, 6)
              .map((p) => ({
                stopId: p.stopId,
                name: getStopName(p.stopId),
                time: p.arrivalTime ?? p.departureTime,
                status: p.status,
              }));

      // ── Station-to-station segment (London-style time-driven head motion) ──
      //
      // When we know both endpoints (`lastDepartedStopId` with timestamp, and
      // `nextStops[0]`) we project their lat/lng onto the route polyline, slice
      // the polyline between them, and orient the slice in the direction of
      // travel. The render loop then advances the head dot purely by
      // `(serverNow - fromTs) / (toTs - fromTs)` clamped to [0, 1], yielding
      // smooth motion regardless of GPS noise. Falls through to the GPS-based
      // `interpolateAlongPath` path when any endpoint is missing.
      let segmentPath: [number, number][] | null = null;
      let segmentFromTs: number | null = null;
      let segmentToTs: number | null = null;

      const nextStop = v.nextStops && v.nextStops.length > 0 ? v.nextStops[0] : null;
      const fromStop = v.lastDepartedStopId ? (stopsById.get(v.lastDepartedStopId) ?? null) : null;
      const toStop = nextStop ? (stopsById.get(nextStop.stopId) ?? null) : null;

      if (fromStop && toStop && v.lastDepartedAt != null && nextStop) {
        const pred =
          predictions[nextStop.stopId]?.find(
            (p) => p.tripId === v.tripId && p.stopId === nextStop.stopId,
          ) ?? null;
        const predArrivalMs = pred?.arrivalTime ? Date.parse(pred.arrivalTime) : Number.NaN;
        const toTs = Number.isFinite(predArrivalMs)
          ? predArrivalMs
          : Date.parse(v.updatedAt) + nextStop.etaSec * 1000;

        if (Number.isFinite(toTs) && toTs > v.lastDepartedAt) {
          const fromIdx = findNearestPointIndex(fromStop.longitude, fromStop.latitude, coords);
          const toIdx = findNearestPointIndex(toStop.longitude, toStop.latitude, coords);
          const lo = Math.min(fromIdx, toIdx);
          const hi = Math.max(fromIdx, toIdx);
          if (hi > lo) {
            const sub = coords.slice(lo, hi + 1);
            segmentPath = toIdx < fromIdx ? sub.slice().reverse() : sub;
            segmentFromTs = v.lastDepartedAt;
            segmentToTs = toTs;
          }
        }
      }

      const color = getRouteColor(v.routeId);
      next.push({
        id: v.id,
        routeId: v.routeId,
        directionId: v.directionId,
        color,
        colorGlow: [color[0], color[1], color[2], 80],
        path,
        timestamps,
        headIdx,
        speed: animSpeed,
        label: v.label,
        currentStatus: v.currentStatus,
        stopId: v.stopId,
        delayed: v.delayed ?? delayedRoutes.has(v.routeId),
        origin: originName,
        destination: destinationName,
        progress: targetIdx / Math.max(1, coords.length - 1),
        progressVelocity: speed / Math.max(1, coords.length - 1),
        futureStops,
        segmentPath,
        segmentFromTs,
        segmentToTs,
      });

      anchors.set(v.id, {
        routeId: v.routeId,
        directionId: v.directionId,
        targetIdx,
        t0: anchorWallSec,
        speed: speed === 0 ? DEFAULT_SPEED : speed,
        visualIdx,
        visualT0: anchorWallSec,
        visualSpeed: animSpeed,
      });
    }

    for (const id of Array.from(anchors.keys())) {
      if (!seen.has(id)) anchors.delete(id);
    }

    if (import.meta.env.DEV && vehicles.length > 0 && next.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[useTrainTrips] built 0 trips from',
        vehicles.length,
        'vehicles — check routeShapes',
      );
    }

    setState({ trips: next, anchorTimeSec: anchorWallSec });
  }, [vehicles, routeShapes, predictionsByTrip, delayedRoutes, stopsById, predictions]);

  return state;
}
