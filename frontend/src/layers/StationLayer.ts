import { ScatterplotLayer } from '@deck.gl/layers';
import { getRouteColor } from '../utils/mbta-colors';
import type { Stop } from '../types';

// Exact copy of London Underground's ScatterplotLayer for stations:
// Small colored dots, radiusUnits: 'meters', getRadius: 50
export function createStationLayer(
  stops: Stop[],
  accessibilityOn: boolean,
  brokenFacilityStopIds: Set<string>,
) {
  return new ScatterplotLayer({
    id: 'stations',
    data: stops,
    getPosition: (d: Stop) => [d.longitude, d.latitude, 0],
    getFillColor: (d: Stop) => {
      if (accessibilityOn && brokenFacilityStopIds.has(d.id)) {
        return [244, 67, 54, 200];
      }
      return [255, 255, 255, 153];
    },
    getLineColor: [0, 0, 0, 153],
    getLineWidth: 4,
    lineWidthUnits: 'meters' as const,
    stroked: true,
    filled: true,
    radiusUnits: 'meters' as const,
    getRadius: 50,
    radiusMinPixels: 1,
    radiusMaxPixels: 20,
    pickable: true,
    updateTriggers: { getFillColor: [accessibilityOn, brokenFacilityStopIds] },
  } as any);
}
