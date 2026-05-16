import { Type } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
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

export class CreateWithdrawalDto {
  @IsIn(SUPPORTED_ASSETS)
  asset!: AssetType;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  destinationAddress!: string;
}
