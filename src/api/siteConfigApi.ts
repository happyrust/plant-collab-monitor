import { http } from './http';

export interface SiteConfig {
  project_path: string;
  included_projects: string[];
  project_name: string;
  project_code: string;
  module: string;
  location: string;
  location_dbs: number[];
  ip: string;
  user: string;
  password: string;
  port: string;
  mqtt_host: string;
  mqtt_port: number;
  server_release_ip: string;
  file_server_host: string;
  gen_model: boolean;
  gen_mesh: boolean;
  gen_spatial_tree: boolean;
  apply_boolean_operation: boolean;
  mesh_tol_ratio: number;
  total_sync: boolean;
  incr_sync: boolean;
  sync_live: boolean;
  sync_push_db_types: string[];
}

export const siteConfigApi = {
  get: () => http.get('/api/site-config'),
  info: () => http.get('/api/site/info'),
  save: (payload: SiteConfig) => http.post('/api/site-config/save', payload),
  validate: (payload: SiteConfig) => http.post('/api/site-config/validate', payload),
  reload: () => http.post('/api/site-config/reload'),
  restart: () => http.post('/api/site-config/restart'),
  serverIp: () => http.get('/api/site-config/server-ip'),
};
