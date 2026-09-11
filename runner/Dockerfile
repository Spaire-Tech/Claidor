# Claidor's cloud runner: the OpenClaw engine, built from its pinned tag,
# with the small service that feeds it one job at a time.
#
# Build context is `runner/`. Nothing outside it is needed: the engine comes
# from its own repository at the tag pinned below, which must stay equal to
# `openclaw.version` in `desktop/package.json` — `src/engineVersion.test.ts`
# fails if the three ever disagree.
#
# Every version here is pinned on purpose. Nothing floats, so the same
# Dockerfile builds the same image tomorrow.

# --- the engine ------------------------------------------------------------
# Built the way `desktop/scripts/build-openclaw-runtime.sh` builds it, minus
# the parts that exist only for Electron: the tarball is not repacked into
# gateway.asar, because plain Node loads openclaw.mjs directly.
FROM node:24.15.0-bookworm-slim AS engine

ARG OPENCLAW_VERSION=v2026.6.1
ARG OPENCLAW_REPO=https://github.com/openclaw/openclaw.git

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# pnpm comes from the version openclaw's own package.json names, through
# corepack, so the lockfile is honoured exactly.
RUN corepack enable

WORKDIR /src
RUN git clone --depth 1 --branch "${OPENCLAW_VERSION}" "${OPENCLAW_REPO}" openclaw

WORKDIR /src/openclaw
RUN pnpm install --frozen-lockfile \
  && pnpm build \
  && node --import tsx --input-type=module -e "const { writePackageDistInventory } = await import('./src/infra/package-dist-inventory.ts'); await writePackageDistInventory(process.cwd());"

# Pack the npm tarball and unpack it as the runtime: that is what decides
# which files the engine ships, rather than us guessing.
RUN npm pack --ignore-scripts --pack-destination /pack \
  && mkdir -p /unpack \
  && tar -xzf /pack/openclaw-*.tgz -C /unpack \
  && mkdir -p /engine \
  && cp -a /unpack/package/. /engine/

WORKDIR /engine
RUN npm pkg delete devDependencies \
  && NPM_CONFIG_LEGACY_PEER_DEPS=true npm install --omit=dev --no-audit --no-fund \
  # The runtime ships its own handbook. It is the largest thing in the image
  # that no running gateway reads.
  && rm -rf /engine/docs \
  && npm cache clean --force \
  && test -f /engine/openclaw.mjs \
  && test -f /engine/dist/control-ui/index.html

# --- the runner ------------------------------------------------------------
FROM node:24.15.0-bookworm-slim AS build

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- the image that runs ---------------------------------------------------
FROM node:24.15.0-bookworm-slim

ENV NODE_ENV=production \
    CLAIDOR_MATY_ENGINE_ROOT=/engine \
    CLAIDOR_MATY_WORK_ROOT=/var/lib/maty-jobs

COPY --from=engine /engine /engine
COPY --from=build /build/dist /app/dist
COPY package.json /app/package.json

# The runner never installs anything at run time and never writes outside
# the job directories, so it does not run as root.
RUN mkdir -p /var/lib/maty-jobs && chown -R node:node /var/lib/maty-jobs /app
USER node

WORKDIR /app
CMD ["node", "dist/index.js"]
