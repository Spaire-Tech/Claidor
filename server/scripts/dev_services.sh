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
  # dl.min.io now answers 410 Gone — "The open-source MinIO Server, MinIO
  # Client (mc) and MinIO KES projects are archived and no longer
  # maintained" — so this download silently writes an error page and the
  # server then fails to start. Say so instead of pretending.
  if [ ! -x "$MINIO_BIN" ]; then
    echo "MinIO is not running and $MINIO_BIN is absent." >&2
    echo "dl.min.io is archived (410 Gone), so it cannot be fetched here." >&2
    echo "Start it with docker instead: (cd server && docker compose up -d minio)" >&2
    exit 1
  fi
  mkdir -p "$MINIO_DATA"
  MINIO_ROOT_USER="$ROOT_USER" MINIO_ROOT_PASSWORD="$ROOT_PASSWORD" \
    setsid nohup "$MINIO_BIN" server "$MINIO_DATA" \
    --address :9000 --console-address :9001 >/tmp/minio.log 2>&1 </dev/null &
  until curl -s -o /dev/null http://127.0.0.1:9000/minio/health/live; do sleep 2; done
fi

# The buckets and the app user the tests and the API expect. Without them
# the app user is never created after Minio's data dir is reclaimed, and
# the API then stores nothing while logging keep_failed — every upload
# succeeds on screen and holds no bytes, which is the quiet kind of broken.
#
# `server/.minio/` IS in the repository now; this no longer duplicates it
# because the two run in different places — that one is for CI, this is for
# a developer's machine.
MC=${MC_BIN:-/tmp/mc}
command -v mc >/dev/null && MC=$(command -v mc)
if [ ! -x "$MC" ]; then
  # Same 410 as the server binary above. `.minio/github.sh` runs the client
  # from the bitnamilegacy image for this reason; do the same here.
  MC=""
  if command -v docker >/dev/null 2>&1; then
    MC=docker-mc
  else
    echo "mc is absent and dl.min.io is archived (410 Gone); skipping bucket setup." >&2
    echo "Buckets and the app user will not be created." >&2
  fi
fi
docker_mc() {
  docker run --rm --network host \
    -e MC_HOST_local="http://${ROOT_USER}:${ROOT_PASSWORD}@127.0.0.1:9000" \
    bitnamilegacy/minio-client:2024.5.24 mc "$@"
}
if [ "$MC" = "docker-mc" ]; then
  mc_run() { docker_mc "$@"; }
elif [ -n "$MC" ] && [ -x "$MC" ]; then
  mc_run() { "$MC" "$@"; }
  mc_run alias set local http://127.0.0.1:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
else
  mc_run() { :; }
fi
for bucket in claidor-s3 claidor-s3-public testing-claidor-s3; do
  mc_run mb --ignore-existing "local/$bucket" >/dev/null
done
mc_run admin user add local "$ACCESS_KEY" "$SECRET_KEY" >/dev/null 2>&1
mc_run admin policy attach local readwrite --user "$ACCESS_KEY" >/dev/null 2>&1
mc_run anonymous set download local/claidor-s3-public >/dev/null 2>&1

pg_isready && redis-cli ping && curl -s -o /dev/null -w "minio %{http_code}\n" \
  http://127.0.0.1:9000/minio/health/live
