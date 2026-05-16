import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, JwtAuthGuard } from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto, VerifyEmailDto } from "./auth.dto";

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
    return this.authService.verifyEmail(dto.email);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getProfile(user.sub);
  }
}
