#!/bin/sh
# Reads Claude Code and Codex session logs and git history on this machine and
# prints daily usage totals for the last WINDOW_DAYS UTC days.
#
#   sh scan.sh <state-dir> [repo-folder ...]
#
# Output lines (tab separated):
#   D  device-id
#   U  day  provider  model  bucket  input  cache_read  cache_write_5m  cache_write_1h  output
#   C  day  commit-sha
#   S  changed-files  seconds  complete|partial
# Exit 75 when another scan holds the lock.
set -u

STATE=$1
shift
HERE=$(cd "$(dirname "$0")" && pwd)
WINDOW_DAYS=40
KEEP_DAYS=60
# Files per search call, and how long one run may read logs before it leaves
# the rest for the next run (a first scan of a large history takes several).
BATCH=300
BUDGET_S=420
STARTED=$(date +%s)

mkdir -p "$STATE" && chmod 700 "$STATE" || exit 1
LOCK="$STATE/scan.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A lock older than 20 minutes belongs to a scan that died.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ] && rmdir "$LOCK" && mkdir "$LOCK"; then
    :
  else
    echo "BUSY"
    exit 75
  fi
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
trap 'exit 1' INT TERM

[ -s "$STATE/device_id" ] || od -An -tx1 -N16 /dev/urandom | tr -d ' \n' >"$STATE/device_id"
for f in files.tsv ledger.tsv cwds.txt repos.txt; do [ -f "$STATE/$f" ] || : >"$STATE/$f"; done

days_ago() {
  date -u -v-"$1"d +%Y-%m-%d 2>/dev/null || date -u -d "$1 days ago" +%Y-%m-%d
}

# provider<TAB>size<TAB>path for every log touched inside the window.
list_logs() {
  provider=$1
  root=$2
  [ -d "$root" ] || return 0
  find "$root" -type f -name '*.jsonl' -mtime -$((WINDOW_DAYS + 1)) -exec wc -c {} + 2>/dev/null |
    awk -v p="$provider" '{ size = $1; sub(/^ *[0-9]+ /, ""); if ($0 != "total") print p "\t" size "\t" $0 }'
}

CLAUDE_HOME=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
CODEX_ROOT=${CODEX_HOME:-$HOME/.codex}
{
  list_logs claude "$CLAUDE_HOME/projects"
  [ "$CLAUDE_HOME" = "$HOME/.config/claude" ] || list_logs claude "$HOME/.config/claude/projects"
  list_logs codex "$CODEX_ROOT/sessions"
  list_logs codex "$CODEX_ROOT/archived_sessions"
} | sort -t "$(printf '\t')" -k3,3 >"$STATE/files.next"

# Files that are new or changed size since the last scan, oldest path first so an
# original session is recorded before any later file that replays it.
awk -F '\t' 'FILENAME == ARGV[1] { seen[$3] = $2; next } seen[$3] != $2' "$STATE/files.tsv" "$STATE/files.next" >"$STATE/changed.tsv"
CHANGED=$(wc -l <"$STATE/changed.tsv" | tr -d ' ')

# ripgrep reads large logs far faster than BSD grep; both print "path:line".
if command -v rg >/dev/null 2>&1; then
  search() { rg --no-config --no-messages -a -F -H --no-heading -N "$@"; }
else
  search() { LC_ALL=C grep -F -H "$@"; }
fi

: >"$STATE/new_cwds.txt"
# Record one batch of changed files for one provider.
record() {
  provider=$1
  batch=$2
  shift 2
  awk -F '\t' -v p="$provider" '$1 == p { print $3 }' "$batch" >"$STATE/batch.paths"
  [ -s "$STATE/batch.paths" ] || return 0
  # Paths are passed as arguments, one per line (log paths never hold newlines).
  (
    set -f
    IFS='
'
    search "$@" -- $(cat "$STATE/batch.paths")
  ) | LC_ALL=C awk -v provider="$provider" -v ledger="$STATE/ledger.tsv" -v cwds="$STATE/cwds.txt" \
    -v new_cwds="$STATE/new_cwds.txt" -f "$HERE/record.awk"
}

# Batches are marked done in files.tsv one at a time, so an interrupted or
# budget-limited run resumes where it stopped. Replays are keyed, so redoing a
# batch never counts twice.
COMPLETE=complete
rm -f "$STATE"/batch.*
split -l "$BATCH" "$STATE/changed.tsv" "$STATE/batch.part."
for batch in "$STATE"/batch.part.*; do
  [ -f "$batch" ] || continue
  if [ $(($(date +%s) - STARTED)) -ge "$BUDGET_S" ]; then
    COMPLETE=partial
    break
  fi
  record claude "$batch" -e '"usage"'
  record codex "$batch" -e '"token_count"' -e '"turn_context"' -e '"session_meta"'
  cat "$batch" >>"$STATE/files.tsv"
done
rm -f "$STATE"/batch.*
# After a complete pass, forget logs that left the window or were deleted.
[ "$COMPLETE" = complete ] && mv "$STATE/files.next" "$STATE/files.tsv"

# Rebuild the ledger without superseded or expired rows, then print day totals.
LC_ALL=C awk -v from="$(days_ago "$WINDOW_DAYS")" -v keep="$(days_ago "$KEEP_DAYS")" \
  -v compacted="$STATE/ledger.next" -f "$HERE/summarize.awk" "$STATE/ledger.tsv" &&
  mv "$STATE/ledger.next" "$STATE/ledger.tsv"

# Repositories the agents worked in, plus the folders passed as arguments, each
# as its shared git directory so a repository's worktrees are read once.
git_dir() {
  [ -d "$1" ] && git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null
}
while IFS= read -r dir; do git_dir "$dir"; done <"$STATE/new_cwds.txt" >>"$STATE/repos.txt"
for dir in "$@"; do git_dir "$dir"; done >>"$STATE/repos.txt"
sort -u "$STATE/repos.txt" -o "$STATE/repos.txt"

# Commits authored by this machine's git identity in each repository.
SINCE="$(days_ago "$WINDOW_DAYS") 00:00:00 +0000"
while IFS= read -r repo; do
  [ -d "$repo" ] || continue
  email=$(git --git-dir="$repo" config user.email 2>/dev/null) || continue
  TZ=UTC git --git-dir="$repo" log --all --no-merges --since="$SINCE" --fixed-strings --author="<$email>" \
    --date=format-local:%Y-%m-%d --format='%ad %H' 2>/dev/null
done <"$STATE/repos.txt" | awk '!seen[$2]++ { print "C\t" $1 "\t" $2 }'

printf 'D\t%s\n' "$(cat "$STATE/device_id")"
printf 'S\t%s\t%s\t%s\n' "$CHANGED" $(($(date +%s) - STARTED)) "$COMPLETE"
