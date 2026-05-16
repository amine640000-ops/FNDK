import { create } from "zustand";
import type {
  AdminOverviewMetrics,
  DashboardTradeLog,
  DashboardTransaction,
  ReferralLeaderboardEntry,
  VipTier,
  WalletSummary
} from "@nevo/shared-types";
import { VIP_TIERS } from "@nevo/shared-utils";

const overviewMetrics = {
  totalBalance: 0,
  activeInvestment: 0,
  totalProfitEarned: 0,
  liveProfitToday: 0,
  currentVipName: "Starter"
};

const walletSummary: WalletSummary = {
  totalBalance: 0,
  activeInvestment: 0,
  availableToWithdraw: 0,
  totalEarned: 0,
  assets: []
};

const transactions: DashboardTransaction[] = [];
const tradeLogs: DashboardTradeLog[] = [];

const profitSeries = [] as Array<{ date: string; profit: number }>;
const referralLeaderboard: ReferralLeaderboardEntry[] = [];
const vipTiers: VipTier[] = VIP_TIERS;
const hotMarkets = [] as Array<{ symbol: string; pair: string; price: number; change: number; logo: string }>;
const missionTasks = [] as Array<{
  id: string;
  title: string;
  description: string;
  reward: number;
  target: number;
  progress: number;
  cta: string;
}>;
const invitationRewardTiers = [] as Array<{ phase: string; invitedUsers: number; reward: number }>;
const depositRecords = [] as Array<{
  id: string;
  orderNumber: string;
  asset: string;
  amount: number;
  status: "Completed" | "Pending" | "Rejected";
  createdAt: string;
}>;
const adminMetrics: AdminOverviewMetrics = {
  totalUsers: 0,
  totalDeposited: 0,
  totalProfitPaidOut: 0,
  pendingWithdrawals: 0,
  platformRevenue: 0
};
const adminSeries = {
  deposits: [] as Array<{ name: string; value: number }>,
  tiers: [] as Array<{ name: string; value: number }>
};

type DashboardState = {
  overview: typeof overviewMetrics;
  wallet: typeof walletSummary;
  transactions: typeof transactions;
  trades: typeof tradeLogs;
  profitSeries: typeof profitSeries;
  referrals: typeof referralLeaderboard;
  vipTiers: typeof vipTiers;
  hotMarkets: typeof hotMarkets;
  missionTasks: typeof missionTasks;
  invitationRewardTiers: typeof invitationRewardTiers;
  depositRecords: typeof depositRecords;
  adminMetrics: typeof adminMetrics;
  adminSeries: typeof adminSeries;
  liveProfitPulse: number;
  tickProfit: () => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  overview: overviewMetrics,
  wallet: walletSummary,
  transactions,
  trades: tradeLogs,
  profitSeries,
  referrals: referralLeaderboard,
  vipTiers,
  hotMarkets,
  missionTasks,
  invitationRewardTiers,
  depositRecords,
  adminMetrics,
  adminSeries,
  liveProfitPulse: overviewMetrics.liveProfitToday,
  tickProfit: () =>
    set((state) => ({
      liveProfitPulse: state.overview.activeInvestment > 0 ? Number(state.liveProfitPulse.toFixed(2)) : 0
    }))
}));
