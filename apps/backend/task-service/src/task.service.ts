import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { dbQuery, ensureVipDailyProfitCapColumn, getOne, hashSecurityPasscode, publishEvent, withTransaction } from "@nevo/shared-infra";
import type {
  AiTradingActivation,
  AssetType,
  MissionTaskProgress,
  MissionTaskSetting,
  ProfitDistributionEvent,
  VipTier
} from "@nevo/shared-types";
import { calculateDailyProfit, getTierConfig } from "@nevo/shared-utils";
import type { PoolClient } from "pg";

type DistributionCandidate = {
  user_id: string;
  tier_id: number;
  daily_roi_min: number;
  daily_roi_max: number;
  daily_profit_cap: number | null;
  active_investment: number;
};

type ActivationTierRow = {
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
  active_investment: number;
  valid_direct_members: number;
};

type ActivationRow = {
  id: string;
  tier_id: number;
  tier_name: string;
  asset: AssetType;
  strategy: string;
  market_summary: string;
  thesis: string;
  status: "running" | "completed" | "expired" | "failed";
  duration_minutes: number;
  daily_slot_number: number;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
  reservation_amount: number;
  entry_price: number | null;
  exit_price: number | null;
  profit: number | null;
  daily_limit: number;
  daily_roi_min?: number;
  daily_roi_max?: number;
  daily_profit_cap?: number | null;
};

type ReservationRulesRow = {
  reservation_failures_per_day: number;
};

type SecurityPasscodeRow = {
  security_passcode_hash: string | null;
};

type ReservationDayUsageRow = {
  activation_count: number;
  failed_activation_count: number;
  window_starts_at: string;
  window_ends_at: string;
};

type ReservationEligibilityRow = {
  kyc_status: "pending" | "verified" | "rejected";
  has_activation_deposit: boolean;
};

type TeamMemberRow = {
  id: string;
  public_id: string;
  full_name: string;
  generation: 1 | 2 | 3;
  kyc_status: "pending" | "verified" | "rejected";
  joined_at: string;
  total_deposited: number;
  referral_gain: number;
  today_referral_gain: number;
  active: boolean;
  active_today: boolean;
  activated_at: string | null;
};

type MissionClaimRow = {
  task_id: string;
  reward_amount: number;
};

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

const MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT = 50;
const MINIMUM_VALID_MEMBER_ACTIVATION_DEPOSIT = 50;

@Injectable()
export class TaskService implements OnModuleInit {
  private readonly reservationTimeZone = process.env.RESERVATION_TIME_ZONE ?? "Africa/Tunis";

  async onModuleInit() {
    await ensureVipDailyProfitCapColumn();
  }

  async getStatus() {
    const settings = await getOne<{ value: boolean }>(
      `
        SELECT (value #>> '{}')::boolean AS value
        FROM admin_settings
        WHERE key = 'platform.autoProfitDistribution'
      `
    );

    return {
      autoProfitDistribution: settings?.value ?? true,
      manualActivationEnabled: true,
      nextRunAt: "2026-03-18T00:05:00.000Z",
      strategyUniverse: ["Crypto Momentum", "Forex Mean Reversion", "US Index Rotation"]
    };
  }

  async getManualActivationState(userId: string) {
    await this.finalizeDueActivations(userId);

    const tier = await this.getTierForUser(userId);
    const reservationDayUsage = await this.getReservationDayUsage(userId);
    const reservationEligibility = await this.getReservationEligibility(userId);

    const runningActivation = await getOne<ActivationRow>(
      `
        SELECT
          ata.id,
          ata.tier_id,
          vt.name AS tier_name,
          ata.asset,
          ata.strategy,
          ata.market_summary,
          ata.thesis,
          ata.status,
          ata.duration_minutes,
          ata.daily_slot_number,
          ata.started_at,
          ata.ends_at,
          ata.completed_at,
          ata.reservation_amount::float8 AS reservation_amount,
          ata.entry_price::float8 AS entry_price,
          ata.exit_price::float8 AS exit_price,
          ata.profit::float8 AS profit,
          vt.activation_limit_per_day AS daily_limit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap
        FROM ai_trading_activations ata
        JOIN vip_tiers vt ON vt.id = ata.tier_id
        WHERE ata.user_id = $1
          AND ata.status = 'running'
          AND ata.ends_at > NOW()
        ORDER BY ata.started_at DESC
        LIMIT 1
      `,
      [userId]
    );

    const history = await dbQuery<ActivationRow>(
      `
        SELECT
          ata.id,
          ata.tier_id,
          vt.name AS tier_name,
          ata.asset,
          ata.strategy,
          ata.market_summary,
          ata.thesis,
          ata.status,
          ata.duration_minutes,
          ata.daily_slot_number,
          ata.started_at,
          ata.ends_at,
          ata.completed_at,
          ata.reservation_amount::float8 AS reservation_amount,
          ata.entry_price::float8 AS entry_price,
          ata.exit_price::float8 AS exit_price,
          ata.profit::float8 AS profit,
          vt.activation_limit_per_day AS daily_limit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap
        FROM ai_trading_activations ata
        JOIN vip_tiers vt ON vt.id = ata.tier_id
        WHERE ata.user_id = $1
        ORDER BY ata.started_at DESC
        LIMIT 8
      `,
      [userId]
    );

    return {
      currentTier: this.mapTierRow(tier),
      activeInvestment: tier.active_investment,
      validDirectMembers: tier.valid_direct_members,
      accountVerified: reservationEligibility.kyc_status === "verified",
      accountFunded: reservationEligibility.has_activation_deposit,
      accountActive: reservationEligibility.kyc_status === "verified" && reservationEligibility.has_activation_deposit,
      minimumActivationDeposit: MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT,
      runningActivation: runningActivation ? this.mapActivation(runningActivation) : null,
      remainingActivationsToday: Math.max(tier.activation_limit_per_day - reservationDayUsage.activation_count, 0),
      usedActivationsToday: reservationDayUsage.activation_count,
      reservationWindowStartsAt: reservationDayUsage.window_starts_at,
      reservationWindowEndsAt: reservationDayUsage.window_ends_at,
      history: history.rows.map((activation) => this.mapActivation(activation))
    };
  }

