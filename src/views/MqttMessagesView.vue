<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-gradient-to-r from-purple-50/50 to-indigo-50/30">
      <div>
        <h3 class="font-bold text-xl flex items-center gap-3">
          <i class="fas fa-signal text-purple-600"></i>
          MQTT 消息记录
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          查看系统发送的 MQTT 增量同步消息历史
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NButton
          type="primary"
          size="small"
          @click="loadMessages"
          :loading="loading"
        >
          <template #icon>
            <i class="fas fa-sync"></i>
          </template>
          刷新
        </NButton>
      </div>
    </div>

    <!-- Filters (Native Inputs styled with DaisyUI/Tailwind) -->
    <div class="px-6 py-3 border-b border-base-200 bg-slate-50/50 flex flex-col lg:flex-row gap-4 lg:items-center">
      <div class="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
        <div class="form-control w-full sm:w-48">
          <label class="label py-0">
            <span class="label-text text-xs font-semibold">位置筛选</span>
          </label>
          <NSelect
            v-model:value="filters.location"
            size="small"
            :options="locationOptions"
            @update:value="applyFilters"
            clearable
            placeholder="全部位置"
          />
        </div>

        <div class="form-control w-full sm:w-48">
          <label class="label py-0">
            <span class="label-text text-xs font-semibold">同步类型</span>
          </label>
          <NSelect
            v-model:value="filters.syncType"
            size="small"
            :options="syncTypeOptions"
            @update:value="applyFilters"
            clearable
            placeholder="全部类型"
          />
        </div>
      </div>

      <div class="form-control flex-1 w-full">
        <label class="label py-0">
          <span class="label-text text-xs font-semibold">搜索文件名</span>
        </label>
        <NInput
          v-model:value="filters.searchText"
          size="small"
          placeholder="输入文件名搜索..."
          @update:value="applyFilters"
          clearable
        >
          <template #prefix>
            <i class="fas fa-search text-slate-400"></i>
          </template>
        </NInput>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="errorMsg" class="px-6 pt-3">
      <div class="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{{ errorMsg }}</div>
    </div>

    <!-- Naive UI Data Table -->
    <div class="flex-1 overflow-hidden p-4 flex flex-col">
      <NDataTable
        remote
        flex-height
        :columns="columns"
        :data="messages"
        :loading="loading"
        :pagination="pagination"
        :row-key="(row) => row.id || row.timestamp"
        @update:page="handlePageChange"
        class="h-full"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
import { NTag, NButton, NPopover } from 'naive-ui';
import { mqttApi } from '@/api';

interface SiteReceiver {
  location?: string;
  received?: boolean;
  received_at?: string | number;
}

