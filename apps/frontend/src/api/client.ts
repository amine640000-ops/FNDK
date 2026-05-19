import axios from "axios";
import { expireAuthSession, getAccessToken } from "@/lib/auth";

const readApiBaseUrl = (envName: string, developmentFallback: string) => {
  const value = import.meta.env[envName] as string | undefined;

  if (value) {
    return value;
  }

  if (import.meta.env.DEV) {
    return developmentFallback;
  }

  console.warn(`Missing ${envName}. Falling back to same-origin /api.`);
  return "/api";
};

const toUploadsBaseUrl = (apiBaseUrl: string) => apiBaseUrl.replace(/\/api\/?$/, "");

const createApiClient = (baseURL: string) => {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    const token = getAccessToken();

    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        expireAuthSession();
      }

      return Promise.reject(error);
    }
  );

  return client;
};

export const apiBaseUrls = {
  identity: readApiBaseUrl("VITE_IDENTITY_API_URL", "http://localhost:4001/api"),
  wallet: readApiBaseUrl("VITE_WALLET_API_URL", "http://localhost:4002/api"),
  task: readApiBaseUrl("VITE_TASK_API_URL", "http://localhost:4004/api"),
  notification: readApiBaseUrl("VITE_NOTIFICATION_API_URL", "http://localhost:4005/api"),
  admin: readApiBaseUrl("VITE_ADMIN_API_URL", "http://localhost:4006/api")
};

export const uploadBaseUrls = {
  identity: toUploadsBaseUrl(apiBaseUrls.identity),
  wallet: toUploadsBaseUrl(apiBaseUrls.wallet),
  admin: toUploadsBaseUrl(apiBaseUrls.admin)
};

export const identityApi = createApiClient(apiBaseUrls.identity);
export const walletApi = createApiClient(apiBaseUrls.wallet);
export const taskApi = createApiClient(apiBaseUrls.task);
export const notificationApi = createApiClient(apiBaseUrls.notification);
export const adminApi = createApiClient(apiBaseUrls.admin);

export const isApiAuthError = (error: unknown) =>
  axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403);

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const message = error.response?.data?.message;

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message) && typeof message[0] === "string") {
    return message[0];
  }

  return fallback;
};

export { axios };
