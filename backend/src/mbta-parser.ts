import type { Alert, MbtaResource, Prediction, ScheduledDeparture, Vehicle } from './types.js';

export function parseVehicle(resource: MbtaResource): Vehicle | null {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};

  const latitude = attrs.latitude as number;
  const longitude = attrs.longitude as number;
  if (latitude == null || longitude == null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  const rawStopSequence = attrs.current_stop_sequence;
  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    latitude,
    longitude,
    bearing: (attrs.bearing as number) ?? 0,
    currentStatus: (attrs.current_status as Vehicle['currentStatus']) ?? 'IN_TRANSIT_TO',
    stopId: rels.stop?.data?.id ?? '',
    currentStopSequence: typeof rawStopSequence === 'number' ? rawStopSequence : null,
    directionId: (attrs.direction_id as number) ?? 0,
    label: (attrs.label as string) ?? '',
    tripId: rels.trip?.data?.id ?? '',
    updatedAt: (attrs.updated_at as string) ?? '',
  };
}

export function parsePrediction(resource: MbtaResource): Prediction | null {
  if (!resource.id) {
    return null;
  }
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};
  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    stopId: rels.stop?.data?.id ?? '',
    directionId: attrs.direction_id as number,
    arrivalTime: (attrs.arrival_time as string) ?? null,
    departureTime: (attrs.departure_time as string) ?? null,
    status: (attrs.status as string) ?? null,
    tripId: rels.trip?.data?.id ?? '',
    vehicleId: rels.vehicle?.data?.id ?? null,
    stopSequence: attrs.stop_sequence as number,
  };
}

export function parseSchedule(resource: MbtaResource): ScheduledDeparture | null {
  if (!resource.id) {
    return null;
  }
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};
  const arrivalTime = (attrs.arrival_time as string) ?? null;
  const departureTime = (attrs.departure_time as string) ?? null;
  // Terminals that are "arrive only" lack departure_time and vice versa.
  // If both are null there's nothing to show, drop.
  if (!arrivalTime && !departureTime) {
    return null;
  }
  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    stopId: rels.stop?.data?.id ?? '',
    directionId: attrs.direction_id as number,
    arrivalTime,
    departureTime,
    tripId: rels.trip?.data?.id ?? '',
    stopSequence: attrs.stop_sequence as number,
  };
}

// V3 API returns "" for optional string fields where the old v2 doc said
// "no more empty strings". Normalize consistently: "" / missing → null for
// everything optional; required text falls back to the best available field.
function orNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const LIFECYCLE_VALUES = new Set(['NEW', 'ONGOING', 'UPCOMING', 'ONGOING_UPCOMING', 'CLOSED']);

export function parseAlert(resource: MbtaResource): Alert | null {
  if (!resource.id) {
    return null;
  }
  const attrs = resource.attributes;
  const header = orNull(attrs.header);
  const shortHeader = orNull(attrs.short_header);
  const serviceEffect = orNull(attrs.service_effect);
  // If MBTA has nothing at all to show, skip.
  if (!header && !shortHeader && !serviceEffect) {
    return null;
  }
  const rawLifecycle = orNull(attrs.lifecycle);
  const lifecycle: Alert['lifecycle'] =
    rawLifecycle && LIFECYCLE_VALUES.has(rawLifecycle)
      ? (rawLifecycle as Alert['lifecycle'])
      : 'UNKNOWN';
  const rawEntities = (attrs.informed_entity as Array<Record<string, unknown>>) ?? [];
  return {
    id: resource.id,
    effect: orNull(attrs.effect) ?? 'UNKNOWN_EFFECT',
    cause: orNull(attrs.cause) ?? 'UNKNOWN_CAUSE',
    header: header ?? shortHeader ?? serviceEffect ?? '',
    shortHeader: shortHeader ?? serviceEffect ?? header ?? '',
    serviceEffect: serviceEffect ?? shortHeader ?? header ?? '',
    timeframe: orNull(attrs.timeframe),
    banner: orNull(attrs.banner),
    description: orNull(attrs.description) ?? '',
    severity: typeof attrs.severity === 'number' ? attrs.severity : 0,
    lifecycle,
    url: orNull(attrs.url),
    activePeriod: (attrs.active_period as Alert['activePeriod']) ?? [],
    informedEntities: rawEntities.map((e) => ({
      routeId: (e.route as string) ?? null,
      stopId: (e.stop as string) ?? null,
      directionId: (e.direction_id as number) ?? null,
      routeType: (e.route_type as number) ?? null,
      activities: (e.activities as string[]) ?? [],
    })),
    createdAt: orNull(attrs.created_at),
    updatedAt: (attrs.updated_at as string) ?? new Date().toISOString(),
  };
}
