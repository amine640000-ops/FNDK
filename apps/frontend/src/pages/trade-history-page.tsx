import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@nevo/shared-utils";
import { SectionCard } from "@/components/section-card";
import { useDashboardStore } from "@/store/use-dashboard-store";

export function TradeHistoryPage() {
  const trades = useDashboardStore((state) => state.trades);
  const series = useDashboardStore((state) => state.profitSeries);

  return (
    <div className="grid gap-6">
      <SectionCard title="Daily Earnings Curve" subtitle="Daily realized profit from the AI trading engine.">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Line type="monotone" dataKey="profit" stroke="#00D4FF" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Trade Logs" subtitle="Simulated execution records, filterable by asset and strategy.">
        <div className="space-y-3">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 md:grid-cols-5"
            >
              <div>
                <div className="text-sm text-slate-400">Asset</div>
                <div className="font-medium text-white">{trade.asset}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Strategy</div>
                <div className="font-medium text-white">{trade.strategy}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Entry / Exit</div>
                <div className="font-medium text-white">
                  {trade.entryPrice} / {trade.exitPrice}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Profit</div>
                <div className="font-medium text-emerald-300">{formatCurrency(trade.profit)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-400">Timestamp</div>
                <div className="font-medium text-white">{new Date(trade.executedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

