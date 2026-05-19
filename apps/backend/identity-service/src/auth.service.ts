import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcrypt";
import {
  createNumericVerificationCode,
  dbQuery,
  getOne,
  hashVerificationCode,
  hashSecurityPasscode,
  normalizeVerificationCode,
  publishEvent,
  sendMail,
  withTransaction
} from "@nevo/shared-infra";
import type { KycStatus, UserRole } from "@nevo/shared-types";
import { createReferralCode } from "@nevo/shared-utils";
import type { LoginDto, RegisterDto, UpdateProfileDto } from "./auth.dto";

interface IdentityUserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone: string;
  referral_code: string;
  referred_by: string | null;
  kyc_status: KycStatus;
  role: UserRole;
  email_verified_at: string | null;
  security_passcode_hash: string | null;
}

type VerificationCodeRecord = {
  id: string;
  user_id: string;
  code_hash: string;
};

export interface IdentityUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  referralCode: string;
  referredBy?: string;
  kycStatus: KycStatus;
  role: UserRole;
  emailVerifiedAt: string | null;
  hasSecurityPasscode: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: IdentityUser;
}

@Injectable()
export class AuthService {
  private readonly emailVerificationPurpose = "email_verification";
  private readonly passwordResetPurpose = "password_reset";
  private readonly verificationCodeTtlMinutes = 15;
  private readonly mailTimeoutMs = this.readPositiveInteger(process.env.MAIL_SEND_TIMEOUT_MS, 8000);
  private readonly eventPublishTimeoutMs = this.readPositiveInteger(process.env.EVENT_PUBLISH_TIMEOUT_MS, 3000);

