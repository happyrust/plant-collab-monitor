import { http } from './http';

export const remoteSyncApi = {
  // env CRUD
  listEnvs: () => http.get('/api/remote-sync/envs'),
  getEnv: (id: string | number) => http.get(`/api/remote-sync/envs/${id}`),
  createEnv: (payload: Record<string, unknown>) =>
    http.post('/api/remote-sync/envs', payload),
  deleteEnv: (id: string | number) => http.delete(`/api/remote-sync/envs/${id}`),

  // site CRUD（嵌套在 env 下）
  listSites: (envId: string | number) =>
    http.get(`/api/remote-sync/envs/${envId}/sites`),
  createSite: (envId: string | number, payload: Record<string, unknown>) =>
    http.post(`/api/remote-sync/envs/${envId}/sites`, payload),
  getSite: (id: string | number) => http.get(`/api/remote-sync/sites/${id}`),
  deleteSite: (id: string | number) => http.delete(`/api/remote-sync/sites/${id}`),

  // topology / runtime
  topology: () => http.get('/api/remote-sync/topology'),
  runtimeStatus: () => http.get('/api/remote-sync/runtime/status'),
  runtimeConfig: () => http.get('/api/remote-sync/runtime/config'),
  stopRuntime: () => http.post('/api/remote-sync/runtime/stop'),

  // logs / stats / site metadata
  logs: (params: Record<string, unknown> = {}) => http.get('/api/remote-sync/logs', { params }),
  dailyStats: () => http.get('/api/remote-sync/stats/daily'),
  flowStats: () => http.get('/api/remote-sync/stats/flows'),
  siteMetadata: (id: string | number) => http.get(`/api/remote-sync/sites/${id}/metadata`),
  siteFiles: (id: string | number) => http.get(`/api/remote-sync/sites/${id}/files`),
};
