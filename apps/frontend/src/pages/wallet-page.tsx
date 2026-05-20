import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Bell,
  Eye,
  EyeOff,
  Globe,
  Headset,
  ReceiptText
} from "lucide-react";
import type { DashboardTransaction, WalletSummary } from "@nevo/shared-types";
import { formatCurrency } from "@nevo/shared-utils";
import { isApiAuthError, walletApi } from "@/api/client";
import { BrandMark } from "@/components/brand-mark";
import { clearAuthSession, getAccessToken } from "@/lib/auth";
import { Link, useNavigate } from "react-router-dom";

const emptySummary: WalletSummary = {
  totalBalance: 0,
  activeInvestment: 0,
  availableToWithdraw: 0,
  totalEarned: 0,
  assets: []
};

type WalletTab = "assets" | "income";
type LanguageCode = "en" | "fr" | "ar";

const typeLabel: Record<DashboardTransaction["type"], string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  profit: "Trading income",
  referral: "Team income"
};

const maskAmount = (value: string, visible: boolean) => (visible ? value : "••••••");

export function WalletPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletApiOffline, setWalletApiOffline] = useState(false);
  const [walletTab, setWalletTab] = useState<WalletTab>("assets");
  const [amountsVisible, setAmountsVisible] = useState(true);
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem("nevo.language");
    return stored === "fr" || stored === "ar" ? stored : "en";
  });
  const recordsRef = useRef<HTMLDivElement | null>(null);
  const loadedRef = useRef(false);

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

    Promise.all([
      walletApi.get<WalletSummary>("/wallet/summary"),
      walletApi.get<DashboardTransaction[]>("/wallet/transactions")
    ])
      .then(([summaryResponse, transactionsResponse]) => {
        setWalletApiOffline(false);
        setSummary(summaryResponse.data);
        setTransactions(transactionsResponse.data);
      })
      .catch((error) => {
        if (isApiAuthError(error)) {
          clearAuthSession();
          setWalletApiOffline(false);
          toast.error("Your session expired. Sign in again.");
          navigate("/login", { replace: true });
          return;
        }

        setWalletApiOffline(true);
        toast.error("Wallet service is offline. Start the backend service to load live asset data.");
      })
      .finally(() => setLoading(false));
  }, []);

  const pendingWithdrawals = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.type === "withdrawal" && transaction.status === "pending")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [transactions]
  );

  const revenueBreakdown = useMemo(() => {
    const today = new Date().toDateString();
    const tradingTransactions = transactions.filter((transaction) => transaction.type === "profit");
    const teamTransactions = transactions.filter((transaction) => transaction.type === "referral");
    const tradingToday = tradingTransactions
      .filter((transaction) => new Date(transaction.createdAt).toDateString() === today)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const teamToday = teamTransactions
      .filter((transaction) => new Date(transaction.createdAt).toDateString() === today)
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      totalRevenue: summary.totalEarned,
      todayRevenue: Number((tradingToday + teamToday).toFixed(2)),
      totalTradingRevenue: tradingTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      todayTradingRevenue: Number(tradingToday.toFixed(2)),
      totalTeamRevenue: teamTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      todayTeamRevenue: Number(teamToday.toFixed(2))
    };
  }, [summary.totalEarned, transactions]);

  const visibleTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.type === "deposit" || transaction.type === "withdrawal").slice(0, 8),
    [transactions]
  );

  const toggleLanguage = () => {
    const nextLanguage = language === "en" ? "fr" : language === "fr" ? "ar" : "en";
    setLanguage(nextLanguage);
    localStorage.setItem("nevo.language", nextLanguage);
    document.documentElement.lang = nextLanguage;
    document.documentElement.dir = nextLanguage === "ar" ? "rtl" : "ltr";
    toast.success(
      nextLanguage === "ar"
        ? "تم ضبط اللغة على العربية."
        : nextLanguage === "fr"
          ? "Langue definie sur le francais."
          : "Language set to English."
    );
  };

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-10 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <BrandMark
            iconClassName="h-11 w-11 rounded-[18px] p-2"
            subtitle="Assets hub"
            textClassName="text-[1.65rem] tracking-[0.02em] text-cyan-200"
            subtitleClassName="text-[10px] tracking-[0.34em]"
          />

          <div className="flex items-center gap-2">
            <button
              aria-label="Notifications"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={() => toast("No asset alerts yet.")}
              type="button"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Language"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={toggleLanguage}
              type="button"
            >
              <Globe className="h-[18px] w-[18px]" />
            </button>
            <button
              aria-label="Support"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={() => {
                window.location.href = "mailto:support@fndk.capital?subject=Assets%20Support";
              }}
              type="button"
            >
              <Headset className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pt-5">
        {walletApiOffline ? (
          <div className="mb-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-[13px] leading-6 text-amber-100">
            Live wallet data is unavailable right now.
          </div>
        ) : null}

        <div className="flex items-center gap-8 border-b border-white/10 pb-3">
          <button
            className={`relative text-[1.05rem] font-semibold transition ${walletTab === "assets" ? "text-cyan-200" : "text-white/45"}`}
            onClick={() => setWalletTab("assets")}
            type="button"
          >
            Apercu Des Actifs
            {walletTab === "assets" ? (
              <span className="absolute -bottom-3 left-0 h-1 w-[92px] rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]" />
            ) : null}
          </button>
          <button
            className={`relative text-[1.05rem] font-semibold transition ${walletTab === "income" ? "text-cyan-200" : "text-white/45"}`}
            onClick={() => setWalletTab("income")}
            type="button"
          >
            Mes Revenus
            {walletTab === "income" ? (
              <span className="absolute -bottom-3 left-0 h-1 w-[92px] rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(108,240,255,0.55)]" />
            ) : null}
          </button>
        </div>

        <section className="neon-panel mt-5 rounded-[34px] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13px] uppercase tracking-[0.18em] text-cyan-200/75">Total assets (USDT)</div>
              <div className="mt-2 text-[2.45rem] font-extrabold leading-none text-[#f4b83f]">
                {maskAmount(summary.totalBalance.toFixed(4), amountsVisible)}
              </div>
            </div>
            <button
              aria-label={amountsVisible ? "Hide balances" : "Show balances"}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-100"
              onClick={() => setAmountsVisible((current) => !current)}
              type="button"
            >
              {amountsVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-y-4 text-[15px]">
            <div className="text-white/45">Actifs Disponibles</div>
            <div className="text-right font-semibold text-white">{maskAmount(summary.availableToWithdraw.toFixed(4), amountsVisible)}</div>
            <div className="text-white/45">En Attente De Sortie</div>
            <div className="text-right font-semibold text-white">{maskAmount(pendingWithdrawals.toFixed(4), amountsVisible)}</div>
            <div className="text-white/45">Total Verrouille</div>
            <div className="text-right font-semibold text-white">{maskAmount(summary.activeInvestment.toFixed(4), amountsVisible)}</div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Link
              className="rounded-[18px] bg-cyan-300 px-4 py-3 text-center text-base font-semibold text-[#032932]"
              to="/app/wallet/deposit"
            >
              Deposer
            </Link>
            <Link
              className="rounded-[18px] border border-cyan-300/30 bg-white/5 px-4 py-3 text-center text-base font-semibold text-cyan-100"
              to="/app/wallet/withdraw"
            >
              Retirer
            </Link>
            <button
              className="rounded-[18px] border border-cyan-300/30 bg-white/5 px-4 py-3 text-center text-base font-semibold text-cyan-100"
              onClick={() => recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              type="button"
            >
              Facture
            </button>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-[1.15rem] font-extrabold text-white">Mes Revenus</div>
            <button
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/80"
              onClick={() => setWalletTab(walletTab === "assets" ? "income" : "assets")}
              type="button"
            >
              Voir Les Revenus
              <ReceiptText className="h-4 w-4" />
            </button>
          </div>

          <div className="neon-soft-panel mt-4 rounded-[30px] p-5">
            <div className="grid grid-cols-[1.2fr_0.8fr] gap-y-5 text-[15px]">
              <div className="text-white/45">Revenus Totaux (USDT)</div>
              <div className="text-right text-[1.5rem] font-extrabold text-[#f4b83f]">
                {maskAmount(revenueBreakdown.totalRevenue.toFixed(4), amountsVisible)}
              </div>
              <div className="text-white/45">Revenus D'aujourd'hui (USDT)</div>
              <div className="text-right font-semibold text-white">{maskAmount(revenueBreakdown.todayRevenue.toFixed(4), amountsVisible)}</div>
              <div className="text-white/45">Revenus De Trading Totaux (USDT)</div>
              <div className="text-right font-semibold text-white">{maskAmount(revenueBreakdown.totalTradingRevenue.toFixed(4), amountsVisible)}</div>
              <div className="text-white/45">Revenus De Trading D'aujourd'hui (USDT)</div>
              <div className="text-right font-semibold text-white">{maskAmount(revenueBreakdown.todayTradingRevenue.toFixed(4), amountsVisible)}</div>
              <div className="text-white/45">Revenus D'equipe Totaux (USDT)</div>
              <div className="text-right font-semibold text-white">{maskAmount(revenueBreakdown.totalTeamRevenue.toFixed(4), amountsVisible)}</div>
              <div className="text-white/45">Revenus D'equipe D'aujourd'hui (USDT)</div>
              <div className="text-right font-semibold text-white">{maskAmount(revenueBreakdown.todayTeamRevenue.toFixed(4), amountsVisible)}</div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="text-[1.15rem] font-extrabold text-white">Liste Des Actifs</div>
          <div className="mt-4 space-y-3">
            {summary.assets.length ? (
              summary.assets.map((asset) => (
                <div key={asset.asset} className="neon-panel rounded-[24px] px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-semibold text-white">{asset.asset}</div>
                      <div className="mt-1 text-[13px] text-slate-400">
                        Active investment {maskAmount(asset.activeInvestment.toFixed(2), amountsVisible)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[1rem] font-semibold text-cyan-100">
                        {maskAmount(asset.balance.toFixed(2), amountsVisible)}
                      </div>
                      <div className="mt-1 text-[12px] text-white/35">Available</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                {loading ? "Loading balances..." : "No wallet balances yet."}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6" ref={recordsRef}>
          <div className="text-[1.15rem] font-extrabold text-white">Facture</div>
          <div className="mt-4 space-y-3">
            {visibleTransactions.length ? (
              visibleTransactions.map((transaction) => (
                <article key={transaction.id} className="neon-panel rounded-[24px] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[15px] font-semibold text-white">{typeLabel[transaction.type]}</div>
                      <div className="mt-1 text-[13px] text-slate-400">{transaction.asset}</div>
                      <div className="mt-1 text-[12px] text-white/35">
                        {new Date(transaction.createdAt).toLocaleString("en-GB")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[1rem] font-semibold text-white">
                        {maskAmount(transaction.amount.toFixed(2), amountsVisible)}
                      </div>
                      <div className="mt-1 text-[12px] uppercase tracking-[0.18em] text-cyan-200">{transaction.status}</div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/45">
                {loading ? "Loading records..." : "No asset invoices yet."}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
