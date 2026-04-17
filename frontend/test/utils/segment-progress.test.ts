import { describe, expect, it } from 'vitest';
import type { NextStop, Prediction, Vehicle } from '../../src/types';
import { segmentProgress } from '../../src/utils/segment-progress';

function mkVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    routeId: 'Red',
    latitude: 42.3555,
    longitude: -71.0565,
    bearing: 0,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-b',
    currentStopSequence: 1,
    directionId: 0,
    label: '1234',
    tripId: 'trip-1',
    updatedAt: '2026-04-17T12:00:00Z',
    currentStopName: 'Stop A',
    lastDepartedStopId: 'place-a',
    lastDepartedAt: null,
    ...overrides,
  };
}

function mkNextStop(overrides: Partial<NextStop> = {}): NextStop {
  return {
    stopId: 'place-b',
    stopName: 'Stop B',
    etaSec: 120,
    status: null,
    ...overrides,
  };
}

function noPrediction(): Prediction | null {
  return null;
}

describe('segmentProgress', () => {
  it('returns null fraction and only the next stop name when now is null', () => {
    const result = segmentProgress({
      vehicle: mkVehicle({ nextStops: [mkNextStop()] }),
      now: null,
      stopName: () => 'Stop A',
      prediction: noPrediction,
    });
    expect(result.fraction).toBeNull();
    expect(result.fromStopName).toBeNull();
    expect(result.toStopName).toBe('Stop B');
  });

  it('snaps to fraction 0 with currentStopName when the train is STOPPED_AT', () => {
    const result = segmentProgress({
      vehicle: mkVehicle({
        currentStatus: 'STOPPED_AT',
        currentStopName: 'Park St',
        nextStops: [mkNextStop({ stopName: 'Downtown Crossing' })],
      }),
      now: 1_000,
      stopName: () => null,
      prediction: noPrediction,
    });
    expect(result.fraction).toBe(0);
    expect(result.fromStopName).toBe('Park St');
    expect(result.toStopName).toBe('Downtown Crossing');
  });

  it('computes the exact fraction (now - from) / (predArrival - from) when prediction matches', () => {
    const fromTs = 10_000;
    const predArrivalIso = new Date(fromTs + 60_000).toISOString(); // +60s
    const now = fromTs + 15_000; // 25% of the way
    const result = segmentProgress({
      vehicle: mkVehicle({
        lastDepartedStopId: 'place-a',
        lastDepartedAt: fromTs,
        tripId: 'trip-1',
        nextStops: [mkNextStop({ stopId: 'place-b', etaSec: 999 })],
        updatedAt: new Date(fromTs).toISOString(),
      }),
      now,
      stopName: (id) => (id === 'place-a' ? 'Stop A' : null),
      prediction: (tripId, stopId) =>
        tripId === 'trip-1' && stopId === 'place-b'
          ? {
              id: 'p1',
              routeId: 'Red',
              stopId,
              directionId: 0,
              arrivalTime: predArrivalIso,
              departureTime: null,
              status: null,
              tripId,
              vehicleId: null,
              stopSequence: 1,
            }
          : null,
    });
    // (15000 / 60000) = 0.25 exactly.
    expect(result.fraction).toBe(0.25);
    expect(result.fromStopName).toBe('Stop A');
    expect(result.toStopName).toBe('Stop B');
  });

  it('falls back to updatedAt + etaSec * 1000 when prediction is missing, producing a different fraction', () => {
    const fromTs = 10_000;
    // updatedAt at fromTs + 5s, etaSec 30 → expected arrival at fromTs + 35s.
    // vs the prediction path which would have used arrivalTime. Here we
    // confirm the fallback is numerically distinct.
    const updatedAtMs = fromTs + 5_000;
    const etaSec = 30;
    const now = fromTs + 10_000; // 10s past departure
    const result = segmentProgress({
      vehicle: mkVehicle({
        lastDepartedStopId: 'place-a',
        lastDepartedAt: fromTs,
        tripId: 'trip-1',
        updatedAt: new Date(updatedAtMs).toISOString(),
        nextStops: [mkNextStop({ stopId: 'place-b', etaSec })],
      }),
      now,
      stopName: () => 'Stop A',
      prediction: noPrediction,
    });
    const toTs = updatedAtMs + etaSec * 1000; // 45_000
    const denom = toTs - fromTs; // 35_000
    const expected = 10_000 / denom;
    expect(result.fraction).toBeCloseTo(expected, 10);
    // Guard: not equal to the prediction-preferred path's result — if we'd
    // used fromTs+60s, fraction would be 10/60 ≈ 0.1667. Our 10/35 ≈ 0.286.
    expect(result.fraction).not.toBeCloseTo(10_000 / 60_000, 3);
  });

  it('returns null fraction when lastDepartedAt is undefined (no baseline)', () => {
    const result = segmentProgress({
      vehicle: mkVehicle({
        lastDepartedAt: undefined,
        lastDepartedStopId: undefined,
        nextStops: [mkNextStop()],
      }),
      now: 1_000,
      stopName: () => null,
      prediction: noPrediction,
    });
    expect(result.fraction).toBeNull();
    expect(result.fromStopName).toBeNull();
    expect(result.toStopName).toBe('Stop B');
  });

  it('clamps out-of-range now values to [0, 1]', () => {
    const fromTs = 10_000;
    const arrivalTime = new Date(fromTs + 60_000).toISOString();
    const commonVehicle = mkVehicle({
      lastDepartedStopId: 'place-a',
      lastDepartedAt: fromTs,
      nextStops: [mkNextStop({ stopId: 'place-b' })],
    });
    const pred = (tripId: string, stopId: string): Prediction | null =>
      tripId === 'trip-1' && stopId === 'place-b'
        ? {
            id: 'p1',
            routeId: 'Red',
            stopId,
            directionId: 0,
            arrivalTime,
            departureTime: null,
            status: null,
            tripId,
            vehicleId: null,
            stopSequence: 1,
          }
        : null;

    const before = segmentProgress({
      vehicle: commonVehicle,
      now: fromTs - 5_000,
      stopName: () => 'Stop A',
      prediction: pred,
    });
    const after = segmentProgress({
      vehicle: commonVehicle,
      now: fromTs + 999_000,
      stopName: () => 'Stop A',
      prediction: pred,
    });
    expect(before.fraction).toBe(0);
    expect(after.fraction).toBe(1);
  });
});
