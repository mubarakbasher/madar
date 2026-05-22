# @madar/api

NestJS API for Madar. Two realms (tenant, admin) — Phase 1.5a ships the tenant auth module only.

## Realm boundary

`src/tenant/*` is for tenant users; `src/admin/*` (later) is for super-admins.
The `TenantAuthGuard` (applied globally via `APP_GUARD`) validates `realm: 'tenant'` and `typ: 'access'` claims and rejects everything else. Public routes opt in with `@Public()`.

## How to run

```bash
docker compose up -d postgres redis
pnpm install
pnpm db:migrate:deploy   # if not done already
pnpm dev:api             # tsx watch — http://localhost:4000
```

## Env vars

See root `.env.example`. Required at boot (validated by `src/env.ts`):

- `DATABASE_URL` — `madar_app` non-superuser; RLS enforces.
- `DIRECT_DATABASE_URL` — `madar` superuser; only for `prisma migrate`.
- `JWT_TENANT_SECRET` — 32-byte base64. Tenant realm only.
- `JWT_TENANT_ACCESS_TTL=15m`, `JWT_TENANT_REFRESH_TTL=30d`.
- `REDIS_URL` — used for rate limiting, idempotency, refresh-token jti rotation.
  If unset, falls back to an in-memory store (dev only; warning logged).
- `API_CORS_ORIGIN=http://localhost:3000` — exact allowed origin.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET  | `/healthz` | public | Liveness + DB probe |
| GET  | `/v1/auth/slug-available?slug=` | public | Live signup check |
| POST | `/v1/auth/signup` | public | `Idempotency-Key` required |
| POST | `/v1/auth/login` | public | rate-limited per IP and per email |
| POST | `/v1/auth/refresh` | cookie | Reads `madar_refresh`; rotates jti |
| POST | `/v1/auth/logout` | authed | Revokes refresh + clears cookie |
| GET  | `/v1/auth/me` | authed | Returns `{ user, tenant{ plan } }` |

## Database access

This package imports `@madar/db/tenant` (`tenantScoped`) and `@madar/db/admin` (`adminPrisma`). It never imports `@prisma/client` directly.

- Signup uses `adminPrisma` for the bootstrap transaction since the tenant_id doesn't exist when the request starts.
- Login uses `adminPrisma` for the cross-tenant user lookup, then `tenantScoped` for audit + tenant-scoped reads.
- `/me`, refresh, logout always use `tenantScoped(req.user.tenantId)`.

## Production build caveat

`pnpm build:api` compiles `src/` only. `@madar/db` exports raw `.ts` files (the package is `"type": "module"` with TS source). For production builds the db package will need a compiled distribution — flagged as a follow-up. Dev (`tsx watch`) and tests handle this transparently via on-the-fly transpilation.

## Tests

```bash
pnpm test:api         # full vitest suite — needs running postgres + redis
pnpm test:realm       # admin-realm JWT rejection canary
```
