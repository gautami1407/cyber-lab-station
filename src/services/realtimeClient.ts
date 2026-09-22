export type RealtimeEvent = { type: string; data: unknown };

export function connectRealtime(onEvent: (event: RealtimeEvent) => void) {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retryTimer: number | undefined;
  let retryMs = 1000;

  const connect = () => {
    if (stopped) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`);
    socket.onopen = () => { retryMs = 1000; };
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as RealtimeEvent;
        onEvent(event);
      } catch { /* Ignore malformed server events. */ }
    };
    socket.onclose = () => {
      if (stopped) return;
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    socket?.close();
  };
}
