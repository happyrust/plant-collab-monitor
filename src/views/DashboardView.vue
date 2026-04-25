<template>
  <section class="px-8 py-8 max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <header class="flex items-start justify-between border-b border-slate-200 pb-5">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">全局概览</h1>
        <p class="mt-2 text-slate-600">
          异地协同站点运行时关键指标 · 30s 自动刷新
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NSwitch v-model:value="autoRefresh" size="small" @update:value="onAutoRefreshChange">
          <template #checked>自动刷新</template>
          <template #unchecked>手动</template>
        </NSwitch>
        <NButton type="primary" :loading="loading" @click="refreshAll">
          <template #icon>
            <i class="fas fa-rotate"></i>
          </template>
          刷新
        </NButton>
      </div>
    </header>

    <!-- 6 cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <!-- 1. 站点身份 -->
      <DashCard
        title="当前站点"
        :status="sections.identity.status"
        :error="sections.identity.error"
        accent="blue"
      >
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-bold text-slate-900">{{ identity.location || '—' }}</span>
          <span
            v-if="identity.role"
            class="text-xs px-2 py-0.5 rounded-full"
            :class="identity.isMaster ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'"
          >{{ identity.role }}</span>
        </div>
        <p class="text-xs text-slate-500 mt-1">
          {{ identity.projectName || '未配置项目名' }}
        </p>
      </DashCard>

      <!-- 2. Runtime -->
      <DashCard
        title="同步引擎"
        :status="sections.syncStatus.status"
        :error="sections.syncStatus.error"
        :accent="syncStatusAccent"
      >
        <div class="flex items-baseline gap-2">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="syncStatusDotClass"
          ></span>
          <span class="text-xl font-bold capitalize text-slate-900">
            {{ syncStatusLabel || '未知' }}
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-1">
          QPS {{ formatNumber(syncMetricsObj.qps) }} · p95 {{ formatNumber(syncMetricsObj.p95_ms) }}ms
        </p>
      </DashCard>

      <!-- 3. 节点汇总 -->
      <DashCard
        title="MQTT 节点"
        :status="sections.mqttNodes.status"
        :error="sections.mqttNodes.error"
        accent="emerald"
      >
        <div class="flex items-baseline gap-1">
          <span class="text-2xl font-bold text-emerald-600">{{ nodeSummary.online }}</span>
          <span class="text-sm text-slate-500">/ {{ nodeSummary.total }} 在线</span>
        </div>
        <p class="text-xs text-slate-500 mt-1">
          离线 {{ nodeSummary.offline }} · 主节点 {{ nodeSummary.masterCount }}
        </p>
      </DashCard>

      <!-- 4. 队列 -->
      <DashCard
        title="任务队列"
        :status="sections.queue.status"
        :error="sections.queue.error"
        accent="amber"
      >
        <div class="text-2xl font-bold text-slate-900">{{ queueSummary.waiting + queueSummary.running }}</div>
        <p class="text-xs text-slate-500 mt-1">
          等待 {{ queueSummary.waiting }} · 运行 {{ queueSummary.running }} · 失败 {{ queueSummary.failed }}
        </p>
      </DashCard>

      <!-- 5. 24h 任务量 -->
      <DashCard
        title="24h 任务量"
        :status="sections.syncMetrics.status"
        :error="sections.syncMetrics.error"
        accent="indigo"
      >
        <div class="text-2xl font-bold text-indigo-600">{{ syncMetricsObj.tasks_24h ?? '—' }}</div>
        <p class="text-xs text-slate-500 mt-1">
          成功率 {{ formatPercent(syncMetricsObj.success_rate) }}
        </p>
      </DashCard>

      <!-- 6. 失败数 -->
      <DashCard
        title="失败数 (24h)"
        :status="sections.syncMetrics.status"
        :error="sections.syncMetrics.error"
        :accent="failedAccent"
      >
        <div class="text-2xl font-bold" :class="failedTextClass">
          {{ syncMetricsObj.failed_count ?? '—' }}
        </div>
        <p class="text-xs text-slate-500 mt-1">
          错误率 {{ formatPercent(syncMetricsObj.error_rate) }}
        </p>
      </DashCard>
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SyncTrendChart :data="trendChartData" />
      <SiteStatusChart title="站点状态分布" :segments="statusChartSegments" />
    </div>

    <!-- Recent events -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div class="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-stream text-slate-500"></i>
          <span class="font-semibold text-slate-700">最近事件</span>
          <span class="text-xs text-slate-400">{{ recentEvents.length }} 条</span>
        </div>
        <RouterLink to="/history" class="text-xs text-blue-600 hover:underline">查看全部 →</RouterLink>
      </div>

      <div v-if="sections.history.status === 'loading' && recentEvents.length === 0" class="p-8 text-center text-slate-400 text-sm">
        加载中...
      </div>
      <div v-else-if="sections.history.status === 'error'" class="p-8 text-center text-rose-500 text-sm">
        {{ sections.history.error }}
      </div>
      <div v-else-if="recentEvents.length === 0" class="p-8 text-center text-slate-400 text-sm">
        暂无事件
      </div>
      <ul v-else class="divide-y divide-slate-100">
        <li v-for="(ev, idx) in recentEvents" :key="ev.id || idx" class="px-5 py-3 flex items-center gap-4 text-sm hover:bg-slate-50 transition-colors">
          <span
            class="text-xs px-2 py-0.5 rounded font-mono"
            :class="eventBadgeClass(ev)"
          >{{ eventLabel(ev) }}</span>
          <span class="text-slate-700 flex-1 truncate">
            <span v-if="ev.location" class="font-semibold mr-2">{{ ev.location }}</span>
            {{ eventMessage(ev) }}
          </span>
          <span class="text-xs text-slate-400 shrink-0">{{ formatRelativeTime(ev.timestamp) }}</span>
        </li>
      </ul>
    </div>

    <!-- Footer status line -->
    <div class="text-xs text-slate-400 text-center">
      最后更新：{{ lastUpdatedLabel }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, h, type Component } from 'vue';
