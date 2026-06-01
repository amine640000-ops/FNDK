import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  CreditCard,
  MailCheck,
  ShieldCheck,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AssetType, WalletSummary } from "@nevo/shared-types";
import { SUPPORTED_ASSETS, formatCurrency } from "@nevo/shared-utils";
import { getApiErrorMessage, walletApi } from "@/api/client";
import { getAccessToken } from "@/lib/auth";
import { useAppLanguage } from "@/lib/i18n";

const emptySummary: WalletSummary = {
  totalBalance: 0,
  activeInvestment: 0,
  availableToWithdraw: 0,
  totalEarned: 0,
  assets: []
};

const currencyLabels: Record<AssetType, string> = {
  BTC: "BTC",
  ETH: "ETH",
  USDT_TRC20: "USDT",
  USDT_ERC20: "USDT",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  STOCKS: "STOCKS"
};

const networkLabels: Record<AssetType, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT_TRC20: "TRON(TRC20)",
  USDT_ERC20: "Ethereum(ERC20)",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  STOCKS: "STOCKS"
};

const cryptoIconUrls: Partial<Record<AssetType, string>> = {
  BTC: "/crypto/btc.svg",
  ETH: "/crypto/eth.svg",
  USDT_TRC20: "/crypto/usdt.svg",
  USDT_ERC20: "/crypto/usdt.svg"
};

