import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import { Bell, Copy, Globe, Headset, Sparkles, Users, Wallet } from "lucide-react";
import { formatCurrency } from "@nevo/shared-utils";
import { BrandMark } from "@/components/brand-mark";
import { useDashboardStore } from "@/store/use-dashboard-store";

type TeamGenerationEntry = {
  id: string;
  name: string;
  members: number;
  income: number;
  todayMembers: number;
  todayIncome: number;
};

type LanguageCode = "en" | "fr" | "ar";

const pieColors = ["#245DFF", "#14D945", "#FFC21A"];

export function ReferralsPage() {
  const referrals = useDashboardStore((state) => state.referrals);
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem("nevo.language");
    return stored === "fr" || stored === "ar" ? stored : "en";
  });
  const [teamMetric, setTeamMetric] = useState<"members" | "income">("members");
  const [generationTab, setGenerationTab] = useState<1 | 2 | 3>(1);

  const generationGroups = useMemo(() => {
    const groups: Record<1 | 2 | 3, TeamGenerationEntry[]> = { 1: [], 2: [], 3: [] };

    referrals.forEach((entry, index) => {
      const generation = ((index % 3) + 1) as 1 | 2 | 3;
      groups[generation].push({
        id: `${entry.userName}-${generation}`,
        name: entry.userName,
        members: entry.referrals,
        income: entry.bonusEarned,
        todayMembers: entry.referrals > 0 ? 1 : 0,
        todayIncome: Number((entry.bonusEarned * 0.08).toFixed(2))
      });
    });

    return groups;
  }, [referrals]);

  const generationSummary = useMemo(
    () =>
      ([1, 2, 3] as const).map((generation) => {
        const entries = generationGroups[generation];
        const members = entries.reduce((sum, entry) => sum + entry.members, 0);
        const income = entries.reduce((sum, entry) => sum + entry.income, 0);

        return {
          generation,
          label: `Generation ${generation}`,
          members,
          income
        };
      }),
    [generationGroups]
  );

  const totalMembers = generationSummary.reduce((sum, item) => sum + item.members, 0);
  const totalIncome = generationSummary.reduce((sum, item) => sum + item.income, 0);
  const todayMembers = Object.values(generationGroups)
    .flat()
    .reduce((sum, entry) => sum + entry.todayMembers, 0);
  const todayIncome = Object.values(generationGroups)
    .flat()
    .reduce((sum, entry) => sum + entry.todayIncome, 0);

  const chartData = generationSummary.map((item) => ({
    name: item.label,
    value: teamMetric === "members" ? item.members : item.income || 0.0001
  }));

  const shareLink = "https://fndk.capital/invite/FNDK-24KX9";

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    toast.success("Invite link copied.");
  };

  const toggleLanguage = () => {
    const nextLanguage = language === "en" ? "fr" : language === "fr" ? "ar" : "en";
    setLanguage(nextLanguage);
    localStorage.setItem("nevo.language", nextLanguage);
    document.documentElement.lang = nextLanguage;
    document.documentElement.dir = nextLanguage === "ar" ? "rtl" : "ltr";
    toast.success(
      nextLanguage === "ar"
        ? "تم ضبط اللغة على العربية."
        : nextLanguage === "fr"
          ? "Langue definie sur le francais."
          : "Language set to English."
    );
  };

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-10 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <BrandMark
            iconClassName="h-11 w-11 rounded-[18px] p-2"
            subtitle="Team hub"
            textClassName="text-[1.65rem] tracking-[0.02em] text-cyan-200"
            subtitleClassName="text-[10px] tracking-[0.34em]"
          />

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={() => toast("No team alerts yet.")}
              type="button"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Language"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={toggleLanguage}
              type="button"
            >
              <Globe className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Support"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={() => {
                window.location.href = "mailto:support@fndk.capital?subject=Team%20Support";
              }}
              type="button"
            >
              <Headset className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5">
        <section className="neon-panel relative overflow-hidden rounded-[34px] p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(91,120,255,0.24),transparent_58%)]" />
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] uppercase tracking-[0.18em] text-cyan-200/75">Total team income (USDT)</div>
                <div className="mt-2 text-[2.3rem] font-extrabold leading-none text-white">{totalIncome.toFixed(4)}</div>
              </div>
              <button
                className="rounded-[18px] bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#032932] shadow-[0_14px_24px_rgba(39,231,212,0.28)]"
                onClick={() => toast("Income records are not connected yet.")}
                type="button"
              >
                Income records
              </button>
            </div>

            <div className="mt-6 grid grid-cols-[1.2fr_0.8fr] gap-y-4 text-[15px]">
              <div className="text-white/45">Today income (USDT)</div>
              <div className="text-right font-semibold text-white">{todayIncome.toFixed(4)}</div>
              <div className="text-white/45">Total team income (USDT)</div>
              <div className="text-right font-semibold text-white">{totalIncome.toFixed(4)}</div>
              <div className="text-white/45">Today team growth</div>
              <div className="text-right font-semibold text-white">{todayMembers}</div>
            </div>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 rounded-[34px] p-5">
          <div className="flex items-center gap-2 text-cyan-200">
            <Users className="h-4 w-4" />
            <span className="text-sm uppercase tracking-[0.24em]">My team</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-white/55">
                <Users className="h-4 w-4" />
                <span className="text-sm">Team members</span>
              </div>
              <div className="mt-3 text-[2rem] font-extrabold text-white">{totalMembers}</div>
              <div className="mt-1 text-[13px] text-cyan-300">+{todayMembers} today</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2 text-white/55">
                <Wallet className="h-4 w-4" />
                <span className="text-sm">Team income</span>
              </div>
              <div className="mt-3 text-[2rem] font-extrabold text-white">{totalIncome.toFixed(4)}</div>
              <div className="mt-1 text-[13px] text-cyan-300">+{todayIncome.toFixed(4)} today</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              className={`rounded-[18px] px-4 py-3 text-base font-semibold transition ${
                teamMetric === "members" ? "bg-cyan-300 text-[#032932]" : "bg-white/5 text-white/55"
              }`}
              onClick={() => setTeamMetric("members")}
              type="button"
            >
              Team count
            </button>
            <button
              className={`rounded-[18px] px-4 py-3 text-base font-semibold transition ${
                teamMetric === "income" ? "bg-cyan-300 text-[#032932]" : "bg-white/5 text-white/55"
              }`}
              onClick={() => setTeamMetric("income")}
              type="button"
            >
              Team income
            </button>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
            <div className="h-64">
              {generationSummary.some((item) => item.members > 0 || item.income > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      cx="50%"
                      cy="50%"
                      data={chartData}
                      dataKey="value"
                      innerRadius={0}
                      outerRadius={96}
                      paddingAngle={0}
                      stroke="transparent"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/5 text-sm text-white/45">
                  Team data will appear here.
                </div>
              )}
            </div>

            <div className="space-y-4">
              {generationSummary.map((item, index) => (
                <div key={item.generation} className="flex items-start gap-3">
                  <div className="mt-1 h-6 w-6 rounded-md" style={{ backgroundColor: pieColors[index] }} />
                  <div>
                    <div className="text-[15px] font-semibold text-white">{item.label}</div>
                    <div className="mt-1 text-[13px] text-slate-400">
                      {item.members} members · {formatCurrency(item.income)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="neon-panel mt-5 rounded-[34px] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[1.25rem] font-extrabold text-white">Team list</div>
              <div className="mt-1 text-[13px] text-slate-400">Three-level network and reward tracking.</div>
            </div>
            <button
              className="rounded-full border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-100"
              onClick={() => void copyShareLink()}
              type="button"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          <div className="hide-scrollbar mt-5 flex items-center gap-5 overflow-x-auto border-b border-white/10 pb-3">
            {([1, 2, 3] as const).map((generation) => (
              <button
                key={generation}
                className={`relative shrink-0 text-[15px] font-semibold transition ${
                  generationTab === generation ? "text-cyan-200" : "text-white/45"
                }`}
                onClick={() => setGenerationTab(generation)}
                type="button"
              >
                Generation {generation}
                {generationTab === generation ? (
                  <span className="absolute -bottom-3 left-0 h-1 w-full rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {generationGroups[generationTab].length ? (
              generationGroups[generationTab].map((entry) => (
                <div key={entry.id} className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-semibold text-white">{entry.name}</div>
                      <div className="mt-1 text-[13px] text-slate-400">
                        {entry.members} members · +{entry.todayMembers} today
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[1rem] font-semibold text-cyan-100">{formatCurrency(entry.income)}</div>
                      <div className="mt-1 text-[12px] text-cyan-300">+{formatCurrency(entry.todayIncome)}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                No users in this generation yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
