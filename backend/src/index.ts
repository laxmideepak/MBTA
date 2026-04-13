import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { StateManager } from './state-manager.js';
import { MbtaStream } from './mbta-stream.js';
import { WsBroadcaster } from './ws-server.js';
import { FacilityPoller } from './facility-poller.js';
import { WeatherPoller } from './weather-poller.js';
import { withMbtaKey } from './mbta-api-url.js';
import { loadShapes } from './gtfs-loader.js';
import type { Vehicle, Prediction, Alert } from './types.js';

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
    res.status(503).json({ ready: false, reason: !sseConnected ? 'SSE not connected' : 'No vehicle data' });
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
        stateManager.resetVehicles(event.data as Vehicle[]);
        wsBroadcaster.broadcastVehicles({ type: 'reset', vehicles: stateManager.getSnapshot().vehicles });
        break;
      case 'add':
      case 'update':
        stateManager.upsertVehicle(event.data as Vehicle);
        wsBroadcaster.broadcastVehicles({ type: 'upsert', vehicle: event.data });
        break;
      case 'remove':
        stateManager.removeVehicle(event.id);
        wsBroadcaster.broadcastVehicles({ type: 'remove', id: event.id });
        break;
    }
  },
  onPredictionEvent: (event) => {
    lastSseEventTime = Date.now();
    switch (event.type) {
      case 'reset':
        stateManager.resetPredictions(event.data as Prediction[]);
        wsBroadcaster.broadcastPredictions({ type: 'reset', predictions: stateManager.getSnapshot().predictions });
        break;
      case 'add':
      case 'update':
        stateManager.upsertPrediction(event.data as Prediction);
        wsBroadcaster.broadcastPredictions({ type: 'upsert', prediction: event.data });
        break;
      case 'remove':
        stateManager.removePredictionById(event.id);
        wsBroadcaster.broadcastPredictions({ type: 'reset', predictions: stateManager.getSnapshot().predictions });
        break;
    }
  },
  onAlertEvent: (event) => {
    lastSseEventTime = Date.now();
    switch (event.type) {
      case 'reset':
        stateManager.resetAlerts(event.data as Alert[]);
        wsBroadcaster.broadcastAlerts({ type: 'reset', alerts: stateManager.getSnapshot().alerts });
        break;
      case 'add':
      case 'update':
        stateManager.upsertAlert(event.data as Alert);
        wsBroadcaster.broadcastAlerts({ type: 'upsert', alert: event.data });
        break;
      case 'remove':
        stateManager.removeAlert(event.id);
        wsBroadcaster.broadcastAlerts({ type: 'remove', id: event.id });
        break;
    }
  },
  onError: (source, error) => {
    console.error(`[MBTA SSE ${source}] Error:`, error);
  },
});

const facilityPoller = new FacilityPoller({
  apiKey: MBTA_API_KEY,
  onFacilities: (facilities) => {
    stateManager.setFacilities(facilities);
    wsBroadcaster.broadcastFacilities({ facilities: stateManager.getSnapshot().facilities });
  },
  onStatuses: (statuses) => {
    stateManager.setFacilityStatuses(statuses);
    wsBroadcaster.broadcastFacilities({ facilities: stateManager.getSnapshot().facilities });
  },
  onError: (err) => console.error('[Facility Poller] Error:', err),
});

const weatherPoller = new WeatherPoller({
  onWeather: (weather) => {
    stateManager.setWeather(weather);
    wsBroadcaster.broadcastWeather({ weather });
  },
  onError: (err) => console.error('[Weather Poller] Error:', err),
});

async function start() {
  console.log('Loading GTFS shapes...');
  shapesCache = await loadShapes(MBTA_API_KEY);
  console.log(`Loaded shapes for ${shapesCache.size} routes`);

  mbtaStream.start();
  console.log('MBTA SSE streams connected');

  facilityPoller.start(60_000);
  console.log('Facility poller started (60s interval)');

  weatherPoller.start(900_000);
  console.log('Weather poller started (15min interval)');

  server.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  });

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    mbtaStream.stop();
    facilityPoller.stop();
    weatherPoller.stop();
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
