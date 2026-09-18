// /ledger 中继台账 · mock 后端（L1 契约层）
//
// 被 scripts/relay-ledger-smoke.mjs 引用。只管 `/api/remote-sync/ledger/*` 五个端点，其它请求交回
// `topology-deploy-mock.mjs` 的 respond()（登录、runtime/status、site-config 这些页面基础请求）。
//
// 三种变体（variant）：
//   pws        plant-web-server b61b7ca 起的真实形状（`{success, items, total, limit, offset, mode}`，筛选 / 分页在这里真做）
//   pws-empty  同一后端、库还没建表：空结果 + `note: 'ledger_not_initialized'`
//   pmg        plant-model-gen：没有这组路由 → axum 404
//
// 响应字段以 docs/plans/2026-09-17-relay-ledger-read-api-plan.md §8 为准；改 fixture 时同步
// docs/e2e-smoke/remote-deploy-auto-test-cases.md §8 的期望列。

export const MAX_CHANGES_PER_ROW = 20_000;

const VERIFY_STATUSES = ['ok', 'hash_mismatch', 'open_failed', 'sesno_mismatch', 'sesno_disagree', 'clone_failed', 'skipped'];
const DIFF_STATUSES = ['ok', 'empty', 'unavailable', 'skipped'];
const KINDS = ['inserted', 'deleted', 'modified', 'relocated'];
const DIRECTIONS = ['outbound', 'inbound'];

