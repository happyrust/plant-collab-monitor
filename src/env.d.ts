/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_TARGET?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_BASE?: string;
  /** 管理员自动登录开关：'1' | '0'；缺省 = 开发态开、生产构建关（stores/adminAuth.ts） */
  readonly VITE_ADMIN_AUTO_LOGIN?: string;
  /** 自动登录 / 登录框预填的账号，缺省 admin */
  readonly VITE_ADMIN_USER?: string;
  /** 自动登录 / 登录框预填的密码，缺省 admin */
  readonly VITE_ADMIN_PASS?: string;
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
