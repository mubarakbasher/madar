import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { RedisService } from "./redis.service";
import { getClientIp } from "./request-context";

export interface RateLimitOptions {
  /** Max number of requests in the window. */
  max: number;
  /** Window length, milliseconds. */
  windowMs: number;
  /** Optional additional bucket beyond IP (e.g. "email"). When set, the limit applies separately to (route, ip) AND (route, key). */
  keyByField?: "email";
}

const META = "rate_limit";
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(META, opts);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip outside production: dev workflows (and tests) hit the same endpoints
    // dozens of times in a session and the rate limit just adds friction.
    // Production keeps the limits enforced.
    if (process.env.NODE_ENV !== "production") return true;

    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(META, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const ip = getClientIp(req);

    const ipBucket = `rl:${route}:ip:${ip}`;
    const ipCount = await this.redis.slidingWindowIncr(ipBucket, opts.windowMs);
    if (ipCount > opts.max) {
      throw new HttpException(
        { code: "rate_limited", message: "Too many requests" },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (opts.keyByField === "email") {
      const body = (req.body ?? {}) as { email?: string };
      const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : null;
      if (email) {
        const emailBucket = `rl:${route}:email:${email}`;
        const emailCount = await this.redis.slidingWindowIncr(emailBucket, opts.windowMs);
        if (emailCount > opts.max) {
          throw new HttpException(
            { code: "rate_limited", message: "Too many requests" },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    return true;
  }
}
