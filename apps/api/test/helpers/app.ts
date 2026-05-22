import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "../../src/app.module";

export interface BootedTestApp {
  app: INestApplication;
  http: ReturnType<INestApplication["getHttpServer"]>;
}

/**
 * Boot a full INestApplication with the same middleware stack as production
 * main.ts: helmet + cookie-parser + trust-proxy. CORS is skipped (in-process
 * supertest doesn't cross origins).
 *
 * Each spec calls bootTestApp() in beforeAll and app.close() in afterAll. The
 * vitest singleFork pool means specs run sequentially in one process, so the
 * in-memory Redis fallback (process-wide map) is naturally shared but each
 * spec creates a fresh tenant slug so audit-log assertions don't collide.
 */
export async function bootTestApp(): Promise<BootedTestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  app.use(helmet());
  app.use(cookieParser());
  app.set("trust proxy", 1);

  await app.init();
  return { app, http: app.getHttpServer() };
}
