import "reflect-metadata";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ensureUploadsRoot, getCorsOrigins } from "@nevo/shared-infra";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet());
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true
  });
  const uploadsRoot = ensureUploadsRoot();
  app.useStaticAssets(uploadsRoot, {
    prefix: "/uploads"
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 4006));
}

void bootstrap();