import { NButton, NSwitch } from 'naive-ui';
import { RouterLink } from 'vue-router';
import SyncTrendChart from '@/components/charts/SyncTrendChart.vue';
import SiteStatusChart from '@/components/charts/SiteStatusChart.vue';
import { useDashboardSummary } from '@/composables/useDashboardSummary';

const POLL_MS = 30_000;

const dashboard = useDashboardSummary({ pollMs: POLL_MS, immediate: true });
const sections = dashboard.sections;
const loading = dashboard.loading;
const refreshAll = dashboard.refreshAll;

const autoRefresh = ref(true);
function onAutoRefreshChange(val: boolean): void {
  if (val) {
    dashboard.startPolling();
  } else {
    dashboard.stopPolling();
  }
}

// ---------- DashCard 内联通用卡片 ----------
const DashCard: Component = {
  name: 'DashCard',
  props: {
    title: { type: String, required: true },
    status: { type: String, default: 'idle' },
    error: { type: String, default: null },
    accent: { type: String, default: 'slate' },
  },
  setup(props, { slots }) {
    const accentMap: Record<string, string> = {
      blue: 'border-l-blue-400',
      emerald: 'border-l-emerald-400',
      amber: 'border-l-amber-400',
      indigo: 'border-l-indigo-400',
      rose: 'border-l-rose-400',
      purple: 'border-l-purple-400',
      slate: 'border-l-slate-300',
    };
    return () =>
      h(
        'div',
        {
          class: [
            'bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-l-4 transition-all',
            accentMap[props.accent as string] || accentMap.slate,
            props.status === 'loading' ? 'opacity-70' : '',
          ],
        },
        [
          h(
            'div',
            { class: 'flex items-center justify-between mb-2' },
            [
              h('span', { class: 'text-xs font-semibold text-slate-500 uppercase tracking-wide' }, props.title),
              h('span', {
                class: [
                  'w-2 h-2 rounded-full',
                  props.status === 'success' ? 'bg-emerald-400' :
                  props.status === 'loading' ? 'bg-amber-400 animate-pulse' :
                  props.status === 'error' ? 'bg-rose-400' :
                  'bg-slate-300',
                ],
                title: props.error || props.status,
              }),
            ],
          ),
          h('div', { class: 'min-h-[3rem]' }, slots.default ? slots.default() : []),
        ],
      );
  },
};

