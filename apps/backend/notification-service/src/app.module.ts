import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationController],
  providers: [NotificationService]
})
export class AppModule {}

