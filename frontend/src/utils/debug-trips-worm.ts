import type { TrainTrip } from '../hooks/useTrainTrips';

/** Enable with `?debugTrips=1` or `VITE_DEBUG_TRIPS=true` (TripsLayer / timestamp sanity check). */
export function isDebugTripsWormEnabled(): boolean {
  if (import.meta.env.VITE_DEBUG_TRIPS === 'true') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debugTrips') === '1';
}

/** One synthetic magenta trip along a downtown polyline; same timestamps/playback contract as real trains. */
export function createDebugWormTrip(): TrainTrip {
  const path: [number, number][] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lon = -71.085 + t * 0.055;
    const lat = 42.347 + 0.012 * Math.sin(t * Math.PI);
    path.push([lon, lat]);
  }
  const headIdx = path.length - 1;
  const absSpeed = 2.2;
  const timestamps = path.map((_, i) => (i - headIdx) / absSpeed);

  return {
    id: '__debug_worm__',
    routeId: 'debug',
    directionId: 0,
    color: [255, 0, 255],
    colorGlow: [255, 0, 255, 80],
    path,
    timestamps,
    headIdx,
    speed: absSpeed,
    label: 'DBG',
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-debug',
    delayed: false,
    origin: 'Debug',
    destination: 'Worm',
    progress: 1,
    progressVelocity: 0,
    futureStops: [],
  };
}
