import { onUnmounted, ref, type Ref } from 'vue';

export type SseStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface UseSseOptions {
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onOpen?: (event: Event) => void;
  reconnect?: boolean;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  heartbeatTimeoutMs?: number;
  withCredentials?: boolean;
}

export interface UseSseReturn {
  status: Ref<SseStatus>;
  lastEvent: Ref<MessageEvent | null>;
  reconnectAttempt: Ref<number>;
  close: () => void;
  reconnectNow: () => void;
}

const DEFAULTS = {
  reconnect: true,
  initialBackoffMs: 1000,
  maxBackoffMs: 30_000,
  heartbeatTimeoutMs: 60_000,
};

export function useSse(url: string, options: UseSseOptions = {}): UseSseReturn {
  const {
    onMessage,
    onError,
    onOpen,
    reconnect = DEFAULTS.reconnect,
    initialBackoffMs = DEFAULTS.initialBackoffMs,
    maxBackoffMs = DEFAULTS.maxBackoffMs,
    heartbeatTimeoutMs = DEFAULTS.heartbeatTimeoutMs,
    withCredentials = false,
  } = options;

  const status = ref<SseStatus>('idle');
  const lastEvent = ref<MessageEvent | null>(null);
  const reconnectAttempt = ref(0);

  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let manualClose = false;

  const computeBackoff = (): number => {
    const attempt = Math.min(reconnectAttempt.value, 10);
    const ms = initialBackoffMs * 2 ** attempt;
    return Math.min(ms, maxBackoffMs);
  };

  const scheduleReconnect = () => {
    if (!reconnect || manualClose) return;
    const delay = computeBackoff();
    reconnectTimer = setTimeout(() => {
      reconnectAttempt.value += 1;
      connect();
    }, delay);
  };

  const resetHeartbeat = () => {
    if (heartbeatTimeoutMs <= 0) return;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      // Heartbeat lost — proactively close & let onclose path reconnect
      if (source) {
        source.close();
        status.value = 'error';
        scheduleReconnect();
      }
    }, heartbeatTimeoutMs);
  };

  const cleanup = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
  };

  const connect = () => {
    cleanup();
    status.value = 'connecting';
    try {
      source = new EventSource(url, { withCredentials });
    } catch (err) {
      status.value = 'error';
      scheduleReconnect();
      return;
    }

    source.onopen = (event) => {
      status.value = 'open';
      reconnectAttempt.value = 0;
      resetHeartbeat();
      onOpen?.(event);
    };

    source.onmessage = (event) => {
      lastEvent.value = event;
      resetHeartbeat();
      onMessage?.(event);
    };

    source.onerror = (event) => {
      status.value = 'error';
      onError?.(event);
      // EventSource auto-reconnects internally; we still schedule explicit
      // reconnect in case backend keeps 5xx-ing, to apply our exponential backoff.
      // Close current source and let scheduler reopen it.
      if (source) {
        source.close();
        source = null;
      }
      scheduleReconnect();
    };
  };

  const close = () => {
    manualClose = true;
    cleanup();
    status.value = 'closed';
  };

  const reconnectNow = () => {
    manualClose = false;
    reconnectAttempt.value = 0;
    connect();
  };

  connect();

  onUnmounted(() => {
    close();
  });

  return {
    status,
    lastEvent,
    reconnectAttempt,
    close,
    reconnectNow,
  };
}
