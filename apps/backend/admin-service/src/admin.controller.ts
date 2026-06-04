import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminGuard, CurrentUser, JwtAuthGuard, createDiskStorageOptions, toPublicUploadUrl } from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import {
  AdjustUserBalanceDto,
  GrantLuckyDrawSpinsDto,
  RevokeLuckyDrawSpinDto,
  UpdateAdminSettingsDto,
  UpdateProfitSettingsDto,
  UpdateVipTierDto
} from "./admin.dto";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("overview")
  overview() {
    return this.adminService.getOverview();
  }

  @Get("users")
  users() {
    return this.adminService.getUsers();
  }

  @Get("settings")
  settings() {
    return this.adminService.getSettings();
  }

  @Get("deposits")
  deposits() {
    return this.adminService.getDeposits();
  }

  @Get("withdrawals")
  withdrawals() {
    return this.adminService.getWithdrawals();
  }

  @Get("vip-tiers")
  vipTiers() {
    return this.adminService.getVipTiers();
  }

  @Get("profit-settings")
  profitSettings() {
    return this.adminService.getProfitSettings();
  }

  @Get("kyc")
  kycSubmissions() {
    return this.adminService.getKycSubmissions();
  }

  @Get("lucky-draw/analytics")
  luckyDrawAnalytics() {
    return this.adminService.getLuckyDrawAnalytics();
  }

  @Post("lucky-draw/spins/grant")
  grantLuckyDrawSpins(@CurrentUser() user: AccessTokenPayload, @Body() body: GrantLuckyDrawSpinsDto) {
    return this.adminService.grantLuckyDrawSpins(user.sub, body);
  }

  @Patch("lucky-draw/spins/:ledgerId/revoke")
  revokeLuckyDrawSpinAward(
    @CurrentUser() user: AccessTokenPayload,
    @Param("ledgerId") ledgerId: string,
    @Body() body: RevokeLuckyDrawSpinDto
  ) {
    return this.adminService.revokeLuckyDrawSpinAward(user.sub, ledgerId, body.note);
  }

  @Patch("transactions/:transactionId/approve")
  approveTransaction(@CurrentUser() user: AccessTokenPayload, @Param("transactionId") transactionId: string) {
    return this.adminService.approveTransaction(transactionId, user.sub);
  }

  @Patch("transactions/:transactionId/reject")
  rejectTransaction(
    @CurrentUser() user: AccessTokenPayload,
    @Param("transactionId") transactionId: string,
    @Body() body: { adminNote?: string }
  ) {
    return this.adminService.rejectTransaction(transactionId, user.sub, body.adminNote);
  }

  @Patch("kyc/:submissionId/review")
  reviewKyc(
    @Param("submissionId") submissionId: string,
    @Body() body: { status: "verified" | "rejected"; adminNote?: string }
  ) {
    return this.adminService.reviewKycSubmission(submissionId, body.status, body.adminNote);
  }

  @Patch("users/:userId/balance")
  adjustUserBalance(@Param("userId") userId: string, @Body() body: AdjustUserBalanceDto) {
    return this.adminService.adjustUserBalance(userId, body);
  }

  @Post("notifications/broadcast")
  broadcast(@Body() body: { title: string; message: string }) {
    return this.adminService.broadcast(body.title, body.message);
  }

  @Post("assets/ad-image")
  @UseInterceptors(
    FileInterceptor("image", {
      ...createDiskStorageOptions("ad-carousel"),
      limits: { fileSize: 5 * 1024 * 1024 }
    })
  )
  uploadAdImage(@UploadedFile() image?: { filename: string }) {
    if (!image) {
      throw new BadRequestException("Ad image is required");
    }

    return { url: toPublicUploadUrl("ad-carousel", image.filename) };
  }

  @Patch("settings")
  updateSettings(@Body() body: UpdateAdminSettingsDto) {
    return this.adminService.updateSettings(body);
  }

  @Patch("vip-tiers/:tierId")
  updateVipTier(@Param("tierId") tierId: string, @Body() body: UpdateVipTierDto) {
    return this.adminService.updateVipTier(Number(tierId), body);
  }

  @Post("vip-tiers")
  createVipTier(@Body() body: UpdateVipTierDto) {
    return this.adminService.createVipTier(body);
  }

  @Delete("vip-tiers/:tierId")
  deleteVipTier(@Param("tierId") tierId: string) {
    return this.adminService.deleteVipTier(Number(tierId));
  }

  @Patch("profit-settings")
  updateProfitSettings(@Body() body: UpdateProfitSettingsDto) {
    return this.adminService.updateProfitSettings(body.autoProfitDistribution);
  }

  @Post("profit/recalculate-users")
  recalculateAllUsers() {
    return this.adminService.recalculateAllUserVipTiers();
  }
}
