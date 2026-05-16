import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from "class-validator";

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
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsEmail()
  email!: string;
}
