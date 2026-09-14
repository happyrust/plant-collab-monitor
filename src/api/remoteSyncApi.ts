import { http } from './http';

/**
 * 异地协同（remote-sync）API · admin-gated
 *
 * 路由一一对应后端 `plant-model-gen/src/web_server/remote_sync_handlers.rs::create_remote_sync_routes()`。
 * 新增 / 删除方法时同步 README「API 模块清单」与 AGENTS.md §4.3。
 */

/**
 * 动作 / 诊断类端点的统一响应。两种后端形状都要兼容：
 *
 * - `plant-model-gen/web_server`（`action_success / action_failed / ok_diagnostic / failed_diagnostic`）：
 *   `{ status: 'success' | 'failed', message, checked_at?, env_id?, addr?, url?, code?, latency_ms? }`
 * - `plant-web-server`（standalone-real，`connection_probe_response` / `activate_env` / `runtime_stop`）：
 *   `{ success: boolean, message?, kind?, host?, port?, reachable?, stopped?, item?, task?, mode }`
 *
 * 判定成功用 `isRemoteSyncActionOk()`，别直接比 `status`。
 */
export interface RemoteSyncActionResponse {
  status?: 'success' | 'failed' | string;
  success?: boolean;
  message?: string;
  checked_at?: string;
  env_id?: string | null;
  addr?: string;
  url?: string;
  code?: number;
  latency_ms?: number;
  /** plant-web-server 探测：目标主机 / 端口 / 是否可达 */
  host?: string;
  port?: number | null;
  reachable?: boolean;
  stopped?: boolean;
  [k: string]: unknown;
}

/** 动作 / 诊断响应是否算成功（兼容两种后端形状） */
export function isRemoteSyncActionOk(res: RemoteSyncActionResponse | null | undefined): boolean {
  if (!res) return false;
  let ok: boolean;
  if (typeof res.status === 'string') {
    ok = res.status === 'success';
  } else if (typeof res.success === 'boolean') {
    ok = res.success;
  } else {
    ok = false;
  }
  // 探测类：请求本身成功但目标不可达也算失败
  if (ok && res.reachable === false) ok = false;
  return ok;
}

/**
 * `GET /api/remote-sync/runtime/status`
 *
 * - plant-model-gen：`{ status: 'success', active, env_id, mqtt_connected }`
 * - plant-web-server：`{ success, running, env_count, site_count, active_task_count, root, mode }`
 *   （没有 env_id；当前激活的 env 要从 `GET envs` 的 `items[].active` / 顶层 `active` 取）
 */
export interface RemoteSyncRuntimeStatus {
  status?: string;
  success?: boolean;
  /** plant-model-gen：watcher + MQTT 运行态是否存在 */
  active?: boolean;
  /** plant-model-gen：当前激活的 env id（未激活为 null） */
  env_id?: string | null;
  /** plant-model-gen：MQTT 连接状态（未接入时可能为 null） */
  mqtt_connected?: unknown;
  /** plant-web-server：运行时是否在跑 */
  running?: boolean;
  env_count?: number;
  site_count?: number;
  active_task_count?: number;
  mode?: string;
  [k: string]: unknown;
}

/** 站点新建 / 更新 payload（后端 `SiteCreateRequest`） */
export interface RemoteSyncSitePayload {
  name: string;
  location?: string;
  http_host?: string;
  dbnums?: string;
  notes?: string;
  [k: string]: unknown;
}

export const remoteSyncApi = {
  // env CRUD
  listEnvs: () => http.get('/api/remote-sync/envs'),
  getEnv: (id: string | number) => http.get(`/api/remote-sync/envs/${id}`),
  createEnv: (payload: Record<string, unknown>) =>
    http.post('/api/remote-sync/envs', payload),
  updateEnv: (id: string | number, payload: Record<string, unknown>) =>
    http.put(`/api/remote-sync/envs/${id}`, payload),
  deleteEnv: (id: string | number) => http.delete(`/api/remote-sync/envs/${id}`),
  /** 从当前 DbOption.toml 反向导入为一个 env（返回 `{ status, id }`） */
  importEnvFromDbOption: () =>
    http.post<unknown, RemoteSyncActionResponse & { id?: string }>(
      '/api/remote-sync/envs/import-from-dboption',
    ),

  // env → 运行时（部署动作）
  /** 只把 env 写回 DbOption.toml，不重启运行态 */
  applyEnv: (id: string | number) =>
    http.post<unknown, RemoteSyncActionResponse>(`/api/remote-sync/envs/${id}/apply`),
  /** 写回 DbOption.toml 并在进程内重启 watcher + MQTT 订阅（即时生效） */
  activateEnv: (id: string | number) =>
    http.post<unknown, RemoteSyncActionResponse>(`/api/remote-sync/envs/${id}/activate`),

  // env / site 连通性诊断
  testMqttEnv: (id: string | number) =>
    http.post<unknown, RemoteSyncActionResponse>(`/api/remote-sync/envs/${id}/test-mqtt`),
  testHttpEnv: (id: string | number) =>
    http.post<unknown, RemoteSyncActionResponse>(`/api/remote-sync/envs/${id}/test-http`),
  testHttpSite: (id: string | number) =>
    http.post<unknown, RemoteSyncActionResponse>(`/api/remote-sync/sites/${id}/test-http`),

  // site CRUD（嵌套在 env 下）
  listSites: (envId: string | number) =>
    http.get(`/api/remote-sync/envs/${envId}/sites`),
  createSite: (envId: string | number, payload: RemoteSyncSitePayload | Record<string, unknown>) =>
    http.post(`/api/remote-sync/envs/${envId}/sites`, payload),
  updateSite: (id: string | number, payload: RemoteSyncSitePayload | Record<string, unknown>) =>
    http.put(`/api/remote-sync/sites/${id}`, payload),
  deleteSite: (id: string | number) => http.delete(`/api/remote-sync/sites/${id}`),

  // topology / runtime
  topology: () => http.get('/api/remote-sync/topology'),
  runtimeStatus: () =>
    http.get<unknown, RemoteSyncRuntimeStatus>('/api/remote-sync/runtime/status'),
  runtimeConfig: () => http.get('/api/remote-sync/runtime/config'),
  stopRuntime: () =>
    http.post<unknown, RemoteSyncActionResponse>('/api/remote-sync/runtime/stop'),

  // env 协同参数
  envConfig: (id: string | number) => http.get(`/api/remote-sync/envs/${id}/config`),
  updateEnvConfig: (id: string | number, payload: Record<string, unknown>) =>
    http.put(`/api/remote-sync/envs/${id}/config`, payload),

  // 任务队列 / 失败任务
  activeTasks: () => http.get('/api/remote-sync/tasks/active'),
  abortActiveTask: (id: string | number) =>
    http.post(`/api/remote-sync/tasks/${id}/abort`),
  failedTasks: () => http.get('/api/remote-sync/tasks/failed'),
  cleanupFailedTasks: () => http.delete('/api/remote-sync/tasks/failed'),
  retryFailedTask: (id: string | number) =>
    http.post(`/api/remote-sync/tasks/failed/${id}/retry`),

  // logs / stats / site metadata
  logs: (params: Record<string, unknown> = {}) => http.get('/api/remote-sync/logs', { params }),
  dailyStats: () => http.get('/api/remote-sync/stats/daily'),
  flowStats: () => http.get('/api/remote-sync/stats/flows'),
  siteMetadata: (id: string | number) => http.get(`/api/remote-sync/sites/${id}/metadata`),
  siteFiles: (id: string | number) => http.get(`/api/remote-sync/sites/${id}/files`),
};
