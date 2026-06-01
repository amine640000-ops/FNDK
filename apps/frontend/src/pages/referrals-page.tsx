import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import { Bell, ChevronRight, Globe, HandCoins, Headset, Users } from "lucide-react";
import { taskApi } from "@/api/client";
import { BrandMark } from "@/components/brand-mark";
import { getAccessToken } from "@/lib/auth";
import { applyLanguagePreference, getNextLanguage, translateText, useAppLanguage } from "@/lib/i18n";

type TeamGenerationSummary = {
  generation: 1 | 2 | 3;
  members: number;
  income: number;
  todayMembers: number;
  todayIncome: number;
};

type TeamSummaryResponse = {
  totalMembers: number;
  todayMembers: number;
  totalTeamRevenue: number;
  todayTeamRevenue: number;
  generations: TeamGenerationSummary[];
};

const pieColors = ["#126dff", "#05d24a", "#ffc21a"];

const formatUsdt = (value: number) => (value > 0 ? value.toFixed(5) : "0");
const zeroTeamGenerations = ([1, 2, 3] as const).map((generation) => ({
  generation,
  label: `${generation} générations`,
  members: 0,
  income: 0,
  todayMembers: 0,
  todayIncome: 0,
  target: 0
}));

export function ReferralsPage() {
  const language = useAppLanguage();
  const [teamMetric, setTeamMetric] = useState<"members" | "income">("members");
  const [activeGeneration, setActiveGeneration] = useState<1 | 2 | 3>(3);
  const [teamSummaryResponse, setTeamSummaryResponse] = useState<TeamSummaryResponse | null>(null);
  const tt = (text: string) => translateText(language, text);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;

    taskApi
      .get<TeamSummaryResponse>("/tasks/team/me")
      .then((response) => {
        if (active) {
          setTeamSummaryResponse(response.data);
        }
      })
      .catch(() => {
        if (active) {
          setTeamSummaryResponse(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const teamGenerations = useMemo(() => {
    if (!teamSummaryResponse) {
      return zeroTeamGenerations;
    }

    const remoteByGeneration = new Map(teamSummaryResponse.generations.map((item) => [item.generation, item]));

    return ([1, 2, 3] as const).map((generation) => {
      const item = remoteByGeneration.get(generation);

      return {
        generation,
        label: `${generation} générations`,
        members: item?.members ?? 0,
        income: item?.income ?? 0,
        todayMembers: item?.todayMembers ?? 0,
        todayIncome: item?.todayIncome ?? 0,
        target: item?.members ?? 0
      };
    });
  }, [teamSummaryResponse]);

  const revenueStats = useMemo(() => {
    if (teamSummaryResponse) {
      return {
        totalTeamRevenue: teamSummaryResponse.totalTeamRevenue,
        todayTeamRevenue: teamSummaryResponse.todayTeamRevenue
      };
    }

    return {
      totalTeamRevenue: 0,
      todayTeamRevenue: 0
    };
  }, [teamSummaryResponse]);
  const totalMembers = teamSummaryResponse?.totalMembers ?? 0;
  const todayMembers = teamSummaryResponse?.todayMembers ?? 0;
  const selectedGeneration = teamGenerations.find((item) => item.generation === activeGeneration) ?? teamGenerations[2];

  const chartData = teamGenerations.map((item) => ({
    name: item.label,
    value: teamMetric === "members" ? item.members : item.income
  }));

  const toggleLanguage = () => {
    const nextLanguage = getNextLanguage(language);
    applyLanguagePreference(nextLanguage);
    toast.success(translateText(nextLanguage, nextLanguage === "fr" ? "Language set to Francais." : nextLanguage === "ar" ? "Language set to Arabic." : "Language set to English."));
  };

  return (
    <div className="pb-6">
      <header className="app-top-header relative z-10 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
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
        <section className="nevo-team-panel rounded-[24px] px-5 pb-6 pt-4">
          <div className="text-[1.45rem] font-extrabold leading-none text-white">{tt("Mon Équipe")}</div>
          <div className="mt-5 border-t border-[#2e3bb0]/70 pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[1rem] font-semibold text-white">
                  <Users className="h-5 w-5 fill-white/15" />
                  <span>{tt("Comptage D'équipe")}</span>
                </div>
                <div className="mt-4 text-[1.45rem] font-semibold leading-none text-white">
                  {totalMembers}
                </div>
                <div className="mt-3 text-[0.88rem] font-semibold text-white/48">
                  {tt("Aujourd'hui Ajouté")} <span className="text-[#16dce5]">+{todayMembers}</span>
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-[1rem] font-semibold text-white">
                  <HandCoins className="h-5 w-5 fill-white/15" />
                  <span>{tt("Revenus D'équipe")}</span>
                </div>
                <div className="mt-4 text-[1.45rem] font-semibold leading-none text-white">{formatUsdt(revenueStats.totalTeamRevenue)}</div>
                <div className="mt-3 text-[0.88rem] font-semibold text-white/48">
                  {tt("Aujourd'hui Ajouté")} <span className="text-[#16dce5]">+{formatUsdt(revenueStats.todayTeamRevenue)}</span>
                </div>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 bg-[#060955]/80 p-1">
              <button
                className={`min-h-[3.15rem] rounded-[6px] px-3 text-[1.04rem] font-medium transition ${
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
                className={`min-h-[3.15rem] rounded-[6px] px-3 text-[1.04rem] font-medium transition ${
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

            <div className="mt-7 grid grid-cols-[1.02fr_0.98fr] items-center gap-3">
              <div className="h-[12.5rem] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      cx="49%"
                      cy="50%"
                      data={chartData}
                      dataKey="value"
                      innerRadius={0}
                      outerRadius={82}
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

              <div className="space-y-3 text-[0.9rem] font-semibold text-white">
                {teamGenerations.map((item, index) => (
                  <div key={item.generation} className="flex items-center gap-3">
                    <span className="h-4 w-4 shrink-0 rounded-[4px]" style={{ backgroundColor: pieColors[index] }} />
                    <span className="whitespace-nowrap">
                      {item.generation} {tt("générations")}({item.members}/{item.target})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="nevo-team-panel mt-5 rounded-[24px] px-5 pb-6 pt-5">
          <button className="flex w-full items-center justify-between gap-4 text-left" type="button">
            <span className="text-[1.35rem] font-extrabold text-white">{tt("Liste D'équipe")}</span>
            <ChevronRight className="h-6 w-6 shrink-0 text-white" />
          </button>

          <div className="mt-5 grid grid-cols-3 border-b border-[#2e3bb0]/70 text-center">
            {teamGenerations.map((item) => (
              <button
                key={item.generation}
                className={`relative pb-3 text-[1.05rem] font-medium transition ${
                  activeGeneration === item.generation ? "text-white" : "text-white/48"
                }`}
                onClick={() => setActiveGeneration(item.generation)}
                type="button"
              >
                {item.generation} {tt("générations")}
                {activeGeneration === item.generation ? (
                  <span className="absolute -bottom-[2px] left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,255,0.68)]" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6">
            <div>
              <div className="text-[1rem] leading-snug text-white/48">{tt("Membres D'équipe")}</div>
              <div className="mt-3 text-[1.25rem] font-extrabold text-white">
                {selectedGeneration.members}/{selectedGeneration.target}
              </div>
            </div>
            <div>
              <div className="text-[1rem] leading-snug text-white/48">{tt("Revenus D'équipe")}</div>
              <div className="mt-3 text-[1.25rem] font-extrabold text-white">{formatUsdt(selectedGeneration.income)}</div>
            </div>
            <div>
              <div className="text-[1rem] leading-snug text-white/48">{tt("Dynamiques D'équipe D'aujourd'hui")}</div>
              <div className="mt-3 text-[1.25rem] font-extrabold text-white">
                {selectedGeneration.todayMembers}/{selectedGeneration.target}
              </div>
            </div>
            <div>
              <div className="text-[1rem] leading-snug text-white/48">{tt("Revenus D'équipe D'aujourd'hui")}</div>
              <div className="mt-3 text-[1.25rem] font-extrabold text-white">{formatUsdt(selectedGeneration.todayIncome)}</div>
            </div>
            <div>
              <div className="text-[1rem] leading-snug text-white/48">{tt("Récompenses De Référence")}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
