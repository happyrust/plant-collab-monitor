/**
 * 探测结果的跨页记忆（2026-09-21）。
 *
 * `/topology` 卡片上的「测 MQTT / 测文件服务」、站点行的「探测」，与 `/guide` 页内的「帮我测」「站点探测」
 * 都把结果写到这里（`sessionStorage`，按标签页隔离、刷新不丢）；向导第 4 / 6 步的「完成判定」读这里——
 * 所以在哪个页面测都算，刷一下页面也不会掉回「未完成」。
 *
 * 只记「最后一次」：同一环境 / 站点再测一次就覆盖。存不进（隐私模式等）就静默降级成只在内存里。
 */

export interface ProbeRecord {
  ok: boolean;
  /** 给人看的结果（后端原话 / 目标 / 耗时） */
  text: string;
  /** 本地时间标签，如 19:51:13 */
  at: string;
  /** 写入时刻（ms），供排序 / 过期用 */
  ts: number;
}

export type EnvProbeKind = 'mqtt' | 'http';

export interface EnvProbes {
  mqtt?: ProbeRecord;
  http?: ProbeRecord;
}

interface ProbeMemory {
  env: Record<string, EnvProbes>;
  site: Record<string, ProbeRecord>;
}

export const PROBE_MEMORY_KEY = 'guide_probe_results';
/** 同标签页内写入后派发的事件名（跨标签页靠原生 `storage` 事件） */
export const PROBE_MEMORY_EVENT = 'guide-probe-memory';

let fallback: ProbeMemory = { env: {}, site: {} };

function read(): ProbeMemory {
  try {
    const raw = sessionStorage.getItem(PROBE_MEMORY_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ProbeMemory>;
    return { env: parsed.env ?? {}, site: parsed.site ?? {} };
  } catch {
    return fallback;
  }
}

function write(memory: ProbeMemory): void {
  fallback = memory;
  try {
    sessionStorage.setItem(PROBE_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // 存不进就只留内存
  }
  try {
    window.dispatchEvent(new CustomEvent(PROBE_MEMORY_EVENT));
  } catch {
    // 非浏览器环境
  }
}

export function readProbeMemory(): ProbeMemory {
  return read();
}

/** 某环境最近一次的两项探测结果（没测过返回空对象） */
export function envProbes(envId: string | number | null | undefined): EnvProbes {
  if (envId == null) return {};
  return read().env[String(envId)] ?? {};
}

/** 某站点最近一次的 HTTP 探测结果 */
export function siteProbe(siteId: string | number | null | undefined): ProbeRecord | undefined {
  if (siteId == null) return undefined;
  return read().site[String(siteId)];
}

export function recordEnvProbe(envId: string | number, kind: EnvProbeKind, rec: Omit<ProbeRecord, 'ts'>): void {
  const memory = read();
  const key = String(envId);
  memory.env = { ...memory.env, [key]: { ...(memory.env[key] ?? {}), [kind]: { ...rec, ts: Date.now() } } };
  write(memory);
}

export function recordSiteProbe(siteId: string | number, rec: Omit<ProbeRecord, 'ts'>): void {
  const memory = read();
  memory.site = { ...memory.site, [String(siteId)]: { ...rec, ts: Date.now() } };
  write(memory);
}

/** 订阅变化（同标签页的写入 + 其他标签页的 storage 事件），返回取消函数 */
export function onProbeMemoryChange(handler: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PROBE_MEMORY_KEY) handler();
  };
  window.addEventListener(PROBE_MEMORY_EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PROBE_MEMORY_EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
