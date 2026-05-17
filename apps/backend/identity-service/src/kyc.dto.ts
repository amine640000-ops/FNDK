import { IsOptional, IsString } from "class-validator";

export class SubmitKycDto {
  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;
}

export class ReviewKycSubmissionDto {
  @IsString()
  status!: "verified" | "rejected";

  @IsOptional()
  @IsString()
  adminNote?: string;
}
