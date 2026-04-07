import { GeoJsonLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface RoutePathData {
  routeId: string;
  path: [number, number][]; // [lng, lat][]
}

// Exact copy of London Underground's GeoJsonLayer for tube lines:
// Wide, faint colored lines as background.
// lineWidthMinPixels: 12, color alpha: 50 (~20% opacity)
export function createRouteLayer(routes: RoutePathData[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: routes.map((r) => ({
      type: 'Feature' as const,
      properties: { routeId: r.routeId },
      geometry: { type: 'LineString' as const, coordinates: r.path },
    })),
  };

  return new GeoJsonLayer({
    id: 'tube-lines',
    data: geojson,
    pickable: false,
    stroked: false,
    filled: false,
    lineWidthScale: 1,
    lineWidthMinPixels: 12,
    getLineColor: (f: any) => [...getRouteColor(f.properties.routeId), 50],
    getLineWidth: 1,
    parameters: { depthTest: false, depthWrite: false },
  } as any);
}
