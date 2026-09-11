# Claidor's cloud runner: the OpenClaw engine, built from its pinned tag with
# the desktop app's patches applied, plus the small service that feeds it one
# job at a time.
#
# This file is not built where it is deployed. Render's build machine does not
# finish the engine build — 152 workspace projects, and it hangs at `tsdown` —
# so GitHub Actions builds this image (`.github/workflows/runner_image.yml`),
# pushes it to GHCR, and the `claidor-maty-runner` service in `render.yaml`
# pulls it. Both paths run this one Dockerfile, so a developer's image and the
# deployed one are the same thing rather than two builds that agree by luck.
#
# Build context is the REPOSITORY ROOT, not `runner/`:
#
#   docker build -f runner/Dockerfile -t claidor-maty-runner .
#
# The engine the desktop ships is not the engine upstream publishes. The
# changes Maties makes to it live in `desktop/scripts/patches/<tag>/`, and the
# desktop applies them to the source before building — which is why the
# published npm package is not an option here, however tempting its 78 MB is.
# Those patches sit outside `runner/`, so the context is widened to reach
# them rather than a copy being kept under `runner/`: a copy would be a second
# source of truth, and it would go stale the first morning somebody adds a
# patch on the desktop side without thinking about the cloud. The root
# `.dockerignore` keeps the widened context to the few paths below.
#
# Every version here is pinned on purpose. Nothing floats, so the same
# Dockerfile builds the same image tomorrow.

# --- the engine ------------------------------------------------------------
# Built the way `desktop/scripts/build-openclaw-runtime.sh` builds it, minus
# the parts that exist only for Electron: the tarball is not repacked into
# gateway.asar, because plain Node loads openclaw.mjs directly. What the
# desktop does on top of this — the gateway bundle, plugins, extensions,
# precompilation, channel dependencies, pruning — is named and accounted for
# in `docs/maties/cloud.md`, section 4.
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

# The patches, and the desktop's own script that applies them. The script is
# borrowed rather than reimplemented: it decides the order, refuses a patch
# that no longer applies, and checks afterwards that the source really carries
# what each patch promised. A second implementation here would be a second set
# of bugs, and the two engines would drift the first time only one was fixed.
#
# These three paths are all this stage copies, so a change to the runner's own
# source leaves every layer below cached and the engine is not rebuilt.
COPY desktop/package.json /maties/package.json
COPY desktop/scripts/apply-openclaw-patches.cjs /maties/scripts/apply-openclaw-patches.cjs
COPY desktop/scripts/patches /maties/scripts/patches

# The script picks the patch directory from the desktop's pinned version; the
# clone above came from the ARG. If those two ever disagree the patches for
# some other tag would be thrown at this source, so say so here rather than
# let `git apply` explain it. `src/engineVersion.test.ts` catches the same
# disagreement before anybody builds.
RUN test "$(node -p "require('/maties/package.json').openclaw.version")" = "${OPENCLAW_VERSION}" \
  || { echo "desktop/package.json pins a different openclaw version than ARG OPENCLAW_VERSION=${OPENCLAW_VERSION}" >&2; exit 1; } \
  && node /maties/scripts/apply-openclaw-patches.cjs /src/openclaw

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
COPY runner/package.json runner/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY runner/tsconfig.json ./
COPY runner/src ./src
RUN npm run build

# --- the image that runs ---------------------------------------------------
FROM node:24.15.0-bookworm-slim

ENV NODE_ENV=production \
    CLAIDOR_MATY_ENGINE_ROOT=/engine \
    CLAIDOR_MATY_WORK_ROOT=/var/lib/maty-jobs

COPY --from=engine /engine /engine
COPY --from=build /build/dist /app/dist
COPY runner/package.json /app/package.json

# The runner never installs anything at run time and never writes outside
# the job directories, so it does not run as root.
RUN mkdir -p /var/lib/maty-jobs && chown -R node:node /var/lib/maty-jobs /app
USER node

WORKDIR /app
CMD ["node", "dist/index.js"]
