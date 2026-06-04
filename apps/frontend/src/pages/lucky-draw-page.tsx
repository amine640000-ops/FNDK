import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Gift, RotateCw, Ticket, Trophy } from "lucide-react";
import type { LuckyDrawSummary, LuckyDrawSpinResult } from "@nevo/shared-types";
import { walletApi, getApiErrorMessage } from "@/api/client";
import { MobilePageHeader } from "@/components/mobile-page-header";
import { getAccessToken } from "@/lib/auth";
import { translateText, useAppLanguage } from "@/lib/i18n";

const emptySummary: LuckyDrawSummary = {
  event: {
    title: "Lucky Draw Event",
    startsAt: "2026-06-03T22:00:00.000Z",
    endsAt: "2026-06-08T21:59:00.000Z",
    isActive: false,
    rules: []
  },
  totalSpins: 0,
  availableSpins: 0,
  usedSpins: 0,
  awards: [],
  results: []
};

const formatEventDate = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin"
  });

export function LuckyDrawPage() {
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const [summary, setSummary] = useState<LuckyDrawSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<LuckyDrawSpinResult | null>(null);

  const eventRange = useMemo(
    () => `${formatEventDate(summary.event.startsAt)} - ${formatEventDate(summary.event.endsAt)}`,
    [summary.event.endsAt, summary.event.startsAt]
  );

  const loadSummary = async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await walletApi.get<LuckyDrawSummary>("/wallet/lucky-draw");
      setSummary(response.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not load Lucky Draw.")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const useSpin = async () => {
    if (summary.availableSpins <= 0) {
      toast.error(tt("No Lucky Draw spins available."));
      return;
    }

    setSpinning(true);
    try {
      const response = await walletApi.post<LuckyDrawSpinResult & { availableSpins: number }>("/wallet/lucky-draw/spin");
      setLastResult(response.data);
      setSummary((current) => ({
        ...current,
        availableSpins: response.data.availableSpins,
        usedSpins: current.usedSpins + 1,
        results: [response.data, ...current.results].slice(0, 20)
      }));
      toast.success(tt("Lucky Draw spin recorded."));
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not use Lucky Draw spin.")));
    } finally {
      setSpinning(false);
    }
  };

  return (
    <div className="pb-6">
      <MobilePageHeader subtitle={tt("Lucky Draw Event")} title={tt("Lucky Draw")} />

      <div className="px-4 pt-5">
        <section className="neon-panel overflow-hidden rounded-[30px] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/75">{tt("Event period")}</div>
              <h1 className="mt-2 text-[2rem] font-extrabold leading-none text-white">{tt(summary.event.title)}</h1>
              <div className="mt-3 text-sm leading-6 text-slate-300">{eventRange}</div>
              <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${
                summary.event.isActive
                  ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                  : "border-amber-300/30 bg-amber-300/10 text-amber-100"
              }`}>
                {summary.event.isActive ? tt("Active") : tt("Inactive")}
              </div>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.28)]">
              <Trophy className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-cyan-300/15 bg-white/[0.04] px-3 py-4 text-center">
              <div className="text-[1.65rem] font-extrabold text-cyan-200">{summary.availableSpins}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">{tt("Available")}</div>
            </div>
            <div className="rounded-[18px] border border-cyan-300/15 bg-white/[0.04] px-3 py-4 text-center">
              <div className="text-[1.65rem] font-extrabold text-white">{summary.totalSpins}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">{tt("Total spins")}</div>
            </div>
            <div className="rounded-[18px] border border-cyan-300/15 bg-white/[0.04] px-3 py-4 text-center">
              <div className="text-[1.65rem] font-extrabold text-white">{summary.usedSpins}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">{tt("Used")}</div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid place-items-center">
          <button
            className={`relative grid h-56 w-56 place-items-center rounded-full border-[10px] border-cyan-300/50 bg-[conic-gradient(from_0deg,#22d3ee,#f4b83f,#7c3aed,#22c55e,#22d3ee)] shadow-[0_0_45px_rgba(34,211,238,0.32)] transition disabled:opacity-60 ${spinning ? "animate-spin" : ""}`}
            disabled={loading || spinning || !summary.event.isActive || summary.availableSpins <= 0}
            onClick={() => void useSpin()}
            type="button"
          >
            <span className="grid h-28 w-28 place-items-center rounded-full border border-white/20 bg-[#050849] text-center text-sm font-extrabold uppercase tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
              {spinning ? <RotateCw className="h-8 w-8" /> : tt("Spin")}
            </span>
          </button>
          {lastResult ? (
            <div className="mt-4 rounded-[20px] border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-center text-sm font-semibold text-emerald-100">
              {tt(lastResult.resultLabel)}
            </div>
          ) : null}
        </section>

        <section className="neon-soft-panel mt-6 rounded-[26px] p-4">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-extrabold text-white">
            <Gift className="h-5 w-5 text-cyan-200" />
            {tt("How to earn spins")}
          </div>
          <div className="grid gap-3">
            {(summary.event.rules.length ? summary.event.rules : emptySummary.event.rules).map((rule) => (
              <div key={rule} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-200">
                {tt(rule)}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-extrabold text-white">
            <Ticket className="h-5 w-5 text-cyan-200" />
            {tt("Spin history")}
          </div>
          <div className="space-y-3">
            {summary.awards.length ? (
              summary.awards.map((award) => (
                <article key={award.id} className="neon-panel rounded-[22px] px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{tt(award.note)}</div>
                      <div className="mt-1 text-[12px] text-white/35">{new Date(award.createdAt).toLocaleString("en-GB")}</div>
                    </div>
                    <div className="text-right text-sm font-extrabold text-cyan-200">
                      +{award.spinCount}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                {loading ? tt("Loading Lucky Draw...") : tt("No Lucky Draw spins yet.")}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
