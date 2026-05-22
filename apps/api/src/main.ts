import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import { AppModule } from "./app.module";
import { loadEnv } from "./env";
import { initSentry } from "./sentry";

// Default JSON.stringify can't serialize BigInt — make it emit strings so
// money fields (price_cents, cost_cents) round-trip cleanly to the client.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const env = loadEnv();
  // Init Sentry before Nest so startup errors are captured. No-op when
  // SENTRY_DSN_API is empty (default in dev + CI).
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.NODE_ENV === "test" ? ["error", "warn"] : ["error", "warn", "log"],
  });

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.API_CORS_ORIGIN,
    credentials: true,
  });
  app.set("trust proxy", 1);

  // Wire the Express error handler so unhandled exceptions flow to Sentry.
  if (env.SENTRY_DSN_API) {
    Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
  }

  await app.listen(env.API_PORT);
  if (env.NODE_ENV !== "test") {
    console.log(`[api] listening on http://localhost:${env.API_PORT}`);
  }
}

void bootstrap();
