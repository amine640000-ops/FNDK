import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  createDiskStorageOptions
} from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { WalletService } from "./wallet.service";
import { CreateDepositDto, CreateWithdrawalDto } from "./wallet.dto";

@Controller("wallet")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("USER", "ADMIN")
export class WalletController {
  constructor(@Inject(WalletService) private readonly walletService: WalletService) {}

  @Get("summary")
  summary(@CurrentUser() user: AccessTokenPayload) {
    return this.walletService.getSummary(user.sub);
  }

  @Get("transactions")
  transactions(@CurrentUser() user: AccessTokenPayload) {
    return this.walletService.getTransactions(user.sub);
  }

  @Get("deposit-addresses")
  depositAddresses() {
    return this.walletService.getDepositAddresses();
  }

  @Post("deposits")
  @UseInterceptors(FileInterceptor("proof", createDiskStorageOptions("deposit-proofs")))
  createDeposit(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateDepositDto,
    @UploadedFile() proof?: { filename: string }
  ) {
    return this.walletService.createDeposit(user.sub, dto, proof);
  }

  @Post("withdrawals")
  createWithdrawal(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateWithdrawalDto) {
    return this.walletService.createWithdrawal(user.sub, dto);
  }
}
