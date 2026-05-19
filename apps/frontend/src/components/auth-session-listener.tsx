import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AUTH_SESSION_EXPIRED_EVENT } from "@/lib/auth";

export function AuthSessionListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      navigate("/login", { replace: true });
    };

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [navigate]);

  return null;
}
