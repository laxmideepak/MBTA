import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface TrainSegment {
  vehicleId: string;
  routeId: string;
  segment: [number, number][];  // short polyline [lng, lat][]
  bearing: number;
  currentStatus: string;
  stopId: string;
  directionId: number;
  label: string;
  progress: number;
}

// Each train is a bright, shorter colored segment on top of the faint route.
// This is how londonunderground.live renders trains — colored polyline segments
// moving along the wider faint route lines.
export function createTrainLayer(trains: TrainSegment[]) {
  const valid = trains.filter((t) => t.segment.length >= 2);
  return new PathLayer({
    id: 'train-trails',
    data: valid,
    getPath: (d: TrainSegment) => d.segment,
    getColor: (d: TrainSegment) => {
      const base = getRouteColor(d.routeId);
      return [
        Math.min(255, Math.floor(base[0] * 1.1)),
        Math.min(255, Math.floor(base[1] * 1.1)),
        Math.min(255, Math.floor(base[2] * 1.1)),
        255,
      ];
    },
    getWidth: 6,
    widthUnits: 'pixels' as const,
    widthMinPixels: 4,
    widthMaxPixels: 10,
    capRounded: true,
    jointRounded: true,
    pickable: true,
    transitions: {
      getPath: { duration: 3000, type: 'interpolation' },
    },
  } as any);
}
