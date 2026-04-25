import { http } from './http';

export interface AdminSession {
  token: string;
  username: string;
  role: string;
  expires_at: string;
}

export interface AdminLoginPayload {
  username: string;
  password: string;
}

export const adminAuthApi = {
  login: (username: string, password: string) =>
    http.post<AdminLoginPayload, AdminSession>('/api/admin/auth/login', { username, password }),

  logout: () =>
    http.post<unknown, { success?: boolean }>('/api/admin/auth/logout'),

  me: () =>
    http.get<unknown, AdminSession>('/api/admin/auth/me'),
};
