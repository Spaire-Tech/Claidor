# The brain (5 November 2026, docs/agents-on-the-server/README.md, step 1d):
# the agents' engine off the cloud computer, as a Render private service.
#
# Build context is the REPOSITORY ROOT:
#
#   docker build -f brain/Dockerfile -t simeon-brain .
#
# What is in it, and why:
#   - Debian trixie and Node 22, the same as the computer's image
#     (box/Dockerfile): the engine's bundle is built for node22, and the
#     tree-sitter add-ons it loads do not compile against Node 24.
#   - the tree-sitter add-ons, from the same lockfile as the computer's
#     (box/deps), under /home/box/deps with NODE_PATH, as the engine expects.
#   - the start script (brain/start-brain.mjs). The engine itself is not in
#     the image: the start script downloads the one the computers run (the
#     host bundle), so a published engine reaches the brain at its next
#     restart, as it reaches each computer.
#   - no desktop, no Chrome, no VNC: those are the computer's.
#
# The agents' data lives on a Render disk mounted at /home/box/sand-data:
# the backup's paths are written from the root (`home/box/sand-data/...`),
# so that is where they must land.

FROM debian:trixie-slim

ARG NODE_VERSION=22.23.3

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl xz-utils tar gzip tini \
      python3 build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/node-shasums.txt \
    && cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz\$" node-shasums.txt | sed 's#  .*#  node.tar.xz#' | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
    && rm -f /tmp/node.tar.xz /tmp/node-shasums.txt \
    && node --version && npm --version

RUN useradd --create-home --home-dir /home/box --shell /bin/bash box \
    && mkdir -p /home/box/sand-data /home/box/sand-host /home/box/deps /opt/simeon-brain

# The tree-sitter add-ons, side by side under /home/box/deps (box/Dockerfile
# says why not under node_modules).
ENV SAND_TREE_SITTER_NODE_DEPS=/home/box/deps \
    NODE_PATH=/home/box/deps
COPY box/deps/package.json box/deps/package-lock.json /tmp/deps/
RUN cd /tmp/deps && npm ci --no-audit --no-fund --build-from-source \
    && cp -R /tmp/deps/node_modules/. /home/box/deps/ \
    && node -e 'const P = require("/home/box/deps/tree-sitter"), B = require("/home/box/deps/tree-sitter-bash"); const p = new P(); p.setLanguage(B); if (p.parse("echo hi").rootNode.type !== "program") process.exit(1)' \
    && node -e 'const { Piscina } = require("piscina"); if (typeof Piscina !== "function") process.exit(1)' \
    && cd / && npm cache clean --force && rm -rf /tmp/deps

COPY brain/start-brain.mjs /opt/simeon-brain/start-brain.mjs
RUN node --check /opt/simeon-brain/start-brain.mjs \
    && chown -R box:box /home/box

WORKDIR /home/box
ENV HOME=/home/box \
    SAND_DATA_ROOT=/home/box/sand-data \
    PORT=10000
EXPOSE 10000

# Started as root only to hand the disk to `box` (a Render disk is mounted
# over /home/box/sand-data after the image is made, owned by root), then
# run as `box`, as the engine runs on the computer.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "chown box:box /home/box/sand-data /home/box/sand-host && exec setpriv --reuid=box --regid=box --init-groups node /opt/simeon-brain/start-brain.mjs"]
