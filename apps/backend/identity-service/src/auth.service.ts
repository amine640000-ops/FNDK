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
import { dbQuery, getOne, publishEvent } from "@nevo/shared-infra";
import type { KycStatus, UserRole } from "@nevo/shared-types";
import { createReferralCode } from "@nevo/shared-utils";
import type { LoginDto, RegisterDto } from "./auth.dto";

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
}

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
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: IdentityUser;
}

@Injectable()
export class AuthService {
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
    const existingUser = await getOne<Pick<IdentityUserRecord, "id">>("SELECT id FROM users WHERE email = $1", [email]);

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const userCount = await getOne<{ count: number }>("SELECT COUNT(*)::int AS count FROM users WHERE role = 'USER'");
    const inboundReferralCode = dto.referralCode?.trim().toUpperCase() ?? "";
    let referrer: Pick<IdentityUserRecord, "id"> | null = null;

    if (userCount?.count) {
      if (!inboundReferralCode) {
        throw new BadRequestException("Referral code is required");
      }

      referrer = await getOne<Pick<IdentityUserRecord, "id">>(
        "SELECT id FROM users WHERE referral_code = $1",
        [inboundReferralCode]
      );

      if (!referrer) {
        throw new BadRequestException("Valid referral code is required");
      }
    }

    const referralCode = createReferralCode(`${dto.fullName}${Date.now().toString(36)}`);
    const passwordHash = await bcrypt.hash(dto.password, 12);

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
          NOW()
        )
        RETURNING id, referral_code
      `,
      [email, passwordHash, dto.fullName, dto.phone, referralCode, referrer?.id ?? null]
    );

    await publishEvent("user.registered", {
      userId: inserted!.id,
      email,
      fullName: dto.fullName,
      referralCode: inserted!.referral_code
    });

    return {
      message: "Registration created. Your account is ready to sign in.",
      userId: inserted!.id,
      referralCode: inserted!.referral_code
    };
  }

  async verifyEmail(email: string) {
    const result = await dbQuery<{ id: string }>(
      `
        UPDATE users
        SET email_verified_at = NOW()
        WHERE email = $1
        RETURNING id
      `,
      [email.trim().toLowerCase()]
    );

    if (!result.rowCount) {
      throw new NotFoundException("User not found");
    }

    return {
      message: "Email verified",
      userId: result.rows[0].id
    };
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.getUserByEmail(dto.email.trim().toLowerCase());
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
          email_verified_at
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
          email_verified_at
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
      emailVerifiedAt: user.email_verified_at
    };
  }
}
