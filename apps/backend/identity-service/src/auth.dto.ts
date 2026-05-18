import { IsEmail, IsOptional, IsPhoneNumber, IsString, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: "Password must include uppercase, lowercase, number, and symbol"
  })
  password!: string;

  @IsString()
  @MinLength(2, { message: "Full name must be at least 2 characters" })
  fullName!: string;

  @IsPhoneNumber(undefined, { message: "Enter a valid phone number with country code, for example +21656109879" })
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: "Referral code must be at least 3 characters" })
  referralCode?: string;
}

export class LoginDto {
  @IsString()
  @MinLength(2)
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  code!: string;
}

export class ResendEmailVerificationDto {
  @IsEmail()
  email!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  code!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: "Password must include uppercase, lowercase, number, and symbol"
  })
  password!: string;
}

export class SetSecurityPasscodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Security passcode must be exactly 6 digits" })
  passcode!: string;
}
