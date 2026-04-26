<template>
  <div class="modern-log-container animate-fade-in-up">
    <!-- Header Section -->
    <div class="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <div class="icon-wrapper">
          <i class="fas fa-terminal text-white text-lg"></i>
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-[0.35em] text-slate-400 font-semibold mb-1.5">后台日志</p>
          <h2 class="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-200 dark:to-slate-400 bg-clip-text text-transparent mb-1">
            实时检测输出
          </h2>
          <p class="text-sm text-slate-600 flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {{ logs.length }} 条记录 · 自动滚动{{ autoScroll ? '已启用' : '已禁用' }}
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <button
          @click="toggleAutoScroll"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 shadow-md hover:shadow-lg',
            autoScroll
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-2 border-green-400'
              : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-2 border-slate-300 dark:border-slate-600 hover:border-slate-400'
          ]"
        >
          <i :class="['fas', autoScroll ? 'fa-lock' : 'fa-lock-open', 'text-[10px]']"></i>
          {{ autoScroll ? '自动滚动' : '手动滚动' }}
        </button>
        <button
          @click="clearLogs"
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-red-500 to-pink-600 text-white border-2 border-red-400 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105"
        >
          <i class="fas fa-trash-alt text-[10px]"></i>清空日志
        </button>
      </div>
    </div>

    <!-- Log Viewer -->
    <div
      ref="logContainer"
      @scroll="handleScroll"
      class="log-viewer-modern text-xs p-5 max-h-96 overflow-y-auto"
    >
      <!-- Empty State -->
      <div v-if="logs.length === 0" class="empty-state">
        <div class="empty-icon-wrapper">
          <i class="fas fa-inbox text-6xl text-slate-300"></i>
        </div>
        <p class="text-slate-500 text-lg font-semibold mt-4">暂无日志记录</p>
        <p class="text-slate-400 text-sm mt-2">系统运行日志将在此处显示</p>
      </div>

      <!-- Log Entries -->
      <div
        v-for="(log, index) in logs"
        :key="index"
        :class="['log-entry-modern', getLogClass(log)]"
        :style="{ animationDelay: `${Math.min(index * 0.02, 1)}s` }"
      >
        <div class="log-icon-wrapper">
          <i :class="['fas', getLogIcon(log), 'log-icon']"></i>
        </div>
        <div class="log-content">
          <div class="log-header">
            <span class="log-level-badge">{{ log.level || 'INFO' }}</span>
            <span class="log-timestamp-modern">{{ formatLogTime(log.timestamp) }}</span>
          </div>
          <div class="log-message-modern">{{ log.message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue';

interface LogEntry {
  level?: string;
  message?: string;
  timestamp?: string | number;
  [key: string]: unknown;
}

const props = withDefaults(defineProps<{ logs?: LogEntry[] }>(), {
  logs: () => [],
});

const emit = defineEmits<{ clear: [] }>();

const logContainer = ref<HTMLElement | null>(null);
const autoScroll = ref<boolean>(true);

const ICON_MAP: Record<string, string> = {
  INFO: 'fa-info-circle',
  SUCCESS: 'fa-check-circle',
  WARN: 'fa-exclamation-triangle',
  WARNING: 'fa-exclamation-triangle',
  ERROR: 'fa-times-circle',
  DEBUG: 'fa-bug',
};

function getLogIcon(log: LogEntry): string {
  const level = (log.level || 'INFO').toUpperCase();
  return ICON_MAP[level] ?? 'fa-circle';
}

function getLogClass(log: LogEntry): Record<string, boolean> {
  const level = (log.level || 'INFO').toUpperCase();
  return {
    'log-modern-error': level === 'ERROR',
    'log-modern-warning': level === 'WARN' || level === 'WARNING',
    'log-modern-success': level === 'SUCCESS',
    'log-modern-debug': level === 'DEBUG',
    'log-modern-info': level === 'INFO',
  };
}

function formatLogTime(timestamp: string | number | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function scrollToBottom(): void {
  if (!autoScroll.value) return;
  nextTick(() => {
    const el = logContainer.value;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  });
}

function toggleAutoScroll(): void {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value) {
    scrollToBottom();
  }
}

function clearLogs(): void {
  emit('clear');
}

function handleScroll(): void {
  const el = logContainer.value;
  if (!el) return;
  const { scrollTop, scrollHeight, clientHeight } = el;
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

  // 如果用户手动滚动到底部，重新启用自动滚动；
  // 如果用户向上滚动，禁用自动滚动。
  if (isAtBottom && !autoScroll.value) {
    autoScroll.value = true;
  } else if (!isAtBottom && autoScroll.value) {
    autoScroll.value = false;
  }
}

watch(
  () => props.logs.length,
  () => {
    scrollToBottom();
  },
);

onMounted(() => {
  scrollToBottom();
});
</script>

<style scoped>
.modern-log-container {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 1.5rem;
  border: 2px solid #e2e8f0;
  padding: 1.75rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}
:where(.dark) .modern-log-container {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-color: #334155;
}

.icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.log-viewer-modern {
  font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%);
  backdrop-filter: blur(10px);
  border-radius: 1.25rem;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
  position: relative;
}
:where(.dark) .log-viewer-modern {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%);
  border-color: rgba(51, 65, 85, 0.8);
}

