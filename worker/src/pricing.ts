// Prices come from pricing.json, copied from soulduse/ai-token-monitor (MIT).
// Rates are USD per million tokens, so tokens x rate is the cost in micro-dollars.
import pricingJson from "./pricing.json";

export type Provider = "claude" | "codex";

/** Prompt-size bands (input + cache reads + cache writes of one request). */
export const BUCKET_FLOORS = [0, 100_000, 200_000, 272_000] as const;
export type Bucket = 0 | 1 | 2 | 3;

export interface UsageRow {
  provider: Provider;
  model: string;
  bucket: Bucket;
  /** Input tokens that were neither cache reads nor cache writes. */
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
}

interface Rates {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
  cache_write_1h?: number;
  cached_input?: number;
}

interface HighContext extends Rates {
  threshold_tokens: number;
}

interface Entry extends Rates {
  match: string;
  input: number;
  output: number;
  high_context?: HighContext;
  scheduled?: (Rates & { from: string; high_context?: HighContext })[];
}

interface Table {
  default: string;
  models: Entry[];
}

const pricing = pricingJson as unknown as { version: string; claude: Table; codex: Table };

export const PRICING_VERSION = pricing.version;

const ANTHROPIC_FAMILIES = ["claude", "opus", "sonnet", "haiku", "fable", "mythos"];
const VENDOR_PREFIXES = ["anthropic", "openai", "azure", "bedrock", "vertex", "google", "litellm", "omniroute", "openrouter", "kiro"];

const canonical = (model: string) => model.toLowerCase().replace(/[._]/g, "-");

const isAnthropic = (id: string) => ANTHROPIC_FAMILIES.some((family) => id.includes(family));
const isOpenAI = (id: string) => id.includes("gpt") || id.includes("codex") || /(^|-)o[34](-|$)/.test(id);

/** One spelling per model: lowercase, hyphenated, without a gateway's vendor prefix. */
export function normalizeModel(model: string): string {
  const id = canonical(model).split("/").pop() ?? "";
  for (const vendor of VENDOR_PREFIXES) {
    const rest = id.startsWith(`${vendor}-`) ? id.slice(vendor.length + 1) : null;
    if (rest && (isAnthropic(rest) || isOpenAI(rest))) return rest;
  }
  return id;
}

/** The table a model is priced from. A log's own provider decides only for unknown families. */
function tableFor(provider: Provider, model: string): Provider {
  if (isAnthropic(model)) return "claude";
  if (isOpenAI(model)) return "codex";
  return provider;
}

function findEntry(table: Table, model: string): Entry {
  const match = table.models.find((entry) => model.includes(canonical(entry.match)));
  const fallback = table.models.find((entry) => entry.match === table.default) ?? table.models[0];
  const entry = match ?? fallback;
  if (!entry) throw new Error("pricing table is empty");
  return entry;
}

/** The entry's rates on `day`: the latest schedule that started on or before it wins, field by field. */
function ratesOn(entry: Entry, day: string): Entry {
  const schedule = (entry.scheduled ?? [])
    .filter((s) => s.from <= day)
    .sort((a, b) => a.from.localeCompare(b.from))
    .pop();
  if (!schedule) return entry;
  const resolved: Entry = { ...entry };
  for (const field of ["input", "output", "cache_read", "cache_write", "cache_write_1h", "cached_input"] as const) {
    const rate = schedule[field];
    if (rate) resolved[field] = rate;
  }
  if (schedule.high_context) resolved.high_context = schedule.high_context;
  return resolved;
}

/** Cost of one aggregated usage row in micro-dollars (not rounded). */
export function costMicros(row: UsageRow, day: string): number {
  const model = normalizeModel(row.model);
  const tableName = tableFor(row.provider, model);
  const rates = ratesOn(findEntry(pricing[tableName], model), day);
  const tier = rates.high_context;
  const high = tier && BUCKET_FLOORS[row.bucket] >= tier.threshold_tokens ? tier : undefined;
  const input = high?.input || rates.input;
  const output = high?.output || rates.output;

  if (tableName === "claude") {
    const cacheRead = high?.cached_input || rates.cache_read || 0;
    const cacheWrite = high?.cache_write || rates.cache_write || 0;
    const cacheWrite1h = high?.cache_write_1h || rates.cache_write_1h || cacheWrite;
    return row.input * input + row.output * output + row.cache_read * cacheRead
      + row.cache_write_5m * cacheWrite + row.cache_write_1h * cacheWrite1h;
  }
  // OpenAI tables have no cache-write rate: writes bill as ordinary input.
  const cachedInput = high?.cached_input || rates.cached_input || 0;
  return (row.input + row.cache_write_5m + row.cache_write_1h) * input + row.cache_read * cachedInput + row.output * output;
}

export function totalTokens(row: UsageRow): number {
  return row.input + row.cache_read + row.cache_write_5m + row.cache_write_1h + row.output;
}
