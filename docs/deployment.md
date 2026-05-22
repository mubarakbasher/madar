# Production deployment

Step-by-step guide to deploy Madar from zero to a publicly-reachable shop
on a $5 VPS in about an hour. Targets a single owner-operated small business.

## Architecture

One VPS runs the whole stack via `docker compose`:

```
Internet → Caddy (443 / 80, auto-LE certs)
              ├─→ shop.example.com   → web (Next.js, :3000)
              ├─→ admin.example.com  → admin (Next.js, :3001)
              └─→ api.example.com    → api (NestJS, :4000)
                       │
                       ├─ postgres (named volume)
                       ├─ redis (in-memory; persistence optional)
                       └─ minio (named volume for receipts + logos)
```

Backups: a separate `backup` container runs `pg_dump` nightly to MinIO (or
real S3 if you point it there — see `docs/operations/backups.md`).

## What you need

- A VPS — Hetzner CX22 (€4/mo), DigitalOcean droplet, Linode, etc.
  - Minimum: 2 vCPU, 4 GB RAM, 40 GB disk.
  - Run **Ubuntu 22.04 or 24.04 LTS**.
- A domain you control, with DNS access (Cloudflare / Namecheap / Route 53 / etc.).
- About an hour.

## Step 1 — Provision the VPS

1. Create the server. SSH in as `root` (or your sudo user).
2. Lock it down:
   ```bash
   # Disable password login, keys only
   sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   sudo systemctl restart ssh

   # UFW — allow only SSH + HTTP + HTTPS
   sudo apt update && sudo apt install -y ufw
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw --force enable
   ```
3. Set the timezone (everything else uses UTC):
   ```bash
   sudo timedatectl set-timezone UTC
   ```

## Step 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER  # then log out + back in
docker --version  # should be 24.x or newer
docker compose version  # 2.x
```

## Step 3 — DNS

Point three A records at your VPS IP:

```
shop.example.com   → 1.2.3.4
admin.example.com  → 1.2.3.4
api.example.com    → 1.2.3.4
```

TTL 300s is fine. Caddy needs DNS to resolve before it can issue
Let's Encrypt certificates (HTTP-01 challenge).

## Step 4 — Clone the repo + configure env

```bash
cd /opt
sudo git clone https://github.com/your-org/madar.git
sudo chown -R $USER:$USER madar
cd madar

cp .env.production.example .env.production
# Open .env.production in your editor and fill EVERY value marked CHANGE_ME.
# At minimum:
#   - TENANT_HOST, ADMIN_HOST, API_HOST (must match DNS)
#   - CADDY_ACME_EMAIL (real email — Let's Encrypt expiration notices)
#   - POSTGRES_PASSWORD (long random)
#   - JWT_TENANT_SECRET + JWT_ADMIN_SECRET (different, long random)
#   - MINIO_ROOT_PASSWORD + S3_SECRET_KEY + BACKUP_S3_SECRET_KEY
#   - RESEND_API_KEY (sign up at resend.com first, free tier covers a café)
#   - NEXT_PUBLIC_API_URL = https://api.example.com (browser-visible)
nano .env.production
```

Use `openssl rand -base64 48` to generate each secret. Keep `.env.production`
out of git (the existing `.gitignore` already excludes it).

## Step 5 — Database migrations

The API container runs migrations on boot, but it's safer to apply them
explicitly first (so a failed migration doesn't crash the live API):

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.production up -d postgres

# Wait for healthy
docker compose ps postgres

# Apply migrations from a one-off container
docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  run --rm api pnpm db:migrate:deploy
```

## Step 6 — First deploy

```bash
docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  --profile backup \
  up -d --build
```

Watch the logs for the first 60 seconds:

```bash
docker compose logs --tail=50 -f caddy api
```

Caddy will request Let's Encrypt certificates the first time `shop.*`,
`admin.*`, and `api.*` are hit. You should see `certificate obtained
successfully` for each within a minute.

## Step 7 — Bootstrap the first tenant

Open `https://shop.example.com/en/signup` in your browser and create your
account. The signup flow:
- Creates a tenant (status=trialing for 14d).
- Creates the owner user.
- Sends a welcome + verify-email message via Resend.

After signup, switch to `psql` to lift the trial gate (you're self-hosting,
not on the SaaS billing path):

```bash
docker compose exec postgres psql -U madar madar -c \
  "UPDATE tenants SET status='active', trial_ends_at=NULL WHERE slug='your-slug';"
```

## Step 8 — Verify

A 5-minute smoke checklist before opening the shop:

- [ ] `https://shop.example.com` loads + browser shows a valid cert.
- [ ] Sign in as the owner you just created.
- [ ] `/settings/business` is reachable + populated; save a change and confirm it persists.
- [ ] `/settings/users` — invite a cashier with a real email; confirm they get the invite.
- [ ] `/inventory/products/new` — create one product. Ring a $1 cash sale via `/pos` → receipt prints with logo.
- [ ] `/sales` lists the sale; refund a line via the receipt's **Refund** button.
- [ ] `/shifts/[id]` Z-report variance matches expected.
- [ ] `/reconcile` shows the day's totals.
- [ ] `/settings/notifications` — toggle low_stock × email off, save, reload.
- [ ] Run a manual backup: `docker compose run --rm backup backup`. Confirm a `.pg.gz` lands in the MinIO `madar-backups` bucket.
- [ ] Trigger a low-stock cron manually as the platform admin: `curl -X POST https://api.example.com/v1/admin/cron/low-stock/run-now` (after admin login).

## Step 9 — Day-to-day operations

### Update to a new release

```bash
cd /opt/madar
git pull
docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  run --rm api pnpm db:migrate:deploy
docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  --profile backup \
  up -d --build
```

This is **not zero-downtime** — expect 10–30 seconds of 503 while the new
api/web/admin containers rebuild and start. For a single café this is
acceptable; a fancier rolling-deploy is a future slice.

### View logs

```bash
docker compose logs --tail=100 -f api
docker compose logs --tail=100 -f web
docker compose logs --tail=100 -f caddy
```

### Manual database backup

```bash
docker compose run --rm backup backup
```

### Restore a backup

See `docs/operations/backups.md`.

### Add a new branch / staff member / product

All in-app under `/branches/new`, `/settings/users`, `/inventory/products/new`.

## Common failures

### Caddy can't get a certificate

Look at `docker compose logs caddy`. If you see `no such host` → DNS isn't
pointed correctly. If you see `connection refused on :80` → another service
is bound to port 80 (`sudo lsof -i :80`). Most likely an OS-level web server.

### API can't connect to Postgres

If you see `ECONNREFUSED` in api logs, postgres probably failed health. Run
`docker compose logs postgres` and check for migration errors or volume
permission issues.

### Out of disk

MinIO bucket grows unbounded. Set lifecycle rules in MinIO to expire old
payment proofs (legal retention: typically 7 years in MENA — `docs/billing-flow.md`
spec). Or move BACKUP storage to off-host S3.

### Cash drawer / thermal printer not working

These are local-device concerns, not server. See
`docs/operations/hardware-setup.md`.

## What's deferred

- **Zero-downtime deploys** — needs blue/green or rolling restart. Not in scope yet.
- **CDN in front of Caddy** — Cloudflare proxy mode works; pin `S3_ACCESS_KEY` to a CIDR
  if you go that route to avoid the public bucket footgun.
- **Auto-rotation of JWT secrets** — manual rotation only today (edit env + restart).
- **Per-host firewall rules beyond ports 80/443/22** — fine for a single-shop install;
  multi-server setups need an internal-only API network.
- **Multi-region replicated Postgres** — single-region. For a café this is fine.
