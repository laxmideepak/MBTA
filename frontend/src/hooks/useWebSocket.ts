import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  onMessage: (message: WsMessage) => void;
}

export function useWebSocket({ url, onMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    ws.onopen = () => { setConnected(true); attemptRef.current = 0; };
    ws.onmessage = (event) => {
      try { const msg: WsMessage = JSON.parse(event.data); onMessageRef.current(msg); } catch {}
    };
    ws.onclose = () => {
      setConnected(false);
      const backoff = Math.min(1000 * Math.pow(2, attemptRef.current), 30000);
      attemptRef.current++;
      setTimeout(() => {
        if (wsRef.current === ws) {
          connect();
        }
      }, backoff);
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => { const ws = wsRef.current; wsRef.current = null; ws?.close(); };
  }, [connect]);

  return { connected };
}
