import { Navigate, Outlet, useLocation } from "react-router-dom";

type StoredUser = {
  role?: "USER" | "ADMIN";
};

type AuthGuardProps = {
  allowedRoles?: Array<"USER" | "ADMIN">;
};

export function AuthGuard({ allowedRoles }: AuthGuardProps) {
  const location = useLocation();
  const token = localStorage.getItem("nevo.accessToken");
  const rawUser = localStorage.getItem("nevo.user");

  if (!token || !rawUser) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  try {
    const user = JSON.parse(rawUser) as StoredUser;
    if (allowedRoles && (!user.role || !allowedRoles.includes(user.role))) {
      return <Navigate replace to={user.role === "ADMIN" ? "/admin" : "/app"} />;
    }
  } catch {
    localStorage.removeItem("nevo.accessToken");
    localStorage.removeItem("nevo.refreshToken");
    localStorage.removeItem("nevo.user");
    return <Navigate replace state={{ from: location }} to="/login" />;
  }

  return <Outlet />;
}
