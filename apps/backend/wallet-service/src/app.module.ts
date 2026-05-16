import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [WalletController],
  providers: [WalletService]
})
export class AppModule {}

