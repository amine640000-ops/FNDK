import type { AssetRouteSetting, AssetType, VipTier } from "@nevo/shared-types";

export const SUPPORTED_ASSETS = [
  "BTC",
  "ETH",
  "USDT_TRC20",
  "USDT_ERC20",
  "USD",
  "EUR",
  "GBP",
  "STOCKS"
] as const;

export const DEFAULT_ASSET_LABELS: Record<AssetType, string> = {
  BTC: "BTC",
  ETH: "ETH",
  USDT_TRC20: "USDT (TRC20)",
  USDT_ERC20: "USDT (ERC20)",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  STOCKS: "STOCKS"
};

export const DEFAULT_ASSET_ROUTE_SETTINGS: AssetRouteSetting[] = SUPPORTED_ASSETS.map((asset) => ({
  asset,
  label: DEFAULT_ASSET_LABELS[asset],
  address: "",
  enabled: true
}));

export const VIP_TIERS: VipTier[] = [
  {
    id: 1,
    name: "Starter",
    minDeposit: 50,
    dailyRoiMin: 0.005,
    dailyRoiMax: 0.01,
    dailyRoi: 0.01,
    monthlyRoi: 0.3,
    requiredDirectMembers: 0,
    activationLimitPerDay: 3,
    activationDurationMinutes: 2,
    activationAssets: ["USDT_TRC20", "BTC", "USD"],
    features: ["Basic AI trading", "Standard support"]
  },
  {
    id: 2,
    name: "Silver",
    minDeposit: 500,
    dailyRoiMin: 0.01,
    dailyRoiMax: 0.015,
    dailyRoi: 0.015,
    monthlyRoi: 0.45,
    requiredDirectMembers: 0,
    activationLimitPerDay: 4,
    activationDurationMinutes: 2,
    activationAssets: ["BTC", "ETH", "USDT_TRC20", "USD"],
    features: ["Priority support", "Weekly reports"]
  },
  {
    id: 3,
    name: "Gold",
    minDeposit: 2000,
    dailyRoiMin: 0.015,
    dailyRoiMax: 0.02,
    dailyRoi: 0.02,
    monthlyRoi: 0.6,
    requiredDirectMembers: 0,
    activationLimitPerDay: 5,
    activationDurationMinutes: 2,
    activationAssets: ["BTC", "ETH", "USDT_TRC20", "USD", "EUR"],
    features: ["Dedicated account manager", "Daily reports"]
  },
  {
    id: 4,
    name: "Platinum",
    minDeposit: 10000,
    dailyRoiMin: 0.02,
    dailyRoiMax: 0.025,
    dailyRoi: 0.025,
    monthlyRoi: 0.75,
    requiredDirectMembers: 0,
    activationLimitPerDay: 7,
    activationDurationMinutes: 2,
    activationAssets: ["BTC", "ETH", "USDT_TRC20", "USDT_ERC20", "USD", "EUR", "GBP", "STOCKS"],
    features: ["Advanced AI strategies", "Instant withdrawals"]
  },
  {
    id: 5,
    name: "Diamond",
    minDeposit: 50000,
    dailyRoiMin: 0.025,
    dailyRoiMax: 0.03,
    dailyRoi: 0.03,
    monthlyRoi: 0.9,
    requiredDirectMembers: 0,
    activationLimitPerDay: 10,
    activationDurationMinutes: 2,
    activationAssets: ["BTC", "ETH", "USDT_TRC20", "USDT_ERC20", "USD", "EUR", "GBP", "STOCKS"],
    features: ["All assets", "Custom AI strategy", "VIP concierge"]
  }
];

export const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);

export const formatPercent = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2
  }).format(value);

export const resolveTierByDeposit = (amount: number) =>
  [...VIP_TIERS].reverse().find((tier) => amount >= tier.minDeposit) ?? VIP_TIERS[0];

export const calculateDailyProfit = (activeInvestment: number, dailyRoi: number) =>
  Number((activeInvestment * dailyRoi).toFixed(2));

export const createReferralCode = (seed: string) => {
  const normalizedSeed = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "USER";
  const label = normalizedSeed.slice(0, 4).padEnd(4, "X");
  let hash = 0;

  for (const character of normalizedSeed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const suffix = hash.toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return `FNDK-${label}${suffix}`;
};

export const getTierConfig = (tierId: number) => VIP_TIERS.find((tier) => tier.id === tierId) ?? VIP_TIERS[0];
