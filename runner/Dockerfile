# Simeon's cloud runner: the small service that takes one Maty job at a
# time, lays the person's memory out, asks the model through Claidor's
# metered proxy on the person's own job token, and reports the answer back.
#
# Until 25 September 2026 this image also built the OpenClaw engine from
# source with the desktop's patches, and Render's build machine could not
# finish that build, so GitHub Actions built the image and pushed it to
# GHCR. The engine is gone from the runner (`src/engine.ts`: the product's
# agent loop no longer runs on it, and the patches it needed left the tree
# with the 18 September re-founding), so this is a plain Node image that
# builds in under a minute anywhere, Render included (`render.yaml`).
#
# Build context is the REPOSITORY ROOT (`.github/workflows/runner_image.yml`
# and render.yaml both pass it):
#
#   docker build -f runner/Dockerfile -t claidor-maty-runner .

FROM node:24.15.0-bookworm-slim AS build

WORKDIR /build
COPY runner/package.json runner/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY runner/tsconfig.json ./
COPY runner/src ./src
RUN npm run build

FROM node:24.15.0-bookworm-slim

ENV NODE_ENV=production \
    CLAIDOR_MATY_WORK_ROOT=/var/lib/maty-jobs

COPY --from=build /build/dist /app/dist
COPY runner/package.json /app/package.json

# The runner never installs anything at run time and never writes outside
# the job directories, so it does not run as root.
RUN mkdir -p /var/lib/maty-jobs && chown -R node:node /var/lib/maty-jobs /app
USER node

WORKDIR /app
CMD ["node", "dist/index.js"]
