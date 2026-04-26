<template>
  <section class="px-8 py-8 max-w-6xl mx-auto">
    <header class="flex items-center justify-between border-b border-slate-200 pb-6 mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">同步历史</h1>
        <p class="mt-2 text-slate-600">过去 N 日的同步事件，按日期分组。</p>
      </div>
      <NButton type="primary" :loading="loading" @click="refresh">刷新</NButton>
    </header>

    <SyncHistory
      :history="history"
      :current-page="currentPage"
      @detail="onDetail"
      @prev-page="currentPage = Math.max(1, currentPage - 1)"
      @next-page="currentPage = currentPage + 1"
    />

    <NModal :show="!!detail" preset="card" style="width: 640px" @update:show="detail = null">
      <template #header>记录详情</template>
      <pre class="text-xs text-slate-700">{{ detailJson }}</pre>
    </NModal>

    <div v-if="errorMsg" class="mt-4 rounded-lg bg-rose-50 p-4 text-rose-700">{{ errorMsg }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SyncHistory from '@/components/SyncHistory.vue';
import { syncApi } from '@/api';

type HistoryItem = Record<string, unknown>;

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const history = ref<HistoryItem[]>([]);
const currentPage = ref(1);
const loading = ref(false);
const errorMsg = ref('');
const detail = ref<HistoryItem | null>(null);
const detailJson = computed(() => (detail.value ? JSON.stringify(detail.value, null, 2) : ''));

function onDetail(item: HistoryItem): void {
  detail.value = item;
}

async function refresh(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data: unknown = await syncApi.history();
    const list = (() => {
      if (data && typeof data === 'object' && 'history' in data) {
        const h = (data as { history?: unknown }).history;
        if (Array.isArray(h)) return h as HistoryItem[];
      }
      if (Array.isArray(data)) return data as HistoryItem[];
      return [];
    })();
    history.value = list;
  } catch (err) {
    errorMsg.value = `加载同步历史失败: ${errorMessage(err)}`;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
