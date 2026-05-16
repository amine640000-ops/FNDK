import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { VipService } from "./vip.service";

@Controller("vip")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("USER", "ADMIN")
export class VipController {
  constructor(@Inject(VipService) private readonly vipService: VipService) {}

  @Get("tiers")
  tiers() {
    return this.vipService.getTiers();
  }

  @Get("current")
  current(@CurrentUser() user: AccessTokenPayload) {
    return this.vipService.getCurrentTier(user.sub);
  }

  @Get("next-upgrade")
  nextUpgrade(@CurrentUser() user: AccessTokenPayload) {
    return this.vipService.getNextUpgrade(user.sub);
  }
}
