import { Outlet } from "react-router-dom";
import { AppBottomNav } from "@/components/app-bottom-nav";

export function DashboardLayout() {
  return (
    <div className="app-mobile-bg h-dvh overflow-hidden text-white">
      <div className="mx-auto flex h-full w-full max-w-[480px] flex-col sm:px-4 sm:py-6">
        <div className="phone-shell flex min-h-0 flex-1 flex-col sm:rounded-[42px]">
          <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
            <Outlet />
          </main>
          <AppBottomNav />
        </div>
      </div>
    </div>
  );
}
