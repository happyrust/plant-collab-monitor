import { http } from './http';

/**
 * 中继台账读侧 API · `/api/remote-sync/ledger/*`（只读；admin 门在前端路由）
 *
 * 后端：`plant-web-server/src/relay/ledger_query.rs`（2026-09-17，pws `b61b7ca` 起）。
 * 响应形状以 `docs/plans/2026-09-17-relay-ledger-read-api-plan.md` §8 那张表为准：
 * - 成功：`{ success: true, …, mode: 'standalone-real' }`，列表放 `items` + `total`
 * - 库不存在 / 三张表没建：空结果 + `note: 'ledger_not_initialized'`（表在时**没有** `note` 键）
 * - 参数不合法 / 行不存在 / 查询失败：`{ success: false, status: 'invalid_param' | 'not_found' | 'query_failed', message }`
 * - 后端没这组端点：pmg 的 axum 与旧版 pws 都回 **404**（进 axios 拒绝分支，`ApiError.status === 404`）；
 *   pws 若路由注册了却没分派会回 `success:false, status:'not_implemented'`——两种都由 `isLedgerUnavailable()` 收口
 *
 * 新增 / 删除方法时同步 README「API 模块清单」与 AGENTS.md §4.3。
 */

export type LedgerDirection = 'outbound' | 'inbound';
export type LedgerVerifyStatus =
  | 'ok'
  | 'hash_mismatch'
  | 'open_failed'
  | 'sesno_mismatch'
  | 'sesno_disagree'
  | 'clone_failed'
  | 'skipped';
export type LedgerDiffStatus = 'ok' | 'empty' | 'unavailable' | 'skipped';
export type LedgerChangeKind = 'inserted' | 'deleted' | 'modified' | 'relocated';

/** 与后端白名单一致（`ledger_query::VERIFY_STATUSES` 等） */
export const LEDGER_VERIFY_STATUSES: readonly LedgerVerifyStatus[] = [
  'ok',
  'hash_mismatch',
  'open_failed',
  'sesno_mismatch',
  'sesno_disagree',
  'clone_failed',
  'skipped',
];
export const LEDGER_CHANGE_KINDS: readonly LedgerChangeKind[] = ['inserted', 'deleted', 'modified', 'relocated'];
/** 「没问题」的校验状态；其余算问题行（与后端 `summary.problems_*` 同一口径） */
export const LEDGER_BENIGN_STATUSES: readonly string[] = ['ok', 'skipped'];
/** 空结果标记（库不存在 / 表没建） */
export const LEDGER_NOT_INITIALIZED = 'ledger_not_initialized';
/** 后端单行变更清单落库上限（`ledger::MAX_CHANGES_PER_ROW`），超出在 `verify_detail` 标 `changes_truncated:<n>` */
export const LEDGER_MAX_CHANGES_PER_ROW = 20_000;

/** `e3d_sync_ledger` 一行（全部列）+ `changes_count` */
export interface LedgerRowView {
  id: string;
  msg_id: string;
  direction: LedgerDirection | string;
  location: string;
  file_name: string;
  file_hash: string | null;
  sesno_from: number | null;
  sesno_to: number | null;
  sesno_seen: number | null;
  diff_inserted: number | null;
  diff_deleted: number | null;
  diff_modified: number | null;
  diff_status: LedgerDiffStatus | string | null;
  verify_status: LedgerVerifyStatus | string;
  verify_detail: string | null;
  msg_timestamp: string | null;
  created_at: string;
  changes_count: number;
}

export type LedgerKindCounts = Record<LedgerChangeKind, number>;

export interface LedgerRowDetail extends LedgerRowView {
  kinds: LedgerKindCounts;
}

export interface LedgerChange {
  refno: string;
  kind: LedgerChangeKind | string;
}

export interface LedgerWatermark {
  dbnum: number;
  file_name: string;
  sesno: number;
  last_seen_fingerprint: string | null;
  updated_at: string;
}

export interface LedgerDirectionStatusCount {
  direction: LedgerDirection | string;
  verify_status: LedgerVerifyStatus | string;
  count: number;
}

interface LedgerResponseBase {
  success: boolean;
  /** 失败时：`invalid_param` / `not_found` / `query_failed`（`not_implemented` = 后端没这 API） */
  status?: string;
  message?: string;
  /** 只在库不存在 / 表没建时出现，值恒为 `ledger_not_initialized` */
  note?: string;
  mode?: string;
}

export interface LedgerListResponse extends LedgerResponseBase {
  items: LedgerRowView[];
  total: number;
  limit: number;
  offset: number;
}

export interface LedgerRowResponse extends LedgerResponseBase {
  item?: LedgerRowDetail;
}

export interface LedgerChangesResponse extends LedgerResponseBase {
  ledger_id: string;
  items: LedgerChange[];
  total: number;
  limit: number;
  offset: number;
}

