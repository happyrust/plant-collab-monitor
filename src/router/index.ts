import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

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
    meta: { title: '异地拓扑' },
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
    meta: { title: 'MQTT 节点' },
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
    meta: { title: '归档管理' },
  },
  {
    path: '/site-config',
    name: 'site-config',
    component: () => import('@/views/SiteConfigView.vue'),
    meta: { title: '站点配置' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '参数设置' },
  },
];

const router = createRouter({
  // 与 vite.config.ts 的 base 联动；生产环境默认 /monitor/
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.afterEach((to) => {
  const t = typeof to.meta?.title === 'string' ? to.meta.title : '';
  document.title = t ? `${t} · plant-collab-monitor` : 'plant-collab-monitor';
});

export default router;
