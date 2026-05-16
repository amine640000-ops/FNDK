import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VipController } from "./vip.controller";
import { VipService } from "./vip.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [VipController],
  providers: [VipService]
})
export class AppModule {}

