import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { StateManager } from './state-manager.js';
import type { WsMessage } from './types.js';

// `ws` doesn't expose a liveness flag, so we attach our own. Keeping the
// augmentation local (vs. `(ws as any)`) makes the heartbeat read like plain
// typed code and prevents accidental drift elsewhere.
type LiveWebSocket = WebSocket & { isAlive: boolean };

/** Application-level tick so clients can refresh `lastMessageTime` when MBTA is quiet. */
const HEARTBEAT_INTERVAL_MS = 10_000;

export class WsBroadcaster {
  private wss: WebSocketServer;
  private stateManager: StateManager;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(server: Server, stateManager: StateManager) {
    this.stateManager = stateManager;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (raw: WebSocket) => {
      const ws = raw as LiveWebSocket;
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      const snapshot = this.stateManager.getSnapshot();
      const msg: WsMessage = {
        type: 'full-state',
        data: snapshot,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(msg));
    });

    this.pingIntervalId = setInterval(() => {
      for (const client of this.wss.clients) {
        const ws = client as LiveWebSocket;
        if (ws.isAlive === false) {
          try {
            ws.terminate();
          } catch {}
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {}
      }
    }, 25_000);

    this.heartbeatIntervalId = setInterval(() => {
      this.broadcast({ type: 'heartbeat', data: null, timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
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

  broadcastDelta(delta: unknown): void {
    this.broadcast({ type: 'delta', data: delta, timestamp: Date.now() });
  }

  close(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    this.wss.close();
  }
}
