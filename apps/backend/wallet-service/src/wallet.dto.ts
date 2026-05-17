import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from "class-validator";
import type { AssetType } from "@nevo/shared-types";
import { SUPPORTED_ASSETS } from "@nevo/shared-utils";

export class CreateDepositDto {
  @IsIn(SUPPORTED_ASSETS)
  asset!: AssetType;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  proofUrl?: string;
}

export class RequestWithdrawalCodeDto {
  @IsIn(SUPPORTED_ASSETS)
  asset!: AssetType;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  destinationAddress!: string;
}

export class CreateWithdrawalDto extends RequestWithdrawalCodeDto {
  @IsString()
  @MinLength(4)
  verificationCode!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "Security passcode must be exactly 6 digits" })
  securityPasscode!: string;
}
