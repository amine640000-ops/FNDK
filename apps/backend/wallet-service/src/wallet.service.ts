import {
  BadRequestException,
  Injectable,
  OnModuleInit
} from "@nestjs/common";
import {
  createNumericVerificationCode,
  dbQuery,
  getOne,
  hashSecurityPasscode,
  hashVerificationCode,
  hashVerificationContext,
  isSecurityPasscode,
  normalizeVerificationCode,
  sendMail,
  subscribeToEvents,
  toPublicUploadUrl,
  withTransaction
} from "@nevo/shared-infra";
import type {
  AssetRouteSetting,
  AssetType,
  DepositAddressMap,
  DashboardTransaction,
  LuckyDrawEventConfig,
  LuckyDrawPrize,
  LuckyDrawSummary,
  LuckyDrawSpinResult,
  ProfitDistributionEvent,
  RabbitEventMap,
  WalletSummary
} from "@nevo/shared-types";
import { DEFAULT_ASSET_LABELS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import type { PoolClient } from "pg";
import type { CreateDepositDto, CreateWithdrawalDto, RequestWithdrawalCodeDto } from "./wallet.dto";
import { selectWeightedLuckyDrawPrize } from "./lucky-draw.util";

type WalletRow = {
  asset_type: AssetType;
  balance: number;
  active_investment: number;
  total_earned: number;
};

type WithdrawalBalanceRow = {
  balance: number;
  pending_withdrawals: number;
};

type TransactionRow = {
  id: string;
  type: DashboardTransaction["type"];
  asset: AssetType;
  amount: number;
  status: DashboardTransaction["status"];
  created_at: string;
  admin_note: string | null;
};

type LuckyDrawAwardRow = {
  id: string;
  source_type: string;
  spin_count: number;
  spins_used: number;
  note: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type LuckyDrawResultRow = {
  id: string;
  result_label: string;
  prize_id: string | null;
  prize_index: number | null;
  reward_amount: number;
  reward_asset: AssetType | null;
  reward_status: LuckyDrawSpinResult["rewardStatus"];
  roll_value: number | null;
  roll_max: number | null;
  reward_transaction_id: string | null;
  created_at: string;
};

type LuckyDrawSpinBalanceRow = {
  total_spins: number;
  used_spins: number;
  available_spins: number;
};

type LuckyDrawLedgerRow = {
  id: string;
};

type LuckyDrawRewardUsage = {
  event_reward_amount: number;
  user_reward_amount: number;
};

type LuckyDrawPrizeUsage = {
  prize_id: string;
  wins: number;
  reward_amount: number;
};

type WithdrawalRulesRow = {
  withdrawals_per_month_limit: number;
  withdrawals_this_month: number;
};

type WithdrawalContext = {
  feeAmount: number;
  netAmount: number;
  rules: WithdrawalRulesRow | null;
};

type WithdrawalUserRow = {
  email: string;
  full_name: string;
};

type VerificationCodeRow = {
  id: string;
  code_hash: string;
};

type SecurityPasscodeRow = {
  security_passcode_hash: string | null;
};

type AdminSettingRow = {
  key: string;
  value: unknown;
};

const WITHDRAWAL_FEE_RATE = 0.05;
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

const isUsdtAsset = (asset: AssetType) => asset.startsWith("USDT");

@Injectable()
export class WalletService implements OnModuleInit {
  private readonly withdrawalVerificationPurpose = "withdrawal";
  private readonly withdrawalCodeTtlMinutes = 10;

  async onModuleInit() {
    try {
      await subscribeToEvents("wallet-service", {
        "user.registered": async ({ userId }: RabbitEventMap["user.registered"]) => {
          await this.ensureWallets(userId);
        },
        "deposit.confirmed": async (payload: RabbitEventMap["deposit.confirmed"]) => {
          await this.applyApprovedDeposit(payload.userId, payload.asset, payload.amount, payload.transactionId);
        },
        "withdrawal.approved": async (payload: RabbitEventMap["withdrawal.approved"]) => {
          await this.applyApprovedWithdrawal(payload.userId, payload.asset, payload.amount, payload.transactionId);
        },
        "profit.distributed": async (payload: RabbitEventMap["profit.distributed"]) => {
          await this.applyProfitDistribution(payload);
        }
      });
    } catch (error) {
      console.warn("[wallet-service] RabbitMQ unavailable, continuing without event subscriptions.");
    }
  }

  async getSummary(userId: string): Promise<WalletSummary> {
    const totals = await getOne<{
      total_balance: number;
      active_investment: number;
      total_earned: number;
    }>(
      `
        WITH pending_withdrawals AS (
          SELECT
            asset,
            COALESCE(SUM(amount), 0) AS pending_amount
          FROM transactions
          WHERE user_id = $1
            AND type = 'withdrawal'
            AND status = 'pending'
          GROUP BY asset
        )
        SELECT
          COALESCE(SUM(GREATEST(wallets.balance - COALESCE(pending_withdrawals.pending_amount, 0), 0)), 0)::float8 AS total_balance,
          COALESCE(SUM(GREATEST(wallets.balance - COALESCE(pending_withdrawals.pending_amount, 0), 0)), 0)::float8 AS active_investment,
          COALESCE(SUM(wallets.total_earned), 0)::float8 AS total_earned
        FROM wallets
        LEFT JOIN pending_withdrawals
          ON pending_withdrawals.asset = wallets.asset_type
        WHERE wallets.user_id = $1
      `,
      [userId]
    );

    const assets = await dbQuery<WalletRow>(
      `
        WITH pending_withdrawals AS (
          SELECT
            asset,
            COALESCE(SUM(amount), 0) AS pending_amount
          FROM transactions
          WHERE user_id = $1
            AND type = 'withdrawal'
            AND status = 'pending'
          GROUP BY asset
        )
        SELECT
          wallets.asset_type,
          GREATEST(wallets.balance - COALESCE(pending_withdrawals.pending_amount, 0), 0)::float8 AS balance,
          GREATEST(wallets.balance - COALESCE(pending_withdrawals.pending_amount, 0), 0)::float8 AS active_investment,
          wallets.total_earned::float8 AS total_earned
        FROM wallets
        LEFT JOIN pending_withdrawals
          ON pending_withdrawals.asset = wallets.asset_type
        WHERE wallets.user_id = $1
        ORDER BY wallets.asset_type ASC
      `,
      [userId]
    );

    const totalBalance = totals?.total_balance ?? 0;
    const activeInvestment = totals?.active_investment ?? 0;

    return {
      totalBalance,
      activeInvestment,
      availableToWithdraw: totalBalance,
      totalEarned: totals?.total_earned ?? 0,
      assets: assets.rows.map((wallet: WalletRow) => ({
        asset: wallet.asset_type,
        balance: wallet.balance,
        activeInvestment: wallet.active_investment
      }))
    };
  }

  async getTransactions(userId: string): Promise<DashboardTransaction[]> {
    const result = await dbQuery<TransactionRow>(
      `
        SELECT
          id,
          type,
          asset,
          amount::float8 AS amount,
          status,
          created_at,
          admin_note
        FROM transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [userId]
    );

    return result.rows.map((row: TransactionRow) => ({
      id: row.id,
      type: row.type,
      asset: row.asset,
      amount: row.amount,
      status: row.status,
      createdAt: row.created_at,
      adminNote: row.admin_note
    }));
  }

  async getLuckyDrawSummary(userId: string): Promise<LuckyDrawSummary> {
    const event = await this.getLuckyDrawEventInfo();

    if (!event.enabled) {
      return {
        event,
        totalSpins: 0,
        availableSpins: 0,
        usedSpins: 0,
        awards: [],
        results: []
      };
    }

    const [balance, awards, results] = await Promise.all([
      getOne<LuckyDrawSpinBalanceRow>(
        `
          SELECT
            COALESCE(SUM(spin_count), 0)::int AS total_spins,
            COALESCE(SUM(spins_used), 0)::int AS used_spins,
            COALESCE(SUM(spin_count - spins_used), 0)::int AS available_spins
          FROM lucky_draw_spin_ledger
          WHERE beneficiary_user_id = $1
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())
        `,
        [userId]
      ),
      dbQuery<LuckyDrawAwardRow>(
        `
          SELECT
            id,
            source_type,
            spin_count,
            spins_used,
            note,
            expires_at,
            revoked_at,
            created_at
          FROM lucky_draw_spin_ledger
          WHERE beneficiary_user_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        `,
        [userId]
      ),
      dbQuery<LuckyDrawResultRow>(
        `
          SELECT
            id,
            result_label,
            prize_id,
            prize_index,
            reward_amount::float8 AS reward_amount,
            reward_asset,
            reward_status,
            roll_value,
            roll_max,
            reward_transaction_id,
            created_at
          FROM lucky_draw_spin_results
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 20
        `,
        [userId]
      )
    ]);

    return {
      event,
      totalSpins: balance?.total_spins ?? 0,
      availableSpins: balance?.available_spins ?? 0,
      usedSpins: balance?.used_spins ?? 0,
      awards: awards.rows.map((award) => ({
        id: award.id,
        sourceType: award.source_type,
        spinCount: award.spin_count,
        spinsUsed: award.spins_used,
        note: award.note,
        expiresAt: award.expires_at,
        revokedAt: award.revoked_at,
        createdAt: award.created_at
      })),
      results: results.rows.map((result) => ({
        id: result.id,
        resultLabel: result.result_label,
        createdAt: result.created_at,
        prizeId: result.prize_id ?? undefined,
        prizeIndex: result.prize_index ?? undefined,
        rewardAmount: result.reward_amount,
        rewardAsset: result.reward_asset ?? undefined,
        rewardStatus: result.reward_status,
        rollValue: result.roll_value ?? undefined,
        rollMax: result.roll_max ?? undefined
      }))
    };
  }

  async useLuckyDrawSpin(userId: string): Promise<LuckyDrawSpinResult & { availableSpins: number }> {
    return withTransaction(async (client: PoolClient) => {
      const config = await this.getLuckyDrawConfig(client);
      if (!this.isLuckyDrawActive(config)) {
        throw new BadRequestException("Lucky Draw is not active");
      }

      const ledger = await client.query<LuckyDrawLedgerRow>(
        `
          SELECT id
          FROM lucky_draw_spin_ledger
          WHERE beneficiary_user_id = $1
            AND spins_used < spin_count
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `,
        [userId]
      );

      const ledgerId = ledger.rows[0]?.id;
      if (!ledgerId) {
        throw new BadRequestException("No Lucky Draw spins available");
      }

      await client.query(
        `
          UPDATE lucky_draw_spin_ledger
          SET spins_used = spins_used + 1
          WHERE id = $1
        `,
        [ledgerId]
      );

      const availablePrizes = await this.getAvailableLuckyDrawPrizes(client, userId, config);
      if (!availablePrizes.length) {
        throw new BadRequestException("Lucky Draw reward pool is currently closed");
      }

      const selection = selectWeightedLuckyDrawPrize(availablePrizes);
      const prize = selection.prize;
      const prizeIndex = config.prizes.findIndex((entry) => entry.id === prize.id);
      const rewardStatus = await this.resolveLuckyDrawRewardStatus(client, userId, prize, config);

      const result = await client.query<LuckyDrawResultRow>(
        `
          INSERT INTO lucky_draw_spin_results (
            id,
            user_id,
            ledger_id,
            result_label,
            prize_id,
            prize_index,
            reward_amount,
            reward_asset,
            reward_status,
            roll_value,
            roll_max,
            weight_snapshot,
            prize_snapshot
          )
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING
            id,
            result_label,
            prize_id,
            prize_index,
            reward_amount::float8 AS reward_amount,
            reward_asset,
            reward_status,
            roll_value,
            roll_max,
            reward_transaction_id,
            created_at
        `,
        [
          userId,
          ledgerId,
          prize.label,
          prize.id,
          prizeIndex >= 0 ? prizeIndex : selection.prizeIndex,
          prize.rewardAmount,
          prize.rewardAsset,
          rewardStatus,
          selection.rollValue,
          selection.rollMax,
          JSON.stringify(selection.weightSnapshot),
          JSON.stringify(prize)
        ]
      );

      if (prize.rewardAmount > 0) {
        const rewardTransactionId = await this.createLuckyDrawPrizeTransaction(client, userId, prize, rewardStatus, result.rows[0].id);
        await client.query(
          `
            UPDATE lucky_draw_spin_results
            SET reward_transaction_id = $2
            WHERE id = $1
          `,
          [result.rows[0].id, rewardTransactionId]
        );
      }

      const balance = await client.query<{ available_spins: number }>(
        `
          SELECT COALESCE(SUM(spin_count - spins_used), 0)::int AS available_spins
          FROM lucky_draw_spin_ledger
          WHERE beneficiary_user_id = $1
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())
        `,
        [userId]
      );

      return {
        id: result.rows[0].id,
        resultLabel: result.rows[0].result_label,
        createdAt: result.rows[0].created_at,
        prizeId: result.rows[0].prize_id ?? undefined,
        prizeIndex: result.rows[0].prize_index ?? undefined,
        rewardAmount: result.rows[0].reward_amount,
        rewardAsset: result.rows[0].reward_asset ?? undefined,
        rewardStatus: result.rows[0].reward_status,
        rollValue: result.rows[0].roll_value ?? undefined,
        rollMax: result.rows[0].roll_max ?? undefined,
        availableSpins: balance.rows[0]?.available_spins ?? 0
      };
    });
  }

  async getDepositAddresses(): Promise<DepositAddressMap> {
    const assetSettings = await this.getAssetSettings();
    const settingsByAsset = new Map(assetSettings.map((assetSetting) => [assetSetting.asset, assetSetting]));

    return {
      BTC: settingsByAsset.get("BTC")?.address ?? this.resolveWalletAddress("BTC"),
      ETH: settingsByAsset.get("ETH")?.address ?? this.resolveWalletAddress("ETH"),
      USDT_TRC20: settingsByAsset.get("USDT_TRC20")?.address ?? this.resolveWalletAddress("USDT_TRC20"),
      USDT_ERC20: settingsByAsset.get("USDT_ERC20")?.address ?? this.resolveWalletAddress("USDT_ERC20"),
      USD: settingsByAsset.get("USD")?.address ?? this.resolveWalletAddress("USD"),
      EUR: settingsByAsset.get("EUR")?.address ?? this.resolveWalletAddress("EUR"),
      GBP: settingsByAsset.get("GBP")?.address ?? this.resolveWalletAddress("GBP"),
      STOCKS: settingsByAsset.get("STOCKS")?.address ?? this.resolveWalletAddress("STOCKS")
    };
  }

  async getDepositAssets(): Promise<AssetRouteSetting[]> {
    const assetSettings = await this.getAssetSettings();
    return assetSettings.filter((assetSetting) => assetSetting.enabled);
  }

  async createDeposit(userId: string, dto: CreateDepositDto, proof?: { filename: string }) {
    await this.ensureWallets(userId);
    const assetSettings = await this.getDepositAssets();
    const assetSetting = assetSettings.find((setting) => setting.asset === dto.asset);

    if (!assetSetting) {
      throw new BadRequestException("This deposit asset is disabled by admin");
    }

    const result = await getOne<{ id: string }>(
      `
        INSERT INTO transactions (id, user_id, type, asset, amount, status, proof_url)
        VALUES (gen_random_uuid(), $1, 'deposit', $2, $3, 'pending', $4)
        RETURNING id
      `,
      [userId, dto.asset, dto.amount, proof ? toPublicUploadUrl("deposit-proofs", proof.filename) : dto.proofUrl ?? null]
    );

    return {
      id: result!.id,
      type: "deposit",
      ...dto,
      status: "pending",
      walletAddress: assetSetting.address,
      message: "Deposit submitted for admin review."
    };
  }

  private async getAssetSettings(): Promise<AssetRouteSetting[]> {
    const result = await dbQuery<AdminSettingRow>(
      `
        SELECT key, value
        FROM admin_settings
        WHERE key = ANY($1)
      `,
      [this.assetSettingKeys]
    );

    const configured = new Map(result.rows.map((row) => [row.key, row.value]));

    return SUPPORTED_ASSETS.map((asset) => ({
      asset,
      label: this.resolveAssetLabel(asset, configured),
      address: this.resolveWalletAddress(asset, configured),
      enabled: this.resolveAssetEnabled(asset, configured)
    }));
  }

  async createWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const { feeAmount, netAmount, rules } = await this.validateWithdrawalRequest(userId, dto);
    const destinationAddress = dto.destinationAddress.trim();
    const contextHash = this.createWithdrawalContextHash(dto.asset, dto.amount, destinationAddress);
    await this.verifySecurityPasscode(userId, dto.securityPasscode);

    const result = await withTransaction(async (client: PoolClient) => {
      await this.consumeWithdrawalVerificationCode(client, userId, dto.verificationCode, contextHash);
      await this.assertWithdrawalAmountAvailable(client, userId, dto.asset, dto.amount);

      const inserted = await client.query<{ id: string; release_at: string }>(
        `
          INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, destination_address, release_at)
          VALUES (gen_random_uuid(), $1, 'withdrawal', $2, $3, $4, 'pending', $5, NOW() + INTERVAL '72 hours')
          RETURNING id, release_at
        `,
        [userId, dto.asset, dto.amount, feeAmount, destinationAddress]
      );

      return inserted.rows[0];
    });

    return {
      id: result!.id,
      type: "withdrawal",
      asset: dto.asset,
      amount: dto.amount,
      destinationAddress,
      status: "pending",
      feeAmount,
      netAmount,
      releaseAt: result!.release_at,
      monthlyLimit: rules?.withdrawals_per_month_limit ?? 3,
      monthlyUsed: (rules?.withdrawals_this_month ?? 0) + 1,
      processingWindow: "48-72h",
      message: "Withdrawal request submitted. A 5% fee applies and processing takes 48-72h."
    };
  }

  async requestWithdrawalCode(userId: string, dto: RequestWithdrawalCodeDto) {
    await this.validateWithdrawalRequest(userId, dto);
    const destinationAddress = dto.destinationAddress.trim();
    const user = await getOne<WithdrawalUserRow>(
      `
        SELECT email, full_name
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (!user) {
      throw new BadRequestException("User account was not found");
    }

    const code = createNumericVerificationCode();
    const contextHash = this.createWithdrawalContextHash(dto.asset, dto.amount, destinationAddress);

    await dbQuery(
      `
        UPDATE verification_codes
        SET consumed_at = NOW()
        WHERE user_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [userId, this.withdrawalVerificationPurpose]
    );

    await dbQuery(
      `
        INSERT INTO verification_codes (id, user_id, email, purpose, code_hash, context_hash, expires_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW() + ($6::int * INTERVAL '1 minute'))
      `,
      [
        userId,
        user.email,
        this.withdrawalVerificationPurpose,
        hashVerificationCode(code),
        contextHash,
        this.withdrawalCodeTtlMinutes
      ]
    );

    const emailSent = await this.sendWithdrawalCodeEmail(user.email, user.full_name, code, dto.asset, dto.amount);

    return {
      message: emailSent ? "Withdrawal verification code sent" : "Withdrawal verification email could not be sent",
      emailVerificationSent: emailSent,
      expiresInMinutes: this.withdrawalCodeTtlMinutes
    };
  }

  private async validateWithdrawalRequest(
    userId: string,
    dto: Pick<RequestWithdrawalCodeDto, "asset" | "amount" | "destinationAddress">
  ): Promise<WithdrawalContext> {
    const destinationAddress = dto.destinationAddress.trim();
    if (!destinationAddress) {
      throw new BadRequestException("Enter a destination address");
    }

    const feeAmount = Number((dto.amount * WITHDRAWAL_FEE_RATE).toFixed(2));
    const netAmount = Number((dto.amount - feeAmount).toFixed(2));

    const wallet = await getOne<WithdrawalBalanceRow>(
      `
        SELECT
          wallets.balance::float8 AS balance,
          COALESCE((
            SELECT SUM(transactions.amount)
            FROM transactions
            WHERE transactions.user_id = $1
              AND transactions.asset = $2
              AND transactions.type = 'withdrawal'
              AND transactions.status = 'pending'
          ), 0)::float8 AS pending_withdrawals
        FROM wallets
        WHERE wallets.user_id = $1 AND wallets.asset_type = $2
      `,
      [userId, dto.asset]
    );
    const spendableBalance = Number(Math.max((wallet?.balance ?? 0) - (wallet?.pending_withdrawals ?? 0), 0).toFixed(2));

    if (!wallet || spendableBalance <= 0) {
      throw new BadRequestException("Add funds to your wallet before requesting a withdrawal");
    }

    if (spendableBalance < dto.amount) {
      throw new BadRequestException("Insufficient balance for withdrawal request");
    }

    if (netAmount <= 0) {
      throw new BadRequestException("Withdrawal amount is too low after the 5% fee");
    }

    const rules = await getOne<WithdrawalRulesRow>(
      `
        SELECT
          COALESCE((SELECT (value #>> '{}')::int FROM admin_settings WHERE key = 'platform.withdrawalsPerMonthLimit'), 3) AS withdrawals_per_month_limit,
          (
            SELECT COUNT(*)::int
            FROM transactions
            WHERE user_id = $1
              AND type = 'withdrawal'
              AND status IN ('pending', 'approved')
              AND created_at >= date_trunc('month', NOW())
              AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'
          ) AS withdrawals_this_month
      `,
      [userId]
    );

    if ((rules?.withdrawals_this_month ?? 0) >= (rules?.withdrawals_per_month_limit ?? 3)) {
      throw new BadRequestException("Monthly withdrawal limit reached for this account");
    }

    return { feeAmount, netAmount, rules };
  }

  private async assertWithdrawalAmountAvailable(
    client: PoolClient,
    userId: string,
    asset: AssetType,
    amount: number
  ) {
    const wallet = await client.query<WithdrawalBalanceRow>(
      `
        SELECT
          wallets.balance::float8 AS balance,
          COALESCE((
            SELECT SUM(transactions.amount)
            FROM transactions
            WHERE transactions.user_id = $1
              AND transactions.asset = $2
              AND transactions.type = 'withdrawal'
              AND transactions.status = 'pending'
          ), 0)::float8 AS pending_withdrawals
        FROM wallets
        WHERE wallets.user_id = $1 AND wallets.asset_type = $2
        FOR UPDATE OF wallets
      `,
      [userId, asset]
    );
    const row = wallet.rows[0];
    const spendableBalance = Number(Math.max((row?.balance ?? 0) - (row?.pending_withdrawals ?? 0), 0).toFixed(2));

    if (!row || spendableBalance <= 0) {
      throw new BadRequestException("Add funds to your wallet before requesting a withdrawal");
    }

    if (spendableBalance < amount) {
      throw new BadRequestException("Insufficient balance for withdrawal request");
    }
  }

  private async consumeWithdrawalVerificationCode(
    client: PoolClient,
    userId: string,
    code: string,
    contextHash: string
  ) {
    const candidate = await client.query<VerificationCodeRow>(
      `
        SELECT id, code_hash
        FROM verification_codes
        WHERE user_id = $1
          AND purpose = $2
          AND context_hash = $3
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [userId, this.withdrawalVerificationPurpose, contextHash]
    );

    if (!candidate.rowCount) {
      throw new BadRequestException("Withdrawal verification code is expired or not found");
    }

    if (candidate.rows[0].code_hash !== hashVerificationCode(code)) {
      throw new BadRequestException("Invalid withdrawal verification code");
    }

    await client.query("UPDATE verification_codes SET consumed_at = NOW() WHERE id = $1", [candidate.rows[0].id]);
  }

  private async verifySecurityPasscode(userId: string, passcode: string) {
    if (!passcode || !isSecurityPasscode(passcode)) {
      throw new BadRequestException("Enter your 6-digit security passcode");
    }

    const user = await getOne<SecurityPasscodeRow>(
      `
        SELECT security_passcode_hash
        FROM users
        WHERE id = $1
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

  private createWithdrawalContextHash(asset: AssetType, amount: number, destinationAddress: string) {
    return hashVerificationContext(
      JSON.stringify({
        asset,
        amount: Number(amount).toFixed(2),
        destinationAddress: destinationAddress.trim()
      })
    );
  }

  private async sendWithdrawalCodeEmail(
    email: string,
    fullName: string,
    code: string,
    asset: AssetType,
    amount: number
  ) {
    try {
      const platformName = process.env.PLATFORM_NAME ?? "FNDK";
      await sendMail({
        to: email,
        subject: `${platformName} withdrawal verification code`,
        text: [
          `Hello ${fullName},`,
          "",
          `Your ${platformName} withdrawal verification code is ${normalizeVerificationCode(code)}.`,
          `Request: ${amount} ${asset}.`,
          `It expires in ${this.withdrawalCodeTtlMinutes} minutes.`,
          "",
          "If you did not request this withdrawal, contact support immediately."
        ].join("\n"),
        html: `
          <p>Hello,</p>
          <p>Your <strong>${platformName}</strong> withdrawal verification code is:</p>
          <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${normalizeVerificationCode(code)}</p>
          <p>Request: ${amount} ${asset}. This code expires in ${this.withdrawalCodeTtlMinutes} minutes.</p>
          <p>If you did not request this withdrawal, contact support immediately.</p>
        `
      });

      return true;
    } catch (error) {
      console.warn("[wallet-service] failed to send withdrawal verification email", error);
      return false;
    }
  }

  private async ensureWallets(userId: string) {
    await Promise.all(
      SUPPORTED_ASSETS.map((asset) =>
        dbQuery(
          `
            INSERT INTO wallets (id, user_id, asset_type, balance, active_investment, total_earned)
            VALUES (gen_random_uuid(), $1, $2, 0, 0, 0)
            ON CONFLICT DO NOTHING
          `,
          [userId, asset]
        )
      )
    );
  }

  private async applyApprovedDeposit(userId: string, asset: AssetType, amount: number, transactionId: string) {
    await withTransaction(async (client: PoolClient) => {
      const transition = await client.query<{ id: string; created_at: string }>(
        `
          UPDATE transactions
          SET status = 'approved'
          WHERE id = $1 AND type = 'deposit' AND status = 'pending'
          RETURNING id, created_at
        `,
        [transactionId]
      );

      if (!transition.rowCount) {
        return;
      }

      await this.ensureWalletsWithClient(client, userId);
      await client.query(
        `
          UPDATE wallets
          SET
            balance = balance + $3
          WHERE user_id = $1 AND asset_type = $2
        `,
        [userId, asset, amount]
      );

      await this.applyReferralBonus(client, userId, amount);
      await this.awardLuckyDrawSpinsForApprovedDeposit(client, {
        userId,
        asset,
        amount,
        transactionId,
        depositCreatedAt: transition.rows[0].created_at
      });
    });
  }

  private async applyApprovedWithdrawal(userId: string, asset: AssetType, amount: number, transactionId: string) {
    await withTransaction(async (client: PoolClient) => {
      const transition = await client.query<{ id: string }>(
        `
          UPDATE transactions
          SET status = 'approved'
          WHERE id = $1 AND type = 'withdrawal' AND status = 'pending'
          RETURNING id
        `,
        [transactionId]
      );

      if (!transition.rowCount) {
        return;
      }

      await client.query(
        `
          UPDATE wallets
          SET
            balance = balance - $3,
            active_investment = GREATEST(active_investment - $3, 0)
          WHERE user_id = $1 AND asset_type = $2
        `,
        [userId, asset, amount]
      );
    });
  }

  private async applyProfitDistribution(payload: ProfitDistributionEvent) {
    await withTransaction(async (client: PoolClient) => {
      await this.ensureWalletsWithClient(client, payload.userId);
      await client.query(
        `
          UPDATE wallets
          SET
            balance = balance + $2,
            total_earned = total_earned + $2
          WHERE user_id = $1 AND asset_type = 'USD'
        `,
        [payload.userId, payload.profit]
      );

      await client.query(
        `
          INSERT INTO transactions (id, user_id, type, asset, amount, status, admin_note)
          VALUES (
            gen_random_uuid(),
            $1,
            'profit',
            $2,
            $3,
            'approved',
            $4
          )
        `,
        [
          payload.userId,
          payload.asset,
          payload.profit,
          `${payload.strategy} @ ${payload.entryPrice} -> ${payload.exitPrice}`
        ]
      );
    });
  }

  private async getLuckyDrawConfig(client?: PoolClient): Promise<LuckyDrawEventConfig> {
    const keys = [
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
      "platform.luckyDraw.prizes"
    ];
    const query = `
      SELECT key, value
      FROM admin_settings
      WHERE key = ANY($1)
    `;
    const result = client
      ? await client.query<AdminSettingRow>(query, [keys])
      : await dbQuery<AdminSettingRow>(query, [keys]);
    const settings = new Map(result.rows.map((row) => [row.key, row.value]));
    const depositOneSpinAmount = this.cleanPositiveNumber(
      settings.get("platform.luckyDraw.depositOneSpinAmount"),
      defaultLuckyDrawConfig.depositOneSpinAmount
    );
    const depositTwoSpinAmount = this.cleanPositiveNumber(
      settings.get("platform.luckyDraw.depositTwoSpinAmount"),
      defaultLuckyDrawConfig.depositTwoSpinAmount
    );
    const legacyPrizeLabels = this.cleanTextList(
      settings.get("platform.luckyDraw.prizeLabels"),
      defaultLuckyDrawConfig.prizeLabels,
      12,
      120
    );
    const prizes = this.normalizeLuckyDrawPrizes(settings.get("platform.luckyDraw.prizes"), legacyPrizeLabels);

    return {
      enabled: typeof settings.get("platform.luckyDraw.enabled") === "boolean"
        ? Boolean(settings.get("platform.luckyDraw.enabled"))
        : defaultLuckyDrawConfig.enabled,
      title: this.cleanSettingText(settings.get("platform.luckyDraw.title"), defaultLuckyDrawConfig.title, 120),
      startsAt: this.cleanIsoDate(settings.get("platform.luckyDraw.startsAt"), defaultLuckyDrawConfig.startsAt),
      endsAt: this.cleanIsoDate(settings.get("platform.luckyDraw.endsAt"), defaultLuckyDrawConfig.endsAt),
      referralFirstDepositAmount: this.cleanPositiveNumber(
        settings.get("platform.luckyDraw.referralFirstDepositAmount"),
        defaultLuckyDrawConfig.referralFirstDepositAmount
      ),
      referralSpinReward: this.cleanPositiveInteger(
        settings.get("platform.luckyDraw.referralSpinReward"),
        defaultLuckyDrawConfig.referralSpinReward
      ),
      depositOneSpinAmount,
      depositTwoSpinAmount: Math.max(depositTwoSpinAmount, depositOneSpinAmount),
      maxTotalRewardAmount: this.cleanPositiveNumber(
        settings.get("platform.luckyDraw.maxTotalRewardAmount"),
        defaultLuckyDrawConfig.maxTotalRewardAmount
      ),
      maxRewardPerUserAmount: this.cleanPositiveNumber(
        settings.get("platform.luckyDraw.maxRewardPerUserAmount"),
        defaultLuckyDrawConfig.maxRewardPerUserAmount
      ),
      instantRewardMaxAmount: this.cleanPositiveNumber(
        settings.get("platform.luckyDraw.instantRewardMaxAmount"),
        defaultLuckyDrawConfig.instantRewardMaxAmount
      ),
      requireKycAboveAmount: this.cleanPositiveNumber(
        settings.get("platform.luckyDraw.requireKycAboveAmount"),
        defaultLuckyDrawConfig.requireKycAboveAmount
      ),
      showPrizeChancesToUsers: typeof settings.get("platform.luckyDraw.showPrizeChancesToUsers") === "boolean"
        ? Boolean(settings.get("platform.luckyDraw.showPrizeChancesToUsers"))
        : defaultLuckyDrawConfig.showPrizeChancesToUsers,
      rules: this.cleanTextList(settings.get("platform.luckyDraw.rules"), defaultLuckyDrawConfig.rules, 8, 220),
      prizeLabels: prizes.map((prize) => prize.label),
      prizes
    };
  }

  private async getLuckyDrawEventInfo() {
    const config = await this.getLuckyDrawConfig();
    const startsAt = new Date(config.startsAt);
    const endsAt = new Date(config.endsAt);

    return {
      enabled: config.enabled,
      title: config.title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      isActive: this.isLuckyDrawActive(config),
      showPrizeChancesToUsers: config.showPrizeChancesToUsers,
      rules: config.rules,
      prizes: config.prizes
    };
  }

  private async getAvailableLuckyDrawPrizes(client: PoolClient, userId: string, config: LuckyDrawEventConfig) {
    const rewardUsage = await client.query<LuckyDrawRewardUsage>(
      `
        SELECT
          COALESCE(SUM(reward_amount) FILTER (
            WHERE reward_status IN ('credited', 'pending_review')
              AND created_at >= $1::timestamptz
              AND created_at <= $2::timestamptz
          ), 0)::float8 AS event_reward_amount,
          COALESCE(SUM(reward_amount) FILTER (
            WHERE user_id = $3
              AND reward_status IN ('credited', 'pending_review')
              AND created_at >= $1::timestamptz
              AND created_at <= $2::timestamptz
          ), 0)::float8 AS user_reward_amount
        FROM lucky_draw_spin_results
      `,
      [config.startsAt, config.endsAt, userId]
    );

    const prizeUsage = await client.query<LuckyDrawPrizeUsage>(
      `
        SELECT
          prize_id,
          COUNT(*) FILTER (WHERE reward_status <> 'rejected')::int AS wins,
          COALESCE(SUM(reward_amount) FILTER (
            WHERE reward_status IN ('credited', 'pending_review')
          ), 0)::float8 AS reward_amount
        FROM lucky_draw_spin_results
        WHERE created_at >= $1::timestamptz
          AND created_at <= $2::timestamptz
          AND prize_id IS NOT NULL
        GROUP BY prize_id
      `,
      [config.startsAt, config.endsAt]
    );

    const usageByPrizeId = new Map(prizeUsage.rows.map((row) => [row.prize_id, row]));
    const eventRewardAmount = rewardUsage.rows[0]?.event_reward_amount ?? 0;
    const userRewardAmount = rewardUsage.rows[0]?.user_reward_amount ?? 0;

    return config.prizes.filter((prize) => {
      const usage = usageByPrizeId.get(prize.id);
      const wins = usage?.wins ?? 0;
      const prizeRewardAmount = usage?.reward_amount ?? 0;

      if (prize.maxWinners !== null && prize.maxWinners !== undefined && wins >= prize.maxWinners) {
        return false;
      }

      if (prize.rewardAmount <= 0) {
        return true;
      }

      if (config.maxTotalRewardAmount > 0 && eventRewardAmount + prize.rewardAmount > config.maxTotalRewardAmount) {
        return false;
      }

      if (config.maxRewardPerUserAmount > 0 && userRewardAmount + prize.rewardAmount > config.maxRewardPerUserAmount) {
        return false;
      }

      if (
        prize.maxTotalRewardAmount !== null &&
        prize.maxTotalRewardAmount !== undefined &&
        prizeRewardAmount + prize.rewardAmount > prize.maxTotalRewardAmount
      ) {
        return false;
      }

      return true;
    });
  }

  private async resolveLuckyDrawRewardStatus(
    client: PoolClient,
    userId: string,
    prize: LuckyDrawPrize,
    config: LuckyDrawEventConfig
  ): Promise<LuckyDrawSpinResult["rewardStatus"]> {
    if (prize.rewardAmount <= 0) {
      return "none";
    }

    if (prize.reviewRequired || (config.instantRewardMaxAmount > 0 && prize.rewardAmount > config.instantRewardMaxAmount)) {
      return "pending_review";
    }

    if (config.requireKycAboveAmount > 0 && prize.rewardAmount >= config.requireKycAboveAmount) {
      const user = await client.query<{ kyc_status: string }>(
        `
          SELECT kyc_status
          FROM users
          WHERE id = $1
        `,
        [userId]
      );

      if (user.rows[0]?.kyc_status !== "verified") {
        return "pending_review";
      }
    }

    return "credited";
  }

  private async createLuckyDrawPrizeTransaction(
    client: PoolClient,
    userId: string,
    prize: LuckyDrawPrize,
    rewardStatus: LuckyDrawSpinResult["rewardStatus"],
    resultId: string
  ) {
    const transaction = await client.query<{ id: string }>(
      `
        INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, admin_note)
        VALUES (gen_random_uuid(), $1, 'lucky_draw_prize', $2, $3, 0, $4, $5)
        RETURNING id
      `,
      [
        userId,
        prize.rewardAsset,
        prize.rewardAmount,
        rewardStatus === "credited" ? "approved" : "pending",
        `Lucky Draw prize: ${prize.label} (${resultId})`
      ]
    );

    if (rewardStatus === "credited") {
      await this.ensureWalletsWithClient(client, userId);
      await client.query(
        `
          UPDATE wallets
          SET
            balance = balance + $3,
            total_earned = total_earned + $3
          WHERE user_id = $1
            AND asset_type = $2
        `,
        [userId, prize.rewardAsset, prize.rewardAmount]
      );
    }

    await client.query(
      `
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
      `,
      [
        userId,
        rewardStatus === "credited" ? "Lucky Draw prize won" : "Lucky Draw prize under review",
        rewardStatus === "credited"
          ? `You won ${prize.rewardAmount.toFixed(2)} ${prize.rewardAsset.startsWith("USDT") ? "USDT" : prize.rewardAsset} from Lucky Draw.`
          : `Your Lucky Draw prize of ${prize.rewardAmount.toFixed(2)} ${prize.rewardAsset.startsWith("USDT") ? "USDT" : prize.rewardAsset} is pending admin review.`
      ]
    );

    return transaction.rows[0].id;
  }

  private isLuckyDrawActive(config: LuckyDrawEventConfig) {
    const now = Date.now();
    const startsAt = new Date(config.startsAt).getTime();
    const endsAt = new Date(config.endsAt).getTime();
    return config.enabled && now >= startsAt && now <= endsAt;
  }

  private isLuckyDrawDepositEligible(asset: AssetType, depositCreatedAt: string, config: LuckyDrawEventConfig) {
    if (!isUsdtAsset(asset)) {
      return false;
    }

    const createdAt = new Date(depositCreatedAt).getTime();
    return config.enabled && createdAt >= new Date(config.startsAt).getTime() && createdAt <= new Date(config.endsAt).getTime();
  }

  private async awardLuckyDrawSpinsForApprovedDeposit(
    client: PoolClient,
    input: {
      userId: string;
      asset: AssetType;
      amount: number;
      transactionId: string;
      depositCreatedAt: string;
    }
  ) {
    const config = await this.getLuckyDrawConfig(client);
    if (!this.isLuckyDrawDepositEligible(input.asset, input.depositCreatedAt, config)) {
      return;
    }

    const selfDepositSpins = input.amount >= config.depositTwoSpinAmount ? 2 : input.amount >= config.depositOneSpinAmount ? 1 : 0;
    if (selfDepositSpins > 0) {
      await this.insertLuckyDrawSpinAward(client, {
        beneficiaryUserId: input.userId,
        sourceUserId: input.userId,
        sourceTransactionId: input.transactionId,
        sourceType: selfDepositSpins === 2 ? "deposit_300_plus" : "deposit_200_plus",
        spinCount: selfDepositSpins,
        note: `Lucky Draw: ${input.amount} USDT single deposit awarded ${selfDepositSpins} spin${selfDepositSpins > 1 ? "s" : ""}.`
      });
    }

    if (input.amount < config.referralFirstDepositAmount || config.referralSpinReward <= 0) {
      return;
    }

    const referral = await client.query<{
      referred_by: string | null;
      user_kyc_status: string;
      referrer_active: boolean | null;
      approved_deposit_count: number;
    }>(
      `
        SELECT
          users.referred_by,
          users.kyc_status AS user_kyc_status,
          referrer.is_active AS referrer_active,
          (
            SELECT COUNT(*)::int
            FROM transactions
            WHERE user_id = $1
              AND type = 'deposit'
              AND status = 'approved'
          ) AS approved_deposit_count
        FROM users
        LEFT JOIN users referrer ON referrer.id = users.referred_by
        WHERE users.id = $1
      `,
      [input.userId]
    );

    const referralContext = referral.rows[0];
    if (
      !referralContext?.referred_by ||
      referralContext.referred_by === input.userId ||
      referralContext.referrer_active !== true ||
      referralContext.user_kyc_status === "rejected" ||
      referralContext.approved_deposit_count !== 1
    ) {
      return;
    }

    await this.insertLuckyDrawSpinAward(client, {
      beneficiaryUserId: referralContext.referred_by,
      sourceUserId: input.userId,
      sourceTransactionId: input.transactionId,
      sourceType: "direct_referral_first_deposit",
      spinCount: config.referralSpinReward,
      note: `Lucky Draw: your direct referral made a first deposit of ${input.amount} USDT.`
    });
  }

  private async insertLuckyDrawSpinAward(
    client: PoolClient,
    input: {
      beneficiaryUserId: string;
      sourceUserId: string;
      sourceTransactionId: string;
      sourceType: string;
      spinCount: number;
      note: string;
    }
  ) {
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO lucky_draw_spin_ledger (
          id,
          beneficiary_user_id,
          source_user_id,
          source_transaction_id,
          source_type,
          spin_count,
          note
        )
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        ON CONFLICT (beneficiary_user_id, source_type, source_transaction_id) DO NOTHING
        RETURNING id
      `,
      [
        input.beneficiaryUserId,
        input.sourceUserId,
        input.sourceTransactionId,
        input.sourceType,
        input.spinCount,
        input.note
      ]
    );

    if (!inserted.rowCount) {
      return;
    }

    await client.query(
      `
        INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, FALSE, NOW())
      `,
      [
        input.beneficiaryUserId,
        "Lucky Draw spin awarded",
        `${input.note} You received ${input.spinCount} spin${input.spinCount > 1 ? "s" : ""}.`
      ]
    );
  }

  private async applyReferralBonus(client: PoolClient, referredUserId: string, approvedDepositAmount: number) {
    const referralContext = await client.query<{
      referred_by: string | null;
      already_paid: boolean;
      bonus_percent: number;
    }>(
      `
        SELECT
          u.referred_by,
          EXISTS(SELECT 1 FROM referrals WHERE referred_id = u.id) AS already_paid,
          COALESCE((SELECT (value #>> '{}')::float8 FROM admin_settings WHERE key = 'platform.referralBonusPercent'), 5) AS bonus_percent
        FROM users u
        WHERE u.id = $1
      `,
      [referredUserId]
    );

    const referral = referralContext.rows[0];
    if (!referral?.referred_by || referral.already_paid) {
      return;
    }

    const bonusAmount = Number(((approvedDepositAmount * referral.bonus_percent) / 100).toFixed(2));
    await this.ensureWalletsWithClient(client, referral.referred_by);

    await client.query(
      `
        UPDATE wallets
        SET
          balance = balance + $2,
          total_earned = total_earned + $2
        WHERE user_id = $1 AND asset_type = 'USD'
      `,
      [referral.referred_by, bonusAmount]
    );

    await client.query(
      `
        INSERT INTO referrals (id, referrer_id, referred_id, bonus_amount)
        VALUES (gen_random_uuid(), $1, $2, $3)
      `,
      [referral.referred_by, referredUserId, bonusAmount]
    );

    await client.query(
      `
        INSERT INTO transactions (id, user_id, type, asset, amount, status, admin_note)
        VALUES (
          gen_random_uuid(),
          $1,
          'referral',
          'USD',
          $2,
          'approved',
          'First approved referral deposit bonus'
        )
      `,
      [referral.referred_by, bonusAmount]
    );
  }

  private async ensureWalletsWithClient(client: PoolClient, userId: string) {
    for (const asset of SUPPORTED_ASSETS) {
      await client.query(
        `
          INSERT INTO wallets (id, user_id, asset_type, balance, active_investment, total_earned)
          VALUES (gen_random_uuid(), $1, $2, 0, 0, 0)
          ON CONFLICT DO NOTHING
        `,
        [userId, asset]
      );
    }
  }

  private readonly assetSettingKeys = SUPPORTED_ASSETS.flatMap((asset) => [
    `asset.${asset}.enabled`,
    `asset.${asset}.label`,
    `wallet.depositAddress.${asset}`
  ]);

  private resolveWalletAddress(asset: AssetType, configured?: Map<string, unknown>) {
    const defaults: Record<AssetType, string> = {
      BTC: "configure-btc-wallet-before-live",
      ETH: "configure-eth-wallet-before-live",
      USDT_TRC20: "configure-usdt-trc20-wallet-before-live",
      USDT_ERC20: "configure-usdt-erc20-wallet-before-live",
      USD: "bank-wire-manual-review",
      EUR: "iban-eu-manual-review",
      GBP: "swift-gbp-manual-review",
      STOCKS: "usd-ledger-internal"
    };

    const configuredValue = configured?.get(`wallet.depositAddress.${asset}`);
    if (typeof configuredValue !== "string") {
      return defaults[asset];
    }

    const trimmedValue = configuredValue.trim();
    return trimmedValue || defaults[asset];
  }

  private resolveAssetLabel(asset: AssetType, configured: Map<string, unknown>) {
    const configuredValue = configured.get(`asset.${asset}.label`);
    if (typeof configuredValue !== "string") {
      return DEFAULT_ASSET_LABELS[asset];
    }

    const trimmedValue = configuredValue.trim();
    return trimmedValue || DEFAULT_ASSET_LABELS[asset];
  }

  private resolveAssetEnabled(asset: AssetType, configured: Map<string, unknown>) {
    const configuredValue = configured.get(`asset.${asset}.enabled`);
    if (typeof configuredValue !== "boolean") {
      return true;
    }

    return configuredValue;
  }

  private cleanSettingText(value: unknown, fallback: string, maxLength: number) {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();
    return (trimmed || fallback).slice(0, maxLength);
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
