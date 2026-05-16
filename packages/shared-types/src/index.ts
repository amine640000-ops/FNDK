export type UserRole = "USER" | "ADMIN";
export type KycStatus = "pending" | "verified" | "rejected";
export type AssetType =
  | "BTC"
  | "ETH"
  | "USDT_TRC20"
  | "USDT_ERC20"
  | "USD"
  | "EUR"
  | "GBP"
  | "STOCKS";
export type TransactionType = "deposit" | "withdrawal" | "profit" | "referral";
export type TransactionStatus = "pending" | "approved" | "rejected";

export interface VipTier {
  id: number;
  name: string;
  minDeposit: number;
  dailyRoiMin: number;
  dailyRoiMax: number;
  dailyRoi: number;
  monthlyRoi: number;
  activationLimitPerDay: number;
  activationDurationMinutes: number;
  activationAssets: AssetType[];
  features: string[];
}

export interface WalletSummary {
  totalBalance: number;
  activeInvestment: number;
  availableToWithdraw: number;
  totalEarned: number;
  assets: Array<{
    asset: AssetType;
    balance: number;
    activeInvestment: number;
  }>;
}

export interface AssetRouteSetting {
  asset: AssetType;
  label: string;
  address: string;
  enabled: boolean;
}

export interface DashboardTradeLog {
  id: string;
  asset: AssetType;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  profit: number;
  executedAt: string;
}

export interface DashboardTransaction {
  id: string;
  type: TransactionType;
  asset: AssetType;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
}

export interface ReferralLeaderboardEntry {
  userName: string;
  referrals: number;
  bonusEarned: number;
}

export interface AdminOverviewMetrics {
  totalUsers: number;
  totalDeposited: number;
  totalProfitPaidOut: number;
  pendingWithdrawals: number;
  platformRevenue: number;
}

export interface AdCarouselSlide {
  id: string;
  enabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
}

export interface AdminPlatformSettings {
  platformName: string;
  maintenanceMode: boolean;
  enableBtc: boolean;
  enableForex: boolean;
  referralBonusPercent: number;
  feePercent: number;
  withdrawalsPerMonthLimit: number;
  reservationFailuresPerDay: number;
  giveawayEnabled: boolean;
  giveawayTitle: string;
  giveawayDescription: string;
  giveawayPrize: string;
  giveawayWinners: number;
  giveawayEndsAt: string | null;
  adCarouselSlides: AdCarouselSlide[];
  assetSettings: AssetRouteSetting[];
  depositAddressBtc: string;
  depositAddressEth: string;
  depositAddressUsdtTrc20: string;
  depositAddressUsdtErc20: string;
  depositAddressUsd: string;
  depositAddressEur: string;
  depositAddressGbp: string;
  depositAddressStocks: string;
}

export type DepositAddressMap = Record<AssetType, string | null>;

export interface ProfitDistributionEvent {
  userId: string;
  tierId: number;
  activationId?: string;
  profit: number;
  asset: AssetType;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  executedAt: string;
}

export type ActivationStatus = "running" | "completed" | "expired" | "failed";

export interface AiTradingActivation {
  id: string;
  tierId: number;
  tierName: string;
  asset: AssetType;
  strategy: string;
  marketSummary: string;
  thesis: string;
  status: ActivationStatus;
  startedAt: string;
  endsAt: string;
  completedAt?: string | null;
  durationMinutes: number;
  dailySlotNumber: number;
  dailyLimit: number;
  reservationAmount: number;
  expectedIncomeMin?: number | null;
  expectedIncomeMax?: number | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  profit?: number | null;
}

export interface RabbitEventMap {
  "deposit.confirmed": {
    transactionId: string;
    userId: string;
    amount: number;
    asset: AssetType;
    approvedBy: string;
  };
  "withdrawal.approved": {
    transactionId: string;
    userId: string;
    amount: number;
    asset: AssetType;
    approvedBy: string;
  };
  "profit.distributed": ProfitDistributionEvent;
  "user.registered": {
    userId: string;
    email: string;
    fullName: string;
    referralCode: string;
  };
  "vip.upgraded": {
    userId: string;
    previousTierId: number;
    nextTierId: number;
    assignedAt: string;
  };
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  kycStatus: KycStatus;
}
