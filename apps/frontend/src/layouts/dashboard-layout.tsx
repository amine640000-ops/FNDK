import { Outlet } from "react-router-dom";
import { AppBottomNav } from "@/components/app-bottom-nav";

export function DashboardLayout() {
  return (
    <div className="app-mobile-bg min-h-screen text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col sm:px-4 sm:py-6">
        <div className="phone-shell flex min-h-screen flex-1 flex-col sm:min-h-[880px] sm:rounded-[38px]">
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
          <AppBottomNav />
        </div>
      </div>
    </div>
  );
}
