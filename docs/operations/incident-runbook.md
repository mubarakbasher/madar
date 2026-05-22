# Incident runbook

Quick fixes for the most common failure modes once Madar is live. Treat this
as a checklist — don't skip steps even if you "know" the problem.

## Symptoms and fixes

### Site is completely down

1. **VPS reachable?** `ping shop.example.com` from your laptop.
   - No → VPS is off or DNS broke. Check provider dashboard + DNS.
2. **Containers up?** SSH in → `docker compose ps`.
   - Anything in `Restarting` loop → check that service's logs:
     `docker compose logs --tail=100 <service>`.
3. **Caddy logs**: `docker compose logs caddy | tail -50`.
   - `tls: certificate has expired` → Caddy auto-renews; check it can reach
     Let's Encrypt: `docker compose exec caddy wget -qO- https://acme-v02.api.letsencrypt.org`.
4. **Postgres healthy?** `docker compose logs postgres | tail -50`.
   - `could not extend file ... No space left on device` → fix disk first
     (see *Disk full* below).

### Disk full

```bash
df -h          # which mount is full?
docker system df  # how much space does Docker use?
```

Common culprits:
- `madar_minio` volume — uncapped uploads. Add lifecycle rules in MinIO
  console (`https://admin.example.com:9001`) to expire old payment proofs.
- Container logs — `docker compose logs --no-color api > /dev/null` to
  rotate (Docker keeps unbounded JSON logs by default; consider
  `--log-opt max-size=50m --log-opt max-file=3` in the compose).
- `madar_backup` related — backup tmp files. Should auto-clean per
  `infra/backup/backup.sh`.

Reclaim space if needed:
```bash
docker image prune -af   # safe
docker volume prune      # NEVER blindly — re-read the prompt; data lives here
```

### API returning 500s

1. `docker compose logs --tail=200 api` — look for stack traces.
2. Common causes:
   - **DB connection lost** — postgres crashed or restarted; restart api: `docker compose restart api`.
   - **Migration mismatch** — newer code expects a column that didn't apply.
     Re-run `docker compose run --rm api pnpm db:migrate:deploy`.
   - **Redis OOM** — large idempotency cache; bump Redis memory or set `maxmemory`.

### API 423 `tenant_suspended` everywhere

That's the suspension banner gate (Slice A3). You're past trial without an
active subscription. Either:
- Pay the latest invoice via `/billing` if you're using the SaaS billing flow.
- Or for self-hosted: `psql ... UPDATE tenants SET status='active' WHERE id=...`
  (admin app's billing tracker won't override an explicit set).

### Cash drawer doesn't pop

This is a local-device concern, not server. See `docs/operations/hardware-setup.md`.

If the **Open drawer** button on the receipt page is missing entirely:
- Chrome/Edge only (Firefox doesn't ship WebUSB).
- HTTPS required — confirm you're on `https://shop.example.com`, not http.
- First click triggers a permission dialog. If the user dismissed it, they
  need to clear the WebUSB permission in browser settings.

### Receipts don't include the logo

1. `/settings/business` → confirm a logo is uploaded (preview shows it).
2. Open `https://api.example.com/v1/public/tenants/<tenant-id>/logo` directly
   in a browser. If you see a 404, the upload didn't persist — check S3:
   `docker compose exec minio mc ls local/madar-receipts/tenants/<id>/branding/`.
3. If S3 has the file but the receipt is blank, hard-reload the receipt page
   (`Ctrl+Shift+R`) — the image is `public, max-age=600`.

### Login emails not arriving

- `docker compose logs api | grep email` — see if EmailService logged a send.
- Check Resend dashboard (`resend.com/emails`) for delivery status.
- If `EMAIL_PROVIDER=disk` (default test), emails write to `var/sent-emails/`
  on the API container — never sent. Set `EMAIL_PROVIDER=resend` + restart.

### One staff member can't log in

1. **Forgot password?** Owner can trigger a reset from `/settings/users` → row → "Reset password" (Slice 1).
2. **Email not verified?** Resend verification from `/settings/profile` (their own session) or via psql:
   `UPDATE users SET email_verified=true WHERE email='cashier@…';`
3. **Account locked / MFA broken?** Owner has no UI to reset another user's
   MFA today (deferred). Workaround:
   `UPDATE users SET mfa_enabled=false, mfa_secret=NULL, mfa_recovery_codes_hash='{}' WHERE id='…';`

### Backup didn't run last night

```bash
docker compose logs backup | tail -50
```

Common causes:
- Bucket doesn't exist → create it: `docker compose exec minio mc mb local/madar-backups`.
- S3 credentials wrong → re-check `.env.production` BACKUP_S3_* values.
- supercronic schedule wrong → confirm `BACKUP_CRON` is valid cron syntax.
- Manual test: `docker compose run --rm backup backup` should succeed
  end-to-end. If it does, the cron schedule is the issue.

### Need to restore from yesterday's backup

See `docs/operations/backups.md` — the Restore section.

**Whatever you do, take a fresh dump first** (`docker compose run --rm backup backup`)
before running the restore, in case the "broken" state has data you'd lose.

## What's NOT in this runbook

- E-invoicing failures (deferred — not built).
- Multi-region failover (out of scope).
- Postgres point-in-time recovery (out of scope — daily dumps only).
- CDN tuning (Cloudflare in front of Caddy works; no specific config
  documented yet).
