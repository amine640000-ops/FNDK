import { Injectable, OnModuleInit } from "@nestjs/common";
import { dbQuery, getOne, publishEvent, subscribeToEvents } from "@nevo/shared-infra";
import type { RabbitEventMap } from "@nevo/shared-types";

type VipTierRow = {
  id: number;
  name: string;
  min_deposit: number;
  daily_roi_min: number;
  daily_roi_max: number;
  required_direct_members: number;
  activation_limit_per_day: number;
  activation_duration_minutes: number;
  activation_assets: Array<"BTC" | "ETH" | "USDT_TRC20" | "USDT_ERC20" | "USD" | "EUR" | "GBP" | "STOCKS">;
  features: string[];
};

const MINIMUM_VALID_MEMBER_ACTIVATION_DEPOSIT = 50;

@Injectable()
export class VipService implements OnModuleInit {
  async onModuleInit() {
    await subscribeToEvents("vip-service", {
      "user.registered": async ({ userId }: RabbitEventMap["user.registered"]) => {
        await this.ensureStartingTier(userId);
      },
      "deposit.confirmed": async ({ userId }: RabbitEventMap["deposit.confirmed"]) => {
        await this.recalculateTier(userId);
        await this.recalculateReferrerTier(userId);
      },
      "withdrawal.approved": async ({ userId }: RabbitEventMap["withdrawal.approved"]) => {
        await this.recalculateTier(userId);
      }
    });
  }

  async getTiers() {
    const result = await dbQuery<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
        FROM vip_tiers
        ORDER BY min_deposit ASC
      `
    );

    return result.rows.map((tier: VipTierRow) => ({
      id: tier.id,
      name: tier.name,
      minDeposit: tier.min_deposit,
      dailyRoiMin: tier.daily_roi_min,
      dailyRoiMax: tier.daily_roi_max,
      dailyRoi: tier.daily_roi_max,
      monthlyRoi: Number((tier.daily_roi_max * 30).toFixed(2)),
      requiredDirectMembers: tier.required_direct_members,
      activationLimitPerDay: tier.activation_limit_per_day,
      activationDurationMinutes: tier.activation_duration_minutes,
      activationAssets: tier.activation_assets,
      features: tier.features
    }));
  }

  async getCurrentTier(userId: string) {
    const current = await this.getLatestTierAssignment(userId);
    const activeInvestment = await this.getEffectiveInvestment(userId);
    return {
      ...current,
      activeInvestment
    };
  }

  async getNextUpgrade(userId: string) {
    const tiers = await this.getTiers();
    const activeInvestment = await this.getEffectiveInvestment(userId);
    const currentTier = await this.getLatestTierAssignment(userId);
    const validDirectMembers = await this.getValidDirectMemberCount(userId);
    const nextTier = tiers.find((tier: { id: number }) => tier.id > currentTier.id) ?? null;

    return {
      currentTier,
      nextTier,
      activeInvestment,
      validDirectMembers,
      amountRequired: nextTier ? Math.max(nextTier.minDeposit - activeInvestment, 0) : 0,
      directMembersRequired: nextTier ? Math.max(nextTier.requiredDirectMembers - validDirectMembers, 0) : 0
    };
  }

  private async ensureStartingTier(userId: string) {
    const existing = await getOne<{ tier_id: number }>("SELECT tier_id FROM user_vip WHERE user_id = $1 LIMIT 1", [userId]);
    if (existing) {
      return;
    }

    await dbQuery(
      `
        INSERT INTO user_vip (id, user_id, tier_id)
        VALUES (gen_random_uuid(), $1, 1)
      `,
      [userId]
    );
  }

  private async recalculateTier(userId: string) {
    const latestAssignment = await getOne<{ tier_id: number }>(
      `
        SELECT tier_id
        FROM user_vip
        WHERE user_id = $1
        ORDER BY assigned_at DESC
        LIMIT 1
      `,
      [userId]
    );
    const previous = await this.getLatestTierAssignment(userId);
    const activeInvestment = await this.getEffectiveInvestment(userId);
    const validDirectMembers = await this.getValidDirectMemberCount(userId);
    const nextTier = await this.getTierDefinitionForEligibility(activeInvestment, validDirectMembers);

    if (latestAssignment && previous.id === nextTier.id) {
      return;
    }

    await dbQuery(
      `
        INSERT INTO user_vip (id, user_id, tier_id)
        VALUES (gen_random_uuid(), $1, $2)
      `,
      [userId, nextTier.id]
    );

    await publishEvent("vip.upgraded", {
      userId,
      previousTierId: previous.id,
      nextTierId: nextTier.id,
      assignedAt: new Date().toISOString()
    });
  }

  private async recalculateReferrerTier(userId: string) {
    const referrer = await getOne<{ referred_by: string | null }>(
      `
        SELECT referred_by
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (referrer?.referred_by) {
      await this.recalculateTier(referrer.referred_by);
    }
  }

  private async getLatestTierAssignment(userId: string) {
    const assignedTier = await getOne<VipTierRow>(
      `
        SELECT
          vt.id,
          vt.name,
          vt.min_deposit::float8 AS min_deposit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.required_direct_members,
          vt.activation_limit_per_day,
          vt.activation_duration_minutes,
          vt.activation_assets,
          vt.features
        FROM user_vip uv
        JOIN vip_tiers vt ON vt.id = uv.tier_id
        WHERE uv.user_id = $1
        ORDER BY uv.assigned_at DESC
        LIMIT 1
      `,
      [userId]
    );

    if (assignedTier) {
      return this.mapTier(assignedTier);
    }

    const activeInvestment = await this.getEffectiveInvestment(userId);
    const validDirectMembers = await this.getValidDirectMemberCount(userId);
    const derivedTier = await this.getTierDefinitionForEligibility(activeInvestment, validDirectMembers);
    return this.mapTier(derivedTier);
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
          AND activation_funding >= $2
      `,
      [userId, MINIMUM_VALID_MEMBER_ACTIVATION_DEPOSIT]
    );

    return result?.valid_direct_members ?? 0;
  }

  private async getTierDefinitionForEligibility(activeInvestment: number, validDirectMembers: number) {
    const tier = await getOne<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
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

    if (tier) {
      return tier;
    }

    return (await getOne<VipTierRow>(
      `
        SELECT
          id,
          name,
          min_deposit::float8 AS min_deposit,
          daily_roi_min::float8 AS daily_roi_min,
          daily_roi_max::float8 AS daily_roi_max,
          required_direct_members,
          activation_limit_per_day,
          activation_duration_minutes,
          activation_assets,
          features
        FROM vip_tiers
        ORDER BY min_deposit ASC
        LIMIT 1
      `
    ))!;
  }

  private mapTier(tier: VipTierRow) {
    return {
      id: tier.id,
      name: tier.name,
      minDeposit: tier.min_deposit,
      dailyRoiMin: tier.daily_roi_min,
      dailyRoiMax: tier.daily_roi_max,
      dailyRoi: tier.daily_roi_max,
      monthlyRoi: Number((tier.daily_roi_max * 30).toFixed(2)),
      requiredDirectMembers: tier.required_direct_members,
      activationLimitPerDay: tier.activation_limit_per_day,
      activationDurationMinutes: tier.activation_duration_minutes,
      activationAssets: tier.activation_assets,
      features: tier.features
    };
  }
}
