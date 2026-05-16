import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Check, ChevronDown, Clock3, HandCoins, X } from "lucide-react";
import type { AssetType, WalletSummary } from "@nevo/shared-types";
import { SUPPORTED_ASSETS, formatCurrency } from "@nevo/shared-utils";
import { MobilePageHeader } from "@/components/mobile-page-header";

const walletApi = axios.create({
  baseURL: import.meta.env.VITE_WALLET_API_URL ?? "http://localhost:4002/api"
});

const emptySummary: WalletSummary = {
  totalBalance: 0,
  activeInvestment: 0,
  availableToWithdraw: 0,
  totalEarned: 0,
  assets: []
};

const assetLabels: Record<AssetType, string> = {
  BTC: "BTC",
  ETH: "ETH",
  USDT_TRC20: "USDT (TRC20)",
  USDT_ERC20: "USDT (ERC20)",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  STOCKS: "STOCKS"
};

type WithdrawalResponse = {
  id: string;
  type: "withdrawal";
  asset: AssetType;
  amount: number;
  status: "pending";
  destinationAddress: string;
  feeAmount: number;
  netAmount: number;
  releaseAt: string;
  monthlyLimit: number;
  monthlyUsed: number;
  message: string;
};

export function WithdrawPage() {
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [asset, setAsset] = useState<AssetType>("USD");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawalResponse, setWithdrawalResponse] = useState<WithdrawalResponse | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      setLoadingSummary(false);
      return;
    }

    walletApi
      .get<WalletSummary>("/wallet/summary", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((response) => {
        setSummary(response.data);
        const firstAssetWithBalance = response.data.assets.find((walletAsset) => walletAsset.balance > 0)?.asset;
        if (firstAssetWithBalance) {
          setAsset(firstAssetWithBalance);
        }
      })
      .catch(() => toast.error("Could not load wallet balances."))
      .finally(() => setLoadingSummary(false));
  }, []);

  const parsedAmount = useMemo(() => Number(amount || 0), [amount]);
  const feeAmount = useMemo(() => Number((parsedAmount * 0.05).toFixed(2)), [parsedAmount]);
  const netAmount = useMemo(() => Number((parsedAmount - feeAmount).toFixed(2)), [parsedAmount, feeAmount]);
  const selectedAssetBalance = useMemo(
    () => summary.assets.find((walletAsset) => walletAsset.asset === asset)?.balance ?? 0,
    [asset, summary.assets]
  );
  const selectableAssets = useMemo(
    () => (summary.assets.length ? summary.assets.map((walletAsset) => walletAsset.asset) : SUPPORTED_ASSETS),
    [summary.assets]
  );

  const submitWithdrawal = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!parsedAmount || parsedAmount < 1) {
      toast.error("Enter a withdrawal amount of at least 1.");
      return;
    }

    if (!destinationAddress.trim()) {
      toast.error("Enter a destination address.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await walletApi.post<WithdrawalResponse>(
        "/wallet/withdrawals",
        {
          asset,
          amount: parsedAmount,
          destinationAddress: destinationAddress.trim()
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setWithdrawalResponse(response.data);
      toast.success(response.data.message);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseMessage = error.response?.data?.message;
        if (typeof responseMessage === "string") {
          toast.error(responseMessage);
        } else {
          toast.error("Could not submit withdrawal.");
        }
      } else {
        toast.error("Could not submit withdrawal.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-6">
      <MobilePageHeader title="Withdraw" subtitle="request payout" />

      {assetPickerOpen ? (
        <div className="fixed inset-0 z-40 bg-[#020223]/75 backdrop-blur-sm">
          <button
            aria-label="Close asset picker"
            className="absolute inset-0"
            onClick={() => setAssetPickerOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-4 bottom-6 rounded-[30px] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(14,19,142,0.98)_0%,rgba(9,11,110,0.99)_45%,rgba(6,8,82,1)_100%)] p-5 shadow-[0_28px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[1.35rem] font-extrabold text-white">Choose asset</div>
                <div className="mt-1 text-sm text-slate-300">Select the balance you want to withdraw from.</div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white"
                onClick={() => setAssetPickerOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {selectableAssets.map((selectableAsset) => (
                <button
                  key={selectableAsset}
                  className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
                    asset === selectableAsset
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white"
                  }`}
                  onClick={() => {
                    setAsset(selectableAsset);
                    setAssetPickerOpen(false);
                  }}
                  type="button"
                >
                  <span className="text-[15px] font-semibold">{assetLabels[selectableAsset]}</span>
                  {asset === selectableAsset ? <Check className="h-5 w-5" /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-5">
        <section className="neon-panel p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
              <HandCoins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[1.15rem] font-bold text-white">Create a withdrawal request</div>
              <div className="mt-1 text-[13px] leading-5 text-slate-300">
                Withdrawals carry a fixed 5% fee and enter a 72-hour hold before admin approval is allowed.
              </div>
            </div>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Asset</span>
            <button
              className="flex items-center justify-between rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-left text-[15px] text-white outline-none disabled:opacity-60"
              disabled={loadingSummary}
              onClick={() => setAssetPickerOpen(true)}
              type="button"
            >
              <span>{assetLabels[asset]}</span>
              <ChevronDown className="h-5 w-5 text-white/70" />
            </button>
          </label>

          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-slate-300">
            Available balance for {asset}: <span className="font-semibold text-white">{formatCurrency(selectedAssetBalance)}</span>
          </div>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Amount</span>
            <input
              className="rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none"
              inputMode="decimal"
              min="1"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Destination address</span>
            <textarea
              className="min-h-28 rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none"
              placeholder="Wallet address, IBAN, or payout destination"
              value={destinationAddress}
              onChange={(event) => setDestinationAddress(event.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm text-slate-400">Fee (5%)</div>
              <div className="mt-2 text-[1.2rem] font-bold text-white">{formatCurrency(feeAmount)}</div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm text-slate-400">Net payout</div>
              <div className="mt-2 text-[1.2rem] font-bold text-cyan-300">{formatCurrency(netAmount > 0 ? netAmount : 0)}</div>
            </div>
          </div>

          <button
            className="rounded-[20px] bg-cyan-400 px-4 py-4 text-[15px] font-semibold text-slate-950 disabled:opacity-60"
            disabled={submitting || loadingSummary}
            onClick={submitWithdrawal}
            type="button"
          >
            {submitting ? "Submitting..." : "Submit withdrawal"}
          </button>
        </section>

        {withdrawalResponse ? (
          <section className="neon-panel mt-5 p-5">
            <div className="flex items-center gap-2 text-cyan-200">
              <Clock3 className="h-4 w-4" />
              <span className="text-sm uppercase tracking-[0.22em]">Withdrawal queued</span>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-[13px] leading-6 text-slate-300">
                <div>Request ID: <span className="font-medium text-white">{withdrawalResponse.id}</span></div>
                <div className="mt-1">Gross amount: <span className="font-medium text-white">{formatCurrency(withdrawalResponse.amount)}</span></div>
                <div className="mt-1">Fee: <span className="font-medium text-white">{formatCurrency(withdrawalResponse.feeAmount)}</span></div>
                <div className="mt-1">Net payout: <span className="font-medium text-cyan-100">{formatCurrency(withdrawalResponse.netAmount)}</span></div>
                <div className="mt-1">Admin release after: <span className="font-medium text-white">{new Date(withdrawalResponse.releaseAt).toLocaleString("en-GB")}</span></div>
                <div className="mt-1">Monthly usage: <span className="font-medium text-white">{withdrawalResponse.monthlyUsed}/{withdrawalResponse.monthlyLimit}</span></div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
