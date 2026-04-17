import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHoveredEntity } from '../../src/hooks/useHoveredEntity';
import type { Stop, Vehicle } from '../../src/types';

function mkVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    routeId: 'Red',
    latitude: 42.35,
    longitude: -71.05,
    bearing: 0,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-a',
    currentStopSequence: 1,
    directionId: 0,
    label: '1234',
    tripId: 'trip-1',
    updatedAt: '2026-04-17T12:00:00Z',
    ...overrides,
  };
}

function mkStop(overrides: Partial<Stop> = {}): Stop {
  return {
    id: 'place-pktrm',
    name: 'Park Street',
    latitude: 42.3564,
    longitude: -71.0624,
    wheelchairBoarding: 1,
    routeIds: ['Red', 'Green-B'],
    ...overrides,
  };
}

describe('useHoveredEntity', () => {
  it('lets station setter replace a hovered train (last setter wins)', () => {
    const { result } = renderHook(() => useHoveredEntity());

    act(() => {
      result.current.setHoveredTrain(mkVehicle(), [10, 20]);
    });
    expect(result.current.hovered?.kind).toBe('train');

    act(() => {
      result.current.setHoveredStation(mkStop(), [30, 40]);
    });
    expect(result.current.hovered?.kind).toBe('station');
    if (result.current.hovered?.kind === 'station') {
      expect(result.current.hovered.stop.id).toBe('place-pktrm');
      expect(result.current.hovered.pixel).toEqual([30, 40]);
    }
  });

  it('lets train setter replace a hovered station (last setter wins)', () => {
    const { result } = renderHook(() => useHoveredEntity());

    act(() => {
      result.current.setHoveredStation(mkStop(), [30, 40]);
    });
    expect(result.current.hovered?.kind).toBe('station');

    act(() => {
      result.current.setHoveredTrain(mkVehicle(), [10, 20]);
    });
    expect(result.current.hovered?.kind).toBe('train');
    if (result.current.hovered?.kind === 'train') {
      expect(result.current.hovered.vehicle.id).toBe('v1');
      expect(result.current.hovered.pixel).toEqual([10, 20]);
    }
  });

  it('clears to null when either setter receives null', () => {
    const { result } = renderHook(() => useHoveredEntity());

    act(() => {
      result.current.setHoveredTrain(mkVehicle(), [1, 2]);
    });
    act(() => {
      result.current.setHoveredTrain(null);
    });
    expect(result.current.hovered).toBeNull();

    act(() => {
      result.current.setHoveredStation(mkStop(), [3, 4]);
    });
    act(() => {
      result.current.setHoveredStation(null);
    });
    expect(result.current.hovered).toBeNull();
  });

  it('keeps the pinned train when a station hover would otherwise take over', () => {
    const { result } = renderHook(() => useHoveredEntity());

    act(() => {
      result.current.setHoveredTrain(mkVehicle(), [10, 20]);
      result.current.pin();
    });
    expect(result.current.pinned).toBe(true);
    expect(result.current.hovered?.kind).toBe('train');

    // While pinned, setHoveredStation is a no-op.
    act(() => {
      result.current.setHoveredStation(mkStop(), [30, 40]);
    });
    expect(result.current.hovered?.kind).toBe('train');
    if (result.current.hovered?.kind === 'train') {
      expect(result.current.hovered.vehicle.id).toBe('v1');
    }
  });

  it('restores station-set capability after unpin', () => {
    const { result } = renderHook(() => useHoveredEntity());

    act(() => {
      result.current.setHoveredTrain(mkVehicle(), [10, 20]);
      result.current.pin();
    });
    act(() => {
      result.current.setHoveredStation(mkStop(), [30, 40]);
    });
    // Still train (pin suppressed the station).
    expect(result.current.hovered?.kind).toBe('train');

    act(() => {
      result.current.unpin();
    });
    expect(result.current.pinned).toBe(false);

    act(() => {
      result.current.setHoveredStation(mkStop({ id: 'place-dwnxg', name: 'Downtown' }), [50, 60]);
    });
    expect(result.current.hovered?.kind).toBe('station');
    if (result.current.hovered?.kind === 'station') {
      expect(result.current.hovered.stop.id).toBe('place-dwnxg');
    }
  });
});
