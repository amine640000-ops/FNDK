import {
  ArrowUpDown,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Handshake,
  Headset,
  Landmark,
  LogOut,
  Sparkles,
  UserPlus,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { formatCurrency } from "@nevo/shared-utils";
import type { AdCarouselSlide, WalletSummary } from "@nevo/shared-types";
import { BrandMark } from "@/components/brand-mark";
import { useDashboardStore } from "@/store/use-dashboard-store";

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});

const shortcutItems = [
  {
    title: "Agency\nCooperation",
    icon: Handshake,
    to: "/app/referrals"
  },
  {
    title: "Invite\nFriends",
    icon: UserPlus,
    to: "/app/referrals"
  },
  {
    title: "VIP\nUpgrade",
    icon: Sparkles,
    to: "/app/strategy"
  },
  {
    title: "Online\nService",
    icon: Headset,
    to: "/app/profile"
  },
  {
    title: "Top Up",
    icon: Landmark,
    to: "/app/wallet/deposit"
  },
  {
    title: "Withdraw",
    icon: WalletCards,
    to: "/app/wallet/withdraw"
  },
  {
    title: "Mission\nCenter",
    icon: Sparkles,
    to: "/app/mission",
    featured: true
  },
  {
    title: "Help\nCenter",
    icon: Headset,
    to: "/app/profile"
  }
];

const headerActions = [
  { label: "Notifications", icon: Bell },
  { label: "Language", icon: Globe },
  { label: "Support", icon: Headset }
] as const;

const notificationApi = axios.create({
  baseURL: import.meta.env.VITE_NOTIFICATION_API_URL ?? "http://localhost:4005/api"
});

const adminApiBase = import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:4006/api";
const adminUploadsBase = adminApiBase.replace(/\/api\/?$/, "");

const publicAdminApi = axios.create({
  baseURL: adminApiBase
});

