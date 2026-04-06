import { describe, it, expect } from 'vitest';
import { decodePolyline } from '../src/gtfs-loader.js';

describe('decodePolyline', () => {
  it('decodes a simple Google encoded polyline into [lat, lng] pairs', () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const result = decodePolyline(encoded);
    expect(result).toHaveLength(3);
    expect(result[0][0]).toBeCloseTo(38.5, 4);
    expect(result[0][1]).toBeCloseTo(-120.2, 4);
    expect(result[1][0]).toBeCloseTo(40.7, 4);
    expect(result[1][1]).toBeCloseTo(-120.95, 4);
    expect(result[2][0]).toBeCloseTo(43.252, 4);
    expect(result[2][1]).toBeCloseTo(-126.453, 4);
  });

  it('returns an empty array for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
