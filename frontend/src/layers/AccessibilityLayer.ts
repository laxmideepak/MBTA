import { ScatterplotLayer } from '@deck.gl/layers';
import type { Stop, FacilityWithStatus } from '../types';

interface AccessibilityDot { longitude: number; latitude: number; stopId: string; stopName: string; brokenCount: number; }

export function buildAccessibilityData(stops: Stop[], facilities: FacilityWithStatus[]): AccessibilityDot[] {
  const brokenByStop = new Map<string, number>();
  for (const f of facilities) {
    if (f.status?.status === 'OUT_OF_ORDER') {
      brokenByStop.set(f.facility.stopId, (brokenByStop.get(f.facility.stopId) ?? 0) + 1);
    }
  }
  return stops.filter((s) => brokenByStop.has(s.id)).map((s) => ({
    longitude: s.longitude, latitude: s.latitude, stopId: s.id, stopName: s.name, brokenCount: brokenByStop.get(s.id)!,
  }));
}

export function createAccessibilityLayer(data: AccessibilityDot[]) {
  return new ScatterplotLayer({
    id: 'accessibility-rings',
    data,
    getPosition: (d: AccessibilityDot) => [d.longitude, d.latitude],
    getRadius: 10, radiusUnits: 'pixels' as const, radiusMinPixels: 8, radiusMaxPixels: 16,
    getFillColor: [244, 67, 54, 80], getLineColor: [244, 67, 54, 200],
    getLineWidth: 2, lineWidthUnits: 'pixels' as const,
    stroked: true, filled: true, pickable: true,
  } as any);
}
