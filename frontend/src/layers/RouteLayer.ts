import { GeoJsonLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface RoutePathData {
  routeId: string;
  path: [number, number][]; // [lng, lat][]
}

// Convert our route paths into GeoJSON LineString features for GeoJsonLayer
// Matching London Underground: wide faint lines as background guides
export function createRouteLayer(routes: RoutePathData[]) {
  const geojson = {
    type: 'FeatureCollection' as const,
    features: routes.map((r) => ({
      type: 'Feature' as const,
      properties: { routeId: r.routeId },
      geometry: {
        type: 'LineString' as const,
        coordinates: r.path,
      },
    })),
  };

  return new GeoJsonLayer({
    id: 'route-paths',
    data: geojson,
    stroked: false,
    filled: false,
    lineWidthMinPixels: 12,
    getLineColor: (f: any) => {
      const color = getRouteColor(f.properties.routeId);
      return [...color, 50]; // ~20% opacity — faint background
    },
    pickable: false,
  } as any);
}
