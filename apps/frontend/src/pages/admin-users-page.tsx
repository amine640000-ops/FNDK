import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Ban, CheckCircle2, ExternalLink, HandCoins, RefreshCcw, TrendingUp, WalletCards, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AssetType } from "@nevo/shared-types";
import { formatCurrency } from "@nevo/shared-utils";
import { adminApi, getApiErrorMessage, isApiAuthError, uploadBaseUrls } from "@/api/client";
import { SectionCard } from "@/components/section-card";
import { clearAuthSession, getAccessToken } from "@/lib/auth";

type AdminWallet = {
  asset: AssetType;
  balance: number;
  activeInvestment: number;
};

type AdminUser = {
  id: string;
  publicId: string;
  fullName: string;
  email: string;
  vipTier: string;
  balance: number;
  walletBalance: number;
  activeInvestment: number;
  totalDeposited: number;
  totalGained: number;
  tradingGain: number;
  teamGain: number;
  wallets: AdminWallet[];
  kycStatus: "pending" | "verified" | "rejected";
  isActive: boolean;
  joinDate: string;
};

type KycSubmission = {
  id: string;
  userId: string;
  fullName: string;
  documentType: string | null;
  documentUrl: string;
  selfieUrl: string;
  status: "pending" | "verified" | "rejected";
  adminNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
};

const statusTone: Record<KycSubmission["status"], string> = {
  pending: "text-amber-300",
  verified: "text-cyan-300",
  rejected: "text-rose-300"
};

type BalanceOperation = "add" | "subtract" | "set";
type GainTarget = "trading" | "team";

const balanceOperations: Array<{ value: BalanceOperation; label: string }> = [
  { value: "add", label: "Add funds" },
  { value: "subtract", label: "Subtract funds" },
  { value: "set", label: "Set balance" }
];

