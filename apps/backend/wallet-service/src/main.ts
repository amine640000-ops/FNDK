import "reflect-metadata";
import { join } from "node:path";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { ensureUploadsRoot, getCorsOrigins } from "@nevo/shared-infra";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet());
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true
  });
  ensureUploadsRoot();
  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads"
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 4002));
}

void bootstrap();
