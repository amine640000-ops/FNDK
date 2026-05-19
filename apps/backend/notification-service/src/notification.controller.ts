import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import {
  AdminGuard,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard
} from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { NotificationService } from "./notification.service";
import { SendNotificationDto } from "./notification.dto";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("USER", "ADMIN")
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly notificationService: NotificationService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.notificationService.list(user.sub);
  }

  @Patch("read")
  markRead(@CurrentUser() user: AccessTokenPayload, @Body() dto: { id?: string }) {
    return this.notificationService.markRead(user.sub, dto.id);
  }

  @Post("send")
  @UseGuards(JwtAuthGuard, AdminGuard)
  send(@Body() dto: SendNotificationDto) {
    return this.notificationService.send(dto);
  }
}
