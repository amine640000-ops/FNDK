import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { KycController } from "./kyc.controller";
import { KycService } from "./kyc.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AuthController, KycController],
  providers: [AuthService, KycService]
})
export class AppModule {}
