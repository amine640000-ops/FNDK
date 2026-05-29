import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, ChevronDown, Clock3, HandCoins, KeyRound, MailCheck, X } from "lucide-react";
import type { AssetType, WalletSummary } from "@nevo/shared-types";
import { SUPPORTED_ASSETS, formatCurrency } from "@nevo/shared-utils";
import { getApiErrorMessage, walletApi } from "@/api/client";
import { MobilePageHeader } from "@/components/mobile-page-header";
import { getAccessToken } from "@/lib/auth";
import { translateText, useAppLanguage } from "@/lib/i18n";

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
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [asset, setAsset] = useState<AssetType>("USD");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);
  const [sendingVerificationCode, setSendingVerificationCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawalResponse, setWithdrawalResponse] = useState<WithdrawalResponse | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoadingSummary(false);
      return;
    }

    walletApi
      .get<WalletSummary>("/wallet/summary")
      .then((response) => {
        setSummary(response.data);
        const firstAssetWithBalance = response.data.assets.find((walletAsset) => walletAsset.balance > 0)?.asset;
        if (firstAssetWithBalance) {
          setAsset(firstAssetWithBalance);
        }
      })
      .catch(() => toast.error(tt("Could not load wallet balances.")))
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

  const validateWithdrawalForm = () => {
    const token = getAccessToken();
    if (!token) {
      toast.error(tt("Sign in first."));
      return null;
    }

    if (!parsedAmount || parsedAmount < 1) {
      toast.error(tt("Enter a withdrawal amount of at least 1."));
      return null;
    }

    if (!destinationAddress.trim()) {
      toast.error(tt("Enter a destination address."));
      return null;
    }

    return token;
  };

  const requestWithdrawalCode = async () => {
    const token = validateWithdrawalForm();
    if (!token) {
      return;
    }

    setSendingVerificationCode(true);
    try {
      const response = await walletApi.post<{ message: string; emailVerificationSent: boolean; expiresInMinutes: number }>(
        "/wallet/withdrawals/verification-code",
        {
          asset,
          amount: parsedAmount,
          destinationAddress: destinationAddress.trim()
        }
      );

      setVerificationCodeSent(response.data.emailVerificationSent);
      toast.success(response.data.emailVerificationSent ? tt("Verification code sent to your email.") : response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not send withdrawal code.")));
    } finally {
      setSendingVerificationCode(false);
    }
  };

  const submitWithdrawal = async () => {
    const token = validateWithdrawalForm();
    if (!token) {
      return;
    }

    if (verificationCode.trim().length < 4) {
      toast.error(tt("Enter the email verification code."));
      return;
    }

    if (!/^\d{6}$/.test(securityPasscode)) {
      toast.error(tt("Enter your 6-digit security passcode."));
      return;
    }

    setSubmitting(true);
    try {
      const response = await walletApi.post<WithdrawalResponse>(
        "/wallet/withdrawals",
        {
          asset,
          amount: parsedAmount,
          destinationAddress: destinationAddress.trim(),
          verificationCode: verificationCode.trim(),
          securityPasscode
        }
      );

      setWithdrawalResponse(response.data);
      setVerificationCode("");
      setSecurityPasscode("");
      setVerificationCodeSent(false);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, tt("Could not submit withdrawal.")));
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
                <div className="text-[1.35rem] font-extrabold text-white">{tt("Choose asset")}</div>
                <div className="mt-1 text-sm text-slate-300">{tt("Select the balance you want to withdraw from.")}</div>
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
                    setVerificationCode("");
                    setVerificationCodeSent(false);
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
              <div className="text-[1.15rem] font-bold text-white">{tt("Create a withdrawal request")}</div>
              <div className="mt-1 text-[13px] leading-5 text-slate-300">
                {tt("Withdrawals carry a fixed 5% fee and enter a 72-hour hold before admin approval is allowed.")}
              </div>
            </div>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">{tt("Asset")}</span>
            <button
              className="fndk-app-input flex items-center justify-between text-left disabled:opacity-60"
              disabled={loadingSummary}
              onClick={() => setAssetPickerOpen(true)}
              type="button"
            >
              <span>{assetLabels[asset]}</span>
              <ChevronDown className="h-5 w-5 text-white/70" />
            </button>
          </label>

          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-slate-300">
            {tt("Available balance")} {asset}: <span className="font-semibold text-white">{formatCurrency(selectedAssetBalance)}</span>
          </div>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">{tt("Amount")}</span>
            <input
              className="fndk-app-input"
              inputMode="decimal"
              min="1"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setVerificationCode("");
                setVerificationCodeSent(false);
              }}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">{tt("Destination address")}</span>
            <textarea
              className="fndk-app-input min-h-28 resize-none"
              placeholder={tt("Wallet address, IBAN, or payout destination")}
              value={destinationAddress}
              onChange={(event) => {
                setDestinationAddress(event.target.value);
                setVerificationCode("");
                setVerificationCodeSent(false);
              }}
            />
          </label>

          <div className="grid gap-3">
            <div className="flex items-center gap-3 rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-[13px] leading-5 text-cyan-100">
              <MailCheck className="h-4 w-4 shrink-0" />
              <span>{tt("Send a verification code to your account email before submitting this withdrawal.")}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="fndk-app-input text-center text-[18px] tracking-[0.28em]"
                inputMode="numeric"
                maxLength={8}
                placeholder="000000"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              />
              <button
                className="rounded-[20px] border border-cyan-300/30 bg-white/5 px-4 py-4 text-[14px] font-semibold text-cyan-100 disabled:opacity-60"
                disabled={sendingVerificationCode || submitting}
                onClick={() => void requestWithdrawalCode()}
                type="button"
              >
                {sendingVerificationCode ? tt("Sending...") : verificationCodeSent ? tt("Resend code") : tt("Send Code")}
              </button>
            </div>
          </div>

          <label className="grid gap-2">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <KeyRound className="h-4 w-4 text-cyan-200" />
              {tt("Security passcode")}
            </span>
            <input
              className="fndk-app-input text-center text-[18px] tracking-[0.28em]"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              type="password"
              value={securityPasscode}
              onChange={(event) => setSecurityPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm text-slate-400">{tt("Fee (5%)")}</div>
              <div className="mt-2 text-[1.2rem] font-bold text-white">{formatCurrency(feeAmount)}</div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
              <div className="text-sm text-slate-400">{tt("Net payout")}</div>
              <div className="mt-2 text-[1.2rem] font-bold text-cyan-300">{formatCurrency(netAmount > 0 ? netAmount : 0)}</div>
            </div>
          </div>

          <button
            className="fndk-primary-action disabled:opacity-60"
            disabled={submitting || loadingSummary}
            onClick={submitWithdrawal}
            type="button"
          >
            {submitting ? tt("Submitting...") : tt("Submit withdrawal")}
          </button>
        </section>

        {withdrawalResponse ? (
          <section className="neon-panel mt-5 p-5">
            <div className="flex items-center gap-2 text-cyan-200">
              <Clock3 className="h-4 w-4" />
              <span className="text-sm uppercase tracking-[0.22em]">{tt("Withdrawal queued")}</span>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-[13px] leading-6 text-slate-300">
                <div>{tt("Request ID")}: <span className="font-medium text-white">{withdrawalResponse.id}</span></div>
                <div className="mt-1">{tt("Gross amount")}: <span className="font-medium text-white">{formatCurrency(withdrawalResponse.amount)}</span></div>
                <div className="mt-1">{tt("Fee")}: <span className="font-medium text-white">{formatCurrency(withdrawalResponse.feeAmount)}</span></div>
                <div className="mt-1">{tt("Net payout")}: <span className="font-medium text-cyan-100">{formatCurrency(withdrawalResponse.netAmount)}</span></div>
                <div className="mt-1">{tt("Admin release after")}: <span className="font-medium text-white">{new Date(withdrawalResponse.releaseAt).toLocaleString(language === "ar" ? "ar-TN" : "en-GB")}</span></div>
                <div className="mt-1">{tt("Monthly usage")}: <span className="font-medium text-white">{withdrawalResponse.monthlyUsed}/{withdrawalResponse.monthlyLimit}</span></div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