  async getMissionCenter(userId: string) {
    const tasks = await this.getMissionTaskSettings();
    const missionEligibility = await this.getReservationEligibility(userId);
    const missionsActive = missionEligibility.kyc_status === "verified" && missionEligibility.has_activation_deposit;
    const referralCount = missionsActive
      ? await getOne<{ count: number }>(
          `
            WITH deposit_totals AS (
              SELECT
                user_id,
                COALESCE(SUM(amount), 0)::float8 AS total_deposited
              FROM transactions
              WHERE type = 'deposit'
                AND status = 'approved'
              GROUP BY user_id
            ),
            admin_activation_totals AS (
              SELECT
                user_id,
                COALESCE(SUM(amount), 0)::float8 AS total_admin_activated
              FROM transactions
              WHERE type = 'adjustment'
                AND status = 'approved'
                AND amount > 0
              GROUP BY user_id
            ),
            active_accounts AS (
              SELECT users.id AS user_id
              FROM users
              LEFT JOIN deposit_totals
                ON deposit_totals.user_id = users.id
              LEFT JOIN admin_activation_totals
                ON admin_activation_totals.user_id = users.id
              WHERE users.kyc_status = 'verified'
                AND COALESCE(deposit_totals.total_deposited, 0)
                  + COALESCE(admin_activation_totals.total_admin_activated, 0) >= $2
            )
            SELECT COUNT(*)::int AS count
            FROM users
            INNER JOIN active_accounts
              ON active_accounts.user_id = users.id
            WHERE users.referred_by = $1
              AND users.role = 'USER'
          `,
          [userId, MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT]
        )
      : null;

    const progress = referralCount?.count ?? 0;
    const missionTasks: MissionTaskProgress[] = tasks
      .filter((task) => task.enabled)
      .map((task) => ({
        ...task,
        progress: Math.min(progress, task.target),
        completed: missionsActive && progress >= task.target,
        rewardClaimed: false
      }));

    if (missionsActive) {
      await this.creditCompletedMissionRewards(userId, missionTasks.filter((task) => task.completed));
    }

    const claimedResult = await dbQuery<MissionClaimRow>(
      `
        SELECT
          task_id,
          reward_amount::float8 AS reward_amount
        FROM mission_task_claims
        WHERE user_id = $1
      `,
      [userId]
    );
    const claimedTaskIds = new Set(claimedResult.rows.map((claim) => claim.task_id));
    const tasksWithClaims = missionTasks.map((task) => ({
      ...task,
      rewardClaimed: claimedTaskIds.has(task.id)
    }));

    return {
      missionsActive,
      minimumActivationDeposit: MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT,
      totalRewardAmount: claimedResult.rows.reduce((sum, claim) => sum + claim.reward_amount, 0),
      tasks: tasksWithClaims
    };
  }

