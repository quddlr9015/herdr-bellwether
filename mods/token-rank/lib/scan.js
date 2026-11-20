import { exec } from "herdr";

const SCAN_TIMEOUT_MS = 10 * 60 * 1000;
const SCAN_BUSY = 75;
const MAX_COMMITS_PER_UPLOAD = 5000;
// The server takes the last 40 UTC days; one day less leaves room for a scan
// that finished just before midnight.
const UPLOAD_DAYS = 39;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_FIELDS = ["input", "cache_read", "cache_write_5m", "cache_write_1h", "output"];

const todayUtc = () => new Date().toISOString().slice(0, 10);

const utcDaysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);

/** Day totals as `scan.sh` prints them: Map(day -> { usage: rows[], commits: sha16[] }). */
export function parseScan(stdout) {
  const days = new Map();
  const dayOf = (day) => {
    if (!days.has(day)) days.set(day, { usage: [], commits: [] });
    return days.get(day);
  };
  let deviceId = null;
  let changedFiles = 0;
  for (const line of stdout.split("\n")) {
    const f = line.split("\t");
    if (f[0] === "U" && f.length === 10) {
      const row = { provider: f[2], model: f[3].replace(/[^\x21-\x7e]/g, "_").slice(0, 120), bucket: Number(f[4]) };
      TOKEN_FIELDS.forEach((field, i) => { row[field] = Number(f[5 + i]); });
      dayOf(f[1]).usage.push(row);
    } else if (f[0] === "C" && f.length === 3) {
      dayOf(f[1]).commits.push(f[2].slice(0, 16));
    } else if (f[0] === "D") {
      deviceId = f[1];
    } else if (f[0] === "S") {
      changedFiles = Number(f[1]);
    }
  }
  for (const day of days.values()) {
    day.usage.sort((a, b) => `${a.provider} ${a.model} ${a.bucket}`.localeCompare(`${b.provider} ${b.model} ${b.bucket}`));
    day.commits.sort();
  }
  return { days, deviceId, changedFiles };
}

/** Runs the scanner. Resolves null when another scan is already running. */
export async function runScan(helper, stateDir, repoFolders) {
  const result = await exec("sh", [helper, stateDir, ...repoFolders], { timeout: SCAN_TIMEOUT_MS });
  if (result.code === SCAN_BUSY) return null;
  if (result.code !== 0) throw new Error(result.stderr.trim().split("\n").pop() || `scan exited with ${result.code}`);
  return parseScan(result.stdout);
}

/**
 * The days to send: today and yesterday always (they are still growing), older
 * days only when they changed since the last successful upload.
 */
export function pendingUpload(scan, sent) {
  const recent = new Set([todayUtc(), utcDaysAgo(1)]);
  const oldest = utcDaysAgo(UPLOAD_DAYS);
  const days = [];
  const signatures = {};
  let commits = 0;
  for (const [day, data] of [...scan.days.entries()].sort(([a], [b]) => b.localeCompare(a))) {
    if (day < oldest) continue;
    const signature = JSON.stringify(data);
    signatures[day] = signature;
    if (!recent.has(day) && sent[day] === signature) continue;
    const room = Math.max(0, MAX_COMMITS_PER_UPLOAD - commits);
    commits += Math.min(room, data.commits.length);
    days.push({ day, usage: data.usage, commits: data.commits.slice(0, room) });
  }
  return { days, signatures };
}
