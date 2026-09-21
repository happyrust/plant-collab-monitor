import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { adminAuthApi, type AdminProfile, type AdminSession } from '@/api/adminAuthApi';

function parseFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  return !/^(0|false|off|no)$/i.test(raw.trim());
}

/**
 * 管理员自动登录（2026-09-21）：开发态（`npm run dev`）默认开，生产构建默认关；
 * `VITE_ADMIN_AUTO_LOGIN=1|0` 可显式开关，账密取 `VITE_ADMIN_USER / VITE_ADMIN_PASS`，
 * 缺省 `admin / admin`（与后端 ADMIN_USER / ADMIN_PASS 的默认值一致）。
 * 开着时：进 admin 页面 / 收到 401 先静默拿 token，拿不到才弹登录框（框里预填这对账密）。
 */
export const adminAutoLogin = {
  enabled: parseFlag(import.meta.env.VITE_ADMIN_AUTO_LOGIN, import.meta.env.DEV),
  username: import.meta.env.VITE_ADMIN_USER || 'admin',
  password: import.meta.env.VITE_ADMIN_PASS || 'admin',
} as const;

function errorMessage(err: unknown): string {
  return typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

const STORAGE_KEYS = {
  token: 'admin_token',
  username: 'admin_username',
  role: 'admin_role',
  expiresAt: 'admin_expires_at',
} as const;

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage may be unavailable (privacy mode); ignore
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const useAdminAuthStore = defineStore('adminAuth', () => {
  const token = ref<string | null>(readStorage(STORAGE_KEYS.token));
  const username = ref<string | null>(readStorage(STORAGE_KEYS.username));
  const role = ref<string | null>(readStorage(STORAGE_KEYS.role));
  const expiresAt = ref<string | null>(readStorage(STORAGE_KEYS.expiresAt));

  const loginVisible = ref(false);
  const loginError = ref<string | null>(null);
  const backendAdminUnconfigured = ref(false);
  /** 最近一次自动登录失败的原因（成功或未启用时为 null），登录框用它提示 */
  const autoLoginError = ref<string | null>(null);
  let autoLoginInFlight: Promise<boolean> | null = null;

  const isLoggedIn = computed(() => !!token.value);

  function setSession(session: AdminSession): void {
    token.value = session.token;
    username.value = session.username;
    role.value = session.role;
    expiresAt.value = session.expires_at;
    writeStorage(STORAGE_KEYS.token, session.token);
    writeStorage(STORAGE_KEYS.username, session.username);
    writeStorage(STORAGE_KEYS.role, session.role);
    if (session.expires_at) {
      writeStorage(STORAGE_KEYS.expiresAt, session.expires_at);
    } else {
      removeStorage(STORAGE_KEYS.expiresAt);
    }
    backendAdminUnconfigured.value = false;
  }

  function updateProfile(profile: AdminProfile): void {
    username.value = profile.username;
    role.value = profile.role;
    writeStorage(STORAGE_KEYS.username, profile.username);
    writeStorage(STORAGE_KEYS.role, profile.role);
    backendAdminUnconfigured.value = false;
  }

  function clearSession(): void {
    token.value = null;
    username.value = null;
    role.value = null;
    expiresAt.value = null;
    removeStorage(STORAGE_KEYS.token);
    removeStorage(STORAGE_KEYS.username);
    removeStorage(STORAGE_KEYS.role);
    removeStorage(STORAGE_KEYS.expiresAt);
  }

  function promptLogin(error?: string | null): void {
    loginError.value = error ?? null;
    loginVisible.value = true;
  }

  function dismissLogin(): void {
    loginVisible.value = false;
    loginError.value = null;
  }

  function markBackendUnconfigured(): void {
    backendAdminUnconfigured.value = true;
    loginVisible.value = false;
  }

  /**
   * 用配置里的账密静默登录。已登录 → true；未启用 → false；否则发一次 login，
   * 并发调用共用同一个请求。失败不弹框，只记 autoLoginError 交给调用方决定要不要弹。
   */
  async function ensureAutoLogin(): Promise<boolean> {
    if (isLoggedIn.value) return true;
    if (!adminAutoLogin.enabled) return false;
    if (autoLoginInFlight) return autoLoginInFlight;
    autoLoginInFlight = (async () => {
      try {
        const session = await adminAuthApi.login(adminAutoLogin.username, adminAutoLogin.password);
        setSession(session);
        autoLoginError.value = null;
        return true;
      } catch (err: unknown) {
        autoLoginError.value = errorMessage(err);
        console.warn('[adminAuth] 自动登录失败:', autoLoginError.value);
        return false;
      } finally {
        autoLoginInFlight = null;
      }
    })();
    return autoLoginInFlight;
  }

  return {
    token,
    username,
    role,
    expiresAt,
    loginVisible,
    loginError,
    backendAdminUnconfigured,
    autoLoginError,
    isLoggedIn,
    setSession,
    updateProfile,
    clearSession,
    promptLogin,
    dismissLogin,
    markBackendUnconfigured,
    ensureAutoLogin,
  };
});