  async getTeamSummary(userId: string) {
    const result = await dbQuery<TeamMemberRow>(
      `
        WITH RECURSIVE team AS (
          SELECT
            id,
            public_id,
            full_name,
            kyc_status,
            created_at,
            1 AS generation
          FROM users
          WHERE referred_by = $1
            AND role = 'USER'

          UNION ALL

          SELECT
            u.id,
            u.public_id,
            u.full_name,
            u.kyc_status,
            u.created_at,
            team.generation + 1 AS generation
          FROM users u
          INNER JOIN team ON u.referred_by = team.id
          WHERE team.generation < 3
            AND u.role = 'USER'
        ),
        deposit_totals AS (
          SELECT
            user_id,
            COALESCE(SUM(amount), 0)::float8 AS total_deposited
          FROM transactions
          WHERE type = 'deposit'
            AND status = 'approved'
          GROUP BY user_id
        ),
        admin_activation_totals AS (
          SELECT
            user_id,
            COALESCE(SUM(amount), 0)::float8 AS total_admin_activated
          FROM transactions
          WHERE type = 'adjustment'
            AND status = 'approved'
            AND amount > 0
          GROUP BY user_id
        ),
        funding_progress AS (
          SELECT
            user_id,
            created_at,
            SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS cumulative_funding
          FROM transactions
          WHERE type IN ('deposit', 'adjustment')
            AND status = 'approved'
            AND amount > 0
        ),
        funding_thresholds AS (
          SELECT
            user_id,
            MIN(created_at) FILTER (WHERE cumulative_funding >= $2) AS funded_at
          FROM funding_progress
          GROUP BY user_id
        ),
        kyc_verified AS (
          SELECT
            user_id,
            MAX(reviewed_at) AS verified_at
          FROM kyc_submissions
          WHERE status = 'verified'
          GROUP BY user_id
        ),
        active_accounts AS (
          SELECT
            users.id AS user_id,
            GREATEST(
              funding_thresholds.funded_at,
              COALESCE(kyc_verified.verified_at, funding_thresholds.funded_at)
            ) AS activated_at
          FROM users
          INNER JOIN funding_thresholds
            ON funding_thresholds.user_id = users.id
          LEFT JOIN deposit_totals
            ON deposit_totals.user_id = users.id
          LEFT JOIN admin_activation_totals
            ON admin_activation_totals.user_id = users.id
          LEFT JOIN kyc_verified
            ON kyc_verified.user_id = users.id
          WHERE users.kyc_status = 'verified'
            AND funding_thresholds.funded_at IS NOT NULL
            AND COALESCE(deposit_totals.total_deposited, 0)
              + COALESCE(admin_activation_totals.total_admin_activated, 0) >= $2
        ),
        referral_gains AS (
          SELECT
            referred_id,
            COALESCE(SUM(bonus_amount), 0)::float8 AS referral_gain,
            COALESCE(SUM(bonus_amount) FILTER (WHERE paid_at::date = CURRENT_DATE), 0)::float8 AS today_referral_gain
          FROM referrals
          WHERE referrer_id = $1
          GROUP BY referred_id
        )
        SELECT
          team.id,
          team.public_id,
          team.full_name,
          team.generation::int AS generation,
          team.kyc_status,
          team.created_at AS joined_at,
          COALESCE(deposit_totals.total_deposited, 0)::float8 AS total_deposited,
          COALESCE(referral_gains.referral_gain, 0)::float8 AS referral_gain,
          COALESCE(referral_gains.today_referral_gain, 0)::float8 AS today_referral_gain,
          (active_accounts.user_id IS NOT NULL) AS active,
          COALESCE(active_accounts.activated_at::date = CURRENT_DATE, FALSE) AS active_today,
          active_accounts.activated_at
        FROM team
        LEFT JOIN deposit_totals
          ON deposit_totals.user_id = team.id
        LEFT JOIN active_accounts
          ON active_accounts.user_id = team.id
        LEFT JOIN referral_gains
          ON referral_gains.referred_id = team.id
        ORDER BY team.generation ASC, active DESC, team.created_at DESC
      `,
      [userId, MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT]
    );

    const teamMembers = result.rows;
    const generations = ([1, 2, 3] as const).map((generation) => {
      const generationMembers = teamMembers.filter((member) => member.generation === generation);

      return {
        generation,
        members: generationMembers.filter((member) => member.active).length,
        registeredMembers: generationMembers.length,
        todayMembers: generationMembers.filter((member) => member.active_today).length,
        income: generationMembers.reduce((sum, member) => sum + member.referral_gain, 0),
        todayIncome: generationMembers.reduce((sum, member) => sum + member.today_referral_gain, 0)
      };
    });

    return {
      totalMembers: generations.reduce((sum, generation) => sum + generation.members, 0),
      totalRegisteredMembers: generations.reduce((sum, generation) => sum + generation.registeredMembers, 0),
      todayMembers: generations.reduce((sum, generation) => sum + generation.todayMembers, 0),
      totalTeamRevenue: generations.reduce((sum, generation) => sum + generation.income, 0),
      todayTeamRevenue: generations.reduce((sum, generation) => sum + generation.todayIncome, 0),
      generations,
      members: teamMembers.map((member) => ({
        id: member.id,
        publicId: member.public_id,
        fullName: member.full_name,
        generation: member.generation,
        kycStatus: member.kyc_status,
        joinedAt: member.joined_at,
        totalDeposited: member.total_deposited,
        referralGain: member.referral_gain,
        active: member.active,
        activatedAt: member.activated_at
      }))
    };
  }

