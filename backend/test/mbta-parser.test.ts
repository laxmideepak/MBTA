import { describe, expect, it } from 'vitest';
import { parseAlert, parsePrediction, parseSchedule, parseVehicle } from '../src/mbta-parser.js';

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
    expect(vehicle).not.toBeNull();
    expect(vehicle).toEqual({
      id: 'y1234',
      routeId: 'Red',
      latitude: 42.3555,
      longitude: -71.0565,
      bearing: 180,
      currentStatus: 'IN_TRANSIT_TO',
      stopId: 'place-pktrm',
      currentStopSequence: 5,
      directionId: 0,
      label: '1234',
      tripId: '12345',
      updatedAt: '2026-04-06T12:00:00-04:00',
    });
  });

  it('nulls currentStopSequence when missing', () => {
    const raw = {
      type: 'vehicle',
      id: 'y-no-seq',
      attributes: {
        latitude: 42.35,
        longitude: -71.06,
        bearing: 0,
        current_status: 'IN_TRANSIT_TO',
        direction_id: 0,
        label: 'X',
        updated_at: '2026-04-06T12:00:00-04:00',
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: 't1' } },
      },
    };
    const v = parseVehicle(raw);
    expect(v?.currentStopSequence).toBeNull();
    expect(v?.tripId).toBe('t1');
  });

  it('handles null stop relationship', () => {
    const raw = {
      type: 'vehicle',
      id: 'y9999',
      attributes: {
        latitude: 42.36,
        longitude: -71.06,
        bearing: 90,
        current_status: 'STOPPED_AT',
        direction_id: 1,
        label: '9999',
        updated_at: '2026-04-06T12:05:00-04:00',
        current_stop_sequence: 1,
        occupancy_status: null,
        revenue: 'REVENUE',
        speed: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Orange' } },
        stop: { data: null },
        trip: { data: { type: 'trip', id: '99999' } },
      },
    };
    const vehicle = parseVehicle(raw);
    expect(vehicle).not.toBeNull();
    expect(vehicle!.stopId).toBe('');
    expect(vehicle!.routeId).toBe('Orange');
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
        direction_id: 0,
        stop_sequence: 5,
        status: null,
        schedule_relationship: null,
        arrival_uncertainty: null,
        departure_uncertainty: null,
        last_trip: false,
        revenue: 'REVENUE',
        update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: 'place-pktrm' } },
        trip: { data: { type: 'trip', id: 'trip-100' } },
        vehicle: { data: { type: 'vehicle', id: 'y1234' } },
      },
    };
    const prediction = parsePrediction(raw);
    expect(prediction).not.toBeNull();
    expect(prediction).toEqual({
      id: 'prediction-12345',
      routeId: 'Red',
      stopId: 'place-pktrm',
      directionId: 0,
      arrivalTime: '2026-04-06T12:10:00-04:00',
      departureTime: '2026-04-06T12:10:30-04:00',
      status: null,
      tripId: 'trip-100',
      vehicleId: 'y1234',
      stopSequence: 5,
    });
  });

  it('handles null vehicle and times', () => {
    const raw = {
      type: 'prediction',
      id: 'prediction-99',
      attributes: {
        arrival_time: null,
        departure_time: null,
        direction_id: 1,
        stop_sequence: 1,
        status: 'Arriving',
        schedule_relationship: null,
        arrival_uncertainty: null,
        departure_uncertainty: null,
        last_trip: false,
        revenue: 'REVENUE',
        update_type: null,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Blue' } },
        stop: { data: { type: 'stop', id: 'place-wondl' } },
        trip: { data: { type: 'trip', id: 'trip-200' } },
        vehicle: { data: null },
      },
    };
    const prediction = parsePrediction(raw);
    expect(prediction).not.toBeNull();
    expect(prediction!.arrivalTime).toBeNull();
    expect(prediction!.vehicleId).toBeNull();
    expect(prediction!.status).toBe('Arriving');
  });
});

