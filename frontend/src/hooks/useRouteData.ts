import { useEffect, useState } from 'react';
import type { Stop } from '../types';
import { setStopNames } from '../utils/stop-names';

// Threshold in squared degrees for considering a stop "on" a route shape.
// ~0.0012 deg ≈ 130m; squared = 1.44e-6. Tuned so downtown transfer stations
// (which sit near multiple lines) attach to every line that actually serves
// them without false positives from nearby but unrelated lines.
const STOP_ROUTE_DIST_SQ = 1.44e-6;

type RoutePathData = { routeId: string; path: [number, number][] };
type RouteShapesMap = Map<string, RoutePathData[]>;

// Matches the shape returned by `GET /api/shapes` (backend `gtfs-loader.ts`).
type ShapeDto = { coordinates: [number, number][] };

// Matches `GET /api/stops` (MBTA JSON:API passthrough).
type StopDto = {
  id: string;
  attributes: {
    name: string;
    latitude: number;
    longitude: number;
    wheelchair_boarding?: number;
  };
};

function assignStopRoutes(stops: Stop[], shapes: RouteShapesMap): Stop[] {
  return stops.map((stop) => {
    const routeIds: string[] = [];
    for (const [routeId, variants] of shapes) {
      let best = Infinity;
      for (const variant of variants) {
        for (const [lng, lat] of variant.path) {
          const dLng = lng - stop.longitude;
          const dLat = lat - stop.latitude;
          const d = dLng * dLng + dLat * dLat;
          if (d < best) best = d;
          if (best < STOP_ROUTE_DIST_SQ) break;
        }
        if (best < STOP_ROUTE_DIST_SQ) break;
      }
      if (best < STOP_ROUTE_DIST_SQ) routeIds.push(routeId);
    }
    return { ...stop, routeIds };
  });
}

export function useRouteData() {
  const [routeShapes, setRouteShapes] = useState<RouteShapesMap>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);

  useEffect(() => {
    Promise.all([fetch('/api/shapes'), fetch('/api/stops')])
      .then(async ([shapesRes, stopsRes]) => {
        const shapesJson = (await shapesRes.json()) as Record<string, ShapeDto[]>;
        const shapesMap: RouteShapesMap = new Map();
        for (const [routeId, shapes] of Object.entries(shapesJson)) {
          shapesMap.set(
            routeId,
            shapes.map((s) => ({
              routeId,
              // Swap [lat, lng] → [lng, lat] for deck.gl/maplibre
              path: s.coordinates.map(([lat, lng]) => [lng, lat] as [number, number]),
            })),
          );
        }
        setRouteShapes(shapesMap);

        const stopsJson = (await stopsRes.json()) as { data: StopDto[] };
        const parsedStops: Stop[] = stopsJson.data.map((s) => ({
          id: s.id,
          name: s.attributes.name,
          latitude: s.attributes.latitude,
          longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0,
          routeIds: [],
        }));
        const enrichedStops = assignStopRoutes(parsedStops, shapesMap);
        setStops(enrichedStops);
        setStopNames(enrichedStops);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  return { routeShapes, stops };
}
