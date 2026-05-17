import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  createDiskStorageOptions
} from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { SubmitKycDto } from "./kyc.dto";
import { KycService } from "./kyc.service";

@Controller("kyc")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("USER", "ADMIN")
export class KycController {
  constructor(@Inject(KycService) private readonly kycService: KycService) {}

  @Get("submissions/me")
  listMine(@CurrentUser() user: AccessTokenPayload) {
    return this.kycService.listForUser(user.sub);
  }

  @Post("submissions")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "idDocument", maxCount: 1 },
        { name: "document", maxCount: 1 },
        { name: "id_document", maxCount: 1 },
        { name: "documentFile", maxCount: 1 },
        { name: "selfie", maxCount: 1 },
        { name: "selfieFile", maxCount: 1 },
        { name: "selfie_file", maxCount: 1 }
      ],
      createDiskStorageOptions("kyc")
    )
  )
  submit(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SubmitKycDto,
    @UploadedFiles()
    files: {
      idDocument?: Array<{ filename: string }>;
      document?: Array<{ filename: string }>;
      id_document?: Array<{ filename: string }>;
      documentFile?: Array<{ filename: string }>;
      selfie?: Array<{ filename: string }>;
      selfieFile?: Array<{ filename: string }>;
      selfie_file?: Array<{ filename: string }>;
    }
  ) {
    return this.kycService.submit(user.sub, dto, files);
  }
}
