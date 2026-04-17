import { withMbtaKey } from './mbta-api-url.js';
import type { MbtaResource } from './types.js';

export type RouteType = 0 | 1;

export interface RouteRef {
  id: string;
  type: RouteType;
  color: string | null;
  textColor: string | null;
  longName: string | null;
  shortName: string | null;
}

export interface StopRef {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  parentStationId: string | null;
  wheelchairBoarding: number | null;
}

export interface TripRef {
  id: string;
  routeId: string | null;
  directionId: number | null;
  headsign: string | null;
}

export interface ReferenceDataSnapshot {
  routes: Map<string, RouteRef>;
  stops: Map<string, StopRef>;
  trips: Map<string, TripRef>;
  fetchedAt: number;
}

export interface ReferenceDataOptions {
  apiKey: string;
  now?: () => number;
  fetchFn?: typeof fetch;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}

const SUBWAY_ROUTE_TYPES: RouteType[] = [0, 1];

function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readRouteType(v: unknown): RouteType | null {
  if (v === 0 || v === 1) return v;
  return null;
}

function bostonParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => Number.parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function msUntilNextBostonHour(nowMs: number, targetHour: number): number {
  const now = new Date(nowMs);
  const p = bostonParts(now);
  const targetDay = p.hour < targetHour ? p.day : p.day + 1;
  const targetBoston = new Date(
    `${p.year}-${String(p.month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(targetHour).padStart(2, '0')}:00:00`,
  );
  const targetParts = bostonParts(targetBoston);
  // Construct a Date that represents the Boston-local target in the *local* TZ,
  // then compute delta via parts (stable across host TZ).
  const localTarget = new Date(
    Date.UTC(
      targetParts.year,
      targetParts.month - 1,
      targetParts.day,
      targetParts.hour,
      targetParts.minute,
      targetParts.second,
    ),
  );
  const localNow = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  const delta = localTarget.getTime() - localNow.getTime();
  return delta > 0 ? delta : 0;
}

async function fetchAllPages(url: string, fetchFn: typeof fetch): Promise<MbtaResource[]> {
  const out: MbtaResource[] = [];
  let nextUrl: string | null = url;
  // MBTA JSON:API pagination uses links.next.
  while (nextUrl) {
    const res = await fetchFn(nextUrl);
    if (!res.ok) throw new Error(`MBTA fetch ${res.status} ${res.statusText}`);
    const json = (await res.json()) as {
      data?: MbtaResource[];
      links?: { next?: string | null };
    };
    for (const r of json.data ?? []) out.push(r);
    nextUrl = json.links?.next ?? null;
  }
  return out;
}

export function parseRoutes(resources: MbtaResource[]): Map<string, RouteRef> {
  const routes = new Map<string, RouteRef>();
  for (const r of resources) {
    const routeType = readRouteType(r.attributes?.route_type);
    if (routeType === null) continue;
    if (!SUBWAY_ROUTE_TYPES.includes(routeType)) continue;
    const color = readString(r.attributes?.color);
    const textColor = readString(r.attributes?.text_color);
    const longName = readString(r.attributes?.long_name);
    const shortName = readString(r.attributes?.short_name);
    routes.set(r.id, {
      id: r.id,
      type: routeType,
      color,
      textColor,
      longName,
      shortName,
    });
  }
  return routes;
}

export function parseStops(resources: MbtaResource[]): Map<string, StopRef> {
  const stops = new Map<string, StopRef>();
  for (const r of resources) {
    const name = readString(r.attributes?.name);
    if (!name) continue;
    const latitude = readNumber(r.attributes?.latitude);
    const longitude = readNumber(r.attributes?.longitude);
    const wheelchairBoarding = readNumber(r.attributes?.wheelchair_boarding);
    const parentStationId = readString(r.attributes?.parent_station);
    stops.set(r.id, {
      id: r.id,
      name,
      latitude,
      longitude,
      parentStationId,
      wheelchairBoarding,
    });
  }
  return stops;
}

export function parseTrips(resources: MbtaResource[]): Map<string, TripRef> {
  const trips = new Map<string, TripRef>();
  for (const r of resources) {
    const directionId = readNumber(r.attributes?.direction_id);
    const headsign = readString(r.attributes?.headsign);
    const routeRel = r.relationships?.route?.data;
    const routeId = routeRel && routeRel.type === 'route' ? routeRel.id : null;
    trips.set(r.id, {
      id: r.id,
      routeId,
      directionId,
      headsign,
    });
  }
  return trips;
}

/**
 * Holds MBTA reference data (routes/stops/trips) in memory and refreshes it
 * once per day at 3AM Boston time. Data is fetched from MBTA's v3 JSON:API and
 * is intended for server-side enrichment of the live SSE streams.
 */
export class ReferenceData {
  private apiKey: string;
  private now: () => number;
  private fetchFn: typeof fetch;
  private setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;

  private snapshot: ReferenceDataSnapshot | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ReferenceDataOptions) {
    this.apiKey = opts.apiKey;
    this.now = opts.now ?? Date.now;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((id) => clearTimeout(id));
  }

  /** Latest successfully fetched reference snapshot, or null until first load completes. */
  getSnapshot(): ReferenceDataSnapshot | null {
    return this.snapshot;
  }

  /** Fetch routes, stops, and trips and replace the in-memory snapshot. */
  async refreshNow(): Promise<ReferenceDataSnapshot> {
    const fetchedAt = this.now();

    const routeTypeFilter = SUBWAY_ROUTE_TYPES.join(',');
    const routesUrl = withMbtaKey(
      `https://api-v3.mbta.com/routes?filter[type]=${encodeURIComponent(routeTypeFilter)}&page[limit]=10000`,
      this.apiKey,
    );
    const stopsUrl = withMbtaKey(
      `https://api-v3.mbta.com/stops?filter[route_type]=${encodeURIComponent(routeTypeFilter)}&page[limit]=10000`,
      this.apiKey,
    );
    const tripsUrl = withMbtaKey(
      `https://api-v3.mbta.com/trips?filter[route_type]=${encodeURIComponent(routeTypeFilter)}&page[limit]=10000`,
      this.apiKey,
    );

    const [routesRaw, stopsRaw, tripsRaw] = await Promise.all([
      fetchAllPages(routesUrl, this.fetchFn),
      fetchAllPages(stopsUrl, this.fetchFn),
      fetchAllPages(tripsUrl, this.fetchFn),
    ]);

    const next: ReferenceDataSnapshot = {
      routes: parseRoutes(routesRaw),
      stops: parseStops(stopsRaw),
      trips: parseTrips(tripsRaw),
      fetchedAt,
    };
    this.snapshot = next;
    return next;
  }

  /** Start the daily 3AM Boston refresh loop (does not force an immediate refresh). */
  startDailyRefresh(): void {
    if (this.refreshTimer) return;
    const scheduleNext = () => {
      const delay = msUntilNextBostonHour(this.now(), 3);
      this.refreshTimer = this.setTimeoutFn(async () => {
        this.refreshTimer = null;
        try {
          await this.refreshNow();
        } catch (err) {
          console.warn('[reference-data] refresh failed:', err);
        } finally {
          scheduleNext();
        }
      }, delay);
    };
    scheduleNext();
  }

  /** Stop the daily refresh loop. */
  close(): void {
    if (this.refreshTimer) {
      this.clearTimeoutFn(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
