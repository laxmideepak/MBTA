import { describe, expect, it } from 'vitest';
import type { Vehicle } from '../src/types.js';
import { VehicleDepartureCache } from '../src/vehicle-departure-cache.js';

// Minimal Vehicle fixture — only the fields VehicleDepartureCache actually
// reads matter (id, currentStatus, stopId). Everything else is padding.
function mkVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    routeId: 'Red',
    latitude: 42.3555,
    longitude: -71.0565,
    bearing: 0,
    currentStatus: 'IN_TRANSIT_TO',
    stopId: 'place-pktrm',
    currentStopSequence: 1,
    directionId: 0,
    label: '1234',
    tripId: 'trip-1',
    updatedAt: '2026-04-17T12:00:00-04:00',
    ...overrides,
  };
}

describe('VehicleDepartureCache', () => {
  it('records nothing on the first event for an unseen vehicle but stamps lastSeen', () => {
    const cache = new VehicleDepartureCache();
    const now = 1_000;
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }),
      now,
    );
    expect(entry).toBeNull();
    expect(cache.get('v1')).toBeNull();
    // `lastSeen = now`. A sweep at the same instant with a generous ttl is a
    // no-op; pushing the clock past the ttl sweeps the seed state.
    expect(cache.sweep(now, 60_000)).toBe(0);
    expect(cache.sweep(now + 61_000, 60_000)).toBe(1);
  });

  it('records a departure on STOPPED_AT → IN_TRANSIT_TO', () => {
    const cache = new VehicleDepartureCache();
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }), 100);
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }),
      200,
    );
    expect(entry).toEqual({ stopId: 'place-a', at: 200, lastSeen: 200 });
    expect(cache.get('v1')).toEqual({ stopId: 'place-a', at: 200, lastSeen: 200 });
  });

  it('records a departure on STOPPED_AT → INCOMING_AT', () => {
    const cache = new VehicleDepartureCache();
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }), 100);
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'INCOMING_AT', stopId: 'place-b' }),
      250,
    );
    expect(entry).toEqual({ stopId: 'place-a', at: 250, lastSeen: 250 });
  });

  it('does not record when IN_TRANSIT_TO changes to IN_TRANSIT_TO (even different stopId)', () => {
    const cache = new VehicleDepartureCache();
    cache.onEvent('v1', mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-a' }), 100);
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }),
      200,
    );
    expect(entry).toBeNull();
    expect(cache.get('v1')).toBeNull();
  });

  it('keeps the prior departure on IN_TRANSIT_TO → STOPPED_AT (arrival) and refreshes lastSeen', () => {
    const cache = new VehicleDepartureCache();
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }), 100);
    cache.onEvent('v1', mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }), 200);
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-b' }),
      300,
    );
    expect(entry).toBeNull();
    // Prior recorded departure remains.
    expect(cache.get('v1')).toEqual({ stopId: 'place-a', at: 200, lastSeen: 300 });
  });

  it('overwrites the entry on a later STOP→TRANSIT cycle', () => {
    const cache = new VehicleDepartureCache();
    // First cycle: stopped at A, transit to B.
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }), 100);
    cache.onEvent('v1', mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }), 200);
    // Arrive at B.
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-b' }), 300);
    // Depart B heading to C: should overwrite with a new entry.
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-c' }),
      400,
    );
    expect(entry).toEqual({ stopId: 'place-b', at: 400, lastSeen: 400 });
    expect(cache.get('v1')).toEqual({ stopId: 'place-b', at: 400, lastSeen: 400 });
  });

  it('remove(id) clears both the entry and the internal prev-state', () => {
    const cache = new VehicleDepartureCache();
    cache.onEvent('v1', mkVehicle({ currentStatus: 'STOPPED_AT', stopId: 'place-a' }), 100);
    cache.onEvent('v1', mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }), 200);
    expect(cache.get('v1')).not.toBeNull();
    cache.remove('v1');
    expect(cache.get('v1')).toBeNull();
    // After removal the next STOPPED_AT is effectively "first event" again; the
    // following transit should NOT record a stale departure from the wiped
    // prev-state.
    const entry = cache.onEvent(
      'v1',
      mkVehicle({ currentStatus: 'IN_TRANSIT_TO', stopId: 'place-z' }),
      500,
    );
    expect(entry).toBeNull();
    expect(cache.get('v1')).toBeNull();
  });

  it('sweep(now, 30min) drops stale entries and keeps recent, returning the count', () => {
    const cache = new VehicleDepartureCache();
    const minute = 60_000;
    // Three vehicles with different lastSeen stamps.
    cache.onEvent(
      'v-old',
      mkVehicle({ id: 'v-old', currentStatus: 'STOPPED_AT', stopId: 'place-a' }),
      0,
    );
    cache.onEvent(
      'v-old',
      mkVehicle({ id: 'v-old', currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }),
      1 * minute,
    );

    cache.onEvent(
      'v-mid',
      mkVehicle({ id: 'v-mid', currentStatus: 'STOPPED_AT', stopId: 'place-a' }),
      20 * minute,
    );
    cache.onEvent(
      'v-mid',
      mkVehicle({ id: 'v-mid', currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }),
      25 * minute,
    );

    cache.onEvent(
      'v-new',
      mkVehicle({ id: 'v-new', currentStatus: 'STOPPED_AT', stopId: 'place-a' }),
      50 * minute,
    );
    cache.onEvent(
      'v-new',
      mkVehicle({ id: 'v-new', currentStatus: 'IN_TRANSIT_TO', stopId: 'place-b' }),
      55 * minute,
    );

    // now = 60min, ttl = 30min → cutoff = 30min.
    // v-old (lastSeen=1min) is stale; v-mid (lastSeen=25min) is stale; v-new (lastSeen=55min) is recent.
    const removed = cache.sweep(60 * minute, 30 * minute);
    expect(removed).toBe(2);
    expect(cache.get('v-old')).toBeNull();
    expect(cache.get('v-mid')).toBeNull();
    expect(cache.get('v-new')).not.toBeNull();
  });
});
