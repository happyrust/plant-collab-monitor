import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { useAdminAuthStore } from '@/stores/adminAuth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    requiresAdmin?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '全局概览' },
  },
  {
    path: '/topology',
    name: 'topology',
    component: () => import('@/views/TopologyView.vue'),
    meta: { title: '异地拓扑', requiresAdmin: true },
  },
  {
    path: '/topology-viz',
    name: 'topology-viz',
    component: () => import('@/views/TopologyVisualizationView.vue'),
    meta: { title: '拓扑可视化' },
  },
  {
    path: '/tasks',
    name: 'tasks',
    component: () => import('@/views/TasksView.vue'),
    meta: { title: '任务队列' },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/SyncHistoryView.vue'),
    meta: { title: '同步历史' },
  },
  {
    path: '/mqtt/messages',
    name: 'mqtt-messages',
    component: () => import('@/views/MqttMessagesView.vue'),
    meta: { title: 'MQTT 消息' },
  },
  {
    path: '/mqtt/nodes',
    name: 'mqtt-nodes',
    component: () => import('@/views/MqttNodesView.vue'),
    meta: { title: 'MQTT 节点', requiresAdmin: true },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/views/LogsView.vue'),
    meta: { title: '系统日志' },
  },
  {
    path: '/archives',
    name: 'archives',
    component: () => import('@/views/ArchivesView.vue'),
    meta: { title: '归档管理', requiresAdmin: true },
  },
  {
    path: '/site-config',
    name: 'site-config',
    component: () => import('@/views/SiteConfigView.vue'),
    meta: { title: '站点配置', requiresAdmin: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '参数设置', requiresAdmin: true },
  },
];

const router = createRouter({
  // 与 vite.config.ts 的 base 联动；生产环境默认 /monitor/
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// 登录后期望返回的目标路由（被 guard 拦截时记录，登录成功后由 LoginDialog 消费）
const REDIRECT_KEY = 'admin_redirect_after_login';

function rememberRedirect(fullPath: string): void {
  try {
    sessionStorage.setItem(REDIRECT_KEY, fullPath);
  } catch {
    // ignore
  }
}

export function consumeRedirectAfterLogin(): string | null {
  try {
    const v = sessionStorage.getItem(REDIRECT_KEY);
    if (v) sessionStorage.removeItem(REDIRECT_KEY);
    return v;
  } catch {
    return null;
  }
}

router.beforeEach((to) => {
  if (to.meta?.requiresAdmin) {
    // 在守卫里直接 useStore 是安全的：Pinia 已在 main.ts 安装到 app 上
    const adminAuth = useAdminAuthStore();
    if (!adminAuth.isLoggedIn) {
      rememberRedirect(to.fullPath);
      adminAuth.promptLogin('该页面需要管理员登录');
      return { name: 'dashboard', replace: true };
    }
  }
  return true;
});

router.afterEach((to) => {
  const t = typeof to.meta?.title === 'string' ? to.meta.title : '';
  document.title = t ? `${t} · plant-collab-monitor` : 'plant-collab-monitor';
});

router.onError((err) => {
  console.error('[Router Error]', err?.message || err);
});

export default router;
