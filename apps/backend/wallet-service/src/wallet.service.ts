import {
  BadRequestException,
  Injectable,
  OnModuleInit
} from "@nestjs/common";
import {
  dbQuery,
  getOne,
  subscribeToEvents,
  withTransaction
} from "@nevo/shared-infra";
import type {
  AssetType,
  DepositAddressMap,
  DashboardTransaction,
  ProfitDistributionEvent,
  RabbitEventMap,
  WalletSummary
} from "@nevo/shared-types";
import { SUPPORTED_ASSETS } from "@nevo/shared-utils";
import type { PoolClient } from "pg";
import type { CreateDepositDto, CreateWithdrawalDto } from "./wallet.dto";
import { toPublicUploadUrl } from "@nevo/shared-infra";

type WalletRow = {
  asset_type: AssetType;
  balance: number;
  active_investment: number;
  total_earned: number;
};

type TransactionRow = {
  id: string;
  type: DashboardTransaction["type"];
  asset: AssetType;
  amount: number;
  status: DashboardTransaction["status"];
  created_at: string;
};

type WithdrawalRulesRow = {
  withdrawals_per_month_limit: number;
  withdrawals_this_month: number;
};

type AdminSettingRow = {
  key: string;
  value: string | null;
};

const WITHDRAWAL_FEE_RATE = 0.05;

@Injectable()
export class WalletService implements OnModuleInit {
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
        SELECT
          COALESCE(SUM(balance), 0)::float8 AS total_balance,
          COALESCE(SUM(active_investment), 0)::float8 AS active_investment,
          COALESCE(SUM(total_earned), 0)::float8 AS total_earned
        FROM wallets
        WHERE user_id = $1
      `,
      [userId]
    );

    const assets = await dbQuery<WalletRow>(
      `
        SELECT
          asset_type,
          balance::float8 AS balance,
          active_investment::float8 AS active_investment,
          total_earned::float8 AS total_earned
        FROM wallets
        WHERE user_id = $1
        ORDER BY asset_type ASC
      `,
      [userId]
    );

    const totalBalance = totals?.total_balance ?? 0;
    const activeInvestment = totals?.active_investment ?? 0;

    return {
      totalBalance,
      activeInvestment,
      availableToWithdraw: Number(Math.max(totalBalance - activeInvestment, 0).toFixed(2)),
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
          created_at
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
      createdAt: row.created_at
    }));
  }

  async getDepositAddresses(): Promise<DepositAddressMap> {
    const result = await dbQuery<AdminSettingRow>(
      `
        SELECT key, value #>> '{}' AS value
        FROM admin_settings
        WHERE key = ANY($1)
      `,
      [this.depositAddressKeys]
    );

    const configured = new Map(result.rows.map((row) => [row.key, row.value]));

    return {
      BTC: this.resolveWalletAddress("BTC", configured),
      ETH: this.resolveWalletAddress("ETH", configured),
      USDT_TRC20: this.resolveWalletAddress("USDT_TRC20", configured),
      USDT_ERC20: this.resolveWalletAddress("USDT_ERC20", configured),
      USD: this.resolveWalletAddress("USD", configured),
      EUR: this.resolveWalletAddress("EUR", configured),
      GBP: this.resolveWalletAddress("GBP", configured),
      STOCKS: this.resolveWalletAddress("STOCKS", configured)
    };
  }

  async createDeposit(userId: string, dto: CreateDepositDto, proof?: { filename: string }) {
    await this.ensureWallets(userId);
    const addresses = await this.getDepositAddresses();
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
      walletAddress: addresses[dto.asset],
      message: "Deposit submitted for admin review."
    };
  }

  async createWithdrawal(userId: string, dto: CreateWithdrawalDto) {
    const feeAmount = Number((dto.amount * WITHDRAWAL_FEE_RATE).toFixed(2));
    const netAmount = Number((dto.amount - feeAmount).toFixed(2));

    const wallet = await getOne<{ balance: number }>(
      `
        SELECT balance::float8 AS balance
        FROM wallets
        WHERE user_id = $1 AND asset_type = $2
      `,
      [userId, dto.asset]
    );

    if (!wallet || wallet.balance < dto.amount) {
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

    const result = await getOne<{ id: string; release_at: string }>(
      `
        INSERT INTO transactions (id, user_id, type, asset, amount, fee_amount, status, destination_address, release_at)
        VALUES (gen_random_uuid(), $1, 'withdrawal', $2, $3, $4, 'pending', $5, NOW() + INTERVAL '72 hours')
        RETURNING id, release_at
      `,
      [userId, dto.asset, dto.amount, feeAmount, dto.destinationAddress]
    );

    return {
      id: result!.id,
      type: "withdrawal",
      ...dto,
      status: "pending",
      feeAmount,
      netAmount,
      releaseAt: result!.release_at,
      monthlyLimit: rules?.withdrawals_per_month_limit ?? 3,
      monthlyUsed: (rules?.withdrawals_this_month ?? 0) + 1,
      message: "Withdrawal request queued. A 5% fee applies and admin approval is available after the 72-hour holding period."
    };
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
      const transition = await client.query<{ id: string }>(
        `
          UPDATE transactions
          SET status = 'approved'
          WHERE id = $1 AND type = 'deposit' AND status = 'pending'
          RETURNING id
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
            balance = balance + $3,
            active_investment = active_investment + $3
          WHERE user_id = $1 AND asset_type = $2
        `,
        [userId, asset, amount]
      );

      await this.applyReferralBonus(client, userId, amount);
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

  private readonly depositAddressKeys = [
    "wallet.depositAddress.BTC",
    "wallet.depositAddress.ETH",
    "wallet.depositAddress.USDT_TRC20",
    "wallet.depositAddress.USDT_ERC20",
    "wallet.depositAddress.USD",
    "wallet.depositAddress.EUR",
    "wallet.depositAddress.GBP",
    "wallet.depositAddress.STOCKS"
  ];

  private resolveWalletAddress(asset: AssetType, configured?: Map<string, string | null>) {
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

    const configuredValue = configured?.get(`wallet.depositAddress.${asset}`)?.trim();
    return configuredValue || defaults[asset];
  }
}
