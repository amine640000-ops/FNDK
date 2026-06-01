import { Outlet, useLocation } from "react-router-dom";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { AuthSessionListener } from "@/components/auth-session-listener";

export function DashboardLayout() {
  const location = useLocation();
  const hideBottomNav = location.pathname === "/app/wallet/withdraw";

  return (
    <div className="app-mobile-bg app-viewport overflow-hidden text-white">
      <AuthSessionListener />
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col sm:px-4 sm:py-6">
        <div className="phone-shell flex min-h-0 flex-1 flex-col sm:rounded-[42px]">
          <main
            className={`app-scroll-area relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain ${
              hideBottomNav ? "withdraw-main-scroll pb-0" : "pb-4"
            }`}
          >
            <Outlet />
          </main>
          {hideBottomNav ? null : <AppBottomNav />}
        </div>
      </div>
    </div>
  );
}
