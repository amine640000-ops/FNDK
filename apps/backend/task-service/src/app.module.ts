import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TaskController } from "./task.controller";
import { TaskService } from "./task.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [TaskController],
  providers: [TaskService]
})
export class AppModule {}

