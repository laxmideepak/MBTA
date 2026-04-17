import 'dotenv/config';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Coalescer } from './coalescer.js';
import { loadShapes } from './gtfs-loader.js';
import { withMbtaKey } from './mbta-api-url.js';
import { parseSchedule } from './mbta-parser.js';
import { MbtaStream } from './mbta-stream.js';
import { ReferenceData } from './reference-data.js';
import { StateManager } from './state-manager.js';
import type { Alert, MbtaResource, Prediction, ScheduledDeparture, Vehicle } from './types.js';
import { WsBroadcaster } from './ws-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MBTA_API_KEY = process.env.MBTA_API_KEY ?? '';

if (!MBTA_API_KEY) {
  console.warn(
    'MBTA_API_KEY is not set; using unauthenticated API access (lower rate limits). Get a key at https://api-v3.mbta.com/',
  );
}

const app = express();
app.use(cors());

if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(staticPath));
}

const server = createServer(app);
const stateManager = new StateManager();
const wsBroadcaster = new WsBroadcaster(server, stateManager);
const coalescer = new Coalescer(stateManager, wsBroadcaster);
const referenceData = new ReferenceData({ apiKey: MBTA_API_KEY });

const startTime = Date.now();
let lastSseEventTime = 0;

app.get('/health', (_req, res) => {
  const sseAge = lastSseEventTime ? Math.floor((Date.now() - lastSseEventTime) / 1000) : -1;
  const status = sseAge > 300 ? 'unhealthy' : sseAge > 120 ? 'degraded' : 'ok';
  res.json({
    status,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    vehicles: stateManager.getState().vehicles.size,
    alerts: stateManager.getState().alerts.length,
    lastSseEventAge: sseAge,
    memoryUsage: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

app.get('/ready', (_req, res) => {
  const hasVehicles = stateManager.getState().vehicles.size > 0;
  const sseConnected = lastSseEventTime > 0;
  if (hasVehicles && sseConnected) {
    res.json({ ready: true });
  } else {
    res
      .status(503)
      .json({ ready: false, reason: !sseConnected ? 'SSE not connected' : 'No vehicle data' });
  }
});

let stopsCache: { data: any; expiry: number } | null = null;
const STOPS_CACHE_TTL = 5 * 60 * 1000;

let shapesCache: Awaited<ReturnType<typeof loadShapes>> | null = null;

app.get('/api/shapes', async (_req, res) => {
  if (!shapesCache) {
    shapesCache = await loadShapes(MBTA_API_KEY);
  }
  const result: Record<string, { shapeId: string; coordinates: [number, number][] }[]> = {};
  for (const [routeId, shapes] of shapesCache) {
    result[routeId] = shapes.map((s) => ({ shapeId: s.shapeId, coordinates: s.coordinates }));
  }
  res.json(result);
});

app.get('/api/stops', async (_req, res) => {
  try {
    if (stopsCache && Date.now() < stopsCache.expiry) {
      return res.json(stopsCache.data);
    }
    const response = await fetch(
      withMbtaKey('https://api-v3.mbta.com/stops?filter[route_type]=0,1', MBTA_API_KEY),
    );
    const json = await response.json();
    stopsCache = { data: json, expiry: Date.now() + STOPS_CACHE_TTL };
    res.json(json);
  } catch (err) {
    console.error('[/api/stops] Error:', err);
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
});

// Proxy to MBTA V3 /schedules. Stations can be parent ("place-pktrm") or
// platform ("70075") IDs; MBTA fans parent IDs out to all platforms. We cache
// briefly so repeated board refreshes don't hammer the API — published
// schedules only change day-to-day.
const schedulesCache = new Map<
  string,
  { data: { schedules: ScheduledDeparture[] }; expiry: number }
>();
const SCHEDULES_CACHE_TTL = 60_000;
const SCHEDULES_CACHE_MAX = 500;

/**
 * MBTA `/schedules` filter[min_time] expects HH:MM in Boston-local time
 * on the current service day. We push the cutoff back by a small grace
 * window so "just departed" rows still appear at the top of the board.
 * Returns null if we can't format (fall back to no min_time).
 */
function mbtaBostonMinTime(now: Date = new Date(), graceMinutes = 5): string | null {
  try {
    const shifted = new Date(now.getTime() - graceMinutes * 60_000);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(shifted);
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hh === '24' ? '00' : hh}:${mm}`;
  } catch {
    return null;
  }
}

app.get('/api/schedules', async (req, res) => {
  const stopParam = String(req.query.stop ?? '').trim();
  if (!stopParam) {
    return res.status(400).json({ error: 'stop query param is required' });
  }
  const stops = Array.from(
    new Set(
      stopParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).sort();
  if (stops.length === 0) {
    return res.status(400).json({ error: 'stop query param is required' });
  }
  const key = stops.join(',');
  const now = Date.now();
  const cached = schedulesCache.get(key);
  if (cached && now < cached.expiry) {
    return res.json(cached.data);
  }
  try {
    // Server-side filter[min_time] keeps payloads small — a busy stop like
    // Park Street has 400+ schedules/day, only the next hour's worth matter.
    const minTime = mbtaBostonMinTime();
    const minTimeParam = minTime ? `&filter[min_time]=${encodeURIComponent(minTime)}` : '';
    const url = `https://api-v3.mbta.com/schedules?filter[stop]=${encodeURIComponent(key)}${minTimeParam}&sort=arrival_time&page[limit]=60`;
    const response = await fetch(withMbtaKey(url, MBTA_API_KEY));
    if (!response.ok) {
      throw new Error(`MBTA schedules ${response.status} ${response.statusText}`);
    }
    const json = (await response.json()) as { data?: MbtaResource[] };
    const parsed: ScheduledDeparture[] = (json.data ?? [])
      .map(parseSchedule)
      .filter((s): s is ScheduledDeparture => s !== null);
    const body = { schedules: parsed };
    schedulesCache.set(key, { data: body, expiry: now + SCHEDULES_CACHE_TTL });
    if (schedulesCache.size > SCHEDULES_CACHE_MAX) {
      for (const [k, v] of schedulesCache) {
        if (now > v.expiry) schedulesCache.delete(k);
        if (schedulesCache.size <= SCHEDULES_CACHE_MAX / 2) break;
      }
    }
    res.json(body);
  } catch (err) {
    console.error('[/api/schedules] Error:', err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

const mbtaStream = new MbtaStream({
  apiKey: MBTA_API_KEY,
  onVehicleEvent: (event) => {
    lastSseEventTime = Date.now();
    switch (event.type) {
      case 'reset':
        coalescer.resetVehicles(event.data as Vehicle[]);
        break;
      case 'add':
      case 'update':
        coalescer.upsertVehicle(event.data as Vehicle);
        break;
      case 'remove':
        coalescer.removeVehicle(event.id);
        break;
    }
  },
  onPredictionEvent: (event) => {
    lastSseEventTime = Date.now();
    switch (event.type) {
      case 'reset':
        coalescer.resetPredictions(event.data as Prediction[]);
        break;
      case 'add':
      case 'update':
        coalescer.upsertPrediction(event.data as Prediction);
        break;
      case 'remove':
        coalescer.removePrediction(event.id);
        break;
    }
  },
  onAlertEvent: (event) => {
    lastSseEventTime = Date.now();
    switch (event.type) {
      case 'reset':
        coalescer.resetAlerts(event.data as Alert[]);
        break;
      case 'add':
      case 'update':
        coalescer.upsertAlert(event.data as Alert);
        break;
      case 'remove':
        coalescer.removeAlert(event.id);
        break;
    }
  },
  onError: (source, error) => {
    console.error(`[MBTA SSE ${source}] Error:`, error);
  },
});

async function start() {
  console.log('Loading GTFS shapes...');
  shapesCache = await loadShapes(MBTA_API_KEY);
  console.log(`Loaded shapes for ${shapesCache.size} routes`);

  console.log('Loading reference data (routes/stops/trips)...');
  await referenceData.refreshNow();
  referenceData.startDailyRefresh();
  console.log('Reference data loaded');

  mbtaStream.start();
  console.log('MBTA SSE streams connected');

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    mbtaStream.stop();
    referenceData.close();
    coalescer.close();
    wsBroadcaster.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    // Force exit after 5 seconds if graceful shutdown fails
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
