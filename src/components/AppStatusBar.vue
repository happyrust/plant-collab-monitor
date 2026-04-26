<template>
  <div class="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
    <div
      v-if="!connected"
      class="px-6 py-1.5 bg-rose-600 text-white text-xs font-semibold flex items-center justify-center gap-2"
    >
      <span class="inline-block w-2 h-2 rounded-full bg-white animate-pulse"></span>
      后端连接中断 · 连续 {{ consecutiveFailures }} 次失败 · 正在重试…
    </div>
    <div class="px-6 py-2 flex items-center justify-between text-sm">
      <div class="flex items-center gap-2 flex-wrap">
        <RouterLink to="/site-config" class="status-pill" :class="identityPillClass" title="点击进入站点配置">
          <span class="dot" :class="identity.isMaster ? 'bg-purple-500' : 'bg-blue-500'"></span>
          <span class="font-semibold">{{ identity.location || '未配置' }}</span>
          <span class="text-xs uppercase opacity-75">{{ identity.role || '—' }}</span>
        </RouterLink>

        <RouterLink to="/dashboard" class="status-pill" :class="runtimePillClass" :title="runtimeTitle">
          <span class="dot" :class="runtimeDotClass"></span>
          <span class="font-medium">runtime · {{ runtime.status || '未知' }}</span>
        </RouterLink>

        <RouterLink to="/tasks" class="status-pill" :class="queuePillClass" title="点击进入任务队列">
          <span class="dot bg-amber-500"></span>
          <span class="font-medium">队列 {{ queueActiveCount }}</span>
          <span v-if="queue.failed > 0" class="text-xs text-rose-600 font-bold">失败 {{ queue.failed }}</span>
        </RouterLink>

        <RouterLink to="/logs" class="status-pill" :class="eventsPillClass" title="点击进入日志">
          <span class="dot" :class="eventsPerMinute > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'"></span>
          <span class="font-medium">事件 {{ eventsPerMinute }}/min</span>
        </RouterLink>
      </div>

      <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span v-if="lastError" class="text-rose-600" :title="lastError">● 拉取异常</span>
        <span v-else-if="loading" class="text-amber-500">● 刷新中</span>
        <span v-else-if="lastUpdatedAt" :title="lastUpdatedAt">{{ relativeUpdated }}</span>
        <button
          v-if="!notificationsEnabled"
          class="text-amber-600 hover:underline"
          @click="store.requestNotificationPermission()"
          title="启用桌面通知以接收告警"
        >🔔 开启通知</button>
        <button
          class="text-blue-600 hover:underline"
          :disabled="loading"
          @click="refresh"
        >手动刷新</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAppStatusStore } from '@/stores/appStatus';

const store = useAppStatusStore();
const {
  identity,
  runtime,
  queue,
  queueActiveCount,
  eventsPerMinute,
  loading,
  lastError,
  lastUpdatedAt,
  connected,
  consecutiveFailures,
  notificationsEnabled,
} = storeToRefs(store);

const refresh = () => store.refresh();

const tick = ref(0);
let tickTimer: ReturnType<typeof setInterval> | null = null;
let titleTimer: ReturnType<typeof setInterval> | null = null;
const originalTitle = document.title;

function updateAlertTitle() {
  if (!connected.value) {
    document.title = `⚠ 连接中断 · ${originalTitle}`;
  } else if (queue.value.failed > 0) {
    document.title = `❌ ${queue.value.failed} 失败 · ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
}

onMounted(() => {
  store.start();
  tickTimer = setInterval(() => {
    tick.value += 1;
  }, 10_000);
  titleTimer = setInterval(updateAlertTitle, 3000);
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  if (titleTimer) {
    clearInterval(titleTimer);
    document.title = originalTitle;
  }
  store.stop();
});

const relativeUpdated = computed(() => {
  void tick.value; // 触发依赖
  if (!lastUpdatedAt.value) return '—';
  const ts = Date.parse(lastUpdatedAt.value);
  if (Number.isNaN(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  return new Date(ts).toLocaleTimeString('zh-CN');
});

const identityPillClass = computed(() =>
  identity.value.isMaster
    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700'
    : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
);

const runtimePillClass = computed(() => {
  const s = (runtime.value.status || '').toLowerCase();
  if (s.includes('error') || s.includes('fault')) return 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700';
  if (s.includes('paus')) return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700';
  if (s.includes('run')) return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700';
  return 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
});

const runtimeDotClass = computed(() => {
  const s = (runtime.value.status || '').toLowerCase();
  if (s.includes('run')) return 'bg-emerald-500 animate-pulse';
  if (s.includes('paus')) return 'bg-amber-500';
  if (s.includes('error') || s.includes('fault')) return 'bg-rose-500';
  return 'bg-slate-400';
});

const runtimeTitle = computed(() => `runtime status: ${runtime.value.status || 'unknown'}`);

const queuePillClass = computed(() =>
  queue.value.failed > 0
    ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700'
    : queueActiveCount.value > 0
    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700'
    : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
);

const eventsPillClass = computed(() =>
  eventsPerMinute.value > 0
    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700'
    : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600',
);
</script>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  border-width: 1px;
  font-size: 0.75rem;
  line-height: 1rem;
  transition: opacity 0.2s;
}

.status-pill:hover {
  opacity: 0.85;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
</style>
