import axios, { type AxiosInstance } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE || '';

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
  },
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message =
      error?.response?.data?.message || error?.response?.data?.error || error?.message || String(error);
    return Promise.reject({
      status: error?.response?.status,
      message,
      raw: error?.response?.data,
    });
  },
);

export type ApiError = {
  status?: number;
  message: string;
  raw?: unknown;
};
