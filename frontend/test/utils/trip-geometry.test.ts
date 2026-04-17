import { describe, expect, it } from 'vitest';
import type { TrainTrip } from '../../src/hooks/useTrainTrips';
import { interpolateAlongPath } from '../../src/utils/trip-geometry';

// Minimal trip factory: only fields interpolateAlongPath reads are required,
// the rest are filled with throwaway defaults so the type matches.
function makeTrip(overrides: Partial<TrainTrip>): TrainTrip {
  return {
    id: 't',
    routeId: 'Red',
    directionId: 0,
    color: [0, 0, 0],
    colorGlow: [0, 0, 0, 80],
    path: [],
    timestamps: [],
    headIdx: 0,
    speed: 1,
    label: '',
    currentStatus: 'IN_TRANSIT_TO',
    stopId: '',
    delayed: false,
    origin: '',
    destination: '',
    progress: 0,
    progressVelocity: 0,
    futureStops: [],
    ...overrides,
  };
}

describe('interpolateAlongPath', () => {
  const PATH: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ];

  it('returns the head position at t=0', () => {
    const trip = makeTrip({ path: PATH, headIdx: 2, speed: 1 });
    expect(interpolateAlongPath(trip, 0)).toEqual([2, 0]);
  });

  it('advances forward with elapsed time proportional to speed', () => {
    const trip = makeTrip({ path: PATH, headIdx: 2, speed: 1 });
    // After 1 second at 1 index/sec the head sits at path[3].
    expect(interpolateAlongPath(trip, 1)).toEqual([3, 0]);
    // Half a second → midway between path[2] and path[3].
    expect(interpolateAlongPath(trip, 0.5)).toEqual([2.5, 0]);
  });

  it('interpolates linearly between path vertices', () => {
    // Non-uniform path so a fraction actually matters.
    const trip = makeTrip({
      path: [
        [0, 0],
        [10, 4],
      ],
      headIdx: 0,
      speed: 1,
    });
    const [lng, lat] = interpolateAlongPath(trip, 0.25);
    expect(lng).toBeCloseTo(2.5, 6);
    expect(lat).toBeCloseTo(1, 6);
  });

  it('clamps to the final path vertex when t overshoots the lookahead', () => {
    const trip = makeTrip({ path: PATH, headIdx: 1, speed: 2 });
    // headIdx + t*speed = 1 + 1000*2 = 2001, way past path end (idx 4).
    expect(interpolateAlongPath(trip, 1000)).toEqual([4, 0]);
  });

  it('clamps to the first path vertex when speed is 0 and raw index is 0', () => {
    // Stopped train (STOPPED_AT): speed=0 so head never moves regardless of t.
    const trip = makeTrip({ path: PATH, headIdx: 0, speed: 0 });
    expect(interpolateAlongPath(trip, 10)).toEqual([0, 0]);
  });

  it('stays pinned at headIdx when speed is 0', () => {
    const trip = makeTrip({ path: PATH, headIdx: 3, speed: 0 });
    expect(interpolateAlongPath(trip, 5)).toEqual([3, 0]);
    expect(interpolateAlongPath(trip, 500)).toEqual([3, 0]);
  });
});
