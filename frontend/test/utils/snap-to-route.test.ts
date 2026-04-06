import { describe, it, expect } from 'vitest';
import { snapToRoute, findNearestPointIndex } from '../../src/utils/snap-to-route';

describe('findNearestPointIndex', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35], [-71.08, 42.36], [-71.06, 42.355], [-71.04, 42.36],
  ];

  it('returns the index of the nearest point on the route', () => {
    const idx = findNearestPointIndex(-71.061, 42.354, routeCoords);
    expect(idx).toBe(2);
  });

  it('returns 0 for a point near the start', () => {
    const idx = findNearestPointIndex(-71.10, 42.35, routeCoords);
    expect(idx).toBe(0);
  });
});

describe('snapToRoute', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35], [-71.08, 42.36], [-71.06, 42.355], [-71.04, 42.36],
  ];

  it('returns the nearest route coordinate', () => {
    const snapped = snapToRoute(-71.061, 42.354, routeCoords);
    expect(snapped[0]).toBeCloseTo(-71.06, 2);
    expect(snapped[1]).toBeCloseTo(42.355, 2);
  });
});
