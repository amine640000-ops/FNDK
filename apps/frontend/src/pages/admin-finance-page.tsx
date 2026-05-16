import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { formatCurrency } from "@nevo/shared-utils";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "@/components/section-card";

const adminApi = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:4006/api"
});

const walletApiBase = import.meta.env.VITE_WALLET_API_URL ?? "http://localhost:4002/api";
const walletUploadsBase = walletApiBase.replace(/\/api\/?$/, "");

type FinanceTransaction = {
  id: string;
  userId: string;
  fullName: string;
  type: "deposit" | "withdrawal";
  asset: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  status: "pending" | "approved" | "rejected";
  proofUrl?: string | null;
  destinationAddress?: string | null;
  releaseAt?: string | null;
  canApprove: boolean;
  adminNote?: string | null;
  createdAt: string;
};

const statusTone: Record<FinanceTransaction["status"], string> = {
  pending: "text-amber-300",
  approved: "text-cyan-300",
  rejected: "text-rose-300"
};

const resolveProofUrl = (proofUrl?: string | null) => {
  if (!proofUrl) {
    return null;
  }

  if (proofUrl.startsWith("http://") || proofUrl.startsWith("https://")) {
    return proofUrl;
  }

  return `${walletUploadsBase}${proofUrl}`;
};

export function AdminFinancePage() {
  const navigate = useNavigate();
  const [deposits, setDeposits] = useState<FinanceTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const pendingCounts = useMemo(
    () => ({
      deposits: deposits.filter((deposit) => deposit.status === "pending").length,
      withdrawals: withdrawals.filter((withdrawal) => withdrawal.status === "pending").length
    }),
    [deposits, withdrawals]
  );

  const loadFinanceState = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const [depositResponse, withdrawalResponse] = await Promise.all([
        adminApi.get<FinanceTransaction[]>("/admin/deposits", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        adminApi.get<FinanceTransaction[]>("/admin/withdrawals", {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setAdminApiOffline(false);
      setDeposits(depositResponse.data);
      setWithdrawals(withdrawalResponse.data);
    } catch (error) {
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
      toast.error("Admin finance service is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadFinanceState();
  }, []);

  const reviewTransaction = async (transactionId: string, action: "approve" | "reject") => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    let adminNote: string | undefined;
    if (action === "reject") {
      const note = window.prompt("Optional rejection note");
      if (note === null) {
        return;
      }

      adminNote = note.trim() || undefined;
    }

    setActionId(transactionId);
    try {
      await adminApi.patch(
        `/admin/transactions/${transactionId}/${action}`,
        adminNote ? { adminNote } : {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(action === "approve" ? "Transaction approved." : "Transaction rejected.");
      await loadFinanceState();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseMessage = error.response?.data?.message;
        if (typeof responseMessage === "string") {
          toast.error(responseMessage);
        } else {
          toast.error(`Could not ${action} transaction.`);
        }
      } else {
        toast.error(`Could not ${action} transaction.`);
      }
    } finally {
      setActionId(null);
    }
  };

  const renderTransactionCard = (transaction: FinanceTransaction) => {
    const proofLink = resolveProofUrl(transaction.proofUrl);
    const holdActive = transaction.type === "withdrawal" && transaction.releaseAt && !transaction.canApprove;

    return (
      <div key={transaction.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-white">{transaction.fullName}</div>
            <div className="mt-1 text-sm text-slate-400">
              {transaction.asset} · {new Date(transaction.createdAt).toLocaleString("en-GB")}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-white">{formatCurrency(transaction.amount)}</div>
            <div className={`mt-1 text-sm font-medium uppercase tracking-[0.18em] ${statusTone[transaction.status]}`}>
              {transaction.status}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-4">
            <span>Transaction ID</span>
            <span className="max-w-[60%] truncate text-right text-white">{transaction.id}</span>
          </div>

          {transaction.type === "deposit" && proofLink ? (
            <div className="flex items-center justify-between gap-4">
              <span>Proof</span>
              <a
                className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                href={proofLink}
                rel="noreferrer"
                target="_blank"
              >
                View upload
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : null}

          {transaction.type === "withdrawal" ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span>Fee</span>
                <span className="text-white">{formatCurrency(transaction.feeAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Net payout</span>
                <span className="text-white">{formatCurrency(transaction.netAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Destination</span>
                <span className="max-w-[60%] truncate text-right text-white">{transaction.destinationAddress ?? "Not provided"}</span>
              </div>
              {transaction.releaseAt ? (
                <div className="flex items-center justify-between gap-4">
                  <span>Hold release</span>
                  <span className={holdActive ? "text-amber-300" : "text-white"}>
                    {new Date(transaction.releaseAt).toLocaleString("en-GB")}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}

          {transaction.adminNote ? (
            <div className="rounded-2xl border border-white/10 bg-[#06083e] px-3 py-3 text-sm text-slate-300">
              Admin note: {transaction.adminNote}
            </div>
          ) : null}
        </div>

        {transaction.status === "pending" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
              disabled={actionId === transaction.id || !transaction.canApprove}
              onClick={() => void reviewTransaction(transaction.id, "approve")}
              type="button"
            >
              {holdActive ? "Waiting for hold" : actionId === transaction.id ? "Working..." : "Approve"}
            </button>
            <button
              className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-60"
              disabled={actionId === transaction.id}
              onClick={() => void reviewTransaction(transaction.id, "reject")}
              type="button"
            >
              {actionId === transaction.id ? "Working..." : "Reject"}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard
        action={
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
            disabled={loading}
            onClick={() => void loadFinanceState()}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        }
        subtitle={`Review proofs and approve or reject incoming capital. Pending: ${pendingCounts.deposits}`}
        title="Deposit Management"
      >
        {adminApiOffline ? (
          <div className="mb-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            Live finance data is unavailable because `admin-service` is not responding on `localhost:4006`.
          </div>
        ) : null}
        {deposits.length ? (
          <div className="space-y-3">{deposits.map((deposit) => renderTransactionCard(deposit))}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            {loading ? "Loading deposit requests..." : "No deposit requests available."}
          </div>
        )}
      </SectionCard>

      <SectionCard
        subtitle={`Match available balance against requested payout. Pending: ${pendingCounts.withdrawals}`}
        title="Withdrawal Management"
      >
        {withdrawals.length ? (
          <div className="space-y-3">{withdrawals.map((withdrawal) => renderTransactionCard(withdrawal))}</div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            {loading ? "Loading withdrawal requests..." : "No withdrawal requests available."}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
