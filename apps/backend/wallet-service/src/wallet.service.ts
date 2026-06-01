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
  ProfitDistributionEvent,
  RabbitEventMap,
  WalletSummary
} from "@nevo/shared-types";
import { DEFAULT_ASSET_LABELS, SUPPORTED_ASSETS } from "@nevo/shared-utils";
import type { PoolClient } from "pg";
import type { CreateDepositDto, CreateWithdrawalDto, RequestWithdrawalCodeDto } from "./wallet.dto";

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
          COALESCE(SUM(wallets.active_investment), 0)::float8 AS active_investment,
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
          wallets.active_investment::float8 AS active_investment,
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
      message: "Withdrawal request queued. A 5% fee applies and admin approval is available after the 72-hour holding period."
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

    if (!wallet || spendableBalance < dto.amount) {
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

    if (!row || spendableBalance < amount) {
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
}
