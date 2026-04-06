#!/usr/bin/env bash
# Optional lossy pass for smaller README GIFs. Requires: brew install gifsicle
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/../demo-header.gif}"
DST="${2:-$SRC}"
if ! command -v gifsicle >/dev/null 2>&1; then
  echo "gifsicle not found (brew install gifsicle). Skipping optimization."
  exit 0
fi
TMP="${DST}.opt.gif"
gifsicle -O3 --lossy=80 "$SRC" -o "$TMP"
mv "$TMP" "$DST"
echo "Optimized: $DST ($(wc -c < "$DST" | tr -d ' ') bytes)"
