import { useMemo } from 'react';
import type { Vehicle } from '../types';
import type { RoutePathData } from '../layers/RouteLayer';
import type { TrainSegment } from '../layers/TrainLayer';
import { findNearestPointIndex } from '../utils/snap-to-route';

// How many route coordinate points to include in the trail behind the train.
// Longer = more visible "worm" on the track.
const TRAIL_POINTS = 40;

export function useTrainPositions(
  vehicles: Vehicle[],
  routeShapes: Map<string, RoutePathData[]>,
): TrainSegment[] {
  return useMemo(() => {
    const segments: TrainSegment[] = [];

    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;

      // Pick the shape for this direction
      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const routeCoords = shape.path;
      if (routeCoords.length < 2) continue;

      // Find where this vehicle is on the route
      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, routeCoords);

      // Build segment: trail behind the head position
      const startIdx = Math.max(0, headIdx - TRAIL_POINTS);
      const segment = routeCoords.slice(startIdx, headIdx + 1);

      if (segment.length < 2) continue;

      const progress = Math.round((headIdx / (routeCoords.length - 1)) * 100);

      segments.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        segment,
        bearing: vehicle.bearing,
        currentStatus: vehicle.currentStatus,
        stopId: vehicle.stopId,
        directionId: vehicle.directionId,
        label: vehicle.label,
        progress,
      });
    }

    return segments;
  }, [vehicles, routeShapes]);
}
