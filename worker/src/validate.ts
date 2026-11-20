import { DAY_MS, dayStartMs, utcDay } from "./dates";
import { HttpError } from "./http";
import type { Bucket, Provider, UsageRow } from "./pricing";

export const UPLOAD_WINDOW_DAYS = 40;
const MAX_ROWS_PER_DAY = 400;
const MAX_COMMITS = 5_000;
const MAX_TOKENS = 1e13;
const PROVIDERS: readonly Provider[] = ["claude", "codex"];
const TOKEN_FIELDS = ["input", "cache_read", "cache_write_5m", "cache_write_1h", "output"] as const;

export interface UploadDay {
  day: string;
  rows: UsageRow[];
  commits: string[];
}

export interface Upload {
  deviceId: string;
  days: UploadDay[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function invalid(message: string): never {
  throw new HttpError(400, "invalid_upload", message);
}

function parseRow(value: unknown): UsageRow {
  if (!isObject(value)) invalid("usage rows must be objects");
  const { provider, model, bucket } = value;
  if (!PROVIDERS.includes(provider as Provider)) invalid("unknown provider");
  if (typeof model !== "string" || !/^[\x21-\x7e]{1,120}$/.test(model)) invalid("bad model id");
  if (bucket !== 0 && bucket !== 1 && bucket !== 2 && bucket !== 3) invalid("bad bucket");
  const row = { provider: provider as Provider, model, bucket: bucket as Bucket } as UsageRow;
  for (const field of TOKEN_FIELDS) {
    const count = value[field];
    if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > MAX_TOKENS) invalid(`bad ${field}`);
    row[field] = count as number;
  }
  return row;
}

/** Checks an upload against the contract the mod sends: recent UTC days, bounded sizes, plain integers. */
export function parseUpload(body: unknown, nowMs: number): Upload {
  if (!isObject(body)) invalid("body must be an object");
  const { device_id: deviceId, days } = body;
  if (typeof deviceId !== "string" || !/^[0-9a-f]{32}$/.test(deviceId)) invalid("bad device_id");
  if (!Array.isArray(days) || days.length === 0 || days.length > UPLOAD_WINDOW_DAYS + 2) invalid("bad days");

  const earliest = utcDay(nowMs - UPLOAD_WINDOW_DAYS * DAY_MS);
  const latest = utcDay(nowMs + DAY_MS);
  const seen = new Set<string>();
  let commitCount = 0;
  const parsed = days.map((entry): UploadDay => {
    if (!isObject(entry)) invalid("days must be objects");
    const { day, usage, commits } = entry;
    if (typeof day !== "string" || dayStartMs(day) === null) invalid("bad day");
    if (day < earliest || day > latest) invalid(`day ${day} is outside the upload window`);
    if (seen.has(day)) invalid(`day ${day} is repeated`);
    seen.add(day);
    if (!Array.isArray(usage) || usage.length > MAX_ROWS_PER_DAY) invalid("bad usage");
    if (!Array.isArray(commits)) invalid("bad commits");
    commitCount += commits.length;
    if (commitCount > MAX_COMMITS) invalid("too many commits");
    for (const commit of commits) {
      if (typeof commit !== "string" || !/^[0-9a-f]{16}$/.test(commit)) invalid("bad commit id");
    }
    return { day, rows: usage.map(parseRow), commits: commits as string[] };
  });
  return { deviceId, days: parsed };
}
