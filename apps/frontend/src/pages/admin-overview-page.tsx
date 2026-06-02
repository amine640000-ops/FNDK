import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import toast from "react-hot-toast";
import { Coins, Landmark, Users, Wallet2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AdminOverviewMetrics } from "@nevo/shared-types";
import { formatCurrency } from "@nevo/shared-utils";
import { adminApi, isApiAuthError } from "@/api/client";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { clearAuthSession, getAccessToken } from "@/lib/auth";
import { useDashboardStore } from "@/store/use-dashboard-store";

const emptyAdminMetrics: AdminOverviewMetrics = {
  totalUsers: 0,
  totalDeposited: 0,
  totalProfitPaidOut: 0,
  pendingWithdrawals: 0,
  platformRevenue: 0
};

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const storeMetrics = useDashboardStore((state) => state.adminMetrics);
  const series = useDashboardStore((state) => state.adminSeries);
  const [metrics, setMetrics] = useState<AdminOverviewMetrics>(storeMetrics ?? emptyAdminMetrics);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const loadedRef = useRef(false);

  const loadOverview = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    try {
      const response = await adminApi.get<AdminOverviewMetrics>("/admin/overview");

      setAdminApiOffline(false);
      setMetrics(response.data);
    } catch (error) {
      if (isApiAuthError(error)) {
        clearAuthSession();
        setAdminApiOffline(false);
        toast.error("Your admin session expired. Sign in again.");
        navigate("/login", { replace: true });
        return;
      }

      setAdminApiOffline(true);
      toast.error("Admin overview service is unavailable right now.");
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadOverview();
  }, []);

  return (
    <div className="grid gap-6">
      {adminApiOffline ? (
        <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          Live admin overview data is unavailable right now.
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-5">
        <StatCard label="Total users" value={metrics.totalUsers.toLocaleString()} hint="Registered investors" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Deposited" value={formatCurrency(metrics.totalDeposited)} hint="Approved capital" icon={<Wallet2 className="h-5 w-5" />} />
        <StatCard label="Profit paid" value={formatCurrency(metrics.totalProfitPaidOut)} hint="Distributed by task service" icon={<Coins className="h-5 w-5" />} />
        <StatCard label="Pending withdrawals" value={metrics.pendingWithdrawals.toString()} hint="Awaiting admin action" icon={<Landmark className="h-5 w-5" />} />
        <StatCard label="Revenue" value={formatCurrency(metrics.platformRevenue)} hint="20% platform fee on profits" icon={<Coins className="h-5 w-5" />} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Deposits per Day" subtitle="Seven-day capital inflow trend.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.deposits}>
                <defs>
                  <linearGradient id="depositFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#00D4FF" fill="url(#depositFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Active Users by Tier" subtitle="Current VIP distribution across the platform.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={series.tiers} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} fill="#FFD700" />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
