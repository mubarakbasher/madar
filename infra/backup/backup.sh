#!/bin/bash
# Snapshot the Madar Postgres DB to S3/MinIO and rotate old snapshots.
# Reads connection details + bucket creds from env. Invoked by supercronic
# on the schedule defined in $BACKUP_CRON.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (postgres://user:pass@host:port/db)}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is required}"
: "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is required}"

# Endpoint URL is optional (omit for real AWS, set for MinIO/Backblaze/etc).
S3_ENDPOINT_FLAG=""
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  S3_ENDPOINT_FLAG="--endpoint-url=${BACKUP_S3_ENDPOINT}"
fi

RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
PREFIX="${BACKUP_PREFIX:-madar}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="${PREFIX}-${TS}.pg.gz"
TMP="$(mktemp -d)"
LOCAL="${TMP}/${KEY}"

trap 'rm -rf "$TMP"' EXIT

echo "[backup] $(date -u +%FT%TZ) starting → s3://${BACKUP_S3_BUCKET}/${KEY}"

# --format=custom keeps the dump compact, restore-friendly, and we still gzip
# on top because pg_dump's custom format is only modestly compressed by default.
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" \
  | gzip -9 \
  > "$LOCAL"

SIZE="$(du -h "$LOCAL" | awk '{print $1}')"
echo "[backup] dump complete: ${SIZE}"

export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

# MinIO does not auto-create buckets — a fresh deploy would otherwise fail
# every nightly run with NoSuchBucket. Idempotent: head, then create.
if ! aws ${S3_ENDPOINT_FLAG} s3api head-bucket --bucket "$BACKUP_S3_BUCKET" 2>/dev/null; then
  echo "[backup] bucket ${BACKUP_S3_BUCKET} missing — creating"
  aws ${S3_ENDPOINT_FLAG} s3 mb "s3://${BACKUP_S3_BUCKET}"
fi

# Use multipart upload via `cp` (handles streaming + retries).
aws ${S3_ENDPOINT_FLAG} s3 cp "$LOCAL" "s3://${BACKUP_S3_BUCKET}/${KEY}" \
  --no-progress \
  --storage-class STANDARD

echo "[backup] uploaded ${KEY}"

# Rotation — delete dumps older than RETAIN_DAYS. Reads the full listing
# (cheap for a small shop's nightly cadence; if the bucket grows beyond 1000
# objects, switch to ListObjectsV2 paging).
CUTOFF_SECONDS=$(( $(date -u +%s) - RETAIN_DAYS * 86400 ))
deleted=0
while IFS= read -r line; do
  # `aws s3 ls` lines look like "2026-05-26 02:00:01    123456 madar-2026...pg.gz"
  date_str="$(echo "$line" | awk '{print $1, $2}')"
  fname="$(echo "$line" | awk '{print $4}')"
  [[ -z "$fname" ]] && continue
  [[ "$fname" != "${PREFIX}-"* ]] && continue
  obj_seconds=$(date -u -d "$date_str" +%s 2>/dev/null || echo "")
  [[ -z "$obj_seconds" ]] && continue
  if (( obj_seconds < CUTOFF_SECONDS )); then
    aws ${S3_ENDPOINT_FLAG} s3 rm "s3://${BACKUP_S3_BUCKET}/${fname}" --no-progress >/dev/null
    deleted=$((deleted + 1))
  fi
done < <(aws ${S3_ENDPOINT_FLAG} s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}-" 2>/dev/null || true)

echo "[backup] rotation: deleted ${deleted} dump(s) older than ${RETAIN_DAYS} days"
echo "[backup] done"
