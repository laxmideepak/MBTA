import { ScatterplotLayer } from '@deck.gl/layers';
import type { Stop } from '../types';

export function createStationLayer(
  stops: Stop[],
  accessibilityOn: boolean,
  brokenFacilityStopIds: Set<string>,
) {
  return new ScatterplotLayer({
    id: 'station-dots',
    data: stops,
    getPosition: (d: Stop) => [d.longitude, d.latitude],
    getRadius: 4,
    radiusUnits: 'pixels' as const,
    radiusMinPixels: 3,
    radiusMaxPixels: 8,
    getFillColor: (d: Stop) => {
      if (accessibilityOn && brokenFacilityStopIds.has(d.id)) return [244, 67, 54, 255];
      return [255, 255, 255, 220];
    },
    getLineColor: [255, 255, 255, 60],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    updateTriggers: { getFillColor: [accessibilityOn, brokenFacilityStopIds] },
  } as any);
}
