import { useMemo, useState, useEffect, useRef } from 'react';
import type { Vehicle } from '../types';
import type { RoutePathData } from '../layers/RouteLayer';
import type { TrainTripData } from '../layers/TrainLayer';
import { findNearestPointIndex } from '../utils/snap-to-route';

// Same as London Underground
function getSecondsSinceUtcMidnight(): number {
  const now = new Date();
  return now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 +
    now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;
}

// Build trip data for TripsLayer.
//
// London Underground has actual timetable paths with real timestamps.
// We have GPS positions on a route shape. To make TripsLayer work, we assign
// timestamps to route coordinates such that:
// - The vehicle's current position (headIdx) gets timestamp = NOW (seconds since midnight)
// - Earlier points on the route get decreasing timestamps (1 second per coordinate)
// - Later points get increasing timestamps
//
// This means TripsLayer's currentTime (also seconds since midnight) will render
// a bright segment at the vehicle's current position with a trail behind it.
export function useTrainTrips(
  vehicles: Vehicle[],
  routeShapes: Map<string, RoutePathData[]>,
): TrainTripData[] {
  return useMemo(() => {
    const now = getSecondsSinceUtcMidnight();
    const trips: TrainTripData[] = [];

    for (const vehicle of vehicles) {
      const shapes = routeShapes.get(vehicle.routeId);
      if (!shapes || shapes.length === 0) continue;

      const shape = shapes[Math.min(vehicle.directionId, shapes.length - 1)] ?? shapes[0];
      const coords = shape.path;
      if (coords.length < 2) continue;

      const headIdx = findNearestPointIndex(vehicle.longitude, vehicle.latitude, coords);
      const progress = Math.round((headIdx / (coords.length - 1)) * 100);

      // Assign timestamps: head = now, each point is 1 second apart
      const timestamps = coords.map((_, i) => now - (headIdx - i));

      trips.push({
        vehicleId: vehicle.id,
        routeId: vehicle.routeId,
        path: coords,
        timestamps,
        directionId: vehicle.directionId,
        stopId: vehicle.stopId,
        label: vehicle.label,
        progress,
      });
    }

    return trips;
  }, [vehicles, routeShapes]);
}

// Animation loop: returns current time (seconds since UTC midnight)
// Updated every frame via requestAnimationFrame, exactly like London Underground.
export function useAnimationTime(): number {
  const [time, setTime] = useState(getSecondsSinceUtcMidnight);
  const rafRef = useRef(0);

  useEffect(() => {
    let running = true;
    function animate() {
      if (!running) return;
      setTime(getSecondsSinceUtcMidnight());
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return time;
}
