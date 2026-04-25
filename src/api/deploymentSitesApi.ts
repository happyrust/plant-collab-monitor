import { http } from './http';

export interface DeploymentSiteSummary {
  id: number | string;
  name: string;
  location?: string;
  status?: string;
  created_at?: string | number;
  updated_at?: string | number;
  [k: string]: unknown;
}

export interface DeploymentSiteCreatePayload {
  name: string;
  location?: string;
  mqtt_host?: string;
  mqtt_port?: number;
  file_server_host?: string;
  [k: string]: unknown;
}

export type DeploymentSiteUpdatePayload = Partial<DeploymentSiteCreatePayload>;

export interface DeploymentSiteTask {
  id: number | string;
  site_id: number | string;
  status: string;
  created_at: string | number;
  [k: string]: unknown;
}

export interface DeploymentSiteHealthcheckResult {
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export const deploymentSitesApi = {
  importDbOption: () =>
    http.post<unknown, { success: boolean; imported?: number; message?: string }>(
      '/api/deployment-sites/import-dboption',
    ),

  list: () =>
    http.get<unknown, DeploymentSiteSummary[]>('/api/deployment-sites'),

  create: (payload: DeploymentSiteCreatePayload) =>
    http.post<DeploymentSiteCreatePayload, DeploymentSiteSummary>(
      '/api/deployment-sites',
      payload,
    ),

  get: (id: number | string) =>
    http.get<unknown, DeploymentSiteSummary>(`/api/deployment-sites/${id}`),

  update: (id: number | string, payload: DeploymentSiteUpdatePayload) =>
    http.put<DeploymentSiteUpdatePayload, DeploymentSiteSummary>(
      `/api/deployment-sites/${id}`,
      payload,
    ),

  delete: (id: number | string) =>
    http.delete<unknown, { success: boolean; message?: string }>(
      `/api/deployment-sites/${id}`,
    ),

  listTasks: (id: number | string) =>
    http.get<unknown, DeploymentSiteTask[]>(`/api/deployment-sites/${id}/tasks`),

  healthcheck: (id: number | string) =>
    http.post<unknown, DeploymentSiteHealthcheckResult>(
      `/api/deployment-sites/${id}/healthcheck`,
    ),

  exportConfig: (id: number | string) =>
    http.get<unknown, Record<string, unknown>>(
      `/api/deployment-sites/${id}/export-config`,
    ),
};
