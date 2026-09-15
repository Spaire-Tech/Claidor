#!/usr/bin/env bash
# Build whisper.cpp's `whisper-server` for this machine and put it where the
# app looks: resources/whisper/<platform>-<arch>/whisper-server.
#
#   scripts/build-whisper.sh            # host platform
#   WHISPER_CPP_VERSION=v1.8.3 scripts/build-whisper.sh
#
# The app's speech recognition (src/main/speech/whisperServer.ts) runs this
# binary on a loopback port and asks it for text. The macOS installer
# workflow runs this before packaging; a developer runs it once. The model
# is not built here — the app fetches it on first use.
#
# Needs cmake and a C++ compiler. On macOS the Metal backend is on by
# default, which is what makes a twenty-second clip come back in a
# fraction of a second on an Apple chip.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
version="${WHISPER_CPP_VERSION:-v1.8.3}"
work="${WHISPER_BUILD_DIR:-$root/.whisper-build}"
src="$work/whisper.cpp"

platform="$(node -p 'process.platform')"
arch="$(node -p 'process.arch')"
out="$root/resources/whisper/$platform-$arch"
exe="whisper-server"
[ "$platform" = "win32" ] && exe="whisper-server.exe"

if [ -x "$out/$exe" ] && [ "${WHISPER_FORCE_BUILD:-0}" != "1" ]; then
  echo "[build-whisper] $out/$exe already built; set WHISPER_FORCE_BUILD=1 to rebuild"
  exit 0
fi

mkdir -p "$work" "$out"
if [ ! -d "$src/.git" ]; then
  git clone --depth 1 --branch "$version" https://github.com/ggerganov/whisper.cpp.git "$src"
else
  (cd "$src" && git fetch --depth 1 origin "refs/tags/$version:refs/tags/$version" && git checkout -q "$version")
fi

cmake -S "$src" -B "$src/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON
cmake --build "$src/build" --config Release -j "$(node -p 'require("os").cpus().length')" --target whisper-server

built="$src/build/bin/$exe"
[ -f "$built" ] || built="$src/build/bin/Release/$exe"
cp "$built" "$out/$exe"
chmod +x "$out/$exe"
echo "[build-whisper] $version → $out/$exe"
