import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WsMessage } from './types.js';
import type { StateManager } from './state-manager.js';

export class WsBroadcaster {
  private wss: WebSocketServer;
  private stateManager: StateManager;

  constructor(server: Server, stateManager: StateManager) {
    this.stateManager = stateManager;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      const snapshot = this.stateManager.getSnapshot();
      const msg: WsMessage = {
        type: 'full-state',
        data: snapshot,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(msg));
    });
  }

  broadcast(message: WsMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  broadcastVehicles(vehicles: unknown): void {
    this.broadcast({ type: 'vehicles-update', data: vehicles, timestamp: Date.now() });
  }

  broadcastPredictions(predictions: unknown): void {
    this.broadcast({ type: 'predictions-update', data: predictions, timestamp: Date.now() });
  }

  broadcastAlerts(alerts: unknown): void {
    this.broadcast({ type: 'alerts-update', data: alerts, timestamp: Date.now() });
  }

  broadcastFacilities(facilities: unknown): void {
    this.broadcast({ type: 'facilities-update', data: facilities, timestamp: Date.now() });
  }

  broadcastWeather(weather: unknown): void {
    this.broadcast({ type: 'weather-update', data: weather, timestamp: Date.now() });
  }
}
