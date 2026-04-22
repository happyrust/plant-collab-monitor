<template>
  <div class="dashboard-card animate-fade-in-up">
    <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <p class="text-[10px] uppercase tracking-[0.35em] text-slate-400 font-semibold mb-1.5">任务队列</p>
        <h2 class="text-xl font-bold text-slate-900 mb-1">待处理增量任务</h2>
        <p class="text-sm text-slate-600">按优先级查看正在排队的文件，同步窗口清晰可见。</p>
      </div>
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-100">
        <i class="fas fa-layer-group text-[10px]"></i>实时队列
      </span>
    </div>

    <div v-if="tasks.length === 0" class="text-sm text-slate-400 text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
      暂无待处理的增量任务
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="task in tasks"
        :key="task.id || task.file_name"
        class="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all"
      >
        <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div class="flex-1 min-w-0">
            <p class="font-mono text-sm text-slate-800 font-semibold truncate">{{ task.file_name || '---' }}</p>
            <p class="text-xs text-slate-500 mt-1.5">{{ task.notes || '暂无备注' }}</p>
          </div>
          <span :class="['px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap', getTaskStatusClass(task.status)]">
            {{ task.status }}
          </span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p class="text-[10px] text-slate-500 uppercase tracking-[0.35em] font-semibold mb-1">文件大小</p>
            <p class="text-slate-900 font-bold text-sm">{{ formatSize(task.file_size) }}</p>
          </div>
          <div class="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p class="text-[10px] text-blue-600 uppercase tracking-[0.35em] font-semibold mb-1">优先级</p>
            <p class="text-blue-700 font-bold text-sm">{{ task.priority !== undefined ? task.priority : 'N/A' }}</p>
          </div>
          <div class="bg-purple-50 rounded-xl p-3 border border-purple-100">
            <p class="text-[10px] text-purple-600 uppercase tracking-[0.35em] font-semibold mb-1">创建时间</p>
            <p class="text-purple-700 font-bold text-sm">{{ formatTime(task.created_at) }}</p>
          </div>
          <div class="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
            <p class="text-[10px] text-indigo-600 uppercase tracking-[0.35em] font-semibold mb-1">站点</p>
            <p class="text-indigo-700 font-bold text-sm truncate">{{ task.site_name || task.site_id || '--' }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useFormatters } from '../composables/useFormatters';

defineProps({
  tasks: {
    type: Array,
    default: () => []
  }
});

const { formatTime, formatSize } = useFormatters();

const getTaskStatusClass = (status) => {
  const map = {
    'Pending': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Running': 'bg-blue-100 text-blue-700 border border-blue-200',
    'Completed': 'bg-green-100 text-green-700 border border-green-200',
    'Failed': 'bg-red-100 text-red-700 border border-red-200'
  };
  return map[status] || 'bg-slate-100 text-slate-700 border border-slate-200';
};
</script>

<style scoped>
.dashboard-card {
  background: #fff;
  border-radius: 1.25rem;
  border: 2px solid #e2e8f0;
  padding: 1.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out;
}
</style>
