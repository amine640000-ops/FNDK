import { Navigate, Outlet, useLocation } from "react-router-dom";
import { clearAuthSession, getAccessToken, getStoredUser, isAccessTokenExpired, type StoredUserSession } from "@/lib/auth";

type AuthGuardProps = {
  allowedRoles?: Array<"USER" | "ADMIN">;
};

export function AuthGuard({ allowedRoles }: AuthGuardProps) {
  const location = useLocation();
  const token = getAccessToken();
  const user = getStoredUser<StoredUserSession>();

  if (!token || !user || isAccessTokenExpired(token)) {
    clearAuthSession();
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  if (allowedRoles && (!user.role || !allowedRoles.includes(user.role))) {
    return <Navigate replace to={user.role === "ADMIN" ? "/admin" : "/app"} />;
  }

  return <Outlet />;
}
