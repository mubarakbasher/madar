import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { from, Observable, of } from "rxjs";
import { mergeMap, tap } from "rxjs/operators";
import { RedisService } from "./redis.service";

const META = "idempotent";
export const Idempotent = () => SetMetadata(META, true);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService, private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(META, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const headerVal = req.headers["idempotency-key"];
    const key = Array.isArray(headerVal) ? headerVal[0] : headerVal;

    if (!key) {
      throw new BadRequestException({
        code: "idempotency_key_required",
        message: "Idempotency-Key header is required",
      });
    }
    if (!UUID_RE.test(key)) {
      throw new BadRequestException({
        code: "idempotency_key_invalid",
        message: "Idempotency-Key must be a UUID v1-v5",
      });
    }

    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const cacheKey = `idem:${route}:${key}`;

    return from(this.redis.get(cacheKey)).pipe(
      mergeMap((cached) => {
        if (cached) {
          const parsed = JSON.parse(cached) as StoredResponse;
          res.status(parsed.status);
          return of(parsed.body);
        }
        return next.handle().pipe(
          tap((body: unknown) => {
            const stored: StoredResponse = { status: res.statusCode, body };
            void this.redis.setNxEx(cacheKey, JSON.stringify(stored), 24 * 60 * 60);
          }),
        );
      }),
    );
  }
}
