<template>
  <NConfigProvider :theme="themeStore.isDark ? darkTheme : null" :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider>
      <NDialogProvider>
      <div class="min-h-screen flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <!-- 侧栏 -->
        <aside
          :class="[
            'flex flex-col border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 transition-[width] duration-300',
            sidebarCollapsed ? 'w-16' : 'w-64',
          ]"
        >
          <div class="py-6 flex items-center gap-3 border-b border-slate-200 dark:border-slate-700" :class="sidebarCollapsed ? 'px-2 justify-center' : 'px-6'">
            <div
              class="w-10 h-10 rounded-2xl bg-blue-600/90 flex items-center justify-center text-white text-lg font-semibold shadow-lg shadow-blue-900/20 shrink-0"
            >
              AI
            </div>
            <div v-if="!sidebarCollapsed" class="overflow-hidden">
              <p class="text-xs uppercase tracking-[0.35em] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                PLANT · COLLAB
              </p>
              <p class="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Monitor</p>
            </div>
          </div>

          <nav class="flex-1 py-6 space-y-1 text-sm overflow-y-auto" :class="sidebarCollapsed ? 'px-1' : 'px-3'">
            <div v-if="!sidebarCollapsed" class="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                :class="[{ active: isActive }, sidebarCollapsed ? 'justify-center px-2' : '']"
                :title="sidebarCollapsed ? `${item.label}${item.admin ? ' 🔒' : ''}` : undefined"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center shrink-0">{{ item.icon }}</span>
                <span v-if="!sidebarCollapsed">{{ item.label }}<span v-if="item.admin" class="ml-1 text-[10px] opacity-50">🔒</span></span>
              </button>
            </RouterLink>

            <div v-if="!sidebarCollapsed" class="px-3 mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              任务与日志
            </div>
            <div v-else class="mt-4"></div>
            <RouterLink
              v-for="item in navTasks"
              :key="item.name"
              :to="item.path"
              v-slot="{ isActive }"
              custom
            >
              <button
                class="nav-link w-full"
                :class="[{ active: isActive }, sidebarCollapsed ? 'justify-center px-2' : '']"
                :title="sidebarCollapsed ? `${item.label}${item.admin ? ' 🔒' : ''}` : undefined"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center shrink-0">{{ item.icon }}</span>
                <span v-if="!sidebarCollapsed">{{ item.label }}<span v-if="item.admin" class="ml-1 text-[10px] opacity-50">🔒</span></span>
              </button>
            </RouterLink>

            <div v-if="!sidebarCollapsed" class="px-3 mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              系统
            </div>
            <div v-else class="mt-4"></div>
            <RouterLink
              v-for="item in navSystem"
              :key="item.name"
              :to="item.path"
              v-slot="{ isActive }"
              custom
            >
              <button
                class="nav-link w-full"
                :class="[{ active: isActive }, sidebarCollapsed ? 'justify-center px-2' : '']"
                :title="sidebarCollapsed ? `${item.label}${item.admin ? ' 🔒' : ''}` : undefined"
                @click="$router.push(item.path)"
              >
                <span class="w-6 text-center shrink-0">{{ item.icon }}</span>
                <span v-if="!sidebarCollapsed">{{ item.label }}<span v-if="item.admin" class="ml-1 text-[10px] opacity-50">🔒</span></span>
              </button>
            </RouterLink>
          </nav>

          <div class="px-2 py-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center" :class="sidebarCollapsed ? 'flex-col gap-2' : 'justify-between px-4'">
            <span class="flex items-center gap-2" :class="sidebarCollapsed ? 'flex-col' : ''">
              <button
                @click="themeStore.toggle()"
                class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                :title="themeStore.isDark ? '切换为浅色模式' : '切换为深色模式'"
              >
                {{ themeStore.isDark ? '☀' : '🌙' }}
              </button>
              <button
                @click="toggleSidebar"
                class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                :title="sidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
              >
                {{ sidebarCollapsed ? '»' : '«' }}
              </button>
              <span v-if="!sidebarCollapsed">v0.1.0</span>
            </span>
            <button
              v-if="adminAuth.isLoggedIn && !sidebarCollapsed"
              class="text-emerald-600 hover:text-emerald-700"
              :title="`已登录: ${adminAuth.username}, 角色: ${adminAuth.role}`"
              @click="handleLogout"
            >
              {{ adminAuth.username }} ⏎
            </button>
            <button
              v-else-if="!adminAuth.isLoggedIn && !sidebarCollapsed"
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
          <div v-if="currentPageTitle" class="px-6 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            PLANT · COLLAB › <span class="font-medium text-slate-700 dark:text-slate-300">{{ currentPageTitle }}</span>
          </div>
          <div class="flex-1 overflow-auto">
            <RouterView v-slot="{ Component }">
              <Transition name="page" mode="out-in">
                <component :is="Component" />
              </Transition>
            </RouterView>
          </div>
        </main>

        <LoginDialog />
      </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
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
import { useThemeStore } from '@/stores/theme';
import { useFaviconBadge } from '@/composables/useFaviconBadge';

const themeStore = useThemeStore();
const adminAuth = useAdminAuthStore();
useFaviconBadge();

const SIDEBAR_KEY = 'sidebar_collapsed';
const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1');

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0');
}

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

function handleKeydown(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.altKey && e.key === 'd') { e.preventDefault(); themeStore.toggle(); }
  if (e.altKey && e.key === 'b') { e.preventDefault(); toggleSidebar(); }
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown);
  if (adminAuth.token) {
    try {
      const profile = await adminAuthApi.me();
      adminAuth.updateProfile(profile);
    } catch {
      adminAuth.clearSession();
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

const route = useRoute();
const currentPageTitle = computed(() => {
  const t = route.meta?.title;
  return typeof t === 'string' ? t : '';
});

const navMonitor = [
  { name: 'dashboard', path: '/dashboard', icon: '◉', label: '全局概览' },
  { name: 'topology', path: '/topology', icon: '◇', label: '异地拓扑', admin: true },
  { name: 'topology-viz', path: '/topology-viz', icon: '◆', label: '拓扑可视化' },
];

const navTasks = [
  { name: 'tasks', path: '/tasks', icon: '▤', label: '任务队列' },
  { name: 'history', path: '/history', icon: '⟲', label: '同步历史' },
  { name: 'mqtt', path: '/mqtt/messages', icon: '⚡', label: 'MQTT 消息' },
  { name: 'mqtt-nodes', path: '/mqtt/nodes', icon: '◎', label: 'MQTT 节点', admin: true },
  { name: 'logs', path: '/logs', icon: '▦', label: '系统日志' },
  { name: 'archives', path: '/archives', icon: '▣', label: '归档管理', admin: true },
];

const navSystem = [
  { name: 'site-config', path: '/site-config', icon: '⚙', label: '站点配置', admin: true },
  { name: 'settings', path: '/settings', icon: '⚒', label: '参数设置', admin: true },
];
</script>
