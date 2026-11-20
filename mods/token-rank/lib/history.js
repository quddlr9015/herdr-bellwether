import { exec } from "herdr";
import { parseScan } from "./scan.js";

/**
 * Day totals that outlive the scan window.
 *
 * `scan.sh` reports only the last 40 days and its ledger forgets rows after 60,
 * so an all-time total needs its own copy: every scanned day is written here, and
 * a day that leaves the window keeps the last totals it had. The first time, the
 * ledger's older days (up to 60 back) are read in too; their commits are not in
 * the ledger, so those days count usage only.
 *
 * File: { version: 1, days: { "YYYY-MM-DD": { usage: rows[], commits: sha16[] } } }
 */

const VERSION = 1;

export function parseHistory(text) {
  try {
    const saved = text ? JSON.parse(text) : null;
    if (saved?.version !== VERSION || typeof saved.days !== "object") return null;
    return new Map(Object.entries(saved.days));
  } catch {
    return null;
  }
}

export const historyFile = (days) => ({ version: VERSION, days: Object.fromEntries([...days].sort(([a], [b]) => a.localeCompare(b))) });

/** Saved days, overwritten by the scan's days (the scan is current for its window). */
export function mergeHistory(saved, scan) {
  const days = new Map(saved ?? []);
  for (const [day, data] of scan?.days ?? []) days.set(day, data);
  return days;
}

/** Every day still in the ledger, as `scan.sh` would print it with no window. */
export async function readLedger(helpersDir, stateDir) {
  const out = `${stateDir}/ledger.history.tmp`;
  const result = await exec("sh", ["-c",
    'LC_ALL=C awk -v from=0000-00-00 -v keep=0000-00-00 -v compacted="$3" -f "$1/summarize.awk" "$2/ledger.tsv"; status=$?; rm -f "$3"; exit $status',
    "sh", helpersDir, stateDir, out]);
  if (result.code !== 0) return new Map();
  return parseScan(result.stdout).days;
}
