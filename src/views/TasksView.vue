<template>
  <section class="px-8 py-8 max-w-6xl mx-auto">
    <header class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-6 mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">任务队列</h1>
        <p class="mt-2 text-slate-600">活跃 / 待重试 / 失败 任务的实时队列。</p>
      </div>
      <NButton type="primary" :loading="loading" @click="refresh">刷新</NButton>
    </header>

    <TaskQueue :tasks="tasks" />

    <div v-if="errorMsg" class="mt-4 rounded-lg bg-rose-50 p-4 text-rose-700">{{ errorMsg }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import TaskQueue from '@/components/TaskQueue.vue';
import { syncApi } from '@/api';

type TaskItem = Record<string, unknown>;

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const tasks = ref<TaskItem[]>([]);
const loading = ref(false);
const errorMsg = ref('');

async function refresh(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data: unknown = await syncApi.queue();
    const list: TaskItem[] = (() => {
      if (data && typeof data === 'object' && 'tasks' in data) {
        const t = (data as { tasks?: unknown }).tasks;
        if (Array.isArray(t)) return t as TaskItem[];
      }
      if (Array.isArray(data)) return data as TaskItem[];
      return [];
    })();
    tasks.value = list;
  } catch (err) {
    errorMsg.value = `加载任务队列失败: ${errorMessage(err)}`;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>