  private readonly jwt = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
    signOptions: { expiresIn: "15m" }
  });

  private readonly refreshJwt = new JwtService({
    secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret",
    signOptions: { expiresIn: "7d" }
  });

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = this.normalizePhone(dto.phone);
    const fullName = dto.fullName.trim();
    const existingUser = await getOne<Pick<IdentityUserRecord, "id" | "email" | "phone">>(
      `
        SELECT id, email, phone
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR regexp_replace(phone, '[^0-9+]', '', 'g') = $2
        ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [email, phone]
    );

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email) {
        throw new ConflictException("Email already registered");
      }

      throw new ConflictException("Phone number already registered");
    }

    const userCount = await getOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE role = 'USER'");
    const inboundReferralCode = dto.referralCode?.trim() ?? "";
    let referrer: Pick<IdentityUserRecord, "id"> | null = null;

    if (userCount?.count) {
      if (!inboundReferralCode) {
        throw new BadRequestException("Referral code is required");
      }

      referrer = await getOne<Pick<IdentityUserRecord, "id">>(
        `
          SELECT id
          FROM users
          WHERE regexp_replace(UPPER(referral_code), '[^A-Z0-9]', '', 'g') =
            regexp_replace(UPPER($1), '[^A-Z0-9]', '', 'g')
        `,
        [inboundReferralCode]
      );

      if (!referrer) {
        throw new BadRequestException("Valid referral code is required");
      }
    }

    const referralCode = createReferralCode(`${fullName}${Date.now().toString(36)}`);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const inserted = await this.insertUser({
      email,
      passwordHash,
      fullName,
      phone,
      referralCode,
      referredBy: referrer?.id ?? null
    });

    const verificationEmailSent = await this.issueEmailVerificationCode(inserted.id, email, fullName);

    this.publishRegistrationEvent({
      userId: inserted.id,
      email,
      fullName,
      referralCode: inserted.referral_code
    });

    return {
      message: verificationEmailSent
        ? "Registration created. Check your email for the verification code."
        : "Registration created, but the verification email could not be sent. Check email delivery settings and try resend verification.",
      userId: inserted.id,
      referralCode: inserted.referral_code,
      emailVerificationSent: verificationEmailSent
    };
  }

  async verifyEmail(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const codeHash = hashVerificationCode(code);

    const verified = await withTransaction(async (client) => {
      const candidate = await client.query<VerificationCodeRecord>(
        `
          SELECT id, user_id, code_hash
          FROM verification_codes
          WHERE email = $1
            AND purpose = $2
            AND consumed_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [normalizedEmail, this.emailVerificationPurpose]
      );

      if (!candidate.rowCount) {
        throw new BadRequestException("Verification code is expired or not found");
      }

      const verificationCode = candidate.rows[0];
      if (verificationCode.code_hash !== codeHash) {
        throw new BadRequestException("Invalid verification code");
      }

      await client.query("UPDATE verification_codes SET consumed_at = NOW() WHERE id = $1", [verificationCode.id]);

      const result = await client.query<{ id: string }>(
        `
          UPDATE users
          SET email_verified_at = COALESCE(email_verified_at, NOW())
          WHERE id = $1
          RETURNING id
        `,
        [verificationCode.user_id]
      );

      return result.rows[0];
    });

    return {
      message: "Email verified",
      userId: verified.id
    };
  }

  async resendEmailVerification(email: string) {
    const user = await getOne<Pick<IdentityUserRecord, "id" | "email" | "full_name" | "email_verified_at">>(
      `
        SELECT id, email, full_name, email_verified_at
        FROM users
        WHERE email = $1
      `,
      [email.trim().toLowerCase()]
    );

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.email_verified_at) {
      return {
        message: "Email already verified",
        emailVerificationSent: false,
        alreadyVerified: true
      };
    }

    const verificationEmailSent = await this.issueEmailVerificationCode(user.id, user.email, user.full_name);

    return {
      message: verificationEmailSent ? "Verification code sent" : "Verification email could not be sent",
      emailVerificationSent: verificationEmailSent,
      alreadyVerified: false
    };
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await getOne<Pick<IdentityUserRecord, "id" | "email" | "full_name">>(
      `
        SELECT id, email, full_name
        FROM users
        WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (!user) {
      return {
        message: "If the email exists, a reset code will be sent."
      };
    }

    await this.issuePasswordResetCode(user.id, user.email, user.full_name);

    return {
      message: "If the email exists, a reset code will be sent."
    };
  }

  async confirmPasswordReset(email: string, code: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const codeHash = hashVerificationCode(code);
    const passwordHash = await bcrypt.hash(password, 12);

    const reset = await withTransaction(async (client) => {
      const candidate = await client.query<VerificationCodeRecord>(
        `
          SELECT id, user_id, code_hash
          FROM verification_codes
          WHERE email = $1
            AND purpose = $2
            AND consumed_at IS NULL
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [normalizedEmail, this.passwordResetPurpose]
      );

      if (!candidate.rowCount) {
        throw new BadRequestException("Password reset code is expired or not found");
      }

      const verificationCode = candidate.rows[0];
      if (verificationCode.code_hash !== codeHash) {
        throw new BadRequestException("Invalid password reset code");
      }

      await client.query("UPDATE verification_codes SET consumed_at = NOW() WHERE id = $1", [verificationCode.id]);

      const result = await client.query<{ id: string }>(
        `
          UPDATE users
          SET password_hash = $2
          WHERE id = $1
          RETURNING id
        `,
        [verificationCode.user_id, passwordHash]
      );

      if (!result.rowCount) {
        throw new BadRequestException("Password reset code is expired or not found");
      }

      return result.rows[0];
    });

    return {
      message: "Password reset successful",
      userId: reset.id
    };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.getUserByLoginIdentifier(dto.email.trim());
    const isValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!isValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.email_verified_at) {
      throw new ForbiddenException("Verify email before login");
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const payload = this.refreshJwt.verify<{ sub: string; email: string }>(refreshToken);
    const user = await this.getUserByEmail(payload.email);
    return this.createSession(user);
  }

  async getProfile(userId: string) {
    const user = await getOne<IdentityUserRecord>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          phone,
          referral_code,
          referred_by,
          kyc_status,
          role,
          email_verified_at,
          security_passcode_hash
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.toPublicUser(user);
  }

  async setSecurityPasscode(userId: string, passcode: string) {
    await dbQuery(
      `
        UPDATE users
        SET security_passcode_hash = $2
        WHERE id = $1
      `,
      [userId, hashSecurityPasscode(passcode)]
    );

    return {
      message: "Security passcode saved",
      hasSecurityPasscode: true
    };
  }

  async changePassword(userId: string, currentPassword: string, password: string) {
    const user = await getOne<IdentityUserRecord>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          phone,
          referral_code,
          referred_by,
          kyc_status,
          role,
          email_verified_at,
          security_passcode_hash
        FROM users
        WHERE id = $1
      `,
      [userId]
    );

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const currentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!currentPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await dbQuery("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);

    return {
      message: "Password updated"
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const fullName = dto.fullName?.trim();
    const phone = dto.phone?.trim();

    if (!fullName && !phone) {
      return this.getProfile(userId);
    }

    try {
      const user = await getOne<IdentityUserRecord>(
        `
          UPDATE users
          SET
            full_name = COALESCE($2, full_name),
            phone = COALESCE($3, phone)
          WHERE id = $1
          RETURNING
            id,
            email,
            password_hash,
            full_name,
            phone,
            referral_code,
            referred_by,
            kyc_status,
            role,
            email_verified_at,
            security_passcode_hash
        `,
        [userId, fullName || null, phone || null]
      );

      if (!user) {
        throw new NotFoundException("User not found");
      }

      return this.toPublicUser(user);
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        throw new ConflictException("Phone number is already in use");
      }

      throw error;
    }
  }

  private async getUserByEmail(email: string) {
    const user = await getOne<IdentityUserRecord>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          phone,
          referral_code,
          referred_by,
          kyc_status,
          role,
          email_verified_at,
          security_passcode_hash
        FROM users
        WHERE email = $1
      `,
      [email]
    );

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }

  private async getUserByLoginIdentifier(identifier: string) {
    const user = await getOne<IdentityUserRecord>(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          phone,
          referral_code,
          referred_by,
          kyc_status,
          role,
          email_verified_at,
          security_passcode_hash
        FROM users
        WHERE LOWER(email) = LOWER($1)
           OR LOWER(full_name) = LOWER($1)
           OR regexp_replace(phone, '[^0-9]', '', 'g') =
              regexp_replace($1, '[^0-9]', '', 'g')
           OR regexp_replace(UPPER(referral_code), '[^A-Z0-9]', '', 'g') =
              regexp_replace(UPPER($1), '[^A-Z0-9]', '', 'g')
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [identifier]
    );

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }

  private createSession(user: IdentityUserRecord): AuthSession {
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kycStatus: user.kyc_status
    };

    return {
      accessToken: this.jwt.sign(tokenPayload),
      refreshToken: this.refreshJwt.sign({ sub: user.id, email: user.email }),
      user: this.toPublicUser(user)
    };
  }

  private toPublicUser(user: IdentityUserRecord): IdentityUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      referralCode: user.referral_code,
      referredBy: user.referred_by ?? undefined,
      kycStatus: user.kyc_status,
      role: user.role,
      emailVerifiedAt: user.email_verified_at,
      hasSecurityPasscode: Boolean(user.security_passcode_hash)
    };
  }

  private normalizePhone(phone: string) {
    return phone.trim().replace(/[^\d+]/g, "");
  }

  private async insertUser(input: {
    email: string;
    passwordHash: string;
    fullName: string;
    phone: string;
    referralCode: string;
    referredBy: string | null;
  }) {
    try {
      const inserted = await getOne<Pick<IdentityUserRecord, "id" | "referral_code">>(
        `
          INSERT INTO users (
            id,
            email,
            password_hash,
            full_name,
            phone,
            referral_code,
            referred_by,
            kyc_status,
            role,
            email_verified_at
          )
          VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'pending',
            'USER',
            NULL
          )
          RETURNING id, referral_code
        `,
        [input.email, input.passwordHash, input.fullName, input.phone, input.referralCode, input.referredBy]
      );

      if (!inserted) {
        throw new BadRequestException("Registration could not be created");
      }

      return inserted;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const constraint = String((error as { constraint?: unknown }).constraint ?? "");
        if (constraint.includes("phone")) {
          throw new ConflictException("Phone number already registered");
        }

        throw new ConflictException("Email already registered");
      }

      throw error;
    }
  }

  private publishRegistrationEvent(payload: { userId: string; email: string; fullName: string; referralCode: string }) {
    void this.withTimeout(
      publishEvent("user.registered", payload),
      this.eventPublishTimeoutMs,
      "Publishing registration event timed out"
    ).catch((error) => {
      console.warn("[identity-service] failed to publish registration event", error);
    });
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
  }

  private readPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async issueEmailVerificationCode(userId: string, email: string, fullName: string) {
    const code = createNumericVerificationCode();

    await dbQuery(
      `
        UPDATE verification_codes
        SET consumed_at = NOW()
        WHERE user_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [userId, this.emailVerificationPurpose]
    );

    await dbQuery(
      `
        INSERT INTO verification_codes (id, user_id, email, purpose, code_hash, expires_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW() + ($5::int * INTERVAL '1 minute'))
      `,
      [
        userId,
        email,
        this.emailVerificationPurpose,
        hashVerificationCode(code),
        this.verificationCodeTtlMinutes
      ]
    );

    try {
      const platformName = process.env.PLATFORM_NAME ?? "FNDK";
      const result = await this.withTimeout(
        sendMail({
          to: email,
          subject: `${platformName} email verification code`,
          text: [
            `Hello ${fullName},`,
            "",
            `Your ${platformName} verification code is ${normalizeVerificationCode(code)}.`,
            `It expires in ${this.verificationCodeTtlMinutes} minutes.`,
            "",
            "If you did not create this account, you can ignore this email."
          ].join("\n"),
          html: `
            <p>Hello,</p>
            <p>Your <strong>${platformName}</strong> verification code is:</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${normalizeVerificationCode(code)}</p>
            <p>This code expires in ${this.verificationCodeTtlMinutes} minutes.</p>
            <p>If you did not create this account, you can ignore this email.</p>
          `
        }),
        this.mailTimeoutMs,
        "Verification email timed out"
      );

      return !result.skipped;
    } catch (error) {
      console.warn("[identity-service] failed to send verification email", error);
      return false;
    }
  }

  private async issuePasswordResetCode(userId: string, email: string, fullName: string) {
    const code = createNumericVerificationCode();

    await dbQuery(
      `
        UPDATE verification_codes
        SET consumed_at = NOW()
        WHERE user_id = $1
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [userId, this.passwordResetPurpose]
    );

    await dbQuery(
      `
        INSERT INTO verification_codes (id, user_id, email, purpose, code_hash, expires_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW() + ($5::int * INTERVAL '1 minute'))
      `,
      [
        userId,
        email,
        this.passwordResetPurpose,
        hashVerificationCode(code),
        this.verificationCodeTtlMinutes
      ]
    );

    try {
      const platformName = process.env.PLATFORM_NAME ?? "FNDK";
      const result = await this.withTimeout(
        sendMail({
          to: email,
          subject: `${platformName} password reset code`,
          text: [
            `Hello ${fullName},`,
            "",
            `Your ${platformName} password reset code is ${normalizeVerificationCode(code)}.`,
            `It expires in ${this.verificationCodeTtlMinutes} minutes.`,
            "",
            "If you did not request this reset, you can ignore this email."
          ].join("\n"),
          html: `
            <p>Hello,</p>
            <p>Your <strong>${platformName}</strong> password reset code is:</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${normalizeVerificationCode(code)}</p>
            <p>This code expires in ${this.verificationCodeTtlMinutes} minutes.</p>
            <p>If you did not request this reset, you can ignore this email.</p>
          `
        }),
        this.mailTimeoutMs,
        "Password reset email timed out"
      );

      return !result.skipped;
    } catch (error) {
      console.warn("[identity-service] failed to send password reset email", error);
      return false;
    }
  }
}