interface MqttMessage {
  id?: string | number;
  timestamp?: string | number;
  location?: string;
  db_num?: number;
  is_full_sync?: boolean;
  total_added?: number;
  total_modified?: number;
  total_deleted?: number;
  session_range?: string;
  file_count?: number;
  file_names?: string[];
  file_server_host?: string;
  site_receivers?: SiteReceiver[];
  received_count?: number;
  total_receivers?: number;
  [key: string]: unknown;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const messages = ref<MqttMessage[]>([]);
const allMessages = ref<MqttMessage[]>([]);
const loading = ref(false);
const errorMsg = ref('');

// Pagination for Naive UI
const pagination = ref<PaginationProps & { page: number; pageSize: number; itemCount: number }>({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  onChange: (page: number) => {
    pagination.value.page = page;
    applyFiltersInPlace();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.value.pageSize = pageSize;
    pagination.value.page = 1;
    applyFiltersInPlace();
  },
});

const filters = ref({
  location: '',
  syncType: '',
  searchText: '',
});

const locationOptions = computed<{ label: string; value: string }[]>(() => {
  const set = new Set<string>();
  allMessages.value.forEach((msg) => {
    if (typeof msg.location === 'string' && msg.location) set.add(msg.location);
  });
  return Array.from(set)
    .sort()
    .map((loc) => ({ label: loc, value: loc }));
});

const syncTypeOptions = [
  { label: '完全同步', value: 'full' },
  { label: '增量同步', value: 'incr' },
];

// Columns Definition
const columns: DataTableColumns<MqttMessage> = [
  {
    title: '类型',
    key: 'is_full_sync',
    width: 100,
    render(row) {
      return h(
        NTag,
        {
          type: row.is_full_sync ? 'warning' : 'info',
          bordered: false,
          size: 'small',
        },
        { default: () => (row.is_full_sync ? '完全同步' : '增量同步') },
      );
    },
  },
  {
    title: '时间',
    key: 'timestamp',
    width: 180,
    render(row) {
      return formatTimestamp(row.timestamp);
    },
  },
  {
    title: '位置 / DB',
    key: 'location',
    width: 150,
    render(row) {
      return h('div', { class: 'flex flex-col text-xs' }, [
        h('span', { class: 'font-bold' }, row.location || '未知位置'),
        row.db_num ? h('span', { class: 'text-slate-400' }, `DB #${row.db_num}`) : null,
      ]);
    },
  },
  {
    title: '变更统计',
    key: 'stats',
    width: 200,
    render(row) {
      const stats: ReturnType<typeof h>[] = [];
      if (row.total_added) {
        stats.push(h('span', { class: 'text-green-600 mr-2' }, [h('i', { class: 'fas fa-plus-circle mr-1' }), String(row.total_added)]));
      }
      if (row.total_modified) {
        stats.push(h('span', { class: 'text-orange-600 mr-2' }, [h('i', { class: 'fas fa-edit mr-1' }), String(row.total_modified)]));
      }
      if (row.total_deleted) {
        stats.push(h('span', { class: 'text-red-600' }, [h('i', { class: 'fas fa-trash mr-1' }), String(row.total_deleted)]));
      }
      if (stats.length === 0) return '-';
      return h('div', { class: 'flex items-center text-xs' }, stats);
    },
  },
  {
    title: '会话范围',
    key: 'session_range',
    width: 120,
    render(row) {
      return row.session_range
        ? h('span', { class: 'font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded' }, row.session_range)
        : '-';
    },
  },
  {
    title: '文件',
    key: 'files',
    render(row) {
      const files = row.file_names ?? [];
      const fileCount = row.file_count ?? files.length;
      if (fileCount === 0) return h('span', { class: 'text-slate-400' }, '无文件');

      const trigger = h(
        NButton,
        { size: 'tiny', type: 'default', secondary: true },
        { default: () => `${fileCount} 个文件` },
      );

      return h(
        NPopover,
        { trigger: 'click', scrollable: true, style: { maxHeight: '300px' } },
        {
          trigger: () => trigger,
          default: () =>
            h('div', { class: 'space-y-1 p-1' }, [
              h('div', { class: 'text-xs font-bold mb-2 text-slate-500' }, `服务器: ${row.file_server_host || '未知'}`),
              ...files.map((f) =>
                h(
                  'div',
                  { class: 'text-xs font-mono text-slate-700 border-b border-slate-100 pb-1 mb-1 last:border-0' },
                  f,
                ),
              ),
            ]),
        },
      );
    },
  },
  {
    title: '接收状态',
    key: 'receivers',
    render(row) {
      const receivers = row.site_receivers ?? [];
      if (receivers.length === 0) return '-';

      const completed = row.received_count ?? 0;
      const total = row.total_receivers ?? receivers.length;

      const trigger = h(
        NTag,
        {
          type: completed === total ? 'success' : 'warning',
          size: 'small',
          bordered: false,
          class: 'cursor-pointer',
        },
        { default: () => `${completed}/${total} 已接收` },
      );

      return h(
        NPopover,
        { trigger: 'hover' },
        {
          trigger: () => trigger,
          default: () =>
            h(
              'div',
              { class: 'space-y-2 p-1' },
              receivers.map((receiver) => {
                const isDone = !!receiver.received;
                return h('div', { class: 'flex items-center gap-2 text-xs' }, [
                  h('i', { class: isDone ? 'fas fa-check-circle text-green-500' : 'fas fa-clock text-slate-400' }),
                  h('span', { class: 'font-semibold' }, receiver.location ?? ''),
                  isDone ? h('span', { class: 'text-slate-400 text-[10px] ml-2' }, formatReceiverTime(receiver.received_at)) : null,
                ]);
              }),
            ),
        },
      );
    },
  },
];

// 后端 /api/mqtt/messages 当前不支持分页查询参数，
// 一次性拉取全量后在前端做 filter + slice 分页；
// 待后端补 query params 后切换为 server-side pagination。
function normalizeMessages(payload: unknown): MqttMessage[] {
  if (Array.isArray(payload)) return payload as MqttMessage[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.messages)) return obj.messages as MqttMessage[];
    if (Array.isArray(obj.data)) return obj.data as MqttMessage[];
  }
  return [];
}

function applyFiltersInPlace(): void {
  const { location, syncType, searchText } = filters.value;
  let list: MqttMessage[] = allMessages.value.slice();
  if (location) {
    list = list.filter((m) => m.location === location);
  }
  if (syncType === 'full') {
    list = list.filter((m) => !!m.is_full_sync);
  } else if (syncType === 'incr') {
    list = list.filter((m) => !m.is_full_sync);
  }
  if (searchText) {
    const kw = String(searchText).toLowerCase();
    list = list.filter((m) => {
      const names = Array.isArray(m.file_names) ? m.file_names : [];
      return names.some((f) => String(f).toLowerCase().includes(kw));
    });
  }

  pagination.value.itemCount = list.length;
  const start = (pagination.value.page - 1) * pagination.value.pageSize;
  messages.value = list.slice(start, start + pagination.value.pageSize);
}

async function loadMessages(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    const response: unknown = await mqttApi.messages();
    allMessages.value = normalizeMessages(response);
    applyFiltersInPlace();
  } catch (error) {
    const msg = errorMessage(error);
    errorMsg.value = `加载 MQTT 消息失败: ${msg}`;
    console.error('加载 MQTT 消息失败:', msg);
  } finally {
    loading.value = false;
  }
}

function handlePageChange(page: number): void {
  pagination.value.page = page;
  applyFiltersInPlace();
}

function applyFilters(): void {
  pagination.value.page = 1;
  applyFiltersInPlace();
}

// Helpers
function formatTimestamp(timestamp: string | number | undefined): string {
  if (!timestamp) return '未知时间';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(timestamp);
  }
}

function formatReceiverTime(timestamp: string | number | undefined): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

onMounted(() => {
  loadMessages();
});
</script>

<style scoped>
/* Ensure Naive UI table fits container */
:deep(.n-data-table) {
  height: 100%;
}
:deep(.n-data-table .n-data-table-wrapper) {
  height: 100%;
}
</style>