const walletApi = axios.create({
  baseURL: import.meta.env.VITE_WALLET_API_URL ?? "http://localhost:4002/api"
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

const resolveAdminAssetUrl = (url: string) => {
  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${adminUploadsBase}${url.startsWith("/") ? url : `/${url}`}`;
};

const isInternalHref = (href: string) => href.startsWith("/");

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type MarketTicker = {
  symbol: string;
  pair: string;
  price: number;
  change: number;
  logo: string;
  logoUrl: string;
};

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
};

const marketSymbols = [
  {
    symbol: "ETH",
    binanceSymbol: "ETHUSDT",
    logo: "E",
    logoUrl: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/eth.png"
  },
  {
    symbol: "BTC",
    binanceSymbol: "BTCUSDT",
    logo: "B",
    logoUrl: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png"
  },
  {
    symbol: "SOL",
    binanceSymbol: "SOLUSDT",
    logo: "S",
    logoUrl: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/sol.png"
  },
  {
    symbol: "DOT",
    binanceSymbol: "DOTUSDT",
    logo: "D",
    logoUrl: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/dot.png"
  },
  {
    symbol: "XRP",
    binanceSymbol: "XRPUSDT",
    logo: "X",
    logoUrl: "https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/xrp.png"
  }
] as const;

const marketLogoTone: Record<string, string> = {
  ETH: "from-slate-100 to-violet-300 text-slate-900",
  BTC: "from-amber-200 to-orange-500 text-slate-900",
  SOL: "from-emerald-300 via-cyan-300 to-violet-500 text-slate-900",
  DOT: "from-rose-200 to-pink-500 text-slate-900",
  XRP: "from-slate-300 to-slate-500 text-slate-950"
};

export function OverviewPage() {
  const navigate = useNavigate();
  const overview = useDashboardStore((state) => state.overview);
  const adminMetrics = useDashboardStore((state) => state.adminMetrics);
  const [liveWallet, setLiveWallet] = useState<WalletSummary | null>(null);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [marketTab, setMarketTab] = useState<"hot" | "gain">("hot");
  const [marketFeed, setMarketFeed] = useState<MarketTicker[]>([]);
  const [marketFeedLoading, setMarketFeedLoading] = useState(true);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  const [adSlides, setAdSlides] = useState<AdCarouselSlide[]>(defaultAdCarouselSlides);
  const [activeAdIndex, setActiveAdIndex] = useState(0);
  const [language, setLanguage] = useState<"en" | "fr">(() => {
    const stored = localStorage.getItem("nevo.language");
    return stored === "fr" ? "fr" : "en";
  });

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem("nevo.language", language);
  }, [language]);

  useEffect(() => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      setLiveWallet(null);
      return;
    }

    let active = true;

    const loadWallet = async () => {
      try {
        const response = await walletApi.get<WalletSummary>("/wallet/summary", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (active) {
          setLiveWallet(response.data);
        }
      } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
          localStorage.removeItem("nevo.accessToken");
          localStorage.removeItem("nevo.refreshToken");
          localStorage.removeItem("nevo.user");
          if (active) {
            toast.error("Your session expired. Sign in again.");
            navigate("/login", { replace: true });
          }
          return;
        }

        if (active) {
          setLiveWallet(null);
        }
      }
    };

    void loadWallet();
    const intervalId = window.setInterval(() => void loadWallet(), 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketFeed = async () => {
      try {
        const symbols = encodeURIComponent(JSON.stringify(marketSymbols.map((market) => market.binanceSymbol)));
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`);
        if (!response.ok) {
          throw new Error("Failed to fetch market feed");
        }

        const payload = (await response.json()) as BinanceTicker[];
        if (cancelled) {
          return;
        }

        const nextFeed: MarketTicker[] = marketSymbols.flatMap((market) => {
          const ticker = payload.find((entry) => entry.symbol === market.binanceSymbol);
          if (!ticker) {
            return [];
          }

          return [
            {
              symbol: market.symbol,
              pair: "USDT",
              price: Number(ticker.lastPrice),
              change: Number(ticker.priceChangePercent) / 100,
              logo: market.logo,
              logoUrl: market.logoUrl
            }
          ];
        });

        setMarketFeed(nextFeed);
      } catch {
        if (!cancelled) {
          toast.error("Could not load market feed.");
        }
      } finally {
        if (!cancelled) {
          setMarketFeedLoading(false);
        }
      }
    };

    void loadMarketFeed();
    const intervalId = window.setInterval(() => {
      void loadMarketFeed();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    publicAdminApi
      .get<AdCarouselSlide[]>("/public/ad-carousel")
      .then((response) => {
        if (!active) {
          return;
        }

        const enabledSlides = response.data.filter((slide) => slide.enabled);
        setAdSlides(enabledSlides.length ? enabledSlides : defaultAdCarouselSlides);
      })
      .catch(() => {
        if (active) {
          setAdSlides(defaultAdCarouselSlides);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeAdIndex >= adSlides.length) {
      setActiveAdIndex(0);
    }
  }, [activeAdIndex, adSlides.length]);

  useEffect(() => {
    if (adSlides.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveAdIndex((current) => (current + 1) % adSlides.length);
    }, 6000);

    return () => window.clearInterval(intervalId);
  }, [adSlides.length]);

  const handleLogout = () => {
    localStorage.removeItem("nevo.accessToken");
    localStorage.removeItem("nevo.refreshToken");
    localStorage.removeItem("nevo.user");
    navigate("/login");
  };

  const openNotifications = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    setNotificationPanelOpen(true);
    setNotificationsLoading(true);

    try {
      const response = await notificationApi.get<NotificationItem[]>("/notifications", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(response.data);
    } catch {
      toast.error("Could not load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  };

  const toggleLanguage = () => {
    const nextLanguage = language === "en" ? "fr" : "en";
    setLanguage(nextLanguage);
    toast.success(nextLanguage === "en" ? "Language set to English." : "Langue definie sur le francais.");
  };

  const openSupport = () => {
    window.location.href = "mailto:support@fndk.capital?subject=FNDK%20Support";
  };

  const handleHeaderAction = (label: (typeof headerActions)[number]["label"]) => {
    if (label === "Notifications") {
      void openNotifications();
      return;
    }

    if (label === "Language") {
      toggleLanguage();
      return;
    }

    openSupport();
  };

  const displayedMarkets = useMemo(() => {
    const markets = [...marketFeed];
    if (marketTab === "gain") {
      return markets.sort((left, right) => right.change - left.change);
    }

    return markets.sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  }, [marketFeed, marketTab]);

  const overviewWalletTotal = liveWallet?.totalBalance ?? overview.totalBalance;
  const overviewWalletActiveInvestment = liveWallet?.activeInvestment ?? overview.activeInvestment;
  const activeAdSlide = adSlides[activeAdIndex] ?? defaultAdCarouselSlides[0];
  const activeAdImageUrl = resolveAdminAssetUrl(activeAdSlide.imageUrl);

  const goToPreviousAd = () => {
    setActiveAdIndex((current) => (current - 1 + adSlides.length) % adSlides.length);
  };

  const goToNextAd = () => {
    setActiveAdIndex((current) => (current + 1) % adSlides.length);
  };

  return (
    <div className="relative px-4 pb-6 pt-5">
      <header className="sticky top-0 z-30 -mx-4 border-b border-cyan-300/10 bg-[#050849]/94 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <BrandMark
            iconClassName="h-10 w-10 rounded-xl p-1.5"
            subtitle="AI trading hub"
            textClassName="text-xl tracking-[0.08em]"
            subtitleClassName="text-[11px] tracking-[0.3em]"
          />
          <div className="flex items-center gap-2">
            {headerActions.map(({ label, icon: Icon }) => (
              <button
                key={label}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
                onClick={() => handleHeaderAction(label)}
                type="button"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <button
              aria-label="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/15 bg-white/5 text-cyan-200 transition hover:bg-cyan-300/10"
              onClick={handleLogout}
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {notificationPanelOpen ? (
        <div className="fixed inset-0 z-30 bg-[#020223]/65 backdrop-blur-sm">
          <button
            aria-label="Close notifications"
            className="absolute inset-0"
            onClick={() => setNotificationPanelOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-4 top-20 rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,96,0.98)_0%,rgba(7,9,79,0.99)_38%,rgba(4,8,58,1)_100%)] p-5 shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm uppercase tracking-[0.26em] text-cyan-200/75">Notifications</div>
                <div className="mt-1 text-lg font-semibold text-white">Recent account activity</div>
              </div>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-200"
                onClick={() => setNotificationPanelOpen(false)}
                type="button"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto">
              {notificationsLoading ? (
                <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                  Loading notifications...
                </div>
              ) : notifications.length ? (
                notifications.map((notification) => (
                  <div key={notification.id} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{notification.title}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-300">{notification.message}</div>
                      </div>
                      {!notification.isRead ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300" /> : null}
                    </div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                      {new Date(notification.createdAt).toLocaleString(language === "fr" ? "fr-FR" : "en-GB")}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-300">
                  No notifications yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <section className="ad-carousel mt-5 min-h-[224px] px-4 py-5">
        {activeAdImageUrl ? (
          <img
            alt=""
            className="absolute inset-y-0 right-0 h-full w-[58%] object-cover opacity-85 [mask-image:linear-gradient(90deg,transparent_0%,black_36%)]"
            src={activeAdImageUrl}
          />
        ) : (
          <div className="absolute bottom-5 right-4 z-10 h-32 w-32">
            <div className="absolute bottom-0 right-0 h-20 w-20 rounded-[24px] bg-gradient-to-b from-[#2f63ff] to-[#1533a8] shadow-[0_18px_26px_rgba(0,0,0,0.28)]" />
            <div className="absolute bottom-12 right-8 h-14 w-14 rounded-[18px] bg-gradient-to-b from-[#4a7dff] to-[#2056dd]" />
            <div className="absolute bottom-16 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ffe2a9] to-[#d08a1f] text-base font-extrabold text-[#3d2404] shadow-[0_8px_18px_rgba(228,171,62,0.45)]">
              $
            </div>
            <div className="absolute bottom-20 right-12 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ffe7bc] to-[#dc9b30] text-xs font-extrabold text-[#3d2404] shadow-[0_8px_18px_rgba(228,171,62,0.38)]">
              $
            </div>
            <div className="absolute bottom-8 right-16 h-10 w-10 rounded-full border-4 border-cyan-300/30" />
          </div>
        )}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#030523] via-[#06105d]/94 to-[#0c2167]/35" />

        <div className="relative z-20 flex min-h-[184px] flex-col justify-between gap-4">
          <div className="max-w-[68%]">
            <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">{activeAdSlide.eyebrow}</div>
            <h1 className="mt-2 text-[1.55rem] font-extrabold leading-[1.08] text-[#ffe0a8]">
              {activeAdSlide.title}
            </h1>
            <p className="mt-3 overflow-hidden text-[13px] leading-5 text-slate-200/80 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
              {activeAdSlide.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {isInternalHref(activeAdSlide.ctaHref) ? (
              <Link
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[13px] font-semibold text-cyan-100"
                to={activeAdSlide.ctaHref}
              >
                {activeAdSlide.ctaLabel}
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <a
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-[13px] font-semibold text-cyan-100"
                href={activeAdSlide.ctaHref}
                rel="noreferrer"
                target="_blank"
              >
                {activeAdSlide.ctaLabel}
                <ChevronRight className="h-4 w-4" />
              </a>
            )}

            {adSlides.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous promotion"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-white/5 text-cyan-100 transition hover:bg-cyan-300/10"
                  onClick={goToPreviousAd}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  {adSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      aria-label={`Open promotion ${index + 1}`}
                      className={`h-2 rounded-full transition ${
                        index === activeAdIndex ? "w-6 bg-cyan-200" : "w-2 bg-cyan-200/35"
                      }`}
                      onClick={() => setActiveAdIndex(index)}
                      type="button"
                    />
                  ))}
                </div>
                <button
                  aria-label="Next promotion"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-white/5 text-cyan-100 transition hover:bg-cyan-300/10"
                  onClick={goToNextAd}
                  type="button"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-4 gap-3">
        {shortcutItems.map(({ title, icon: Icon, to, featured }) => (
          <Link key={title} className="group text-center" to={to}>
            <div
              className={`mx-auto flex h-[68px] w-[68px] items-center justify-center rounded-full border ${
                featured
                  ? "border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_28px_rgba(104,232,255,0.24)]"
                  : "border-cyan-300/20 bg-white/5"
              } transition group-hover:scale-[1.03]`}
            >
              <div className="flex h-[50px] w-[50px] items-center justify-center rounded-full border border-cyan-300/30 bg-[#07105e] text-cyan-200">
                <Icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-2 whitespace-pre-line text-[12px] font-medium leading-4 text-white/92">{title}</div>
          </Link>
        ))}
      </section>

      <section className="neon-panel mt-6 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[1.45rem] font-extrabold leading-none text-white">${compactNumber.format(adminMetrics.totalDeposited)}</div>
            <div className="mt-2 text-[12px] leading-4 text-cyan-200/85">Strategy Scale</div>
          </div>
          <div>
            <div className="text-[1.45rem] font-extrabold leading-none text-white">{compactNumber.format(adminMetrics.totalUsers)}</div>
            <div className="mt-2 text-[12px] leading-4 text-cyan-200/85">Cumulative Participants</div>
          </div>
          <div>
            <div className="text-[1.45rem] font-extrabold leading-none text-white">{compactNumber.format(2950000)}</div>
            <div className="mt-2 text-[12px] leading-4 text-cyan-200/85">Cumulative Orders</div>
          </div>
        </div>
      </section>

      <section className="neon-panel mt-6 overflow-hidden p-0">
        <div className="border-b border-white/10 bg-[#060a52]/95 px-4 pt-3">
          <div className="grid grid-cols-2">
            {[
              { id: "hot" as const, label: "Hot List" },
              { id: "gain" as const, label: "Gain List" }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`relative pb-3 pt-1 text-center text-[1.02rem] font-semibold transition ${
                  marketTab === tab.id ? "text-cyan-200" : "text-white/45"
                }`}
                onClick={() => setMarketTab(tab.id)}
                type="button"
              >
                {tab.label}
                {marketTab === tab.id ? (
                  <span className="absolute bottom-0 left-1/2 h-1 w-[94px] -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(108,240,255,0.55)]" />
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[#08106a]/88 px-4 py-3">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(88px,0.7fr)_minmax(96px,0.8fr)_24px] items-center gap-3 border-b border-white/10 pb-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/45">
            <div>Currency</div>
            <div className="text-right">Price</div>
            <div className="text-right">24H Change</div>
            <div />
          </div>

          <div className="divide-y divide-white/[0.06]">
            {marketFeedLoading ? (
              <div className="py-8 text-center text-sm text-white/45">Loading market feed...</div>
            ) : displayedMarkets.length ? (
              displayedMarkets.map((market) => (
                <div
                  key={market.symbol}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(88px,0.7fr)_minmax(96px,0.8fr)_24px] items-center gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold ${marketLogoTone[market.symbol] ?? "from-cyan-200 to-blue-500 text-slate-900"}`}
                    >
                      {failedLogos[market.symbol] ? (
                        market.logo
                      ) : (
                        <img
                          alt={`${market.symbol} logo`}
                          className="h-8 w-8 rounded-full object-cover"
                          onError={() =>
                            setFailedLogos((current) => ({
                              ...current,
                              [market.symbol]: true
                            }))
                          }
                          src={market.logoUrl}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[1rem] font-semibold text-white">{market.symbol}</div>
                      <div className="truncate text-[12px] font-medium uppercase tracking-[0.16em] text-white/45">
                        {market.pair}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[1rem] font-semibold text-white">
                    {market.price.toLocaleString("en-US", {
                      minimumFractionDigits: market.price > 100 ? 2 : 4,
                      maximumFractionDigits: market.price > 100 ? 2 : 4
                    })}
                  </div>

                  <div
                    className={`text-right text-[0.98rem] font-semibold ${
                      market.change < 0 ? "text-[#f8c250]" : "text-cyan-300"
                    }`}
                  >
                    {market.change > 0 ? "+" : ""}
                    {(market.change * 100).toFixed(6)}%
                  </div>

                  <div className="flex justify-end text-white/65">
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-white/45">
                Market feed is unavailable right now.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="neon-soft-panel mt-6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/75">Live wallet</div>
            <div className="mt-2 text-[1.75rem] font-extrabold leading-none text-white">
              {formatCurrency(overviewWalletTotal)}
            </div>
            <div className="mt-2 text-[13px] text-slate-300">
              Active investment {formatCurrency(overviewWalletActiveInvestment)}
            </div>
          </div>
          <Link
            className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[13px] font-semibold leading-4 text-cyan-100"
            to="/app/wallet"
          >
            Deposit Records
          </Link>
        </div>
      </section>
    </div>
  );
}
