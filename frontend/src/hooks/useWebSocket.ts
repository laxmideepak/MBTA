import { useCallback, useEffect, useRef, useState } from 'react';
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
  const connectTokenRef = useRef(0);

  const connect = useCallback(() => {
    connectTokenRef.current++;
    const token = connectTokenRef.current;
    const ws = new WebSocket(url);
    ws.onopen = () => {
      setConnected(true);
      attemptRef.current = 0;
    };
    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        onMessageRef.current(msg);
      } catch {}
    };
    ws.onclose = () => {
      setConnected(false);
      if (connectTokenRef.current !== token) return;
      const backoff = Math.min(1000 * 2 ** attemptRef.current, 30000);
      attemptRef.current++;
      setTimeout(() => {
        if (connectTokenRef.current === token && wsRef.current === ws) {
          connect();
        }
      }, backoff);
    };
    ws.onerror = () => {
      /* swallow — onclose will retry */
    };
    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    // Defer the actual WebSocket construction by one task so React StrictMode's
    // immediate mount→unmount→remount in dev can be collapsed before the browser
    // even opens a socket (avoids noisy "closed before established" console errors).
    let timer: number | undefined = window.setTimeout(() => {
      timer = undefined;
      connect();
    }, 0);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      connectTokenRef.current++;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      else if (ws) ws.close(); // still close so browser cleans up
    };
  }, [connect]);

  return { connected };
}
