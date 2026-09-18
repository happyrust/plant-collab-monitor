<template>
  <section class="px-8 py-8 max-w-7xl mx-auto" data-testid="relay-ledger-view">
    <header class="flex items-start justify-between gap-6 border-b border-slate-200 dark:border-slate-700 pb-6 mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">中继台账</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-400">
          本站点每次广播 / 接收源 db 文件的记录（校验结果、会话号、diff 计数），点任意一次广播看它改了哪些 RefNo。
        </p>
      </div>
      <div class="flex items-center gap-4 shrink-0">
        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <NSwitch v-model:value="autoRefresh" size="small" data-testid="ledger-auto-refresh" />
          30 s 自动刷新
        </label>
        <NButton type="primary" :loading="loading" data-testid="ledger-refresh" @click="refreshAll">刷新</NButton>
      </div>
    </header>

    <!-- 该后端没有这组端点 -->
    <div
      v-if="unavailable"
      data-testid="ledger-unavailable"
      class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <p class="font-semibold">该后端不提供台账 API</p>
      <p class="mt-1">
        需要 <code>plant-web-server</code> ≥ 2026-09-17（提交 <code>b61b7ca</code>，`/api/remote-sync/ledger/*`）。
        <code>plant-model-gen</code> 后端没有这组端点，台账只能用 <code>sqlite3</code> 看 <code>deployment_sites.sqlite</code>。
      </p>
    </div>

    <template v-else>
      <div v-if="errorMsg" data-testid="ledger-error" class="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
        {{ errorMsg }}
      </div>

      <!-- 汇总 chips -->
      <div data-testid="ledger-summary" class="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span class="chip" data-testid="chip-outbound-ok">广播 ok <b>{{ summaryCount('outbound', 'ok') }}</b></span>
        <span class="chip" data-testid="chip-inbound-ok">接收 ok <b>{{ summaryCount('inbound', 'ok') }}</b></span>
        <span class="chip" :class="(summary?.problems_total ?? 0) > 0 ? 'chip-rose' : ''" data-testid="chip-problems">
          问题行 <b>{{ summary?.problems_total ?? 0 }}</b>
        </span>
        <span class="chip" data-testid="chip-changes">变更总数 <b>{{ summary?.changes_total ?? 0 }}</b></span>
        <span class="chip" data-testid="chip-last-outbound">最近广播 <b>{{ formatTime(summary?.last_outbound_at) }}</b></span>
        <span class="chip" data-testid="chip-last-inbound">最近接收 <b>{{ formatTime(summary?.last_inbound_at) }}</b></span>
        <span class="chip" data-testid="chip-watermarks">水位 <b>{{ summary?.watermarks_total ?? 0 }}</b></span>
        <span v-if="summary?.since" class="text-xs text-slate-400">（计数按所选时间范围）</span>
      </div>

      <!-- 筛选栏 -->
      <div class="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-5 dark:border-slate-700 dark:bg-slate-800/40">
        <div class="form-control">
          <label class="label py-0"><span class="label-text text-xs font-semibold">方向</span></label>
          <NSelect v-model:value="filters.direction" size="small" :options="directionOptions" data-testid="filter-direction" @update:value="applyFilters" />
        </div>
        <div class="form-control">
          <label class="label py-0"><span class="label-text text-xs font-semibold">校验状态（多选）</span></label>
          <NSelect
            v-model:value="filters.verifyStatus"
            size="small"
            multiple
            clearable
            max-tag-count="responsive"
            :options="verifyStatusOptions"
            placeholder="全部"
            data-testid="filter-verify-status"
            @update:value="applyFilters"
          />
        </div>
        <div class="form-control">
          <label class="label py-0"><span class="label-text text-xs font-semibold">文件名前缀</span></label>
          <NInput v-model:value="filters.fileName" size="small" clearable placeholder="如 scb6000" data-testid="filter-file-name" @update:value="applyFiltersDebounced" />
        </div>
        <div class="form-control">
          <label class="label py-0"><span class="label-text text-xs font-semibold">时间范围</span></label>
          <NSelect v-model:value="filters.range" size="small" :options="rangeOptions" data-testid="filter-range" @update:value="applyFilters" />
        </div>
        <div class="form-control">
          <label class="label py-0"><span class="label-text text-xs font-semibold">msg_id</span></label>
          <NInput v-model:value="filters.msgId" size="small" clearable placeholder="按消息分组键精确过滤" data-testid="filter-msg-id" @update:value="applyFiltersDebounced" />
        </div>
      </div>

      <!-- 空态：还没收发过消息（含表没建） -->
      <div
        v-if="showEmpty"
        data-testid="ledger-empty"
        class="rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-600"
      >
        <NEmpty :description="notInitialized ? '台账表尚未建立：站点还没激活过、也没收发过消息' : '还没有收发过消息'">
          <template #extra>
            <p class="text-xs text-slate-400">激活协同环境后，中继每次广播 / 接收都会在这里落一行。</p>
          </template>
        </NEmpty>
      </div>

      <!-- 列表 -->
      <div v-else class="rounded-xl border border-slate-200 bg-base-100 p-2 dark:border-slate-700" data-testid="ledger-table">
        <NDataTable
          remote
          size="small"
          :columns="columns"
          :data="rows"
          :loading="loading"
          :pagination="pagination"
          :row-key="rowKey"
          :row-props="rowProps"
          :row-class-name="() => 'cursor-pointer'"
        />
      </div>

      <!-- 水位面板（默认收起） -->
      <div class="mt-6 rounded-xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200"
          data-testid="ledger-watermarks-toggle"
          @click="toggleWatermarks"
        >
          <span>中继水位 · 每个 dbnum 当前已广播 / 已接收的 latest sesno（{{ summary?.watermarks_total ?? watermarks.length }}）</span>
          <span class="text-slate-400">{{ showWatermarks ? '收起 ▴' : '展开 ▾' }}</span>
        </button>
        <div v-if="showWatermarks" class="border-t border-slate-200 p-2 dark:border-slate-700" data-testid="ledger-watermarks-table">
          <div v-if="watermarksError" class="m-2 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{{ watermarksError }}</div>
          <NDataTable v-else size="small" :columns="watermarkColumns" :data="watermarks" :loading="watermarksLoading" :row-key="(w: LedgerWatermark) => w.dbnum" />
        </div>
      </div>
    </template>

    <!-- 抽屉：单行详情 + 变更清单 -->
    <NDrawer v-model:show="drawerOpen" :width="780" placement="right" :trap-focus="false">
      <NDrawerContent closable :native-scrollbar="false" data-testid="ledger-drawer">
        <template #header>
          <div class="flex items-center gap-3">
            <NTag size="small" :bordered="false" :type="directionTagType(current?.direction)">{{ directionLabel(current?.direction) }}</NTag>
            <span class="font-mono text-base">{{ current?.file_name }}</span>
            <NTag size="small" :bordered="false" :type="verifyTagType(current?.verify_status)">{{ current?.verify_status }}</NTag>
          </div>
        </template>

        <div v-if="current" class="space-y-6">
          <div v-if="detailError" class="rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{{ detailError }}</div>

          <!-- 全字段 -->
          <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-testid="ledger-detail-fields">
            <div class="sm:col-span-2 flex items-center gap-2">
              <dt class="w-28 shrink-0 text-slate-500">msg_id</dt>
              <dd class="flex min-w-0 items-center gap-2 font-mono text-xs">
                <span class="truncate" data-testid="detail-msg-id">{{ current.msg_id }}</span>
                <NButton size="tiny" secondary data-testid="detail-copy-msg-id" @click="copyText(current.msg_id, 'msg_id')">复制</NButton>
                <NButton size="tiny" tertiary data-testid="detail-filter-msg-id" @click="filterByMsgId(current.msg_id)">按 msg_id 过滤列表</NButton>
              </dd>
            </div>
            <div class="sm:col-span-2 flex items-center gap-2">
              <dt class="w-28 shrink-0 text-slate-500">id</dt>
              <dd class="font-mono text-xs">{{ current.id }}</dd>
            </div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">方向</dt><dd>{{ directionLabel(current.direction) }}（{{ current.direction }}）</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">来源站点</dt><dd>{{ current.location }}</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">文件</dt><dd class="font-mono">{{ current.file_name }}</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">校验</dt><dd>{{ current.verify_status }}</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">sesno</dt><dd>{{ sesnoText(current) }}</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">diff</dt><dd>{{ diffText(current) }}<span v-if="current.diff_status" class="ml-2 text-xs text-slate-400">({{ current.diff_status }})</span></dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">消息时间</dt><dd :title="current.msg_timestamp ?? ''">{{ formatTime(current.msg_timestamp) }}</dd></div>
            <div class="flex gap-2"><dt class="w-28 shrink-0 text-slate-500">写入时间</dt><dd :title="current.created_at">{{ formatTime(current.created_at) }}</dd></div>
            <div class="sm:col-span-2 flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">file_hash</dt>
              <dd class="min-w-0 break-all font-mono text-xs text-slate-600">{{ current.file_hash ?? '—' }}</dd>
            </div>
            <div class="sm:col-span-2 flex gap-2">
              <dt class="w-28 shrink-0 text-slate-500">verify_detail</dt>
              <dd class="min-w-0 flex-1">
                <pre class="whitespace-pre-wrap break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="detail-verify-detail">{{ current.verify_detail ?? '—' }}</pre>
              </dd>
            </div>
          </dl>

          <!-- 变更清单 -->
          <section v-if="current.direction === 'outbound'" data-testid="ledger-changes">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                变更清单
                <span class="ml-2 text-sm font-normal text-slate-500" data-testid="changes-total">
                  <template v-if="truncatedTotal !== null">已落库 {{ Math.min(changesTotal, LEDGER_MAX_CHANGES_PER_ROW) }} / {{ truncatedTotal }}（截断）</template>
                  <template v-else>共 {{ changesTotal }} 条</template>
                </span>
              </h3>
              <NButton size="tiny" secondary :disabled="changes.length === 0" data-testid="changes-copy-page" @click="copyPageRefnos">复制本页 RefNo</NButton>
            </div>
            <div class="mb-3 flex flex-wrap gap-2 text-xs text-slate-500" data-testid="changes-kinds">
              <span v-for="kind in LEDGER_CHANGE_KINDS" :key="kind" class="chip">{{ kindLabel(kind) }} <b>{{ detail?.kinds?.[kind] ?? '…' }}</b></span>
            </div>
            <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NSelect v-model:value="changesFilters.kind" size="small" :options="kindOptions" data-testid="changes-filter-kind" @update:value="applyChangesFilters" />
              <NInput v-model:value="changesFilters.refno" size="small" clearable placeholder="RefNo 前缀，如 6000/" data-testid="changes-filter-refno" @update:value="applyChangesFiltersDebounced" />
            </div>
            <div v-if="changesError" class="mb-2 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{{ changesError }}</div>
            <NDataTable
              remote
              size="small"
              :columns="changeColumns"
              :data="changes"
              :loading="changesLoading"
              :pagination="changesPagination"
              :row-key="(c: LedgerChange) => c.refno"
              data-testid="changes-table"
            />
          </section>
          <section v-else class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300" data-testid="ledger-changes-inbound">
            接收方不记变更清单——这次接收对应的 RefNo 级清单在广播方站点同一 <code>msg_id</code> 的 outbound 行里。
            <NButton size="tiny" tertiary class="ml-2" @click="filterByMsgId(current.msg_id)">按 msg_id 过滤本站列表</NButton>
          </section>
        </div>
      </NDrawerContent>
    </NDrawer>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, h } from 'vue';
