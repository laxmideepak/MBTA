export interface Vehicle {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing: number;
  currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string;
  directionId: number;
  label: string;
  updatedAt: string;
}

export interface Prediction {
  id: string;
  routeId: string;
  stopId: string;
  directionId: number;
  arrivalTime: string | null;
  departureTime: string | null;
  status: string | null;
  tripId: string;
  vehicleId: string | null;
  stopSequence: number;
}

export interface Alert {
  id: string;
  effect: string;
  cause: string;
  header: string;
  description: string;
  severity: number;
  lifecycle: string;
  activePeriod: { start: string; end: string | null }[];
  informedEntities: {
    routeId: string | null;
    stopId: string | null;
    directionId: number | null;
    routeType: number | null;
    activities: string[];
  }[];
  updatedAt: string;
}

export interface Facility {
  id: string;
  longName: string;
  shortName: string;
  type: 'ELEVATOR' | 'ESCALATOR';
  stopId: string;
  latitude: number | null;
  longitude: number | null;
}

export interface FacilityStatus {
  facilityId: string;
  status: 'WORKING' | 'OUT_OF_ORDER';
  updatedAt: string;
}

export interface Weather {
  temperature: number;
  condition: string;
  icon: string;
}

export interface SystemState {
  vehicles: Map<string, Vehicle>;
  predictions: Map<string, Prediction[]>;
  alerts: Alert[];
  facilities: Map<string, Facility>;
  facilityStatuses: Map<string, FacilityStatus>;
  weather: Weather | null;
}

export type WsMessageType =
  | 'full-state'
  | 'vehicles-update'
  | 'predictions-update'
  | 'alerts-update'
  | 'facilities-update'
  | 'weather-update';

export interface WsMessage {
  type: WsMessageType;
  data: unknown;
  timestamp: number;
}

export interface MbtaJsonApiResponse {
  data: MbtaResource | MbtaResource[];
  included?: MbtaResource[];
}

export interface MbtaResource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { type: string; id: string } | null }>;
}

export interface MbtaSseEvent {
  event: 'reset' | 'add' | 'update' | 'remove';
  data: MbtaJsonApiResponse;
}
