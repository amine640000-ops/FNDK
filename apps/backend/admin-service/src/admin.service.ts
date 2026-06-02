import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { dbQuery, getOne, publishEvent, withTransaction } from "@nevo/shared-infra";
import type {
  AdCarouselSlide,
  AdminOverviewMetrics,
  AdminPlatformSettings,
  AssetRouteSetting,
  AssetType,
  MissionTaskSetting,
  TransactionType,
  VipTier
} from "@nevo/shared-types";
import { DEFAULT_ASSET_LABELS, DEFAULT_ASSET_ROUTE_SETTINGS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import type { PoolClient } from "pg";
import type { AdjustUserBalanceDto, UpdateAdminSettingsDto, UpdateVipTierDto } from "./admin.dto";

type AdminSettingValue = string | number | boolean | null | AdCarouselSlide[] | AssetRouteSetting[] | MissionTaskSetting[];

const maxAdCarouselSlides = 8;

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
    rewardAmount: 300,
    rewardAsset: "USDT_TRC20"
  }
];

type UserRow = {
  id: string;
  public_id: string;
  full_name: string;
  email: string;
  kyc_status: string;
  created_at: string;
  vip_tier: string | null;
  balance: number;
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

type VipTierRow = {
  id: number;
  name: string;
  min_deposit: number;
  daily_roi_min: number;
  daily_roi_max: number;
  activation_limit_per_day: number;
  activation_duration_minutes: number;
  activation_assets: AssetType[];
  features: string[];
};

@Injectable()
export class AdminService {
  async getVipTiers(): Promise<VipTier[]> {
    const result = await dbQuery<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
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
        )
        SELECT
          u.id,
          u.public_id,
          u.full_name,
          u.email,
          u.kyc_status,
          u.created_at,
          lv.vip_tier,
          COALESCE(SUM(w.balance), 0)::float8 AS balance,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'asset', w.asset_type,
                'balance', w.balance::float8,
                'activeInvestment', w.active_investment::float8
              )
              ORDER BY w.asset_type
            ) FILTER (WHERE w.id IS NOT NULL),
            '[]'::jsonb
          ) AS wallets
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        LEFT JOIN latest_vip lv ON lv.user_id = u.id
        WHERE u.role = 'USER'
        GROUP BY u.id, u.public_id, u.full_name, u.email, u.kyc_status, u.created_at, lv.vip_tier
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
      wallets: user.wallets,
      kycStatus: user.kyc_status,
      joinDate: user.created_at
    }));
  }

  async adjustUserBalance(userId: string, input: AdjustUserBalanceDto) {
    const adjustmentAmount = Number(input.amount.toFixed(2));
    if ((input.operation === "add" || input.operation === "subtract") && adjustmentAmount <= 0) {
      throw new BadRequestException("Adjustment amount must be greater than 0");
    }

    const note = input.note?.trim();
    const result = await withTransaction(async (client: PoolClient) => {
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
      const delta =
        input.operation === "add"
          ? adjustmentAmount
          : input.operation === "subtract"
            ? -adjustmentAmount
            : Number((adjustmentAmount - previousBalance).toFixed(2));
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
          [
            `Admin balance ${input.operation}`,
            `Previous: ${previousBalance}`,
            `Current: ${nextBalance}`,
            note ? `Note: ${note}` : null
          ]
            .filter(Boolean)
            .join(" | ")
        ]
      );

      await client.query(
        `
          INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
        `,
        [
          userId,
          "Balance adjusted",
          `Your ${input.asset} balance was updated from ${previousBalance} to ${nextBalance}.${note ? ` Note: ${note}` : ""}`
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

  async approveTransaction(transactionId: string) {
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

      return transaction;
    });

    if (approved.type === "deposit") {
      await publishEvent("deposit.confirmed", {
        transactionId: approved.id,
        userId: approved.user_id,
        amount: approved.amount,
        asset: approved.asset,
        approvedBy: "system-admin"
      });
    }

    if (approved.type === "withdrawal") {
      await publishEvent("withdrawal.approved", {
        transactionId: approved.id,
        userId: approved.user_id,
        amount: approved.amount,
        asset: approved.asset,
        approvedBy: "system-admin"
      });
    }

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

    return {
      transactionId: approved.id,
      status: "approved",
      type: approved.type,
      approvedAt: new Date().toISOString()
    };
  }

  async rejectTransaction(transactionId: string, adminNote?: string) {
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
          `${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} rejected`,
          transaction.type === "deposit"
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

    const updated = await getOne<VipTierRow>(
      `
        UPDATE vip_tiers
        SET
          name = COALESCE($2, name),
          min_deposit = COALESCE($3, min_deposit),
          daily_roi_min = COALESCE($4, daily_roi_min),
          daily_roi_max = COALESCE($5, daily_roi_max),
          daily_roi = COALESCE($5, daily_roi_max, daily_roi),
          activation_limit_per_day = COALESCE($6, activation_limit_per_day),
          activation_duration_minutes = COALESCE($7, activation_duration_minutes)
        WHERE id = $1
        RETURNING
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
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
        input.activationLimitPerDay ?? null,
        input.activationDurationMinutes ?? null
      ]
    );

    return this.mapVipTier(updated!);
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
      const targetTier = await getOne<VipTierRow>(
        `
          SELECT
            id,
            name,
            min_deposit::float8 AS min_deposit,
            daily_roi_min::float8 AS daily_roi_min,
            daily_roi_max::float8 AS daily_roi_max,
            activation_limit_per_day,
            activation_duration_minutes,
            activation_assets,
            features
          FROM vip_tiers
          WHERE min_deposit <= $1
          ORDER BY min_deposit DESC
          LIMIT 1
        `,
        [activeInvestment]
      );

      const starterTier = targetTier ?? (await getOne<VipTierRow>(
        `
          SELECT
            id,
            name,
            min_deposit::float8 AS min_deposit,
            daily_roi_min::float8 AS daily_roi_min,
            daily_roi_max::float8 AS daily_roi_max,
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
          RETURNING id, user_id
        `,
        [submissionId, status, adminNote ?? null]
      );

      if (!submission.rowCount) {
        throw new NotFoundException("KYC submission not found");
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
      const rewardAmount = Number(task.rewardAmount);
      const category = task.category === "daily" || task.category === "long-term" ? task.category : "limited";
      const rewardAsset = SUPPORTED_ASSETS.includes(task.rewardAsset as AssetType)
        ? task.rewardAsset as AssetType
        : "USDT_TRC20";

      if (!Number.isFinite(target) || target < 1 || !Number.isFinite(rewardAmount) || rewardAmount < 0) {
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
}
