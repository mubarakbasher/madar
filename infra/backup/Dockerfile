# Postgres backup container. Pairs pg_dump with the S3 (or MinIO) CLI and
# runs the backup on a cron. Image is intentionally tiny — Alpine + the
# Postgres 16 client + aws-cli v2 + supercronic. No app code.
FROM alpine:3.20

# Pin client to match the running server major version (Postgres 16).
RUN apk add --no-cache \
      bash \
      coreutils \
      gzip \
      postgresql16-client \
      aws-cli \
      ca-certificates \
      tzdata

# supercronic — a cron daemon designed for containers (logs to stdout, runs
# in PID 1, respects SIGTERM). Version pinned to a known-good release.
ARG SUPERCRONIC_VERSION=v0.2.29
ARG SUPERCRONIC_SHA256=cd48d45c4b10f3f0bfdd3a57d054cd05ac96812b
RUN wget -q -O /usr/local/bin/supercronic \
      "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64" \
    && chmod +x /usr/local/bin/supercronic

COPY backup.sh /usr/local/bin/backup
COPY restore.sh /usr/local/bin/restore
COPY entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/backup /usr/local/bin/restore /usr/local/bin/entrypoint

# Cron schedule is rendered into a file at entrypoint time from $BACKUP_CRON.
ENV BACKUP_CRON="0 2 * * *" \
    BACKUP_RETAIN_DAYS=30

ENTRYPOINT ["/usr/local/bin/entrypoint"]
