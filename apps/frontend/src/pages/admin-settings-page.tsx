import { useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import type { AdCarouselSlide, AdminPlatformSettings, AssetRouteSetting, MissionTaskSetting } from "@nevo/shared-types";
import { DEFAULT_ASSET_ROUTE_SETTINGS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "@/components/section-card";

const adminApiBase = import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:4006/api";
const adminUploadsBase = adminApiBase.replace(/\/api\/?$/, "");

const adminApi = axios.create({
  baseURL: adminApiBase
});

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

const defaultMissionTasks: MissionTaskSetting[] = [
  {
    id: "direct-invites-2",
    enabled: true,
    category: "limited",
    title: "Invite 2 first-line members",
    description: "Complete direct invitation task phase 1.",
    target: 2,
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
    rewardAmount: 300,
    rewardAsset: "USDT_TRC20"
  }
];

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
  rewardAmount: 20,
  rewardAsset: "USDT_TRC20"
});

const resolveAdminAssetUrl = (url: string) => {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${adminUploadsBase}${url.startsWith("/") ? url : `/${url}`}`;
};

export function AdminSettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AdminPlatformSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    adminApi
      .get<AdminPlatformSettings>("/admin/settings", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((response) => {
        setAdminApiOffline(false);
        setSettings({
          ...defaultSettings,
          ...response.data,
          adCarouselSlides: response.data.adCarouselSlides?.length
            ? response.data.adCarouselSlides
            : defaultAdCarouselSlides,
          missionTasks: response.data.missionTasks?.length
            ? response.data.missionTasks
            : defaultMissionTasks,
          assetSettings: response.data.assetSettings?.length
            ? response.data.assetSettings
            : DEFAULT_ASSET_ROUTE_SETTINGS
        });
      })
      .catch((error) => {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          localStorage.removeItem("nevo.accessToken");
          localStorage.removeItem("nevo.refreshToken");
          localStorage.removeItem("nevo.user");
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

    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    setUploadingSlideId(slideId);

    try {
      const response = await adminApi.post<{ url: string }>("/admin/assets/ad-image", formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      updateAdSlide(slideId, "imageUrl", response.data.url);
      toast.success("Ad image uploaded");
    } catch {
      toast.error("Image upload failed.");
    } finally {
      setUploadingSlideId(null);
    }
  };

  const saveSettings = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    setSaving(true);
    try {
      const response = await adminApi.patch<AdminPlatformSettings>("/admin/settings", settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
      toast.success("Settings saved");
    } catch (error) {
      toast.error("Saving settings failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
      <SectionCard title="Platform Settings" subtitle="Branding, maintenance mode, and asset toggles.">
        {adminApiOffline ? (
          <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Live admin settings are unavailable because `admin-service` is not responding on `localhost:4006`.
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
        subtitle="Tasks shown in the user Mission Center. Progress currently tracks direct invited members against each target."
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