const resolveKycUploadUrl = (url: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${uploadBaseUrls.identity}${url}`;
};

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [kycSubmissions, setKycSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [balanceActionId, setBalanceActionId] = useState<string | null>(null);
  const [gainActionId, setGainActionId] = useState<string | null>(null);
  const [statusActionId, setStatusActionId] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState<{
    user: AdminUser;
    operation: BalanceOperation;
    amount: string;
    note: string;
  } | null>(null);
  const [gainForm, setGainForm] = useState<{
    user: AdminUser;
    target: GainTarget;
    operation: BalanceOperation;
    amount: string;
    note: string;
  } | null>(null);
  const loadedRef = useRef(false);

  const pendingKycCount = useMemo(
    () => kycSubmissions.filter((submission) => submission.status === "pending").length,
    [kycSubmissions]
  );
  const selectedBalance = useMemo(() => {
    if (!balanceForm) {
      return 0;
    }

    return balanceForm.user.walletBalance ?? balanceForm.user.balance ?? 0;
  }, [balanceForm]);
  const selectedGain = useMemo(() => {
    if (!gainForm) {
      return 0;
    }

    return gainForm.target === "team" ? gainForm.user.teamGain ?? 0 : gainForm.user.tradingGain ?? 0;
  }, [gainForm]);

  const loadAdminUsersState = async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const [usersResponse, kycResponse] = await Promise.all([
        adminApi.get<AdminUser[]>("/admin/users"),
        adminApi.get<KycSubmission[]>("/admin/kyc")
      ]);

      setAdminApiOffline(false);
      setUsers(usersResponse.data);
      setKycSubmissions(kycResponse.data);
    } catch (error) {
      if (isApiAuthError(error)) {
        clearAuthSession();
        setAdminApiOffline(false);
        toast.error("Your admin session expired. Sign in again.");
        navigate("/login", { replace: true });
        return;
      }

      setAdminApiOffline(true);
      toast.error("Admin users service is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadAdminUsersState();
  }, []);

  const reviewKyc = async (submissionId: string, status: "verified" | "rejected") => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    let adminNote: string | undefined;
    if (status === "rejected") {
      const note = window.prompt("Optional rejection note");
      if (note === null) {
        return;
      }

      adminNote = note.trim() || undefined;
    }

    setActionId(submissionId);
    try {
      await adminApi.patch(
        `/admin/kyc/${submissionId}/review`,
        adminNote ? { status, adminNote } : { status }
      );

      toast.success(status === "verified" ? "KYC approved." : "KYC rejected.");
      await loadAdminUsersState();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not review KYC."));
    } finally {
      setActionId(null);
    }
  };

  const openBalanceManager = (user: AdminUser) => {
    setBalanceForm({
      user,
      operation: "add",
      amount: "",
      note: ""
    });
  };

  const openGainManager = (user: AdminUser, target: GainTarget) => {
    setGainForm({
      user,
      target,
      operation: "add",
      amount: "",
      note: ""
    });
  };

  const submitBalanceAdjustment = async () => {
    if (!balanceForm) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    const amount = Number(balanceForm.amount || 0);
    if (!Number.isFinite(amount) || amount < 0 || (balanceForm.operation !== "set" && amount <= 0)) {
      toast.error("Enter a valid balance amount.");
      return;
    }

    setBalanceActionId(balanceForm.user.id);
    try {
      await adminApi.patch(`/admin/users/${balanceForm.user.id}/balance`, {
        operation: balanceForm.operation,
        amount,
        note: balanceForm.note.trim() || undefined
      });

      toast.success("Account balance updated.");
      setBalanceForm(null);
      await loadAdminUsersState();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update account balance."));
    } finally {
      setBalanceActionId(null);
    }
  };

  const submitGainAdjustment = async () => {
    if (!gainForm) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    const amount = Number(gainForm.amount || 0);
    if (!Number.isFinite(amount) || amount < 0 || (gainForm.operation !== "set" && amount <= 0)) {
      toast.error("Enter a valid gain amount.");
      return;
    }

    const endpoint = gainForm.target === "team" ? "team-gain" : "gain";
    setGainActionId(gainForm.user.id);
    try {
      await adminApi.patch(`/admin/users/${gainForm.user.id}/${endpoint}`, {
        operation: gainForm.operation,
        amount,
        note: gainForm.note.trim() || undefined
      });

      toast.success(gainForm.target === "team" ? "Team gain updated." : "User gain updated.");
      setGainForm(null);
      await loadAdminUsersState();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update gain."));
    } finally {
      setGainActionId(null);
    }
  };

  const toggleUserStatus = async (user: AdminUser) => {
    const nextActive = user.isActive === false;
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    if (!nextActive) {
      const confirmed = window.confirm(`Ban ${user.fullName}? They will not be able to log in or use the app.`);
      if (!confirmed) {
        return;
      }
    }

    setStatusActionId(user.id);
    try {
      await adminApi.patch(`/admin/users/${user.id}/status`, {
        isActive: nextActive
      });

      toast.success(nextActive ? "User access restored." : "User banned from the app.");
      await loadAdminUsersState();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update user access."));
    } finally {
      setStatusActionId(null);
    }
  };

  return (
    <div className="grid gap-6">
      <SectionCard
        action={
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
            disabled={loading}
            onClick={() => void loadAdminUsersState()}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        }
        title="User Management"
        subtitle="Deposits, gains, wallet balances, VIP tier, KYC, and account access."
      >
        {adminApiOffline ? (
          <div className="mb-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            Live users data is unavailable right now.
          </div>
        ) : null}
        <div className="hide-scrollbar overflow-x-auto rounded-[24px]">
          <table className="min-w-[88rem] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">User ID</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">VIP</th>
                <th className="pb-3">Deposited</th>
                <th className="pb-3">User gain</th>
                <th className="pb-3">Team gain</th>
                <th className="pb-3">Wallet now</th>
                <th className="pb-3">KYC</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Joined</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="text-white">
              {users.length ? (
                users.map((user) => {
                  const userIsActive = user.isActive !== false;

                  return (
                  <tr key={user.id} className={`border-t border-white/10 ${userIsActive ? "" : "bg-rose-950/20 text-white/70"}`}>
                    <td className="py-4">{user.fullName}</td>
                    <td className="py-4 font-mono text-cyan-100">{user.publicId}</td>
                    <td className="py-4">{user.email}</td>
                    <td className="py-4">{user.vipTier}</td>
                    <td className="py-4 font-semibold text-cyan-100">{formatCurrency(user.totalDeposited ?? 0)}</td>
                    <td className="py-4 font-semibold text-emerald-200">{formatCurrency(user.tradingGain ?? 0)}</td>
                    <td className="py-4 font-semibold text-cyan-200">{formatCurrency(user.teamGain ?? 0)}</td>
                    <td className="py-4">
                      <div className="font-semibold text-white">{formatCurrency(user.walletBalance ?? user.balance ?? 0)}</div>
                    </td>
                    <td className="py-4 capitalize">{user.kycStatus}</td>
                    <td className="py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          userIsActive
                            ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                            : "border-rose-300/30 bg-rose-400/10 text-rose-100"
                        }`}
                      >
                        {userIsActive ? "Active" : "Banned"}
                      </span>
                    </td>
                    <td className="py-4">{new Date(user.joinDate).toLocaleDateString("en-GB")}</td>
                    <td className="py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-60"
                          disabled={balanceActionId === user.id}
                          onClick={() => openBalanceManager(user)}
                          type="button"
                        >
                          <WalletCards className="h-4 w-4" />
                          Adjust
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/15 disabled:opacity-60"
                          disabled={gainActionId === user.id}
                          onClick={() => openGainManager(user, "trading")}
                          type="button"
                        >
                          <TrendingUp className="h-4 w-4" />
                          Gain
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15 disabled:opacity-60"
                          disabled={gainActionId === user.id}
                          onClick={() => openGainManager(user, "team")}
                          type="button"
                        >
                          <HandCoins className="h-4 w-4" />
                          Team
                        </button>
                        <button
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                            userIsActive
                              ? "border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
                              : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
                          }`}
                          disabled={statusActionId === user.id}
                          onClick={() => void toggleUserStatus(user)}
                          type="button"
                        >
                          {userIsActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          {statusActionId === user.id ? "Saving..." : userIsActive ? "Ban" : "Unban"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              ) : (
                <tr className="border-t border-white/10">
                  <td className="py-6 text-slate-400" colSpan={12}>
                    {loading ? "Loading users..." : "No users loaded."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {balanceForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#070a3f] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Manage Account Balance</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {balanceForm.user.fullName} · {balanceForm.user.publicId}
                </p>
              </div>
              <button
                aria-label="Close balance manager"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200"
                onClick={() => setBalanceForm(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Operation
                <select
                  className="rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                  value={balanceForm.operation}
                  onChange={(event) =>
                    setBalanceForm((current) =>
                      current ? { ...current, operation: event.target.value as BalanceOperation } : current
                    )
                  }
                >
                  {balanceOperations.map((operation) => (
                    <option key={operation.value} value={operation.value}>
                      {operation.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-cyan-200/75">Current total wallet balance</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(selectedBalance)}</div>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-300">
              Amount
              <input
                className="rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                inputMode="decimal"
                min="0"
                placeholder={balanceForm.operation === "set" ? "New balance" : "Adjustment amount"}
                type="text"
                value={balanceForm.amount}
                onChange={(event) =>
                  setBalanceForm((current) =>
                    current ? { ...current, amount: event.target.value.replace(/[^\d.]/g, "") } : current
                  )
                }
              />
            </label>

            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-300">
              Admin note
              <textarea
                className="min-h-24 rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                placeholder="Optional internal audit note."
                value={balanceForm.note}
                onChange={(event) =>
                  setBalanceForm((current) => (current ? { ...current, note: event.target.value } : current))
                }
              />
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200"
                onClick={() => setBalanceForm(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                disabled={balanceActionId === balanceForm.user.id}
                onClick={() => void submitBalanceAdjustment()}
                type="button"
              >
                {balanceActionId === balanceForm.user.id ? "Saving..." : "Save Balance"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {gainForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
          <section className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#070a3f] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Manage {gainForm.target === "team" ? "Team Gain" : "User Gain"}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {gainForm.user.fullName} · {gainForm.user.publicId}
                </p>
              </div>
              <button
                aria-label="Close gain manager"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200"
                onClick={() => setGainForm(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              <label className="grid gap-2 text-sm font-medium text-slate-300">
                Operation
                <select
                  className="rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                  value={gainForm.operation}
                  onChange={(event) =>
                    setGainForm((current) =>
                      current ? { ...current, operation: event.target.value as BalanceOperation } : current
                    )
                  }
                >
                  {balanceOperations.map((operation) => (
                    <option key={operation.value} value={operation.value}>
                      {operation.label.replace("funds", "gain").replace("balance", "gain")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.08] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-200/75">
                Current {gainForm.target === "team" ? "team gain" : "user gain"}
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(selectedGain)}</div>
            </div>

            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-300">
              Amount
              <input
                className="rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                inputMode="decimal"
                min="0"
                placeholder={gainForm.operation === "set" ? "New gain" : "Adjustment amount"}
                type="text"
                value={gainForm.amount}
                onChange={(event) =>
                  setGainForm((current) =>
                    current ? { ...current, amount: event.target.value.replace(/[^\d.]/g, "") } : current
                  )
                }
              />
            </label>

            <label className="mt-4 grid gap-2 text-sm font-medium text-slate-300">
              Admin note
              <textarea
                className="min-h-24 rounded-2xl border border-white/10 bg-[#03062f] px-4 py-3 text-white outline-none focus:border-cyan-300/70"
                placeholder="Optional internal audit note."
                value={gainForm.note}
                onChange={(event) =>
                  setGainForm((current) => (current ? { ...current, note: event.target.value } : current))
                }
              />
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200"
                onClick={() => setGainForm(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                disabled={gainActionId === gainForm.user.id}
                onClick={() => void submitGainAdjustment()}
                type="button"
              >
                {gainActionId === gainForm.user.id ? "Saving..." : "Save Gain"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <SectionCard title="KYC Review" subtitle={`Review uploaded identity files. Pending: ${pendingKycCount}`}>
        {kycSubmissions.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {kycSubmissions.map((submission) => (
              <div key={submission.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">{submission.fullName}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {submission.documentType ?? "government-id"} · {new Date(submission.submittedAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  <div className={`text-sm font-medium uppercase tracking-[0.18em] ${statusTone[submission.status]}`}>
                    {submission.status}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between gap-4">
                    <span>Submission ID</span>
                    <span className="max-w-[60%] truncate text-right text-white">{submission.id}</span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a
                      className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                      href={resolveKycUploadUrl(submission.documentUrl)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View ID document
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <a
                      className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                      href={resolveKycUploadUrl(submission.selfieUrl)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View selfie
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {submission.adminNote ? (
                    <div className="rounded-2xl border border-white/10 bg-[#06083e] px-3 py-3 text-sm text-slate-300">
                      Admin note: {submission.adminNote}
                    </div>
                  ) : null}
                </div>

                {submission.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                      disabled={actionId === submission.id}
                      onClick={() => void reviewKyc(submission.id, "verified")}
                      type="button"
                    >
                      {actionId === submission.id ? "Working..." : "Approve"}
                    </button>
                    <button
                      className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-60"
                      disabled={actionId === submission.id}
                      onClick={() => void reviewKyc(submission.id, "rejected")}
                      type="button"
                    >
                      {actionId === submission.id ? "Working..." : "Reject"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            {loading ? "Loading KYC submissions..." : "No KYC submissions available."}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
