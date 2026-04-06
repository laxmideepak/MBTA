import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  onMessage: (message: WsMessage) => void;
  reconnectInterval?: number;
}

export function useWebSocket({ url, onMessage, reconnectInterval = 3000 }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      try { const msg: WsMessage = JSON.parse(event.data); onMessageRef.current(msg); } catch {}
    };
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => { if (wsRef.current === ws) connect(); }, reconnectInterval);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [url, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => { const ws = wsRef.current; wsRef.current = null; ws?.close(); };
  }, [connect]);

  return { connected };
}
