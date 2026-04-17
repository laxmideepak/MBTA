import { useCallback } from 'react';
import { useSystemStore } from '../store/systemStore';
import type { WsMessage } from '../types';
import { useWebSocket } from './useWebSocket';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

/**
 * React hook that drives the backend WebSocket connection and dispatches
 * every message into the Zustand `useSystemStore`. Returns the full
 * snapshot for components that want all three slices at once (App.tsx);
 * components that only need one slice can subscribe to `useSystemStore`
 * directly for finer-grained re-render control.
 */
export function useSystemState() {
  const onMessage = useCallback((msg: WsMessage) => {
    useSystemStore.getState().handleWsMessage(msg);
  }, []);

  const { connected } = useWebSocket({ url: WS_URL, onMessage });

  const vehicles = useSystemStore((s) => s.vehicles);
  const predictions = useSystemStore((s) => s.predictions);
  const alerts = useSystemStore((s) => s.alerts);
  const lastMessageTime = useSystemStore((s) => s.lastMessageTime);

  return { vehicles, predictions, alerts, connected, lastMessageTime };
}
