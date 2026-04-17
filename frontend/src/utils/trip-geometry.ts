import type { TrainTrip } from '../hooks/useTrainTrips';

/**
 * Linear interpolation along `trip.path` at elapsed time `t` (seconds since
 * trip rebuild). Path is oriented in the direction of travel (see TrainTrip
 * docs), so the head marches forward from `headIdx` at `speed` polyline-index
 * units per second.
 *
 * Clamps to the path endpoints when `t` runs past the lookahead budget, which
 * happens if a GPS update is delayed longer than LOOKAHEAD_SECS. Returns
 * `[lng, lat]` ready to feed to deck.gl's ScatterplotLayer.
 *
 * The head dot in LiveMap calls this every animation frame so it tracks the
 * smoothly-scrolling TripsLayer trail between GPS fixes, rather than freezing
 * at the last fix and "jumping" on update.
 */
export function interpolateAlongPath(trip: TrainTrip, t: number): [number, number] {
  const { path, headIdx, speed } = trip;
  const maxIdx = path.length - 1;
  const raw = headIdx + t * speed;
  const clamped = raw < 0 ? 0 : raw > maxIdx ? maxIdx : raw;
  const i0 = Math.floor(clamped);
  const i1 = i0 >= maxIdx ? maxIdx : i0 + 1;
  const frac = clamped - i0;
  const [x0, y0] = path[i0];
  const [x1, y1] = path[i1];
  return [x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac];
}
