import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";
import type { AdCarouselSlide, AssetRouteSetting, AssetType, LuckyDrawEventConfig, MissionTaskSetting } from "@nevo/shared-types";
import { SUPPORTED_ASSETS } from "@nevo/shared-utils";

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
  luckyDraw?: LuckyDrawEventConfig;

  @IsOptional()
  @IsArray()
  adCarouselSlides?: AdCarouselSlide[];

  @IsOptional()
  @IsArray()
  assetSettings?: AssetRouteSetting[];

  @IsOptional()
  @IsArray()
  missionTasks?: MissionTaskSetting[];

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
  @IsNumber()
  @Min(0)
  dailyProfitCap?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiredDirectMembers?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  activationLimitPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  activationDurationMinutes?: number;
}

export class AdjustUserBalanceDto {
  @IsOptional()
  @IsIn(SUPPORTED_ASSETS)
  asset?: AssetType;

  @IsIn(["add", "subtract", "set"])
  operation!: "add" | "subtract" | "set";

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AdjustUserGainDto {
  @IsIn(["add", "subtract", "set"])
  operation!: "add" | "subtract" | "set";

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateProfitSettingsDto {
  @IsBoolean()
  autoProfitDistribution!: boolean;
}

export class GrantLuckyDrawSpinsDto {
  @IsUUID()
  userId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  spinCount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

export class RevokeLuckyDrawSpinDto {
  @IsOptional()
  @IsString()
  note?: string;
}