import type { DataTableColumns, PaginationProps } from 'naive-ui';
// h() 里用到的组件要显式 import；template 里的 N* 由 NaiveUiResolver 自动注册
import { NTag, NButton } from 'naive-ui';
import {
  relayLedgerApi,
  isLedgerUnavailable,
  isLedgerNotInitialized,
  isLedgerProblem,
  parseChangesTruncated,
  LEDGER_VERIFY_STATUSES,
  LEDGER_CHANGE_KINDS,
  LEDGER_MAX_CHANGES_PER_ROW,
  type LedgerRowView,
  type LedgerRowDetail,
  type LedgerChange,
  type LedgerWatermark,
  type LedgerSummaryResponse,
  type LedgerListParams,
  type LedgerChangeKind,
} from '@/api';
import { useClipboard } from '@/composables/useClipboard';

type TagType = 'default' | 'success' | 'error' | 'warning' | 'info' | 'primary';
type RangeKey = '' | '1h' | '24h' | '7d';

const message = useMessage();
const { copy } = useClipboard();

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------
const loading = ref(false);
const errorMsg = ref('');
const unavailable = ref(false);
const notInitialized = ref(false);
const rows = ref<LedgerRowView[]>([]);
const total = ref(0);
const summary = ref<LedgerSummaryResponse | null>(null);
const autoRefresh = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const filters = reactive<{ direction: string; verifyStatus: string[]; fileName: string; range: RangeKey; msgId: string }>({
  direction: '',
  verifyStatus: [],
  fileName: '',
  range: '',
  msgId: '',
});

