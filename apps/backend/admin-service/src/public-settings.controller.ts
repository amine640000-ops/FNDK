import { Controller, Get, Inject } from "@nestjs/common";
import { AdminService } from "./admin.service";

@Controller("public")
export class PublicSettingsController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("ad-carousel")
  adCarousel() {
    return this.adminService.getPublicAdCarouselSlides();
  }
}
