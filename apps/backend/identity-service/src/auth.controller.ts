import { Body, Controller, Get, Headers, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, JwtAuthGuard } from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { AuthService } from "./auth.service";
import {
  ConfirmPasswordResetDto,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendEmailVerificationDto,
  SetSecurityPasscodeDto,
  UpdateProfileDto,
  VerifyEmailDto
} from "./auth.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Headers("x-refresh-token") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Post("verify-email")
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Post("resend-email-verification")
  resendEmailVerification(@Body() dto: ResendEmailVerificationDto) {
    return this.authService.resendEmailVerification(dto.email);
  }

  @Post("password-reset/request")
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto.email, dto.code, dto.password);
  }

  @Post("security-passcode")
  @UseGuards(JwtAuthGuard)
  setSecurityPasscode(@CurrentUser() user: AccessTokenPayload, @Body() dto: SetSecurityPasscodeDto) {
    return this.authService.setSecurityPasscode(user.sub, dto.passcode);
  }

  @Post("password")
  @UseGuards(JwtAuthGuard)
  changePassword(@CurrentUser() user: AccessTokenPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getProfile(user.sub);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.sub, dto);
  }
}