describe('parseAlert', () => {
  it('parses a MBTA alert resource', () => {
    const raw = {
      type: 'alert',
      id: 'alert-500',
      attributes: {
        effect: 'SHUTTLE',
        cause: 'MAINTENANCE',
        header: 'Red Line shuttle buses',
        description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
        severity: 7,
        lifecycle: 'ONGOING',
        active_period: [{ start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' }],
        informed_entity: [
          {
            route: 'Red',
            route_type: 1,
            stop: 'place-harvd',
            direction_id: null,
            activities: ['BOARD', 'EXIT', 'RIDE'],
          },
        ],
        updated_at: '2026-04-06T08:00:00-04:00',
        created_at: '2026-04-06T04:00:00-04:00',
        banner: null,
        url: null,
        short_header: 'Red Line shuttle',
        service_effect: 'Red Line shuttle service',
        timeframe: null,
        duration_certainty: 'KNOWN',
        image: null,
        image_alternative_text: null,
        closed_timestamp: null,
        last_push_notification_timestamp: null,
        reminder_times: null,
      },
      relationships: {},
    };
    const alert = parseAlert(raw);
    expect(alert).not.toBeNull();
    expect(alert).toEqual({
      id: 'alert-500',
      effect: 'SHUTTLE',
      cause: 'MAINTENANCE',
      header: 'Red Line shuttle buses',
      shortHeader: 'Red Line shuttle',
      serviceEffect: 'Red Line shuttle service',
      timeframe: null,
      banner: null,
      url: null,
      description: 'Shuttle buses replacing Red Line service between Harvard and Alewife.',
      severity: 7,
      lifecycle: 'ONGOING',
      activePeriod: [{ start: '2026-04-06T05:00:00-04:00', end: '2026-04-06T23:00:00-04:00' }],
      informedEntities: [
        {
          routeId: 'Red',
          stopId: 'place-harvd',
          directionId: null,
          routeType: 1,
          activities: ['BOARD', 'EXIT', 'RIDE'],
        },
      ],
      createdAt: '2026-04-06T04:00:00-04:00',
      updatedAt: '2026-04-06T08:00:00-04:00',
    });
  });

  it('falls back through service_effect → short_header → header for display fields', () => {
    const raw = {
      type: 'alert',
      id: 'alert-fallback',
      attributes: {
        effect: 'STATION_ISSUE',
        cause: 'UNKNOWN_CAUSE',
        header: 'Long verbose header about an issue at the station.',
        short_header: '',
        service_effect: '',
        severity: 1,
        lifecycle: 'ONGOING',
        timeframe: null,
        active_period: [],
        informed_entity: [],
        updated_at: '2026-04-06T08:00:00-04:00',
      },
      relationships: {},
    };
    const alert = parseAlert(raw);
    expect(alert).not.toBeNull();
    expect(alert!.header).toBe('Long verbose header about an issue at the station.');
    expect(alert!.shortHeader).toBe('Long verbose header about an issue at the station.');
    expect(alert!.serviceEffect).toBe('Long verbose header about an issue at the station.');
  });

  it('promotes banner alerts regardless of severity', () => {
    const raw = {
      type: 'alert',
      id: 'alert-banner',
      attributes: {
        effect: 'DELAY',
        cause: 'UNKNOWN_CAUSE',
        header: 'Shuttle buses replacing Red Line service.',
        short_header: '',
        service_effect: 'Red Line shuttle',
        banner: 'Shuttle buses between Harvard and Andrew. Seek alternate routes.',
        severity: 3,
        lifecycle: 'NEW',
        timeframe: 'later today',
        active_period: [],
        informed_entity: [],
        updated_at: '2026-04-06T08:00:00-04:00',
      },
      relationships: {},
    };
    const alert = parseAlert(raw);
    expect(alert).not.toBeNull();
    expect(alert!.banner).toContain('Shuttle buses between Harvard');
    expect(alert!.timeframe).toBe('later today');
    expect(alert!.lifecycle).toBe('NEW');
  });

  it('maps unknown lifecycle values to UNKNOWN', () => {
    const raw = {
      type: 'alert',
      id: 'alert-bad-lc',
      attributes: {
        effect: 'DELAY',
        cause: 'UNKNOWN_CAUSE',
        header: 'Something happened',
        severity: 3,
        lifecycle: 'SOMETHING_ELSE',
        active_period: [],
        informed_entity: [],
        updated_at: '2026-04-06T08:00:00-04:00',
      },
      relationships: {},
    };
    const alert = parseAlert(raw);
    expect(alert!.lifecycle).toBe('UNKNOWN');
  });
});

describe('parseVehicle null cases', () => {
  it('returns null when latitude is null', () => {
    const raw = {
      type: 'vehicle',
      id: 'y0000',
      attributes: {
        latitude: null,
        longitude: -71.0565,
        bearing: 0,
        current_status: 'IN_TRANSIT_TO',
        direction_id: 0,
        label: 'test',
        updated_at: '2026-04-06T12:00:00-04:00',
      },
      relationships: {},
    };
    expect(parseVehicle(raw)).toBeNull();
  });

  it('returns null when longitude is undefined', () => {
    const raw = {
      type: 'vehicle',
      id: 'y0001',
      attributes: {
        latitude: 42.3555,
        longitude: undefined,
        bearing: 0,
        current_status: 'IN_TRANSIT_TO',
        direction_id: 0,
        label: 'test',
        updated_at: '2026-04-06T12:00:00-04:00',
      },
      relationships: {},
    };
    expect(parseVehicle(raw as any)).toBeNull();
  });
});

describe('parsePrediction null cases', () => {
  it('returns null when id is missing', () => {
    const raw = {
      type: 'prediction',
      id: '',
      attributes: {
        arrival_time: null,
        departure_time: null,
        direction_id: 0,
        stop_sequence: 1,
        status: null,
      },
      relationships: {},
    };
    expect(parsePrediction(raw)).toBeNull();
  });
});

describe('parseSchedule', () => {
  it('parses a MBTA schedule resource', () => {
    const raw = {
      type: 'schedule',
      id: 'schedule-555',
      attributes: {
        arrival_time: '2026-04-16T22:35:00-04:00',
        departure_time: '2026-04-16T22:35:30-04:00',
        direction_id: 1,
        stop_sequence: 70,
        timepoint: true,
        drop_off_type: 0,
        pickup_type: 0,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: '70075' } },
        trip: { data: { type: 'trip', id: 'trip-777' } },
      },
    };
    const s = parseSchedule(raw);
    expect(s).not.toBeNull();
    expect(s).toEqual({
      id: 'schedule-555',
      routeId: 'Red',
      stopId: '70075',
      directionId: 1,
      arrivalTime: '2026-04-16T22:35:00-04:00',
      departureTime: '2026-04-16T22:35:30-04:00',
      tripId: 'trip-777',
      stopSequence: 70,
    });
  });

  it('keeps terminal rows where only one of arrival/departure is set', () => {
    const raw = {
      type: 'schedule',
      id: 'schedule-terminal',
      attributes: {
        arrival_time: null,
        departure_time: '2026-04-16T22:40:00-04:00',
        direction_id: 0,
        stop_sequence: 1,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: '70061' } },
        trip: { data: { type: 'trip', id: 'trip-888' } },
      },
    };
    const s = parseSchedule(raw);
    expect(s).not.toBeNull();
    expect(s!.arrivalTime).toBeNull();
    expect(s!.departureTime).toBe('2026-04-16T22:40:00-04:00');
  });

  it('returns null when both arrival_time and departure_time are missing', () => {
    const raw = {
      type: 'schedule',
      id: 'schedule-empty',
      attributes: {
        arrival_time: null,
        departure_time: null,
        direction_id: 0,
        stop_sequence: 1,
      },
      relationships: {
        route: { data: { type: 'route', id: 'Red' } },
        stop: { data: { type: 'stop', id: '70075' } },
        trip: { data: { type: 'trip', id: 'trip-none' } },
      },
    };
    expect(parseSchedule(raw)).toBeNull();
  });

  it('returns null when id is missing', () => {
    const raw = {
      type: 'schedule',
      id: '',
      attributes: {
        arrival_time: '2026-04-16T22:35:00-04:00',
        departure_time: null,
        direction_id: 0,
        stop_sequence: 1,
      },
      relationships: {},
    };
    expect(parseSchedule(raw)).toBeNull();
  });
});

describe('parseAlert null cases', () => {
  it('returns null when id is missing', () => {
    const raw = {
      type: 'alert',
      id: '',
      attributes: {
        effect: 'DELAY',
        cause: 'MAINTENANCE',
        header: 'Some alert',
        severity: 3,
        lifecycle: 'ONGOING',
        active_period: [],
        informed_entity: [],
        updated_at: '2026-04-06T08:00:00-04:00',
      },
      relationships: {},
    };
    expect(parseAlert(raw)).toBeNull();
  });

  it('returns null when header AND short_header AND service_effect are all missing', () => {
    const raw = {
      type: 'alert',
      id: 'alert-123',
      attributes: {
        effect: 'DELAY',
        cause: 'MAINTENANCE',
        header: null,
        short_header: null,
        service_effect: null,
        severity: 3,
        lifecycle: 'ONGOING',
        active_period: [],
        informed_entity: [],
        updated_at: '2026-04-06T08:00:00-04:00',
      },
      relationships: {},
    };
    expect(parseAlert(raw)).toBeNull();
  });
});
