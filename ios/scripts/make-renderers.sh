#!/bin/bash
# The chat's diagrams and maths, as the Mac's window draws them: Mermaid and
# KaTeX (both MIT), from npm at pinned versions, into ios/Simeon/Rendering/,
# read at run time by the views that draw them (ios/Simeon/Rendering.swift).
# Both apps ship the folder as files (ios/project.yml, mac/project.yml).
#
#   ios/scripts/make-renderers.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MERMAID=11.17.2
KATEX=0.16.45
out=Simeon/Rendering
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

fetch() {
  curl -sSfL "https://registry.npmjs.org/$1/-/$1-$2.tgz" -o "$work/$1.tgz"
  mkdir -p "$work/$1"
  tar xzf "$work/$1.tgz" -C "$work/$1"
}

fetch mermaid "$MERMAID"
fetch katex "$KATEX"

rm -rf "$out"
mkdir -p "$out/fonts"
cp "$work/mermaid/package/dist/mermaid.min.js" "$out/mermaid.min.js"
cp "$work/mermaid/package/LICENSE" "$out/MERMAID-LICENSE.txt"
cp "$work/katex/package/dist/katex.min.js" "$out/katex.min.js"
cp "$work/katex/package/dist/katex.min.css" "$out/katex.min.css"
cp "$work/katex/package/dist/fonts/"*.woff2 "$out/fonts/"
cp "$work/katex/package/LICENSE" "$out/KATEX-LICENSE.txt"
printf 'mermaid %s\nkatex %s\n' "$MERMAID" "$KATEX" > "$out/VERSIONS.txt"
du -sh "$out"
