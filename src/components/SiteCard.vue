<template>
  <div class="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all animate-fade-in-up">
    <div class="flex flex-col gap-5">
      <!-- 站点头部 -->
      <div class="flex flex-wrap justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <p class="text-[10px] text-slate-400 uppercase tracking-[0.35em] font-semibold mb-2">
            {{ site.site_id || 'DEFAULT' }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <h3 class="text-xl font-bold text-slate-900 truncate">{{ site.site_name }}</h3>
            <span :class="['status-chip', getStatusClass(site.detection_status), { 'scanning-animation': site.detection_status === 'Scanning' }]">
              <i :class="[getStatusIcon(site.detection_status), 'text-xs']"></i>
              {{ getStatusText(site.detection_status) }}
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="flex flex-wrap gap-2 justify-end">
          <NButton
            v-if="site.detection_status === 'Idle' || site.detection_status === 'Completed'"
            @click="$emit('detect', site.site_id)"
            type="info"
            secondary
            round
            size="small"
          >
            <template #icon>
              <i class="fas fa-search text-[10px]"></i>
            </template>
            检测变更
          </NButton>
          <NButton
            v-if="site.detection_status === 'ChangesDetected'"
            @click="$emit('sync', site.site_id)"
            type="success"
            secondary
            round
            size="small"
          >
            <template #icon>
              <i class="fas fa-sync text-[10px]"></i>
            </template>
            开始同步
          </NButton>
          <NButton
            v-if="site.detection_status === 'Scanning' || site.detection_status === 'Syncing'"
            @click="$emit('abort', site.site_id)"
            type="error"
            secondary
            round
            size="small"
          >
            <template #icon>
              <i class="fas fa-stop text-[10px]"></i>
            </template>
            中止
          </NButton>
          <NButton
            @click="$emit('detail', site.site_id)"
            secondary
            round
            size="small"
          >
            <template #icon>
              <i class="fas fa-info-circle text-[10px]"></i>
            </template>
            详情
          </NButton>
        </div>
      </div>

      <!-- 统计指标 -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p class="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-semibold mb-1.5">上次同步</p>
          <p class="text-slate-900 font-bold text-sm">{{ formatTime(site.last_sync_time) }}</p>
        </div>
        <div class="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p class="text-[10px] uppercase tracking-[0.35em] text-amber-600 font-semibold mb-1.5">待同步</p>
          <p class="text-amber-700 font-bold text-sm">{{ site.pending_items }}</p>
        </div>
        <div class="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
          <p class="text-[10px] uppercase tracking-[0.35em] text-emerald-600 font-semibold mb-1.5">已同步</p>
          <p class="text-emerald-700 font-bold text-sm">{{ site.synced_items }}</p>
        </div>
        <div class="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <p class="text-[10px] uppercase tracking-[0.35em] text-blue-600 font-semibold mb-1.5">增量大小</p>
          <p class="text-blue-700 font-bold text-sm">{{ formatSize(site.increment_size) }}</p>
        </div>
      </div>

      <!-- 变更文件列表 -->
      <div v-if="changedFiles.length > 0" class="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
        <div class="text-[10px] font-bold text-slate-600 mb-3 tracking-[0.35em] uppercase">最近变更</div>
        <div class="space-y-2.5">
          <div
            v-for="file in displayFiles"
            :key="file.path"
            class="flex flex-wrap items-center text-xs text-slate-600 gap-2 bg-white rounded-lg p-2.5 border border-slate-200"
          >
            <span :class="['px-2.5 py-1 rounded-full font-bold text-[10px]', getChangeTypeClass(file.change_type)]">
              {{ getChangeTypeIcon(file.change_type) }} {{ getChangeTypeLabel(file.change_type) }}
            </span>
            <span class="font-mono text-slate-700 flex-1 truncate text-xs">{{ file.path }}</span>
            <span class="text-slate-500 font-semibold text-[10px]">{{ formatSize(file.size) }}</span>
          </div>
          <div v-if="moreFilesCount > 0" class="text-xs text-slate-500 text-center py-1 font-medium">
            还有 {{ moreFilesCount }} 个文件等待同步…
          </div>
        </div>
      </div>
      <div v-else class="text-sm text-slate-400 italic py-2 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
        暂无新的变更文件
      </div>

      <!-- 同步进度条 -->
      <div v-if="site.detection_status === 'Syncing' && site.sync_progress !== undefined" class="mt-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs font-semibold text-slate-700">同步进度</span>
          <span class="text-xs font-bold text-blue-700">{{ site.sync_progress }}%</span>
        </div>
        <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
          <div
            class="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
            :style="{ width: site.sync_progress + '%' }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { NButton } from 'naive-ui';
import { useFormatters } from '@/composables/useFormatters';

const props = defineProps({
  site: {
    type: Object,
    required: true
  }
});

defineEmits(['detect', 'sync', 'abort', 'detail']);

const { formatTime, formatSize, getStatusClass, getStatusText, getStatusIcon, getChangeTypeClass, getChangeTypeLabel, getChangeTypeIcon } = useFormatters();

const changedFiles = computed(() => props.site.changed_files || []);
const displayFiles = computed(() => changedFiles.value.slice(0, 4));
const moreFilesCount = computed(() => Math.max(0, changedFiles.value.length - displayFiles.value.length));
</script>

<style scoped>
.status-chip {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.25rem 0.75rem;
  border: 1px solid transparent;
}

.status-idle { background-color: rgba(148, 163, 184, 0.18); color: #0f172a; border-color: rgba(148, 163, 184, 0.4); }
.status-scanning { background-color: rgba(59, 130, 246, 0.15); color: #1d4ed8; border-color: rgba(59, 130, 246, 0.4); }
.status-changes-detected { background-color: rgba(251, 191, 36, 0.18); color: #b45309; border-color: rgba(251, 191, 36, 0.4); }
.status-syncing { background-color: rgba(16, 185, 129, 0.18); color: #047857; border-color: rgba(16, 185, 129, 0.4); }
.status-completed { background-color: rgba(16, 185, 129, 0.18); color: #047857; border-color: rgba(16, 185, 129, 0.4); }
.status-error { background-color: rgba(248, 113, 113, 0.2); color: #b91c1c; border-color: rgba(248, 113, 113, 0.4); }

.change-added { background-color: rgba(34, 197, 94, 0.12); color: #15803d; }
.change-modified { background-color: rgba(245, 158, 11, 0.2); color: #b45309; }
.change-deleted { background-color: rgba(248, 113, 113, 0.25); color: #b91c1c; }

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.48); }
  100% { box-shadow: 0 0 0 22px rgba(59, 130, 246, 0); }
}

.scanning-animation {
  animation: pulse-ring 2s infinite;
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out;
}
</style>
