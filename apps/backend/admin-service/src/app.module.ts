import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PublicSettingsController } from "./public-settings.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AdminController, PublicSettingsController],
  providers: [AdminService]
})
export class AppModule {}
