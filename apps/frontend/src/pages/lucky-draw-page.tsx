import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Gift, RotateCw, Ticket, Trophy } from "lucide-react";
import type { LuckyDrawPrize, LuckyDrawSummary, LuckyDrawSpinResult } from "@nevo/shared-types";
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
    showPrizeChancesToUsers: false,
    rules: [],
    prizes: []
  },
  totalSpins: 0,
  availableSpins: 0,
  usedSpins: 0,
  awards: [],
  results: []
};

const spinDurationMs = 4600;
const wheelColors = ["#102a4c", "#17365f", "#1d4775", "#245889", "#2b6a96", "#334f70", "#263b58", "#1b314d"];

const defaultPrizes: LuckyDrawPrize[] = [
  {
    id: "bonus-draw-ticket",
    label: "Bonus draw ticket recorded",
    chance: 35,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "vip-reward-entry",
    label: "VIP reward pool entry",
    chance: 30,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "campaign-review-entry",
    label: "Campaign prize review entry",
    chance: 20,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "five-usdt-bonus",
    label: "5 USDT bonus",
    chance: 10,
    rewardAmount: 5,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "twenty-usdt-bonus",
    label: "20 USDT bonus",
    chance: 5,
    rewardAmount: 20,
    rewardAsset: "USDT_TRC20"
  }
];

type WheelSegment = LuckyDrawPrize & {
  actualChance: number;
  centerDeg: number;
  color: string;
  endDeg: number;
  startDeg: number;
};

const buildWheelSegments = (prizes: LuckyDrawPrize[]): WheelSegment[] => {
  const positivePrizes = (prizes.length ? prizes : defaultPrizes).filter((prize) => prize.chance > 0);
  const safePrizes = positivePrizes.length ? positivePrizes : defaultPrizes;
  const totalChance = safePrizes.reduce((sum, prize) => sum + prize.chance, 0) || 1;
  let cursor = 0;

  return safePrizes.map((prize, index) => {
    const sweep = (prize.chance / totalChance) * 360;
    const startDeg = cursor;
    const endDeg = index === safePrizes.length - 1 ? 360 : cursor + sweep;
    cursor = endDeg;

    return {
      ...prize,
      actualChance: (prize.chance / totalChance) * 100,
      centerDeg: startDeg + (endDeg - startDeg) / 2,
      color: wheelColors[index % wheelColors.length],
      endDeg,
      startDeg
    };
  });
};

