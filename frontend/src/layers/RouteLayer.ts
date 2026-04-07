import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface RoutePathData {
  routeId: string;
  path: [number, number][]; // [lng, lat][]
}

// Faint wide colored lines as background guides — matches London Underground style
export function createRouteLayer(routes: RoutePathData[]) {
  return new PathLayer({
    id: 'route-paths',
    data: routes,
    getPath: (d: RoutePathData) => d.path,
    getColor: (d: RoutePathData) => [...getRouteColor(d.routeId), 50],
    getWidth: 12,
    widthUnits: 'pixels' as const,
    widthMinPixels: 8,
    widthMaxPixels: 16,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  } as any);
}
