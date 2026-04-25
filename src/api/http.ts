import axios, { type AxiosInstance } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || '';

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
  },
});

let getAuthToken: (() => string | null) | null = null;

export function registerAuthTokenProvider(
  provider: (() => string | null) | null,
): void {
  getAuthToken = provider;
}

http.interceptors.request.use((config) => {
  const token = getAuthToken?.();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

export type ApiError = {
  status?: number;
  message: string;
  raw?: unknown;
};

export type UnauthorizedHandler = (info: ApiError) => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  onUnauthorized = handler;
}

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status: number | undefined = error?.response?.status;
    const message: string =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      String(error);
    const apiError: ApiError = {
      status,
      message,
      raw: error?.response?.data,
    };

    if (status === 401 || status === 403) {
      onUnauthorized?.(apiError);
    } else if (
      status === 503 &&
      /管理员|admin|凭据/i.test(message)
    ) {
      onUnauthorized?.(apiError);
    }

    return Promise.reject(apiError);
  },
);