const directionOptions = [
  { label: '全部方向', value: '' },
  { label: '广播（outbound）', value: 'outbound' },
  { label: '接收（inbound）', value: 'inbound' },
];
const verifyStatusOptions = LEDGER_VERIFY_STATUSES.map((s) => ({ label: s, value: s }));
const rangeOptions: { label: string; value: RangeKey }[] = [
  { label: '全部时间', value: '' },
  { label: '近 1 小时', value: '1h' },
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
];

const pagination = ref<PaginationProps & { page: number; pageSize: number; itemCount: number }>({
  page: 1,
  pageSize: 50,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100, 200],
  prefix: (info) => `共 ${info.itemCount} 行`,
  onChange: (page: number) => {
    pagination.value.page = page;
    void loadList();
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.value.pageSize = pageSize;
    pagination.value.page = 1;
    void loadList();
  },
});

const hasActiveFilters = computed(
  () => Boolean(filters.direction || filters.verifyStatus.length || filters.fileName.trim() || filters.range || filters.msgId.trim()),
);
const showEmpty = computed(() => !loading.value && !errorMsg.value && total.value === 0 && (notInitialized.value || !hasActiveFilters.value));

function sinceFromRange(range: RangeKey): string | undefined {
  const hours = range === '1h' ? 1 : range === '24h' ? 24 : range === '7d' ? 24 * 7 : 0;
  if (!hours) return undefined;
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function listParams(): LedgerListParams {
  return {
    direction: filters.direction as LedgerListParams['direction'],
    verify_status: filters.verifyStatus,
    file_name: filters.fileName.trim() || undefined,
    msg_id: filters.msgId.trim() || undefined,
    since: sinceFromRange(filters.range),
    limit: pagination.value.pageSize,
    offset: (pagination.value.page - 1) * pagination.value.pageSize,
  };
}

// ---------------------------------------------------------------------------
// 加载
// ---------------------------------------------------------------------------
function handleUnavailable(err: unknown): boolean {
  if (isLedgerUnavailable(err)) {
    unavailable.value = true;
    return true;
  }
  return false;
}

async function loadList(): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await relayLedgerApi.list(listParams());
    if (handleUnavailable(res)) return;
    if (res.success === false) {
      errorMsg.value = `加载台账失败: ${res.message ?? res.status ?? '未知错误'}`;
      return;
    }
    unavailable.value = false;
    notInitialized.value = isLedgerNotInitialized(res);
    rows.value = Array.isArray(res.items) ? res.items : [];
    total.value = Number(res.total ?? 0);
    pagination.value.itemCount = total.value;
  } catch (err) {
    if (handleUnavailable(err)) return;
    const msg = errorMessage(err);
    errorMsg.value = `加载台账失败: ${msg}`;
    console.error('加载中继台账失败:', msg);
  } finally {
    loading.value = false;
  }
}

