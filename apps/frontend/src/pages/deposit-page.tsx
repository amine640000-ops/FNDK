import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, CheckCircle2, ChevronDown, Copy, Landmark, X } from "lucide-react";
import { useEffect } from "react";
import type { AssetRouteSetting, AssetType } from "@nevo/shared-types";
import { DEFAULT_ASSET_LABELS, DEFAULT_ASSET_ROUTE_SETTINGS, formatCurrency } from "@nevo/shared-utils";
import { getApiErrorMessage, walletApi } from "@/api/client";
import { MobilePageHeader } from "@/components/mobile-page-header";
import { getAccessToken } from "@/lib/auth";

type DepositResponse = {
  id: string;
  type: "deposit";
  asset: AssetType;
  amount: number;
  status: "pending";
  walletAddress: string;
  message: string;
};

export function DepositPage() {
  const [asset, setAsset] = useState<AssetType>("USDT_TRC20");
  const [amount, setAmount] = useState("100");
  const [submitting, setSubmitting] = useState(false);
  const [depositResponse, setDepositResponse] = useState<DepositResponse | null>(null);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetRoutesLoaded, setAssetRoutesLoaded] = useState(false);
  const [assetSettings, setAssetSettings] = useState<AssetRouteSetting[]>([]);

  const parsedAmount = useMemo(() => Number(amount || 0), [amount]);
  const selectableAssetSettings = useMemo(
    () => (assetRoutesLoaded ? assetSettings : DEFAULT_ASSET_ROUTE_SETTINGS),
    [assetRoutesLoaded, assetSettings]
  );
  const selectedAssetSetting = useMemo(
    () => selectableAssetSettings.find((assetSetting) => assetSetting.asset === asset),
    [asset, selectableAssetSettings]
  );
  const selectedAssetLabel = selectedAssetSetting?.label ?? DEFAULT_ASSET_LABELS[asset];
  const selectedWalletAddress = depositResponse?.walletAddress ?? selectedAssetSetting?.address ?? "";

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;

    const loadDepositAssets = async () => {
      try {
        const response = await walletApi.get<AssetRouteSetting[]>("/wallet/deposit-assets");

        if (active) {
          setAssetSettings(response.data);
          setAssetRoutesLoaded(true);
          setAsset((currentAsset) =>
            response.data.some((assetSetting) => assetSetting.asset === currentAsset)
              ? currentAsset
              : response.data[0]?.asset ?? currentAsset
          );
        }
      } catch {
        if (active) {
          setAssetSettings([]);
          setAssetRoutesLoaded(true);
        }
      }
    };

    void loadDepositAssets();

    return () => {
      active = false;
    };
  }, []);

  const submitDeposit = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!parsedAmount || parsedAmount < 1) {
      toast.error("Enter a deposit amount of at least 1.");
      return;
    }

    if (!selectedAssetSetting) {
      toast.error("No active deposit asset is available.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await walletApi.post<DepositResponse>(
        "/wallet/deposits",
        {
          asset,
          amount: parsedAmount
        }
      );

      setDepositResponse(response.data);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not submit deposit."));
    } finally {
      setSubmitting(false);
    }
  };

  const copyWalletAddress = async () => {
    if (!selectedWalletAddress) {
      return;
    }

    await navigator.clipboard.writeText(selectedWalletAddress);
    toast.success("Wallet address copied.");
  };

  return (
    <div className="pb-6">
      <MobilePageHeader title="Deposit" subtitle="fund your account" />

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
                <div className="mt-1 text-sm text-slate-300">Select the destination funding network.</div>
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
              {selectableAssetSettings.length ? selectableAssetSettings.map((assetSetting) => (
                <button
                  key={assetSetting.asset}
                  className={`flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left transition ${
                    asset === assetSetting.asset
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/5 text-white"
                  }`}
                  onClick={() => {
                    setAsset(assetSetting.asset);
                    setAssetPickerOpen(false);
                  }}
                  type="button"
                >
                  <span className="text-[15px] font-semibold">{assetSetting.label}</span>
                  {asset === assetSetting.asset ? <Check className="h-5 w-5" /> : null}
                </button>
              )) : (
                <div className="rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-100">
                  No deposit assets are enabled by admin.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-5">
        <section className="neon-panel p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[1.15rem] font-bold text-white">Create a deposit request</div>
              <div className="mt-1 text-[13px] leading-5 text-slate-300">
                Choose the asset and amount. The destination wallet address will be returned after submission.
              </div>
            </div>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Asset</span>
            <button
              className="fndk-app-input flex items-center justify-between text-left"
              onClick={() => setAssetPickerOpen(true)}
              type="button"
            >
              <span>{selectedAssetLabel}</span>
              <ChevronDown className="h-5 w-5 text-white/70" />
            </button>
          </label>

          <label className="grid gap-2">
            <span className="text-sm text-slate-300">Amount</span>
            <input
              className="fndk-app-input"
              inputMode="decimal"
              min="1"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-[13px] leading-5 text-cyan-100">
            Request total: {formatCurrency(parsedAmount || 0)}. The destination wallet address will be returned after submission.
          </div>

          {selectedWalletAddress ? (
            <div className="rounded-[20px] border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Funding address</div>
              <div className="mt-2 break-all text-[15px] font-semibold text-white">{selectedWalletAddress}</div>
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100"
                onClick={() => void copyWalletAddress()}
                type="button"
              >
                <Copy className="h-4 w-4" />
                Copy address
              </button>
            </div>
          ) : null}

          <button
            className="fndk-primary-action disabled:opacity-60"
            disabled={submitting || !selectedAssetSetting}
            onClick={submitDeposit}
            type="button"
          >
            {submitting ? "Submitting..." : "Submit deposit"}
          </button>
        </section>

        {depositResponse ? (
          <section className="neon-panel mt-5 p-5">
            <div className="flex items-center gap-2 text-cyan-200">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm uppercase tracking-[0.22em]">Deposit request created</span>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-slate-400">Wallet address</div>
              <div className="mt-2 break-all text-[15px] font-semibold text-white">{selectedWalletAddress}</div>
              <button
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100"
                onClick={() => void copyWalletAddress()}
                type="button"
              >
                <Copy className="h-4 w-4" />
                Copy address
              </button>
            </div>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-white/5 p-4 text-[13px] leading-6 text-slate-300">
              <div>Transaction ID: <span className="font-medium text-white">{depositResponse.id}</span></div>
              <div className="mt-1">Status: <span className="font-medium uppercase text-cyan-100">{depositResponse.status}</span></div>
              <div className="mt-1">{depositResponse.message}</div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
