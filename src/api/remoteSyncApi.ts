import { http } from './http';

export const remoteSyncApi = {
  listEnvs: () => http.get('/api/remote-sync/envs'),
  getEnv: (id: string) => http.get(`/api/remote-sync/envs/${id}`),
  listSites: (envId: string) => http.get(`/api/remote-sync/envs/${envId}/sites`),
  getSite: (id: string) => http.get(`/api/remote-sync/sites/${id}`),
  topology: () => http.get('/api/remote-sync/topology'),
  runtimeStatus: () => http.get('/api/remote-sync/runtime/status'),
  runtimeConfig: () => http.get('/api/remote-sync/runtime/config'),
  stopRuntime: () => http.post('/api/remote-sync/runtime/stop'),
  logs: (params: Record<string, unknown> = {}) => http.get('/api/remote-sync/logs', { params }),
  dailyStats: () => http.get('/api/remote-sync/stats/daily'),
  flowStats: () => http.get('/api/remote-sync/stats/flows'),
  siteMetadata: (id: string) => http.get(`/api/remote-sync/sites/${id}/metadata`),
  siteFiles: (id: string) => http.get(`/api/remote-sync/sites/${id}/files`),
};