async function loadSummary(): Promise<void> {
  try {
    const res = await relayLedgerApi.summary({ since: sinceFromRange(filters.range) });
    if (handleUnavailable(res)) return;
    if (res.success === false) return;
    summary.value = res;
  } catch (err) {
    if (handleUnavailable(err)) return;
    console.error('加载台账汇总失败:', errorMessage(err));
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([loadList(), loadSummary(), showWatermarks.value ? loadWatermarks() : Promise.resolve()]);
}

function applyFilters(): void {
  pagination.value.page = 1;
  void Promise.all([loadList(), loadSummary()]);
}

let filterTimer: ReturnType<typeof setTimeout> | null = null;
function applyFiltersDebounced(): void {
  if (filterTimer) clearTimeout(filterTimer);
  filterTimer = setTimeout(applyFilters, 400);
}

function summaryCount(direction: string, status: string): number {
  return (summary.value?.by_direction_status ?? [])
    .filter((e) => e.direction === direction && e.verify_status === status)
    .reduce((acc, e) => acc + Number(e.count ?? 0), 0);
}

// ---------------------------------------------------------------------------
// 格式化
// ---------------------------------------------------------------------------
function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function directionLabel(direction: string | undefined): string {
  if (direction === 'outbound') return '广播';
  if (direction === 'inbound') return '接收';
  return direction ?? '';
}

function directionTagType(direction: string | undefined): TagType {
  if (direction === 'outbound') return 'info';
  if (direction === 'inbound') return 'primary';
  return 'default';
}

function verifyTagType(status: string | undefined): TagType {
  if (status === 'ok') return 'success';
  if (status === 'skipped') return 'default';
  return status ? 'error' : 'default';
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'inserted': return '新增';
    case 'deleted': return '删除';
    case 'modified': return '修改';
    case 'relocated': return '移位';
    default: return kind;
  }
}

