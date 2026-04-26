import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { AdminProfile, AdminSession } from '@/api/adminAuthApi';

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

  const isLoggedIn = computed(() => !!token.value);

  function setSession(session: AdminSession): void {
    token.value = session.token;
    username.value = session.username;
    role.value = session.role;
    expiresAt.value = session.expires_at;
    writeStorage(STORAGE_KEYS.token, session.token);
    writeStorage(STORAGE_KEYS.username, session.username);
    writeStorage(STORAGE_KEYS.role, session.role);
    writeStorage(STORAGE_KEYS.expiresAt, session.expires_at);
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

  return {
    token,
    username,
    role,
    expiresAt,
    loginVisible,
    loginError,
    backendAdminUnconfigured,
    isLoggedIn,
    setSession,
    updateProfile,
    clearSession,
    promptLogin,
    dismissLogin,
    markBackendUnconfigured,
  };
});