  async startManualActivation(userId: string, reservationAmount?: number, securityPasscode?: string) {
    await this.finalizeDueActivations(userId);
    const reservationEligibility = await this.getReservationEligibility(userId);
    this.assertReservationEligibility(reservationEligibility);
    await this.verifySecurityPasscode(userId, securityPasscode);
    const tier = await this.getTierForUser(userId);

    if (tier.active_investment <= 0) {
      throw new BadRequestException("Activate a VIP tier with an approved deposit before starting AI trading.");
    }

    const reservationDayUsage = await this.getReservationDayUsage(userId);

    const runningActivation = await getOne<ActivationRow>(
      `
        SELECT
          ata.id,
          ata.tier_id,
          vt.name AS tier_name,
          ata.asset,
          ata.strategy,
          ata.market_summary,
          ata.thesis,
          ata.status,
          ata.duration_minutes,
          ata.daily_slot_number,
          ata.started_at,
          ata.ends_at,
          ata.completed_at,
          ata.reservation_amount::float8 AS reservation_amount,
          ata.entry_price::float8 AS entry_price,
          ata.exit_price::float8 AS exit_price,
          ata.profit::float8 AS profit,
          vt.activation_limit_per_day AS daily_limit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap
        FROM ai_trading_activations ata
        JOIN vip_tiers vt ON vt.id = ata.tier_id
        WHERE ata.user_id = $1
          AND ata.status = 'running'
          AND ata.ends_at > NOW()
        ORDER BY ata.started_at DESC
        LIMIT 1
      `,
      [userId]
    );

    if (runningActivation) {
      const expectedIncome = this.buildExpectedIncome(runningActivation.reservation_amount || tier.active_investment, {
        dailyRoiMin: tier.daily_roi_min,
        dailyRoiMax: tier.daily_roi_max,
        activationLimitPerDay: tier.activation_limit_per_day,
        dailyProfitCap: tier.daily_profit_cap,
        dailySlotNumber: runningActivation.daily_slot_number
      });

      return {
        outcome: "running" as const,
        message: "AI trading is already running. The current cycle is now active.",
        activation: this.mapActivation(runningActivation),
        expectedIncomeMin: expectedIncome.min,
        expectedIncomeMax: expectedIncome.max,
        remainingActivationsToday: Math.max(tier.activation_limit_per_day - reservationDayUsage.activation_count, 0)
      };
    }

    const usedActivations = reservationDayUsage.activation_count;
    if (usedActivations >= tier.activation_limit_per_day) {
      throw new BadRequestException(`Daily reservation limit reached for ${tier.name}. The next window starts at 5 AM.`);
    }

    const effectiveReservationAmount = Number((reservationAmount ?? tier.active_investment).toFixed(2));
    if (!Number.isFinite(effectiveReservationAmount) || effectiveReservationAmount <= 0) {
      throw new BadRequestException("Enter a reservation amount greater than zero.");
    }

    if (effectiveReservationAmount > tier.active_investment) {
      throw new BadRequestException("Reservation amount exceeds available strategy funds.");
    }

    const reservationRules = await getOne<ReservationRulesRow>(
      `
        SELECT
          COALESCE((SELECT (value #>> '{}')::int FROM admin_settings WHERE key = 'platform.reservationFailuresPerDay'), 0) AS reservation_failures_per_day
      `,
      []
    );

    const plan = this.buildActivationPlan(tier);
    const expectedIncome = this.buildExpectedIncome(effectiveReservationAmount, {
      dailyRoiMin: tier.daily_roi_min,
      dailyRoiMax: tier.daily_roi_max,
      activationLimitPerDay: tier.activation_limit_per_day,
      dailyProfitCap: tier.daily_profit_cap,
      dailySlotNumber: usedActivations + 1
    });

    if (reservationDayUsage.failed_activation_count < (reservationRules?.reservation_failures_per_day ?? 0)) {
      const failedActivation = await getOne<ActivationRow>(
        `
          INSERT INTO ai_trading_activations (
            id,
            user_id,
            tier_id,
            asset,
            strategy,
            market_summary,
            thesis,
            status,
            duration_minutes,
            daily_slot_number,
            started_at,
            ends_at,
            completed_at,
            reservation_amount,
            profit
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'failed',
            $7,
            $8,
            NOW(),
            NOW(),
            NOW(),
            $9,
            0
          )
          RETURNING
            id,
            tier_id,
            $10::text AS tier_name,
            asset,
            strategy,
            market_summary,
            thesis,
            status,
            duration_minutes,
            daily_slot_number,
            started_at,
            ends_at,
            completed_at,
            reservation_amount::float8 AS reservation_amount,
            entry_price::float8 AS entry_price,
            exit_price::float8 AS exit_price,
            profit::float8 AS profit,
            $11::int AS daily_limit,
            $12::float8 AS daily_roi_min,
            $13::float8 AS daily_roi_max,
            $14::float8 AS daily_profit_cap
        `,
        [
          userId,
          tier.id,
          plan.asset,
          plan.strategy,
          "Unable to participate, please contact your account manager.",
          "This reservation attempt was marked as failed by the current platform risk controls.",
          tier.activation_duration_minutes,
          usedActivations + 1,
          effectiveReservationAmount,
          tier.name,
          tier.activation_limit_per_day,
          tier.daily_roi_min,
          tier.daily_roi_max,
          tier.daily_profit_cap
        ]
      );

      return {
        outcome: "failed" as const,
        message: "Reservation failed. Please contact your account manager or try again tomorrow.",
        activation: this.mapActivation(failedActivation!),
        expectedIncomeMin: expectedIncome.min,
        expectedIncomeMax: expectedIncome.max,
        remainingActivationsToday: Math.max(tier.activation_limit_per_day - (usedActivations + 1), 0)
      };
    }

    const inserted = await getOne<ActivationRow>(
      `
        INSERT INTO ai_trading_activations (
          id,
          user_id,
          tier_id,
          asset,
          strategy,
          market_summary,
          thesis,
          status,
          duration_minutes,
          daily_slot_number,
          started_at,
          ends_at,
          reservation_amount
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          'running',
          $7,
          $8,
          NOW(),
          NOW() + make_interval(mins => $7),
          $9
        )
        RETURNING
          id,
          tier_id,
          $10::text AS tier_name,
          asset,
          strategy,
          market_summary,
          thesis,
          status,
          duration_minutes,
          daily_slot_number,
          started_at,
          ends_at,
          completed_at,
          reservation_amount::float8 AS reservation_amount,
          entry_price::float8 AS entry_price,
          exit_price::float8 AS exit_price,
          profit::float8 AS profit,
          $11::int AS daily_limit,
          $12::float8 AS daily_roi_min,
          $13::float8 AS daily_roi_max,
          $14::float8 AS daily_profit_cap
      `,
      [
        userId,
        tier.id,
        plan.asset,
        plan.strategy,
        plan.marketSummary,
        plan.thesis,
        tier.activation_duration_minutes,
        usedActivations + 1,
        effectiveReservationAmount,
        tier.name,
        tier.activation_limit_per_day,
        tier.daily_roi_min,
        tier.daily_roi_max,
        tier.daily_profit_cap
      ]
    );

    return {
      outcome: "running" as const,
      message: `AI trading started. This ${tier.activation_duration_minutes}-minute cycle is now analyzing ${plan.asset}.`,
      activation: this.mapActivation(inserted!),
      expectedIncomeMin: expectedIncome.min,
      expectedIncomeMax: expectedIncome.max,
      remainingActivationsToday: Math.max(tier.activation_limit_per_day - (usedActivations + 1), 0)
    };
  }