function kindTagType(kind: string): TagType {
  switch (kind) {
    case 'inserted': return 'success';
    case 'deleted': return 'error';
    case 'modified': return 'warning';
    case 'relocated': return 'info';
    default: return 'default';
  }
}

function sesnoText(row: LedgerRowView): string {
  const from = row.sesno_from ?? '—';
  const to = row.sesno_to ?? '—';
  const base = `${from} → ${to}`;
  if (row.sesno_seen !== null && row.sesno_seen !== undefined && row.sesno_seen !== row.sesno_to) {
    return `${base}（实读 ${row.sesno_seen}）`;
  }
  return base;
}

function diffText(row: LedgerRowView): string {
  if (row.diff_inserted === null && row.diff_deleted === null && row.diff_modified === null) return '—';
  return `+${row.diff_inserted ?? 0} −${row.diff_deleted ?? 0} ~${row.diff_modified ?? 0}`;
}

function changesCountText(row: LedgerRowView): string {
  const truncated = parseChangesTruncated(row.verify_detail);
  if (truncated !== null) return `${row.changes_count} / ${truncated}（截断）`;
  return String(row.changes_count);
}

// ---------------------------------------------------------------------------
// 列表列
// ---------------------------------------------------------------------------
const rowKey = (row: LedgerRowView) => row.id;
const rowProps = (row: LedgerRowView) => ({
  onClick: () => {
    void openRow(row);
  },
  'data-testid': 'ledger-row',
  'data-row-id': row.id,
});

const columns: DataTableColumns<LedgerRowView> = [
  {
    title: '时间',
    key: 'created_at',
    width: 170,
    render: (row) => h('span', { class: 'text-xs', title: row.created_at }, formatTime(row.created_at)),
  },
  {
    title: '方向',
    key: 'direction',
    width: 80,
    render: (row) => h(NTag, { size: 'small', bordered: false, type: directionTagType(row.direction) }, { default: () => directionLabel(row.direction) }),
  },
  {
    title: '文件 / 来源',
    key: 'file_name',
    minWidth: 180,
    render: (row) =>
      h('div', { class: 'flex flex-col leading-tight' }, [
        h('span', { class: 'font-mono text-sm' }, row.file_name),
        h('span', { class: 'text-[11px] text-slate-400' }, row.location),
      ]),
  },
  {
    title: 'sesno',
    key: 'sesno_to',
    width: 150,
    render: (row) => {
      const mismatch = row.sesno_seen !== null && row.sesno_seen !== undefined && row.sesno_seen !== row.sesno_to;
      return h('span', { class: ['font-mono text-xs', mismatch ? 'text-rose-600 font-semibold' : ''] }, sesnoText(row));
    },
  },
  {
    title: 'diff',
    key: 'diff',
    width: 130,
    render: (row) => {
      if (row.diff_inserted === null && row.diff_deleted === null && row.diff_modified === null) {
        return h('span', { class: 'text-slate-400' }, '—');
      }
      return h('span', { class: 'font-mono text-xs' }, [
        h('span', { class: 'text-emerald-600' }, `+${row.diff_inserted ?? 0}`),
        ' ',
        h('span', { class: 'text-rose-600' }, `−${row.diff_deleted ?? 0}`),
        ' ',
        h('span', { class: 'text-amber-600' }, `~${row.diff_modified ?? 0}`),
      ]);
    },
  },
  {
    title: '校验',
    key: 'verify_status',
    width: 130,
    render: (row) =>
      h(
        NTag,
        { size: 'small', bordered: false, type: verifyTagType(row.verify_status), title: row.verify_detail ?? '', 'data-testid': 'ledger-verify-tag' },
        { default: () => row.verify_status },
      ),
  },
  {
    title: '变更',
    key: 'changes_count',
    width: 130,
    render: (row) =>
      h(
        NButton,
        {
          size: 'tiny',
          secondary: true,
          type: isLedgerProblem(row.verify_status) ? 'error' : 'default',
          'data-testid': 'ledger-changes-button',
          onClick: (e: MouseEvent) => {
            e.stopPropagation();
            void openRow(row);
          },
        },
        { default: () => changesCountText(row) },
      ),
  },
  {
    title: 'msg_id',
    key: 'msg_id',
    width: 110,
    render: (row) => h('span', { class: 'font-mono text-xs text-slate-500', title: row.msg_id }, row.msg_id.slice(0, 8)),
  },
];

