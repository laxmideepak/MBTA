import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { TrainTrailData } from '../hooks/useTrainPositions';

// Bright glowing trail behind each train
function createTrailPath(trains: TrainTrailData[]) {
  // Filter out single-point trails (PathLayer needs at least 2 points)
  const valid = trains.filter((t) => t.trail.length >= 2);
  return new PathLayer({
    id: 'train-trails',
    data: valid,
    getPath: (d: TrainTrailData) => d.trail,
    getColor: (d: TrainTrailData) => [...getRouteColor(d.routeId), 200],
    getWidth: 6,
    widthUnits: 'pixels' as const,
    widthMinPixels: 4,
    widthMaxPixels: 10,
    capRounded: true,
    jointRounded: true,
    pickable: true,
    transitions: { getPath: { duration: 2000, type: 'interpolation' } },
  } as any);
}

// Bright dot at the head of each train
function createTrainDots(trains: TrainTrailData[]) {
  return new ScatterplotLayer({
    id: 'train-dots',
    data: trains,
    getPosition: (d: TrainTrailData) => d.trail[d.trail.length - 1],
    getFillColor: (d: TrainTrailData) => [...getRouteColor(d.routeId), 255],
    getLineColor: [255, 255, 255, 200],
    getRadius: 7,
    radiusUnits: 'pixels' as const,
    radiusMinPixels: 5,
    radiusMaxPixels: 12,
    stroked: true,
    lineWidthMinPixels: 2,
    pickable: true,
    transitions: { getPosition: { duration: 2000, type: 'interpolation' } },
  } as any);
}

export function createTrainLayer(trains: TrainTrailData[]) {
  return [createTrailPath(trains), createTrainDots(trains)];
}
