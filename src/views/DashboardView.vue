<template>
  <ViewPlaceholder title="全局概览" description="汇总同步状态、任务吞吐、站点在线数等关键指标。">
    <template #actions>
      <NButton type="primary" @click="fetchHealth">拉取后端状态</NButton>
    </template>
    <pre v-if="status" class="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">{{ status }}</pre>
  </ViewPlaceholder>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NButton } from 'naive-ui';
import { http } from '@/api/http';
import ViewPlaceholder from '@/components/ViewPlaceholder.vue';

const status = ref<string>('');

async function fetchHealth() {
  try {
    const data = await http.get('/api/sync/status');
    status.value = JSON.stringify(data, null, 2);
  } catch (err) {
    status.value = `[error] ${(err as Error).message || err}`;
  }
}
</script>
