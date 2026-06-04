import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Ban, CheckCircle2, ImagePlus, Plus, Trash2, XCircle } from "lucide-react";
import type {
  AdCarouselSlide,
  AdminPlatformSettings,
  AssetRouteSetting,
  LuckyDrawAnalytics,
  LuckyDrawPrize,
  MissionTaskSetting
} from "@nevo/shared-types";
import { DEFAULT_ASSET_ROUTE_SETTINGS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import { useNavigate } from "react-router-dom";
import { adminApi, getApiErrorMessage, isApiAuthError, uploadBaseUrls } from "@/api/client";
import { SectionCard } from "@/components/section-card";
import { clearAuthSession, getAccessToken } from "@/lib/auth";

const defaultAdCarouselSlides: AdCarouselSlide[] = [
  {
    id: "mission-rewards",
    enabled: true,
    eyebrow: "Direct invitation rewards",
    title: "Invite. Upgrade. Unlock.",
    description: "Complete mission tiers, trigger AI tasks, and stack daily USDT campaign bonuses.",
    ctaLabel: "Open Mission Center",
    ctaHref: "/app/mission",
    imageUrl: ""
  },
  {
    id: "vip-growth",
    enabled: true,
    eyebrow: "VIP trading access",
    title: "Grow with active plans.",
    description: "Use deposits to unlock higher VIP tiers, stronger daily ROI ranges, and better task limits.",
    ctaLabel: "View VIP Levels",
    ctaHref: "/app/vip",
    imageUrl: ""
  },
  {
    id: "deposit-routes",
    enabled: true,
    eyebrow: "Fast account funding",
    title: "Top up and start.",
    description: "Deposit with crypto, bank instructions, or internal ledger routes configured by FNDK admin.",
    ctaLabel: "Deposit Funds",
    ctaHref: "/app/wallet/deposit",
    imageUrl: ""
  }
];

const defaultMissionQualifyingDepositAmount = 107;

const defaultMissionTasks: MissionTaskSetting[] = [
  {
    id: "direct-invites-2",
    enabled: true,
    category: "limited",
    title: "Invite 2 first-line members",
    description: "Complete direct invitation task phase 1.",
    target: 2,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 20,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-3",
    enabled: true,
    category: "limited",
    title: "Invite 3 first-line members",
    description: "Complete direct invitation task phase 2.",
    target: 3,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 60,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-10",
    enabled: true,
    category: "daily",
    title: "Invite 10 first-line members",
    description: "Complete direct invitation task phase 3.",
    target: 10,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 150,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-20",
    enabled: true,
    category: "long-term",
    title: "Invite 20 first-line members",
    description: "Complete direct invitation task phase 4.",
    target: 20,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 300,
    rewardAsset: "USDT_TRC20"
  }
];

const defaultLuckyDrawPrizes: LuckyDrawPrize[] = [
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

const defaultLuckyDraw: AdminPlatformSettings["luckyDraw"] = {
  enabled: true,
  title: "Lucky Draw Event",
  startsAt: "2026-06-03T22:00:00.000Z",
  endsAt: "2026-06-08T21:59:00.000Z",
  referralFirstDepositAmount: 100,
  referralSpinReward: 1,
  depositOneSpinAmount: 200,
  depositTwoSpinAmount: 300,
  maxTotalRewardAmount: 500,
  maxRewardPerUserAmount: 50,
  instantRewardMaxAmount: 10,
  requireKycAboveAmount: 10,
  showPrizeChancesToUsers: false,
  rules: [
    "Invite a direct referral who makes their first deposit of 100 USDT or more to receive 1 spin.",
    "Deposit 200 USDT or more in one transaction to receive 1 spin.",
    "Deposit 300 USDT or more in one transaction to receive 2 spins.",
    "Event period: June 4, 2026 00:00 to June 8, 2026 23:59."
  ],
  prizeLabels: defaultLuckyDrawPrizes.map((prize) => prize.label),
  prizes: defaultLuckyDrawPrizes
};

const defaultSettings: AdminPlatformSettings = {
  platformName: "FNDK",
  maintenanceMode: false,
  enableBtc: true,
  enableForex: true,
  referralBonusPercent: 5,
  feePercent: 20,
  withdrawalsPerMonthLimit: 3,
  reservationFailuresPerDay: 0,
  giveawayEnabled: false,
  giveawayTitle: "Weekly Investor Giveaway",
  giveawayDescription: "Reward active investors with a configurable bonus campaign.",
  giveawayPrize: "$1,000 trading credit",
  giveawayWinners: 3,
  giveawayEndsAt: null,
  luckyDraw: defaultLuckyDraw,
  adCarouselSlides: defaultAdCarouselSlides,
  missionTasks: defaultMissionTasks,
  assetSettings: DEFAULT_ASSET_ROUTE_SETTINGS,
  depositAddressBtc: "",
  depositAddressEth: "",
  depositAddressUsdtTrc20: "",
  depositAddressUsdtErc20: "",
  depositAddressUsd: "",
  depositAddressEur: "",
  depositAddressGbp: "",
  depositAddressStocks: ""
};

const fieldClass = "min-w-0 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-cyan-300/40 disabled:opacity-60";
const toggleRowClass = "flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3";
const primaryButtonClass = "w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-70";
const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-60";

const formatAdminReward = (amount: number, asset: LuckyDrawPrize["rewardAsset"]) =>
  `${amount.toFixed(2)} ${asset.startsWith("USDT") ? "USDT" : asset}`;

const createAdSlide = (): AdCarouselSlide => ({
  id: `ad-slide-${Date.now()}`,
  enabled: true,
  eyebrow: "Campaign",
  title: "New promotion",
  description: "Add campaign copy for this dashboard ad.",
  ctaLabel: "Open",
  ctaHref: "/app/mission",
  imageUrl: ""
});

const createMissionTask = (): MissionTaskSetting => ({
  id: `mission-task-${Date.now()}`,
  enabled: true,
  category: "daily",
  title: "New mission task",
  description: "Describe the task target and reward.",
  target: 1,
  qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
  rewardAmount: 20,
  rewardAsset: "USDT_TRC20"
});

const createLuckyDrawPrize = (): LuckyDrawPrize => ({
  id: `lucky-prize-${Date.now()}`,
  label: "New prize",
  chance: 10,
  rewardAmount: 0,
  rewardAsset: "USDT_TRC20",
  maxWinners: null,
  maxTotalRewardAmount: null,
  reviewRequired: false
});

const createLuckyDrawPrizesFromLabels = (labels: string[] | undefined): LuckyDrawPrize[] => {
  const cleanLabels = (labels?.length ? labels : defaultLuckyDraw.prizeLabels).map((label) => label.trim()).filter(Boolean);
  const chance = Number((100 / cleanLabels.length).toFixed(2));

  return cleanLabels.map((label, index) => ({
    id: `legacy-prize-${index + 1}`,
    label,
    chance,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  }));
};

const resolveAdminAssetUrl = (url: string) => {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${uploadBaseUrls.admin}${url.startsWith("/") ? url : `/${url}`}`;
};

export function AdminSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AdminPlatformSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [luckyDrawAnalytics, setLuckyDrawAnalytics] = useState<LuckyDrawAnalytics | null>(null);
  const [luckyDrawActionId, setLuckyDrawActionId] = useState<string | null>(null);
  const [luckyDrawGrant, setLuckyDrawGrant] = useState({
    userId: "",
    spinCount: 1,
    note: "",
    expiresAt: ""
  });
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const loadedRef = useRef(false);

  const loadLuckyDrawAnalytics = async () => {
    try {
      const response = await adminApi.get<LuckyDrawAnalytics>("/admin/lucky-draw/analytics");
      setLuckyDrawAnalytics(response.data);
    } catch (error) {
      if (isApiAuthError(error)) {
        clearAuthSession();
        toast.error("Your admin session expired. Sign in again.");
        navigate("/login", { replace: true });
      }
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    adminApi
      .get<AdminPlatformSettings>("/admin/settings")
      .then((response) => {
        setAdminApiOffline(false);
        const luckyDrawPrizes = response.data.luckyDraw.prizes?.length
          ? response.data.luckyDraw.prizes
          : createLuckyDrawPrizesFromLabels(response.data.luckyDraw.prizeLabels);
        setSettings({
          ...defaultSettings,
          ...response.data,
          adCarouselSlides: response.data.adCarouselSlides?.length
            ? response.data.adCarouselSlides
            : defaultAdCarouselSlides,
          missionTasks: response.data.missionTasks?.length
            ? response.data.missionTasks
            : defaultMissionTasks,
          luckyDraw: {
            ...defaultLuckyDraw,
            ...response.data.luckyDraw,
            prizes: luckyDrawPrizes,
            prizeLabels: luckyDrawPrizes.map((prize) => prize.label)
          },
          assetSettings: response.data.assetSettings?.length
            ? response.data.assetSettings
            : DEFAULT_ASSET_ROUTE_SETTINGS
        });
        void loadLuckyDrawAnalytics();
      })
      .catch((error) => {
        if (isApiAuthError(error)) {
          clearAuthSession();
          setAdminApiOffline(false);
          toast.error("Your admin session expired. Sign in again.");
          navigate("/login", { replace: true });
          return;
        }

        setAdminApiOffline(true);
        toast.error("Admin settings service is unavailable right now.");
      })
      .finally(() => setLoading(false));
  }, []);

  const updateField = <Key extends keyof AdminPlatformSettings,>(key: Key, value: AdminPlatformSettings[Key]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateLuckyDrawField = <Key extends keyof AdminPlatformSettings["luckyDraw"],>(
    key: Key,
    value: AdminPlatformSettings["luckyDraw"][Key]
  ) => {
    setSettings((current) => ({
      ...current,
      luckyDraw: {
        ...current.luckyDraw,
        [key]: value
      }
    }));
  };

  const updateLuckyDrawList = (key: "rules", value: string) => {
    updateLuckyDrawField(
      key,
      value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    );
  };

  const updateLuckyDrawPrize = <Key extends keyof LuckyDrawPrize,>(
    prizeId: string,
    key: Key,
    value: LuckyDrawPrize[Key]
  ) => {
    setSettings((current) => {
      const prizes = current.luckyDraw.prizes.map((prize) =>
        prize.id === prizeId ? { ...prize, [key]: value } : prize
      );

      return {
        ...current,
        luckyDraw: {
          ...current.luckyDraw,
          prizes,
          prizeLabels: prizes.map((prize) => prize.label)
        }
      };
    });
  };

  const addLuckyDrawPrize = () => {
    setSettings((current) => {
      const prizes = [...current.luckyDraw.prizes, createLuckyDrawPrize()];
      return {
        ...current,
        luckyDraw: {
          ...current.luckyDraw,
          prizes,
          prizeLabels: prizes.map((prize) => prize.label)
        }
      };
    });
  };

  const removeLuckyDrawPrize = (prizeId: string) => {
    setSettings((current) => {
      const prizes = current.luckyDraw.prizes.filter((prize) => prize.id !== prizeId);
      const nextPrizes = prizes.length ? prizes : [createLuckyDrawPrize()];
      return {
        ...current,
        luckyDraw: {
          ...current.luckyDraw,
          prizes: nextPrizes,
          prizeLabels: nextPrizes.map((prize) => prize.label)
        }
      };
    });
  };

  const updateAdSlide = <Key extends keyof AdCarouselSlide,>(
    slideId: string,
    key: Key,
    value: AdCarouselSlide[Key]
  ) => {
    setSettings((current) => ({
      ...current,
      adCarouselSlides: current.adCarouselSlides.map((slide) =>
        slide.id === slideId ? { ...slide, [key]: value } : slide
      )
    }));
  };

  const updateAssetSetting = <Key extends keyof AssetRouteSetting,>(
    asset: AssetRouteSetting["asset"],
    key: Key,
    value: AssetRouteSetting[Key]
  ) => {
    setSettings((current) => ({
      ...current,
      assetSettings: current.assetSettings.map((assetSetting) =>
        assetSetting.asset === asset ? { ...assetSetting, [key]: value } : assetSetting
      )
    }));
  };

  const updateMissionTask = <Key extends keyof MissionTaskSetting,>(
    taskId: string,
    key: Key,
    value: MissionTaskSetting[Key]
  ) => {
    setSettings((current) => ({
      ...current,
      missionTasks: current.missionTasks.map((task) =>
        task.id === taskId ? { ...task, [key]: value } : task
      )
    }));
  };

  const addAdSlide = () => {
    setSettings((current) => ({
      ...current,
      adCarouselSlides: [...current.adCarouselSlides, createAdSlide()]
    }));
  };

  const addMissionTask = () => {
    setSettings((current) => ({
      ...current,
      missionTasks: [...current.missionTasks, createMissionTask()]
    }));
  };

  const removeAdSlide = (slideId: string) => {
    setSettings((current) => {
      const nextSlides = current.adCarouselSlides.filter((slide) => slide.id !== slideId);
      return {
        ...current,
        adCarouselSlides: nextSlides.length ? nextSlides : [createAdSlide()]
      };
    });
  };

  const removeMissionTask = (taskId: string) => {
    setSettings((current) => {
      const nextTasks = current.missionTasks.filter((task) => task.id !== taskId);
      return {
        ...current,
        missionTasks: nextTasks.length ? nextTasks : [createMissionTask()]
      };
    });
  };

  const uploadAdImage = async (slideId: string, file?: File) => {
    if (!file) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setUploadingSlideId(slideId);

    try {
      const response = await adminApi.post<{ url: string }>("/admin/assets/ad-image", formData);
      updateAdSlide(slideId, "imageUrl", response.data.url);
      toast.success("Ad image uploaded");
    } catch {
      toast.error("Image upload failed.");
    } finally {
      setUploadingSlideId(null);
    }
  };

  const saveSettings = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    setSaving(true);
    try {
      const response = await adminApi.patch<AdminPlatformSettings>("/admin/settings", settings);
      setSettings(response.data);
      void loadLuckyDrawAnalytics();
      toast.success("Settings saved");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Saving settings failed."));
    } finally {
      setSaving(false);
    }
  };

  const grantLuckyDrawSpins = async () => {
    if (!luckyDrawGrant.userId.trim()) {
      toast.error("User id is required.");
      return;
    }

    setLuckyDrawActionId("grant");
    try {
      await adminApi.post("/admin/lucky-draw/spins/grant", {
        userId: luckyDrawGrant.userId.trim(),
        spinCount: luckyDrawGrant.spinCount,
        note: luckyDrawGrant.note.trim() || undefined,
        expiresAt: luckyDrawGrant.expiresAt ? new Date(luckyDrawGrant.expiresAt).toISOString() : null
      });
      setLuckyDrawGrant({ userId: "", spinCount: 1, note: "", expiresAt: "" });
      await loadLuckyDrawAnalytics();
      toast.success("Lucky Draw spins granted");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not grant spins."));
    } finally {
      setLuckyDrawActionId(null);
    }
  };

  const reviewLuckyDrawPrize = async (transactionId: string, decision: "approve" | "reject") => {
    const actionId = `${decision}-${transactionId}`;
    setLuckyDrawActionId(actionId);
    try {
      await adminApi.patch(
        `/admin/transactions/${transactionId}/${decision}`,
        decision === "reject" ? { adminNote: "Rejected from Lucky Draw review" } : undefined
      );
      await loadLuckyDrawAnalytics();
      toast.success(decision === "approve" ? "Prize approved" : "Prize rejected");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Prize review failed."));
    } finally {
      setLuckyDrawActionId(null);
    }
  };

  const revokeLuckyDrawAward = async (ledgerId: string) => {
    const actionId = `revoke-${ledgerId}`;
    setLuckyDrawActionId(actionId);
    try {
      await adminApi.patch(`/admin/lucky-draw/spins/${ledgerId}/revoke`, {
        note: "Revoked from Lucky Draw admin"
      });
      await loadLuckyDrawAnalytics();
      toast.success("Unused spins revoked");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not revoke spins."));
    } finally {
      setLuckyDrawActionId(null);
    }
  };

  const luckyDrawChanceTotal = settings.luckyDraw.prizes.reduce((sum, prize) => sum + Number(prize.chance || 0), 0);
  const luckyDrawChanceTotalIsBalanced = Math.abs(luckyDrawChanceTotal - 100) < 0.01;

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
      <SectionCard title="Platform Settings" subtitle="Branding, maintenance mode, and asset toggles.">
        {adminApiOffline ? (
          <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Live admin settings are unavailable right now.
          </div>
        ) : null}
        <div className="grid gap-3">
          <input
            className={fieldClass}
            disabled={loading}
            value={settings.platformName}
            onChange={(event) => updateField("platformName", event.target.value)}
          />
          <label className={toggleRowClass}>
            <span className="min-w-0">Maintenance mode</span>
            <input
              className="h-4 w-4 shrink-0"
              checked={settings.maintenanceMode}
              disabled={loading}
              onChange={(event) => updateField("maintenanceMode", event.target.checked)}
              type="checkbox"
            />
          </label>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            Asset availability, display labels, and destination addresses are controlled in Asset Routes below.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fee Configuration" subtitle="Referral, fee, and withdrawal control settings stored in PostgreSQL.">
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Referral bonus %</span>
            <input
              className={fieldClass}
              disabled={loading}
              min={0}
              step="0.1"
              type="number"
              value={settings.referralBonusPercent}
              onChange={(event) => updateField("referralBonusPercent", Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Platform fee %</span>
            <input
              className={fieldClass}
              disabled={loading}
              min={0}
              step="0.1"
              type="number"
              value={settings.feePercent}
              onChange={(event) => updateField("feePercent", Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Withdrawals per month</span>
            <input
              className={fieldClass}
              disabled={loading}
              min={1}
              type="number"
              value={settings.withdrawalsPerMonthLimit}
              onChange={(event) => updateField("withdrawalsPerMonthLimit", Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Reservation failures per day</span>
            <input
              className={fieldClass}
              disabled={loading}
              min={0}
              type="number"
              value={settings.reservationFailuresPerDay}
              onChange={(event) => updateField("reservationFailuresPerDay", Number(event.target.value))}
            />
          </label>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            Every withdrawal request enters a fixed 72-hour holding period before admin approval is allowed. Reservation failures
            let you force the first N reservation attempts per user per day to return a failed outcome.
          </div>
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        className="xl:col-span-2"
        title="Mission Tasks"
        subtitle="Tasks shown in the user Mission Center. Progress tracks direct invited members whose approved deposits meet the mission condition."
        action={
          <button className={secondaryButtonClass} disabled={loading} onClick={addMissionTask} type="button">
            <Plus className="h-4 w-4" />
            Add task
          </button>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {settings.missionTasks.map((task, index) => (
            <div key={task.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-w-0 items-center gap-3 text-sm text-slate-300">
                  <input
                    checked={task.enabled}
                    className="h-4 w-4 shrink-0"
                    disabled={loading}
                    type="checkbox"
                    onChange={(event) => updateMissionTask(task.id, "enabled", event.target.checked)}
                  />
                  Mission {index + 1} enabled
                </label>
                <button
                  aria-label={`Remove mission task ${index + 1}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/15"
                  disabled={loading || settings.missionTasks.length <= 1}
                  onClick={() => removeMissionTask(task.id)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <input
                className={fieldClass}
                disabled={loading}
                placeholder="Task title"
                value={task.title}
                onChange={(event) => updateMissionTask(task.id, "title", event.target.value)}
              />
              <textarea
                className={`${fieldClass} min-h-24 resize-y`}
                disabled={loading}
                placeholder="Task description"
                value={task.description}
                onChange={(event) => updateMissionTask(task.id, "description", event.target.value)}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-slate-300">Category</span>
                  <select
                    className={fieldClass}
                    disabled={loading}
                    value={task.category}
                    onChange={(event) =>
                      updateMissionTask(task.id, "category", event.target.value as MissionTaskSetting["category"])
                    }
                  >
                    <option value="limited">Limited time</option>
                    <option value="daily">Daily</option>
                    <option value="long-term">Long-term</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-slate-300">Invite target</span>
                  <input
                    className={fieldClass}
                    disabled={loading}
                    min={1}
                    type="number"
                    value={task.target}
                    onChange={(event) => updateMissionTask(task.id, "target", Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm text-slate-300">Qualified member deposit total</span>
                  <input
                    className={fieldClass}
                    disabled={loading}
                    min={0}
                    step="0.01"
                    type="number"
                    value={task.qualifyingDepositAmount}
                    onChange={(event) =>
                      updateMissionTask(task.id, "qualifyingDepositAmount", Number(event.target.value))
                    }
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-slate-300">Reward amount</span>
                  <input
                    className={fieldClass}
                    disabled={loading}
                    min={0}
                    step="0.01"
                    type="number"
                    value={task.rewardAmount}
                    onChange={(event) => updateMissionTask(task.id, "rewardAmount", Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm text-slate-300">Reward asset</span>
                  <select
                    className={fieldClass}
                    disabled={loading}
                    value={task.rewardAsset}
                    onChange={(event) =>
                      updateMissionTask(task.id, "rewardAsset", event.target.value as MissionTaskSetting["rewardAsset"])
                    }
                  >
                    {SUPPORTED_ASSETS.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs font-medium text-slate-400">
                A member qualifies once their approved deposits total this amount. Example: 50 + 57 counts for 107.
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save mission tasks"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Giveaway Campaign" subtitle="Configure the giveaway copy and runtime values from admin.">
        <div className="grid gap-3">
          <label className={toggleRowClass}>
            <span className="min-w-0">Enable giveaway</span>
            <input
              className="h-4 w-4 shrink-0"
              checked={settings.giveawayEnabled}
              disabled={loading}
              onChange={(event) => updateField("giveawayEnabled", event.target.checked)}
              type="checkbox"
            />
          </label>
          <input
            className={fieldClass}
            disabled={loading}
            placeholder="Campaign title"
            value={settings.giveawayTitle}
            onChange={(event) => updateField("giveawayTitle", event.target.value)}
          />
          <textarea
            className={`${fieldClass} min-h-28 resize-y`}
            disabled={loading}
            placeholder="Campaign description"
            value={settings.giveawayDescription}
            onChange={(event) => updateField("giveawayDescription", event.target.value)}
          />
          <input
            className={fieldClass}
            disabled={loading}
            placeholder="Prize"
            value={settings.giveawayPrize}
            onChange={(event) => updateField("giveawayPrize", event.target.value)}
          />
          <input
            className={fieldClass}
            disabled={loading}
            min={1}
            type="number"
            value={settings.giveawayWinners}
            onChange={(event) => updateField("giveawayWinners", Number(event.target.value))}
          />
          <input
            className={fieldClass}
            disabled={loading}
            type="datetime-local"
            value={settings.giveawayEndsAt ? settings.giveawayEndsAt.slice(0, 16) : ""}
            onChange={(event) =>
              updateField("giveawayEndsAt", event.target.value ? new Date(event.target.value).toISOString() : null)
            }
          />
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save giveaway"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        action={
          <button className={secondaryButtonClass} disabled={loading} onClick={addLuckyDrawPrize} type="button">
            <Plus className="h-4 w-4" />
            Add prize
          </button>
        }
        className="xl:col-span-2"
        title="Lucky Draw Event"
        subtitle="Activate, deactivate, and edit spin event rules."
      >
        <div className="grid gap-3">
          <label className={toggleRowClass}>
            <span className="min-w-0">Enable Lucky Draw</span>
            <input
              className="h-4 w-4 shrink-0"
              checked={settings.luckyDraw.enabled}
              disabled={loading}
              onChange={(event) => updateLuckyDrawField("enabled", event.target.checked)}
              type="checkbox"
            />
          </label>
          <input
            className={fieldClass}
            disabled={loading}
            placeholder="Event title"
            value={settings.luckyDraw.title}
            onChange={(event) => updateLuckyDrawField("title", event.target.value)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Start
              <input
                className={fieldClass}
                disabled={loading}
                type="datetime-local"
                value={settings.luckyDraw.startsAt.slice(0, 16)}
                onChange={(event) => updateLuckyDrawField("startsAt", event.target.value ? new Date(event.target.value).toISOString() : defaultLuckyDraw.startsAt)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              End
              <input
                className={fieldClass}
                disabled={loading}
                type="datetime-local"
                value={settings.luckyDraw.endsAt.slice(0, 16)}
                onChange={(event) => updateLuckyDrawField("endsAt", event.target.value ? new Date(event.target.value).toISOString() : defaultLuckyDraw.endsAt)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm text-slate-300">
              Referral first deposit USDT
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                type="number"
                value={settings.luckyDraw.referralFirstDepositAmount}
                onChange={(event) => updateLuckyDrawField("referralFirstDepositAmount", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Referral spins
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                type="number"
                value={settings.luckyDraw.referralSpinReward}
                onChange={(event) => updateLuckyDrawField("referralSpinReward", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              1-spin deposit USDT
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                type="number"
                value={settings.luckyDraw.depositOneSpinAmount}
                onChange={(event) => updateLuckyDrawField("depositOneSpinAmount", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              2-spin deposit USDT
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                type="number"
                value={settings.luckyDraw.depositTwoSpinAmount}
                onChange={(event) => updateLuckyDrawField("depositTwoSpinAmount", Number(event.target.value))}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Event reward budget
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                step="0.01"
                type="number"
                value={settings.luckyDraw.maxTotalRewardAmount}
                onChange={(event) => updateLuckyDrawField("maxTotalRewardAmount", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Per-user reward cap
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                step="0.01"
                type="number"
                value={settings.luckyDraw.maxRewardPerUserAmount}
                onChange={(event) => updateLuckyDrawField("maxRewardPerUserAmount", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Instant credit max
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                step="0.01"
                type="number"
                value={settings.luckyDraw.instantRewardMaxAmount}
                onChange={(event) => updateLuckyDrawField("instantRewardMaxAmount", Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              KYC review threshold
              <input
                className={fieldClass}
                disabled={loading}
                min={0}
                step="0.01"
                type="number"
                value={settings.luckyDraw.requireKycAboveAmount}
                onChange={(event) => updateLuckyDrawField("requireKycAboveAmount", Number(event.target.value))}
              />
            </label>
          </div>
          <label className={toggleRowClass}>
            <span className="min-w-0">Show exact prize chances to users</span>
            <input
              className="h-4 w-4 shrink-0"
              checked={settings.luckyDraw.showPrizeChancesToUsers}
              disabled={loading}
              onChange={(event) => updateLuckyDrawField("showPrizeChancesToUsers", event.target.checked)}
              type="checkbox"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Event rules
            <textarea
              className={`${fieldClass} min-h-32 resize-y`}
              disabled={loading}
              value={settings.luckyDraw.rules.join("\n")}
              onChange={(event) => updateLuckyDrawList("rules", event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            <span className="font-semibold">Prize chance total</span>
            <span className={luckyDrawChanceTotalIsBalanced ? "font-extrabold text-emerald-100" : "font-extrabold text-amber-100"}>
              {luckyDrawChanceTotal.toFixed(2)}%
            </span>
          </div>
          <div className="grid gap-4">
            {settings.luckyDraw.prizes.map((prize, index) => (
              <div key={prize.id} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Prize {index + 1}</div>
                  <button
                    aria-label={`Remove Lucky Draw prize ${index + 1}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/15"
                    disabled={loading || settings.luckyDraw.prizes.length <= 1}
                    onClick={() => removeLuckyDrawPrize(prize.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,0.5fr)_minmax(140px,0.6fr)_minmax(150px,0.6fr)]">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Prize label
                    <input
                      className={fieldClass}
                      disabled={loading}
                      value={prize.label}
                      onChange={(event) => updateLuckyDrawPrize(prize.id, "label", event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Chance %
                    <input
                      className={fieldClass}
                      disabled={loading}
                      min={0.01}
                      step="0.01"
                      type="number"
                      value={prize.chance}
                      onChange={(event) => updateLuckyDrawPrize(prize.id, "chance", Number(event.target.value))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Reward amount
                    <input
                      className={fieldClass}
                      disabled={loading}
                      min={0}
                      step="0.01"
                      type="number"
                      value={prize.rewardAmount}
                      onChange={(event) => updateLuckyDrawPrize(prize.id, "rewardAmount", Number(event.target.value))}
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Reward asset
                    <select
                      className={fieldClass}
                      disabled={loading}
                      value={prize.rewardAsset}
                      onChange={(event) => updateLuckyDrawPrize(prize.id, "rewardAsset", event.target.value as LuckyDrawPrize["rewardAsset"])}
                    >
                      {SUPPORTED_ASSETS.map((asset) => (
                        <option key={asset} value={asset}>
                          {asset}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(120px,0.6fr)_minmax(150px,0.7fr)_minmax(180px,0.8fr)]">
                  <label className="grid gap-2 text-sm text-slate-300">
                    Max winners
                    <input
                      className={fieldClass}
                      disabled={loading}
                      min={1}
                      type="number"
                      value={prize.maxWinners ?? ""}
                      onChange={(event) =>
                        updateLuckyDrawPrize(prize.id, "maxWinners", event.target.value ? Number(event.target.value) : null)
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-slate-300">
                    Max payout
                    <input
                      className={fieldClass}
                      disabled={loading}
                      min={0}
                      step="0.01"
                      type="number"
                      value={prize.maxTotalRewardAmount ?? ""}
                      onChange={(event) =>
                        updateLuckyDrawPrize(
                          prize.id,
                          "maxTotalRewardAmount",
                          event.target.value ? Number(event.target.value) : null
                        )
                      }
                    />
                  </label>
                  <label className={toggleRowClass}>
                    <span className="min-w-0 text-sm text-slate-300">Require manual review</span>
                    <input
                      className="h-4 w-4 shrink-0"
                      checked={prize.reviewRequired === true}
                      disabled={loading}
                      onChange={(event) => updateLuckyDrawPrize(prize.id, "reviewRequired", event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {luckyDrawAnalytics ? (
            <div className="grid gap-4 rounded-lg border border-white/10 bg-slate-950/40 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Available spins", luckyDrawAnalytics.availableSpins],
                  ["Used spins", luckyDrawAnalytics.usedSpins],
                  ["Spin results", luckyDrawAnalytics.resultCount],
                  [
                    "Budget left",
                    luckyDrawAnalytics.eventBudgetRemaining === null
                      ? "Unlimited"
                      : `${luckyDrawAnalytics.eventBudgetRemaining.toFixed(2)} USDT`
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
                    <div className="mt-2 text-2xl font-bold text-white">{value}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Prize</th>
                      <th className="py-2 pr-4">Wins</th>
                      <th className="py-2 pr-4">Credited</th>
                      <th className="py-2 pr-4">Pending</th>
                      <th className="py-2 pr-4">Limits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-slate-200">
                    {luckyDrawAnalytics.prizes.map((prize) => (
                      <tr key={prize.id}>
                        <td className="py-3 pr-4 font-medium text-white">{prize.label}</td>
                        <td className="py-3 pr-4">{prize.wins}</td>
                        <td className="py-3 pr-4">{formatAdminReward(prize.creditedAmount, prize.rewardAsset)}</td>
                        <td className="py-3 pr-4">{formatAdminReward(prize.pendingAmount, prize.rewardAsset)}</td>
                        <td className="py-3 pr-4 text-slate-400">
                          {prize.maxWinners ? `${prize.maxWinners} winners` : "No winner cap"}
                          {" / "}
                          {prize.maxTotalRewardAmount ? `${prize.maxTotalRewardAmount.toFixed(2)} max` : "No payout cap"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-white">Grant spins</div>
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_120px_minmax(180px,0.8fr)_minmax(220px,1fr)]">
              <input
                className={fieldClass}
                disabled={loading || luckyDrawActionId === "grant"}
                placeholder="User UUID"
                value={luckyDrawGrant.userId}
                onChange={(event) => setLuckyDrawGrant((current) => ({ ...current, userId: event.target.value }))}
              />
              <input
                className={fieldClass}
                disabled={loading || luckyDrawActionId === "grant"}
                min={1}
                max={100}
                type="number"
                value={luckyDrawGrant.spinCount}
                onChange={(event) => setLuckyDrawGrant((current) => ({ ...current, spinCount: Number(event.target.value) }))}
              />
              <input
                className={fieldClass}
                disabled={loading || luckyDrawActionId === "grant"}
                type="datetime-local"
                value={luckyDrawGrant.expiresAt}
                onChange={(event) => setLuckyDrawGrant((current) => ({ ...current, expiresAt: event.target.value }))}
              />
              <input
                className={fieldClass}
                disabled={loading || luckyDrawActionId === "grant"}
                placeholder="Internal note"
                value={luckyDrawGrant.note}
                onChange={(event) => setLuckyDrawGrant((current) => ({ ...current, note: event.target.value }))}
              />
            </div>
            <button
              className={secondaryButtonClass}
              disabled={loading || luckyDrawActionId === "grant"}
              onClick={grantLuckyDrawSpins}
              type="button"
            >
              <Plus className="h-4 w-4" />
              {luckyDrawActionId === "grant" ? "Granting..." : "Grant spins"}
            </button>
          </div>
          {luckyDrawAnalytics?.pendingReviews.length ? (
            <div className="grid gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="text-sm font-semibold text-amber-100">Pending prize reviews</div>
              {luckyDrawAnalytics.pendingReviews.map((review) => (
                <div key={review.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{review.userName}</div>
                    <div className="text-sm text-slate-300">
                      {review.label} · {formatAdminReward(review.rewardAmount, review.rewardAsset)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-60"
                      disabled={luckyDrawActionId !== null}
                      onClick={() => reviewLuckyDrawPrize(review.transactionId, "approve")}
                      type="button"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-60"
                      disabled={luckyDrawActionId !== null}
                      onClick={() => reviewLuckyDrawPrize(review.transactionId, "reject")}
                      type="button"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {luckyDrawAnalytics?.recentAwards.length ? (
            <div className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-white">Recent spin awards</div>
              {luckyDrawAnalytics.recentAwards.slice(0, 6).map((award) => {
                const canRevoke = !award.revokedAt && award.spinsUsed < award.spinCount;
                return (
                  <div key={award.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/40 px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{award.userName}</div>
                      <div className="text-sm text-slate-300">
                        {award.spinCount} spins · {award.sourceType.replace(/_/g, " ")} · used {award.spinsUsed}
                      </div>
                    </div>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-40"
                      disabled={!canRevoke || luckyDrawActionId !== null}
                      onClick={() => revokeLuckyDrawAward(award.id)}
                      type="button"
                    >
                      <Ban className="h-4 w-4" />
                      {award.revokedAt ? "Revoked" : "Revoke unused"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save Lucky Draw"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        className="xl:col-span-2"
        title="Ad Carousel"
        subtitle="Dashboard promotional slides. Upload photos here, then save settings to publish them in the app."
        action={
          <button className={secondaryButtonClass} disabled={loading} onClick={addAdSlide} type="button">
            <Plus className="h-4 w-4" />
            Add slide
          </button>
        }
      >
        <div className="grid gap-4">
          {settings.adCarouselSlides.map((slide, index) => {
            const imagePreviewUrl = resolveAdminAssetUrl(slide.imageUrl);
            const inputId = `ad-image-${slide.id}`;

            return (
              <div key={slide.id} className="grid gap-4 rounded-lg border border-white/10 bg-white/5 p-4 lg:grid-cols-[220px_1fr]">
                <div className="min-w-0">
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#08105e]">
                    {imagePreviewUrl ? (
                      <img
                        key={imagePreviewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        src={imagePreviewUrl}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <ImagePlus className="h-10 w-10 text-cyan-200/70" />
                    )}
                  </div>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={loading || uploadingSlideId === slide.id}
                    id={inputId}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      void uploadAdImage(slide.id, file);
                      event.target.value = "";
                    }}
                  />
                  <label
                    className={`${secondaryButtonClass} mt-3 w-full cursor-pointer ${
                      loading || uploadingSlideId === slide.id ? "pointer-events-none opacity-60" : ""
                    }`}
                    htmlFor={inputId}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {uploadingSlideId === slide.id ? "Uploading..." : "Upload photo"}
                  </label>
                </div>

                <div className="grid min-w-0 gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex min-w-0 items-center gap-3 text-sm text-slate-300">
                      <input
                        checked={slide.enabled}
                        className="h-4 w-4 shrink-0"
                        disabled={loading}
                        type="checkbox"
                        onChange={(event) => updateAdSlide(slide.id, "enabled", event.target.checked)}
                      />
                      Slide {index + 1} enabled
                    </label>
                    <button
                      aria-label={`Remove slide ${index + 1}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/20 bg-rose-400/10 text-rose-100 transition hover:bg-rose-400/15"
                      disabled={loading || settings.adCarouselSlides.length <= 1}
                      onClick={() => removeAdSlide(slide.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    className={fieldClass}
                    disabled={loading}
                    placeholder="Small label"
                    value={slide.eyebrow}
                    onChange={(event) => updateAdSlide(slide.id, "eyebrow", event.target.value)}
                  />
                  <input
                    className={fieldClass}
                    disabled={loading}
                    placeholder="Headline"
                    value={slide.title}
                    onChange={(event) => updateAdSlide(slide.id, "title", event.target.value)}
                  />
                  <textarea
                    className={`${fieldClass} min-h-24 resize-y`}
                    disabled={loading}
                    placeholder="Description"
                    value={slide.description}
                    onChange={(event) => updateAdSlide(slide.id, "description", event.target.value)}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      className={fieldClass}
                      disabled={loading}
                      placeholder="Button label"
                      value={slide.ctaLabel}
                      onChange={(event) => updateAdSlide(slide.id, "ctaLabel", event.target.value)}
                    />
                    <input
                      className={fieldClass}
                      disabled={loading}
                      placeholder="/app/mission or https://..."
                      value={slide.ctaHref}
                      onChange={(event) => updateAdSlide(slide.id, "ctaHref", event.target.value)}
                    />
                  </div>
                  <input
                    className={fieldClass}
                    disabled={loading}
                    placeholder="Image URL"
                    value={slide.imageUrl}
                    onChange={(event) => updateAdSlide(slide.id, "imageUrl", event.target.value)}
                  />
                </div>
              </div>
            );
          })}
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save carousel"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        className="xl:col-span-2"
        title="Asset Routes"
        subtitle="Only enabled assets appear in the app deposit picker. Edit the user-facing label and destination address here."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {settings.assetSettings.map((assetSetting) => (
            <div key={assetSetting.asset} className="grid gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.2em] text-cyan-200/75">{assetSetting.asset}</div>
                  <div className="mt-1 text-base font-semibold text-white">{assetSetting.label}</div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    checked={assetSetting.enabled}
                    className="h-4 w-4 shrink-0"
                    disabled={loading}
                    type="checkbox"
                    onChange={(event) => updateAssetSetting(assetSetting.asset, "enabled", event.target.checked)}
                  />
                  Enabled
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Label shown to users</span>
                <input
                  className={fieldClass}
                  disabled={loading}
                  placeholder="Asset label"
                  value={assetSetting.label}
                  onChange={(event) => updateAssetSetting(assetSetting.asset, "label", event.target.value)}
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Deposit address or instructions</span>
                <textarea
                  className={`${fieldClass} min-h-24 resize-y`}
                  disabled={loading}
                  placeholder="Wallet address, IBAN, wire details, or internal instructions"
                  value={assetSetting.address}
                  onChange={(event) => updateAssetSetting(assetSetting.asset, "address", event.target.value)}
                />
              </label>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <button
            className={primaryButtonClass}
            disabled={loading || saving}
            onClick={saveSettings}
            type="button"
          >
            {saving ? "Saving..." : "Save asset routes"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
