import { Injectable, OnModuleInit } from "@nestjs/common";
import { dbQuery, getOne, publishEvent, subscribeToEvents } from "@nevo/shared-infra";
import type { RabbitEventMap } from "@nevo/shared-types";

type VipTierRow = {
  id: number;
  name: string;
  min_deposit: number;
  daily_roi_min: number;
  daily_roi_max: number;
  activation_limit_per_day: number;
  activation_duration_minutes: number;
  activation_assets: Array<"BTC" | "ETH" | "USDT_TRC20" | "USDT_ERC20" | "USD" | "EUR" | "GBP" | "STOCKS">;
  features: string[];
};

@Injectable()
export class VipService implements OnModuleInit {
  async onModuleInit() {
    await subscribeToEvents("vip-service", {
      "user.registered": async ({ userId }: RabbitEventMap["user.registered"]) => {
        await this.ensureStartingTier(userId);
      },
      "deposit.confirmed": async ({ userId }: RabbitEventMap["deposit.confirmed"]) => {
        await this.recalculateTier(userId);
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
    const nextTier = tiers.find((tier: { minDeposit: number }) => tier.minDeposit > currentTier.minDeposit) ?? null;

    return {
      currentTier,
      nextTier,
      amountRequired: nextTier ? Math.max(nextTier.minDeposit - activeInvestment, 0) : 0
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
    const nextTier = await this.getTierDefinitionForInvestment(activeInvestment);

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

  private async getLatestTierAssignment(userId: string) {
    const assignedTier = await getOne<VipTierRow>(
      `
        SELECT
          vt.id,
          vt.name,
          vt.min_deposit::float8 AS min_deposit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
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
    const derivedTier = await this.getTierDefinitionForInvestment(activeInvestment);
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

  private async getTierDefinitionForInvestment(activeInvestment: number) {
    const tier = await getOne<VipTierRow>(
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
      activationLimitPerDay: tier.activation_limit_per_day,
      activationDurationMinutes: tier.activation_duration_minutes,
      activationAssets: tier.activation_assets,
      features: tier.features
    };
  }
}
