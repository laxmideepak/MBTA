import { useEffect, useRef } from 'react';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { Stop } from '../types';

export function useMapLayers(
  routeShapes: Map<string, { routeId: string; path: [number, number][] }[]>,
  stops: Stop[],
  accessibilityOn: boolean,
  brokenStopIds: Set<string>,
  onStationClick?: (stop: Stop, x: number, y: number) => void,
  focusedStop?: Stop | null,
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
      onClick: ({ object, x, y }: any) => {
        if (object && onStationClick) onStationClick(object, x, y);
      },
    } as any);

    const layers: any[] = [routeLayer, stationLayer];

    if (focusedStop) {
      layers.push(new ScatterplotLayer({
        id: 'station-focus-ring',
        data: [focusedStop],
        getPosition: (d: Stop) => [d.longitude, d.latitude, 0],
        getFillColor: [255, 255, 255, 0],
        getLineColor: [255, 255, 255, 255],
        getRadius: 60,
        radiusUnits: 'meters',
        radiusMinPixels: 6,
        radiusMaxPixels: 24,
        stroked: true,
        filled: false,
        lineWidthMinPixels: 3,
        pickable: false,
      } as any));
    }

    staticLayersRef.current = layers;
  }, [routeShapes, stops, accessibilityOn, brokenStopIds, onStationClick, focusedStop]);

  return staticLayersRef;
}
