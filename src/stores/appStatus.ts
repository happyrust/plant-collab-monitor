import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { http, syncApi } from '@/api';

export interface AppStatusIdentity {
  location: string;
  role: string;
  isMaster: boolean;
}

export interface AppStatusRuntime {
  status: string;
  ok: boolean;
}

export interface AppStatusQueue {
  waiting: number;
  running: number;
  failed: number;
  total: number;
}

const DEFAULT_POLL_MS = 30_000;

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return {};
}

function pickNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export const useAppStatusStore = defineStore('appStatus', () => {
  const identity = ref<AppStatusIdentity>({ location: '', role: '', isMaster: false });
  const runtime = ref<AppStatusRuntime>({ status: '', ok: false });
  const queue = ref<AppStatusQueue>({ waiting: 0, running: 0, failed: 0, total: 0 });
  const eventsPerMinute = ref(0);

  const loading = ref(false);
  const lastUpdatedAt = ref<string | null>(null);
  const lastError = ref<string | null>(null);
  const consecutiveFailures = ref(0);
  const connected = ref(true);
  const notificationsEnabled = ref(Notification.permission === 'granted');

  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;
  let prevConnected = true;
  let prevFailed = 0;

  function requestNotificationPermission(): void {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((p) => {
        notificationsEnabled.value = p === 'granted';
      });
    }
  }

  function sendNotification(title: string, body: string): void {
    if (!notificationsEnabled.value || document.hasFocus()) return;
    try { new Notification(title, { body, icon: '/favicon.ico', tag: 'plant-monitor' }); } catch { /* noop */ }
  }

  // 1-min event counter（由其它视图通过 SSE 推入）
  const eventTimestamps = ref<number[]>([]);

  function trackEvent(): void {
    const now = Date.now();
    eventTimestamps.value.push(now);
    // 仅保留最近 60s
    eventTimestamps.value = eventTimestamps.value.filter((t) => now - t < 60_000);
    eventsPerMinute.value = eventTimestamps.value.length;
  }

  function pruneEventCounter(): void {
    const now = Date.now();
    eventTimestamps.value = eventTimestamps.value.filter((t) => now - t < 60_000);
    eventsPerMinute.value = eventTimestamps.value.length;
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const [identityRes, statusRes, queueRes] = await Promise.allSettled([
        http.get('/api/site/info'),
        syncApi.status(),
        syncApi.queue(),
      ]);

      if (identityRes.status === 'fulfilled') {
        const raw = asObj(identityRes.value);
        const config = asObj(raw.config);
        const merged = { ...config, ...raw } as Record<string, unknown>;
        const role =
          (merged.role as string) ||
          (merged.is_master === true ? 'master' : merged.is_master === false ? 'client' : '');
        identity.value = {
          location: (merged.location as string) || '',
          role,
          isMaster: role === 'master' || merged.is_master === true,
        };
      }

      if (statusRes.status === 'fulfilled') {
        const raw = asObj(statusRes.value);
        const status = (raw.status as string) || (raw.state as string) || '';
        runtime.value = {
          status,
          ok: /run|ok|healthy/i.test(status),
        };
      }

      if (queueRes.status === 'fulfilled') {
        const raw = asObj(queueRes.value);
        const tasks = Array.isArray(raw.tasks)
          ? (raw.tasks as Array<Record<string, unknown>>)
          : Array.isArray(raw)
          ? (raw as Array<Record<string, unknown>>)
          : null;
        if (tasks) {
          queue.value = {
            waiting: tasks.filter((t) => /(wait|pend)/i.test(String(t.status || ''))).length,
            running: tasks.filter((t) => /(run)/i.test(String(t.status || ''))).length,
            failed: tasks.filter((t) => /(fail|error)/i.test(String(t.status || ''))).length,
            total: tasks.length,
          };
        } else {
          queue.value = {
            waiting: pickNumber(raw.waiting) ?? 0,
            running: pickNumber(raw.running) ?? 0,
            failed: pickNumber(raw.failed) ?? 0,
            total: pickNumber(raw.total) ?? 0,
          };
        }
      }

      pruneEventCounter();
      lastUpdatedAt.value = new Date().toISOString();
      consecutiveFailures.value = 0;
      if (!prevConnected) {
        sendNotification('连接恢复', '后端服务已重新连接');
      }
      connected.value = true;
      prevConnected = true;

      const curFailed = queue.value.failed;
      if (curFailed > prevFailed && curFailed > 0) {
        sendNotification('任务失败', `队列中有 ${curFailed} 个失败任务`);
      }
      prevFailed = curFailed;
    } catch (err) {
      lastError.value = (err as { message?: string })?.message || String(err);
      consecutiveFailures.value++;
      if (consecutiveFailures.value >= 2) {
        if (prevConnected) {
          sendNotification('连接中断', `后端服务无响应 (${consecutiveFailures.value} 次)`);
        }
        connected.value = false;
        prevConnected = false;
      }
    } finally {
      loading.value = false;
    }
  }

  function start(pollMs: number = DEFAULT_POLL_MS): void {
    if (started) return;
    started = true;
    refresh();
    if (pollMs > 0) {
      timer = setInterval(refresh, pollMs);
    }
  }

  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    started = false;
  }

  const queueActiveCount = computed(() => queue.value.waiting + queue.value.running);

  return {
    identity,
    runtime,
    queue,
    queueActiveCount,
    eventsPerMinute,
    loading,
    lastUpdatedAt,
    lastError,
    connected,
    consecutiveFailures,
    refresh,
    start,
    stop,
    trackEvent,
    requestNotificationPermission,
    notificationsEnabled,
  };
});
