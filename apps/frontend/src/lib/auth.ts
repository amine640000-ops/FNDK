export type StoredUserRole = "USER" | "ADMIN";

export type StoredUserSession = {
  role?: StoredUserRole;
  [key: string]: unknown;
};

export const AUTH_SESSION_EXPIRED_EVENT = "nevo:auth-expired";

const ACCESS_TOKEN_KEY = "nevo.accessToken";
const REFRESH_TOKEN_KEY = "nevo.refreshToken";
const USER_KEY = "nevo.user";

const parseJwtPayload = (token: string): { exp?: number } | null => {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    return JSON.parse(window.atob(paddedPayload)) as { exp?: number };
  } catch {
    return null;
  }
};

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

export const clearAuthSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const expireAuthSession = () => {
  clearAuthSession();
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
};

export const saveAuthSession = ({
  accessToken,
  refreshToken,
  user
}: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getStoredUser = <TUser extends StoredUserSession = StoredUserSession>() => {
  const rawUser = localStorage.getItem(USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as TUser;
  } catch {
    clearAuthSession();
    return null;
  }
};

export const isAccessTokenExpired = (token = getAccessToken(), skewSeconds = 30) => {
  if (!token) {
    return true;
  }

  const payload = parseJwtPayload(token);

  if (!payload?.exp) {
    return false;
  }

  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
};

export const authHeaders = () => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