// ---------- helpers ----------
function asAny(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  return {};
}

function pickNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function formatNumber(v: unknown): string {
  const n = pickNumber(v);
  return n === null ? '—' : (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

function formatPercent(v: unknown): string {
  const n = pickNumber(v);
  if (n === null) return '—';
  if (n <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function formatRelativeTime(t: unknown): string {
  if (!t) return '—';
  const ts = typeof t === 'number' ? t : Date.parse(String(t));
  if (Number.isNaN(ts)) return String(t);
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 时前`;
  return new Date(ts).toLocaleString('zh-CN');
}

// ---------- identity ----------
const identity = computed(() => {
  const raw = asAny(sections.identity.data);
  const config = asAny(raw.config);
  const merged = { ...config, ...raw };
  const role = (merged.role as string) || (merged.is_master ? 'master' : merged.is_master === false ? 'client' : '');
  const isMaster = role === 'master' || merged.is_master === true;
  return {
    location: (merged.location as string) || '',
    role,
    isMaster,
    projectName: (merged.project_name as string) || (config.project_name as string) || '',
  };
});

// ---------- sync status ----------
const syncStatusObj = computed(() => asAny(sections.syncStatus.data));

const syncStatusLabel = computed(() => {
  const obj = syncStatusObj.value;
  return (obj.status as string) || (obj.state as string) || '';
});

const syncStatusDotClass = computed(() => {
  const s = syncStatusLabel.value.toLowerCase();
  if (s.includes('run') || s === 'ok' || s === 'healthy') return 'bg-emerald-500 animate-pulse';
  if (s.includes('paus')) return 'bg-amber-500';
  if (s.includes('stop') || s.includes('idle')) return 'bg-slate-400';
  if (s.includes('error') || s.includes('fault')) return 'bg-rose-500';
  return 'bg-slate-300';
});

const syncStatusAccent = computed(() => {
  const s = syncStatusLabel.value.toLowerCase();
  if (s.includes('error') || s.includes('fault')) return 'rose';
  if (s.includes('paus')) return 'amber';
  if (s.includes('run')) return 'emerald';
  return 'slate';
});

// ---------- sync metrics ----------
const syncMetricsObj = computed(() => asAny(sections.syncMetrics.data));

const failedCount = computed(() => pickNumber(syncMetricsObj.value.failed_count) ?? 0);

const failedAccent = computed(() => (failedCount.value > 0 ? 'rose' : 'slate'));
const failedTextClass = computed(() => (failedCount.value > 0 ? 'text-rose-600' : 'text-slate-700'));

// ---------- queue ----------
const queueSummary = computed(() => {
  const raw = asAny(sections.queue.data);
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : Array.isArray(raw) ? (raw as unknown[]) : null;
  if (tasks) {
    const list = tasks as Array<Record<string, unknown>>;
    return {
      waiting: list.filter((t) => /(wait|pend)/i.test(String(t.status || ''))).length,
      running: list.filter((t) => /(run)/i.test(String(t.status || ''))).length,
      failed: list.filter((t) => /(fail|error)/i.test(String(t.status || ''))).length,
      total: list.length,
    };
  }
  return {
    waiting: pickNumber(raw.waiting) ?? 0,
    running: pickNumber(raw.running) ?? 0,
    failed: pickNumber(raw.failed) ?? 0,
    total: pickNumber(raw.total) ?? 0,
  };
});

// ---------- mqtt nodes summary ----------
const nodeSummary = computed(() => {
  const raw = asAny(sections.mqttNodes.data);
  const summary = asAny(raw.summary);
  if (Object.keys(summary).length > 0) {
    return {
      online: pickNumber(summary.online) ?? 0,
      offline: pickNumber(summary.offline) ?? 0,
      total: pickNumber(summary.total) ?? 0,
      masterCount: pickNumber(summary.master) ?? pickNumber(summary.master_count) ?? 0,
    };
  }
  const nodes = Array.isArray(raw.nodes)
    ? (raw.nodes as Array<Record<string, unknown>>)
    : Array.isArray(raw)
    ? (raw as Array<Record<string, unknown>>)
    : [];
  const online = nodes.filter((n) => n.online === true || n.status === 'online').length;
  const offline = nodes.length - online;
  const masterCount = nodes.filter((n) => n.is_master === true || n.role === 'master').length;
  return { online, offline, total: nodes.length, masterCount };
});

// ---------- charts data ----------
const trendChartData = computed(() => {
  const metrics = asAny(sections.syncMetrics.data);
  const history = Array.isArray(metrics.history)
    ? (metrics.history as Array<Record<string, unknown>>)
    : Array.isArray(metrics.daily)
    ? (metrics.daily as Array<Record<string, unknown>>)
    : [];
  if (history.length === 0) {
    return { dates: [], synced: [], pending: [] };
  }
  return {
    dates: history.map((h) => String(h.date || h.day || '')),
    synced: history.map((h) => pickNumber(h.synced) ?? pickNumber(h.success) ?? 0),
    pending: history.map((h) => pickNumber(h.pending) ?? pickNumber(h.failed) ?? 0),
  };
});

const statusChartSegments = computed(() => {
  const ns = nodeSummary.value;
  return [
    { name: '在线', value: ns.online, color: '#10b981' },
    { name: '离线', value: ns.offline, color: '#ef4444' },
    { name: '主节点', value: ns.masterCount, color: '#a855f7' },
  ];
});

// ---------- recent events ----------
interface EventRow { id?: string; type?: string; status?: string; location?: string; message?: string; timestamp?: number | string; [k: string]: unknown }
const recentEvents = computed<EventRow[]>(() => {
  const raw = sections.history.data;
  const list = Array.isArray((raw as { history?: unknown[] })?.history)
    ? ((raw as { history: EventRow[] }).history)
    : Array.isArray(raw)
    ? (raw as EventRow[])
    : [];
  return list.slice(0, 10);
});

function eventLabel(ev: EventRow): string {
  return String(ev.type || ev.status || 'event');
}

function eventBadgeClass(ev: EventRow): string {
  const k = `${ev.type || ''} ${ev.status || ''}`.toLowerCase();
  if (k.includes('fail') || k.includes('error')) return 'bg-rose-50 text-rose-600';
  if (k.includes('done') || k.includes('success') || k.includes('ok')) return 'bg-emerald-50 text-emerald-600';
  if (k.includes('warn')) return 'bg-amber-50 text-amber-600';
  return 'bg-slate-100 text-slate-600';
}

function eventMessage(ev: EventRow): string {
  return String(ev.message || ev.detail || ev.description || '');
}

// ---------- last updated ----------
const lastUpdatedLabel = computed(() => {
  const ts = Object.values(sections)
    .map((s) => (s.updatedAt ? Date.parse(s.updatedAt) : 0))
    .filter((n) => n > 0);
  if (ts.length === 0) return '—';
  return new Date(Math.max(...ts)).toLocaleString('zh-CN');
});
</script>

<style scoped>
/* ensure card grids adopt available width */
:deep(.n-button) {
  font-weight: 500;
}
</style>
