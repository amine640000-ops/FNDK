import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import type { AdCarouselSlide, AssetRouteSetting } from "@nevo/shared-types";

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsString()
  platformName?: string;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBtc?: boolean;

  @IsOptional()
  @IsBoolean()
  enableForex?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  referralBonusPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  feePercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  withdrawalsPerMonthLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reservationFailuresPerDay?: number;

  @IsOptional()
  @IsBoolean()
  giveawayEnabled?: boolean;

  @IsOptional()
  @IsString()
  giveawayTitle?: string;

  @IsOptional()
  @IsString()
  giveawayDescription?: string;

  @IsOptional()
  @IsString()
  giveawayPrize?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  giveawayWinners?: number;

  @IsOptional()
  @IsString()
  giveawayEndsAt?: string | null;

  @IsOptional()
  @IsArray()
  adCarouselSlides?: AdCarouselSlide[];

  @IsOptional()
  @IsArray()
  assetSettings?: AssetRouteSetting[];

  @IsOptional()
  @IsString()
  depositAddressBtc?: string;

  @IsOptional()
  @IsString()
  depositAddressEth?: string;

  @IsOptional()
  @IsString()
  depositAddressUsdtTrc20?: string;

  @IsOptional()
  @IsString()
  depositAddressUsdtErc20?: string;

  @IsOptional()
  @IsString()
  depositAddressUsd?: string;

  @IsOptional()
  @IsString()
  depositAddressEur?: string;

  @IsOptional()
  @IsString()
  depositAddressGbp?: string;

  @IsOptional()
  @IsString()
  depositAddressStocks?: string;
}

export class UpdateVipTierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minDeposit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRoiMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyRoiMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  activationLimitPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  activationDurationMinutes?: number;
}

export class UpdateProfitSettingsDto {
  @IsBoolean()
  autoProfitDistribution!: boolean;
}
