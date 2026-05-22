import { z } from "zod";
import { SlugSchema } from "./signup.dto";

export const SlugAvailableQuerySchema = z.object({
  slug: SlugSchema,
});

export type SlugAvailableQuery = z.infer<typeof SlugAvailableQuerySchema>;

export const RESERVED_SLUGS = new Set<string>([
  "www",
  "api",
  "admin",
  "app",
  "auth",
  "help",
  "status",
  "blog",
  "docs",
  "public",
  "platform",
  "support",
  "static",
  "assets",
  "cdn",
  "mail",
  "email",
  "billing",
]);
