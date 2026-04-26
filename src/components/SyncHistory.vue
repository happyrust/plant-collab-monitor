<template>
  <div class="dashboard-card animate-fade-in-up">
    <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <p class="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">同步历史</p>
        <h2 class="text-xl font-bold text-slate-900 mb-1">SurrealDB 记录</h2>
        <p class="text-sm text-slate-700">追溯增量执行轨迹与文件明细，问题定位更轻松。</p>
      </div>
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-100">
        <i class="fas fa-database text-[10px]"></i>历史留痕
      </span>
    </div>

    <div v-if="history.length === 0" class="text-sm text-slate-500 font-medium text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
      暂无历史同步记录
    </div>

    <div v-else class="space-y-6">
      <!-- 按日期分组显示 -->
      <div v-for="(group, groupKey) in groupedHistory" :key="groupKey" class="space-y-3">
        <!-- 日期分组标题 -->
        <div class="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm -mx-4 px-4 py-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="flex-shrink-0">
              <div class="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/30"></div>
            </div>
            <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">
              <i class="fas fa-calendar-day text-blue-600 mr-1.5 text-xs"></i>
              {{ group.label }}
            </h3>
            <div class="flex-1 h-px bg-gradient-to-r from-slate-300 to-transparent"></div>
            <span class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200">
              {{ group.records.length }} 条
            </span>
          </div>
        </div>

        <!-- 该日期分组下的记录 -->
        <div v-for="(record, index) in group.records" :key="record.id || index" class="flex gap-3 ml-5">
          <div class="timeline-dot mt-2.5"></div>
          <div class="flex-1 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-all">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-2">
                <div>
                  <p class="text-sm font-bold text-slate-900">{{ formatTime(record.timestamp) }}</p>
                  <p class="text-xs text-slate-600 font-medium mt-0.5">来自 <span class="text-slate-800">{{ record.location || '未知位置' }}</span></p>
                </div>
                <span v-if="record.is_full_sync" class="px-2 py-1 text-[10px] font-bold rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                  完全同步
                </span>
                <span v-else class="px-2 py-1 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  增量同步
                </span>
              </div>
              <button
                @click="$emit('detail', record)"
                class="px-3 py-1.5 text-xs font-bold rounded-full border-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all"
              >
                查看详情
              </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <!-- 文件总数 -->
              <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                <p class="text-[10px] text-slate-600 uppercase tracking-[0.35em] font-bold mb-1">文件总数</p>
                <p class="text-slate-900 font-bold text-sm">{{ record.file_count || 0 }}</p>
              </div>

              <!-- 会话范围或文件服务器 -->
              <div v-if="record.session_range" class="bg-indigo-50 rounded-xl p-2.5 border border-indigo-100">
                <p class="text-[10px] text-indigo-700 uppercase tracking-[0.35em] font-bold mb-1">会话范围</p>
                <p class="text-indigo-900 font-mono text-xs font-bold">{{ record.session_range }}</p>
              </div>
              <div v-else-if="record.db_num !== null && record.db_num !== undefined" class="bg-cyan-50 rounded-xl p-2.5 border border-cyan-100">
                <p class="text-[10px] text-cyan-700 uppercase tracking-[0.35em] font-bold mb-1">DB 编号</p>
                <p class="text-cyan-900 font-mono text-sm font-bold">{{ record.db_num }}</p>
              </div>
              <div v-else class="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                <p class="text-[10px] text-blue-700 uppercase tracking-[0.35em] font-bold mb-1">文件服务</p>
                <p class="text-blue-800 font-mono text-xs font-semibold truncate">{{ record.file_server_host || '---' }}</p>
              </div>

              <!-- 变更统计 -->
              <div v-if="hasStats(record)" class="col-span-2 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-3 border border-slate-200">
                <p class="text-[10px] text-slate-700 uppercase tracking-[0.35em] font-bold mb-2">变更统计</p>
                <div class="grid grid-cols-3 gap-2">
                  <div class="flex items-center gap-1.5">
                    <span class="text-green-600 text-sm">➕</span>
                    <span class="text-xs font-bold text-green-800">{{ record.total_added || 0 }}</span>
                    <span class="text-[10px] text-slate-600 font-medium">新增</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-amber-600 text-sm">✏️</span>
                    <span class="text-xs font-bold text-amber-800">{{ record.total_modified || 0 }}</span>
                    <span class="text-[10px] text-slate-600 font-medium">修改</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-red-600 text-sm">🗑️</span>
                    <span class="text-xs font-bold text-red-800">{{ record.total_deleted || 0 }}</span>
                    <span class="text-[10px] text-slate-600 font-medium">删除</span>
                  </div>
                </div>
              </div>

              <!-- 文件列表 -->
              <div class="col-span-2 flex flex-wrap gap-1.5 text-[10px]">
                <span
                  v-for="(fileName, idx) in displayFileNames(record)"
                  :key="idx"
                  class="px-2 py-1 rounded-full bg-slate-100 text-slate-800 font-semibold border border-slate-200"
                >
                  📄 {{ fileName }}
                </span>
                <span
                  v-if="moreFilesCount(record) > 0"
                  class="px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200"
                >
                  +{{ moreFilesCount(record) }} 更多
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页控件 -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-4">
        <button
          @click="$emit('prev-page')"
          :disabled="currentPage <= 1"
          class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <i class="fas fa-chevron-left mr-1"></i>上一页
        </button>
        <span class="text-sm text-slate-700 font-bold">
          第 {{ currentPage }} / {{ totalPages }} 页
        </span>
        <button
          @click="$emit('next-page')"
          :disabled="currentPage >= totalPages"
          class="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          下一页<i class="fas fa-chevron-right ml-1"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFormatters } from '@/composables/useFormatters';

