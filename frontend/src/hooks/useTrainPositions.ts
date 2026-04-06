import { useMemo } from 'react';
import type { Vehicle } from '../types';
import type { RoutePathData } from '../layers/RouteLayer';
import { findNearestPointIndex } from '../utils/snap-to-route';
import { buildTrail } from '../utils/trail-builder';

export interface TrainTrailData {
  vehicleId: string;
  routeId: string;
  trail: [number, number][];
  bearing: number;
  currentStatus: string;
  stopId: string;
  directionId: number;
  label: string;
  progress: number;
}

const TRAIL_POINTS = 20;

export function useTrainPositions(
  vehicles: Vehicle[],
  routeShapes: Map<string, RoutePathData[]>,
): TrainTrailData[] {
  return useMemo(() => {
    const trails: TrainTrailData[] = [];
    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;
      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const routeCoords = shape.path;
      if (routeCoords.length === 0) continue;
      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, routeCoords);
      const trail = buildTrail(routeCoords, headIdx, TRAIL_POINTS);
      const progress = routeCoords.length > 1 ? Math.round((headIdx / (routeCoords.length - 1)) * 100) : 0;
      trails.push({
        vehicleId: vehicle.id, routeId: vehicle.routeId, trail, bearing: vehicle.bearing,
        currentStatus: vehicle.currentStatus, stopId: vehicle.stopId,
        directionId: vehicle.directionId, label: vehicle.label, progress,
      });
    }
    return trails;
  }, [vehicles, routeShapes]);
}