  async runProfitDistribution(scope: string) {
    const candidates = await this.getDistributionCandidates(scope);
    const distributed: ProfitDistributionEvent[] = [];

    for (const candidate of candidates) {
      const event = this.buildDistributionEvent(candidate);

      await withTransaction(async (client: PoolClient) => {
        await this.insertTradeLog(client, event);
      });

      await publishEvent("profit.distributed", event);
      distributed.push(event);
    }

    return {
      scope,
      processedUsers: distributed.length,
      totalProfit: Number(distributed.reduce((sum, event) => sum + event.profit, 0).toFixed(2)),
      events: distributed
    };
  }

  private async finalizeDueActivations(userId?: string) {
    const dueActivations = await dbQuery<{
      id: string;
      user_id: string;
      tier_id: number;
      asset: AssetType;
      strategy: string;
      duration_minutes: number;
      daily_slot_number: number;
      active_investment: number;
      reservation_amount: number;
      daily_roi_min: number;
      daily_roi_max: number;
      daily_profit_cap: number | null;
      activation_limit_per_day: number;
    }>(
      `
        WITH active_positions AS (
          SELECT
            user_id,
            COALESCE(SUM(balance), 0)::float8 AS active_investment
          FROM wallets
          GROUP BY user_id
        )
        SELECT
          ata.id,
          ata.user_id,
          ata.tier_id,
          ata.asset,
          ata.strategy,
          ata.duration_minutes,
          ata.daily_slot_number,
          COALESCE(ap.active_investment, 0)::float8 AS active_investment,
          ata.reservation_amount::float8 AS reservation_amount,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap,
          vt.activation_limit_per_day
        FROM ai_trading_activations ata
        JOIN vip_tiers vt ON vt.id = ata.tier_id
        LEFT JOIN active_positions ap ON ap.user_id = ata.user_id
        WHERE ata.status = 'running'
          AND ata.ends_at <= NOW()
          AND ($1::uuid IS NULL OR ata.user_id = $1::uuid)
      `,
      [userId ?? null]
    );

    for (const activation of dueActivations.rows) {
      const completion = this.buildActivationCompletion(activation);
      const updated = await withTransaction(async (client: PoolClient) => {
        const transition = await client.query<{ id: string }>(
          `
            UPDATE ai_trading_activations
            SET
              status = 'completed',
              completed_at = NOW(),
              entry_price = $2,
              exit_price = $3,
              profit = $4
            WHERE id = $1 AND status = 'running'
            RETURNING id
          `,
          [activation.id, completion.entryPrice, completion.exitPrice, completion.profit]
        );

        if (!transition.rowCount) {
          return null;
        }

        await this.insertTradeLog(client, {
          userId: activation.user_id,
          tierId: activation.tier_id,
          activationId: activation.id,
          asset: activation.asset,
          strategy: activation.strategy,
          profit: completion.profit,
          entryPrice: completion.entryPrice,
          exitPrice: completion.exitPrice,
          executedAt: new Date().toISOString()
        });

        return transition.rows[0];
      });

      if (!updated) {
        continue;
      }

      await publishEvent("profit.distributed", {
        userId: activation.user_id,
        tierId: activation.tier_id,
        activationId: activation.id,
        asset: activation.asset,
        strategy: activation.strategy,
        profit: completion.profit,
        entryPrice: completion.entryPrice,
        exitPrice: completion.exitPrice,
        executedAt: new Date().toISOString()
      }).catch((error) => {
        console.warn("[task-service] failed to publish activation profit event", error);
      });
    }
  }

  private async getReservationDayUsage(userId: string) {
    const usage = await getOne<ReservationDayUsageRow>(
      `
        WITH reservation_window AS (
          SELECT
            (
              date_trunc('day', (NOW() AT TIME ZONE $2) - INTERVAL '5 hours')
              + INTERVAL '5 hours'
            ) AT TIME ZONE $2 AS starts_at,
            (
              date_trunc('day', (NOW() AT TIME ZONE $2) - INTERVAL '5 hours')
              + INTERVAL '29 hours'
            ) AT TIME ZONE $2 AS ends_at
        ),
        scoped_activations AS (
          SELECT ata.status
          FROM ai_trading_activations ata
          CROSS JOIN reservation_window rw
          WHERE ata.user_id = $1
            AND ata.started_at >= rw.starts_at
            AND ata.started_at < rw.ends_at
        )
        SELECT
          (SELECT starts_at FROM reservation_window) AS window_starts_at,
          (SELECT ends_at FROM reservation_window) AS window_ends_at,
          COUNT(*)::int AS activation_count,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_activation_count
        FROM scoped_activations
      `,
      [userId, this.reservationTimeZone]
    );

    return {
      activation_count: usage?.activation_count ?? 0,
      failed_activation_count: usage?.failed_activation_count ?? 0,
      window_starts_at: usage?.window_starts_at ?? new Date().toISOString(),
      window_ends_at: usage?.window_ends_at ?? new Date().toISOString()
    };
  }

  private async getDistributionCandidates(scope: string) {
    const result = await dbQuery<DistributionCandidate>(
      `
        WITH active_positions AS (
          SELECT
            w.user_id,
            COALESCE(SUM(w.balance), 0)::float8 AS active_investment
          FROM wallets w
          GROUP BY w.user_id
        ),
        latest_tier AS (
          SELECT DISTINCT ON (uv.user_id)
            uv.user_id,
            uv.tier_id
          FROM user_vip uv
          ORDER BY uv.user_id, uv.assigned_at DESC
        )
        SELECT
          ap.user_id,
          COALESCE(lt.tier_id, 1) AS tier_id,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap,
          ap.active_investment::float8 AS active_investment
        FROM active_positions ap
        LEFT JOIN latest_tier lt ON lt.user_id = ap.user_id
        JOIN vip_tiers vt ON vt.id = COALESCE(lt.tier_id, 1)
        WHERE ap.active_investment > 0
          AND ($1 = 'all' OR ap.user_id = $1)
      `,
      [scope]
    );

    return result.rows;
  }

