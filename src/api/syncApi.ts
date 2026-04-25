import { http } from './http';

export interface SyncStatus {
  status: string;
  [key: string]: unknown;
}

export const syncApi = {
  status: () => http.get<unknown, SyncStatus>('/api/sync/status'),
  metrics: () => http.get('/api/sync/metrics'),
  metricsHistory: (time_range: string = 'day', limit = 100) =>
    http.get('/api/sync/metrics/history', { params: { time_range, limit } }),
  queue: () => http.get('/api/sync/queue'),
  config: () => http.get('/api/sync/config'),
  updateConfig: (payload: unknown) => http.put('/api/sync/config', payload),
  start: () => http.post('/api/sync/start'),
  stop: () => http.post('/api/sync/stop'),
  pause: () => http.post('/api/sync/pause'),
  resume: () => http.post('/api/sync/resume'),
  history: () => http.get('/api/sync/history'),

  // MQTT broker (托管在 sync namespace 下)
  mqttStart: (payload: Record<string, unknown> = { port: 1883 }) =>
    http.post('/api/sync/mqtt/start', payload),
  mqttStop: () => http.post('/api/sync/mqtt/stop'),
  mqttStatus: () => http.get('/api/sync/mqtt/status'),
};
