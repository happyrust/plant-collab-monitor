import { http } from './http';

export const mqttApi = {
  nodes: () => http.get('/api/mqtt/nodes'),
  nodeByLocation: (location: string) => http.get(`/api/mqtt/nodes/${location}`),
  removeNode: (location: string) => http.delete(`/api/mqtt/nodes/${location}`),
  messages: () => http.get('/api/mqtt/messages'),
  messageDetail: (id: string) => http.get(`/api/mqtt/messages/${id}`),
  brokerLogs: () => http.get('/api/mqtt/broker/logs'),
  subscriptionStatus: () => http.get('/api/mqtt/subscription/status'),
  subscriptionStart: (payload: Record<string, unknown> = {}) =>
    http.post('/api/mqtt/subscription/start', payload),
  subscriptionStop: () => http.post('/api/mqtt/subscription/stop'),
  clearMasterConfig: () => http.post('/api/mqtt/subscription/clear-master-config'),
  setMaster: (payload: Record<string, unknown>) => http.post('/api/mqtt/node/set-master', payload),
  setClient: (payload: Record<string, unknown>) => http.post('/api/mqtt/node/set-client', payload),
};
