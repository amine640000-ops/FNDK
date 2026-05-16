import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import {
  AdminGuard,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard
} from "@nevo/shared-infra";
import type { AccessTokenPayload } from "@nevo/shared-types";
import { TaskService } from "./task.service";

@Controller("tasks")
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(@Inject(TaskService) private readonly taskService: TaskService) {}

  @Get("status")
  @UseGuards(AdminGuard)
  status() {
    return this.taskService.getStatus();
  }

  @Get("activations/me")
  @UseGuards(RolesGuard)
  @Roles("USER", "ADMIN")
  myActivations(@CurrentUser() user: AccessTokenPayload) {
    return this.taskService.getManualActivationState(user.sub);
  }

  @Post("activations/start")
  @UseGuards(RolesGuard)
  @Roles("USER", "ADMIN")
  startActivation(@CurrentUser() user: AccessTokenPayload, @Body() body: { reservationAmount?: number }) {
    return this.taskService.startManualActivation(user.sub, body.reservationAmount);
  }

  @Post("profit-distribution")
  @UseGuards(AdminGuard)
  distribute(@Query("scope") scope = "all") {
    return this.taskService.runProfitDistribution(scope);
  }
}