  private buildDistributionEvent(candidate: DistributionCandidate): ProfitDistributionEvent {
    const sampledRoi = this.sampleRoi(candidate.daily_roi_min, candidate.daily_roi_max);
    const profit = this.applyDailyProfitCap(calculateDailyProfit(candidate.active_investment, sampledRoi), candidate.daily_profit_cap);
    const entryPrice = Number((5000 + Math.random() * 600).toFixed(2));
    const exitPrice = Number((entryPrice + profit / 4).toFixed(2));

    return {
      userId: candidate.user_id,
      tierId: candidate.tier_id,
      profit,
      asset: "USD",
      strategy: this.pickStrategy(candidate.tier_id),
      entryPrice,
      exitPrice,
      executedAt: new Date().toISOString()
    };
  }

  private async getTierForUser(userId: string) {
    const tier = await getOne<ActivationTierRow>(
      `
        WITH latest_tier AS (
          SELECT DISTINCT ON (uv.user_id)
            uv.user_id,
            uv.tier_id
          FROM user_vip uv
          WHERE uv.user_id = $1
          ORDER BY uv.user_id, uv.assigned_at DESC
        ),
        active_positions AS (
          SELECT COALESCE(SUM(balance), 0)::float8 AS active_investment
          FROM wallets
          WHERE user_id = $1
        ),
        computed_tier AS (
          SELECT id
          FROM vip_tiers
          WHERE min_deposit <= (SELECT active_investment FROM active_positions)
            AND required_direct_members <= (
              SELECT COUNT(*)::int
              FROM (
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
              ) direct_member_funding
              WHERE approved_deposit > 0
                AND activation_funding >= $2
            )
          ORDER BY min_deposit DESC
          LIMIT 1
        ),
        valid_direct_members AS (
          SELECT COUNT(*)::int AS count
          FROM (
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
          ) direct_member_funding
          WHERE approved_deposit > 0
            AND activation_funding >= $2
        )
        SELECT
          vt.id,
          vt.name,
          vt.min_deposit::float8 AS min_deposit,
          vt.daily_roi_min::float8 AS daily_roi_min,
          vt.daily_roi_max::float8 AS daily_roi_max,
          vt.daily_profit_cap::float8 AS daily_profit_cap,
          vt.required_direct_members,
          vt.activation_limit_per_day,
          vt.activation_duration_minutes,
          vt.activation_assets,
          ap.active_investment,
          vdm.count AS valid_direct_members
        FROM active_positions ap
        CROSS JOIN valid_direct_members vdm
        LEFT JOIN latest_tier lt ON TRUE
        LEFT JOIN computed_tier ct ON TRUE
        JOIN vip_tiers vt ON vt.id = COALESCE(lt.tier_id, ct.id, 1)
      `,
      [userId, MINIMUM_VALID_MEMBER_ACTIVATION_DEPOSIT]
    );

    if (tier) {
      return tier;
    }

    const starter = getTierConfig(1);
    return {
      id: starter.id,
      name: starter.name,
      min_deposit: starter.minDeposit,
      daily_roi_min: starter.dailyRoiMin,
      daily_roi_max: starter.dailyRoiMax,
      daily_profit_cap: starter.dailyProfitCap,
      required_direct_members: starter.requiredDirectMembers,
      activation_limit_per_day: starter.activationLimitPerDay,
      activation_duration_minutes: starter.activationDurationMinutes,
      activation_assets: starter.activationAssets,
      active_investment: 0,
      valid_direct_members: 0
    };
  }

  private async creditCompletedMissionRewards(userId: string, tasks: MissionTaskProgress[]) {
    const payableTasks = tasks.filter((task) => task.rewardAmount > 0);
    if (!payableTasks.length) {
      return;
    }

    await withTransaction(async (client: PoolClient) => {
      for (const task of payableTasks) {
        const insertedClaim = await client.query<{ id: string }>(
          `
            INSERT INTO mission_task_claims (id, user_id, task_id, reward_amount, reward_asset)
            VALUES (gen_random_uuid(), $1, $2, $3, $4)
            ON CONFLICT (user_id, task_id) DO NOTHING
            RETURNING id
          `,
          [userId, task.id, task.rewardAmount, task.rewardAsset]
        );

        if (!insertedClaim.rowCount) {
          continue;
        }

        await client.query(
          `
            INSERT INTO wallets (id, user_id, asset_type, balance, total_earned)
            VALUES (gen_random_uuid(), $1, $2, $3, $3)
            ON CONFLICT (user_id, asset_type)
            DO UPDATE SET
              balance = wallets.balance + EXCLUDED.balance,
              total_earned = wallets.total_earned + EXCLUDED.total_earned
          `,
          [userId, task.rewardAsset, task.rewardAmount]
        );

        await client.query(
          `
            INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, admin_note)
            VALUES (gen_random_uuid(), $1, 'referral', $2, $3, 0, 'approved', $4)
          `,
          [userId, task.rewardAsset, task.rewardAmount, `Mission reward: ${task.title}`]
        );

        await client.query(
          `
            INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
          `,
          [
            userId,
            "Mission reward paid",
            `Your mission reward of ${task.rewardAmount} ${task.rewardAsset} was added to your wallet.`
          ]
        );
      }
    });
  }

