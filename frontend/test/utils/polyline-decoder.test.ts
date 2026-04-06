import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../../src/utils/polyline-decoder';

describe('decodePolyline', () => {
  it('decodes a Google encoded polyline into [lng, lat] pairs (GeoJSON order)', () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const result = decodePolyline(encoded);
    expect(result).toHaveLength(3);
    expect(result[0][0]).toBeCloseTo(-120.2, 4);   // lng
    expect(result[0][1]).toBeCloseTo(38.5, 4);      // lat
  });

  it('returns empty array for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
