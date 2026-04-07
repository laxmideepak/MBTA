import { useEffect, useState } from 'react';
import type { Stop } from '../types';
import { setStopNames } from '../utils/stop-names';

export function useRouteData() {
  const [routeShapes, setRouteShapes] = useState<Map<string, { routeId: string; path: [number, number][] }[]>>(new Map());
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    Promise.all([fetch('/api/shapes'), fetch('/api/stops')])
      .then(async ([shapesRes, stopsRes]) => {
        const shapesJson = await shapesRes.json();
        const shapesMap = new Map<string, { routeId: string; path: [number, number][] }[]>();
        for (const [routeId, shapes] of Object.entries(shapesJson)) {
          shapesMap.set(routeId, (shapes as any[]).map((s) => ({
            routeId,
            // Swap [lat, lng] → [lng, lat] for deck.gl/maplibre
            path: s.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]),
          })));
        }
        setRouteShapes(shapesMap);

        const stopsJson = await stopsRes.json();
        const parsedStops: Stop[] = stopsJson.data.map((s: any) => ({
          id: s.id,
          name: s.attributes.name,
          latitude: s.attributes.latitude,
          longitude: s.attributes.longitude,
          wheelchairBoarding: s.attributes.wheelchair_boarding ?? 0,
          routeIds: [],
        }));
        setStops(parsedStops);
        setStopNames(parsedStops);

        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, []);

  return { routeShapes, stops, loading, error };
}
