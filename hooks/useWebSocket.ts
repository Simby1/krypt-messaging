import { useEffect, useRef, useCallback } from "react";
import { getValidToken, refreshAccessToken } from "@/services/api";

const WS_URL = "wss://whisperbox.koyeb.app/ws";

export function useWebSocket(onMessage: (data: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const connect = useCallback(async () => {
    if (!isMounted.current) return;

    const token = await getValidToken();
    if (!token) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        console.error("[WS] Bad message", event.data);
      }
    };

    ws.onclose = (e) => {
      console.log("[WS] Closed", e.code);
      if (!isMounted.current) return;
      // Reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [onMessage]);

  const sendFrame = useCallback((frame: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { sendFrame };
}