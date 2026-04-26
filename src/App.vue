<template>
  <NConfigProvider :theme="isDark ? darkTheme : null" :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider>
      <NDialogProvider>
      <div class="min-h-screen flex h-screen overflow-hidden bg-slate-50 text-slate-900">
        <!-- 侧栏 -->
        <aside
          class="w-64 flex flex-col border-r border-slate-200 bg-white shrink-0"
        >
          <div class="px-6 py-6 flex items-center gap-3 border-b border-slate-200">
            <div
              class="w-12 h-12 rounded-2xl bg-blue-600/90 flex items-center justify-center text-white text-xl font-semibold shadow-lg shadow-blue-900/20"
            >
              AI
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.35em] font-medium text-slate-500">
                PLANT · COLLAB
              </p>
              <p class="text-lg font-bold tracking-tight text-slate-900">Monitor</p>
            </div>
          </div>

          <nav class="flex-1 px-3 py-6 space-y-1 text-sm overflow-y-auto">
            <div class="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              监控
            </div>
            <RouterLink
              v-for="item in navMonitor"
              :key="item.name"
              :to="item.path"
              v-slot="{ isActive }"
              custom
            >
              <button
                class="nav-link w-full"
                :class="{ active: isActive }"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </button>
            </RouterLink>

            <div class="px-3 mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">
              任务与日志
            </div>
            <RouterLink
              v-for="item in navTasks"
              :key="item.name"
              :to="item.path"
              v-slot="{ isActive }"
              custom
            >
              <button
                class="nav-link w-full"
                :class="{ active: isActive }"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </button>
            </RouterLink>

            <div class="px-3 mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">
              系统
            </div>
            <RouterLink
              v-for="item in navSystem"
              :key="item.name"
              :to="item.path"
              v-slot="{ isActive }"
              custom
            >
              <button
                class="nav-link w-full"
                :class="{ active: isActive }"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </button>
            </RouterLink>
          </nav>

          <div class="px-4 py-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>v0.1.0 · Phase 2</span>
            <button
              v-if="adminAuth.isLoggedIn"
              class="text-emerald-600 hover:text-emerald-700"
              :title="`已登录: ${adminAuth.username}, 角色: ${adminAuth.role}`"
              @click="handleLogout"
            >
              {{ adminAuth.username }} ⏎
            </button>
            <button
              v-else
              class="text-blue-600 hover:text-blue-700"
              @click="adminAuth.promptLogin()"
            >
              登录
            </button>
          </div>
        </aside>

        <!-- 主内容区 -->
        <main class="flex-1 flex flex-col overflow-hidden">
          <AppStatusBar />
          <div class="flex-1 overflow-auto">
            <RouterView />
          </div>
        </main>

        <LoginDialog />
      </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
// Provider 组件由 NaiveUiResolver 在 template 中自动注册；这里仅保留 theme/locale 等非组件 export
import { darkTheme, zhCN, dateZhCN } from 'naive-ui';
import LoginDialog from '@/components/LoginDialog.vue';
import AppStatusBar from '@/components/AppStatusBar.vue';
import {
  adminAuthApi,
  registerAuthTokenProvider,
  registerUnauthorizedHandler,
} from '@/api';
import { useAdminAuthStore } from '@/stores/adminAuth';

const isDark = ref(false);
const adminAuth = useAdminAuthStore();

registerAuthTokenProvider(() => adminAuth.token);

registerUnauthorizedHandler(({ status, message }) => {
  if (status === 503 && message.includes('管理员凭据未配置')) {
    adminAuth.markBackendUnconfigured();
    return;
  }
  if (status === 401 || status === 403) {
    if (adminAuth.isLoggedIn) {
      adminAuth.clearSession();
    }
    adminAuth.promptLogin('登录已过期，请重新登录');
    return;
  }
  if (status === 503) {
    adminAuth.promptLogin('该操作需要管理员权限，请登录');
  }
});

async function handleLogout(): Promise<void> {
  try {
    await adminAuthApi.logout();
  } catch {
    // 即使后端 logout 失败，也清本地
  }
  adminAuth.clearSession();
}

onMounted(async () => {
  if (adminAuth.token) {
    try {
      const profile = await adminAuthApi.me();
      adminAuth.updateProfile(profile);
    } catch {
      adminAuth.clearSession();
    }
  }
});

const navMonitor = [
  { name: 'dashboard', path: '/dashboard', icon: '◉', label: '全局概览' },
  { name: 'topology', path: '/topology', icon: '◇', label: '异地拓扑' },
  { name: 'topology-viz', path: '/topology-viz', icon: '◆', label: '拓扑可视化' },
];

const navTasks = [
  { name: 'tasks', path: '/tasks', icon: '▤', label: '任务队列' },
  { name: 'history', path: '/history', icon: '⟲', label: '同步历史' },
  { name: 'mqtt', path: '/mqtt/messages', icon: '⚡', label: 'MQTT 消息' },
  { name: 'mqtt-nodes', path: '/mqtt/nodes', icon: '◎', label: 'MQTT 节点' },
  { name: 'logs', path: '/logs', icon: '▦', label: '系统日志' },
  { name: 'archives', path: '/archives', icon: '▣', label: '归档管理' },
];

const navSystem = [
  { name: 'site-config', path: '/site-config', icon: '⚙', label: '站点配置' },
  { name: 'settings', path: '/settings', icon: '⚒', label: '参数设置' },
];
</script>