const networkIconUrls: Partial<Record<AssetType, string>> = {
  BTC: "/crypto/btc.svg",
  ETH: "/crypto/eth.svg",
  USDT_TRC20: "/crypto/trx.svg",
  USDT_ERC20: "/crypto/eth.svg"
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

type WithdrawalSettings = {
  asset: AssetType;
  label: string;
  address: string;
};

type PickerMode = "asset" | "network" | null;

const readWithdrawalSettings = (): WithdrawalSettings | null => {
  try {
    const saved = localStorage.getItem("nevo.withdrawalAddress");
    if (!saved) {
      return null;
    }

    if (saved.trim().startsWith("{")) {
      return JSON.parse(saved) as WithdrawalSettings;
    }

    return { asset: "USDT_TRC20", label: "Default payout wallet", address: saved };
  } catch {
    return null;
  }
};

const uniqueAssetsByCurrency = (assets: readonly AssetType[]) => {
  const seen = new Set<string>();

  return assets.filter((asset) => {
    const label = currencyLabels[asset];
    if (seen.has(label)) {
      return false;
    }

    seen.add(label);
    return true;
  });
};

function TokenMark({ asset, size = "md" }: { asset: AssetType; size?: "sm" | "md" }) {
  const isUsdt = asset === "USDT_TRC20" || asset === "USDT_ERC20";
  const iconUrl = cryptoIconUrls[asset];
  const className = `withdraw-token-mark ${size === "sm" ? "withdraw-token-mark-sm" : ""} ${
    iconUrl ? "withdraw-token-image-shell" : isUsdt ? "withdraw-token-usdt" : ""
  }`;

  if (iconUrl) {
    return (
      <span className={className} aria-hidden="true">
        <img className="withdraw-token-image" src={iconUrl} alt="" />
      </span>
    );
  }

  if (isUsdt) {
    return (
      <span className={className} aria-hidden="true">
        T
      </span>
    );
  }

  return (
    <span className="withdraw-token-mark withdraw-token-generic" aria-hidden="true">
      {currencyLabels[asset].slice(0, 1)}
    </span>
  );
}

function NetworkMark({ asset }: { asset: AssetType }) {
  const iconUrl = networkIconUrls[asset];

  if (iconUrl) {
    return (
      <span className="withdraw-token-mark withdraw-token-image-shell" aria-hidden="true">
        <img className="withdraw-token-image" src={iconUrl} alt="" />
      </span>
    );
  }

  return <TokenMark asset={asset} />;
}

export function WithdrawPage() {
  const navigate = useNavigate();
  const language = useAppLanguage();
  const savedWithdrawalSettings = useMemo(() => readWithdrawalSettings(), []);
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [asset, setAsset] = useState<AssetType>(savedWithdrawalSettings?.asset ?? "USDT_TRC20");
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState(savedWithdrawalSettings?.address ?? "");
  const [verificationCode, setVerificationCode] = useState("");
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [verificationCodeSent, setVerificationCodeSent] = useState(false);
  const [sendingVerificationCode, setSendingVerificationCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawalResponse, setWithdrawalResponse] = useState<WithdrawalResponse | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setLoadingSummary(false);
      return;
    }

    walletApi
      .get<WalletSummary>("/wallet/summary")
      .then((response) => setSummary(response.data))
      .catch(() => setSummary(emptySummary))
      .finally(() => setLoadingSummary(false));
  }, []);

  const parsedAmount = useMemo(() => Number(amount || 0), [amount]);
  const feeAmount = useMemo(() => Number((parsedAmount * 0.05).toFixed(2)), [parsedAmount]);
  const netAmount = useMemo(() => Number((parsedAmount - feeAmount).toFixed(2)), [parsedAmount, feeAmount]);
  const selectableAssets = useMemo(
    () => (summary.assets.length ? summary.assets.map((walletAsset) => walletAsset.asset) : [...SUPPORTED_ASSETS]),
    [summary.assets]
  );
  const currencyOptions = useMemo(() => uniqueAssetsByCurrency(selectableAssets), [selectableAssets]);
  const networkOptions = useMemo(() => {
    if (currencyLabels[asset] === "USDT") {
      const usdtAssets = selectableAssets.filter((selectableAsset) => currencyLabels[selectableAsset] === "USDT");
      return usdtAssets.length ? usdtAssets : (["USDT_TRC20", "USDT_ERC20"] as AssetType[]);
    }

    return [asset];
  }, [asset, selectableAssets]);
  const selectedAssetBalance = useMemo(
    () => summary.assets.find((walletAsset) => walletAsset.asset === asset)?.balance ?? 0,
    [asset, summary.assets]
  );
  const selectedCurrencyLabel = currencyLabels[asset];
  const confirmDisabled = loadingSummary || sendingVerificationCode || submitting || parsedAmount < 1;

  const resetVerification = () => {
    setVerificationCode("");
    setSecurityPasscode("");
    setVerificationCodeSent(false);
  };

  const validateWithdrawalForm = () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Connectez-vous d'abord.");
      return null;
    }

    if (!parsedAmount || parsedAmount < 1) {
      toast.error("Entrez un montant de retrait d'au moins 1.");
      return null;
    }

    if (!destinationAddress.trim()) {
      toast.error("Entrez une adresse de retrait.");
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
      setVerificationOpen(true);
      toast.success(response.data.emailVerificationSent ? "Code de vérification envoyé par e-mail." : response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Impossible d'envoyer le code de retrait."));
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
      toast.error("Entrez le code de vérification e-mail.");
      return;
    }

    if (!/^\d{6}$/.test(securityPasscode)) {
      toast.error("Entrez votre code de sécurité à 6 chiffres.");
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
      setAmount("");
      resetVerification();
      setVerificationOpen(false);
      toast.success(response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Impossible de soumettre le retrait."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="withdraw-reference-page">
      <header className="withdraw-reference-header">
        <button className="withdraw-header-icon" aria-label="Retour" onClick={() => navigate(-1)} type="button">
          <ChevronLeft />
        </button>
        <div className="withdraw-header-title">Retirer</div>
        <button
          className="withdraw-header-icon withdraw-header-card"
          aria-label="Adresse de retrait"
          onClick={() => navigate("/app/settings/withdrawal-address")}
          type="button"
        >
          <CreditCard />
          <span />
        </button>
      </header>

      <main className="withdraw-reference-content">
        <section className="withdraw-field-block">
          <div className="withdraw-label">Devise D'arrivée</div>
          <button className="withdraw-select" onClick={() => setPickerMode("asset")} type="button">
            <span className="withdraw-select-left">
              <TokenMark asset={asset} />
              <span>{selectedCurrencyLabel}</span>
            </span>
            <ChevronDown className="withdraw-chevron" />
          </button>
        </section>

        <section className="withdraw-field-block withdraw-network-block">
          <div className="withdraw-label">Réseau</div>
          <button className="withdraw-select" onClick={() => setPickerMode("network")} type="button">
            <span className="withdraw-select-left">
              <NetworkMark asset={asset} />
              <span>{networkLabels[asset]}</span>
            </span>
            <ChevronDown className="withdraw-chevron" />
          </button>
        </section>

        <section className="withdraw-amount-section">
          <label className="withdraw-label withdraw-amount-label" htmlFor="withdraw-amount">
            Montant D'arrivée
          </label>
          <div className="withdraw-amount-shell">
            <input
              id="withdraw-amount"
              inputMode="decimal"
              min="1"
              step="0.01"
              type="text"
              value={amount}
              placeholder="0"
              onChange={(event) => {
                setAmount(event.target.value.replace(/[^\d.]/g, ""));
                resetVerification();
              }}
            />
            <span>{selectedCurrencyLabel}</span>
          </div>
        </section>

        <p className="withdraw-warning">
          Veuillez Confirmer Que L'adresse De Portefeuille Que Vous Avez Remplie Prend En Charge Les Transferts De Réseau TRC20 Ou BEP20.
          Utiliser D'autres Réseaux Peut Entraîner Des Fonds Non Arrivés.
        </p>

        <section className="withdraw-address-section">
          <div className="withdraw-label withdraw-label-sm">Adresse De Retrait</div>
          <div className="withdraw-address-shell">
            <input
              className="withdraw-address-input"
              value={destinationAddress}
              onChange={(event) => {
                setDestinationAddress(event.target.value);
                resetVerification();
              }}
            />
          </div>
        </section>

        <button
          className="withdraw-confirm-button"
          disabled={confirmDisabled}
          onClick={() => void requestWithdrawalCode()}
          type="button"
        >
          {sendingVerificationCode ? "Envoi..." : "Confirmer"}
        </button>

        {withdrawalResponse ? (
          <section className="withdraw-result-card">
            <div className="withdraw-result-title">
              <Clock3 />
              <span>Retrait en attente</span>
            </div>
            <div>ID: {withdrawalResponse.id}</div>
            <div>Montant net: {formatCurrency(withdrawalResponse.netAmount)}</div>
            <div>
              Libération: {new Date(withdrawalResponse.releaseAt).toLocaleString(language === "ar" ? "ar-TN" : "fr-FR")}
            </div>
          </section>
        ) : null}

        <section className="withdraw-instructions">
          <h2>Indication De Retrait</h2>
          <ol>
            <li>
              Veuillez Ne Pas Envoyer De USDT D'autres Réseaux Que TRC20 À L'adresse Ci-Dessus, Sinon Les Actifs Ne Pourront Pas
              Être Récupérés.
            </li>
            <li>
              Après Avoir Effectué Un Dépôt À L'adresse Ci-Dessus, Une Confirmation De L'ensemble Des Nœuds Du Réseau Est Nécessaire,
              Et Les Fonds Seront Crédités Après La Confirmation Du Réseau.
            </li>
          </ol>
        </section>
      </main>

      {pickerMode ? (
        <div className="withdraw-sheet-backdrop">
          <button className="withdraw-sheet-dismiss" aria-label="Fermer" onClick={() => setPickerMode(null)} type="button" />
          <section className="withdraw-picker-sheet">
            <div className="withdraw-sheet-header">
              <div>
                <h2>{pickerMode === "asset" ? "Choisir devise" : "Choisir réseau"}</h2>
                <p>{pickerMode === "asset" ? "Sélectionnez la devise de retrait." : "Sélectionnez le réseau compatible."}</p>
              </div>
              <button aria-label="Fermer" onClick={() => setPickerMode(null)} type="button">
                <X />
              </button>
            </div>
            <div className="withdraw-picker-list">
              {(pickerMode === "asset" ? currencyOptions : networkOptions).map((optionAsset) => {
                const isSelected =
                  pickerMode === "asset" ? currencyLabels[optionAsset] === selectedCurrencyLabel : optionAsset === asset;

                return (
                  <button
                    className={isSelected ? "is-selected" : ""}
                    key={`${pickerMode}-${optionAsset}`}
                    onClick={() => {
                      if (pickerMode === "asset") {
                        const nextCurrencyLabel = currencyLabels[optionAsset];
                        const preferredAsset =
                          nextCurrencyLabel === "USDT"
                            ? selectableAssets.find((selectableAsset) => selectableAsset === "USDT_TRC20") ?? optionAsset
                            : optionAsset;
                        setAsset(preferredAsset);
                      } else {
                        setAsset(optionAsset);
                      }

                      resetVerification();
                      setPickerMode(null);
                    }}
                    type="button"
                  >
                    <span className="withdraw-select-left">
                      {pickerMode === "asset" ? <TokenMark asset={optionAsset} /> : <NetworkMark asset={optionAsset} />}
                      <span>{pickerMode === "asset" ? currencyLabels[optionAsset] : networkLabels[optionAsset]}</span>
                    </span>
                    {isSelected ? <Check /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {verificationOpen ? (
        <div className="withdraw-sheet-backdrop">
          <button className="withdraw-sheet-dismiss" aria-label="Fermer" onClick={() => setVerificationOpen(false)} type="button" />
          <section className="withdraw-verification-sheet">
            <div className="withdraw-sheet-header">
              <div>
                <h2>Vérification</h2>
                <p>Confirmez le code e-mail et votre code de sécurité.</p>
              </div>
              <button aria-label="Fermer" onClick={() => setVerificationOpen(false)} type="button">
                <X />
              </button>
            </div>

            <div className="withdraw-verification-summary">
              <div>
                <span>Solde</span>
                <strong>{formatCurrency(selectedAssetBalance)}</strong>
              </div>
              <div>
                <span>Frais 5%</span>
                <strong>{formatCurrency(feeAmount)}</strong>
              </div>
              <div>
                <span>Net</span>
                <strong>{formatCurrency(netAmount > 0 ? netAmount : 0)}</strong>
              </div>
            </div>

            <label className="withdraw-verification-label">
              <span>
                <MailCheck />
                Code e-mail
              </span>
              <input
                inputMode="numeric"
                maxLength={8}
                placeholder="000000"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              />
            </label>

            <label className="withdraw-verification-label">
              <span>
                <ShieldCheck />
                Code de sécurité
              </span>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                type="password"
                value={securityPasscode}
                onChange={(event) => setSecurityPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>

            <div className="withdraw-verification-actions">
              <button disabled={sendingVerificationCode || submitting} onClick={() => void requestWithdrawalCode()} type="button">
                {verificationCodeSent ? "Renvoyer" : "Envoyer"}
              </button>
              <button disabled={submitting} onClick={() => void submitWithdrawal()} type="button">
                {submitting ? "Validation..." : "Valider"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
