# Simeon's cloud computer (Track D, piece 3, 5 October 2026).
#
# The image every agent's desktop runs in: an X display with a window
# manager, Chrome, a VNC stream the app shows, and the two programs the host
# bundle brings when the container is made (the server and the Mac mount
# them read-only; `docs/services-core.md`, "The cloud computer"):
#
#   /home/box/sand-host/host-main.cjs     the host (the agents)
#   /home/box/box-exec-daemon/main.cjs    the exec daemon (shell, files,
#                                         screenshots and clicks)
#
# Build context is the REPOSITORY ROOT:
#
#   docker build -f box/Dockerfile -t simeon-box .
#
# What is in it and why, in the order it is installed:
#   - Debian trixie, the base the earlier image used, so Chrome's .deb and
#     every apt name below are known to work on it.
#   - the desktop: Xvfb, xfwm4, picom, x11vnc, websockify with noVNC,
#     xdotool and ImageMagick (the exec daemon's clicks and screenshots),
#     dbus, fonts.
#   - tools an agent uses from the shell: git, gh, ripgrep, jq, ffmpeg,
#     poppler, python3, uv, LibreOffice (documents), playwright-core and
#     bun (browser scripts).
#   - Node 24, the version the host bundle is built for (the Mac runs the
#     same bundle on Electron 42's Node 24), and the tree-sitter add-ons
#     the host loads from /home/box/deps, compiled here against that Node.
#   - Google Chrome, pinned, with the policies under box/etc.
#   - our scripts under /usr/local/bin (box/bin): the entrypoint, the
#     supervisor, the desktop, fork windows, the window router, Chrome's
#     launcher, the wallpaper, the doctor.
#
# Every version below is pinned so two builds of the same commit are the
# same image.

FROM debian:trixie-slim

