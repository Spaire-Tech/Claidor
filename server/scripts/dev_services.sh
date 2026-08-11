#!/usr/bin/env bash
# Postgres, Redis and Minio, started and left running.
#
# Development only. The container this is written in reclaims background
# processes between sessions, so all three are usually dead and the first
# symptom is a test suite failing with « connection refused » in a module
# that has nothing to do with any of them. One command rather than the
# nine in the worklog.
set -u

MINIO_BIN=${MINIO_BIN:-/tmp/minio}
MINIO_DATA=${MINIO_DATA:-/tmp/miniodata}
ROOT_USER=${CLAIDOR_MINIO_USER:-claidor}
ROOT_PASSWORD=${CLAIDOR_MINIO_PWD:-claidorclaidor}
ACCESS_KEY=${CLAIDOR_AWS_ACCESS_KEY_ID:-claidor-development}
SECRET_KEY=${CLAIDOR_AWS_SECRET_ACCESS_KEY:-claidor123456789}

pg_isready -q || pg_ctlcluster 16 main start
redis-cli ping >/dev/null 2>&1 || redis-server --daemonize yes

if ! curl -s -o /dev/null http://127.0.0.1:9000/minio/health/live; then
  [ -x "$MINIO_BIN" ] || curl -sSL -o "$MINIO_BIN" \
    https://dl.min.io/server/minio/release/linux-amd64/minio && chmod +x "$MINIO_BIN"
  mkdir -p "$MINIO_DATA"
  MINIO_ROOT_USER="$ROOT_USER" MINIO_ROOT_PASSWORD="$ROOT_PASSWORD" \
    setsid nohup "$MINIO_BIN" server "$MINIO_DATA" \
    --address :9000 --console-address :9001 >/tmp/minio.log 2>&1 </dev/null &
  until curl -s -o /dev/null http://127.0.0.1:9000/minio/health/live; do sleep 2; done
fi

# The buckets and the app user the tests and the API expect. `.minio/` in
# docker-compose is not in the repository, so this does the same by hand.
if command -v mc >/dev/null; then
  mc alias set local http://127.0.0.1:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
  for bucket in claidor-s3 claidor-s3-public testing-claidor-s3; do
    mc mb --ignore-existing "local/$bucket" >/dev/null
  done
  mc admin user add local "$ACCESS_KEY" "$SECRET_KEY" >/dev/null 2>&1
  mc admin policy attach local readwrite --user "$ACCESS_KEY" >/dev/null 2>&1
  mc anonymous set download local/claidor-s3-public >/dev/null 2>&1
fi

pg_isready && redis-cli ping && curl -s -o /dev/null -w "minio %{http_code}\n" \
  http://127.0.0.1:9000/minio/health/live
