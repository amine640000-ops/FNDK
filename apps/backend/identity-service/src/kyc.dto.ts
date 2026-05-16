import { IsOptional, IsString } from "class-validator";

export class SubmitKycDto {
  @IsOptional()
  @IsString()
  documentType?: string;
}

export class ReviewKycSubmissionDto {
  @IsString()
  status!: "verified" | "rejected";

  @IsOptional()
  @IsString()
  adminNote?: string;
}

