<template>
  <section class="px-8 py-8 max-w-6xl mx-auto">
    <header class="flex items-center justify-between border-b border-slate-200 pb-6 mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">系统日志</h1>
        <p class="mt-2 text-slate-600">异地同步运行期日志（SSE 实时订阅 + 轮询兜底）。</p>
      </div>
      <div class="flex items-center gap-3">
        <span
          v-if="sse.status.value === 'error'"
          class="text-xs text-rose-600 inline-flex items-center gap-1"
          title="实时通道断开，正在按指数退避重连"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          重连中
          <span v-if="sse.reconnectAttempt.value > 0" class="text-rose-500/70">#{{ sse.reconnectAttempt.value }}</span>
          <span v-if="retrySeconds > 0" class="text-rose-500/70">· {{ retrySeconds }}s 后重试</span>
        </span>
        <span
          v-else-if="sse.status.value === 'open'"
          class="text-xs text-emerald-600 inline-flex items-center gap-1"
          title="SSE 实时通道已连接"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          实时
        </span>
        <span
          v-else-if="sse.status.value === 'connecting'"
          class="text-xs text-amber-600 inline-flex items-center gap-1"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          正在连接
        </span>
        <NButton :loading="loading" @click="refresh">刷新</NButton>
        <NButton type="error" ghost @click="logs = []">清空</NButton>
      </div>
    </header>

    <LogViewer :logs="logs" @clear="logs = []" />

    <div v-if="errorMsg" class="mt-4 rounded-lg bg-rose-50 p-4 text-rose-700">{{ errorMsg }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import LogViewer from '@/components/LogViewer.vue';
import { remoteSyncApi } from '@/api';
import { useSse } from '@/composables/useSse';
import { useAdminAuthStore } from '@/stores/adminAuth';
import { useAppStatusStore } from '@/stores/appStatus';

type LogItem = Record<string, unknown>;

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const adminAuth = useAdminAuthStore();
const appStatus = useAppStatusStore();
const logs = ref<LogItem[]>([]);
const loading = ref(false);
const errorMsg = ref('');

async function refresh(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data: unknown = await remoteSyncApi.logs({ limit: 200 });
    const items: LogItem[] = (() => {
      if (data && typeof data === 'object' && 'logs' in data) {
        const ls = (data as { logs?: unknown }).logs;
        if (Array.isArray(ls)) return ls as LogItem[];
      }
      if (Array.isArray(data)) return data as LogItem[];
      return [];
    })();
    logs.value = items;
  } catch (err) {
    errorMsg.value = `加载日志失败: ${errorMessage(err)}`;
  } finally {
    loading.value = false;
  }
}

const sse = useSse('/api/sync/events/stream', {
  getToken: () => adminAuth.token,
  onMessage(e) {
    try {
      const event = JSON.parse(e.data) as LogItem;
      logs.value = [event, ...logs.value].slice(0, 500);
      appStatus.trackEvent();
    } catch {
      // ignore non-JSON heartbeat
    }
  },
});

const nowMs = ref<number>(Date.now());
let nowTicker: number | null = null;
const retrySeconds = computed<number>(() => {
  const t = sse.nextRetryAt.value;
  if (!t) return 0;
  return Math.max(0, Math.ceil((t - nowMs.value) / 1000));
});

onMounted(() => {
  refresh();
  nowTicker = window.setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (nowTicker !== null) {
    clearInterval(nowTicker);
    nowTicker = null;
  }
});
</script>
