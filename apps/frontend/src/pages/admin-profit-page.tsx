import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCcw, Trash2, X } from "lucide-react";
import type { VipTier } from "@nevo/shared-types";
import { formatCurrency, formatPercent } from "@nevo/shared-utils";
import { useNavigate } from "react-router-dom";
import { adminApi, getApiErrorMessage, isApiAuthError } from "@/api/client";
import { SectionCard } from "@/components/section-card";
import { clearAuthSession, getAccessToken } from "@/lib/auth";

type ProfitSettings = {
  autoProfitDistribution: boolean;
};

type TierEditorState = {
  id: number;
  name: string;
  isNew: boolean;
  minDeposit: string;
  dailyRoiMinPercent: string;
  dailyRoiMaxPercent: string;
  dailyProfitCap: string;
  requiredDirectMembers: string;
  activationLimitPerDay: string;
  activationDurationMinutes: string;
};

const resolveAutomaticDailyProfitCap = (tier: Pick<VipTier, "minDeposit" | "dailyRoiMin">) =>
  Number((tier.minDeposit * tier.dailyRoiMin).toFixed(2));

const formatDailyProfitCap = (tier: VipTier) =>
  tier.dailyProfitCap && tier.dailyProfitCap > 0
    ? `${formatCurrency(tier.dailyProfitCap)} at ${formatCurrency(tier.minDeposit)}`
    : `Auto ${formatCurrency(resolveAutomaticDailyProfitCap(tier))}`;

const parseDecimalInput = (value: string) => Number(value.trim().replace(",", "."));

const parseOptionalDecimalInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? parseDecimalInput(trimmed) : null;
};

const toEditorState = (tier: VipTier): TierEditorState => ({
  id: tier.id,
  name: tier.name,
  isNew: false,
  minDeposit: String(tier.minDeposit),
  dailyRoiMinPercent: String(Number((tier.dailyRoiMin * 100).toFixed(2))),
  dailyRoiMaxPercent: String(Number((tier.dailyRoiMax * 100).toFixed(2))),
  dailyProfitCap: tier.dailyProfitCap == null ? "0" : String(tier.dailyProfitCap),
  requiredDirectMembers: String(tier.requiredDirectMembers),
  activationLimitPerDay: String(tier.activationLimitPerDay),
  activationDurationMinutes: String(tier.activationDurationMinutes)
});

const createTierEditorState = (tiers: VipTier[]): TierEditorState => {
  const orderedTiers = [...tiers].sort((left, right) => left.minDeposit - right.minDeposit);
  const highestTier = orderedTiers[orderedTiers.length - 1];
  const nextId = Math.max(0, ...tiers.map((tier) => tier.id)) + 1;
  const minDeposit = highestTier
    ? Number(Math.max(highestTier.minDeposit + 50, highestTier.minDeposit * 2).toFixed(2))
    : 50;

  return {
    id: nextId,
    name: `VIP ${nextId}`,
    isNew: true,
    minDeposit: String(minDeposit),
    dailyRoiMinPercent: highestTier ? String(Number((highestTier.dailyRoiMin * 100).toFixed(2))) : "0.5",
    dailyRoiMaxPercent: highestTier ? String(Number((highestTier.dailyRoiMax * 100).toFixed(2))) : "1",
    dailyProfitCap: highestTier?.dailyProfitCap == null ? "0" : String(highestTier.dailyProfitCap),
    requiredDirectMembers: String(highestTier?.requiredDirectMembers ?? 0),
    activationLimitPerDay: String(highestTier?.activationLimitPerDay ?? 3),
    activationDurationMinutes: String(highestTier?.activationDurationMinutes ?? 2)
  };
};

