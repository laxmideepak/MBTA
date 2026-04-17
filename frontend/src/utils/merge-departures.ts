import type { Prediction, ScheduledDeparture } from '../types';

type DepartureKind = 'live' | 'scheduled';

export interface DepartureRow {
  key: string;
  routeId: string;
  directionId: number;
  /** ISO timestamp used for both sort and display. */
  arrivalTime: string;
  kind: DepartureKind;
  /** Only present for live predictions; scheduled rows derive status from time. */
  status: string | null;
  tripId: string;
}

interface MergeOptions {
  /** How long after a scheduled/predicted time to still show (e.g. boarding grace). */
  pastGraceMs?: number;
  /** Soft cap on rows returned; keeps the board height bounded. */
  maxRows?: number;
}

/**
 * Combine live predictions and published schedules into a single upcoming list.
 *
 * Strategy:
 * - Live predictions win when both exist for the same trip_id. MBTA publishes
 *   a schedule for every trip, but while a vehicle is running there will also
 *   be a prediction; we don't want to double-count.
 * - Schedules that extend beyond the live window (next 30-60 min) fill in
 *   the rest of the evening so the board isn't blank at quiet stops.
 */
export function mergeDepartures(
  predictions: Prediction[],
  schedules: ScheduledDeparture[],
  nowMs: number,
  { pastGraceMs = 30_000, maxRows = 12 }: MergeOptions = {},
): DepartureRow[] {
  const cutoff = nowMs - pastGraceMs;

  const live: DepartureRow[] = [];
  const livedTrips = new Set<string>();
  for (const p of predictions) {
    if (p.tripId) livedTrips.add(p.tripId);
    if (!p.arrivalTime) continue;
    if (new Date(p.arrivalTime).getTime() <= cutoff) continue;
    live.push({
      key: `live-${p.id}`,
      routeId: p.routeId,
      directionId: p.directionId,
      arrivalTime: p.arrivalTime,
      kind: 'live',
      status: p.status,
      tripId: p.tripId,
    });
  }

  const sched: DepartureRow[] = [];
  for (const s of schedules) {
    if (s.tripId && livedTrips.has(s.tripId)) continue;
    const t = s.arrivalTime ?? s.departureTime;
    if (!t) continue;
    if (new Date(t).getTime() <= cutoff) continue;
    sched.push({
      key: `sched-${s.id}`,
      routeId: s.routeId,
      directionId: s.directionId,
      arrivalTime: t,
      kind: 'scheduled',
      status: null,
      tripId: s.tripId,
    });
  }

  return [...live, ...sched]
    .sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime())
    .slice(0, maxRows);
}
