import { describe, it, expect } from 'vitest';
import { buildTrail } from '../../src/utils/trail-builder';

describe('buildTrail', () => {
  const routeCoords: [number, number][] = [
    [-71.10, 42.35], [-71.09, 42.355], [-71.08, 42.36],
    [-71.07, 42.355], [-71.06, 42.355], [-71.05, 42.36],
  ];

  it('returns a trail of N points ending at the head index', () => {
    const trail = buildTrail(routeCoords, 4, 3);
    expect(trail).toHaveLength(3);
    expect(trail[trail.length - 1]).toEqual(routeCoords[4]);
    expect(trail[0]).toEqual(routeCoords[2]);
  });

  it('returns shorter trail when near start of route', () => {
    const trail = buildTrail(routeCoords, 1, 5);
    expect(trail).toHaveLength(2);
    expect(trail[0]).toEqual(routeCoords[0]);
    expect(trail[1]).toEqual(routeCoords[1]);
  });

  it('returns single point when at index 0', () => {
    const trail = buildTrail(routeCoords, 0, 3);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toEqual(routeCoords[0]);
  });
});
