import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { StateManager } from './state-manager.js';
import { MbtaStream } from './mbta-stream.js';
import { WsBroadcaster } from './ws-server.js';
import { FacilityPoller } from './facility-poller.js';
import { WeatherPoller } from './weather-poller.js';
import { loadShapes } from './gtfs-loader.js';
import type { Vehicle, Prediction, Alert } from './types.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MBTA_API_KEY = process.env.MBTA_API_KEY ?? '';

if (!MBTA_API_KEY) {
  console.error('MBTA_API_KEY is required. Get one at https://api-v3.mbta.com/');
  process.exit(1);
}

const app = express();
app.use(cors());

const server = createServer(app);
const stateManager = new StateManager();
const wsBroadcaster = new WsBroadcaster(server, stateManager);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', vehicles: stateManager.getState().vehicles.size });
});

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
    const response = await fetch(
      `https://api-v3.mbta.com/stops?filter[route_type]=0,1&api_key=${MBTA_API_KEY}`
    );
    const json = await response.json();
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
});

const mbtaStream = new MbtaStream({
  apiKey: MBTA_API_KEY,
  onVehicleEvent: (event) => {
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
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
