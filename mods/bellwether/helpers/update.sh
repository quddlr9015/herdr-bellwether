#!/bin/sh
# Installs Bellwether <tag> over this mod folder: downloads that release's source
# archive from GitHub, checks it carries that version, keeps a copy of the
# current files in <state>/backups (the last three), then copies the new mod in.
# The hidden .avatars cache stays.
# usage: update.sh <tag> <mod folder> <state folder>
set -eu

# Run from a copy: the copy below replaces this very file.
if [ "${BW_UPDATE_COPY:-}" != 1 ]; then
  self=$(mktemp)
  cp "$0" "$self"
  BW_UPDATE_COPY=1 exec sh "$self" "$@"
fi

TAG=$1 DEST=$2 STATE=$3
case "$TAG" in v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "not a release tag: $TAG" >&2; exit 2 ;; esac
case "${TAG#v}" in *[!0-9.]*) echo "not a release tag: $TAG" >&2; exit 2 ;; esac
[ -f "$DEST/mod.json" ] || { echo "not a mod folder: $DEST" >&2; exit 2; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP" "$0"' EXIT
curl -fsSL --max-time 120 "https://github.com/quddlr9015/herdr-bellwether/archive/refs/tags/$TAG.tar.gz" -o "$TMP/src.tar.gz"
tar -xzf "$TMP/src.tar.gz" -C "$TMP"
SRC=$(find "$TMP" -mindepth 3 -maxdepth 3 -type d -path '*/mods/bellwether' | head -n 1)
if [ -z "$SRC" ] || [ ! -f "$SRC/mod.json" ] || [ ! -f "$SRC/main.js" ]; then
  echo "the $TAG archive has no mods/bellwether" >&2; exit 3
fi
grep -q "VERSION = \"${TAG#v}\"" "$SRC/lib/version.js" || { echo "the $TAG archive is not version ${TAG#v}" >&2; exit 4; }

BACKUP="$STATE/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -R "$DEST/." "$BACKUP/"
ls -1d "$STATE"/backups/* 2>/dev/null | sort -r | tail -n +4 | while IFS= read -r old; do rm -rf "$old"; done

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude .avatars --exclude gpui-kit.d.ts --exclude jsconfig.json "$SRC/" "$DEST/"
else
  cp -R "$SRC/." "$DEST/"
fi
echo "installed $TAG"