.log-viewer-modern::-webkit-scrollbar {
  width: 10px;
}

.log-viewer-modern::-webkit-scrollbar-track {
  background: rgba(226, 232, 240, 0.5);
  border-radius: 10px;
  margin: 4px;
}

.log-viewer-modern::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #64748b 0%, #475569 100%);
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.log-viewer-modern::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #475569 0%, #334155 100%);
  background-clip: padding-box;
}

.log-entry-modern {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
  border-radius: 1rem;
  background: white;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: slideInRight 0.4s ease-out backwards;
}
:where(.dark) .log-entry-modern {
  background: #1e293b;
  border-color: rgba(51, 65, 85, 0.8);
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.log-entry-modern:hover {
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: rgba(148, 163, 184, 0.5);
}

.log-icon-wrapper {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.log-entry-modern:hover .log-icon-wrapper {
  transform: scale(1.1) rotate(5deg);
}

.log-content {
  flex: 1;
  min-width: 0;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.log-level-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.log-timestamp-modern {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
}

.log-message-modern {
  font-size: 0.875rem;
  line-height: 1.6;
  color: #334155;
  word-break: break-word;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
:where(.dark) .log-message-modern {
  color: #cbd5e1;
}

/* INFO - Blue Theme */
.log-modern-info .log-icon-wrapper {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: #1e40af;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

.log-modern-info .log-level-badge {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
}

.log-modern-info:hover {
  border-color: #93c5fd;
  background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
}
:where(.dark) .log-modern-info:hover { background: linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%); }

/* SUCCESS - Green Theme */
.log-modern-success .log-icon-wrapper {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #047857;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.15);
}

.log-modern-success .log-level-badge {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
}

.log-modern-success:hover {
  border-color: #6ee7b7;
  background: linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%);
}
:where(.dark) .log-modern-success:hover { background: linear-gradient(135deg, #1e293b 0%, #064e3b 100%); }

/* WARNING - Orange Theme */
.log-modern-warning .log-icon-wrapper {
  background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
  color: #c2410c;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);
}

.log-modern-warning .log-level-badge {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

.log-modern-warning:hover {
  border-color: #fcd34d;
  background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
}
:where(.dark) .log-modern-warning:hover { background: linear-gradient(135deg, #1e293b 0%, #451a03 100%); }

/* ERROR - Red Theme */
.log-modern-error .log-icon-wrapper {
  background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
  color: #b91c1c;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.15);
}

.log-modern-error .log-level-badge {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
}

.log-modern-error:hover {
  border-color: #fca5a5;
  background: linear-gradient(135deg, #ffffff 0%, #fef2f2 100%);
}
:where(.dark) .log-modern-error:hover { background: linear-gradient(135deg, #1e293b 0%, #450a0a 100%); }

/* DEBUG - Purple Theme */
.log-modern-debug .log-icon-wrapper {
  background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
  color: #7e22ce;
  box-shadow: 0 2px 8px rgba(168, 85, 247, 0.15);
}

.log-modern-debug .log-level-badge {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(168, 85, 247, 0.3);
}

.log-modern-debug:hover {
  border-color: #d8b4fe;
  background: linear-gradient(135deg, #ffffff 0%, #faf5ff 100%);
}
:where(.dark) .log-modern-debug:hover { background: linear-gradient(135deg, #1e293b 0%, #3b0764 100%); }

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 2rem;
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.empty-icon-wrapper {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
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
