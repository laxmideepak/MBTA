import type { Vehicle, Prediction, Alert, Facility, MbtaResource } from './types.js';

export function parseVehicle(resource: MbtaResource): Vehicle {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};
  return {
    id: resource.id,
    routeId: rels.route?.data?.id ?? '',
    latitude: attrs.latitude as number,
    longitude: attrs.longitude as number,
    bearing: (attrs.bearing as number) ?? 0,
    currentStatus: attrs.current_status as Vehicle['currentStatus'],
    stopId: rels.stop?.data?.id ?? '',
    directionId: attrs.direction_id as number,
    label: (attrs.label as string) ?? '',
    updatedAt: attrs.updated_at as string,
  };
}

export function parsePrediction(resource: MbtaResource): Prediction {
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

export function parseAlert(resource: MbtaResource): Alert {
  const attrs = resource.attributes;
  const rawEntities = (attrs.informed_entity as Array<Record<string, unknown>>) ?? [];
  return {
    id: resource.id,
    effect: attrs.effect as string,
    cause: attrs.cause as string,
    header: attrs.header as string,
    description: (attrs.description as string) ?? '',
    severity: attrs.severity as number,
    lifecycle: attrs.lifecycle as string,
    activePeriod: (attrs.active_period as Alert['activePeriod']) ?? [],
    informedEntities: rawEntities.map((e) => ({
      routeId: (e.route as string) ?? null,
      stopId: (e.stop as string) ?? null,
      directionId: (e.direction_id as number) ?? null,
      routeType: (e.route_type as number) ?? null,
      activities: (e.activities as string[]) ?? [],
    })),
    updatedAt: attrs.updated_at as string,
  };
}

export function parseFacility(resource: MbtaResource): Facility {
  const attrs = resource.attributes;
  const rels = resource.relationships ?? {};
  return {
    id: resource.id,
    longName: attrs.long_name as string,
    shortName: attrs.short_name as string,
    type: attrs.type as Facility['type'],
    stopId: rels.stop?.data?.id ?? '',
    latitude: (attrs.latitude as number) ?? null,
    longitude: (attrs.longitude as number) ?? null,
  };
}
