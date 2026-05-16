import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
};

export function StatCard({ label, value, hint, icon }: StatCardProps) {
  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-slate-300">{label}</span>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-cyan-300">{icon}</div>
      </div>
      <div className="metric-value text-3xl font-bold">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </div>
  );
}

