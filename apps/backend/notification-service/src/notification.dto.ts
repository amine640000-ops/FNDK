import { IsOptional, IsString } from "class-validator";

export class SendNotificationDto {
  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

