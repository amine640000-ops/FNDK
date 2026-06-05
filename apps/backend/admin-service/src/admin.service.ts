import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { dbQuery, ensureVipTierRuntimeColumns, getOne, publishEvent, withTransaction } from "@nevo/shared-infra";
import type {
  AdCarouselSlide,
  AdminOverviewMetrics,
  AdminPlatformSettings,
  AssetRouteSetting,
  AssetType,
  LuckyDrawAnalytics,
  LuckyDrawEventConfig,
  LuckyDrawPrize,
  MissionTaskSetting,
  TransactionType,
  VipTier
} from "@nevo/shared-types";
import { DEFAULT_ASSET_LABELS, DEFAULT_ASSET_ROUTE_SETTINGS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import type { PoolClient } from "pg";
import type { AdjustUserBalanceDto, GrantLuckyDrawSpinsDto, UpdateAdminSettingsDto, UpdateVipTierDto } from "./admin.dto";

type AdminSettingValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | AdCarouselSlide[]
  | AssetRouteSetting[]
  | LuckyDrawPrize[]
  | MissionTaskSetting[];

const maxAdCarouselSlides = 8;
const defaultMissionQualifyingDepositAmount = 107;
const aggregateBalanceAdjustmentAsset: AssetType = "USD";

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

const defaultMissionTasks: MissionTaskSetting[] = [
  {
    id: "direct-invites-2",
    enabled: true,
    category: "limited",
    title: "Invite 2 first-line members",
    description: "Complete direct invitation task phase 1.",
    target: 2,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 20,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-3",
    enabled: true,
    category: "limited",
    title: "Invite 3 first-line members",
    description: "Complete direct invitation task phase 2.",
    target: 3,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 60,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-10",
    enabled: true,
    category: "daily",
    title: "Invite 10 first-line members",
    description: "Complete direct invitation task phase 3.",
    target: 10,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 150,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "direct-invites-20",
    enabled: true,
    category: "long-term",
    title: "Invite 20 first-line members",
    description: "Complete direct invitation task phase 4.",
    target: 20,
    qualifyingDepositAmount: defaultMissionQualifyingDepositAmount,
    rewardAmount: 300,
    rewardAsset: "USDT_TRC20"
  }
];

const defaultLuckyDrawPrizes: LuckyDrawPrize[] = [
  {
    id: "bonus-draw-ticket",
    label: "Bonus draw ticket recorded",
    chance: 35,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "vip-reward-entry",
    label: "VIP reward pool entry",
    chance: 30,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "campaign-review-entry",
    label: "Campaign prize review entry",
    chance: 20,
    rewardAmount: 0,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "five-usdt-bonus",
    label: "5 USDT bonus",
    chance: 10,
    rewardAmount: 5,
    rewardAsset: "USDT_TRC20"
  },
  {
    id: "twenty-usdt-bonus",
    label: "20 USDT bonus",
    chance: 5,
    rewardAmount: 20,
    rewardAsset: "USDT_TRC20"
  }
];

const defaultLuckyDrawConfig: LuckyDrawEventConfig = {
  enabled: true,
  title: "Lucky Draw Event",
  startsAt: "2026-06-03T22:00:00.000Z",
  endsAt: "2026-06-08T21:59:00.000Z",
  referralFirstDepositAmount: 100,
  referralSpinReward: 1,
  depositOneSpinAmount: 200,
  depositTwoSpinAmount: 300,
  maxTotalRewardAmount: 500,
  maxRewardPerUserAmount: 50,
  instantRewardMaxAmount: 10,
  requireKycAboveAmount: 10,
  showPrizeChancesToUsers: false,
  rules: [
    "Invite a direct referral who makes their first deposit of 100 USDT or more to receive 1 spin.",
    "Deposit 200 USDT or more in one transaction to receive 1 spin.",
    "Deposit 300 USDT or more in one transaction to receive 2 spins.",
    "Event period: June 4, 2026 00:00 to June 8, 2026 23:59."
  ],
  prizeLabels: defaultLuckyDrawPrizes.map((prize) => prize.label),
  prizes: defaultLuckyDrawPrizes
};

type UserRow = {
  id: string;
  public_id: string;
  full_name: string;
  email: string;
  kyc_status: string;
  is_active: boolean;
  created_at: string;
  vip_tier: string | null;
  balance: number;
  wallet_balance: number;
  active_investment: number;
  total_deposited: number;
  total_gained: number;
  wallets: Array<{
    asset: AssetType;
    balance: number;
    activeInvestment: number;
  }>;
};

type AdminTransactionRow = {
  id: string;
  user_id: string;
  full_name: string;
  type: TransactionType;
  asset: AssetType;
  amount: number;
  fee_amount: number;
  status: string;
  admin_note: string | null;
  proof_url: string | null;
  destination_address: string | null;
  release_at: string | null;
  created_at: string;
};

type KycSubmissionRow = {
  id: string;
  user_id: string;
  full_name: string;
  document_type: string | null;
  nationality: string | null;
  first_name: string | null;
  last_name: string | null;
  document_number: string | null;
  document_url: string;
  selfie_url: string;
  status: string;
  admin_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type AdminSettingRow = {
  key: string;
  value: unknown;
};

type WalletBalanceRow = {
  balance: number;
};

type AggregateWalletBalanceRow = {
  asset_type: AssetType;
  balance: number;
  active_investment: number;
};

type VipTierRow = {
  id: number;
  name: string;
  min_deposit: number;
  daily_roi_min: number;
  daily_roi_max: number;
  daily_profit_cap: number | null;
  required_direct_members: number;
  activation_limit_per_day: number;
  activation_duration_minutes: number;
  activation_assets: AssetType[];
  features: string[];
};

@Injectable()
export class AdminService implements OnModuleInit {
  async onModuleInit() {
    await ensureVipTierRuntimeColumns();
  }

  async getVipTiers(): Promise<VipTier[]> {
    const result = await dbQuery<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          daily_profit_cap::float8 AS daily_profit_cap,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
        FROM vip_tiers
        ORDER BY min_deposit ASC
      `
    );

    return result.rows.map((tier) => this.mapVipTier(tier));
  }

  async getProfitSettings() {
    const autoProfitDistribution = await this.getBooleanSetting("platform.autoProfitDistribution", true);
    return { autoProfitDistribution };
  }

  async getOverview(): Promise<AdminOverviewMetrics> {
    const metrics = await getOne<{
      total_users: number;
      total_deposited: number;
      total_profit_paid_out: number;
      pending_withdrawals: number;
      platform_fee_percent: number;
    }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM users WHERE role = 'USER') AS total_users,
          (SELECT COALESCE(SUM(amount), 0)::float8 FROM transactions WHERE type = 'deposit' AND status = 'approved') AS total_deposited,
          (SELECT COALESCE(SUM(amount), 0)::float8 FROM transactions WHERE type = 'profit' AND status = 'approved') AS total_profit_paid_out,
          (SELECT COUNT(*)::int FROM transactions WHERE type = 'withdrawal' AND status = 'pending') AS pending_withdrawals,
          COALESCE((SELECT (value #>> '{}')::float8 FROM admin_settings WHERE key = 'platform.feePercent'), 20) AS platform_fee_percent
      `
    );

    const totalProfitPaidOut = metrics?.total_profit_paid_out ?? 0;

    return {
      totalUsers: metrics?.total_users ?? 0,
      totalDeposited: metrics?.total_deposited ?? 0,
      totalProfitPaidOut,
      pendingWithdrawals: metrics?.pending_withdrawals ?? 0,
      platformRevenue: Number(((totalProfitPaidOut * (metrics?.platform_fee_percent ?? 20)) / 100).toFixed(2))
    };
  }

  async getUsers() {
    const result = await dbQuery<UserRow>(
      `
        WITH latest_vip AS (
          SELECT DISTINCT ON (uv.user_id)
            uv.user_id,
            vt.name AS vip_tier
          FROM user_vip uv
          JOIN vip_tiers vt ON vt.id = uv.tier_id
          ORDER BY uv.user_id, uv.assigned_at DESC
        ),
        wallet_totals AS (
          SELECT
            user_id,
            COALESCE(SUM(balance), 0)::float8 AS wallet_balance,
            COALESCE(SUM(balance), 0)::float8 AS active_investment,
            COALESCE(SUM(total_earned), 0)::float8 AS total_earned
          FROM wallets
          GROUP BY user_id
        ),
        wallet_rows AS (
          SELECT
            user_id,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'asset', asset_type,
                  'balance', balance::float8,
                  'activeInvestment', balance::float8
                )
                ORDER BY asset_type
              ),
              '[]'::jsonb
            ) AS wallets
          FROM wallets
          GROUP BY user_id
        ),
        transaction_totals AS (
          SELECT
            user_id,
            COALESCE(SUM(amount) FILTER (WHERE type = 'deposit' AND status = 'approved'), 0)::float8 AS total_deposited
          FROM transactions
          GROUP BY user_id
        )
        SELECT
          u.id,
          u.public_id,
          u.full_name,
          u.email,
          u.kyc_status,
          u.is_active,
          u.created_at,
          lv.vip_tier,
          COALESCE(wt.wallet_balance, 0)::float8 AS balance,
          COALESCE(wt.wallet_balance, 0)::float8 AS wallet_balance,
          COALESCE(wt.active_investment, 0)::float8 AS active_investment,
          COALESCE(tt.total_deposited, 0)::float8 AS total_deposited,
          COALESCE(wt.total_earned, 0)::float8 AS total_gained,
          COALESCE(wr.wallets, '[]'::jsonb) AS wallets
        FROM users u
        LEFT JOIN latest_vip lv ON lv.user_id = u.id
        LEFT JOIN wallet_totals wt ON wt.user_id = u.id
        LEFT JOIN wallet_rows wr ON wr.user_id = u.id
        LEFT JOIN transaction_totals tt ON tt.user_id = u.id
        WHERE u.role = 'USER'
        ORDER BY u.created_at DESC
      `
    );

    return result.rows.map((user: UserRow) => ({
      id: user.id,
      publicId: user.public_id,
      fullName: user.full_name,
      email: user.email,
      vipTier: user.vip_tier ?? "Starter",
      balance: user.balance,
      walletBalance: user.wallet_balance,
      activeInvestment: user.active_investment,
      totalDeposited: user.total_deposited,
      totalGained: user.total_gained,
      wallets: user.wallets,
      kycStatus: user.kyc_status,
      isActive: user.is_active,
      joinDate: user.created_at
    }));
  }

  async updateUserStatus(actorUserId: string, userId: string, isActive: boolean) {
    return withTransaction(async (client: PoolClient) => {
      const result = await client.query<{
        id: string;
        public_id: string;
        full_name: string;
        email: string;
        is_active: boolean;
      }>(
        `
          UPDATE users
          SET is_active = $2
          WHERE id = $1
            AND role = 'USER'
          RETURNING id, public_id, full_name, email, is_active
        `,
        [userId, isActive]
      );

      if (!result.rowCount) {
        throw new NotFoundException("User account not found");
      }

      const user = result.rows[0];
      await this.logAdminActivity(client, actorUserId, isActive ? "user_unbanned" : "user_banned", "user", user.id, {
        publicId: user.public_id,
        email: user.email
      });

      return {
        id: user.id,
        publicId: user.public_id,
        fullName: user.full_name,
        email: user.email,
        isActive: user.is_active
      };
    });
  }

  async adjustUserBalance(userId: string, input: AdjustUserBalanceDto) {
    const adjustmentAmount = Number(input.amount.toFixed(2));
    if ((input.operation === "add" || input.operation === "subtract") && adjustmentAmount <= 0) {
      throw new BadRequestException("Adjustment amount must be greater than 0");
    }

    const note = input.note?.trim();
    const result = await withTransaction(async (client: PoolClient) => {
      const resolveDelta = (previousBalance: number) =>
        input.operation === "add"
          ? adjustmentAmount
          : input.operation === "subtract"
            ? -adjustmentAmount
            : Number((adjustmentAmount - previousBalance).toFixed(2));

      const user = await client.query<{ id: string; full_name: string }>(
        `
          SELECT id, full_name
          FROM users
          WHERE id = $1
            AND role = 'USER'
          FOR UPDATE
        `,
        [userId]
      );

      if (!user.rowCount) {
        throw new NotFoundException("User account not found");
      }

      if (!input.asset) {
        for (const asset of SUPPORTED_ASSETS) {
          await client.query(
            `
              INSERT INTO wallets (id, user_id, asset_type, balance, active_investment, total_earned)
              VALUES (gen_random_uuid(), $1, $2, 0, 0, 0)
              ON CONFLICT (user_id, asset_type) DO NOTHING
            `,
            [userId, asset]
          );
        }

        const wallets = await client.query<AggregateWalletBalanceRow>(
          `
            SELECT
              asset_type,
              balance::float8 AS balance,
              active_investment::float8 AS active_investment
            FROM wallets
            WHERE user_id = $1
            FOR UPDATE
          `,
          [userId]
        );
        const previousBalance = Number(wallets.rows.reduce((total, wallet) => total + wallet.balance, 0).toFixed(2));
        const delta = resolveDelta(previousBalance);
        const nextBalance = Number((previousBalance + delta).toFixed(2));

        if (delta === 0) {
          throw new BadRequestException("Balance is already set to that amount");
        }

        if (nextBalance < 0) {
          throw new BadRequestException("Balance adjustment cannot make the account negative");
        }

        if (delta > 0) {
          await client.query(
            `
              UPDATE wallets
              SET balance = balance + $3
              WHERE user_id = $1
                AND asset_type = $2
            `,
            [userId, aggregateBalanceAdjustmentAsset, delta]
          );
        } else {
          let remainingReduction = Number(Math.abs(delta).toFixed(2));
          const reductionPriority = new Map<AssetType, number>(
            ["USD", "USDT_TRC20", "USDT_ERC20", "EUR", "GBP", "STOCKS", "BTC", "ETH"].map((asset, index) => [
              asset as AssetType,
              index
            ])
          );
          const fundedWallets = wallets.rows
            .filter((wallet) => wallet.balance > 0)
            .sort(
              (left, right) =>
                (reductionPriority.get(left.asset_type) ?? 99) - (reductionPriority.get(right.asset_type) ?? 99)
            );

          for (const wallet of fundedWallets) {
            if (remainingReduction <= 0) {
              break;
            }

            const reduction = Number(Math.min(wallet.balance, remainingReduction).toFixed(2));
            await client.query(
              `
                UPDATE wallets
                SET
                  balance = GREATEST(balance - $3, 0),
                  active_investment = LEAST(active_investment, GREATEST(balance - $3, 0))
                WHERE user_id = $1
                  AND asset_type = $2
              `,
              [userId, wallet.asset_type, reduction]
            );
            remainingReduction = Number((remainingReduction - reduction).toFixed(2));
          }

          if (remainingReduction > 0) {
            throw new BadRequestException("Balance adjustment cannot make the account negative");
          }
        }

        await client.query(
          `
            INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, admin_note)
            VALUES (gen_random_uuid(), $1, 'adjustment', $2, $3, 0, 'approved', $4)
          `,
          [
            userId,
            aggregateBalanceAdjustmentAsset,
            delta,
            note ??
              [
                `Admin total balance ${input.operation}`,
                `Previous total: ${previousBalance}`,
                `Current total: ${nextBalance}`
              ].join(" | ")
          ]
        );

        await client.query(
          `
            INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
          `,
          [
            userId,
            input.operation === "add" && delta > 0 ? "System recharge" : "Balance adjusted",
            input.operation === "add" && delta > 0
              ? `${Math.abs(delta).toFixed(2)} USD was added to your account.`
              : `Your total wallet balance was updated from ${previousBalance} to ${nextBalance}.`
          ]
        );

        return {
          userId,
          fullName: user.rows[0].full_name,
          asset: null,
          operation: input.operation,
          previousBalance,
          balance: nextBalance,
          delta
        };
      }

      await client.query(
        `
          INSERT INTO wallets (id, user_id, asset_type, balance, active_investment, total_earned)
          VALUES (gen_random_uuid(), $1, $2, 0, 0, 0)
          ON CONFLICT (user_id, asset_type) DO NOTHING
        `,
        [userId, input.asset]
      );

      const wallet = await client.query<WalletBalanceRow>(
        `
          SELECT balance::float8 AS balance
          FROM wallets
          WHERE user_id = $1
            AND asset_type = $2
          FOR UPDATE
        `,
        [userId, input.asset]
      );
      const previousBalance = wallet.rows[0]?.balance ?? 0;
      const delta = resolveDelta(previousBalance);
      const nextBalance = Number((previousBalance + delta).toFixed(2));

      if (delta === 0) {
        throw new BadRequestException("Balance is already set to that amount");
      }

      if (nextBalance < 0) {
        throw new BadRequestException("Balance adjustment cannot make the account negative");
      }

      await client.query(
        `
          UPDATE wallets
          SET
            balance = $3,
            active_investment = LEAST(active_investment, $3)
          WHERE user_id = $1
            AND asset_type = $2
        `,
        [userId, input.asset, nextBalance]
      );

      await client.query(
        `
          INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, admin_note)
          VALUES (gen_random_uuid(), $1, 'adjustment', $2, $3, 0, 'approved', $4)
        `,
        [
          userId,
          input.asset,
          delta,
          note ??
            [
              `Admin balance ${input.operation}`,
              `Previous: ${previousBalance}`,
              `Current: ${nextBalance}`
            ].join(" | ")
        ]
      );

      await client.query(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
        `,
        [
          userId,
          input.operation === "add" && delta > 0 ? "System recharge" : "Balance adjusted",
          input.operation === "add" && delta > 0
            ? `${Math.abs(delta).toFixed(2)} ${input.asset.startsWith("USDT") ? "USDT" : input.asset} was added to your account.`
            : `Your ${input.asset} balance was updated from ${previousBalance} to ${nextBalance}.`
        ]
      );

      return {
        userId,
        fullName: user.rows[0].full_name,
        asset: input.asset,
        operation: input.operation,
        previousBalance,
        balance: nextBalance,
        delta
      };
    });

    return result;
  }

  async getSettings(): Promise<AdminPlatformSettings> {
    const result = await dbQuery<AdminSettingRow>(
      `
        SELECT key, value
        FROM admin_settings
        WHERE key = ANY($1)
      `,
      [this.settingKeys]
    );

    const settings = new Map(result.rows.map((row) => [row.key, row.value]));

    const adCarouselSlides = this.normalizeAdCarouselSlides(settings.get("platform.adCarouselSlides"));
    const missionTasks = this.normalizeMissionTasks(settings.get("platform.missionTasks"));
    const assetSettings = this.normalizeAssetSettings(settings);
    const assetSettingByAsset = new Map(assetSettings.map((assetSetting) => [assetSetting.asset, assetSetting]));

    return {
      platformName: String(settings.get("platform.name") ?? "FNDK"),
      maintenanceMode: Boolean(settings.get("platform.maintenanceMode") ?? false),
      enableBtc: assetSettingByAsset.get("BTC")?.enabled ?? true,
      enableForex: Boolean(settings.get("asset.Forex.enabled") ?? true),
      referralBonusPercent: Number(settings.get("platform.referralBonusPercent") ?? 5),
      feePercent: Number(settings.get("platform.feePercent") ?? 20),
      withdrawalsPerMonthLimit: Number(settings.get("platform.withdrawalsPerMonthLimit") ?? 3),
      reservationFailuresPerDay: Number(settings.get("platform.reservationFailuresPerDay") ?? 0),
      giveawayEnabled: Boolean(settings.get("platform.giveawayEnabled") ?? false),
      giveawayTitle: String(settings.get("platform.giveawayTitle") ?? "Weekly Investor Giveaway"),
      giveawayDescription: String(
        settings.get("platform.giveawayDescription") ?? "Reward active investors with a configurable bonus campaign."
      ),
      giveawayPrize: String(settings.get("platform.giveawayPrize") ?? "$1,000 trading credit"),
      giveawayWinners: Number(settings.get("platform.giveawayWinners") ?? 3),
      giveawayEndsAt:
        typeof settings.get("platform.giveawayEndsAt") === "string"
          ? String(settings.get("platform.giveawayEndsAt"))
          : null,
      luckyDraw: this.normalizeLuckyDrawConfig(settings),
      adCarouselSlides,
      missionTasks,
      assetSettings,
      depositAddressBtc: assetSettingByAsset.get("BTC")?.address ?? "",
      depositAddressEth: assetSettingByAsset.get("ETH")?.address ?? "",
      depositAddressUsdtTrc20: assetSettingByAsset.get("USDT_TRC20")?.address ?? "",
      depositAddressUsdtErc20: assetSettingByAsset.get("USDT_ERC20")?.address ?? "",
      depositAddressUsd: assetSettingByAsset.get("USD")?.address ?? "",
      depositAddressEur: assetSettingByAsset.get("EUR")?.address ?? "",
      depositAddressGbp: assetSettingByAsset.get("GBP")?.address ?? "",
      depositAddressStocks: assetSettingByAsset.get("STOCKS")?.address ?? ""
    };
  }

  async getPublicAdCarouselSlides(): Promise<AdCarouselSlide[]> {
    const settings = await this.getSettings();
    const enabledSlides = settings.adCarouselSlides.filter((slide) => slide.enabled);
    return enabledSlides.length ? enabledSlides : defaultAdCarouselSlides;
  }

  async getDeposits() {
    return this.getTransactionsByType("deposit");
  }

  async getWithdrawals() {
    return this.getTransactionsByType("withdrawal");
  }

  async getKycSubmissions() {
    const result = await dbQuery<KycSubmissionRow>(
      `
        SELECT
          ks.id,
          ks.user_id,
          u.full_name,
          ks.document_type,
          ks.nationality,
          ks.first_name,
          ks.last_name,
          ks.document_number,
          ks.document_url,
          ks.selfie_url,
          ks.status,
          ks.admin_note,
          ks.submitted_at,
          ks.reviewed_at
        FROM kyc_submissions ks
        JOIN users u ON u.id = ks.user_id
        ORDER BY
          CASE WHEN ks.status = 'pending' THEN 0 ELSE 1 END,
          ks.submitted_at DESC
      `
    );

    return result.rows.map((submission) => ({
      id: submission.id,
      userId: submission.user_id,
      fullName: submission.full_name,
      documentType: submission.document_type,
      nationality: submission.nationality,
      firstName: submission.first_name,
      lastName: submission.last_name,
      documentNumber: submission.document_number,
      documentUrl: submission.document_url,
      selfieUrl: submission.selfie_url,
      status: submission.status,
      adminNote: submission.admin_note,
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at
    }));
  }

  async getLuckyDrawAnalytics(): Promise<LuckyDrawAnalytics> {
    const settings = await this.getSettings();
    const config = settings.luckyDraw;
    const [spinTotals, rewardTotals, prizeTotals, pendingReviews, recentAwards] = await Promise.all([
      getOne<{
        total_spins: number;
        used_spins: number;
        available_spins: number;
      }>(
        `
          SELECT
            COALESCE(SUM(spin_count), 0)::int AS total_spins,
            COALESCE(SUM(spins_used), 0)::int AS used_spins,
            COALESCE(SUM(GREATEST(spin_count - spins_used, 0)) FILTER (
              WHERE revoked_at IS NULL
                AND (expires_at IS NULL OR expires_at > NOW())
            ), 0)::int AS available_spins
          FROM lucky_draw_spin_ledger
          WHERE created_at >= $1::timestamptz
            AND created_at <= $2::timestamptz
        `,
        [config.startsAt, config.endsAt]
      ),
      getOne<{
        result_count: number;
        credited_reward_amount: number;
        pending_reward_amount: number;
        rejected_reward_amount: number;
      }>(
        `
          SELECT
            COUNT(*)::int AS result_count,
            COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'credited'), 0)::float8 AS credited_reward_amount,
            COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'pending_review'), 0)::float8 AS pending_reward_amount,
            COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'rejected'), 0)::float8 AS rejected_reward_amount
          FROM lucky_draw_spin_results
          WHERE created_at >= $1::timestamptz
            AND created_at <= $2::timestamptz
        `,
        [config.startsAt, config.endsAt]
      ),
      dbQuery<{
        prize_id: string;
        wins: number;
        credited_amount: number;
        pending_amount: number;
      }>(
        `
          SELECT
            prize_id,
            COUNT(*) FILTER (WHERE reward_status <> 'rejected')::int AS wins,
            COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'credited'), 0)::float8 AS credited_amount,
            COALESCE(SUM(reward_amount) FILTER (WHERE reward_status = 'pending_review'), 0)::float8 AS pending_amount
          FROM lucky_draw_spin_results
          WHERE created_at >= $1::timestamptz
            AND created_at <= $2::timestamptz
            AND prize_id IS NOT NULL
          GROUP BY prize_id
        `,
        [config.startsAt, config.endsAt]
      ),
      dbQuery<{
        id: string;
        transaction_id: string;
        user_id: string;
        user_name: string;
        label: string;
        reward_amount: number;
        reward_asset: AssetType;
        created_at: string;
      }>(
        `
          SELECT
            r.id,
            r.reward_transaction_id::text AS transaction_id,
            r.user_id,
            u.full_name AS user_name,
            r.result_label AS label,
            r.reward_amount::float8 AS reward_amount,
            r.reward_asset AS reward_asset,
            r.created_at
          FROM lucky_draw_spin_results r
          JOIN users u ON u.id = r.user_id
          WHERE r.reward_status = 'pending_review'
            AND r.reward_transaction_id IS NOT NULL
          ORDER BY r.created_at DESC
          LIMIT 25
        `
      ),
      dbQuery<{
        id: string;
        user_id: string;
        user_name: string;
        source_type: string;
        spin_count: number;
        spins_used: number;
        note: string;
        created_at: string;
        expires_at: string | null;
        revoked_at: string | null;
      }>(
        `
          SELECT
            l.id,
            l.beneficiary_user_id AS user_id,
            u.full_name AS user_name,
            l.source_type,
            l.spin_count,
            l.spins_used,
            l.note,
            l.created_at,
            l.expires_at,
            l.revoked_at
          FROM lucky_draw_spin_ledger l
          JOIN users u ON u.id = l.beneficiary_user_id
          ORDER BY l.created_at DESC
          LIMIT 25
        `
      )
    ]);

    const prizeUsage = new Map(prizeTotals.rows.map((row) => [row.prize_id, row]));
    const creditedRewardAmount = rewardTotals?.credited_reward_amount ?? 0;
    const pendingRewardAmount = rewardTotals?.pending_reward_amount ?? 0;
    const eventBudgetRemaining = config.maxTotalRewardAmount > 0
      ? Number(Math.max(0, config.maxTotalRewardAmount - creditedRewardAmount - pendingRewardAmount).toFixed(2))
      : null;

    return {
      totalSpins: spinTotals?.total_spins ?? 0,
      usedSpins: spinTotals?.used_spins ?? 0,
      availableSpins: spinTotals?.available_spins ?? 0,
      resultCount: rewardTotals?.result_count ?? 0,
      creditedRewardAmount,
      pendingRewardAmount,
      rejectedRewardAmount: rewardTotals?.rejected_reward_amount ?? 0,
      eventBudgetRemaining,
      prizes: config.prizes.map((prize) => {
        const usage = prizeUsage.get(prize.id);
        return {
          id: prize.id,
          label: prize.label,
          chance: prize.chance,
          rewardAmount: prize.rewardAmount,
          rewardAsset: prize.rewardAsset,
          wins: usage?.wins ?? 0,
          creditedAmount: usage?.credited_amount ?? 0,
          pendingAmount: usage?.pending_amount ?? 0,
          maxWinners: prize.maxWinners ?? null,
          maxTotalRewardAmount: prize.maxTotalRewardAmount ?? null
        };
      }),
      pendingReviews: pendingReviews.rows.map((review) => ({
        id: review.id,
        transactionId: review.transaction_id,
        userId: review.user_id,
        userName: review.user_name,
        label: review.label,
        rewardAmount: review.reward_amount,
        rewardAsset: review.reward_asset,
        createdAt: review.created_at
      })),
      recentAwards: recentAwards.rows.map((award) => ({
        id: award.id,
        userId: award.user_id,
        userName: award.user_name,
        sourceType: award.source_type,
        spinCount: award.spin_count,
        spinsUsed: award.spins_used,
        note: award.note,
        createdAt: award.created_at,
        expiresAt: award.expires_at,
        revokedAt: award.revoked_at
      }))
    };
  }

  async grantLuckyDrawSpins(actorUserId: string, input: GrantLuckyDrawSpinsDto) {
    if (!Number.isInteger(input.spinCount) || input.spinCount < 1 || input.spinCount > 100) {
      throw new BadRequestException("Spin count must be between 1 and 100");
    }

    const note = input.note?.trim() || "Manual Lucky Draw spin grant";
    const expiresAt = input.expiresAt
      ? this.cleanIsoDate(input.expiresAt, "")
      : null;

    if (input.expiresAt && !expiresAt) {
      throw new BadRequestException("Expiration date is invalid");
    }

    return withTransaction(async (client: PoolClient) => {
      const user = await client.query<{ id: string; full_name: string }>(
        `
          SELECT id, full_name
          FROM users
          WHERE id = $1
            AND role = 'USER'
            AND is_active = TRUE
          FOR UPDATE
        `,
        [input.userId]
      );

      if (!user.rowCount) {
        throw new NotFoundException("User account not found");
      }

      const inserted = await client.query<{ id: string; created_at: string }>(
        `
          INSERT INTO lucky_draw_spin_ledger (
            id,
            beneficiary_user_id,
            source_user_id,
            source_transaction_id,
            source_type,
            spin_count,
            note,
            expires_at
          )
          VALUES (gen_random_uuid(), $1, $2, NULL, 'admin_grant', $3, $4, $5)
          RETURNING id, created_at
        `,
        [input.userId, actorUserId, input.spinCount, note.slice(0, 500), expiresAt]
      );

      await client.query(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
        `,
        [
          input.userId,
          "Lucky Draw spins granted",
          `${input.spinCount} Lucky Draw spin${input.spinCount > 1 ? "s" : ""} were added to your account.`
        ]
      );

      await this.logAdminActivity(client, actorUserId, "lucky_draw_spins_granted", "lucky_draw_spin_ledger", inserted.rows[0].id, {
        userId: input.userId,
        spinCount: input.spinCount,
        expiresAt,
        note
      });

      return {
        ledgerId: inserted.rows[0].id,
        userId: input.userId,
        fullName: user.rows[0].full_name,
        spinCount: input.spinCount,
        expiresAt,
        createdAt: inserted.rows[0].created_at
      };
    });
  }

  async revokeLuckyDrawSpinAward(actorUserId: string, ledgerId: string, note?: string) {
    const reviewNote = note?.trim() || "Revoked by admin";
    return withTransaction(async (client: PoolClient) => {
      const existing = await client.query<{
        id: string;
        beneficiary_user_id: string;
        spin_count: number;
        spins_used: number;
        revoked_at: string | null;
      }>(
        `
          SELECT id, beneficiary_user_id, spin_count, spins_used, revoked_at
          FROM lucky_draw_spin_ledger
          WHERE id = $1
          FOR UPDATE
        `,
        [ledgerId]
      );

      if (!existing.rowCount) {
        throw new NotFoundException("Lucky Draw spin award not found");
      }

      const award = existing.rows[0];
      if (award.revoked_at) {
        throw new BadRequestException("Lucky Draw spin award is already revoked");
      }

      if (award.spins_used >= award.spin_count) {
        throw new BadRequestException("This award has no unused spins left to revoke");
      }

      const updated = await client.query<{ revoked_at: string }>(
        `
          UPDATE lucky_draw_spin_ledger
          SET
            revoked_at = NOW(),
            revoked_by = $2,
            revoked_note = $3
          WHERE id = $1
          RETURNING revoked_at
        `,
        [ledgerId, actorUserId, reviewNote.slice(0, 500)]
      );

      await this.logAdminActivity(client, actorUserId, "lucky_draw_spins_revoked", "lucky_draw_spin_ledger", ledgerId, {
        userId: award.beneficiary_user_id,
        spinCount: award.spin_count,
        spinsUsed: award.spins_used,
        note: reviewNote
      });

      return {
        ledgerId,
        userId: award.beneficiary_user_id,
        revokedAt: updated.rows[0].revoked_at
      };
    });
  }

  async approveTransaction(transactionId: string, actorUserId: string) {
    const approved = await withTransaction(async (client: PoolClient) => {
      const existing = await client.query<AdminTransactionRow>(
        `
          SELECT
            t.id,
            t.user_id,
            u.full_name,
            t.type,
            t.asset,
            t.amount::float8 AS amount,
            t.fee_amount::float8 AS fee_amount,
            t.status,
            t.admin_note,
            t.proof_url,
            t.destination_address,
            t.release_at,
            t.created_at
          FROM transactions t
          JOIN users u ON u.id = t.user_id
          WHERE t.id = $1
          FOR UPDATE
        `,
        [transactionId]
      );

      if (!existing.rowCount) {
        throw new NotFoundException("Transaction not found");
      }

      const transaction = existing.rows[0];
      if (transaction.status !== "pending") {
        throw new BadRequestException("Only pending transactions can be approved");
      }

      if (transaction.type === "withdrawal" && transaction.release_at && new Date(transaction.release_at) > new Date()) {
        throw new BadRequestException("Withdrawal is still in the 72-hour holding period");
      }

      if (transaction.type === "lucky_draw_prize") {
        await client.query(
          `
            UPDATE transactions
            SET status = 'approved'
            WHERE id = $1
          `,
          [transaction.id]
        );

        await client.query(
          `
            INSERT INTO wallets (id, user_id, asset_type, balance, active_investment, total_earned)
            VALUES (gen_random_uuid(), $1, $2, 0, 0, 0)
            ON CONFLICT (user_id, asset_type) DO NOTHING
          `,
          [transaction.user_id, transaction.asset]
        );

        await client.query(
          `
            UPDATE wallets
            SET
              balance = balance + $3,
              total_earned = total_earned + $3
            WHERE user_id = $1
              AND asset_type = $2
          `,
          [transaction.user_id, transaction.asset, transaction.amount]
        );

        await client.query(
          `
            UPDATE lucky_draw_spin_results
            SET
              reward_status = 'credited',
              reviewed_at = NOW(),
              reviewed_by = $2,
              review_note = 'Approved by admin'
            WHERE reward_transaction_id = $1
          `,
          [transaction.id, actorUserId]
        );

        await client.query(
          `
            INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
          `,
          [
            transaction.user_id,
            "Lucky Draw prize approved",
            `Your Lucky Draw prize of ${transaction.amount.toFixed(2)} ${transaction.asset.startsWith("USDT") ? "USDT" : transaction.asset} has been credited.`
          ]
        );

        await this.logAdminActivity(client, actorUserId, "lucky_draw_prize_approved", "transaction", transaction.id, {
          userId: transaction.user_id,
          asset: transaction.asset,
          amount: transaction.amount
        });
      }

      return transaction;
    });

    if (approved.type === "deposit") {
      await publishEvent("deposit.confirmed", {
        transactionId: approved.id,
        userId: approved.user_id,
        amount: approved.amount,
        asset: approved.asset,
        approvedBy: actorUserId
      });
    }

    if (approved.type === "withdrawal") {
      await publishEvent("withdrawal.approved", {
        transactionId: approved.id,
        userId: approved.user_id,
        amount: approved.amount,
        asset: approved.asset,
        approvedBy: actorUserId
      });
    }

    if (approved.type !== "lucky_draw_prize") {
      await dbQuery(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            FALSE,
            NOW()
          )
        `,
        [
          approved.user_id,
          `${approved.type === "deposit" ? "Deposit" : "Withdrawal"} approved`,
          approved.type === "deposit"
            ? `Your ${approved.asset} deposit of ${approved.amount} has been approved.`
            : `Your ${approved.asset} withdrawal request has been approved for processing.`
        ]
      );
    }

    return {
      transactionId: approved.id,
      status: "approved",
      type: approved.type,
      approvedAt: new Date().toISOString()
    };
  }

  async rejectTransaction(transactionId: string, actorUserId: string, adminNote?: string) {
    const rejected = await withTransaction(async (client: PoolClient) => {
      const existing = await client.query<AdminTransactionRow>(
        `
          UPDATE transactions
          SET status = 'rejected', admin_note = $2
          WHERE id = $1 AND status = 'pending'
          RETURNING
            id,
            user_id,
            ''::text AS full_name,
            type,
            asset,
            amount::float8 AS amount,
            fee_amount::float8 AS fee_amount,
            status,
            admin_note,
            proof_url,
            destination_address,
            release_at,
            created_at
        `,
        [transactionId, adminNote ?? null]
      );

      if (!existing.rowCount) {
        const current = await client.query<Pick<AdminTransactionRow, "id" | "status">>(
          `
            SELECT id, status
            FROM transactions
            WHERE id = $1
          `,
          [transactionId]
        );

        if (!current.rowCount) {
          throw new NotFoundException("Transaction not found");
        }

        throw new BadRequestException("Only pending transactions can be rejected");
      }

      const transaction = existing.rows[0];
      if (transaction.type === "lucky_draw_prize") {
        await client.query(
          `
            UPDATE lucky_draw_spin_results
            SET
              reward_status = 'rejected',
              reviewed_at = NOW(),
              reviewed_by = $2,
              review_note = $3
            WHERE reward_transaction_id = $1
          `,
          [transaction.id, actorUserId, adminNote ?? "Rejected by admin"]
        );

        await this.logAdminActivity(client, actorUserId, "lucky_draw_prize_rejected", "transaction", transaction.id, {
          userId: transaction.user_id,
          asset: transaction.asset,
          amount: transaction.amount,
          note: adminNote ?? null
        });
      }

      await client.query(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            FALSE,
            NOW()
          )
        `,
        [
          transaction.user_id,
          transaction.type === "lucky_draw_prize"
            ? "Lucky Draw prize rejected"
            : `${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} rejected`,
          transaction.type === "lucky_draw_prize"
            ? `Your Lucky Draw prize review was rejected.${adminNote ? ` Note: ${adminNote}` : ""}`
            : transaction.type === "deposit"
              ? `Your ${transaction.asset} deposit request was rejected.${adminNote ? ` Note: ${adminNote}` : ""}`
              : `Your ${transaction.asset} withdrawal request was rejected.${adminNote ? ` Note: ${adminNote}` : ""}`
        ]
      );

      return transaction;
    });

    return {
      transactionId: rejected.id,
      status: "rejected",
      type: rejected.type,
      reviewedAt: new Date().toISOString()
    };
  }

  async broadcast(title: string, message: string) {
    const users = await dbQuery<{ id: string }>("SELECT id FROM users WHERE role = 'USER' AND is_active = TRUE");

    for (const user of users.rows) {
      await dbQuery(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
        `,
        [user.id, title, message]
      );
    }

    return {
      channel: ["socket", "email"],
      title,
      message,
      audience: "all-users",
      queuedAt: new Date().toISOString()
    };
  }

  async updateSettings(input: UpdateAdminSettingsDto): Promise<AdminPlatformSettings> {
    const settingsEntries = this.toSettingEntries(input);

    for (const [key, value] of settingsEntries) {
      await dbQuery(
        `
          INSERT INTO admin_settings (key, value)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value
        `,
        [key, JSON.stringify(value)]
      );
    }

    return this.getSettings();
  }

  async updateVipTier(tierId: number, input: UpdateVipTierDto): Promise<VipTier> {
    if (!Number.isInteger(tierId) || tierId < 1) {
      throw new BadRequestException("Tier id is invalid");
    }

    const existing = await getOne<{ id: number }>("SELECT id FROM vip_tiers WHERE id = $1", [tierId]);
    if (!existing) {
      throw new NotFoundException("VIP tier not found");
    }

    if (input.minDeposit !== undefined) {
      const previousTier = await getOne<{ min_deposit: number }>(
        `
          SELECT min_deposit::float8 AS min_deposit
          FROM vip_tiers
          WHERE id < $1
          ORDER BY id DESC
          LIMIT 1
        `,
        [tierId]
      );

      const nextTier = await getOne<{ min_deposit: number }>(
        `
          SELECT min_deposit::float8 AS min_deposit
          FROM vip_tiers
          WHERE id > $1
          ORDER BY id ASC
          LIMIT 1
        `,
        [tierId]
      );

      if (previousTier && input.minDeposit <= previousTier.min_deposit) {
        throw new BadRequestException("Minimum deposit must stay above the previous VIP tier");
      }

      if (nextTier && input.minDeposit >= nextTier.min_deposit) {
        throw new BadRequestException("Minimum deposit must stay below the next VIP tier");
      }
    }

    const nextDailyRoiMin = input.dailyRoiMin;
    const nextDailyRoiMax = input.dailyRoiMax;
    if (
      nextDailyRoiMin !== undefined &&
      nextDailyRoiMax !== undefined &&
      nextDailyRoiMin > nextDailyRoiMax
    ) {
      throw new BadRequestException("Minimum ROI must be less than or equal to maximum ROI");
    }

    const dailyProfitCapProvided = Object.prototype.hasOwnProperty.call(input, "dailyProfitCap");
    if (
      dailyProfitCapProvided &&
      input.dailyProfitCap !== null &&
      input.dailyProfitCap !== undefined &&
      (!Number.isFinite(input.dailyProfitCap) || input.dailyProfitCap < 0)
    ) {
      throw new BadRequestException("Daily profit cap must be zero or greater");
    }

    const updated = await getOne<VipTierRow>(
      `
        UPDATE vip_tiers
        SET
          name = COALESCE($2, name),
          min_deposit = COALESCE($3, min_deposit),
          daily_roi_min = COALESCE($4, daily_roi_min),
          daily_roi_max = COALESCE($5, daily_roi_max),
          daily_roi = COALESCE($5, daily_roi_max, daily_roi),
          required_direct_members = COALESCE($6, required_direct_members),
          activation_limit_per_day = COALESCE($7, activation_limit_per_day),
          activation_duration_minutes = COALESCE($8, activation_duration_minutes),
          daily_profit_cap = CASE WHEN $9::boolean THEN $10::numeric ELSE daily_profit_cap END
        WHERE id = $1
        RETURNING
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          daily_profit_cap::float8 AS daily_profit_cap,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
      `,
      [
        tierId,
        input.name ?? null,
        input.minDeposit ?? null,
        input.dailyRoiMin ?? null,
        input.dailyRoiMax ?? null,
        input.requiredDirectMembers ?? null,
        input.activationLimitPerDay ?? null,
        input.activationDurationMinutes ?? null,
        dailyProfitCapProvided,
        input.dailyProfitCap ?? null
      ]
    );

    return this.mapVipTier(updated!);
  }

  async createVipTier(input: UpdateVipTierDto): Promise<VipTier> {
    const maxTierId = await getOne<{ max_id: number }>("SELECT COALESCE(MAX(id), 0)::int AS max_id FROM vip_tiers");
    const highestTier = await getOne<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          daily_profit_cap::float8 AS daily_profit_cap,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
        FROM vip_tiers
        ORDER BY min_deposit DESC, id DESC
        LIMIT 1
      `
    );

    const nextId = (maxTierId?.max_id ?? 0) + 1;
    const minDeposit = input.minDeposit ?? Number(Math.max((highestTier?.min_deposit ?? 0) + 50, (highestTier?.min_deposit ?? 25) * 2).toFixed(2));
    const dailyRoiMin = input.dailyRoiMin ?? highestTier?.daily_roi_min ?? 0.005;
    const dailyRoiMax = input.dailyRoiMax ?? Math.max(dailyRoiMin, highestTier?.daily_roi_max ?? dailyRoiMin);
    const dailyProfitCapProvided = Object.prototype.hasOwnProperty.call(input, "dailyProfitCap");
    const dailyProfitCap = dailyProfitCapProvided ? input.dailyProfitCap ?? null : highestTier?.daily_profit_cap ?? null;
    const requiredDirectMembers = input.requiredDirectMembers ?? highestTier?.required_direct_members ?? 0;
    const activationLimitPerDay = input.activationLimitPerDay ?? highestTier?.activation_limit_per_day ?? 3;
    const activationDurationMinutes = input.activationDurationMinutes ?? highestTier?.activation_duration_minutes ?? 2;

    if (!Number.isFinite(minDeposit) || minDeposit < 0) {
      throw new BadRequestException("Minimum deposit must be zero or greater");
    }

    if (highestTier && minDeposit <= highestTier.min_deposit) {
      throw new BadRequestException("New VIP minimum deposit must be above the current highest VIP tier");
    }

    if (!Number.isFinite(dailyRoiMin) || dailyRoiMin < 0 || !Number.isFinite(dailyRoiMax) || dailyRoiMax < 0) {
      throw new BadRequestException("Daily ROI values must be zero or greater");
    }

    if (dailyRoiMin > dailyRoiMax) {
      throw new BadRequestException("Minimum ROI must be less than or equal to maximum ROI");
    }

    if (dailyProfitCap !== null && (!Number.isFinite(dailyProfitCap) || dailyProfitCap < 0)) {
      throw new BadRequestException("Daily profit cap must be zero or greater");
    }

    if (!Number.isInteger(requiredDirectMembers) || requiredDirectMembers < 0) {
      throw new BadRequestException("Valid direct members must be zero or greater");
    }

    if (!Number.isInteger(activationLimitPerDay) || activationLimitPerDay < 1) {
      throw new BadRequestException("Daily reservations must be at least 1");
    }

    if (!Number.isInteger(activationDurationMinutes) || activationDurationMinutes < 1) {
      throw new BadRequestException("Reservation duration must be at least 1 minute");
    }

    const created = await getOne<VipTierRow>(
      `
        INSERT INTO vip_tiers (
          id,
          name,
          min_deposit,
          daily_roi,
          daily_roi_min,
          daily_roi_max,
          daily_profit_cap,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12::jsonb
        )
        RETURNING
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          daily_profit_cap::float8 AS daily_profit_cap,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
      `,
      [
        nextId,
        input.name?.trim() || `VIP ${nextId}`,
        minDeposit,
        dailyRoiMax,
        dailyRoiMin,
        dailyRoiMax,
        dailyProfitCap,
        requiredDirectMembers,
        activationLimitPerDay,
        activationDurationMinutes,
        JSON.stringify(highestTier?.activation_assets?.length ? highestTier.activation_assets : ["USDT_TRC20", "BTC", "USD"]),
        JSON.stringify(highestTier?.features?.length ? highestTier.features : ["AI trading access"])
      ]
    );

    return this.mapVipTier(created!);
  }

  async deleteVipTier(tierId: number) {
    if (!Number.isInteger(tierId) || tierId < 1) {
      throw new BadRequestException("Tier id is invalid");
    }

    const existing = await getOne<{ id: number }>("SELECT id FROM vip_tiers WHERE id = $1", [tierId]);
    if (!existing) {
      throw new NotFoundException("VIP tier not found");
    }

    const tierCount = await getOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM vip_tiers");
    if ((tierCount?.count ?? 0) <= 1) {
      throw new BadRequestException("At least one VIP tier must remain");
    }

    const usage = await getOne<{ user_assignments: number; activations: number }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM user_vip WHERE tier_id = $1) AS user_assignments,
          (SELECT COUNT(*)::int FROM ai_trading_activations WHERE tier_id = $1) AS activations
      `,
      [tierId]
    );

    if ((usage?.user_assignments ?? 0) > 0 || (usage?.activations ?? 0) > 0) {
      throw new BadRequestException("VIP tier is still used by users or activation history");
    }

    await dbQuery("DELETE FROM vip_tiers WHERE id = $1", [tierId]);

    return {
      tierId,
      deleted: true
    };
  }

  async updateProfitSettings(autoProfitDistribution: boolean) {
    await dbQuery(
      `
        INSERT INTO admin_settings (key, value)
        VALUES ('platform.autoProfitDistribution', to_jsonb($1::boolean))
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value
      `,
      [autoProfitDistribution]
    );

    return { autoProfitDistribution };
  }

  async recalculateAllUserVipTiers() {
    const users = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM users
        WHERE role = 'USER'
      `
    );

    let updatedUsers = 0;

    for (const user of users.rows) {
      const activeInvestment = await this.getEffectiveInvestment(user.id);
      const validDirectMembers = await this.getValidDirectMemberCount(user.id);
      const targetTier = await getOne<VipTierRow>(
        `
          SELECT
            id,
            name,
            min_deposit::float8 AS min_deposit,
            daily_roi_min::float8 AS daily_roi_min,
            daily_roi_max::float8 AS daily_roi_max,
            daily_profit_cap::float8 AS daily_profit_cap,
            required_direct_members,
            activation_limit_per_day,
            activation_duration_minutes,
            activation_assets,
            features
          FROM vip_tiers
          WHERE min_deposit <= $1
            AND required_direct_members <= $2
          ORDER BY min_deposit DESC
          LIMIT 1
        `,
        [activeInvestment, validDirectMembers]
      );

      const starterTier = targetTier ?? (await getOne<VipTierRow>(
        `
          SELECT
            id,
            name,
            min_deposit::float8 AS min_deposit,
            daily_roi_min::float8 AS daily_roi_min,
            daily_roi_max::float8 AS daily_roi_max,
            daily_profit_cap::float8 AS daily_profit_cap,
            required_direct_members,
            activation_limit_per_day,
            activation_duration_minutes,
            activation_assets,
            features
          FROM vip_tiers
          ORDER BY min_deposit ASC
          LIMIT 1
        `
      ));

      const latestTier = await getOne<{ tier_id: number }>(
        `
          SELECT tier_id
          FROM user_vip
          WHERE user_id = $1
          ORDER BY assigned_at DESC
          LIMIT 1
        `,
        [user.id]
      );

      if (!latestTier || latestTier.tier_id !== starterTier!.id) {
        await dbQuery(
          `
            INSERT INTO user_vip (id, user_id, tier_id)
            VALUES (gen_random_uuid(), $1, $2)
          `,
          [user.id, starterTier!.id]
        );

        updatedUsers += 1;

        if (latestTier) {
          await dbQuery(
            `
              INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
              VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
            `,
            [
              user.id,
              "VIP level updated",
              `Your account moved to VIP ${starterTier!.id} (${starterTier!.name}).`
            ]
          );

          await publishEvent("vip.upgraded", {
            userId: user.id,
            previousTierId: latestTier.tier_id,
            nextTierId: starterTier!.id,
            assignedAt: new Date().toISOString()
          });
        }
      }
    }

    return {
      processedUsers: users.rowCount,
      updatedUsers
    };
  }

  async reviewKycSubmission(submissionId: string, status: "verified" | "rejected", adminNote?: string) {
    const updated = await withTransaction(async (client: PoolClient) => {
      const submission = await client.query<Pick<KycSubmissionRow, "id" | "user_id">>(
        `
          UPDATE kyc_submissions
          SET status = $2, admin_note = $3, reviewed_at = NOW()
          WHERE id = $1
            AND status = 'pending'
          RETURNING id, user_id
        `,
        [submissionId, status, adminNote ?? null]
      );

      if (!submission.rowCount) {
        throw new NotFoundException("Pending KYC submission not found");
      }

      await client.query("UPDATE users SET kyc_status = $2 WHERE id = $1", [submission.rows[0].user_id, status]);
      await client.query(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            FALSE,
            NOW()
          )
        `,
        [
          submission.rows[0].user_id,
          `KYC ${status}`,
          status === "verified"
            ? "Your KYC submission has been approved."
            : `Your KYC submission was rejected.${adminNote ? ` Note: ${adminNote}` : ""}`
        ]
      );
      return submission.rows[0];
    });

    return {
      submissionId: updated.id,
      userId: updated.user_id,
      status,
      reviewedAt: new Date().toISOString()
    };
  }

  private async getTransactionsByType(type: TransactionType) {
    const result = await dbQuery<AdminTransactionRow>(
      `
        SELECT
          t.id,
          t.user_id,
          u.full_name,
          t.type,
          t.asset,
          t.amount::float8 AS amount,
          t.fee_amount::float8 AS fee_amount,
          t.status,
          t.admin_note,
          t.proof_url,
          t.destination_address,
          t.release_at,
          t.created_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE t.type = $1
        ORDER BY
          CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
          t.created_at DESC
      `,
      [type]
    );

    return result.rows.map((transaction: AdminTransactionRow) => ({
      id: transaction.id,
      userId: transaction.user_id,
      fullName: transaction.full_name,
      type: transaction.type,
      asset: transaction.asset,
      amount: transaction.amount,
      feeAmount: transaction.fee_amount,
      netAmount: Number((transaction.amount - transaction.fee_amount).toFixed(2)),
      status: transaction.status,
      adminNote: transaction.admin_note,
      proofUrl: transaction.proof_url,
      destinationAddress: transaction.destination_address,
      releaseAt: transaction.release_at,
      canApprove: transaction.type !== "withdrawal" || !transaction.release_at || new Date(transaction.release_at) <= new Date(),
      createdAt: transaction.created_at
    }));
  }

  private async logAdminActivity(
    client: PoolClient,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>
  ) {
    await client.query(
      `
        INSERT INTO admin_activity_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, NOW())
      `,
      [actorUserId, action, entityType, entityId, JSON.stringify(metadata)]
    );
  }

  private readonly settingKeys = [
    "platform.name",
    "platform.maintenanceMode",
    "asset.Forex.enabled",
    "platform.referralBonusPercent",
    "platform.feePercent",
    "platform.autoProfitDistribution",
    "platform.withdrawalsPerMonthLimit",
    "platform.reservationFailuresPerDay",
    "platform.giveawayEnabled",
    "platform.giveawayTitle",
    "platform.giveawayDescription",
    "platform.giveawayPrize",
    "platform.giveawayWinners",
    "platform.giveawayEndsAt",
    "platform.luckyDraw.enabled",
    "platform.luckyDraw.title",
    "platform.luckyDraw.startsAt",
    "platform.luckyDraw.endsAt",
    "platform.luckyDraw.referralFirstDepositAmount",
    "platform.luckyDraw.referralSpinReward",
    "platform.luckyDraw.depositOneSpinAmount",
    "platform.luckyDraw.depositTwoSpinAmount",
    "platform.luckyDraw.maxTotalRewardAmount",
    "platform.luckyDraw.maxRewardPerUserAmount",
    "platform.luckyDraw.instantRewardMaxAmount",
    "platform.luckyDraw.requireKycAboveAmount",
    "platform.luckyDraw.showPrizeChancesToUsers",
    "platform.luckyDraw.rules",
    "platform.luckyDraw.prizeLabels",
    "platform.luckyDraw.prizes",
    "platform.adCarouselSlides",
    "platform.missionTasks",
    ...SUPPORTED_ASSETS.flatMap((asset) => [
      `asset.${asset}.enabled`,
      `asset.${asset}.label`,
      `wallet.depositAddress.${asset}`
    ])
  ];

  private mapVipTier(tier: VipTierRow): VipTier {
    return {
      id: tier.id,
      name: tier.name,
      minDeposit: tier.min_deposit,
      dailyRoiMin: tier.daily_roi_min,
      dailyRoiMax: tier.daily_roi_max,
      dailyRoi: tier.daily_roi_max,
      monthlyRoi: Number((tier.daily_roi_max * 30).toFixed(2)),
      dailyProfitCap: tier.daily_profit_cap,
      requiredDirectMembers: tier.required_direct_members,
      activationLimitPerDay: tier.activation_limit_per_day,
      activationDurationMinutes: tier.activation_duration_minutes,
      activationAssets: tier.activation_assets,
      features: tier.features
    };
  }

  private async getBooleanSetting(key: string, fallback: boolean) {
    const result = await getOne<{ value: boolean }>(
      `
        SELECT (value #>> '{}')::boolean AS value
        FROM admin_settings
        WHERE key = $1
      `,
      [key]
    );

    return result?.value ?? fallback;
  }

  private async getEffectiveInvestment(userId: string) {
    const walletTotals = await getOne<{ total_balance: number }>(
      `
        SELECT COALESCE(SUM(balance), 0)::float8 AS total_balance
        FROM wallets
        WHERE user_id = $1
      `,
      [userId]
    );

    return walletTotals?.total_balance ?? 0;
  }

  private async getValidDirectMemberCount(userId: string) {
    const result = await getOne<{ valid_direct_members: number }>(
      `
        WITH direct_member_funding AS (
          SELECT
            direct_users.id,
            COALESCE(
              SUM(transactions.amount) FILTER (
                WHERE transactions.type = 'deposit'
                  AND transactions.status = 'approved'
                  AND transactions.amount > 0
              ),
              0
            )::float8 AS approved_deposit,
            COALESCE(
              SUM(transactions.amount) FILTER (
                WHERE transactions.type IN ('deposit', 'adjustment')
                  AND transactions.status = 'approved'
                  AND transactions.amount > 0
              ),
              0
            )::float8 AS activation_funding
          FROM users direct_users
          LEFT JOIN transactions
            ON transactions.user_id = direct_users.id
          WHERE direct_users.referred_by = $1
            AND direct_users.role = 'USER'
            AND direct_users.is_active = TRUE
          GROUP BY direct_users.id
        )
        SELECT COUNT(*)::int AS valid_direct_members
        FROM direct_member_funding
        WHERE approved_deposit > 0
          AND activation_funding >= 50
      `,
      [userId]
    );

    return result?.valid_direct_members ?? 0;
  }

  private toSettingEntries(input: UpdateAdminSettingsDto): Array<[string, AdminSettingValue]> {
    const entries: Array<[string, AdminSettingValue]> = [];

    if (input.platformName !== undefined) {
      entries.push(["platform.name", input.platformName.trim() || "FNDK"]);
    }

    if (input.maintenanceMode !== undefined) {
      entries.push(["platform.maintenanceMode", input.maintenanceMode]);
    }

    if (input.enableBtc !== undefined) {
      entries.push(["asset.BTC.enabled", input.enableBtc]);
    }

    if (input.enableForex !== undefined) {
      entries.push(["asset.Forex.enabled", input.enableForex]);
    }

    if (input.referralBonusPercent !== undefined) {
      entries.push(["platform.referralBonusPercent", input.referralBonusPercent]);
    }

    if (input.feePercent !== undefined) {
      entries.push(["platform.feePercent", input.feePercent]);
    }

    if (input.withdrawalsPerMonthLimit !== undefined) {
      entries.push(["platform.withdrawalsPerMonthLimit", input.withdrawalsPerMonthLimit]);
    }

    if (input.reservationFailuresPerDay !== undefined) {
      entries.push(["platform.reservationFailuresPerDay", input.reservationFailuresPerDay]);
    }

    if (input.giveawayEnabled !== undefined) {
      entries.push(["platform.giveawayEnabled", input.giveawayEnabled]);
    }

    if (input.giveawayTitle !== undefined) {
      entries.push(["platform.giveawayTitle", input.giveawayTitle.trim()]);
    }

    if (input.giveawayDescription !== undefined) {
      entries.push(["platform.giveawayDescription", input.giveawayDescription.trim()]);
    }

    if (input.giveawayPrize !== undefined) {
      entries.push(["platform.giveawayPrize", input.giveawayPrize.trim()]);
    }

    if (input.giveawayWinners !== undefined) {
      entries.push(["platform.giveawayWinners", input.giveawayWinners]);
    }

    if (input.giveawayEndsAt !== undefined) {
      entries.push(["platform.giveawayEndsAt", input.giveawayEndsAt ? input.giveawayEndsAt : null]);
    }

    if (input.luckyDraw !== undefined) {
      const luckyDraw = this.normalizeLuckyDrawConfigFromInput(input.luckyDraw);
      entries.push(["platform.luckyDraw.enabled", luckyDraw.enabled]);
      entries.push(["platform.luckyDraw.title", luckyDraw.title]);
      entries.push(["platform.luckyDraw.startsAt", luckyDraw.startsAt]);
      entries.push(["platform.luckyDraw.endsAt", luckyDraw.endsAt]);
      entries.push(["platform.luckyDraw.referralFirstDepositAmount", luckyDraw.referralFirstDepositAmount]);
      entries.push(["platform.luckyDraw.referralSpinReward", luckyDraw.referralSpinReward]);
      entries.push(["platform.luckyDraw.depositOneSpinAmount", luckyDraw.depositOneSpinAmount]);
      entries.push(["platform.luckyDraw.depositTwoSpinAmount", luckyDraw.depositTwoSpinAmount]);
      entries.push(["platform.luckyDraw.maxTotalRewardAmount", luckyDraw.maxTotalRewardAmount]);
      entries.push(["platform.luckyDraw.maxRewardPerUserAmount", luckyDraw.maxRewardPerUserAmount]);
      entries.push(["platform.luckyDraw.instantRewardMaxAmount", luckyDraw.instantRewardMaxAmount]);
      entries.push(["platform.luckyDraw.requireKycAboveAmount", luckyDraw.requireKycAboveAmount]);
      entries.push(["platform.luckyDraw.showPrizeChancesToUsers", luckyDraw.showPrizeChancesToUsers]);
      entries.push(["platform.luckyDraw.rules", luckyDraw.rules]);
      entries.push(["platform.luckyDraw.prizeLabels", luckyDraw.prizeLabels]);
      entries.push(["platform.luckyDraw.prizes", luckyDraw.prizes]);
    }

    if (input.adCarouselSlides !== undefined) {
      entries.push(["platform.adCarouselSlides", this.normalizeAdCarouselSlides(input.adCarouselSlides)]);
    }

    if (input.missionTasks !== undefined) {
      entries.push(["platform.missionTasks", this.normalizeMissionTasks(input.missionTasks)]);
    }

    if (input.assetSettings !== undefined) {
      const normalizedAssetSettings = this.normalizeAssetRouteSettings(input.assetSettings);
      for (const assetSetting of normalizedAssetSettings) {
        entries.push([`asset.${assetSetting.asset}.enabled`, assetSetting.enabled]);
        entries.push([`asset.${assetSetting.asset}.label`, assetSetting.label]);
        entries.push([`wallet.depositAddress.${assetSetting.asset}`, assetSetting.address]);
      }
    }

    if (input.assetSettings === undefined && input.depositAddressBtc !== undefined) {
      entries.push(["wallet.depositAddress.BTC", input.depositAddressBtc.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressEth !== undefined) {
      entries.push(["wallet.depositAddress.ETH", input.depositAddressEth.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressUsdtTrc20 !== undefined) {
      entries.push(["wallet.depositAddress.USDT_TRC20", input.depositAddressUsdtTrc20.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressUsdtErc20 !== undefined) {
      entries.push(["wallet.depositAddress.USDT_ERC20", input.depositAddressUsdtErc20.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressUsd !== undefined) {
      entries.push(["wallet.depositAddress.USD", input.depositAddressUsd.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressEur !== undefined) {
      entries.push(["wallet.depositAddress.EUR", input.depositAddressEur.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressGbp !== undefined) {
      entries.push(["wallet.depositAddress.GBP", input.depositAddressGbp.trim()]);
    }

    if (input.assetSettings === undefined && input.depositAddressStocks !== undefined) {
      entries.push(["wallet.depositAddress.STOCKS", input.depositAddressStocks.trim()]);
    }

    return entries;
  }

  private normalizeAdCarouselSlides(value: unknown): AdCarouselSlide[] {
    if (!Array.isArray(value)) {
      return defaultAdCarouselSlides;
    }

    const slides = value.slice(0, maxAdCarouselSlides).flatMap((entry, index): AdCarouselSlide[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const slide = entry as Partial<AdCarouselSlide>;
      const fallback = defaultAdCarouselSlides[index % defaultAdCarouselSlides.length];
      const normalized: AdCarouselSlide = {
        id: this.cleanSettingText(slide.id, `ad-slide-${index + 1}`, 80),
        enabled: typeof slide.enabled === "boolean" ? slide.enabled : true,
        eyebrow: this.cleanSettingText(slide.eyebrow, fallback.eyebrow, 80),
        title: this.cleanSettingText(slide.title, fallback.title, 100),
        description: this.cleanSettingText(slide.description, fallback.description, 220),
        ctaLabel: this.cleanSettingText(slide.ctaLabel, fallback.ctaLabel, 60),
        ctaHref: this.cleanSettingText(slide.ctaHref, fallback.ctaHref, 220),
        imageUrl: this.cleanSettingText(slide.imageUrl, "", 500)
      };

      if (!normalized.title && !normalized.description && !normalized.imageUrl) {
        return [];
      }

      return [normalized];
    });

    return slides.length ? slides : defaultAdCarouselSlides;
  }

  private normalizeMissionTasks(value: unknown): MissionTaskSetting[] {
    if (!Array.isArray(value)) {
      return defaultMissionTasks;
    }

    const tasks = value.slice(0, 12).flatMap((entry): MissionTaskSetting[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const task = entry as Partial<MissionTaskSetting>;
      const id = typeof task.id === "string" && task.id.trim() ? task.id.trim() : `mission-${Date.now()}`;
      const target = Number(task.target);
      const qualifyingDepositAmount = Number(task.qualifyingDepositAmount ?? defaultMissionQualifyingDepositAmount);
      const rewardAmount = Number(task.rewardAmount);
      const category = task.category === "daily" || task.category === "long-term" ? task.category : "limited";
      const rewardAsset = SUPPORTED_ASSETS.includes(task.rewardAsset as AssetType)
        ? task.rewardAsset as AssetType
        : "USDT_TRC20";

      if (
        !Number.isFinite(target) ||
        target < 1 ||
        !Number.isFinite(qualifyingDepositAmount) ||
        qualifyingDepositAmount < 0 ||
        !Number.isFinite(rewardAmount) ||
        rewardAmount < 0
      ) {
        return [];
      }

      return [
        {
          id,
          enabled: task.enabled !== false,
          category,
          title: typeof task.title === "string" && task.title.trim() ? task.title.trim() : "Mission task",
          description: typeof task.description === "string" ? task.description.trim() : "",
          target,
          qualifyingDepositAmount,
          rewardAmount,
          rewardAsset
        }
      ];
    });

    return tasks.length ? tasks : defaultMissionTasks;
  }

  private normalizeAssetSettings(settings: Map<string, unknown>): AssetRouteSetting[] {
    return SUPPORTED_ASSETS.map((asset) => {
      const enabledValue = settings.get(`asset.${asset}.enabled`);
      const fallback = DEFAULT_ASSET_ROUTE_SETTINGS.find((assetSetting) => assetSetting.asset === asset)!;

      return {
        asset,
        enabled: typeof enabledValue === "boolean" ? enabledValue : fallback.enabled,
        label: this.cleanSettingText(settings.get(`asset.${asset}.label`), DEFAULT_ASSET_LABELS[asset], 80),
        address: this.cleanOptionalSettingText(settings.get(`wallet.depositAddress.${asset}`), 500)
      };
    });
  }

  private normalizeLuckyDrawConfig(settings: Map<string, unknown>): LuckyDrawEventConfig {
    return this.normalizeLuckyDrawConfigFromInput({
      enabled: settings.get("platform.luckyDraw.enabled"),
      title: settings.get("platform.luckyDraw.title"),
      startsAt: settings.get("platform.luckyDraw.startsAt"),
      endsAt: settings.get("platform.luckyDraw.endsAt"),
      referralFirstDepositAmount: settings.get("platform.luckyDraw.referralFirstDepositAmount"),
      referralSpinReward: settings.get("platform.luckyDraw.referralSpinReward"),
      depositOneSpinAmount: settings.get("platform.luckyDraw.depositOneSpinAmount"),
      depositTwoSpinAmount: settings.get("platform.luckyDraw.depositTwoSpinAmount"),
      maxTotalRewardAmount: settings.get("platform.luckyDraw.maxTotalRewardAmount"),
      maxRewardPerUserAmount: settings.get("platform.luckyDraw.maxRewardPerUserAmount"),
      instantRewardMaxAmount: settings.get("platform.luckyDraw.instantRewardMaxAmount"),
      requireKycAboveAmount: settings.get("platform.luckyDraw.requireKycAboveAmount"),
      showPrizeChancesToUsers: settings.get("platform.luckyDraw.showPrizeChancesToUsers"),
      rules: settings.get("platform.luckyDraw.rules"),
      prizeLabels: settings.get("platform.luckyDraw.prizeLabels"),
      prizes: settings.get("platform.luckyDraw.prizes")
    });
  }

  private normalizeLuckyDrawConfigFromInput(value: Partial<LuckyDrawEventConfig> | Record<string, unknown>): LuckyDrawEventConfig {
    const depositOneSpinAmount = this.cleanPositiveNumber(value.depositOneSpinAmount, defaultLuckyDrawConfig.depositOneSpinAmount);
    const depositTwoSpinAmount = this.cleanPositiveNumber(value.depositTwoSpinAmount, defaultLuckyDrawConfig.depositTwoSpinAmount);
    const legacyPrizeLabels = this.cleanTextList(value.prizeLabels, defaultLuckyDrawConfig.prizeLabels, 12, 120);
    const prizes = this.normalizeLuckyDrawPrizes(value.prizes, legacyPrizeLabels);

    return {
      enabled: typeof value.enabled === "boolean" ? value.enabled : defaultLuckyDrawConfig.enabled,
      title: this.cleanSettingText(value.title, defaultLuckyDrawConfig.title, 120),
      startsAt: this.cleanIsoDate(value.startsAt, defaultLuckyDrawConfig.startsAt),
      endsAt: this.cleanIsoDate(value.endsAt, defaultLuckyDrawConfig.endsAt),
      referralFirstDepositAmount: this.cleanPositiveNumber(
        value.referralFirstDepositAmount,
        defaultLuckyDrawConfig.referralFirstDepositAmount
      ),
      referralSpinReward: this.cleanPositiveInteger(value.referralSpinReward, defaultLuckyDrawConfig.referralSpinReward),
      depositOneSpinAmount,
      depositTwoSpinAmount: Math.max(depositTwoSpinAmount, depositOneSpinAmount),
      maxTotalRewardAmount: this.cleanPositiveNumber(value.maxTotalRewardAmount, defaultLuckyDrawConfig.maxTotalRewardAmount),
      maxRewardPerUserAmount: this.cleanPositiveNumber(
        value.maxRewardPerUserAmount,
        defaultLuckyDrawConfig.maxRewardPerUserAmount
      ),
      instantRewardMaxAmount: this.cleanPositiveNumber(value.instantRewardMaxAmount, defaultLuckyDrawConfig.instantRewardMaxAmount),
      requireKycAboveAmount: this.cleanPositiveNumber(value.requireKycAboveAmount, defaultLuckyDrawConfig.requireKycAboveAmount),
      showPrizeChancesToUsers: typeof value.showPrizeChancesToUsers === "boolean"
        ? value.showPrizeChancesToUsers
        : defaultLuckyDrawConfig.showPrizeChancesToUsers,
      rules: this.cleanTextList(value.rules, defaultLuckyDrawConfig.rules, 8, 220),
      prizeLabels: prizes.map((prize) => prize.label),
      prizes
    };
  }

  private normalizeLuckyDrawPrizes(value: unknown, labelFallback: string[]): LuckyDrawPrize[] {
    if (!Array.isArray(value)) {
      const labels = labelFallback.length ? labelFallback : defaultLuckyDrawConfig.prizeLabels;
      const chance = Number((100 / labels.length).toFixed(2));
      return labels.slice(0, 12).map((label, index) => ({
        id: `legacy-prize-${index + 1}`,
        label,
        chance,
        rewardAmount: 0,
        rewardAsset: "USDT_TRC20"
      }));
    }

    const prizes = value.slice(0, 12).flatMap((entry, index): LuckyDrawPrize[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const prize = entry as Partial<LuckyDrawPrize>;
      const fallback = defaultLuckyDrawPrizes[index % defaultLuckyDrawPrizes.length];
      const label = this.cleanSettingText(prize.label, fallback.label, 120);
      const chance = Number(prize.chance);
      const rewardAmount = Number(prize.rewardAmount ?? 0);
      const maxWinners = Number(prize.maxWinners);
      const maxTotalRewardAmount = Number(prize.maxTotalRewardAmount);
      const rewardAsset = SUPPORTED_ASSETS.includes(prize.rewardAsset as AssetType)
        ? prize.rewardAsset as AssetType
        : "USDT_TRC20";
      const id =
        typeof prize.id === "string" && prize.id.trim()
          ? prize.id.trim().replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)
          : `lucky-prize-${index + 1}`;

      if (!label || !Number.isFinite(chance) || chance <= 0) {
        return [];
      }

      return [
        {
          id,
          label,
          chance: Number(chance.toFixed(4)),
          rewardAmount: Number.isFinite(rewardAmount) && rewardAmount > 0 ? Number(rewardAmount.toFixed(2)) : 0,
          rewardAsset,
          maxWinners: Number.isInteger(maxWinners) && maxWinners > 0 ? maxWinners : null,
          maxTotalRewardAmount: Number.isFinite(maxTotalRewardAmount) && maxTotalRewardAmount > 0
            ? Number(maxTotalRewardAmount.toFixed(2))
            : null,
          reviewRequired: prize.reviewRequired === true
        }
      ];
    });

    return prizes.length ? prizes : defaultLuckyDrawPrizes;
  }

  private normalizeAssetRouteSettings(value: unknown): AssetRouteSetting[] {
    if (!Array.isArray(value)) {
      return DEFAULT_ASSET_ROUTE_SETTINGS;
    }

    return SUPPORTED_ASSETS.map((asset) => {
      const fallback = DEFAULT_ASSET_ROUTE_SETTINGS.find((assetSetting) => assetSetting.asset === asset)!;
      const submitted = value.find((entry): entry is Partial<AssetRouteSetting> => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        return (entry as Partial<AssetRouteSetting>).asset === asset;
      });

      return {
        asset,
        enabled: typeof submitted?.enabled === "boolean" ? submitted.enabled : fallback.enabled,
        label: this.cleanSettingText(submitted?.label, fallback.label, 80),
        address: this.cleanOptionalSettingText(submitted?.address, 500)
      };
    });
  }

  private cleanSettingText(value: unknown, fallback: string, maxLength: number) {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();
    return (trimmed || fallback).slice(0, maxLength);
  }

  private cleanOptionalSettingText(value: unknown, maxLength: number) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().slice(0, maxLength);
  }

  private cleanIsoDate(value: unknown, fallback: string) {
    if (typeof value !== "string") {
      return fallback;
    }

    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
  }

  private cleanPositiveNumber(value: unknown, fallback: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  private cleanPositiveInteger(value: unknown, fallback: number) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : fallback;
  }

  private cleanTextList(value: unknown, fallback: string[], maxItems: number, maxLength: number) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const items = value.slice(0, maxItems).flatMap((item) => {
      if (typeof item !== "string") {
        return [];
      }

      const text = item.trim().slice(0, maxLength);
      return text ? [text] : [];
    });

    return items.length ? items : fallback;
  }
}
