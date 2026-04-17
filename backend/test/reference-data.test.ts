import { describe, expect, it, vi } from 'vitest';
import { parseRoutes, parseStops, parseTrips, ReferenceData } from '../src/reference-data.js';
import type { MbtaResource } from '../src/types.js';

function mkResource(overrides: Partial<MbtaResource> & { id: string; type: string }): MbtaResource {
  return {
    id: overrides.id,
    type: overrides.type,
    attributes: overrides.attributes ?? {},
    relationships: overrides.relationships,
  };
}

describe('reference-data', () => {
  describe('parseRoutes', () => {
    it('filters to subway route_types (0/1) and normalizes fields', () => {
      const resources: MbtaResource[] = [
        mkResource({
          id: 'Red',
          type: 'route',
          attributes: {
            route_type: 1,
            color: 'DA291C',
            text_color: 'FFFFFF',
            long_name: 'Red Line',
            short_name: 'RL',
          },
        }),
        mkResource({
          id: 'CR-Providence',
          type: 'route',
          attributes: { route_type: 2, long_name: 'Providence' },
        }),
      ];

      const routes = parseRoutes(resources);
      expect(routes.size).toBe(1);
      expect(routes.get('Red')).toEqual({
        id: 'Red',
        type: 1,
        color: 'DA291C',
        textColor: 'FFFFFF',
        longName: 'Red Line',
        shortName: 'RL',
      });
    });
  });

  describe('parseStops', () => {
    it('keeps stops with names and preserves optional numeric fields', () => {
      const resources: MbtaResource[] = [
        mkResource({
          id: 'place-pktrm',
          type: 'stop',
          attributes: {
            name: 'Park Street',
            latitude: 42.3564,
            longitude: -71.0623,
            wheelchair_boarding: 1,
            parent_station: null,
          },
        }),
        mkResource({
          id: 'no-name',
          type: 'stop',
          attributes: { latitude: 1, longitude: 2 },
        }),
      ];

      const stops = parseStops(resources);
      expect(stops.size).toBe(1);
      expect(stops.get('place-pktrm')?.name).toBe('Park Street');
      expect(stops.get('place-pktrm')?.wheelchairBoarding).toBe(1);
    });
  });

  describe('parseTrips', () => {
    it('extracts route relationship and basic trip attributes', () => {
      const resources: MbtaResource[] = [
        mkResource({
          id: 'trip-1',
          type: 'trip',
          attributes: { direction_id: 0, headsign: 'Alewife' },
          relationships: { route: { data: { type: 'route', id: 'Red' } } },
        }),
      ];
      const trips = parseTrips(resources);
      expect(trips.get('trip-1')).toEqual({
        id: 'trip-1',
        routeId: 'Red',
        directionId: 0,
        headsign: 'Alewife',
      });
    });
  });

  describe('ReferenceData', () => {
    it('refreshNow fetches routes then stops+trips (trips scoped by route id) and stores a snapshot', async () => {
      const fetchFn = vi.fn(async (url: string) => {
        const mk = (data: MbtaResource[]) =>
          ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ data, links: { next: null } }),
          }) as unknown as Response;

        if (url.includes('/routes?')) {
          return mk([
            mkResource({
              id: 'Red',
              type: 'route',
              attributes: { route_type: 1, long_name: 'Red' },
            }),
          ]);
        }
        if (url.includes('/stops?')) {
          return mk([
            mkResource({ id: 'place-pktrm', type: 'stop', attributes: { name: 'Park' } }),
          ]);
        }
        if (url.includes('/trips?') && url.includes('filter[route]=')) {
          return mk([
            mkResource({
              id: 'trip-1',
              type: 'trip',
              attributes: { direction_id: 1, headsign: 'Ashmont' },
              relationships: { route: { data: { type: 'route', id: 'Red' } } },
            }),
          ]);
        }
        throw new Error(`unexpected url ${url}`);
      }) as unknown as typeof fetch;

      const rd = new ReferenceData({ apiKey: '', now: () => 123, fetchFn });
      const snap = await rd.refreshNow();
      expect(snap.fetchedAt).toBe(123);
      expect(snap.routes.has('Red')).toBe(true);
      expect(snap.stops.has('place-pktrm')).toBe(true);
      expect(snap.trips.has('trip-1')).toBe(true);
      expect(rd.getSnapshot()?.fetchedAt).toBe(123);
    });
  });
});
