#!/bin/bash
# Container entrypoint. Renders the cron schedule into a file and hands off
# to supercronic. Lets `docker compose run --rm backup backup` invoke the
# backup script directly for manual runs.
set -euo pipefail

# Manual invocation paths: `backup` and `restore <key>` run the scripts
# inline and exit, instead of starting the cron loop.
case "${1:-}" in
  backup)
    exec /usr/local/bin/backup
    ;;
  restore)
    shift
    exec /usr/local/bin/restore "$@"
    ;;
esac

# Default — start the cron loop.
CRON_FILE="$(mktemp)"
trap 'rm -f "$CRON_FILE"' EXIT

echo "${BACKUP_CRON:-0 2 * * *} /usr/local/bin/backup" > "$CRON_FILE"
echo "[entrypoint] cron schedule: ${BACKUP_CRON:-0 2 * * *}"

exec supercronic -passthrough-logs "$CRON_FILE"
