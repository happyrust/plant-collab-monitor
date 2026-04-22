<template>
  <dialog class="modal" :class="{ 'modal-open': isOpen }">
    <div class="modal-box w-11/12 max-w-5xl bg-base-100 p-0 rounded-2xl overflow-hidden shadow-2xl">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-50/50">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <i class="fas fa-server text-xl"></i>
          </div>
          <div>
            <h3 class="font-bold text-lg text-base-content leading-tight">
              {{ site?.site_name || '站点详情' }}
            </h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs font-mono text-base-content/60 bg-base-200 px-1.5 py-0.5 rounded">
                {{ site?.site_id }}
              </span>
              <span :class="['badge badge-xs font-medium gap-1 py-2', getStatusClass(site?.detection_status)]">
                <i :class="['fas', getStatusIcon(site?.detection_status)]"></i>
                {{ getStatusText(site?.detection_status) }}
              </span>
            </div>
          </div>
        </div>
        <button @click="close" class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:text-base-content">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
        <!-- 关键指标卡片 -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="stat-card stat-card-warning">
            <div class="stat-icon-wrapper">
              <i class="fas fa-clock text-xl"></i>
            </div>
            <div class="stat-content">
              <div class="stat-label">待同步</div>
              <div class="stat-number">{{ site?.pending_items || 0 }}</div>
              <div class="stat-description">等待传输的项目</div>
            </div>
          </div>

          <div class="stat-card stat-card-success">
            <div class="stat-icon-wrapper">
              <i class="fas fa-check-circle text-xl"></i>
            </div>
            <div class="stat-content">
              <div class="stat-label">已同步</div>
              <div class="stat-number">{{ site?.synced_items || 0 }}</div>
              <div class="stat-description">本次会话完成</div>
            </div>
          </div>

          <div class="stat-card stat-card-info">
            <div class="stat-icon-wrapper">
              <i class="fas fa-hdd text-xl"></i>
            </div>
            <div class="stat-content">
              <div class="stat-label">增量大小</div>
              <div class="stat-number">{{ formatSize(site?.increment_size || 0) }}</div>
              <div class="stat-description">总数据量</div>
            </div>
          </div>
        </div>

        <!-- 详细信息网格 -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- 左侧：基本属性 -->
          <div class="space-y-4">
            <h4 class="section-title">
              <i class="fas fa-info-circle mr-2"></i>基本属性
            </h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="info-item">
                <span class="info-label">远程地址</span>
                <span class="info-value break-all">
                  {{ site?.remote_url || 'N/A' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">上次检测时间</span>
                <span class="info-value">
                  {{ formatTime(site?.last_detection) }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">上次同步时间</span>
                <span class="info-value">
                  {{ formatTime(site?.last_sync_time) || '-' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">预估耗时</span>
                <span class="info-value">
                  {{ site?.estimated_sync_time ? site.estimated_sync_time + 's' : '-' }}
                </span>
              </div>
            </div>
          </div>

          <!-- 右侧：同步进度 (如有) -->
          <div v-if="site?.detection_status === 'Syncing' || site?.sync_progress > 0" class="progress-card">
            <h4 class="section-title">
              <i class="fas fa-spinner mr-2"></i>当前进度
            </h4>
            <div class="flex items-center justify-between mb-2">
              <span class="text-base font-bold text-blue-700">{{ site.sync_progress }}%</span>
              <span class="loading loading-spinner loading-xs text-blue-600" v-if="site?.detection_status === 'Syncing'"></span>
            </div>
            <div class="progress-bar-wrapper">
              <div class="progress-bar-fill" :style="{ width: site.sync_progress + '%' }"></div>
            </div>
            <p class="text-xs text-slate-600 mt-2 text-center font-medium">
              正在同步中，请勿关闭页面
            </p>
          </div>

          <!-- 错误信息 (如有) -->
          <div v-if="site?.last_error" class="error-card">
            <i class="fas fa-exclamation-circle text-xl"></i>
            <div class="flex flex-col">
              <span class="font-bold text-red-900">发生错误</span>
              <span class="text-red-800 break-all">{{ site.last_error }}</span>
            </div>
          </div>
        </div>

        <!-- 变更文件列表 -->
        <div class="space-y-3">
          <div class="flex items-center justify-between pb-3">
            <h4 class="section-title">
              <i class="fas fa-file-alt mr-2"></i>变更文件详情 ({{ site?.changed_files?.length || 0 }})
            </h4>
            <span class="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
              仅显示最近 20 条
            </span>
          </div>

          <div class="file-table-wrapper">
            <div class="overflow-x-auto">
              <table class="file-table w-full">
                <thead>
                  <tr>
                    <th class="pl-5">文件名</th>
                    <th class="w-28">变更类型</th>
                    <th class="w-28 text-right">大小</th>
                    <th class="w-44 text-right pr-5">修改时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!site?.changed_files?.length">
                    <td colspan="4" class="text-center py-10 text-slate-400 italic">
                      <i class="fas fa-inbox text-3xl mb-2 block"></i>
                      暂无变更文件记录
                    </td>
                  </tr>
                  <tr v-for="(file, index) in site?.changed_files" :key="index" class="file-row">
                    <td class="pl-5 font-mono text-xs text-slate-700 truncate max-w-xs font-semibold" :title="file.path || file.name">
                      <i class="fas fa-file text-slate-400 mr-2"></i>{{ file.path || file.name }}
                    </td>
                    <td>
                      <span :class="['badge badge-xs font-bold px-2.5 py-2.5 gap-1', getChangeTypeClass(file.change_type || file.type)]">
                        {{ getChangeTypeIcon(file.change_type || file.type) }}
                        {{ getChangeTypeLabel(file.change_type || file.type) }}
                      </span>
                    </td>
                    <td class="text-right font-mono text-xs text-slate-600 font-semibold">
                      {{ formatSize(file.size) }}
                    </td>
                    <td class="text-right pr-5 text-xs text-slate-600 font-mono font-medium">
                      {{ formatTime(file.modified_time || file.modified) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-action bg-base-50/50 px-6 py-4 mt-0 border-t border-base-200">
        <button @click="close" class="btn btn-neutral min-w-[100px]">
          关闭
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button @click="close">close</button>
    </form>
  </dialog>
</template>

<script setup>
import { useFormatters } from '../composables/useFormatters';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  site: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['close']);

const {
  formatTime,
  formatSize,
  getStatusClass,
  getStatusText,
  getStatusIcon,
  getChangeTypeClass,
  getChangeTypeLabel,
  getChangeTypeIcon
} = useFormatters();

const close = () => {
  emit('close');
};
</script>

<style scoped>
.modal-box {
  max-height: 85vh;
}

/* Stat Cards - Vibrant and Modern */
.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.stat-card-warning {
  background: linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%);
  border: 2px solid #fdba74;
}

.stat-card-warning .stat-icon-wrapper {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}

.stat-card-success {
  background: linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 100%);
  border: 2px solid #6ee7b7;
}

.stat-card-success .stat-icon-wrapper {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.stat-card-info {
  background: linear-gradient(135deg, #eff6ff 0%, #bfdbfe 100%);
  border: 2px solid #93c5fd;
}

.stat-card-info .stat-icon-wrapper {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #475569;
  margin-bottom: 0.25rem;
}

.stat-number {
  font-size: 1.75rem;
  font-weight: 800;
  color: #1e293b;
  line-height: 1.2;
}

.stat-description {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.25rem;
  font-weight: 500;
}

/* Section Titles */
.section-title {
  font-size: 0.9375rem;
  font-weight: 800;
  color: #1e293b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 3px solid #e2e8f0;
  padding-bottom: 0.75rem;
  display: flex;
  align-items: center;
}

.section-title i {
  color: #3b82f6;
}

/* Info Items */
.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 0.75rem;
  border: 1px solid #cbd5e1;
}

.info-label {
  font-size: 0.6875rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1e293b;
}

/* Progress Card */
.progress-card {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 2px solid #93c5fd;
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.progress-bar-wrapper {
  width: 100%;
  height: 1.25rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 9999px;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 9999px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

/* Error Card */
.error-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%);
  border: 2px solid #fca5a5;
  border-radius: 1rem;
  color: #991b1b;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

/* File Table */
.file-table-wrapper {
  background: white;
  border-radius: 1rem;
  border: 2px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.file-table thead tr {
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
}

.file-table thead th {
  font-size: 0.75rem;
  font-weight: 800;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1rem 0.75rem;
  border-bottom: 2px solid #cbd5e1;
}

.file-table tbody .file-row {
  transition: all 0.2s ease;
  border-bottom: 1px solid #f1f5f9;
}

.file-table tbody .file-row:hover {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  transform: scale(1.01);
}

.file-table tbody td {
  padding: 1rem 0.75rem;
}
</style>
