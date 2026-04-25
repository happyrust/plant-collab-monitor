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

  let timer: ReturnType<typeof setInterval> | null = null;
  let started = false;

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
    } catch (err) {
      lastError.value = (err as { message?: string })?.message || String(err);
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
    refresh,
    start,
    stop,
    trackEvent,
  };
});
