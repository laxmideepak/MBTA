import type { NextStop, Prediction } from './types.js';

export function buildNextStopsForTrip(
  tripId: string,
  predictions: Record<string, Prediction[]>,
  stopNameById: Map<string, string>,
  serverTimeMs: number,
  limit = 3,
): NextStop[] {
  if (!tripId) return [];

  const items: Array<{ stopId: string; ms: number; status: string | null }> = [];
  for (const list of Object.values(predictions)) {
    for (const p of list) {
      if (p.tripId !== tripId) continue;
      const t = p.arrivalTime ?? p.departureTime;
      if (!t) continue;
      const ms = Date.parse(t);
      if (Number.isNaN(ms)) continue;
      items.push({ stopId: p.stopId, ms, status: p.status });
    }
  }

  items.sort((a, b) => a.ms - b.ms);

  const next: NextStop[] = [];
  for (const it of items) {
    const etaSec = Math.round((it.ms - serverTimeMs) / 1000);
    if (etaSec < -30) continue;
    next.push({
      stopId: it.stopId,
      stopName: stopNameById.get(it.stopId) ?? it.stopId,
      etaSec,
      status: it.status,
    });
    if (next.length >= limit) break;
  }

  return next;
}
