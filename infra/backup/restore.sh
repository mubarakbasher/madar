#!/bin/bash
# Restore a Madar Postgres dump from S3/MinIO.
#
# Usage:
#   restore <object-key>      e.g. restore madar-20260527T020001Z.pg.gz
#   restore latest            picks the most recent dump in the bucket
#
# NEVER scheduled — manual run only. Assumes you've already prepared the
# target DB (empty database, or one you're OK clobbering — pg_restore is
# invoked with --clean --if-exists).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is required}"
: "${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is required}"

S3_ENDPOINT_FLAG=""
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  S3_ENDPOINT_FLAG="--endpoint-url=${BACKUP_S3_ENDPOINT}"
fi
export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-us-east-1}"

PREFIX="${BACKUP_PREFIX:-madar}"
KEY="${1:-latest}"

if [[ "$KEY" == "latest" ]]; then
  KEY="$(aws ${S3_ENDPOINT_FLAG} s3 ls "s3://${BACKUP_S3_BUCKET}/${PREFIX}-" \
         | awk '{print $4}' | sort | tail -n 1)"
  if [[ -z "$KEY" ]]; then
    echo "[restore] no dumps found in s3://${BACKUP_S3_BUCKET}/${PREFIX}-*"
    exit 1
  fi
  echo "[restore] resolved 'latest' → ${KEY}"
fi

TMP="$(mktemp -d)"
LOCAL="${TMP}/${KEY}"
trap 'rm -rf "$TMP"' EXIT

echo "[restore] downloading s3://${BACKUP_S3_BUCKET}/${KEY}"
aws ${S3_ENDPOINT_FLAG} s3 cp "s3://${BACKUP_S3_BUCKET}/${KEY}" "$LOCAL" --no-progress

echo "[restore] pg_restore → \$DATABASE_URL (with --clean --if-exists)"
gunzip -c "$LOCAL" \
  | pg_restore --clean --if-exists --no-owner --no-acl \
               --dbname="$DATABASE_URL"

echo "[restore] done"
