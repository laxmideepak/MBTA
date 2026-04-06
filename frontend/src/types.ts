export interface Vehicle {
  id: string; routeId: string; latitude: number; longitude: number;
  bearing: number; currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string; directionId: number; label: string; updatedAt: string;
}

export interface Prediction {
  id: string; routeId: string; stopId: string; directionId: number;
  arrivalTime: string | null; departureTime: string | null;
  status: string | null; tripId: string; vehicleId: string | null; stopSequence: number;
}

export interface Alert {
  id: string; effect: string; cause: string; header: string; description: string;
  severity: number; lifecycle: string;
  activePeriod: { start: string; end: string | null }[];
  informedEntities: {
    routeId: string | null; stopId: string | null; directionId: number | null;
    routeType: number | null; activities: string[];
  }[];
  updatedAt: string;
}

export interface FacilityWithStatus {
  facility: {
    id: string; longName: string; shortName: string;
    type: 'ELEVATOR' | 'ESCALATOR'; stopId: string;
    latitude: number | null; longitude: number | null;
  };
  status: { facilityId: string; status: 'WORKING' | 'OUT_OF_ORDER'; updatedAt: string } | undefined;
}

export interface Weather { temperature: number; condition: string; icon: string; }

export interface SystemSnapshot {
  vehicles: Vehicle[]; predictions: Record<string, Prediction[]>;
  alerts: Alert[]; facilities: FacilityWithStatus[]; weather: Weather | null;
}

export type WsMessageType = 'full-state' | 'vehicles-update' | 'predictions-update' | 'alerts-update' | 'facilities-update' | 'weather-update';
export interface WsMessage { type: WsMessageType; data: any; timestamp: number; }
export type ViewMode = 'map' | 'boards';

export interface RouteShape { shapeId: string; coordinates: [number, number][]; }
export interface Stop {
  id: string; name: string; latitude: number; longitude: number;
  wheelchairBoarding: number; routeIds: string[];
}
