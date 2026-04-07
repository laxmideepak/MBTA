import { useMemo, useState, useEffect, useRef } from 'react';
import type { Vehicle } from '../types';
import type { RoutePathData } from '../layers/RouteLayer';
import type { TripData } from '../layers/TrainLayer';
import { findNearestPointIndex } from '../utils/snap-to-route';

// Global time reference. All vehicles are normalized so their head position
// maps to GLOBAL_HEAD_TIME. This lets TripsLayer's single currentTime work
// for all vehicles simultaneously.
const GLOBAL_HEAD_TIME = 1000;

export function useTrainTrips(
  vehicles: Vehicle[],
  routeShapes: Map<string, RoutePathData[]>,
): TripData[] {
  return useMemo(() => {
    const trips: TripData[] = [];

    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;

      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const routeCoords = shape.path;
      if (routeCoords.length < 2) continue;

      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, routeCoords);
      const progress = Math.round((headIdx / (routeCoords.length - 1)) * 100);

      // Normalize timestamps so that headIdx maps to GLOBAL_HEAD_TIME.
      // timestamp[i] = GLOBAL_HEAD_TIME - (headIdx - i)
      // This means: points before head have lower timestamps, head = GLOBAL_HEAD_TIME
      const timestamps = routeCoords.map((_, i) => GLOBAL_HEAD_TIME - (headIdx - i));

      trips.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        path: routeCoords,
        timestamps,
        headTimestamp: GLOBAL_HEAD_TIME,
        bearing: vehicle.bearing,
        currentStatus: vehicle.currentStatus,
        stopId: vehicle.stopId,
        directionId: vehicle.directionId,
        label: vehicle.label,
        progress,
      });
    }

    return trips;
  }, [vehicles, routeShapes]);
}

// Returns a smoothly animated currentTime that lerps toward GLOBAL_HEAD_TIME.
// On first load, jumps to target. On subsequent vehicle updates, smoothly animates.
export function useAnimatedTime(trips: TripData[]): number {
  const [time, setTime] = useState(GLOBAL_HEAD_TIME);
  const targetRef = useRef(GLOBAL_HEAD_TIME);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (trips.length > 0 && !initializedRef.current) {
      setTime(GLOBAL_HEAD_TIME);
      initializedRef.current = true;
    }
    targetRef.current = GLOBAL_HEAD_TIME;
  }, [trips]);

  // requestAnimationFrame loop for smooth animation
  useEffect(() => {
    let running = true;
    let raf = 0;

    function animate() {
      if (!running) return;
      setTime((prev) => {
        const target = targetRef.current;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) return target;
        return prev + diff * 0.1;
      });
      raf = requestAnimationFrame(animate);
    }

    raf = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(raf); };
  }, []);

  return time;
}