export interface LedgerSummaryResponse extends LedgerResponseBase {
  by_direction_status: LedgerDirectionStatusCount[];
  rows_total: number;
  changes_total: number;
  problems_total: number;
  problems_recent: LedgerRowView[];
  watermarks_total: number;
  /** 不受 `since` 限制（当前状态） */
  last_outbound_at: string | null;
  last_inbound_at: string | null;
  /** 生效的 `since`（后端归一成 UTC RFC3339），null = 不限 */
  since: string | null;
}

export interface LedgerWatermarksResponse extends LedgerResponseBase {
  items: LedgerWatermark[];
  total: number;
}

export interface LedgerListParams {
  direction?: LedgerDirection | '' | null;
  /** 多选：数组会拼成逗号分隔（后端 `verify_status=ok,skipped`） */
  verify_status?: readonly string[] | string | null;
  diff_status?: LedgerDiffStatus | '' | null;
  /** 文件名前缀 */
  file_name?: string | null;
  location?: string | null;
  msg_id?: string | null;
  /** RFC3339（任意时区）或 `YYYY-MM-DD` */
  since?: string | null;
  until?: string | null;
  /** 默认 50，上限 500 */
  limit?: number;
  offset?: number;
}

export interface LedgerChangesParams {
  kind?: LedgerChangeKind | '' | null;
  /** RefNo 前缀，如 `6000/` */
  refno?: string | null;
  /** 默认 200，上限 2000 */
  limit?: number;
  offset?: number;
}

/** 去掉空值；数组拼逗号（axios 默认会把数组序列化成 `k[]=a&k[]=b`，后端不认） */
function toQuery(params: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      const joined = value.filter((v) => v !== undefined && v !== null && v !== '').join(',');
      if (joined) out[key] = joined;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'string') out[key] = value;
  }
  return out;
}

const BASE = '/api/remote-sync/ledger';

export const relayLedgerApi = {
  /** `GET ledger`：分页列表，`created_at DESC`，每行带 `changes_count` */
  list: (params: LedgerListParams = {}) =>
    http.get<unknown, LedgerListResponse>(BASE, { params: toQuery(params as Record<string, unknown>) }),
  /** `GET ledger/rows/{id}`：单行全字段 + `kinds` 四计数；不存在 → `success:false, status:'not_found'` */
  get: (id: string) =>
    http.get<unknown, LedgerRowResponse>(`${BASE}/rows/${encodeURIComponent(id)}`),
  /** `GET ledger/rows/{id}/changes`：RefNo 级变更清单（`refno` 升序；inbound 行是空列表） */
  changes: (id: string, params: LedgerChangesParams = {}) =>
    http.get<unknown, LedgerChangesResponse>(`${BASE}/rows/${encodeURIComponent(id)}/changes`, {
      params: toQuery(params as Record<string, unknown>),
    }),
  /** `GET ledger/summary`：`since` 只圈计数与问题行，`last_*_at` / `watermarks_total` 是当前状态 */
  summary: (params: { since?: string | null } = {}) =>
    http.get<unknown, LedgerSummaryResponse>(`${BASE}/summary`, { params: toQuery(params) }),
  /** `GET ledger/watermarks`：每 dbnum 一行，按 dbnum 升序 */
  watermarks: () => http.get<unknown, LedgerWatermarksResponse>(`${BASE}/watermarks`),
};

/**
 * 「该后端不提供台账 API」：既认 axios 拒绝对象（`ApiError.status === 404`，pmg / 旧版 pws 的未注册路由），
 * 也认 HTTP 200 里的 `success:false, status:'not_implemented'`（pws 路由注册了却没分派的形状）。
 * 别把 `invalid_param` / `not_found` / `query_failed` 当成不可用——那是这组端点在、只是这次请求不对。
 */
export function isLedgerUnavailable(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  if (obj.status === 404) return true;
  if (obj.success === false && obj.status === 'not_implemented') return true;
  const raw = obj.raw;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (r.success === false && r.status === 'not_implemented') return true;
  }
  return false;
}

/** 库不存在 / 三张表没建（站点还没激活过、也没收发过消息） */
export function isLedgerNotInitialized(res: LedgerResponseBase | null | undefined): boolean {
  return res?.note === LEDGER_NOT_INITIALIZED;
}

/** `verify_detail` 里的 `changes_truncated:<总数>`；没有就是 null（清单未截断） */
export function parseChangesTruncated(detail: string | null | undefined): number | null {
  if (!detail) return null;
  const m = /changes_truncated:(\d+)/.exec(detail);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** 校验状态是否算「问题行」（非 ok / skipped） */
export function isLedgerProblem(status: string | null | undefined): boolean {
  return Boolean(status) && !LEDGER_BENIGN_STATUSES.includes(String(status));
}