  private async verifySecurityPasscode(userId: string, passcode?: string) {
    if (!passcode || !/^\d{6}$/.test(passcode)) {
      throw new BadRequestException("Enter your 6-digit security passcode");
    }

    const user = await getOne<SecurityPasscodeRow>(
      `
        SELECT security_passcode_hash
        FROM users
        WHERE users.id = $1
      `,
      [userId]
    );

    if (!user?.security_passcode_hash) {
      throw new BadRequestException("Set your 6-digit security passcode in profile settings first");
    }

    if (user.security_passcode_hash !== hashSecurityPasscode(passcode)) {
      throw new BadRequestException("Invalid security passcode");
    }
  }

  private async getReservationEligibility(userId: string) {
    const eligibility = await getOne<ReservationEligibilityRow>(
      `
        SELECT
          users.kyc_status,
          COALESCE(deposit_totals.total_deposited, 0)
            + COALESCE(admin_activation_totals.total_admin_activated, 0) >= $2 AS has_activation_deposit
        FROM users
        LEFT JOIN (
          SELECT
            user_id,
            COALESCE(SUM(amount), 0)::float8 AS total_deposited
          FROM transactions
          WHERE type = 'deposit'
            AND status = 'approved'
          GROUP BY user_id
        ) deposit_totals
          ON deposit_totals.user_id = users.id
        LEFT JOIN (
          SELECT
            user_id,
            COALESCE(SUM(amount), 0)::float8 AS total_admin_activated
          FROM transactions
          WHERE type = 'adjustment'
            AND status = 'approved'
            AND amount > 0
          GROUP BY user_id
        ) admin_activation_totals
          ON admin_activation_totals.user_id = users.id
        WHERE users.id = $1
      `,
      [userId, MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT]
    );

    if (!eligibility) {
      throw new BadRequestException("User account was not found");
    }

    return eligibility;
  }

  private assertReservationEligibility(eligibility: ReservationEligibilityRow) {
    if (eligibility.kyc_status !== "verified") {
      throw new BadRequestException("Complete personal identification before making a reservation.");
    }

    if (!eligibility.has_activation_deposit) {
      throw new BadRequestException(
        `Make a first approved deposit or receive an admin activation of at least ${MINIMUM_ACCOUNT_ACTIVATION_DEPOSIT} USDT to activate reservations.`
      );
    }
  }

  private async getMissionTaskSettings(): Promise<MissionTaskSetting[]> {
    const setting = await getOne<{ value: unknown }>(
      `
        SELECT value
        FROM admin_settings
        WHERE key = 'platform.missionTasks'
      `
    );

    if (!Array.isArray(setting?.value)) {
      return defaultMissionTasks;
    }

    const normalized = setting.value.flatMap((entry): MissionTaskSetting[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const task = entry as Partial<MissionTaskSetting>;
      const id = typeof task.id === "string" && task.id.trim() ? task.id.trim() : "";
      const category = task.category === "daily" || task.category === "long-term" ? task.category : "limited";
      const target = Number(task.target);
      const rewardAmount = Number(task.rewardAmount);

      if (!id || !Number.isFinite(target) || target < 1 || !Number.isFinite(rewardAmount) || rewardAmount < 0) {
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
          rewardAsset: task.rewardAsset ?? "USDT_TRC20"
        }
      ];
    });

