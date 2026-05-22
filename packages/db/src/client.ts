import { PrismaClient } from "@prisma/client";

declare global {

  var __madarPrisma: PrismaClient | undefined;
}

export const basePrisma: PrismaClient =
  globalThis.__madarPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__madarPrisma = basePrisma;
}
