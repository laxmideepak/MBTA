export interface Vehicle {
  id: string;
  routeId: string;
  latitude: number;
  longitude: number;
  bearing: number;
  currentStatus: 'IN_TRANSIT_TO' | 'STOPPED_AT' | 'INCOMING_AT';
  stopId: string;
  currentStopSequence: number | null;
  directionId: number;
  label: string;
  tripId: string;
  updatedAt: string;
  routeColor?: string | null;
  currentStopName?: string | null;
  destination?: string | null;
  delayed?: boolean;
  nextStops?: NextStop[];
  /**
   * Server-recorded "just departed" hint — the stop the train was last
   * STOPPED_AT, plus the server-clock timestamp of that departure. Used by
   * the tooltip's station-to-station progress bar. Null when the server
   * hasn't observed a full STOP→TRANSIT cycle for this vehicle yet.
   */
  lastDepartedStopId?: string | null;
  lastDepartedAt?: number | null; // epoch ms, server-origin
}

export interface NextStop {
  stopId: string;
  stopName: string;
  etaSec: number;
  status: string | null;
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
 * Published (timetable) departure from mbta.com/schedules. No live prediction
 * — arrival/departure times are the schedule MBTA publishes day-of. Used to
 * fill out the board when live predictions are sparse.
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
  /** Verbose human header. Use only in expanded / detail contexts. */
  header: string;
  /** 140-char MBTA-curated summary (v3 short_header). */
  shortHeader: string;
  /** Tiny curated label, e.g. "Green Line B shuttle". Primary banner text. */
  serviceEffect: string;
  /** Human time hint, e.g. "Starting Wednesday" / "later today". */
  timeframe: string | null;
  /** When populated, MBTA marks this alert as front-and-center. */
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

export interface SystemSnapshot {
  vehicles: Vehicle[];
  predictions: Record<string, Prediction[]>;
  alerts: Alert[];
}

type WsMessageType =
  | 'full-state'
  | 'vehicles-update'
  | 'predictions-update'
  | 'alerts-update'
  | 'delta'
  | 'heartbeat';
export interface WsMessage {
  type: WsMessageType;
  data: any;
  timestamp: number;
}
export type ViewMode = 'map' | 'boards';

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  wheelchairBoarding: number;
  routeIds: string[];
}
