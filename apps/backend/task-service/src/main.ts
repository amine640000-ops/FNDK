import "reflect-metadata";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { getCorsOrigins } from "@nevo/shared-infra";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true
  });
  app.setGlobalPrefix("api");
  await app.listen(Number(process.env.PORT ?? 4004));
}

void bootstrap();
