import { describe, it, expect } from 'vitest';
import {
  parseVehicle,
  parsePrediction,
  parseAlert,
  parseFacility,
} from '../src/mbta-parser.js';

describe('parseVehicle', () => {
  it('parses a MBTA JSON:API vehicle resource into our Vehicle type', () => {
    const raw = {
      type: 'vehicle',
      id: 'y1234',
      attributes: {
        latitude: 42.3555,
        longitude: -71.0565,
        bearing: 180,
        current_status: 'IN_TRANSIT_TO',
        direction_id: 0,
        label: '1234',
        updated_at: '2026-04-06T12:00:00-04:00',
        current_stop_sequence: 5,
        occupancy_status: null,
        revenue: 'REVENUE',
        speed: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: '12345' } },
      },
    };
    const vehicle = parseVehicle(raw);
    expect(vehicle).toEqual({
      id: 'y1234',
      routeId: 'Red',
      latitude: 42.3555,
      longitude: -71.0565,
      bearing: 180,
      currentStatus: 'IN_TRANSIT_TO',
      stopId: 'place-pktrm',
      directionId: 0,
      label: '1234',
      updatedAt: '2026-04-06T12:00:00-04:00',
    });
  });

  it('handles null stop relationship', () => {
    const raw = {
      type: 'vehicle',
      id: 'y9999',
      attributes: {
        latitude: 42.36, longitude: -71.06, bearing: 90,
        current_status: 'STOPPED_AT', direction_id: 1,
        label: '9999', updated_at: '2026-04-06T12:05:00-04:00',
        current_stop_sequence: 1, occupancy_status: null,
        revenue: 'REVENUE', speed: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Orange' } },
        stop: { data: null },
        trip: { data: { type: 'trip', id: '99999' } },
      },
    };
    const vehicle = parseVehicle(raw);
    expect(vehicle.stopId).toBe('');
    expect(vehicle.routeId).toBe('Orange');
  });
});

describe('parsePrediction', () => {
  it('parses a MBTA prediction resource', () => {
    const raw = {
      type: 'prediction',
      id: 'prediction-12345',
      attributes: {
        arrival_time: '2026-04-06T12:10:00-04:00',
        departure_time: '2026-04-06T12:10:30-04:00',
        direction_id: 0, stop_sequence: 5, status: null,
        schedule_relationship: null, arrival_uncertainty: null,
        departure_uncertainty: null, last_trip: false,
        revenue: 'REVENUE', update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: 'trip-100' } },
        vehicle: { data: { type: 'vehicle', id: 'y1234' } },
      },
    };
    const prediction = parsePrediction(raw);
    expect(prediction).toEqual({
      id: 'prediction-12345', routeId: 'Red', stopId: 'place-pktrm',
      directionId: 0, arrivalTime: '2026-04-06T12:10:00-04:00',
      departureTime: '2026-04-06T12:10:30-04:00', status: null,
      tripId: 'trip-100', vehicleId: 'y1234', stopSequence: 5,
    });
  });

  it('handles null vehicle and times', () => {
    const raw = {
      type: 'prediction', id: 'prediction-99',
      attributes: {
        arrival_time: null, departure_time: null, direction_id: 1,
        stop_sequence: 1, status: 'Arriving', schedule_relationship: null,
        arrival_uncertainty: null, departure_uncertainty: null,
        last_trip: false, revenue: 'REVENUE', update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Blue' } },
        stop: { data: { type: 'stop', id: 'place-wondl' } },
        trip: { data: { type: 'trip', id: 'trip-200' } },
        vehicle: { data: null },
      },
    };
    const prediction = parsePrediction(raw);
    expect(prediction.arrivalTime).toBeNull();
    expect(prediction.vehicleId).toBeNull();
    expect(prediction.status).toBe('Arriving');
  });
});

describe('parseAlert', () => {
  it('parses a MBTA alert resource', () => {
    const raw = {
      type: 'alert', id: 'alert-500',
      attributes: {
        effect: 'SHUTTLE', cause: 'MAINTENANCE',
        header: 'Red Line shuttle buses',
        description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
        severity: 7, lifecycle: 'ONGOING',
        active_period: [{ start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' }],
        informed_entity: [{
          route: 'Red', route_type: 1, stop: 'place-harvd',
          direction_id: null, activities: ['BOARD', 'EXIT', 'RIDE'],
        }],
        updated_at: '2026-04-06T08:00:00-04:00',
        created_at: '2026-04-06T04:00:00-04:00',
        banner: null, url: null, short_header: 'Red Line shuttle',
        service_effect: 'Red Line shuttle service', timeframe: null,
        duration_certainty: 'KNOWN', image: null,
        image_alternative_text: null, closed_timestamp: null,
        last_push_notification_timestamp: null, reminder_times: null,
      },
      relationships: {},
    };
    const alert = parseAlert(raw);
    expect(alert).toEqual({
      id: 'alert-500', effect: 'SHUTTLE', cause: 'MAINTENANCE',
      header: 'Red Line shuttle buses',
      description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
      severity: 7, lifecycle: 'ONGOING',
      activePeriod: [{ start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' }],
      informedEntities: [{
        routeId: 'Red', stopId: 'place-harvd', directionId: null,
        routeType: 1, activities: ['BOARD', 'EXIT', 'RIDE'],
      }],
      updatedAt: '2026-04-06T08:00:00-04:00',
    });
  });
});

describe('parseFacility', () => {
  it('parses a MBTA facility resource', () => {
    const raw = {
      type: 'facility', id: 'facility-elevator-123',
      attributes: {
        long_name: 'Park Street Elevator 823',
        short_name: 'Elevator 823', type: 'ELEVATOR',
        latitude: 42.3564, longitude: -71.0624, properties: [],
      },
      relationships: {
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
      },
    };
    const facility = parseFacility(raw);
    expect(facility).toEqual({
      id: 'facility-elevator-123',
      longName: 'Park Street Elevator 823', shortName: 'Elevator 823',
      type: 'ELEVATOR', stopId: 'place-pktrm',
      latitude: 42.3564, longitude: -71.0624,
    });
  });
});
