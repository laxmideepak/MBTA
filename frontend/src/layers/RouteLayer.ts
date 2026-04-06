import { PathLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';

export interface RoutePathData {
  routeId: string;
  path: [number, number][];
}

export function createRouteLayer(routes: RoutePathData[]) {
  return new PathLayer({
    id: 'route-paths',
    data: routes,
    getPath: (d: RoutePathData) => d.path,
    getColor: (d: RoutePathData) => [...getRouteColor(d.routeId), 180],
    getWidth: 3,
    widthUnits: 'pixels' as const,
    widthMinPixels: 2,
    widthMaxPixels: 6,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  } as any);
}
