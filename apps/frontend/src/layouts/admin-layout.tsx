import {
  BellRing,
  Coins,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Shield,
  Users
} from "lucide-react";
import { Outlet } from "react-router-dom";
import { SidebarNav } from "@/components/sidebar-nav";

const items = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/finance", label: "Deposits & Withdrawals", icon: ReceiptText },
  { to: "/admin/profit", label: "VIP & Profit", icon: Coins },
  { to: "/admin/notifications", label: "Notifications", icon: BellRing },
  { to: "/admin/settings", label: "Settings", icon: Settings }
];

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-aura px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <SidebarNav items={items} title="FNDK Control" kicker="Admin Panel" />
        <main className="space-y-6">
          <div className="glass-panel flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Protected area</p>
              <h2 className="text-lg font-semibold text-white">AdminGuard active</h2>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
              <Shield className="h-4 w-4" />
              Maintenance disabled
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