const formatReward = (prize: { rewardAmount?: number; rewardAsset?: LuckyDrawPrize["rewardAsset"] }) => {
  if (!prize.rewardAmount || prize.rewardAmount <= 0 || !prize.rewardAsset) {
    return "";
  }

  return `${prize.rewardAmount.toFixed(2)} ${prize.rewardAsset.startsWith("USDT") ? "USDT" : prize.rewardAsset}`;
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

const getRewardStatusLabel = (result: LuckyDrawSpinResult) => {
  if (!result.rewardAmount || result.rewardAmount <= 0) {
    return "";
  }

  if (result.rewardStatus === "pending_review") {
    return "Pending admin review";
  }

  if (result.rewardStatus === "rejected") {
    return "Prize rejected";
  }

  return "Prize credited";
};

export function LuckyDrawPage() {
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const [summary, setSummary] = useState<LuckyDrawSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<LuckyDrawSpinResult | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const spinTimeoutRef = useRef<number | null>(null);

  const eventRange = useMemo(
    () => `${formatEventDate(summary.event.startsAt)} - ${formatEventDate(summary.event.endsAt)}`,
    [summary.event.endsAt, summary.event.startsAt]
  );

  const wheelSegments = useMemo(
    () => buildWheelSegments(summary.event.prizes?.length ? summary.event.prizes : defaultPrizes),
    [summary.event.prizes]
  );

  const wheelGradient = useMemo(
    () =>
      `conic-gradient(${wheelSegments
        .map((segment) => `${segment.color} ${segment.startDeg.toFixed(2)}deg ${segment.endDeg.toFixed(2)}deg`)
        .join(", ")})`,
    [wheelSegments]
  );

  const loadSummary = async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await walletApi.get<LuckyDrawSummary>("/wallet/lucky-draw");
      setSummary({
        ...response.data,
        event: {
          ...emptySummary.event,
          ...response.data.event
        }
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not load Lucky Draw.")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        window.clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  const useSpin = async () => {
    if (summary.availableSpins <= 0) {
      toast.error(tt("No Lucky Draw spins available."));
      return;
    }

    if (spinTimeoutRef.current) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    setSpinning(true);
    setLastResult(null);

    try {
      const response = await walletApi.post<LuckyDrawSpinResult & { availableSpins: number }>("/wallet/lucky-draw/spin");
      const byIndex =
        typeof response.data.prizeIndex === "number" && response.data.prizeIndex >= 0
          ? response.data.prizeIndex
          : -1;
      const byPrizeId = response.data.prizeId
        ? wheelSegments.findIndex((segment) => segment.id === response.data.prizeId)
        : -1;
      const byLabel = wheelSegments.findIndex((segment) => segment.label === response.data.resultLabel);
      const selectedSegment = wheelSegments[byIndex] ?? wheelSegments[byPrizeId] ?? wheelSegments[byLabel] ?? wheelSegments[0];
      const segmentSpan = Math.max(selectedSegment.endDeg - selectedSegment.startDeg, 1);
      const landingDeg = selectedSegment.startDeg + segmentSpan * (0.35 + Math.random() * 0.3);
      const currentRotation = ((wheelRotation % 360) + 360) % 360;
      const desiredRotation = (360 - landingDeg) % 360;
      const delta = (desiredRotation - currentRotation + 360) % 360;
      const targetRotation = wheelRotation + 360 * 6 + delta;

      setWheelRotation(targetRotation);
      spinTimeoutRef.current = window.setTimeout(() => {
        setLastResult(response.data);
        setSummary((current) => ({
          ...current,
          availableSpins: response.data.availableSpins,
          usedSpins: current.usedSpins + 1,
          results: [response.data, ...current.results].slice(0, 20)
        }));
        setSpinning(false);
        toast.success(tt("Lucky Draw spin recorded."));
      }, spinDurationMs);
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not use Lucky Draw spin.")));
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
          <div className="relative h-72 w-72 sm:h-80 sm:w-80">
            <div
              className="absolute left-1/2 top-1 z-30 h-8 w-5 -translate-x-1/2 -translate-y-2 bg-cyan-100 shadow-[0_10px_26px_rgba(0,0,0,0.38)]"
              style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
            />
            <div
              className="absolute inset-0 overflow-hidden rounded-full border-[9px] border-cyan-100/10 bg-[#091442] shadow-[0_24px_70px_rgba(0,0,0,0.46),0_0_42px_rgba(34,211,238,0.16)]"
              style={{
                background: wheelGradient,
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning ? `transform ${spinDurationMs}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : "none"
              }}
            >
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(5,8,73,0)_0_51%,rgba(255,255,255,0.10)_52%,rgba(255,255,255,0)_53%),radial-gradient(circle_at_35%_22%,rgba(255,255,255,0.20),rgba(255,255,255,0)_36%)]" />
              <div className="absolute inset-[1.05rem] rounded-full border border-white/10" />
              <div className="absolute inset-[3.55rem] rounded-full border border-cyan-100/10" />
              {wheelSegments.map((segment, index) => (
                <div
                  key={segment.id}
                  className="absolute left-1/2 top-1/2 origin-center"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${segment.centerDeg}deg) translateY(-6.1rem)`
                  }}
                >
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-[#061238]/55 text-[11px] font-bold text-cyan-50/80 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:h-9 sm:w-9 sm:text-xs"
                    style={{
                      transform: segment.centerDeg > 90 && segment.centerDeg < 270 ? "rotate(180deg)" : "none"
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="absolute left-1/2 top-1/2 z-20 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-100/20 bg-[#07133f] text-center text-sm font-extrabold uppercase tracking-[0.16em] text-cyan-50 shadow-[0_18px_40px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.10)] transition hover:border-cyan-200/50 disabled:opacity-60"
              disabled={loading || spinning || !summary.event.isActive || summary.availableSpins <= 0}
              onClick={() => void useSpin()}
              type="button"
            >
              {spinning ? <RotateCw className="h-8 w-8 animate-spin" /> : tt("Spin")}
            </button>
          </div>
          {lastResult ? (
            <div className={`mt-5 w-full rounded-[22px] border px-4 py-4 text-center text-sm font-semibold ${
              lastResult.rewardStatus === "pending_review"
                ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            }`}>
              <div className="text-[11px] uppercase tracking-[0.18em] opacity-70">{tt("Prize result")}</div>
              <div className="mt-1 text-lg font-extrabold text-white">{tt(lastResult.resultLabel)}</div>
              {formatReward(lastResult) ? (
                <div className="mt-2 text-sm text-emerald-100">{formatReward(lastResult)}</div>
              ) : null}
              {getRewardStatusLabel(lastResult) ? (
                <div className="mt-2 text-xs font-bold uppercase tracking-[0.14em] opacity-80">{tt(getRewardStatusLabel(lastResult))}</div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="neon-soft-panel mt-6 rounded-[26px] p-4">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-extrabold text-white">
            <Trophy className="h-5 w-5 text-cyan-200" />
            {tt("Prize pool")}
          </div>
          <div className="grid gap-3">
            {wheelSegments.map((segment, index) => (
              <div key={segment.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{tt(segment.label)}</div>
                  {formatReward(segment) ? (
                    <div className="mt-1 text-[12px] text-emerald-100">{formatReward(segment)}</div>
                  ) : null}
                </div>
                <div className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-extrabold text-cyan-100">
                  {summary.event.showPrizeChancesToUsers ? `${segment.actualChance.toFixed(2)}%` : `#${String(index + 1).padStart(2, "0")}`}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-[1rem] font-extrabold text-white">
            <Ticket className="h-5 w-5 text-cyan-200" />
            {tt("Recent results")}
          </div>
          <div className="space-y-3">
            {summary.results.length ? (
              summary.results.map((result) => (
                <article key={result.id} className="neon-panel rounded-[22px] px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{tt(result.resultLabel)}</div>
                      {formatReward(result) ? (
                        <div className="mt-1 text-[12px] font-semibold text-emerald-100">{formatReward(result)}</div>
                      ) : null}
                      {getRewardStatusLabel(result) ? (
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-100/85">
                          {tt(getRewardStatusLabel(result))}
                        </div>
                      ) : null}
                      <div className="mt-1 text-[12px] text-white/35">{new Date(result.createdAt).toLocaleString("en-GB")}</div>
                    </div>
                    <div className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-extrabold text-cyan-100">
                      {tt("Prize")}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                {loading ? tt("Loading Lucky Draw...") : tt("No spin results yet.")}
              </div>
            )}
          </div>
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
                      {award.expiresAt || award.revokedAt ? (
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-100/80">
                          {award.revokedAt
                            ? tt("Revoked")
                            : `${tt("Expires")} ${new Date(award.expiresAt!).toLocaleDateString("en-GB")}`}
                        </div>
                      ) : null}
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
