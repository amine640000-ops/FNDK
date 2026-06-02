import axios from "axios";
import { expireAuthSession, getAccessToken } from "@/lib/auth";

const htmlResponsePattern = /<html|<!doctype/i;

const isStaticFrontendApiUrl = (value: string) => /^https?:\/\/(www\.)?fndk\.site\/api\/?$/i.test(value) || value === "/api";

const readApiBaseUrl = (envName: string, developmentFallback: string, productionFallback = "/api") => {
  const value = import.meta.env[envName] as string | undefined;

  if (value) {
    if (import.meta.env.PROD && isStaticFrontendApiUrl(value) && productionFallback !== "/api") {
      console.warn(`Ignoring ${envName}=${value}. Using ${productionFallback}.`);
      return productionFallback;
    }

    return value;
  }

  if (import.meta.env.DEV) {
    return developmentFallback;
  }

  console.warn(`Missing ${envName}. Falling back to ${productionFallback}.`);
  return productionFallback;
};

const toUploadsBaseUrl = (apiBaseUrl: string) => apiBaseUrl.replace(/\/api\/?$/, "");

const parseApiResponse = (data: unknown) => {
  if (typeof data !== "string") {
    return data;
  }

  const trimmed = data.trim();
  if (!trimmed || htmlResponsePattern.test(trimmed)) {
    return data;
  }

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return data;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return data;
  }
};

const createApiClient = (baseURL: string) => {
  const client = axios.create({
    baseURL,
    transformResponse: [parseApiResponse]
  });

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
  identity: readApiBaseUrl("VITE_IDENTITY_API_URL", "http://localhost:4001/api", "https://identity-service-raa1.onrender.com/api"),
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
    if (error instanceof Error && /Unexpected token.*DOCTYPE/i.test(error.message)) {
      return "API service returned HTML instead of JSON. Check the API URL and upload size.";
    }

    return fallback;
  }

  if (!error.response) {
    return "API service is unreachable. Check the API URL and service status.";
  }

  const responseData = error.response.data;
  if (typeof responseData === "string") {
    if (htmlResponsePattern.test(responseData)) {
      return "API service returned HTML instead of JSON. Check the API URL and upload size.";
    }

    return responseData.trim() || fallback;
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