/** 固定 fixture：60 行台账（时间从新到旧），一行「大清单」450 条变更、一行「截断」行、两行 inbound、一行 hash_mismatch */
export function createLedgerFixture() {
  const base = Date.parse('2026-09-16T12:00:00Z');
  const rows = [];
  const changes = new Map();
  const hex = (i, len = 32) => (i * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(4).slice(0, len);

  for (let i = 0; i < 60; i += 1) {
    const created = new Date(base - i * 47 * 60_000).toISOString(); // 每行相隔 47 分钟，覆盖约 2 天
    const id = `L-${String(i + 1).padStart(2, '0')}`;
    const isInbound = i === 2 || i === 9;
    const row = {
      id,
      msg_id: hex(i + 1),
      direction: isInbound ? 'inbound' : 'outbound',
      location: isInbound ? 'local-b' : 'local-a',
      file_name: i % 3 === 0 ? 'scb6000_0001' : i % 3 === 1 ? 'ams8000_0001' : 'acp7001_0001',
      file_hash: hex(i + 100, 128),
      sesno_from: isInbound ? null : 30 + i,
      sesno_to: 33 + i,
      sesno_seen: 33 + i,
      diff_inserted: isInbound ? null : 3,
      diff_deleted: isInbound ? null : 0,
      diff_modified: isInbound ? null : 1,
      diff_status: isInbound ? null : 'ok',
      verify_status: 'ok',
      verify_detail: null,
      msg_timestamp: created,
      created_at: created,
      changes_count: isInbound ? 0 : 4,
    };
    if (!isInbound) {
      changes.set(id, [
        { refno: `6000/${1000 + i}`, kind: 'inserted' },
        { refno: `6000/${2000 + i}`, kind: 'inserted' },
        { refno: `6000/${3000 + i}`, kind: 'modified' },
        { refno: `6000/${4000 + i}`, kind: 'inserted' },
      ]);
    }
    rows.push(row);
  }

  // L-01：大清单 450 条（分页 200 → 3 页），种类按 3:1:2:0 循环，RefNo 两个 dbno 前缀
  const big = [];
  for (let n = 1; n <= 450; n += 1) {
    const kind = n % 6 === 0 ? 'deleted' : n % 3 === 0 ? 'modified' : 'inserted';
    big.push({ refno: `${n <= 300 ? '6000' : '6001'}/${n}`, kind });
  }
  changes.set('L-01', big);
  Object.assign(rows[0], { changes_count: 450, diff_inserted: 300, diff_deleted: 75, diff_modified: 75 });

  // L-05：清单被截断——落库 20000（mock 只造 20000 条的 total，不真生成那么多行）、总数 25000
  Object.assign(rows[4], { changes_count: MAX_CHANGES_PER_ROW, verify_detail: `changes_truncated:25000`, diff_inserted: 25000 });
  changes.set('L-05', { synthetic: true, total: MAX_CHANGES_PER_ROW });

  // L-03：inbound skipped（own_location_db）；L-10：inbound ok；L-07：hash_mismatch
  Object.assign(rows[2], { verify_status: 'skipped', verify_detail: 'own_location_db: dbnum=6000 在本站 location_dbs 内，不接受远端覆盖', sesno_seen: null });
  Object.assign(rows[6], { verify_status: 'hash_mismatch', verify_detail: 'hash_mismatch: expected=00ff… actual=ab12…', diff_status: 'unavailable' });

  // 主键顺序：refno 升序（字典序，与 SQLite 主键一致）
  for (const [id, list] of changes) {
    if (Array.isArray(list)) list.sort((a, b) => (a.refno < b.refno ? -1 : a.refno > b.refno ? 1 : 0));
    changes.set(id, list);
  }

  const watermarks = [
    { dbnum: 6000, file_name: 'scb6000_0001', sesno: 92, last_seen_fingerprint: '1758000000000000000:1048576', updated_at: '2026-09-16T12:00:00+00:00' },
    { dbnum: 7001, file_name: 'acp7001_0001', sesno: 260, last_seen_fingerprint: null, updated_at: '2026-09-16T11:13:00+00:00' },
  ];
  return { rows, changes, watermarks };
}

export function createLedgerState(variant, topologyState) {
  return { variant, topology: topologyState, fixture: createLedgerFixture(), calls: [] };
}

function invalid(key, got, allowed) {
  return { status: 200, json: { success: false, status: 'invalid_param', message: `invalid ${key}: "${got}" (expected one of ${allowed.join(' | ')})`, mode: 'standalone-real' } };
}
function notFound(id) {
  return { status: 200, json: { success: false, status: 'not_found', message: `ledger row not found: ${id}`, mode: 'standalone-real' } };
}
const clampInt = (v, def, min, max) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return NaN;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/** 返回 { status, json } / { status: 404, text } / null（不是台账路径） */
export function respondLedger(state, method, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/remote-sync/ledger')) return null;
  if (method !== 'GET') return { status: 405, json: { success: false, message: 'method not allowed' } };
  const q = url.searchParams;
  state.calls.push({ path: p, query: Object.fromEntries(q.entries()) });

  if (state.variant === 'pmg') return { status: 404, text: '' };

  const empty = state.variant === 'pws-empty';
  const mode = 'standalone-real';
  const { rows, changes, watermarks } = state.fixture;
  let m;

  if (p === '/api/remote-sync/ledger') {
    const direction = q.get('direction') ?? '';
    if (direction && !DIRECTIONS.includes(direction)) return invalid('direction', direction, DIRECTIONS);
    const statuses = (q.get('verify_status') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const s of statuses) if (!VERIFY_STATUSES.includes(s)) return invalid('verify_status', s, VERIFY_STATUSES);
    const diffStatus = q.get('diff_status') ?? '';
    if (diffStatus && !DIFF_STATUSES.includes(diffStatus)) return invalid('diff_status', diffStatus, DIFF_STATUSES);
    const limit = clampInt(q.get('limit'), 50, 1, 500);
    const offset = clampInt(q.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (Number.isNaN(limit)) return invalid('limit', q.get('limit'), ['integer']);
    if (Number.isNaN(offset)) return invalid('offset', q.get('offset'), ['integer']);
    if (empty) return { status: 200, json: { success: true, items: [], total: 0, limit, offset, note: 'ledger_not_initialized', mode } };
    const prefix = (q.get('file_name') ?? '').toLowerCase();
    const location = q.get('location') ?? '';
    const msgId = q.get('msg_id') ?? '';
    const since = q.get('since') ? new Date(q.get('since')).getTime() : null;
    const until = q.get('until') ? new Date(q.get('until')).getTime() : null;
    const filtered = rows.filter((r) => {
      if (direction && r.direction !== direction) return false;
      if (statuses.length && !statuses.includes(r.verify_status)) return false;
      if (diffStatus && r.diff_status !== diffStatus) return false;
      if (prefix && !r.file_name.toLowerCase().startsWith(prefix)) return false;
      if (location && r.location !== location) return false;
      if (msgId && r.msg_id !== msgId) return false;
      const t = Date.parse(r.created_at);
      if (since !== null && t < since) return false;
      if (until !== null && t > until) return false;
      return true;
    });
    return { status: 200, json: { success: true, items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset, mode } };
  }

  if (p === '/api/remote-sync/ledger/summary') {
    if (empty) {
      return { status: 200, json: { success: true, by_direction_status: [], rows_total: 0, changes_total: 0, problems_total: 0, problems_recent: [], watermarks_total: 0, last_outbound_at: null, last_inbound_at: null, since: q.get('since') ?? null, note: 'ledger_not_initialized', mode } };
    }
    const since = q.get('since') ? new Date(q.get('since')).getTime() : null;
    const scoped = rows.filter((r) => since === null || Date.parse(r.created_at) >= since);
    const groups = new Map();
    for (const r of scoped) {
      const key = `${r.direction}|${r.verify_status}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const by = [...groups.entries()]
      .map(([k, count]) => ({ direction: k.split('|')[0], verify_status: k.split('|')[1], count }))
      .sort((a, b) => (a.direction + a.verify_status).localeCompare(b.direction + b.verify_status));
    const problems = scoped.filter((r) => !['ok', 'skipped'].includes(r.verify_status));
    const last = (dir) => rows.filter((r) => r.direction === dir).map((r) => r.created_at).sort().at(-1) ?? null;
    return {
      status: 200,
      json: {
        success: true,
        by_direction_status: by,
        rows_total: scoped.length,
        changes_total: scoped.reduce((acc, r) => acc + r.changes_count, 0),
        problems_total: problems.length,
        problems_recent: problems.slice(0, 5),
        watermarks_total: watermarks.length,
        last_outbound_at: last('outbound'),
        last_inbound_at: last('inbound'),
        since: q.get('since') ?? null,
        mode,
      },
    };
  }

  if (p === '/api/remote-sync/ledger/watermarks') {
    if (empty) return { status: 200, json: { success: true, items: [], total: 0, note: 'ledger_not_initialized', mode } };
    return { status: 200, json: { success: true, items: watermarks, total: watermarks.length, mode } };
  }

  if ((m = p.match(/^\/api\/remote-sync\/ledger\/rows\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1]);
    const row = empty ? null : rows.find((r) => r.id === id);
    if (!row) return notFound(id);
    const list = changes.get(id);
    const kinds = { inserted: 0, deleted: 0, modified: 0, relocated: 0 };
    if (Array.isArray(list)) for (const c of list) kinds[c.kind] += 1;
    else if (list?.synthetic) kinds.inserted = list.total;
    return { status: 200, json: { success: true, item: { ...row, kinds }, mode } };
  }

  if ((m = p.match(/^\/api\/remote-sync\/ledger\/rows\/([^/]+)\/changes$/))) {
    const id = decodeURIComponent(m[1]);
    const row = empty ? null : rows.find((r) => r.id === id);
    if (!row) return notFound(id);
    const kind = q.get('kind') ?? '';
    if (kind && !KINDS.includes(kind)) return invalid('kind', kind, KINDS);
    const limit = clampInt(q.get('limit'), 200, 1, 2000);
    const offset = clampInt(q.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (Number.isNaN(limit)) return invalid('limit', q.get('limit'), ['integer']);
    const prefix = q.get('refno') ?? '';
    const list = changes.get(id);
    let items;
    let total;
    if (Array.isArray(list)) {
      const filtered = list.filter((c) => (!kind || c.kind === kind) && (!prefix || c.refno.startsWith(prefix)));
      total = filtered.length;
      items = filtered.slice(offset, offset + limit);
    } else if (list?.synthetic) {
      // 截断行：不真造 20000 条，按需生成这一页
      total = kind && kind !== 'inserted' ? 0 : list.total;
      items = [];
      for (let n = offset; n < Math.min(total, offset + limit); n += 1) items.push({ refno: `6000/${n + 1}`, kind: 'inserted' });
    } else {
      total = 0;
      items = [];
    }
    return { status: 200, json: { success: true, ledger_id: id, items, total, limit, offset, mode } };
  }

  return { status: 404, text: '' };
}
