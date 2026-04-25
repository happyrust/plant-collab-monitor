import { http } from './http';

export interface IncrementalArchiveFile {
  name: string;
  path: string;
  size: number;
  modified?: string | number;
  dbnum?: number | null;
  sesno?: number | null;
  [k: string]: unknown;
}

export interface IncrementalArchivesResponse {
  success: boolean;
  files?: IncrementalArchiveFile[];
  message?: string;
  [k: string]: unknown;
}

export const incrementalApi = {
  status: () => http.get<unknown, unknown>('/api/incremental/status'),

  history: (page = 1, pageSize = 20) =>
    http.get<unknown, unknown>('/api/incremental/history', {
      params: { page, page_size: pageSize },
    }),

  config: () => http.get<unknown, unknown>('/api/incremental/config'),

  saveConfig: (payload: unknown) =>
    http.post<unknown, unknown>('/api/incremental/config', payload),

  logs: () => http.get<unknown, unknown>('/api/incremental/logs'),

  archives: () =>
    http.get<unknown, IncrementalArchivesResponse>('/api/incremental/archives'),

  stats: () => http.get<unknown, unknown>('/api/incremental/stats'),

  detect: (siteId: string | number) =>
    http.post<unknown, unknown>(`/api/incremental/detect/${siteId}`),

  sync: (siteId: string | number) =>
    http.post<unknown, unknown>(`/api/incremental/sync/${siteId}`),

  abort: (siteId: string | number) =>
    http.post<unknown, unknown>(`/api/incremental/abort/${siteId}`),
};
