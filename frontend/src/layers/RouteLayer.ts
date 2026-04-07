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
    getColor: (d: RoutePathData) => [...getRouteColor(d.routeId), 100],
    getWidth: 2,
    widthUnits: 'pixels' as const,
    widthMinPixels: 2,
    widthMaxPixels: 6,
    capRounded: true,
    jointRounded: true,
    pickable: false,
  } as any);
}
