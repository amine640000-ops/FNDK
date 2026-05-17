import { IsEmail, IsOptional, IsPhoneNumber, IsString, Matches, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsPhoneNumber()
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
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

export class SetSecurityPasscodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "Security passcode must be exactly 6 digits" })
  passcode!: string;
}