// ---------------------------------------------------------------------------
// 抽屉：详情 + 变更清单
// ---------------------------------------------------------------------------
const drawerOpen = ref(false);
const current = ref<LedgerRowView | null>(null);
const detail = ref<LedgerRowDetail | null>(null);
const detailError = ref('');
const changes = ref<LedgerChange[]>([]);
const changesTotal = ref(0);
const changesLoading = ref(false);
const changesError = ref('');
const changesFilters = reactive<{ kind: string; refno: string }>({ kind: '', refno: '' });
const kindOptions = computed(() => [
  { label: '全部种类', value: '' },
  ...LEDGER_CHANGE_KINDS.map((k) => ({ label: `${kindLabel(k)}（${detail.value?.kinds?.[k] ?? '…'}）`, value: k })),
]);
const truncatedTotal = computed(() => parseChangesTruncated(current.value?.verify_detail));

const changesPagination = ref<PaginationProps & { page: number; pageSize: number; itemCount: number }>({
  page: 1,
  pageSize: 200,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [50, 100, 200, 500],
  prefix: (info) => `共 ${info.itemCount} 条`,
  onChange: (page: number) => {
    changesPagination.value.page = page;
    void loadChanges();
  },
  onUpdatePageSize: (pageSize: number) => {
    changesPagination.value.pageSize = pageSize;
    changesPagination.value.page = 1;
    void loadChanges();
  },
});

const changeColumns: DataTableColumns<LedgerChange> = [
  { title: 'RefNo', key: 'refno', render: (c) => h('span', { class: 'font-mono text-xs', 'data-testid': 'change-refno' }, c.refno) },
  {
    title: '种类',
    key: 'kind',
    width: 120,
    render: (c) => h(NTag, { size: 'small', bordered: false, type: kindTagType(c.kind) }, { default: () => `${kindLabel(c.kind)} · ${c.kind}` }),
  },
];

async function openRow(row: LedgerRowView): Promise<void> {
  current.value = row;
  detail.value = null;
  detailError.value = '';
  changes.value = [];
  changesTotal.value = 0;
  changesError.value = '';
  changesFilters.kind = '';
  changesFilters.refno = '';
  changesPagination.value.page = 1;
  changesPagination.value.itemCount = 0;
  drawerOpen.value = true;
  await Promise.all([loadDetail(row.id), row.direction === 'outbound' ? loadChanges() : Promise.resolve()]);
}

async function loadDetail(id: string): Promise<void> {
  try {
    const res = await relayLedgerApi.get(id);
    if (res.success === false || !res.item) {
      detailError.value = `读取详情失败: ${res.message ?? res.status ?? '未知错误'}`;
      return;
    }
    detail.value = res.item;
    // 详情比列表行新鲜（changes_count 等），顺手刷新抽屉头
    current.value = res.item;
  } catch (err) {
    const msg = errorMessage(err);
    detailError.value = `读取详情失败: ${msg}`;
    console.error('读取台账详情失败:', msg);
  }
}

async function loadChanges(): Promise<void> {
  const row = current.value;
  if (!row) return;
  changesLoading.value = true;
  changesError.value = '';
  try {
    const res = await relayLedgerApi.changes(row.id, {
      kind: changesFilters.kind as LedgerChangeKind | '',
      refno: changesFilters.refno.trim() || undefined,
      limit: changesPagination.value.pageSize,
      offset: (changesPagination.value.page - 1) * changesPagination.value.pageSize,
    });
    if (res.success === false) {
      changesError.value = `读取变更清单失败: ${res.message ?? res.status ?? '未知错误'}`;
      return;
    }
    changes.value = Array.isArray(res.items) ? res.items : [];
    changesTotal.value = Number(res.total ?? 0);
    changesPagination.value.itemCount = changesTotal.value;
  } catch (err) {
    const msg = errorMessage(err);
    changesError.value = `读取变更清单失败: ${msg}`;
    console.error('读取台账变更清单失败:', msg);
  } finally {
    changesLoading.value = false;
  }
}

