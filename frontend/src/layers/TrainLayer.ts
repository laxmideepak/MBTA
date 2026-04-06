import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { TrainTrailData } from '../hooks/useTrainPositions';

export function createTrainLayer(trains: TrainTrailData[]) {
  return new PathLayer({
    id: 'train-trails',
    data: trains,
    getPath: (d: TrainTrailData) => d.trail,
    getColor: (d: TrainTrailData) => [...getRouteColor(d.routeId), 230],
    getWidth: 5,
    widthUnits: 'pixels' as const,
    widthMinPixels: 3,
    widthMaxPixels: 8,
    capRounded: true,
    jointRounded: true,
    pickable: true,
    transitions: { getPath: { duration: 2000, type: 'interpolation' } },
  } as any);
}
