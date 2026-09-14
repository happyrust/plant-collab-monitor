import { http } from './http';

/**
 * 部署站点（Deployment Site）· 公开只读清单
 *
 * 后端 `plant-model-gen/src/web_server/mod.rs` 只注册了两个公开只读路由：
 *   GET /api/deployment-sites        → 站点清单（不含 DB 凭据 / 项目路径等敏感字段）
 *   GET /api/deployment-sites/{id}   → 单个站点
 *
 * 2026-09-14 收敛：原先封装的 import-dboption / create / update / delete /
 * tasks / healthcheck / export-config 七个端点在后端不存在，已删除。
 * 部署动作（测连通 / 应用 / 激活）走 `remoteSyncApi`。
 */
export interface DeploymentSiteSummary {
  id: number | string;
  name: string;
  location?: string;
  status?: string;
  created_at?: string | number;
  updated_at?: string | number;
  [k: string]: unknown;
}

export const deploymentSitesApi = {
  list: () =>
    http.get<unknown, DeploymentSiteSummary[]>('/api/deployment-sites'),

  get: (id: number | string) =>
    http.get<unknown, DeploymentSiteSummary>(`/api/deployment-sites/${id}`),
};