interface SyncRecord {
  id?: string | number;
  timestamp?: string | number;
  location?: string;
  is_full_sync?: boolean;
  total_added?: number;
  total_modified?: number;
  total_deleted?: number;
  file_names?: string[];
  file_count?: number;
  [key: string]: unknown;
}

interface DateGroup {
  key: string;
  label: string;
  sortKey: number;
}

interface HistoryGroup {
  label: string;
  records: SyncRecord[];
  sortKey: number;
}

const props = withDefaults(
  defineProps<{
    history?: SyncRecord[];
    currentPage?: number;
    totalPages?: number;
  }>(),
  {
    history: () => [],
    currentPage: 1,
    totalPages: 1,
  },
);

defineEmits<{
  detail: [record: SyncRecord];
  'prev-page': [];
  'next-page': [];
}>();

const { formatTime } = useFormatters();

function getDateGroup(timestamp: string | number | undefined): DateGroup {
  const date = new Date(timestamp ?? 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const recordDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24));

  if (recordDate.getTime() === today.getTime()) {
    return { key: 'today', label: '今天', sortKey: 0 };
  }
  if (recordDate.getTime() === yesterday.getTime()) {
    return { key: 'yesterday', label: '昨天', sortKey: 1 };
  }
  if (diffDays < 7) {
    return { key: 'this-week', label: '本周', sortKey: 2 };
  }
  if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
    return { key: 'this-month', label: '本月', sortKey: 3 };
  }
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  if (date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear()) {
    return { key: 'last-month', label: '上个月', sortKey: 4 };
  }
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return {
    key: yearMonth,
    label: `${date.getFullYear()}年${date.getMonth() + 1}月`,
    sortKey: 1000 - date.getTime() / 1000000000, // 越早的月份 sortKey 越大
  };
}

const groupedHistory = computed<HistoryGroup[]>(() => {
  const groups = new Map<string, HistoryGroup>();

  props.history.forEach((record) => {
    const dateGroup = getDateGroup(record.timestamp);
    let g = groups.get(dateGroup.key);
    if (!g) {
      g = { label: dateGroup.label, records: [], sortKey: dateGroup.sortKey };
      groups.set(dateGroup.key, g);
    }
    g.records.push(record);
  });

  return Array.from(groups.values()).sort((a, b) => a.sortKey - b.sortKey);
});

function hasStats(record: SyncRecord): boolean {
  return (
    (record.total_added ?? 0) > 0 ||
    (record.total_modified ?? 0) > 0 ||
    (record.total_deleted ?? 0) > 0
  );
}

function displayFileNames(record: SyncRecord): string[] {
  return (record.file_names ?? []).slice(0, 3);
}

function moreFilesCount(record: SyncRecord): number {
  const fileNames = record.file_names ?? [];
  const fileCount = record.file_count ?? fileNames.length;
  return Math.max(0, fileCount - 3);
}
</script>

<style scoped>
.dashboard-card {
  background: #fff;
  border-radius: 1.25rem;
  border: 2px solid #e2e8f0;
  padding: 1.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

.timeline-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  background: #3b82f6;
  box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15);
  flex-shrink: 0;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out;
}
</style>