export function AdminProfitPage() {
  const navigate = useNavigate();
  const [vipTiers, setVipTiers] = useState<VipTier[]>([]);
  const [profitSettings, setProfitSettings] = useState<ProfitSettings>({ autoProfitDistribution: true });
  const [loading, setLoading] = useState(true);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const [savingTierId, setSavingTierId] = useState<number | null>(null);
  const [deletingTierId, setDeletingTierId] = useState<number | null>(null);
  const [savingDistribution, setSavingDistribution] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [editingTier, setEditingTier] = useState<TierEditorState | null>(null);
  const loadedRef = useRef(false);
  const editingCapPreview = (() => {
    if (!editingTier) {
      return null;
    }

    const minDeposit = parseDecimalInput(editingTier.minDeposit);
    const dailyProfitCap = parseOptionalDecimalInput(editingTier.dailyProfitCap);
    if (
      !Number.isFinite(minDeposit) ||
      minDeposit <= 0 ||
      dailyProfitCap === null ||
      !Number.isFinite(dailyProfitCap) ||
      dailyProfitCap <= 0
    ) {
      return null;
    }

    return {
      minDeposit,
      dailyProfitCap,
      exampleBalance: Number((minDeposit * 10).toFixed(2)),
      exampleCap: Number((dailyProfitCap * 10).toFixed(2))
    };
  })();

  const handleAuthFailure = () => {
    clearAuthSession();
    setAdminApiOffline(false);
    toast.error("Your admin session expired. Sign in again.");
    navigate("/login", { replace: true });
  };

  const loadPageState = async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const [tiersResponse, settingsResponse] = await Promise.all([
        adminApi.get<VipTier[]>("/admin/vip-tiers"),
        adminApi.get<ProfitSettings>("/admin/profit-settings")
      ]);

      setAdminApiOffline(false);
      setVipTiers(tiersResponse.data);
      setProfitSettings(settingsResponse.data);
    } catch (error) {
      if (isApiAuthError(error)) {
        handleAuthFailure();
        return;
      }

      setAdminApiOffline(true);
      toast.error("VIP settings service is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadPageState();
  }, []);

  const saveTier = async () => {
    if (!editingTier) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    setSavingTierId(editingTier.id);
    try {
      const minDeposit = parseDecimalInput(editingTier.minDeposit);
      const dailyProfitCap = parseOptionalDecimalInput(editingTier.dailyProfitCap);
      const dailyRoiMinPercent = parseDecimalInput(editingTier.dailyRoiMinPercent);
      const dailyRoiMaxPercent = parseDecimalInput(editingTier.dailyRoiMaxPercent);

      if (
        !Number.isFinite(minDeposit) ||
        !Number.isFinite(dailyRoiMinPercent) ||
        !Number.isFinite(dailyRoiMaxPercent) ||
        (dailyProfitCap !== null && !Number.isFinite(dailyProfitCap))
      ) {
        toast.error("Use valid numbers. Decimal comma is accepted, for example 0,7.");
        return;
      }

      const payload = {
        name: editingTier.name.trim(),
        minDeposit,
        dailyRoiMin: dailyRoiMinPercent / 100,
        dailyRoiMax: dailyRoiMaxPercent / 100,
        dailyProfitCap,
        requiredDirectMembers: Number(editingTier.requiredDirectMembers),
        activationLimitPerDay: Number(editingTier.activationLimitPerDay),
        activationDurationMinutes: Number(editingTier.activationDurationMinutes)
      };
      const response = editingTier.isNew
        ? await adminApi.post<VipTier>("/admin/vip-tiers", payload)
        : await adminApi.patch<VipTier>(`/admin/vip-tiers/${editingTier.id}`, payload);

      setVipTiers((current) =>
        [
          ...current.filter((tier) => tier.id !== response.data.id),
          response.data
        ].sort((left, right) => left.minDeposit - right.minDeposit)
      );
      setEditingTier(null);
      toast.success(`VIP ${response.data.id} ${editingTier.isNew ? "created" : "saved"}.`);
    } catch (error) {
      if (isApiAuthError(error)) {
        handleAuthFailure();
        return;
      }

      toast.error(getApiErrorMessage(error, "Could not save VIP tier."));
    } finally {
      setSavingTierId(null);
    }
  };

  const deleteTier = async (tierId: number) => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    if (vipTiers.length <= 1) {
      toast.error("At least one VIP tier must remain.");
      return;
    }

    const confirmed = window.confirm(`Delete VIP ${tierId}? This only works if no users or activation history use it.`);
    if (!confirmed) {
      return;
    }

    setDeletingTierId(tierId);
    try {
      await adminApi.delete(`/admin/vip-tiers/${tierId}`);
      setVipTiers((current) => current.filter((tier) => tier.id !== tierId));
      if (editingTier?.id === tierId) {
        setEditingTier(null);
      }
      toast.success(`VIP ${tierId} deleted.`);
    } catch (error) {
      if (isApiAuthError(error)) {
        handleAuthFailure();
        return;
      }

      toast.error(getApiErrorMessage(error, "Could not delete VIP tier."));
    } finally {
      setDeletingTierId(null);
    }
  };

  const toggleAutoDistribution = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    setSavingDistribution(true);
    try {
      const response = await adminApi.patch<ProfitSettings>(
        "/admin/profit-settings",
        {
          autoProfitDistribution: !profitSettings.autoProfitDistribution
        }
      );

      setProfitSettings(response.data);
      toast.success(`Auto distribution ${response.data.autoProfitDistribution ? "enabled" : "disabled"}.`);
    } catch (error) {
      if (isApiAuthError(error)) {
        handleAuthFailure();
        return;
      }

      toast.error("Could not update auto distribution.");
    } finally {
      setSavingDistribution(false);
    }
  };

  const triggerAllUsers = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    setRecalculating(true);
    try {
      const response = await adminApi.post<{ processedUsers: number; updatedUsers: number }>(
        "/admin/profit/recalculate-users",
        {}
      );

      toast.success(`Processed ${response.data.processedUsers} users. Updated ${response.data.updatedUsers}.`);
    } catch (error) {
      if (isApiAuthError(error)) {
        handleAuthFailure();
        return;
      }

      toast.error("Could not recalculate VIP assignments.");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      {editingTier ? (
        <div className="fixed inset-0 z-40 bg-[#020223]/75 backdrop-blur-sm">
          <button
            aria-label="Close tier editor"
            className="absolute inset-0"
            onClick={() => setEditingTier(null)}
            type="button"
          />
          <div className="absolute inset-x-4 top-[12%] mx-auto max-w-2xl rounded-[30px] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(14,19,142,0.98)_0%,rgba(9,11,110,0.99)_45%,rgba(6,8,82,1)_100%)] p-6 shadow-[0_28px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[1.5rem] font-extrabold text-white">
                  {editingTier.isNew ? "Add" : "Edit"} VIP {editingTier.id}
                </div>
                <div className="mt-1 text-sm text-slate-300">
                  {editingTier.isNew ? "Create a new tier above the current highest threshold." : "Update tier thresholds and run settings."}
                </div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
                onClick={() => setEditingTier(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Tier name</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  value={editingTier.name}
                  onChange={(event) => setEditingTier((current) => (current ? { ...current, name: event.target.value } : current))}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Minimum deposit</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={editingTier.minDeposit}
                  onChange={(event) =>
                    setEditingTier((current) => (current ? { ...current, minDeposit: event.target.value } : current))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Min daily ROI %</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={editingTier.dailyRoiMinPercent}
                  onChange={(event) =>
                    setEditingTier((current) => (current ? { ...current, dailyRoiMinPercent: event.target.value } : current))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Max daily ROI %</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={editingTier.dailyRoiMaxPercent}
                  onChange={(event) =>
                    setEditingTier((current) => (current ? { ...current, dailyRoiMaxPercent: event.target.value } : current))
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Daily profit cap at minimum deposit (USDT, 0 = auto)</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  type="number"
                  value={editingTier.dailyProfitCap}
                  onChange={(event) =>
                    setEditingTier((current) => (current ? { ...current, dailyProfitCap: event.target.value } : current))
                  }
                />
                <span className="text-xs leading-5 text-slate-400">
                  {editingCapPreview
                    ? `${formatCurrency(editingCapPreview.dailyProfitCap)} at ${formatCurrency(
                        editingCapPreview.minDeposit
                      )}; ${formatCurrency(editingCapPreview.exampleBalance)} balance caps at ${formatCurrency(
                        editingCapPreview.exampleCap
                      )} per day.`
                    : "0 uses the automatic ROI cap. Any custom cap scales with the user's reservation balance."}
                </span>
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Daily reservations</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  type="number"
                  value={editingTier.activationLimitPerDay}
                  onChange={(event) =>
                    setEditingTier((current) =>
                      current ? { ...current, activationLimitPerDay: event.target.value } : current
                    )
                  }
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Valid direct members</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  type="number"
                  value={editingTier.requiredDirectMembers}
                  onChange={(event) =>
                    setEditingTier((current) =>
                      current ? { ...current, requiredDirectMembers: event.target.value } : current
                    )
                  }
                />
              </label>
              <label className="grid gap-2 md:col-span-2">
                <span className="text-sm text-slate-300">Reservation duration (minutes)</span>
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  type="number"
                  value={editingTier.activationDurationMinutes}
                  onChange={(event) =>
                    setEditingTier((current) =>
                      current ? { ...current, activationDurationMinutes: event.target.value } : current
                    )
                  }
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-70"
                disabled={savingTierId === editingTier.id}
                onClick={() => void saveTier()}
                type="button"
              >
                {savingTierId === editingTier.id ? "Saving..." : editingTier.isNew ? "Create tier" : "Save tier"}
              </button>
              <button
                className="rounded-2xl border border-white/10 px-5 py-3 font-semibold text-white"
                onClick={() => setEditingTier(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6">
        <SectionCard
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100"
                disabled={loading}
                onClick={() => setEditingTier(createTierEditorState(vipTiers))}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Add VIP
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
                disabled={loading}
                onClick={() => void loadPageState()}
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          }
          title="VIP & Profit Settings"
          subtitle="Tier thresholds and automated distribution controls."
        >
          {adminApiOffline ? (
            <div className="mb-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
              Live VIP settings are unavailable right now.
            </div>
          ) : null}

          <div className="space-y-3">
            {vipTiers.length ? (
              vipTiers.map((tier) => (
                <div key={tier.id} className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:grid-cols-5">
                  <div>
                    <div className="text-sm text-slate-400">Tier</div>
                    <div className="font-semibold text-white">{tier.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-400">Min deposit</div>
                    <div className="font-semibold text-white">{formatCurrency(tier.minDeposit)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-400">Valid direct members</div>
                    <div className="font-semibold text-white">{tier.requiredDirectMembers}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-400">Daily ROI</div>
                    <div className="font-semibold text-emerald-300">
                      {formatPercent(tier.dailyRoiMin)} - {formatPercent(tier.dailyRoiMax)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {tier.activationLimitPerDay} runs/day · {tier.activationDurationMinutes} min
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Daily cap: {formatDailyProfitCap(tier)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end justify-start gap-2 md:justify-end">
                    <button
                      className="rounded-2xl border border-white/10 px-4 py-2 text-white"
                      onClick={() => setEditingTier(toEditorState(tier))}
                      type="button"
                    >
                      Edit Tier
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-2 text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-50"
                      disabled={vipTiers.length <= 1 || deletingTierId === tier.id}
                      onClick={() => void deleteTier(tier.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deletingTierId === tier.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                {loading ? "Loading VIP tiers..." : "No VIP tiers available."}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-70"
              disabled={recalculating || loading}
              onClick={() => void triggerAllUsers()}
              type="button"
            >
              {recalculating ? "Processing..." : "Trigger All Users"}
            </button>
            <button
              className="rounded-2xl border border-white/10 px-4 py-3 text-white disabled:opacity-70"
              disabled={savingDistribution || loading}
              onClick={() => void toggleAutoDistribution()}
              type="button"
            >
              {savingDistribution
                ? "Saving..."
                : `${profitSettings.autoProfitDistribution ? "Disable" : "Enable"} Auto Distribution`}
            </button>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
