import { PathLayer } from '@deck.gl/layers';
import type { RoutePathData } from './RouteLayer';
import type { Alert } from '../types';

export interface AlertSegment { routeId: string; path: [number, number][]; }

export function getAlertSegments(alerts: Alert[], routeShapes: Map<string, RoutePathData[]>): AlertSegment[] {
  const affectedRoutes = new Set<string>();
  for (const alert of alerts) {
    if (['SHUTTLE', 'SUSPENSION', 'NO_SERVICE'].includes(alert.effect)) {
      for (const entity of alert.informedEntities) { if (entity.routeId) affectedRoutes.add(entity.routeId); }
    }
  }
  const segments: AlertSegment[] = [];
  for (const routeId of affectedRoutes) {
    const shapes = routeShapes.get(routeId);
    if (!shapes) continue;
    for (const shape of shapes) segments.push({ routeId, path: shape.path });
  }
  return segments;
}

export function createAlertLayer(segments: AlertSegment[]) {
  return new PathLayer({
    id: 'alert-overlay',
    data: segments,
    getPath: (d: AlertSegment) => d.path,
    getColor: [85, 85, 85, 200],
    getWidth: 5,
    widthUnits: 'pixels' as const,
    widthMinPixels: 3,
    pickable: false,
  } as any);
}
