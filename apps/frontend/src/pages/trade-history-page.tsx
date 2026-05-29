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
import { MobilePageHeader } from "@/components/mobile-page-header";
import { SectionCard } from "@/components/section-card";
import { translateText, useAppLanguage } from "@/lib/i18n";
import { useDashboardStore } from "@/store/use-dashboard-store";

export function TradeHistoryPage() {
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const trades = useDashboardStore((state) => state.trades);
  const series = useDashboardStore((state) => state.profitSeries);

  return (
    <div className="pb-6">
      <MobilePageHeader title="Trade History" subtitle="records" />

      <div className="grid gap-5 px-4 pt-5">
        <SectionCard title="Daily Earnings Curve" subtitle="Daily realized profit from the AI trading engine.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke="rgba(103,232,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#7d84bd" />
                <YAxis stroke="#7d84bd" />
                <Tooltip />
                <Line type="monotone" dataKey="profit" stroke="#6ee9ff" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Trade Logs" subtitle="Simulated execution records, filterable by asset and strategy.">
          <div className="space-y-3">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className="grid gap-3 rounded-[18px] border border-cyan-300/15 bg-[#050747]/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-[#7d84bd]">{tt("Asset")}</div>
                    <div className="font-semibold text-white">{trade.asset}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[#7d84bd]">{tt("Profit")}</div>
                    <div className="font-semibold text-cyan-200">{formatCurrency(trade.profit)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[#7d84bd]">{tt("Strategy")}</div>
                    <div className="font-medium text-white">{trade.strategy}</div>
                  </div>
                  <div>
                    <div className="text-[#7d84bd]">{tt("Entry / Exit")}</div>
                    <div className="font-medium text-white">
                      {trade.entryPrice} / {trade.exitPrice}
                    </div>
                  </div>
                </div>

                <div className="border-t border-cyan-300/10 pt-3 text-sm font-medium text-white/70">
                  {new Date(trade.executedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
