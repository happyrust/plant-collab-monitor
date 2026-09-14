import { http } from './http';

export interface AdminSession {
  token: string;
  username: string;
  role: string;
  /**
   * 过期时刻。plant-model-gen 后端返回 ISO 字符串；plant-web-server（standalone-real）
   * 的 login 响应没有这个字段，此时为 null（前端目前只存不校验）。
   */
  expires_at: string | null;
}

export interface AdminProfile {
  username: string;
  role: string;
}

export interface AdminLoginPayload {
  username: string;
  password: string;
}

type AdminAuthEnvelope = {
  data?: {
    token?: string;
    expires_at?: string;
    username?: string;
    role?: string;
    user?: {
      username?: string;
      role?: string;
    };
  };
  token?: string;
  expires_at?: string;
  username?: string;
  role?: string;
  user?: {
    username?: string;
    role?: string;
  };
};

function normalizeAdminSession(response: AdminAuthEnvelope): AdminSession {
  const data = response.data ?? response;
  const token = data.token;
  const username = data.username ?? data.user?.username;
  const role = data.role ?? data.user?.role;
  const expiresAt = data.expires_at ?? null;

  // expires_at 可缺（plant-web-server 不返回），其余三项缺一不可
  if (!token || !username || !role) {
    throw new Error('管理员登录响应缺少会话字段');
  }

  return {
    token,
    username,
    role,
    expires_at: expiresAt,
  };
}

function normalizeAdminProfile(response: AdminAuthEnvelope): AdminProfile {
  const data = response.data ?? response;
  const username = data.username ?? data.user?.username;
  const role = data.role ?? data.user?.role;

  if (!username || !role) {
    throw new Error('管理员信息响应缺少用户字段');
  }

  return {
    username,
    role,
  };
}

export const adminAuthApi = {
  login: async (username: string, password: string) =>
    normalizeAdminSession(
      await http.post<AdminLoginPayload, AdminAuthEnvelope>('/api/admin/auth/login', {
        username,
        password,
      }),
    ),

  logout: () =>
    http.post<unknown, { success?: boolean }>('/api/admin/auth/logout'),

  me: () =>
    http.get<unknown, AdminAuthEnvelope>('/api/admin/auth/me').then(normalizeAdminProfile),
};
