import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePolyline, loadShapes } from '../src/gtfs-loader.js';

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

describe('loadShapes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('degrades gracefully when a route returns a network/parse error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const goodPolyline = '_p~iF~ps|U_ulLnnqC';
    const fetchStub = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('Red')) {
        // Non-ok response should short-circuit to empty.
        return { ok: false, status: 502, statusText: 'Bad Gateway' } as unknown as Response;
      }
      if (url.includes('Orange')) {
        // Throw synchronously during json() — should be caught, not propagate.
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('invalid json');
          },
        } as unknown as Response;
      }
      // Every other route returns one good shape + one malformed (missing polyline).
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: `${url}-ok`, attributes: { polyline: goodPolyline } },
            { id: `${url}-bad`, attributes: { polyline: null } },
          ],
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchStub);

    const shapes = await loadShapes('');
    expect(shapes.get('Red')).toEqual([]);
    expect(shapes.get('Orange')).toEqual([]);
    // Remaining routes should have exactly the one valid shape (null polyline skipped).
    expect(shapes.get('Blue')).toHaveLength(1);
    expect(shapes.get('Blue')![0].coordinates.length).toBeGreaterThan(0);
  });

  it('skips shapes whose polyline fails to decode without rejecting the whole route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const fetchStub = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'good', attributes: { polyline: '_p~iF~ps|U_ulLnnqC' } },
            // Empty string is intentionally skipped (handled by length check).
            { id: 'empty', attributes: { polyline: '' } },
          ],
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchStub);

    const shapes = await loadShapes('');
    for (const routeShapes of shapes.values()) {
      expect(routeShapes).toHaveLength(1);
      expect(routeShapes[0].shapeId).toBe('good');
    }
  });
});
