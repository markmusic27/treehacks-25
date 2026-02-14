"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

/**
 * Lightweight WebSocket hook that auto-reconnects.
 * Sends data via `send()` and exposes connection status.
 */
export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[ws] connected to", url);
      setStatus("connected");
    };

    ws.onclose = () => {
      console.log("[ws] disconnected, reconnecting in 2s…");
      setStatus("disconnected");
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = (e) => {
      console.warn("[ws] error", e);
      ws.close();
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