function applyChangesFilters(): void {
  changesPagination.value.page = 1;
  void loadChanges();
}

let changesFilterTimer: ReturnType<typeof setTimeout> | null = null;
function applyChangesFiltersDebounced(): void {
  if (changesFilterTimer) clearTimeout(changesFilterTimer);
  changesFilterTimer = setTimeout(applyChangesFilters, 400);
}

async function copyText(text: string, label: string): Promise<void> {
  const ok = await copy(text);
  if (ok) message.success(`已复制 ${label}`);
  else message.error('复制失败：浏览器拒绝访问剪贴板');
}

async function copyPageRefnos(): Promise<void> {
  const text = changes.value.map((c) => c.refno).join('\n');
  if (!text) return;
  await copyText(text, `${changes.value.length} 个 RefNo`);
}

function filterByMsgId(msgId: string): void {
  filters.msgId = msgId;
  filters.direction = '';
  drawerOpen.value = false;
  applyFilters();
}

// ---------------------------------------------------------------------------
// 水位
// ---------------------------------------------------------------------------
const showWatermarks = ref(false);
const watermarks = ref<LedgerWatermark[]>([]);
const watermarksLoading = ref(false);
const watermarksError = ref('');

const watermarkColumns: DataTableColumns<LedgerWatermark> = [
  { title: 'dbnum', key: 'dbnum', width: 100, render: (w) => h('span', { class: 'font-mono text-xs' }, String(w.dbnum)) },
  { title: '文件', key: 'file_name', render: (w) => h('span', { class: 'font-mono text-xs' }, w.file_name) },
  { title: 'sesno', key: 'sesno', width: 100, render: (w) => h('span', { class: 'font-mono text-xs' }, String(w.sesno)) },
  {
    title: '指纹（mtime:size）',
    key: 'last_seen_fingerprint',
    width: 220,
    render: (w) => h('span', { class: 'font-mono text-xs text-slate-500' }, w.last_seen_fingerprint ?? '—'),
  },
  { title: '更新时间', key: 'updated_at', width: 170, render: (w) => h('span', { class: 'text-xs', title: w.updated_at }, formatTime(w.updated_at)) },
];

async function loadWatermarks(): Promise<void> {
  watermarksLoading.value = true;
  watermarksError.value = '';
  try {
    const res = await relayLedgerApi.watermarks();
    if (handleUnavailable(res)) return;
    if (res.success === false) {
      watermarksError.value = `读取水位失败: ${res.message ?? res.status ?? '未知错误'}`;
      return;
    }
    watermarks.value = Array.isArray(res.items) ? res.items : [];
  } catch (err) {
    if (handleUnavailable(err)) return;
    const msg = errorMessage(err);
    watermarksError.value = `读取水位失败: ${msg}`;
    console.error('读取中继水位失败:', msg);
  } finally {
    watermarksLoading.value = false;
  }
}

function toggleWatermarks(): void {
  showWatermarks.value = !showWatermarks.value;
  if (showWatermarks.value) void loadWatermarks();
}

// ---------------------------------------------------------------------------
// 自动刷新 / 生命周期
// ---------------------------------------------------------------------------
watch(autoRefresh, (on) => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (on) refreshTimer = setInterval(() => void refreshAll(), 30_000);
});

onMounted(() => {
  void refreshAll();
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (filterTimer) clearTimeout(filterTimer);
  if (changesFilterTimer) clearTimeout(changesFilterTimer);
});
</script>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  border: 1px solid rgb(226 232 240);
  background: rgb(248 250 252);
  padding: 0.2rem 0.7rem;
  color: rgb(71 85 105);
}
:global(.dark) .chip {
  border-color: rgb(51 65 85);
  background: rgb(30 41 59);
  color: rgb(203 213 225);
}
.chip b {
  font-variant-numeric: tabular-nums;
  color: rgb(15 23 42);
}
:global(.dark) .chip b {
  color: rgb(241 245 249);
}
.chip-rose {
  border-color: rgb(254 205 211);
  background: rgb(255 241 242);
  color: rgb(190 18 60);
}
.chip-rose b {
  color: rgb(190 18 60);
}
</style>
