import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Gift, RotateCw, Ticket, Trophy } from "lucide-react";
import type { LuckyDrawPrize, LuckyDrawSummary, LuckyDrawSpinResult } from "@nevo/shared-types";
import { walletApi, getApiErrorMessage } from "@/api/client";
import { getAccessToken } from "@/lib/auth";
import { translateText, useAppLanguage } from "@/lib/i18n";

const emptySummary: LuckyDrawSummary = {
  event: {
    enabled: false,
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
const wheelColors = ["#22d3ee", "#8b5cf6", "#c084fc", "#38bdf8", "#14b8a6", "#6366f1", "#a855f7", "#0ea5e9"];
const rimDotCount = 28;

const confettiPieces = [
  { background: "#7df9ff", height: "0.7rem", left: "6%", top: "33%", transform: "rotate(28deg)", width: "0.34rem" },
  { background: "#ffe45c", height: "0.52rem", left: "12%", top: "52%", transform: "rotate(-24deg)", width: "0.52rem" },
  { background: "#ff75d8", height: "0.58rem", left: "18%", top: "22%", transform: "rotate(38deg)", width: "0.36rem" },
  { background: "#9aff92", height: "0.62rem", right: "8%", top: "49%", transform: "rotate(34deg)", width: "0.42rem" },
  { background: "#ffa94d", height: "0.56rem", right: "15%", top: "27%", transform: "rotate(-34deg)", width: "0.46rem" },
  { background: "#ffffff", height: "0.5rem", right: "24%", top: "15%", transform: "rotate(28deg)", width: "0.36rem" },
  { background: "#7df9ff", bottom: "18%", height: "0.46rem", left: "19%", transform: "rotate(-18deg)", width: "0.46rem" },
  { background: "#ffe45c", bottom: "24%", height: "0.46rem", right: "17%", transform: "rotate(24deg)", width: "0.46rem" }
] as const;

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
  const visualSweep = 360 / safePrizes.length;

  return safePrizes.map((prize, index) => {
    const startDeg = index * visualSweep;
    const endDeg = index === safePrizes.length - 1 ? 360 : startDeg + visualSweep;

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

const formatCompactAmount = (value: number) =>
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");

const getWheelSegmentLabel = (prize: LuckyDrawPrize) => {
  if (prize.rewardAmount && prize.rewardAmount > 0) {
    return `${formatCompactAmount(prize.rewardAmount)} USDT`;
  }

  const normalizedLabel = prize.label.toLowerCase();
  if (normalizedLabel.includes("bonus") && normalizedLabel.includes("ticket")) {
    return "Bonus spin";
  }

  if (normalizedLabel.includes("vip")) {
    return "VIP entry";
  }

  if (normalizedLabel.includes("review") || normalizedLabel.includes("campaign")) {
    return "Prize review";
  }

  if (normalizedLabel.includes("thank")) {
    return "Thank you!";
  }

  const trimmed = prize.label.trim();
  return trimmed.length > 18 ? `${trimmed.slice(0, 16).trim()}...` : trimmed;
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const spinTimeoutRef = useRef<number | null>(null);

  const luckyDrawEnabled = summary.event.enabled !== false;
  const luckyDrawAvailable = luckyDrawEnabled && summary.event.isActive;

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
      setLoadFailed(false);
      setSummary({
        ...response.data,
        event: {
          ...emptySummary.event,
          ...response.data.event
        }
      });
    } catch (error) {
      setLoadFailed(true);
      const message = getApiErrorMessage(error, tt("Could not load Lucky Draw."));
      toast.error(message === "Internal server error" ? tt("Lucky Draw is unavailable right now.") : message);
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

  if (!loading && (!luckyDrawAvailable || loadFailed)) {
    return (
      <div className="lucky-draw-page pb-6">
        <div className="lucky-draw-content">
          <section className="neon-panel mt-6 rounded-[26px] p-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
              <Gift className="h-8 w-8" />
            </div>
            <div className="mt-4 text-[1.25rem] font-extrabold text-white">
              {tt(loadFailed ? "Lucky Draw is unavailable right now." : "Lucky Draw is closed.")}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-300">
              {tt(loadFailed ? "Please try again later." : "This event is currently unavailable.")}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="lucky-draw-page pb-6">
      <div className="lucky-draw-content">
        <div className="lucky-draw-top-actions">
          <a className="lucky-draw-nav-chip" href="#winning-records">
            {tt("My Winning Records")}
          </a>
          <a className="lucky-draw-nav-chip" href="#task-center">
            {tt("Task Center")}
          </a>
        </div>

        <section className="lucky-draw-hero" aria-label={tt("Lucky Draw")}>
          {confettiPieces.map((piece, index) => (
            <span key={index} className="lucky-draw-confetti" style={piece} />
          ))}
          <div className="lucky-draw-medal">
            <span>D</span>
          </div>
          <div className="lucky-draw-spotlight lucky-draw-spotlight-left" />
          <div className="lucky-draw-spotlight lucky-draw-spotlight-right" />

          <div className="lucky-draw-wheel-wrap">
            <div className="lucky-draw-pointer" />
            <div className="lucky-draw-side-arrow" />
            <div className="lucky-draw-ribbon lucky-draw-ribbon-left" />
            <div className="lucky-draw-ribbon lucky-draw-ribbon-right" />
            <div
              className="lucky-draw-wheel"
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning ? `transform ${spinDurationMs}ms cubic-bezier(0.12, 0.72, 0.12, 1)` : "none"
              }}
            >
              <div className="lucky-draw-segment-disc" style={{ background: wheelGradient }} />
              <div className="lucky-draw-segment-gloss" />
              <div className="lucky-draw-rim" />
              {Array.from({ length: rimDotCount }, (_, index) => (
                <span
                  key={`dot-${index}`}
                  className="lucky-draw-rim-dot"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${(360 / rimDotCount) * index}deg) translateY(calc(var(--wheel-size) * -0.425))`
                  }}
                />
              ))}
              {wheelSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="lucky-draw-slice-label-wrap"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${segment.centerDeg}deg) translateY(calc(var(--wheel-size) * -0.255))`
                  }}
                >
                  <span
                    className="lucky-draw-slice-label"
                    style={{
                      transform: segment.centerDeg > 90 && segment.centerDeg < 270 ? "rotate(270deg)" : "rotate(90deg)"
                    }}
                  >
                    {tt(getWheelSegmentLabel(segment))}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="lucky-draw-button"
              disabled={loading || spinning || !luckyDrawAvailable || summary.availableSpins <= 0}
              onClick={() => void useSpin()}
              type="button"
            >
              {spinning ? <RotateCw className="h-9 w-9 animate-spin" /> : <span>{tt("Draw now")}</span>}
            </button>
          </div>
          <div className="lucky-draw-spin-count">{tt("You still have")} {summary.availableSpins} {tt("spins")}!</div>
        </section>

        <section className="neon-panel mt-5 overflow-hidden rounded-[22px] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">{tt("Lucky Draw Event")}</div>
              <h1 className="mt-1 truncate text-xl font-extrabold leading-tight text-white">{tt(summary.event.title)}</h1>
              <div className="mt-2 text-[12px] leading-5 text-slate-300">{eventRange}</div>
            </div>
            <div className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${
              summary.event.isActive
                ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                : "border-amber-300/30 bg-amber-300/10 text-amber-100"
            }`}>
              {summary.event.isActive ? tt("Active") : tt("Inactive")}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-cyan-300/15 bg-white/[0.04] px-3 py-3 text-center">
              <div className="text-2xl font-extrabold text-cyan-200">{summary.availableSpins}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">{tt("Available")}</div>
            </div>
            <div className="rounded-xl border border-cyan-300/15 bg-white/[0.04] px-3 py-3 text-center">
              <div className="text-2xl font-extrabold text-white">{summary.totalSpins}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">{tt("Total spins")}</div>
            </div>
            <div className="rounded-xl border border-cyan-300/15 bg-white/[0.04] px-3 py-3 text-center">
              <div className="text-2xl font-extrabold text-white">{summary.usedSpins}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">{tt("Used")}</div>
            </div>
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

        <section id="winning-records" className="mt-6 scroll-mt-6">
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

        <section id="task-center" className="neon-soft-panel mt-6 scroll-mt-6 rounded-[26px] p-4">
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
