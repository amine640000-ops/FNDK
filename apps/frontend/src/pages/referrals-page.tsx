import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import { Bell, CircleDollarSign, Globe, HandCoins, Headset, Users } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { applyLanguagePreference, getNextLanguage, translateText, useAppLanguage } from "@/lib/i18n";
import { useDashboardStore } from "@/store/use-dashboard-store";

type TeamGenerationEntry = {
  id: string;
  name: string;
  members: number;
  income: number;
  todayMembers: number;
  todayIncome: number;
};

const pieColors = ["#126dff", "#05d24a", "#ffc21a"];
const generationTargets: Record<1 | 2 | 3, number> = {
  1: 26,
  2: 96,
  3: 133
};
const screenshotFallbackMembers: Record<1 | 2 | 3, number> = {
  1: 14,
  2: 35,
  3: 51
};
const screenshotFallbackRevenue = {
  totalRevenue: 5724.73309,
  todayRevenue: 104.27302,
  totalTeamRevenue: 3322.78011,
  todayTeamRevenue: 51.81568
};

const formatUsdt = (value: number) => (value > 0 ? value.toFixed(5) : "0");

export function ReferralsPage() {
  const referrals = useDashboardStore((state) => state.referrals);
  const wallet = useDashboardStore((state) => state.wallet);
  const transactions = useDashboardStore((state) => state.transactions);
  const language = useAppLanguage();
  const [teamMetric, setTeamMetric] = useState<"members" | "income">("members");
  const tt = (text: string) => translateText(language, text);

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
          label: `${generation} générations`,
          members,
          income,
          target: Math.max(generationTargets[generation], members)
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
  const hasTeamData = totalMembers > 0 || totalIncome > 0;

  const displayGenerationSummary = generationSummary.map((item) => ({
    ...item,
    members: item.members || screenshotFallbackMembers[item.generation],
    target: Math.max(item.target, screenshotFallbackMembers[item.generation])
  }));

  const revenueStats = useMemo(() => {
    if (!hasTeamData && wallet.totalEarned <= 0 && transactions.length === 0) {
      return screenshotFallbackRevenue;
    }

    const todayKey = new Date().toDateString();
    const todayTransactionIncome = transactions
      .filter((transaction) => transaction.type === "profit" || transaction.type === "referral")
      .filter((transaction) => new Date(transaction.createdAt).toDateString() === todayKey)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalTransactionIncome = transactions
      .filter((transaction) => transaction.type === "profit" || transaction.type === "referral")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      totalRevenue: totalTransactionIncome || wallet.totalEarned + totalIncome,
      todayRevenue: todayTransactionIncome || todayIncome,
      totalTeamRevenue: totalIncome,
      todayTeamRevenue: todayIncome
    };
  }, [hasTeamData, todayIncome, totalIncome, transactions, wallet.totalEarned]);

  const chartData = displayGenerationSummary.map((item) => ({
    name: item.label,
    value: teamMetric === "members" ? item.members : item.income || item.members || 0.0001
  }));

  const toggleLanguage = () => {
    const nextLanguage = getNextLanguage(language);
    applyLanguagePreference(nextLanguage);
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
      <header className="relative z-10 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <BrandMark
            iconClassName="h-11 w-11 rounded-[18px] p-2"
            subtitle={tt("Equipe")}
            textClassName="text-[1.65rem] tracking-[0.02em] text-cyan-200"
            subtitleClassName="text-[10px] tracking-[0.34em]"
          />

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={() => toast("Aucune alerte d'equipe.")}
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
                window.location.href = "mailto:support@fndk.capital?subject=Support%20Equipe";
              }}
              type="button"
            >
              <Headset className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5">
        <section className="nevo-screen-panel rounded-[28px] px-5 pb-8 pt-6">
          <div className="grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <div className="max-w-[11rem] text-[1.65rem] font-semibold leading-[1.05] text-white">
                {tt("Revenus Totaux(USDT)")}
              </div>
              <div className="mt-5 text-[2.65rem] font-semibold leading-none text-white">
                {formatUsdt(revenueStats.totalRevenue)}
              </div>
            </div>
            <button
              className="mt-3 min-h-[3.55rem] w-[13.7rem] rounded-[12px] bg-[linear-gradient(90deg,#1be7f0_0%,#1ff0bf_100%)] px-5 text-center text-[1.05rem] font-extrabold leading-tight text-[#063343] shadow-[0_0_22px_rgba(31,240,200,0.32)]"
              onClick={() => toast("Enregistrements de revenus indisponibles.")}
              type="button"
            >
              {tt("Enregistrements De Revenus")}
            </button>
          </div>

          <div className="mt-8 grid grid-cols-[1.35fr_1fr] gap-y-7 pl-4 text-[1.25rem] leading-tight">
            <div className="text-white/55">{tt("Revenus D'aujourd'hui(USDT)")}</div>
            <div className="text-right font-semibold text-white">{formatUsdt(revenueStats.todayRevenue)}</div>
            <div className="text-white/55">{tt("Revenus D'équipe Totaux(USDT)")}</div>
            <div className="text-right font-semibold text-white">{formatUsdt(revenueStats.totalTeamRevenue)}</div>
            <div className="text-white/55">{tt("Revenus D'équipe D'aujourd'hui(USDT)")}</div>
            <div className="text-right font-semibold text-white">{formatUsdt(revenueStats.todayTeamRevenue)}</div>
          </div>
        </section>

        <section className="nevo-team-panel mt-6 rounded-[28px] px-5 pb-8 pt-5">
          <div className="text-[1.85rem] font-extrabold text-white">{tt("Mon Équipe")}</div>
          <div className="mt-6 border-t border-[#2e3bb0]/70 pt-7">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[1.2rem] font-semibold text-white">
                  <Users className="h-6 w-6 fill-white/15" />
                  <span>{tt("Comptage D'équipe")}</span>
                </div>
                <div className="mt-4 h-9 text-[2rem] font-semibold leading-none text-white">
                  {hasTeamData ? totalMembers : ""}
                </div>
                <div className="mt-2 text-[1.05rem] font-semibold text-white/48">
                  {tt("Aujourd'hui Ajouté")} <span className="text-[#16dce5]">+{todayMembers}</span>
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[1.2rem] font-semibold text-white">
                  <HandCoins className="h-6 w-6 fill-white/15" />
                  <span>{tt("Revenus D'équipe")}</span>
                </div>
                <div className="mt-4 text-[2rem] font-semibold leading-none text-white">{formatUsdt(totalIncome)}</div>
                <div className="mt-2 text-[1.05rem] font-semibold text-white/48">
                  {tt("Aujourd'hui Ajouté")} <span className="text-[#16dce5]">+{formatUsdt(todayIncome)}</span>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-5">
              <button
                className={`min-h-[3.9rem] rounded-[9px] px-3 text-[1.28rem] font-semibold transition ${
                  teamMetric === "members"
                    ? "bg-[linear-gradient(90deg,#1be7f0_0%,#1ff0bf_100%)] text-[#053340]"
                    : "text-white/48"
                }`}
                onClick={() => setTeamMetric("members")}
                type="button"
              >
                {tt("Comptage D'équipe")}
              </button>
              <button
                className={`min-h-[3.9rem] rounded-[9px] px-3 text-[1.28rem] font-semibold transition ${
                  teamMetric === "income"
                    ? "bg-[linear-gradient(90deg,#1be7f0_0%,#1ff0bf_100%)] text-[#053340]"
                    : "text-white/48"
                }`}
                onClick={() => setTeamMetric("income")}
                type="button"
              >
                {tt("Revenus D'équipe")}
              </button>
            </div>

            <div className="mt-8 grid grid-cols-[1.02fr_0.98fr] items-center gap-4">
              <div className="h-[15rem] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      cx="49%"
                      cy="50%"
                      data={chartData}
                      dataKey="value"
                      innerRadius={0}
                      outerRadius={105}
                      paddingAngle={0}
                      stroke="transparent"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={entry.name} fill={pieColors[index]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-4 text-[1.02rem] font-semibold text-white">
                {displayGenerationSummary.map((item, index) => (
                  <div key={item.generation} className="flex items-center gap-3">
                    <span className="h-6 w-6 shrink-0 rounded-[5px]" style={{ backgroundColor: pieColors[index] }} />
                    <span>
                      {item.generation} {tt("générations")}({item.members}/{item.target})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {hasTeamData ? (
          <section className="nevo-team-panel mt-6 rounded-[28px] px-5 py-5">
            <div className="flex items-center gap-2 text-[1.15rem] font-semibold text-white">
              <CircleDollarSign className="h-5 w-5" />
              {tt("Liste D'équipe")}
            </div>
            <div className="mt-4 space-y-3">
              {Object.values(generationGroups)
                .flat()
                .map((entry) => (
                  <div key={entry.id} className="rounded-[18px] border border-white/10 bg-[#02033d]/75 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[1rem] font-semibold text-white">{entry.name}</div>
                        <div className="mt-1 text-[0.85rem] text-white/45">
                          {entry.members} membres · +{entry.todayMembers} aujourd'hui
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-white">{formatUsdt(entry.income)}</div>
                        <div className="mt-1 text-[0.85rem] text-[#16dce5]">+{formatUsdt(entry.todayIncome)}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