ARG NODE_VERSION=24.15.0
ARG CHROME_VERSION=151.0.7922.169
ARG PLAYWRIGHT_CORE_VERSION=1.59.1
ARG BUN_VERSION=1.4.2
ARG UV_VERSION=0.12.23

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# --- Debian packages ---------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl wget gnupg xz-utils unzip zip \
      git gh jq ripgrep tmux procps psmisc iproute2 sudo util-linux tini \
      openssh-client patch less nano \
      python3 python3-pip python3-venv \
      build-essential pkg-config \
      ffmpeg poppler-utils imagemagick webp \
      xvfb x11vnc websockify novnc x11-utils x11-xserver-utils xauth xdotool \
      dbus-x11 xfwm4 picom hsetroot \
      adwaita-icon-theme gnome-themes-extra \
      fonts-dejavu-core fonts-liberation fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fontconfig \
      libreoffice-writer libreoffice-calc libreoffice-impress fonts-opensymbol \
    && rm -rf /var/lib/apt/lists/*

# --- Node (the official tarball, pinned) -------------------------------------
RUN set -eux \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/node-shasums.txt \
    && cd /tmp && grep " node-v${NODE_VERSION}-linux-x64.tar.xz\$" node-shasums.txt | sed 's#  .*#  node.tar.xz#' | sha256sum -c - \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md \
    && rm -f /tmp/node.tar.xz /tmp/node-shasums.txt \
    && node --version && npm --version

# --- Google Chrome (pinned, held) --------------------------------------------
RUN set -eux \
    && curl -fsSL "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_VERSION}-1_amd64.deb" -o /tmp/google-chrome.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends /tmp/google-chrome.deb \
    && dpkg -s google-chrome-stable | grep -qx "Version: ${CHROME_VERSION}-1" \
    && apt-mark hold google-chrome-stable \
    && rm -f /tmp/google-chrome.deb \
    && rm -rf /var/lib/apt/lists/*
COPY box/etc/chrome-policies/ /etc/opt/chrome/policies/managed/

# --- The box user and its folders --------------------------------------------
# Chrome and the desktop run as `box`; the host and the exec daemon run as
# root, as the earlier image did (the X server accepts every local user).
RUN set -eux \
    && useradd --create-home --shell /bin/bash box \
    && mkdir -p /workspace /home/box/chrome-profile /home/box/sand-data /home/box/sand-host /home/box/box-exec-daemon /home/box/deps /tmp/xdg-runtime-box \
    && chown -R box:box /home/box /workspace /tmp/xdg-runtime-box \
    && printf 'box ALL=(ALL:ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/box && chmod 440 /etc/sudoers.d/box

# --- Browser scripting, bun, uv ---------------------------------------------
RUN set -eux \
    && npm install -g "playwright-core@${PLAYWRIGHT_CORE_VERSION}" \
    && mkdir -p /node_modules && ln -s "$(npm root -g)/playwright-core" /node_modules/playwright-core \
    && cd /workspace && node --input-type=module -e 'import { chromium } from "playwright-core"; if (typeof chromium.connectOverCDP !== "function") process.exit(1)' \
    && npm cache clean --force
# bun from npm (its package carries the Linux binary) and uv from PyPI: both
# publish there as well as on GitHub, and both are checked at build time.
RUN set -eux \
    && npm install -g "bun@${BUN_VERSION}" && bun --version | grep -qx "${BUN_VERSION}" \
    && npm cache clean --force
RUN set -eux \
    && python3 -m venv /opt/uv && /opt/uv/bin/pip install --no-cache-dir "uv==${UV_VERSION}" \
    && ln -s /opt/uv/bin/uv /usr/local/bin/uv && ln -s /opt/uv/bin/uvx /usr/local/bin/uvx \
    && uv --version | grep -q "${UV_VERSION}"

# --- The host's add-ons, compiled against this Node ---------------------------
# The host loads tree-sitter from SAND_TREE_SITTER_NODE_DEPS=/home/box/deps
# as `<root>/<package>/package.json` (packages/shell-exec/shell-parser.ts),
# so the packages sit directly under /home/box/deps, not under node_modules.
COPY box/deps/package.json box/deps/package-lock.json /tmp/deps/
RUN set -eux \
    && cd /tmp/deps && npm ci --no-audit --no-fund --build-from-source \
    && cp -R /tmp/deps/node_modules/. /home/box/deps/ \
    && node -e 'const P = require("/home/box/deps/tree-sitter"), B = require("/home/box/deps/tree-sitter-bash"); const p = new P(); p.setLanguage(B); if (p.parse("echo hi").rootNode.type !== "program") process.exit(1)' \
    && rm -rf /tmp/deps && npm cache clean --force \
    && chown -R box:box /home/box/deps

# --- Wallpapers and our scripts ---------------------------------------------
COPY box/wallpapers/ /usr/share/backgrounds/simeon/
COPY box/bin/ /usr/local/bin/
RUN chmod 755 /usr/local/bin/* \
    && mkdir -p /usr/local/share/simeon-box \
    && node --check /usr/local/bin/simeon-supervisor.mjs \
    && node --check /usr/local/bin/simeon-window-router.mjs \
    && node --check /usr/local/bin/sand-wallpaper-tone.mjs \
    && bash -n /usr/local/bin/start-simeon-box /usr/local/bin/simeon-desktop /usr/local/bin/start-window /usr/local/bin/stop-window /usr/local/bin/box-chrome /usr/local/bin/box-chrome-policy /usr/local/bin/box-doctor /usr/local/bin/sand-wallpaper /usr/local/bin/ensure-machine-id /usr/local/bin/link-chrome-session

ARG SIMEON_BOX_VERSION=dev
RUN printf '%s\n' "$SIMEON_BOX_VERSION" > /etc/simeon-box-version
LABEL com.simeonlabs.box-image.version=$SIMEON_BOX_VERSION

ENV EXEC_DAEMON_CWD=/workspace \
    BROWSER=/usr/local/bin/box-chrome \
    SAND_TREE_SITTER_NODE_DEPS=/home/box/deps \
    NODE_PATH=/home/box/deps

# 1337 exec daemon, 1339 window router, 1340 host gateway, 6080 primary
# screen, 6081 fork screens. The server and the Mac dial 1340, 6080, 6081.
EXPOSE 1337 1339 1340 6080 6081
WORKDIR /workspace
# tini is PID 1: it reaps the desktop pieces that outlive the script that
# started them and forwards SIGTERM to the supervisor.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-simeon-box"]
