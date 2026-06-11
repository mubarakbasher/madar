import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, mergeMap, tap } from "rxjs/operators";
import { RedisService } from "./redis.service";
import { getClientIp } from "./request-context";

const META = "idempotent";
export const Idempotent = () => SetMetadata(META, true);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DONE_TTL_SECONDS = 24 * 60 * 60;
// How long an in-flight reservation blocks duplicates. Generous enough for a
// slow upload-processing request, short enough that a crashed request frees
// the key without manual cleanup.
const IN_PROGRESS_TTL_SECONDS = 120;

interface StoredEntry {
  state: "in_progress" | "done";
  bodyHash: string;
  status?: number;
  body?: unknown;
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

    // Scope the cache to the calling principal: a key is only "the same
    // request" when the same tenant user (or admin, or anonymous IP) repeats
    // it. Without this, any caller replaying a known UUID on the same route
    // would receive ANOTHER TENANT's cached response body.
    const principal = this.principalScope(req);
    const route = `${req.method}:${req.route?.path ?? req.path}`;
    const cacheKey = `idem:${route}:${principal}:${key}`;

    // Bind the key to the payload so a reused key with a different body is
    // rejected instead of silently returning the first response.
    const bodyHash = createHash("sha256")
      .update(JSON.stringify(req.body ?? null))
      .digest("hex");

    const reservation: StoredEntry = { state: "in_progress", bodyHash };

    return from(
      this.redis.setNxEx(cacheKey, JSON.stringify(reservation), IN_PROGRESS_TTL_SECONDS),
    ).pipe(
      mergeMap((reserved) => {
        if (!reserved) return this.handleExisting(cacheKey, bodyHash, res);
        // We hold the reservation — execute, then persist the response for
        // replays. On failure, release the key so the client can retry.
        return next.handle().pipe(
          tap((body: unknown) => {
            const done: StoredEntry = {
              state: "done",
              bodyHash,
              status: res.statusCode,
              body,
            };
            void this.redis.setEx(cacheKey, JSON.stringify(done), DONE_TTL_SECONDS);
          }),
          catchError((err) => {
            void this.redis.del(cacheKey);
            return throwError(() => err);
          }),
        );
      }),
    );
  }

  private handleExisting(
    cacheKey: string,
    bodyHash: string,
    res: Response,
  ): Observable<unknown> {
    return from(this.redis.get(cacheKey)).pipe(
      mergeMap((raw) => {
        if (!raw) {
          // Reservation expired/freed between SETNX and GET — extremely rare;
          // tell the client to retry rather than risk double execution.
          throw new ConflictException({
            code: "idempotency_in_progress",
            message: "A request with this Idempotency-Key is being processed — retry shortly",
          });
        }
        const entry = JSON.parse(raw) as StoredEntry;
        if (entry.bodyHash !== bodyHash) {
          throw new UnprocessableEntityException({
            code: "idempotency_payload_mismatch",
            message: "This Idempotency-Key was already used with a different request body",
          });
        }
        if (entry.state === "in_progress") {
          throw new ConflictException({
            code: "idempotency_in_progress",
            message: "A request with this Idempotency-Key is being processed — retry shortly",
          });
        }
        res.status(entry.status ?? 200);
        return of(entry.body);
      }),
    );
  }

  private principalScope(req: Request): string {
    const tenantUser = (req as Request & {
      user?: { tenantId?: string; userId?: string };
    }).user;
    if (tenantUser?.tenantId && tenantUser.userId) {
      return `t:${tenantUser.tenantId}:${tenantUser.userId}`;
    }
    const admin = (req as Request & { admin?: { platformUserId?: string } }).admin;
    if (admin?.platformUserId) {
      return `a:${admin.platformUserId}`;
    }
    return `anon:${getClientIp(req)}`;
  }
}
