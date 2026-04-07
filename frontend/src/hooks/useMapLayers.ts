import { useEffect, useRef } from 'react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { Stop } from '../types';

export function useMapLayers(
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
  stops: Stop[],
  accessibilityOn: boolean,
  brokenStopIds: Set<string>,
) {
  const staticLayersRef = useRef<any[]>([]);

  useEffect(() => {
    if (routeShapes.size === 0) return;

    const routeFeatures: any[] = [];
    routeShapes.forEach((shapes) => {
      for (const shape of shapes) {
        routeFeatures.push({
          type: 'Feature',
          properties: { routeId: shape.routeId },
          geometry: { type: 'LineString', coordinates: shape.path },
        });
      }
    });

    const routeLayer = new GeoJsonLayer({
      id: 'route-lines',
      data: { type: 'FeatureCollection', features: routeFeatures },
      pickable: false,
      stroked: false,
      filled: false,
      lineWidthMinPixels: 10,
      getLineColor: (f: any) => [...getRouteColor(f.properties.routeId), 70],
      getLineWidth: 1,
      parameters: { depthTest: false, depthWrite: false },
    } as any);

    const stationLayer = new ScatterplotLayer({
      id: 'stations',
      data: stops,
      getPosition: (d: Stop) => [d.longitude, d.latitude, 0],
      getFillColor: (d: Stop) => {
        if (accessibilityOn && brokenStopIds.has(d.id)) return [244, 67, 54, 200];
        return [255, 255, 255, 140];
      },
      getLineColor: [0, 0, 0, 120],
      getLineWidth: 3,
      lineWidthUnits: 'meters' as const,
      stroked: true,
      filled: true,
      radiusUnits: 'meters' as const,
      getRadius: 40,
      radiusMinPixels: 2,
      radiusMaxPixels: 14,
      pickable: true,
    } as any);

    staticLayersRef.current = [routeLayer, stationLayer];
  }, [routeShapes, stops, accessibilityOn, brokenStopIds]);

  return staticLayersRef;
}
