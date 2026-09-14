#!/usr/bin/env bash
# MinIO setup for the Server test job.
#
# This file is new. `server/.minio/` has been in .gitignore since bc318a15
# (29 August), so every consumer of it — this workflow,
# copilot-setup-steps.yml, docker-compose.yml and dev/docker — pointed at a
# directory that is never checked out. The test job died here, before
# running a single test:
#
#   An error occurred trying to start process '/usr/bin/bash' with working
#   directory '.../server/.minio'. No such file or directory
#
# What the tests need comes from `.env.testing`, which `CLAIDOR_ENV=testing`
# makes the app read — not from upstream Polar's names. Values are passed in
# as environment so nothing is hardcoded here.
#
# `mc` comes from a container, not from a download. dl.min.io now answers
# 410 Gone ("The open-source MinIO Server, MinIO Client (mc) and MinIO KES
# projects are archived and no longer maintained"), so the usual
# `curl https://dl.min.io/client/mc/release/linux-amd64/mc` writes an error
# page, chmods it, and fails on the next line. The image below is the same
# one `server/docker-compose.yml` already uses, and the job's own MinIO
# service is its sibling `bitnamilegacy/minio`, so this adds no dependency
# that the workflow was not already pulling.
set -euo pipefail

: "${MINIO_HOST:?MINIO_HOST is required}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${ACCESS_KEY:?ACCESS_KEY is required}"
: "${SECRET_ACCESS_KEY:?SECRET_ACCESS_KEY is required}"
: "${BUCKET_NAME:?BUCKET_NAME is required}"
: "${PUBLIC_BUCKET_NAME:?PUBLIC_BUCKET_NAME is required}"
: "${BUCKET_TESTING_NAME:?BUCKET_TESTING_NAME is required}"

MC_IMAGE=${MC_IMAGE:-bitnamilegacy/minio-client:2024.5.24}

# A real `mc` on PATH wins, so a developer who has one is not made to pull
# an image. Otherwise run the client in a container on the host network, so
# MINIO_HOST=127.0.0.1 means the same thing inside it as outside.
if command -v mc >/dev/null 2>&1; then
  mc() { command mc "$@"; }
else
  mc() {
    docker run --rm --network host \
      -e MC_HOST_local="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@${MINIO_HOST}:9000" \
      "$MC_IMAGE" mc "$@"
  }
  # MC_HOST_local above is the alias, so `mc alias set` is not needed.
  alias_preconfigured=1
fi

if [ -z "${alias_preconfigured:-}" ]; then
  mc alias set local "http://${MINIO_HOST}:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
fi

for bucket in "$BUCKET_NAME" "$PUBLIC_BUCKET_NAME" "$BUCKET_TESTING_NAME"; do
  mc mb --ignore-existing "local/${bucket}"
done

# Idempotent: a re-run must not fail because the user already exists.
mc admin user add local "$ACCESS_KEY" "$SECRET_ACCESS_KEY" || true
mc admin policy attach local readwrite --user "$ACCESS_KEY" || true

# The public bucket is served anonymously; the API stores files there and
# expects them readable without credentials.
mc anonymous set download "local/${PUBLIC_BUCKET_NAME}"

echo "MinIO ready: ${BUCKET_NAME}, ${PUBLIC_BUCKET_NAME}, ${BUCKET_TESTING_NAME}"
