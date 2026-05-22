# Database backups

Daily Postgres dumps to S3-compatible object storage with 30-day rotation.

The Madar database lives in the `madar_pgdata` Docker volume. **Without backups, one bad `docker volume rm` is total data loss.** This runbook covers the automated nightly backup + the manual restore.

## How it works

A small Alpine container (`infra/backup/Dockerfile`) runs `supercronic` (cron-for-containers) on a schedule defined in `BACKUP_CRON` (default `0 2 * * *` UTC, i.e. 2am every night).

Each tick:

1. `pg_dump --format=custom` against `DATABASE_URL` (the in-network Postgres).
2. `gzip -9` on top of the dump (custom format is already compressed but gzip adds ~30% extra reduction).
3. `aws s3 cp` upload to `s3://${BACKUP_S3_BUCKET}/madar-${timestamp}.pg.gz`.
4. Rotation: list `madar-*.pg.gz` in the bucket, delete anything older than `BACKUP_RETAIN_DAYS` (default 30).

For local dev, the storage target is the same MinIO that powers product images. For production, point `BACKUP_S3_ENDPOINT`/`BUCKET`/`ACCESS_KEY`/`SECRET_KEY` at real S3 (or Backblaze B2 — they're S3-compatible and cheap).

## Enable the nightly job (local dev)

The backup service is profile-gated to keep it out of the default dev stack:

```bash
# One-time: create the destination bucket in MinIO if it doesn't exist
docker compose exec minio sh -c \
  "mc alias set local http://localhost:9000 madar madar-dev-only && \
   mc mb -p local/madar-backups"

# Bring the backup container up
docker compose --profile backup up -d backup

# Confirm it's running
docker compose logs --tail=20 backup
# Should show: "[entrypoint] cron schedule: 0 2 * * *"
```

## Manual one-off backup

```bash
docker compose run --rm backup backup
```

You should see `[backup] uploaded madar-YYYYMMDDTHHMMSSZ.pg.gz` and `[backup] rotation: deleted N dump(s) older than 30 days`. Verify in the MinIO console (`http://localhost:9001`) → `madar-backups` bucket.

## Restore

**Manual only — never schedule.** Default is to clobber the current database (`pg_restore --clean --if-exists`).

```bash
# Restore the most recent dump
docker compose run --rm backup restore latest

# Restore a specific key
docker compose run --rm backup restore madar-20260527T020001Z.pg.gz
```

## Disaster-recovery test (recommended, monthly)

1. Take a manual backup so you have a known-good dump.
2. Burn it all down:
   ```bash
   docker compose down
   docker volume rm madar_pgdata
   docker compose up -d postgres
   pnpm db:migrate
   ```
3. Restore:
   ```bash
   docker compose run --rm backup restore latest
   ```
4. Confirm the demo tenant is back: log in to `/en/login` with `owner@acme.test / Demo123!`.

If step 4 fails, the backup didn't include something it should have. Investigate `pg_dump` output, check for triggers/sequences not being restored, and fix before relying on backups in production.

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://madar:madar@postgres:5432/madar` | Use the `madar` superuser to bypass RLS — backups need full read |
| `BACKUP_S3_ENDPOINT` | `http://minio:9000` | Omit for real AWS S3 |
| `BACKUP_S3_BUCKET` | `madar-backups` | Must exist before the first run |
| `BACKUP_S3_ACCESS_KEY` | `madar` | |
| `BACKUP_S3_SECRET_KEY` | `madar-dev-only` | Rotate in production |
| `BACKUP_S3_REGION` | `us-east-1` | AWS region; MinIO ignores |
| `BACKUP_CRON` | `0 2 * * *` | Standard crontab format, UTC |
| `BACKUP_RETAIN_DAYS` | `30` | Anything older is deleted on each successful run |
| `BACKUP_PREFIX` | `madar` | Filename prefix; useful for sharing a bucket |

## Production hardening checklist

When moving from MinIO-on-the-same-box to real off-site backups:

- [ ] Point `BACKUP_S3_ENDPOINT` at real AWS S3, Backblaze B2, Cloudflare R2, or DigitalOcean Spaces — not MinIO on the same host.
- [ ] Use a dedicated IAM user with `s3:PutObject`, `s3:ListBucket`, `s3:DeleteObject` only on this bucket.
- [ ] Enable bucket versioning + lifecycle rules (Glacier transition after 90d) for cheap long-term retention.
- [ ] Bump `BACKUP_RETAIN_DAYS` to 90 or 365 depending on your tax/audit needs.
- [ ] Set up an alert if the cron skips a tick (the simplest path is a Healthchecks.io ping in the backup script — wire it into a future iteration of `backup.sh`).
- [ ] Encrypt at rest (S3 server-side encryption is on by default; with B2/R2 explicitly enable encryption).
- [ ] Test the restore end-to-end on a staging environment, not production.

## What's deferred

- **Point-in-time recovery (PITR)** via WAL archiving — daily dumps give RPO ≤ 24h, which is fine for a small shop. PITR drops RPO to seconds but adds complexity. Pick it up when shop value > $10K/day.
- **Cross-region replication** — single-region is fine until your shop has revenue in multiple countries.
- **Per-tenant backups** — Madar is multi-tenant in one DB; the dump captures all tenants in one file. Per-tenant `pg_dump --schema` filters are possible but rarely needed.
