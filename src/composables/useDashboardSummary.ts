import { reactive, ref, onUnmounted } from 'vue';
import { syncApi, mqttApi, http } from '@/api';

export type SectionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SectionState<T = unknown> {
  status: SectionStatus;
  data: T | null;
  error: string | null;
  updatedAt: string | null;
}

export interface DashboardSections {
  identity: SectionState;
  syncStatus: SectionState;
  syncMetrics: SectionState;
  queue: SectionState;
  mqttNodes: SectionState;
  history: SectionState;
}

function makeSection<T = unknown>(): SectionState<T> {
  return { status: 'idle', data: null, error: null, updatedAt: null };
}

function nowIso(): string {
  return new Date().toISOString();
}

function toErrMsg(err: unknown): string {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  const e = err as { message?: string };
  return e.message || String(err);
}

export interface UseDashboardSummaryOptions {
  pollMs?: number;     // 轮询间隔；0 = 不轮询
  immediate?: boolean; // 创建时立即拉取
}

export function useDashboardSummary(options: UseDashboardSummaryOptions = {}) {
  const { pollMs = 0, immediate = true } = options;

  const sections = reactive<DashboardSections>({
    identity: makeSection(),
    syncStatus: makeSection(),
    syncMetrics: makeSection(),
    queue: makeSection(),
    mqttNodes: makeSection(),
    history: makeSection(),
  });

  const loading = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function loadSection<T>(
    key: keyof DashboardSections,
    fetcher: () => Promise<T>,
  ): Promise<void> {
    sections[key].status = 'loading';
    sections[key].error = null;
    try {
      const data = await fetcher();
      sections[key].data = data as never;
      sections[key].status = 'success';
      sections[key].updatedAt = nowIso();
    } catch (err) {
      sections[key].error = toErrMsg(err);
      sections[key].status = 'error';
      sections[key].updatedAt = nowIso();
    }
  }

  async function refreshAll(): Promise<void> {
    loading.value = true;
    try {
      await Promise.allSettled([
        loadSection('identity', () => http.get('/api/site/info')),
        loadSection('syncStatus', () => syncApi.status()),
        loadSection('syncMetrics', () => syncApi.metrics()),
        loadSection('queue', () => syncApi.queue()),
        loadSection('mqttNodes', () => mqttApi.nodes()),
        loadSection('history', () => syncApi.history()),
      ]);
    } finally {
      loading.value = false;
    }
  }

  function startPolling(): void {
    if (pollMs <= 0) return;
    stopPolling();
    timer = setInterval(refreshAll, pollMs);
  }

  function stopPolling(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (immediate) {
    refreshAll();
  }
  startPolling();

  onUnmounted(() => {
    stopPolling();
  });

  return {
    sections,
    loading,
    refreshAll,
    startPolling,
    stopPolling,
  };
}
