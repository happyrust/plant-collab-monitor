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
  /**
   * 可选的 Bearer token 提供者。返回非空字符串时，会切换到 fetch + ReadableStream 路径，
   * 以便注入 Authorization 头部（原生 EventSource 不支持自定义头）。
   */
  getToken?: () => string | null | undefined;
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

interface SsePayload {
  data: string;
  event?: string;
  id?: string;
}

function parseSseChunk(buffer: string): { events: SsePayload[]; rest: string } {
  const events: SsePayload[] = [];
  let rest = buffer;
  // SSE 事件之间用空行分隔（\n\n 或 \r\n\r\n）
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const sepMatch = rest.match(/\r?\n\r?\n/);
    if (!sepMatch || sepMatch.index === undefined) break;
    const rawEvent = rest.slice(0, sepMatch.index);
    rest = rest.slice(sepMatch.index + sepMatch[0].length);
    const lines = rawEvent.split(/\r?\n/);
    let dataParts: string[] = [];
    let eventName: string | undefined;
    let id: string | undefined;
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue; // SSE 注释行
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
      if (field === 'data') dataParts.push(value);
      else if (field === 'event') eventName = value;
      else if (field === 'id') id = value;
    }
    if (dataParts.length > 0) {
      events.push({ data: dataParts.join('\n'), event: eventName, id });
    }
  }
  return { events, rest };
}

function makeMessageEvent(p: SsePayload): MessageEvent {
  return new MessageEvent(p.event || 'message', {
    data: p.data,
    lastEventId: p.id ?? '',
  });
}

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
    getToken,
  } = options;

  const status = ref<SseStatus>('idle');
  const lastEvent = ref<MessageEvent | null>(null);
  const reconnectAttempt = ref(0);

  let source: EventSource | null = null;
  let abortController: AbortController | null = null;
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
      // 心跳丢失：主动关闭让重连逻辑接管
      cleanup();
      status.value = 'error';
      scheduleReconnect();
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
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  // ── 路径 A：原生 EventSource（无 token 时使用，浏览器自带重连） ──
  const connectViaEventSource = () => {
    status.value = 'connecting';
    try {
      source = new EventSource(url, { withCredentials });
    } catch {
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
      // 关闭并显式调度重连，让我们的指数退避生效
      if (source) {
        source.close();
        source = null;
      }
      scheduleReconnect();
    };
  };

  // ── 路径 B：fetch + ReadableStream（带 Bearer token） ──
  const connectViaFetch = async (token: string) => {
    status.value = 'connecting';
    abortController = new AbortController();
    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal: abortController.signal,
        credentials: withCredentials ? 'include' : 'same-origin',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok || !resp.body) {
        status.value = 'error';
        onError?.(new Event('error'));
        scheduleReconnect();
        return;
      }

      status.value = 'open';
      reconnectAttempt.value = 0;
      resetHeartbeat();
      onOpen?.(new Event('open'));

      const reader = resp.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // 流读取循环
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const ev of parsed.events) {
          const msg = makeMessageEvent(ev);
          lastEvent.value = msg;
          resetHeartbeat();
          onMessage?.(msg);
        }
      }

      // 流自然结束 → 视为断开，触发重连
      status.value = 'closed';
      scheduleReconnect();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (!aborted) {
        status.value = 'error';
        onError?.(new Event('error'));
        scheduleReconnect();
      }
    }
  };

  const connect = () => {
    cleanup();
    const token = getToken?.();
    if (token) {
      void connectViaFetch(token);
    } else {
      connectViaEventSource();
    }
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
