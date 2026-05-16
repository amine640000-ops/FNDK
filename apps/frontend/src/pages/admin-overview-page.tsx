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
import { Coins, Landmark, Users, Wallet2 } from "lucide-react";
import { formatCurrency } from "@nevo/shared-utils";
import { SectionCard } from "@/components/section-card";
import { StatCard } from "@/components/stat-card";
import { useDashboardStore } from "@/store/use-dashboard-store";

export function AdminOverviewPage() {
  const metrics = useDashboardStore((state) => state.adminMetrics);
  const series = useDashboardStore((state) => state.adminSeries);

  return (
    <div className="grid gap-6">
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

