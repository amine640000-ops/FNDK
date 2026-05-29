import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Bell,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Globe,
  HandCoins,
  Headset,
  Landmark,
  LogOut,
  Sparkles,
  Users,
  Wallet,
  X
} from "lucide-react";
import type { AiTradingActivation, AssetType, MissionTaskCategory, MissionTaskProgress, VipTier, WalletSummary } from "@nevo/shared-types";
import { formatCurrency, resolveTierByDeposit } from "@nevo/shared-utils";
import { useLocation, useNavigate } from "react-router-dom";
import { getApiErrorMessage, isApiAuthError, taskApi, walletApi } from "@/api/client";
import { BrandMark } from "@/components/brand-mark";
import { clearAuthSession, getAccessToken } from "@/lib/auth";
import { applyLanguagePreference, getNextLanguage, translateText, useAppLanguage } from "@/lib/i18n";
import { useDashboardStore } from "@/store/use-dashboard-store";

type ActivationState = {
  currentTier: VipTier;
  activeInvestment: number;
  runningActivation: AiTradingActivation | null;
  remainingActivationsToday: number;
  usedActivationsToday: number;
  reservationWindowStartsAt?: string;
  reservationWindowEndsAt?: string;
  history: AiTradingActivation[];
};

type StartActivationResponse = {
  outcome: "running" | "failed";
  message: string;
  activation: AiTradingActivation;
  expectedIncomeMin: number;
  expectedIncomeMax: number;
  remainingActivationsToday: number;
};

type MissionCenterState = {
  totalRewardAmount: number;
  tasks: MissionTaskProgress[];
};

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});

const assetLogoUrls: Partial<Record<AssetType, string>> = {
  BTC: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png",
  ETH: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png",
  USDT_TRC20: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/usdt.png",
  USDT_ERC20: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/usdt.png"
};

const assetBadgeTone: Partial<Record<AssetType, string>> = {
  BTC: "from-amber-200 to-orange-500 text-slate-900",
  ETH: "from-slate-100 to-violet-300 text-slate-900",
  USDT_TRC20: "from-emerald-200 to-emerald-500 text-slate-900",
  USDT_ERC20: "from-emerald-200 to-emerald-500 text-slate-900",
  USD: "from-cyan-200 to-blue-500 text-slate-900",
  EUR: "from-sky-200 to-indigo-500 text-slate-900",
  GBP: "from-fuchsia-200 to-violet-500 text-slate-900",
  STOCKS: "from-slate-200 to-slate-500 text-slate-950"
};

const missionTabs = [
  { id: "tasks", label: "Missions" },
  { id: "strategy", label: "Strategie" },
  { id: "today", label: "Aujourd'hui" },
  { id: "invoices", label: "Facture" },
  { id: "history", label: "Historique" }
] as const;

const missionCategoryTabs: Array<{ id: MissionTaskCategory; label: string }> = [
  { id: "limited", label: "Limited Time Tasks" },
  { id: "daily", label: "Daily Tasks" },
  { id: "long-term", label: "Long-Term Tasks" }
];

const formatMoneyValue = (value: number) => formatCurrency(value).replace("$", "");
const reservationContactMessage = "Impossible De Participer, Veuillez Contacter Votre Gestionnaire De Compte";

const formatUsdtRange = (min: number, max: number) => `${min.toFixed(4)} ~ ${max.toFixed(4)} USDT`;

