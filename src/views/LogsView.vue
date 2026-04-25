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
          class="text-xs text-rose-600"
          :title="`重连尝试 #${sse.reconnectAttempt.value}`"
        >● 实时连接断开</span>
        <span
          v-else-if="sse.status.value === 'open'"
          class="text-xs text-emerald-600"
        >● 实时</span>
        <span
          v-else-if="sse.status.value === 'connecting'"
          class="text-xs text-amber-600"
        >● 正在连接</span>
        <NButton :loading="loading" @click="refresh">刷新</NButton>
        <NButton type="error" ghost @click="logs = []">清空</NButton>
      </div>
    </header>

    <LogViewer :logs="logs" @clear="logs = []" />

    <div v-if="errorMsg" class="mt-4 rounded-lg bg-rose-50 p-4 text-rose-700">{{ errorMsg }}</div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { NButton } from 'naive-ui';
import LogViewer from '@/components/LogViewer.vue';
import { remoteSyncApi } from '@/api';
import { useSse } from '@/composables/useSse';

const logs = ref([]);
const loading = ref(false);
const errorMsg = ref('');

async function refresh() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data = await remoteSyncApi.logs({ limit: 200 });
    const items = Array.isArray(data?.logs) ? data.logs : Array.isArray(data) ? data : [];
    logs.value = items;
  } catch (err) {
    errorMsg.value = `加载日志失败: ${err?.message || err}`;
  } finally {
    loading.value = false;
  }
}

const sse = useSse('/api/sync/events/stream', {
  onMessage(e) {
    try {
      const event = JSON.parse(e.data);
      logs.value = [event, ...logs.value].slice(0, 500);
    } catch {
      // ignore non-JSON heartbeat
    }
  },
});

onMounted(() => {
  refresh();
});
</script>
