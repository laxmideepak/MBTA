export interface Vehicle {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing: number;
  currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string;
  /** MBTA `current_stop_sequence` — position of the vehicle in its trip. */
  currentStopSequence: number | null;
  directionId: number;
  label: string;
  /** MBTA `trip` relationship id. Required to look up this vehicle's
   *  remaining-stops sequence in `predictions` by `tripId`. */
  tripId: string;
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

/**
 * Scheduled (published-timetable) departure from MBTA V3 `/schedules`.
 * No live prediction — use to fill in the board when predictions are
 * sparse (late night, low-traffic stops) or to show later trips.
 */
export interface ScheduledDeparture {
  id: string;
  routeId: string;
  stopId: string;
  directionId: number;
  arrivalTime: string | null;
  departureTime: string | null;
  tripId: string;
  stopSequence: number;
}

/**
 * MBTA alert lifecycle. V3 API string values mirror the v2 doc:
 *   NEW              — happening now, relatively new information
 *   ONGOING          — active and has been for a while
 *   UPCOMING         — will happen in future
 *   ONGOING_UPCOMING — both (repeating alert currently active)
 *   CLOSED           — ended (we drop these upstream)
 */
export type AlertLifecycle =
  | 'NEW'
  | 'ONGOING'
  | 'UPCOMING'
  | 'ONGOING_UPCOMING'
  | 'CLOSED'
  | 'UNKNOWN';

export interface Alert {
  id: string;
  effect: string;
  cause: string;
  /** Long-form header (300+ chars). Keep for detail view only. */
  header: string;
  /** 140-char curated summary (v3 short_header). */
  shortHeader: string;
  /** Very short summary, e.g. "Green Line B shuttle". Primary banner label. */
  serviceEffect: string;
  /** Human-readable effective period, e.g. "Starting Wednesday". */
  timeframe: string | null;
  /**
   * When populated, MBTA explicitly marks this alert as "front-and-center".
   * Outranks severity for banner pinning.
   */
  banner: string | null;
  description: string;
  severity: number;
  lifecycle: AlertLifecycle;
  /** Deep link to mbta.com for full details. */
  url: string | null;
  activePeriod: { start: string; end: string | null }[];
  informedEntities: {
    routeId: string | null;
    stopId: string | null;
    directionId: number | null;
    routeType: number | null;
    activities: string[];
  }[];
  createdAt: string | null;
  updatedAt: string;
}

export interface SystemState {
  vehicles: Map<string, Vehicle>;
  predictions: Map<string, Prediction[]>;
  alerts: Alert[];
}

export type WsMessageType =
  | 'full-state'
  | 'vehicles-update'
  | 'predictions-update'
  | 'alerts-update';

export interface WsMessage {
  type: WsMessageType;
  data: unknown;
  timestamp: number;
}

export interface MbtaResource {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
  relationships?: Record<string, { data: { type: string; id: string } | null }>;
}
