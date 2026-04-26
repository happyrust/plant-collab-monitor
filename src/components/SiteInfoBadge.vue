<template>
  <div class="relative group">
    <!-- 默认显示：站点名称 -->
    <div
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 transition-all cursor-pointer text-sm font-medium text-slate-700"
    >
      <i class="fas fa-building text-slate-500 text-xs"></i>
      <span>{{ displayName }}</span>
      <i class="fas fa-chevron-down text-slate-400 text-xs transition-transform group-hover:rotate-180"></i>
    </div>

    <!-- Hover 显示：详细信息弹窗 -->
    <div
      class="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50"
    >
      <div class="p-4 space-y-3">
        <!-- 站点名称 -->
        <div>
          <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">当前站点</div>
          <div class="text-sm font-bold text-slate-800">{{ siteName }}</div>
        </div>

        <!-- 角色/地区 -->
        <div class="pt-2 border-t border-slate-100">
          <div class="text-xs text-slate-500 uppercase tracking-wide mb-2">角色 / 地区</div>
          <div class="flex items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
              :class="roleClass"
            >
              <span class="w-1.5 h-1.5 rounded-full" :style="{ background: 'currentColor' }"></span>
              {{ roleText }}
            </span>
            <span class="text-sm text-slate-600">{{ location }}</span>
          </div>
        </div>

        <!-- 访问地址 -->
        <div class="pt-2 border-t border-slate-100">
          <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">访问地址</div>
          <div class="text-xs font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded break-all">
            {{ siteUrl }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { siteConfigApi } from '@/api';

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

const siteName = ref<string>('加载中...');
const location = ref<string>('');
const isMaster = ref<boolean>(false);
const siteUrl = ref<string>('');

const displayName = computed<string>(() => {
  if (!location.value) return siteName.value;
  return `${siteName.value} / ${location.value}`;
});

const roleText = computed<string>(() =>
  isMaster.value ? '主站（可发布 MQTT）' : '从站（订阅）',
);

const roleClass = computed<string>(() =>
  isMaster.value
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-blue-50 text-blue-700 border-blue-200',
);

async function loadSiteConfig(): Promise<void> {
  try {
    const data: unknown = await siteConfigApi.get();
    const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const cfg = (obj.config && typeof obj.config === 'object' ? obj.config : obj) as Record<string, unknown>;

    siteName.value =
      (typeof cfg.project_name === 'string' && cfg.project_name) ||
      (typeof cfg.project_code === 'string' && cfg.project_code) ||
      '未命名站点';
    location.value = typeof cfg.location === 'string' && cfg.location ? cfg.location : '未配置地区';
    isMaster.value = !!cfg.sync_live;
    siteUrl.value = window.location.origin;
  } catch (err) {
    console.error('加载站点配置失败:', errorMessage(err));
    siteName.value = '加载失败';
  }
}

onMounted(() => {
  loadSiteConfig();
});
</script>

<style scoped>
/* 确保弹窗在 hover 时不会消失 */
.group:hover .absolute {
  pointer-events: auto;
}
</style>
