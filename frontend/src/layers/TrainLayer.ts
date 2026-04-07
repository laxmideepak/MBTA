import { TripsLayer } from '@deck.gl/geo-layers';
import { getRouteColor } from '../utils/mbta-colors';

// Each train trip for the TripsLayer
export interface TrainTripData {
  vehicleId: string;
  routeId: string;
  path: [number, number][];   // route coordinates [lng, lat]
  timestamps: number[];        // seconds-since-UTC-midnight for each coordinate
  directionId: number;
  stopId: string;
  label: string;
  progress: number;            // 0-100
}

// Exact copy of London Underground's TripsLayer config:
// getColor: baseColor * 0.7 (darker), trailLength: 20, widthMinPixels: 7
export function createTrainLayer(trips: TrainTripData[], currentTime: number) {
  return new TripsLayer({
    id: 'trips',
    data: trips,
    getPath: (d: TrainTripData) => d.path,
    getTimestamps: (d: TrainTripData) => d.timestamps,
    getColor: (d: TrainTripData) => {
      const base = getRouteColor(d.routeId);
      return [
        Math.floor(base[0] * 0.7),
        Math.floor(base[1] * 0.7),
        Math.floor(base[2] * 0.7),
      ];
    },
    opacity: 1,
    widthMinPixels: 7,
    billboard: false,
    jointRounded: true,
    capRounded: true,
    trailLength: 20,
    currentTime,
    parameters: { depthTest: true, depthWrite: true },
    pickable: true,
  } as any);
}
