import { TripsLayer } from '@deck.gl/geo-layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface TripData {
  vehicleId: string;
  routeId: string;
  path: [number, number][];     // full route coordinates [lng, lat]
  timestamps: number[];          // index-based timestamps matching path
  headTimestamp: number;         // current position along the path
  bearing: number;
  currentStatus: string;
  stopId: string;
  directionId: number;
  label: string;
  progress: number;
}

export function createTrainLayer(trips: TripData[], currentTime: number) {
  return new TripsLayer({
    id: 'train-trails',
    data: trips,
    getPath: (d: TripData) => d.path,
    getTimestamps: (d: TripData) => d.timestamps,
    getColor: (d: TripData) => {
      const base = getRouteColor(d.routeId);
      // Slightly darker than the route line, like London Underground
      return [Math.floor(base[0] * 0.85), Math.floor(base[1] * 0.85), Math.floor(base[2] * 0.85), 255];
    },
    currentTime,
    trailLength: 25,
    widthMinPixels: 5,
    capRounded: true,
    jointRounded: true,
    pickable: true,
  } as any);
}