    return normalized.length ? normalized : defaultMissionTasks;
  }

  private buildActivationPlan(tier: ActivationTierRow) {
    const plans: Record<number, Array<{ asset: AssetType; strategy: string; marketSummary: string; thesis: string }>> = {
      1: [
        {
          asset: "BTC",
          strategy: "Starter Momentum Pulse",
          marketSummary: "BTC is holding above intraday VWAP with steady spot volume and low liquidation pressure.",
          thesis: "The engine is scanning for a short continuation burst and tightening exposure if momentum stalls."
        },
        {
          asset: "USD",
          strategy: "Stable Yield Core",
          marketSummary: "Dollar liquidity is stable and volatility is compressed, which suits the defensive core model.",
          thesis: "This run targets controlled carry-style profit with a lower risk profile for Starter accounts."
        }
      ],
      2: [
        {
          asset: "ETH",
          strategy: "Silver Trend Relay",
          marketSummary: "ETH order flow is positive and correlation with BTC remains supportive for short trend trades.",
          thesis: "The model is timing a quick follow-through trade while limiting downside with tighter exits."
        }
      ],
      3: [
        {
          asset: "EUR",
          strategy: "Gold FX Rotation",
          marketSummary: "EUR liquidity is clean and short-term macro dispersion is opening brief mean-reversion windows.",
          thesis: "The engine is looking for a two-minute FX rotation entry with disciplined profit capture."
        }
      ],
      4: [
        {
          asset: "STOCKS",
          strategy: "Platinum Index Burst",
          marketSummary: "Index breadth is improving and sector rotation favors fast US session momentum entries.",
          thesis: "The run is positioning into a short-duration index basket move with higher conviction than the base tiers."
        },
        {
          asset: "BTC",
          strategy: "Platinum Crypto Impulse",
          marketSummary: "BTC derivatives funding is neutral while spot bids are absorbing pullbacks, a healthy setup for a timed burst.",
          thesis: "This activation hunts a quick breakout window and closes automatically after the 2-minute cycle."
        }
      ],
      5: [
        {
          asset: "USDT_ERC20",
          strategy: "Diamond Cross-Market Arbitrage",
          marketSummary: "Cross-venue spreads remain tradeable and the premium engine can allocate capital across multiple internal books.",
          thesis: "Diamond mode is using the broadest universe and highest click allowance to harvest short-lived inefficiencies."
        }
      ]
    };

    const options = plans[tier.id] ?? plans[1];
    return options[Math.floor(Math.random() * options.length)];
  }

  private buildActivationCompletion(activation: {
    active_investment: number;
    reservation_amount: number;
    daily_roi_min: number;
    daily_roi_max: number;
    daily_profit_cap: number | null;
    activation_limit_per_day: number;
    daily_slot_number: number;
  }) {
    const reservedAmount = activation.reservation_amount > 0 ? activation.reservation_amount : activation.active_investment;
    const sampledRoi = this.sampleRoi(activation.daily_roi_min, activation.daily_roi_max);
    const fullDayProfit = this.applyDailyProfitCap(calculateDailyProfit(reservedAmount, sampledRoi), activation.daily_profit_cap);
    const profit = this.splitDailyProfitForSlot(fullDayProfit, activation.activation_limit_per_day, activation.daily_slot_number);
    const entryPrice = Number((5000 + Math.random() * 700).toFixed(2));
    const exitPrice = Number((entryPrice + Math.max(profit / 6, 1.2)).toFixed(2));
    return { profit, entryPrice, exitPrice };
  }

  private buildExpectedIncome(
    reservationAmount: number,
    tier: {
      dailyRoiMin: number;
      dailyRoiMax: number;
      activationLimitPerDay: number;
      dailyProfitCap?: number | null;
      dailySlotNumber?: number;
    }
  ) {
    const fullDayMinProfit = this.applyDailyProfitCap(calculateDailyProfit(reservationAmount, tier.dailyRoiMin), tier.dailyProfitCap ?? null);
    const fullDayMaxProfit = this.applyDailyProfitCap(calculateDailyProfit(reservationAmount, tier.dailyRoiMax), tier.dailyProfitCap ?? null);

    return {
      min: this.splitDailyProfitForSlot(fullDayMinProfit, tier.activationLimitPerDay, tier.dailySlotNumber ?? 1),
      max: this.splitDailyProfitForSlot(fullDayMaxProfit, tier.activationLimitPerDay, tier.dailySlotNumber ?? 1)
    };
  }

  private splitDailyProfitForSlot(fullDayProfit: number, activationLimitPerDay: number, dailySlotNumber: number) {
    const slotCount = Math.max(activationLimitPerDay, 1);
    const slotNumber = Math.min(Math.max(Math.trunc(dailySlotNumber), 1), slotCount);
    const totalCents = Math.max(Math.round(fullDayProfit * 100), 0);
    const baseSlotCents = Math.floor(totalCents / slotCount);
    const extraCentSlots = totalCents % slotCount;
    const slotCents = baseSlotCents + (slotNumber <= extraCentSlots ? 1 : 0);

    return Number((slotCents / 100).toFixed(2));
  }

  private applyDailyProfitCap(profit: number, dailyProfitCap?: number | null) {
    if (dailyProfitCap === null || dailyProfitCap === undefined) {
      return profit;
    }

    return Number(Math.min(profit, Math.max(dailyProfitCap, 0)).toFixed(2));
  }

  private mapTierRow(tier: ActivationTierRow): VipTier {
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
      features: getTierConfig(tier.id).features
    };
  }

  private mapActivation(activation: ActivationRow): AiTradingActivation {
    return {
      id: activation.id,
      tierId: activation.tier_id,
      tierName: activation.tier_name,
      asset: activation.asset,
      strategy: activation.strategy,
      marketSummary: activation.market_summary,
      thesis: activation.thesis,
      status: activation.status,
      startedAt: activation.started_at,
      endsAt: activation.ends_at,
      completedAt: activation.completed_at,
      durationMinutes: activation.duration_minutes,
      dailySlotNumber: activation.daily_slot_number,
      dailyLimit: activation.daily_limit,
      reservationAmount: activation.reservation_amount,
      entryPrice: activation.entry_price,
      exitPrice: activation.exit_price,
      profit: activation.profit,
      expectedIncomeMin: activation.reservation_amount ? this.buildActivationExpectedIncome(activation).min : null,
      expectedIncomeMax: activation.reservation_amount ? this.buildActivationExpectedIncome(activation).max : null
    };
  }

  private buildActivationExpectedIncome(activation: ActivationRow) {
    const fallbackTier = getTierConfig(activation.tier_id);

    return this.buildExpectedIncome(activation.reservation_amount, {
      dailyRoiMin: activation.daily_roi_min ?? fallbackTier.dailyRoiMin,
      dailyRoiMax: activation.daily_roi_max ?? fallbackTier.dailyRoiMax,
      activationLimitPerDay: activation.daily_limit,
      dailyProfitCap: activation.daily_profit_cap !== undefined ? activation.daily_profit_cap : fallbackTier.dailyProfitCap,
      dailySlotNumber: activation.daily_slot_number
    });
  }

  private sampleRoi(min: number, max: number) {
    if (max <= min) {
      return min;
    }

    return Number((min + Math.random() * (max - min)).toFixed(6));
  }

  private async insertTradeLog(client: PoolClient, event: ProfitDistributionEvent) {
    await client.query(
      `
        INSERT INTO trade_logs (
          id,
          user_id,
          asset,
          strategy,
          entry_price,
          exit_price,
          profit,
          executed_at
        )
        VALUES (
          gen_random_uuid(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
      `,
      [event.userId, event.asset, event.strategy, event.entryPrice, event.exitPrice, event.profit, event.executedAt]
    );
  }

  private pickStrategy(tierId: number) {
    const strategies: Record<number, string> = {
      1: "Stable Yield Core",
      2: "Forex Mean Reversion",
      3: "Cross-Asset Momentum",
      4: "US Index Rotation",
      5: "Custom Quant Basket"
    };

    return strategies[tierId] ?? "Stable Yield Core";
  }
}