const formatCountdown = (seconds: number) => {
  const safe = Math.max(seconds, 0);
  const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const remainingSeconds = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}:${remainingSeconds}`;
};

const getNextLocalFiveAm = (timestamp: number) => {
  const resetAt = new Date(timestamp);
  resetAt.setHours(5, 0, 0, 0);

  if (timestamp >= resetAt.getTime()) {
    resetAt.setDate(resetAt.getDate() + 1);
  }

  return resetAt.getTime();
};

const formatDepositBand = (tier: VipTier, nextTier?: VipTier) => {
  const min = compactNumber.format(tier.minDeposit);
  if (!nextTier) {
    return `${min}+ USDT`;
  }

  return `${min} - ${compactNumber.format(nextTier.minDeposit)} USDT`;
};

const formatRoiBand = (tier: VipTier) => {
  const lower = (tier.dailyRoiMin * 100).toFixed(1);
  const upper = (tier.dailyRoiMax * 100).toFixed(1);
  return `${lower}% ~ ${upper}%`;
};

const formatReservationOrderNumber = (activation: AiTradingActivation) => `QR-${activation.id.replace(/-/g, "").slice(0, 18).toUpperCase()}`;

const formatReservationPair = (asset: AssetType) =>
  asset === "BTC" || asset === "ETH" ? `${asset}/USDT` : `${asset}/USD`;

const formatReservationStatus = (activation: AiTradingActivation) => {
  if (activation.status === "completed") {
    return "Termine";
  }

  if (activation.status === "failed") {
    return "Echoue";
  }

  if (activation.status === "running") {
    return "En cours";
  }

  return "Expire";
};

function AssetBadge({ asset, className = "" }: { asset: AssetType; className?: string }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = assetLogoUrls[asset];

  if (logoUrl && !failed) {
    return (
      <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ${className}`}>
        <img
          alt={`${asset} logo`}
          className="h-9 w-9 rounded-full object-cover"
          onError={() => setFailed(true)}
          src={logoUrl}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold ${assetBadgeTone[asset] ?? "from-cyan-200 to-blue-500 text-slate-900"} ${className}`}
    >
      {asset === "USDT_TRC20" || asset === "USDT_ERC20" ? "U" : asset.slice(0, 1)}
    </div>
  );
}

export function VipPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const vipTiers = useDashboardStore((state) => state.vipTiers);
  const wallet = useDashboardStore((state) => state.wallet);
  const overview = useDashboardStore((state) => state.overview);
  const depositRecords = useDashboardStore((state) => state.depositRecords);
  const fallbackTierInvestment = Math.max(wallet.activeInvestment, wallet.totalBalance, overview.totalBalance, 0);
  const staticCurrentTier = resolveTierByDeposit(fallbackTierInvestment);
  const [activationState, setActivationState] = useState<ActivationState | null>(null);
  const [loadingActivation, setLoadingActivation] = useState(false);
  const [now, setNow] = useState(Date.now());
  const language = useAppLanguage();
  const [activeTab, setActiveTab] = useState<(typeof missionTabs)[number]["id"]>(() =>
    location.pathname.endsWith("/mission") ? "tasks" : "strategy"
  );
  const [missionCategory, setMissionCategory] = useState<MissionTaskCategory>("limited");
  const [missionCenter, setMissionCenter] = useState<MissionCenterState>({ totalRewardAmount: 0, tasks: [] });
  const [loadingMissionCenter, setLoadingMissionCenter] = useState(false);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [reservationAmount, setReservationAmount] = useState("");
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [failedReservation, setFailedReservation] = useState<StartActivationResponse | null>(null);
  const [vipListOpen, setVipListOpen] = useState(false);
  const completionRefreshInFlight = useRef<string | null>(null);
  const reservationResetRefreshInFlight = useRef(false);
  const activationStartInFlight = useRef(false);

  const fallbackActivationState = useMemo<ActivationState>(
    () => ({
      currentTier: staticCurrentTier,
      activeInvestment: wallet.activeInvestment,
      runningActivation: null,
      remainingActivationsToday: staticCurrentTier.activationLimitPerDay,
      usedActivationsToday: 0,
      history: []
    }),
    [staticCurrentTier, wallet.activeInvestment]
  );

  const buildFallbackState = (activeInvestment: number): ActivationState => {
    const tier = resolveTierByDeposit(activeInvestment);
    return {
      currentTier: tier,
      activeInvestment,
      runningActivation: null,
      remainingActivationsToday: tier.activationLimitPerDay,
      usedActivationsToday: 0,
      history: []
    };
  };

  useEffect(() => {
    setActiveTab(location.pathname.endsWith("/mission") ? "tasks" : "strategy");
  }, [location.pathname]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setActivationState(fallbackActivationState);
      return;
    }

    let active = true;

    const loadState = async () => {
      try {
        const response = await taskApi.get<ActivationState>("/tasks/activations/me");

        if (active) {
          setActivationState(response.data);
        }
      } catch (error) {
        if (isApiAuthError(error)) {
          clearAuthSession();
          if (active) {
            toast.error("Your session expired. Sign in again.");
            navigate("/login", { replace: true });
          }
          return;
        }

        try {
          const walletResponse = await walletApi.get<WalletSummary>("/wallet/summary");

          if (active) {
            const derivedInvestment = Math.max(
              walletResponse.data.activeInvestment,
              walletResponse.data.totalBalance,
              0
            );
            setActivationState(buildFallbackState(derivedInvestment));
          }
        } catch {
          if (active) {
            setActivationState(fallbackActivationState);
          }
        }
      }
    };

    void loadState();
    const interval = window.setInterval(() => void loadState(), 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [fallbackActivationState, navigate]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;
    setLoadingMissionCenter(true);

    taskApi
      .get<MissionCenterState>("/tasks/missions/me")
      .then((response) => {
        if (active) {
          setMissionCenter(response.data);
        }
      })
      .catch(() => {
        if (active) {
          setMissionCenter({ totalRewardAmount: 0, tasks: [] });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingMissionCenter(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const liveState = activationState ?? fallbackActivationState;
  const currentTier = liveState.currentTier;
  const runningActivation = liveState.runningActivation;
  const nextTier = vipTiers.find((tier) => tier.id === currentTier.id + 1);
  const countdownSeconds = runningActivation
    ? Math.max(Math.ceil((new Date(runningActivation.endsAt).getTime() - now) / 1000), 0)
    : 0;
  const liveRunningActivation = runningActivation && countdownSeconds > 0 ? runningActivation : null;
  const reservationResetAt = liveState.reservationWindowEndsAt
    ? new Date(liveState.reservationWindowEndsAt).getTime()
    : getNextLocalFiveAm(now);
  const reservationResetCountdownSeconds = Math.max(
    Math.ceil(((Number.isFinite(reservationResetAt) ? reservationResetAt : getNextLocalFiveAm(now)) - now) / 1000),
    0
  );
  const hasMinimumDeposit = liveState.activeInvestment >= currentTier.minDeposit;
  const reservationLimitReached =
    hasMinimumDeposit && !liveRunningActivation && liveState.remainingActivationsToday <= 0;
  const canStartActivation =
    !loadingActivation && !liveRunningActivation && liveState.remainingActivationsToday > 0 && hasMinimumDeposit;
  const reservationStripCountdown = liveRunningActivation
    ? formatCountdown(countdownSeconds)
    : reservationLimitReached || !hasMinimumDeposit
      ? formatCountdown(reservationResetCountdownSeconds)
      : "00:00:00";

  useEffect(() => {
    if (!runningActivation || countdownSeconds > 0 || completionRefreshInFlight.current === runningActivation.id) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;
    completionRefreshInFlight.current = runningActivation.id;

    taskApi
      .get<ActivationState>("/tasks/activations/me")
      .then((response) => {
        if (active) {
          setActivationState(response.data);
        }
      })
      .catch(() => {
        // The regular polling loop will retry state refresh if this request fails.
      })
      .finally(() => {
        if (active) {
          completionRefreshInFlight.current = null;
        }
      });

    return () => {
      active = false;
    };
  }, [countdownSeconds, runningActivation]);

  useEffect(() => {
    if (!reservationLimitReached || reservationResetCountdownSeconds > 0 || reservationResetRefreshInFlight.current) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;
    reservationResetRefreshInFlight.current = true;

    taskApi
      .get<ActivationState>("/tasks/activations/me")
      .then((response) => {
        if (active) {
          setActivationState(response.data);
        }
      })
      .catch(() => {
        // The regular polling loop will retry state refresh if this request fails.
      })
      .finally(() => {
        reservationResetRefreshInFlight.current = false;
      });

    return () => {
      active = false;
    };
  }, [reservationLimitReached, reservationResetCountdownSeconds]);

  const completedHistory = useMemo(
    () => liveState.history.filter((activation) => activation.status === "completed"),
    [liveState.history]
  );

  const todayProfit = useMemo(() => {
    const fallbackStart = new Date();
    fallbackStart.setHours(5, 0, 0, 0);
    if (Date.now() < fallbackStart.getTime()) {
      fallbackStart.setDate(fallbackStart.getDate() - 1);
    }

    const windowStart = liveState.reservationWindowStartsAt
      ? new Date(liveState.reservationWindowStartsAt).getTime()
      : fallbackStart.getTime();
    const windowEnd = liveState.reservationWindowEndsAt
      ? new Date(liveState.reservationWindowEndsAt).getTime()
      : windowStart + 24 * 60 * 60 * 1000;

    return completedHistory
      .filter((activation) => {
        if (!activation.completedAt) {
          return false;
        }

        const completedAt = new Date(activation.completedAt).getTime();
        return completedAt >= windowStart && completedAt < windowEnd;
      })
      .reduce((sum, activation) => sum + (activation.profit ?? 0), 0);
  }, [completedHistory, liveState.reservationWindowEndsAt, liveState.reservationWindowStartsAt]);

  const totalActivationProfit = useMemo(
    () => completedHistory.reduce((sum, activation) => sum + (activation.profit ?? 0), 0),
    [completedHistory]
  );

  const todayReservation = useMemo(() => {
    const today = new Date().toDateString();
    return (
      liveRunningActivation ??
      liveState.history.find((activation) => {
        const referenceTime = activation.completedAt ?? activation.startedAt;
        return new Date(referenceTime).toDateString() === today;
      }) ??
      null
    );
  }, [liveState.history, liveRunningActivation]);

  const strategyAssets = liveRunningActivation
    ? [liveRunningActivation.asset, ...currentTier.activationAssets.filter((asset) => asset !== liveRunningActivation.asset)]
    : currentTier.activationAssets;
  const parsedReservationAmount = Number(reservationAmount || 0);
  const sortedVipTiers = useMemo(() => [...vipTiers].sort((left, right) => left.id - right.id), [vipTiers]);
  const unlockReferenceAmount = Math.max(liveState.activeInvestment, 0);
  const visibleMissionTasks = useMemo(
    () => missionCenter.tasks.filter((task) => task.enabled && task.category === missionCategory),
    [missionCategory, missionCenter.tasks]
  );
  const tt = (text: string) => translateText(language, text);

  useEffect(() => {
    if (!reservationModalOpen) {
      setReservationAmount(liveState.activeInvestment ? liveState.activeInvestment.toFixed(2) : "");
    }
  }, [liveState.activeInvestment, reservationModalOpen]);

  const metricCards = [
    {
      key: "tier",
      label: tt("Mon Niveau"),
      value: `VIP ${currentTier.id}`,
      detail: currentTier.name,
      icon: Sparkles
    },
    {
      key: "today",
      label: tt("Revenus D'aujourd'hui"),
      value: formatMoneyValue(todayProfit),
      detail: "USDT",
      icon: CircleDollarSign
    },
    {
      key: "balance",
      label: tt("Solde Du Compte"),
      value: formatMoneyValue(overview.totalBalance),
      detail: "USD balance",
      icon: Wallet
    },
    {
      key: "profit",
      label: tt("Revenus Totaux"),
      value: formatMoneyValue(wallet.totalEarned || totalActivationProfit),
      detail: "All runs",
      icon: HandCoins
    },
    {
      key: "strategy",
      label: tt("Fonds De Strategie Disponibles"),
      value: formatMoneyValue(liveState.activeInvestment),
      detail: reservationLimitReached
        ? `Resets in ${formatCountdown(reservationResetCountdownSeconds)}`
        : `${liveState.remainingActivationsToday} slots left`,
      icon: Landmark
    },
    {
      key: "team",
      label: tt("Revenus D'equipe"),
      value: formatMoneyValue(0),
      detail: "Referral stream",
      icon: Users
    }
  ] as const;

  const handleNotifications = () => {
    if (completedHistory.length) {
      toast.success(`${completedHistory.length} completed run${completedHistory.length === 1 ? "" : "s"} in your record.`);
      return;
    }

    toast("No mission alerts yet.");
  };

  const handleLanguage = () => {
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

  const handleSupport = () => {
    window.location.href = "mailto:support@fndk.capital?subject=Mission%20Support";
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login");
  };

  const openReservationModal = () => {
    if (!hasMinimumDeposit) {
      toast.error("Activate a VIP tier with an approved deposit before starting AI trading.");
      return;
    }

    setReservationAmount(liveState.activeInvestment.toFixed(2));
    setSecurityPasscode("");
    setReservationError("");
    setPasscodeVisible(false);
    setReservationModalOpen(true);
  };

  const closeReservationModal = () => {
    setReservationModalOpen(false);
    setSecurityPasscode("");
    setReservationError("");
    setPasscodeVisible(false);
  };

  const showReservationError = (message = tt(reservationContactMessage)) => {
    setReservationError(message);
    window.setTimeout(() => {
      setReservationError((currentMessage) => (currentMessage === message ? "" : currentMessage));
    }, 3600);
  };

  const startActivation = async () => {
    if (activationStartInFlight.current) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      showReservationError(tt("Veuillez Vous Connecter Avant De Confirmer"));
      return;
    }

    if (!hasMinimumDeposit) {
      showReservationError(tt(reservationContactMessage));
      return;
    }

    if (!Number.isFinite(parsedReservationAmount) || parsedReservationAmount <= 0) {
      showReservationError(tt("Montant De Réservation Invalide"));
      return;
    }

    if (!/^\d{6}$/.test(securityPasscode)) {
      showReservationError(tt("Veuillez Saisir Votre Mot De Passe"));
      return;
    }

    activationStartInFlight.current = true;
    setLoadingActivation(true);
    setReservationError("");
    try {
      const response = await taskApi.post<StartActivationResponse>(
        "/tasks/activations/start",
        { reservationAmount: parsedReservationAmount, securityPasscode }
      );

      if (response.data.outcome === "failed") {
        showReservationError(response.data.message || tt(reservationContactMessage));
        return;
      } else {
        toast.success(response.data.message);
      }

      closeReservationModal();
      const latestState = await taskApi.get<ActivationState>("/tasks/activations/me");
      setActivationState(latestState.data);
    } catch (error) {
      showReservationError(getApiErrorMessage(error, tt(reservationContactMessage)));

      try {
        const latestState = await taskApi.get<ActivationState>("/tasks/activations/me");
        setActivationState(latestState.data);

        if (latestState.data.runningActivation) {
          closeReservationModal();
        }
      } catch {
        // The regular polling loop will retry state refresh if this request fails.
      }
    } finally {
      activationStartInFlight.current = false;
      setLoadingActivation(false);
    }
  };

  return (
    <div className="pb-6">
      <header className="relative z-10 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <BrandMark
            iconClassName="h-11 w-11 rounded-[18px] p-2"
            subtitle={tt("Strategy hub")}
            textClassName="text-[1.65rem] tracking-[0.02em] text-cyan-200"
            subtitleClassName="text-[10px] tracking-[0.34em]"
          />

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={handleNotifications}
              type="button"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Language"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={handleLanguage}
              type="button"
            >
              <Globe className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Support"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={handleSupport}
              type="button"
            >
              <Headset className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Sign out"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {reservationModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-4">
          <button
            aria-label="Close reservation confirmation"
            className="absolute inset-0"
            onClick={closeReservationModal}
            type="button"
          />
          <div className="relative w-full max-w-[448px] rounded-[18px] border border-[#1427b3]/80 bg-[#06078f] px-5 pb-5 pt-5 shadow-[0_28px_70px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(178,196,255,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[1.35rem] font-extrabold leading-tight text-white">{tt("Confirmation De Réservation")}</div>
              <button
                aria-label="Close reservation confirmation"
                className="flex h-9 w-9 shrink-0 items-center justify-center text-white transition hover:text-cyan-100"
                onClick={closeReservationModal}
                type="button"
              >
                <X className="h-7 w-7 stroke-[2.2]" />
              </button>
            </div>

            <div className="mt-7 text-[1.08rem] font-medium text-white">{tt("Montant De Réservation")}</div>
            <div className="mt-4 flex min-h-[3.9rem] items-center gap-3 rounded-[14px] border border-[#2c40d6] bg-[linear-gradient(180deg,#08099b_0%,#060880_100%)] px-4 shadow-[inset_0_0_0_1px_rgba(93,111,255,0.25),0_0_16px_rgba(44,64,214,0.55)]">
              <input
                className="min-w-0 flex-1 bg-transparent text-[1.2rem] font-extrabold text-white outline-none"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                value={reservationAmount}
                onChange={(event) => setReservationAmount(event.target.value)}
              />
              <button
                className="min-h-[3rem] rounded-[12px] bg-[#5960e8] px-7 text-[1.08rem] font-semibold text-white shadow-[0_12px_20px_rgba(42,49,180,0.36)]"
                onClick={() => setReservationAmount(liveState.activeInvestment.toFixed(2))}
                type="button"
              >
                {tt("Tout")}
              </button>
            </div>

            <label className="mt-7 block">
              <span className="text-[1.08rem] font-medium text-white">{tt("Mot De Passe")}</span>
              <div className="mt-4 flex min-h-[3.9rem] items-center gap-4 rounded-[14px] border border-[#2c40d6] bg-[linear-gradient(180deg,#08099b_0%,#060880_100%)] px-4 shadow-[inset_0_0_0_1px_rgba(93,111,255,0.25),0_0_16px_rgba(44,64,214,0.55)]">
                <input
                  className="min-w-0 flex-1 bg-transparent text-[1.2rem] font-extrabold tracking-[0.32em] text-white outline-none placeholder:text-white"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  type={passcodeVisible ? "text" : "password"}
                  value={securityPasscode}
                  onChange={(event) => setSecurityPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <button
                  aria-label={passcodeVisible ? "Hide passcode" : "Show passcode"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-white/70"
                  onClick={() => setPasscodeVisible((visible) => !visible)}
                  type="button"
                >
                  {passcodeVisible ? <EyeOff className="h-7 w-7" /> : <Eye className="h-7 w-7 fill-white/30" />}
                </button>
              </div>
            </label>

            {reservationError ? (
              <div className="absolute left-1/2 top-[45%] z-10 w-[82%] -translate-x-1/2 rounded-[10px] bg-[#2c2d35] px-5 py-4 text-center text-[1.02rem] font-medium leading-snug text-white shadow-[0_14px_32px_rgba(0,0,0,0.36)]">
                {reservationError}
              </div>
            ) : null}

            <button
              className="mt-8 min-h-[4.1rem] w-full rounded-[14px] bg-[linear-gradient(90deg,#20eaf3_0%,#12f0bc_100%)] px-4 text-[1.25rem] font-extrabold text-[#041859] shadow-[0_16px_30px_rgba(24,235,202,0.28)] disabled:opacity-60"
              disabled={loadingActivation}
              onClick={startActivation}
              type="button"
            >
              {loadingActivation ? tt("Confirmation...") : tt("Confirmer")}
            </button>
          </div>
        </div>
      ) : null}

      {failedReservation ? (
        <div className="fixed inset-0 z-40 bg-[#020223]/82 backdrop-blur-[2px]">
          <button
            aria-label="Close failed reservation"
            className="absolute inset-0"
            onClick={() => setFailedReservation(null)}
            type="button"
          />
          <div className="absolute inset-x-5 top-[23%] overflow-hidden rounded-[22px] border border-cyan-300/10 bg-[linear-gradient(180deg,#0608a8_0%,#05098c_54%,#050775_100%)] px-5 pb-5 pt-6 shadow-[0_30px_70px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(169,205,255,0.12)]">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[1.45rem] font-extrabold tracking-[-0.02em] text-white">Reservation Failed</div>
              <button
                aria-label="Close failed reservation"
                className="flex h-9 w-9 items-center justify-center rounded-full text-white/90 transition hover:bg-white/5"
                onClick={() => setFailedReservation(null)}
                type="button"
              >
                <X className="h-7 w-7" />
              </button>
            </div>

            <div className="relative mt-14 flex justify-center">
              <div className="absolute left-[34%] top-[-1.3rem] text-[2rem] font-extrabold text-[#ff9a24]">+</div>
              <div className="absolute left-[32%] top-[1.4rem] h-5 w-5 rounded-full border-[5px] border-[#ff9627]" />
              <div className="absolute left-[43%] top-[-0.35rem] h-3 w-3 rounded-full bg-[#ff8c2c]" />
              <div className="absolute bottom-0 h-5 w-36 rounded-full bg-[#151170]/55 blur-[2px]" />
              <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ffcf42_0%,#ff8a2e_48%,#ff4f61_100%)] text-[#040526] shadow-[0_22px_36px_rgba(255,114,36,0.26)]">
                <X className="h-16 w-16 stroke-[5]" />
              </div>
            </div>

            <div className="mt-12 rounded-[14px] border border-cyan-200/10 bg-[#03043c]/88 px-5 pb-5 pt-9 text-center shadow-[inset_0_1px_0_rgba(169,205,255,0.08),0_0_22px_rgba(35,64,255,0.28)]">
              <div className="flex justify-center">
                <div className="flex -space-x-4">
                  <AssetBadge asset={failedReservation.activation.asset} className="h-14 w-14 border-4 border-[#05075b]" />
                  <AssetBadge asset="USDT_TRC20" className="h-14 w-14 border-4 border-[#05075b]" />
                </div>
              </div>
              <div className="mt-5 text-[1.45rem] font-semibold text-white">{failedReservation.activation.asset}</div>
              <div className="mt-6 flex items-center justify-between gap-4 border-t border-cyan-100/10 pt-5 text-left text-[0.95rem]">
                <span className="text-white/55">Expected Income</span>
                <span className="text-right font-semibold text-[#636dff]">
                  {formatUsdtRange(failedReservation.expectedIncomeMin, failedReservation.expectedIncomeMax)}
                </span>
              </div>
            </div>

            <div className="mt-5 h-3 rounded-full bg-[linear-gradient(90deg,#63efff_0%,#75f7c9_100%)] shadow-[0_0_18px_rgba(103,232,255,0.58)]" />

            <button
              className="mt-7 w-full rounded-[12px] bg-[linear-gradient(90deg,#69f2ff_0%,#75f6c8_100%)] px-4 py-4 text-[1.1rem] font-semibold text-[#073133] shadow-[0_14px_24px_rgba(39,231,212,0.28)]"
              onClick={() => setFailedReservation(null)}
              type="button"
            >
              Come back tomorrow
            </button>
          </div>
        </div>
      ) : null}

      {vipListOpen ? (
        <div className="fixed inset-0 z-40 bg-[#020223]/75 backdrop-blur-sm">
          <button
            aria-label="Close VIP list"
            className="absolute inset-0"
            onClick={() => setVipListOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-4 bottom-6 max-h-[78vh] overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(14,19,142,0.98)_0%,rgba(9,11,110,0.99)_45%,rgba(6,8,82,1)_100%)] p-5 shadow-[0_28px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[1.35rem] font-extrabold text-white">VIP Conditions</div>
                <div className="mt-1 text-sm text-slate-300">Every tier unlocks automatically when the required active investment is reached.</div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
                onClick={() => setVipListOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="hide-scrollbar mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {sortedVipTiers.map((tier, index) => {
                const followingTier = sortedVipTiers[index + 1];
                const unlocked = unlockReferenceAmount >= tier.minDeposit;
                const isCurrentTier = currentTier.id === tier.id;
                const missingAmount = Math.max(tier.minDeposit - unlockReferenceAmount, 0);

                return (
                  <button
                    key={tier.id}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                      isCurrentTier
                        ? "border-cyan-300/35 bg-cyan-300/10"
                        : unlocked
                          ? "border-emerald-300/20 bg-white/5"
                          : "border-white/10 bg-[#04073d]/88 opacity-60"
                    }`}
                    disabled
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[1rem] font-bold text-white">VIP {tier.id}</span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                              isCurrentTier
                                ? "bg-cyan-300/15 text-cyan-100"
                                : unlocked
                                  ? "bg-emerald-300/12 text-emerald-100"
                                  : "bg-white/[0.08] text-white/60"
                            }`}
                          >
                            {isCurrentTier ? "Current" : unlocked ? "Unlocked" : "Locked"}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-slate-300">{tier.name}</div>
                      </div>

                      <div className="text-right">
                        <div className="text-[1rem] font-semibold text-white">{formatDepositBand(tier, followingTier)}</div>
                        <div className="mt-1 text-[12px] text-cyan-200/80">{formatRoiBand(tier)} daily</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-[13px] text-slate-300">
                      <div className="flex items-center justify-between gap-4">
                        <span>Minimum active investment</span>
                        <span className="font-semibold text-white">{formatCurrency(tier.minDeposit)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Daily reservation limit</span>
                        <span className="font-semibold text-white">{tier.activationLimitPerDay}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Participating assets</span>
                        <span className="font-semibold text-white">{tier.activationAssets.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Unlock status</span>
                        <span className={`font-semibold ${missingAmount > 0 ? "text-amber-100" : "text-cyan-100"}`}>
                          {missingAmount > 0 ? `${formatCurrency(missingAmount)} more needed` : "Condition met"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-5">
        <section className="neon-panel relative overflow-hidden rounded-[34px] p-5 shadow-[0_24px_50px_rgba(20,18,120,0.45)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(91,120,255,0.28),transparent_58%)]" />
          <div className="absolute left-3 top-20 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative z-10 grid grid-cols-2 gap-3">
            {metricCards.map(({ key, label, value, detail, icon: Icon }) => (
              <article key={key} className="rounded-[24px] border border-white/10 bg-[#04073d]/92 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-cyan-300/12 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[1.1rem] font-extrabold leading-none text-white">{value}</div>
                    <div className="mt-2 text-[13px] font-semibold text-slate-200">{label}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">{detail}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="hide-scrollbar mt-6 flex items-center gap-7 overflow-x-auto border-b border-white/10 px-1 pb-3 text-[15px]">
          {missionTabs.map((tab) => (
            <button
              key={tab.id}
              className={`relative shrink-0 pb-1 transition ${activeTab === tab.id ? "font-semibold text-white" : "text-white/35"}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tt(tab.label)}
              {activeTab === tab.id ? (
                <span className="absolute -bottom-3 left-0 h-1 w-20 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]" />
              ) : null}
            </button>
          ))}
        </div>

        {activeTab === "tasks" ? (
          <section className="mt-5 space-y-5">
            <section className="neon-panel relative overflow-hidden rounded-[30px] px-5 py-7 shadow-[0_24px_50px_rgba(20,18,120,0.45)]">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(89,122,255,0.24),transparent_64%)]" />
              <div className="relative z-10">
                <div className="max-w-[18rem] text-[2rem] font-extrabold leading-[1.1] tracking-[-0.04em] text-white">
                  Complete Tasks To Receive Benefits
                </div>
                <div className="mt-6 text-[1.1rem] font-semibold text-slate-300">Total Reward Overview</div>
                <div className="mt-2 text-[1.6rem] font-extrabold text-amber-300">
                  {formatMoneyValue(missionCenter.totalRewardAmount)} USDT
                </div>
              </div>
            </section>

            <div className="hide-scrollbar flex items-center gap-7 overflow-x-auto border-b border-white/10 px-1 pb-3 text-[15px]">
              {missionCategoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`relative shrink-0 pb-1 transition ${missionCategory === tab.id ? "font-semibold text-white" : "text-white/35"}`}
                  onClick={() => setMissionCategory(tab.id)}
                  type="button"
                >
                  {tab.label}
                  {missionCategory === tab.id ? (
                    <span className="absolute -bottom-3 left-0 h-1 w-20 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {visibleMissionTasks.length ? (
                visibleMissionTasks.map((task) => {
                  const progressPercent = Math.min((task.progress / Math.max(task.target, 1)) * 100, 100);
                  const rewardAssetLabel = task.rewardAsset.startsWith("USDT") ? "USDT" : task.rewardAsset;

                  return (
                    <article
                      key={task.id}
                      className="overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(10,17,139,0.96)_0%,rgba(11,16,126,0.94)_100%)] shadow-[0_18px_34px_rgba(8,14,104,0.34)]"
                    >
                      <div className="h-14 bg-[#02053c]/92" />
                      <div className="px-5 pb-5">
                        <div className="-mt-2 h-2 overflow-hidden rounded-full bg-[#01032d]">
                          <div
                            className="h-full rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        <div className="mt-5 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-[1rem] font-semibold text-white">{task.title}</div>
                            <div className="mt-2 text-[13px] leading-5 text-slate-300">{task.description}</div>
                            <div className="mt-4 text-[1rem] font-semibold text-white">
                              <span className="text-slate-400">Reward:</span>{" "}
                              <span className="text-cyan-100">{task.rewardAmount} {rewardAssetLabel}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-[1rem] font-extrabold text-white">
                            {Math.min(task.progress, task.target)}/{task.target}
                          </div>
                        </div>

                        <div
                          className={`mt-5 rounded-[20px] border px-4 py-3.5 text-center text-[1rem] font-semibold ${
                            task.completed
                              ? "border-emerald-300/25 bg-emerald-300/12 text-emerald-100"
                              : "border-white/10 bg-white/[0.08] text-slate-300"
                          }`}
                        >
                          {task.completed ? (task.rewardClaimed ? "Reward Paid" : "Completed") : "Not Completed"}
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="neon-panel px-4 py-8 text-center text-sm text-white/45">
                  {loadingMissionCenter ? "Loading mission tasks..." : "No mission tasks in this category."}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "strategy" ? (
          <div className="mt-5 space-y-4">
            <button
              className="w-full rounded-[24px] border border-cyan-300/25 bg-[#060a52]/92 px-4 py-4 text-left shadow-[0_16px_30px_rgba(10,18,110,0.35)]"
              onClick={() => setVipListOpen(true)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-300/12 text-cyan-200">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[1.12rem] font-bold text-white">VIP {currentTier.id}</div>
                    <div className="text-sm text-white/45">{formatRoiBand(currentTier)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[1.2rem] font-semibold text-white">{formatDepositBand(currentTier, nextTier)}</div>
                    <div className="mt-1 text-[12px] uppercase tracking-[0.18em] text-cyan-200/70">{tt("Tap for all VIPs")}</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-cyan-200/80" />
                </div>
              </div>
            </button>

            <button
              className="w-full rounded-[10px] bg-[linear-gradient(90deg,#16e7ec_0%,#07efaf_100%)] px-5 py-4 text-[#073133] shadow-[0_16px_28px_rgba(39,231,212,0.25)] transition enabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 disabled:saturate-[0.68]"
              disabled={!canStartActivation}
              onClick={openReservationModal}
              type="button"
            >
              <div className="flex min-h-[3.6rem] items-center justify-center gap-5 text-center text-[1.16rem] font-medium leading-tight">
                <span>{liveRunningActivation ? tt("Réservation En Cours") : tt("Prochain Tour De Réservation")}</span>
                <span className="shrink-0 tabular-nums">{reservationStripCountdown}</span>
              </div>
            </button>

            <section className="neon-soft-panel overflow-hidden rounded-[30px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[1.8rem] font-extrabold leading-none text-white">{tt("Strategie")} V{currentTier.id}</div>
                  <div className="mt-2 text-sm text-cyan-200/80">{liveRunningActivation?.strategy ?? `VIP${currentTier.id} ${tt("execution track")}`}</div>
                </div>
                <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
                  {liveRunningActivation ? tt("Running") : reservationLimitReached ? tt("Reset at 5 AM") : hasMinimumDeposit ? tt("Ready") : tt("Locked")}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <div className="flex -space-x-3">
                  {strategyAssets.slice(0, 2).map((asset, index) => (
                    <AssetBadge
                      key={`${asset}-${index}`}
                      asset={asset}
                      className="border-4 border-[#11176d] shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                    />
                  ))}
                </div>
                <div className="text-[2rem] font-extrabold text-white">{liveRunningActivation?.asset ?? strategyAssets[0]}</div>
              </div>

              <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
                <div className="flex items-center justify-between gap-4 text-[15px]">
                  <span className="text-white/45">{tt("Taux De Rendement Quotidien")}</span>
                  <span className="font-semibold text-white">{formatRoiBand(currentTier)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-[15px]">
                  <span className="text-white/45">{tt("Depot Minimum")}</span>
                  <span className="font-semibold text-white">{formatCurrency(currentTier.minDeposit)}</span>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "today" ? (
          <section className="mt-5 space-y-4">
            <article className="neon-panel p-5">
              <div className="text-sm uppercase tracking-[0.24em] text-cyan-200/75">5 AM window performance</div>
              <div className="mt-3 text-[2rem] font-extrabold text-white">{formatCurrency(todayProfit)}</div>
              <div className="mt-2 text-[13px] text-slate-300">
                {liveRunningActivation
                  ? `A run is live and closes in ${formatCountdown(countdownSeconds)}.`
                  : reservationLimitReached
                    ? `All reservations are used. The number resets in ${formatCountdown(reservationResetCountdownSeconds)} at 5:00 AM.`
                    : `${liveState.remainingActivationsToday} activation slots remain in the current 5 AM window.`}
              </div>
            </article>

            <article className="neon-soft-panel p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="text-sm uppercase tracking-[0.18em] text-cyan-200/75">Used in window</div>
                  <div className="mt-2 text-[1.6rem] font-bold text-white">{liveState.usedActivationsToday}</div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                  <div className="text-sm uppercase tracking-[0.18em] text-cyan-200/75">Remaining</div>
                  <div className="mt-2 text-[1.6rem] font-bold text-white">{liveState.remainingActivationsToday}</div>
                </div>
              </div>
            </article>

            {reservationLimitReached ? (
              <article className="neon-panel p-5">
                <div className="flex items-center gap-2 text-cyan-200">
                  <Clock3 className="h-4 w-4" />
                  <span className="text-sm uppercase tracking-[0.24em]">Next reset</span>
                </div>
                <div className="mt-3 text-[2rem] font-extrabold leading-none text-white">
                  {formatCountdown(reservationResetCountdownSeconds)}
                </div>
                <div className="mt-2 text-[13px] leading-5 text-slate-300">
                  Reservation number resets at 5:00 AM, then you can open a new reservation cycle.
                </div>
              </article>
            ) : null}
          </section>
        ) : null}

        {activeTab === "invoices" ? (
          <section className="mt-5 space-y-4">
            {depositRecords.length ? (
              depositRecords.map((record) => (
                <article key={record.id} className="neon-panel p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[1rem] font-semibold text-white">{record.asset}</div>
                      <div className="mt-1 text-[13px] text-slate-400">{record.orderNumber}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[1.1rem] font-bold text-cyan-300">{record.amount}</div>
                      <div className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/35">{record.status}</div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="neon-panel px-4 py-8 text-center text-sm text-white/45">No deposit invoices yet.</div>
            )}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="mt-5 space-y-4">
            {liveState.history.length ? (
              liveState.history.map((activation) => (
                <article key={activation.id} className="neon-panel p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[1rem] font-semibold text-white">{activation.strategy}</div>
                      <div className="mt-1 text-[13px] text-slate-400">{activation.asset}</div>
                    </div>
                    <div
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        activation.status === "completed"
                          ? "bg-cyan-300/12 text-cyan-100"
                          : activation.status === "running"
                            ? "bg-amber-300/12 text-amber-100"
                            : "bg-white/[0.08] text-white/65"
                      }`}
                    >
                      {activation.status}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 text-[13px]">
                    <div>
                      <div className="text-white/45">Reservation</div>
                      <div className="mt-1 font-semibold text-white">{formatCurrency(activation.reservationAmount)}</div>
                    </div>
                    <div>
                      <div className="text-white/45">Completed</div>
                      <div className="mt-1 font-semibold text-white">
                        {activation.completedAt ? new Date(activation.completedAt).toLocaleString("en-GB") : "In progress"}
                      </div>
                    </div>
                    <div>
                      <div className="text-white/45">Profit</div>
                      <div className="mt-1 font-semibold text-white">{formatCurrency(activation.profit ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-white/45">Expected</div>
                      <div className="mt-1 font-semibold text-white">
                        {activation.expectedIncomeMin !== null && activation.expectedIncomeMin !== undefined
                          ? `${formatCurrency(activation.expectedIncomeMin)} - ${formatCurrency(activation.expectedIncomeMax ?? activation.expectedIncomeMin)}`
                          : "N/A"}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="neon-panel px-4 py-8 text-center text-sm text-white/45">No activation history yet.</div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
