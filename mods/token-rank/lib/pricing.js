// Cost of AI usage from a pricing table shaped like ai-token-monitor's pricing.json
// (MIT). Shared by the mod (local estimates) and the Worker (leaderboard totals).
// Rates are USD per million tokens, so tokens x rate is micro-dollars.

/** Prompt-size bands (input + cache reads + cache writes of one request). */
export const BUCKET_FLOORS = [0, 100_000, 200_000, 272_000];

const ANTHROPIC_FAMILIES = ["claude", "opus", "sonnet", "haiku", "fable", "mythos"];
const VENDOR_PREFIXES = ["anthropic", "openai", "azure", "bedrock", "vertex", "google", "litellm", "omniroute", "openrouter", "kiro"];
const RATE_FIELDS = ["input", "output", "cache_read", "cache_write", "cache_write_1h", "cached_input"];

const canonical = (model) => model.toLowerCase().replace(/[._]/g, "-");
const isAnthropic = (id) => ANTHROPIC_FAMILIES.some((family) => id.includes(family));
const isOpenAI = (id) => id.includes("gpt") || id.includes("codex") || /(^|-)o[34](-|$)/.test(id);

/** One spelling per model: lowercase, hyphenated, without a gateway's vendor prefix. */
export function normalizeModel(model) {
  const id = canonical(model).split("/").pop() ?? "";
  for (const vendor of VENDOR_PREFIXES) {
    const rest = id.startsWith(`${vendor}-`) ? id.slice(vendor.length + 1) : null;
    if (rest && (isAnthropic(rest) || isOpenAI(rest))) return rest;
  }
  return id;
}

/** "claude" or "codex": the table a model is priced from and the family it is shown under. */
export function modelFamily(provider, model) {
  const id = normalizeModel(model);
  if (isAnthropic(id)) return "claude";
  if (isOpenAI(id)) return "codex";
  return provider;
}

function findEntry(table, model) {
  const match = table.models.find((entry) => model.includes(canonical(entry.match)));
  const entry = match ?? table.models.find((e) => e.match === table.default) ?? table.models[0];
  if (!entry) throw new Error("pricing table is empty");
  return entry;
}

/** The entry's rates on `day`: the latest schedule that started on or before it wins, field by field. */
function ratesOn(entry, day) {
  const schedule = (entry.scheduled ?? []).filter((s) => s.from <= day).sort((a, b) => a.from.localeCompare(b.from)).pop();
  if (!schedule) return entry;
  const resolved = { ...entry };
  for (const field of RATE_FIELDS) if (schedule[field]) resolved[field] = schedule[field];
  if (schedule.high_context) resolved.high_context = schedule.high_context;
  return resolved;
}

/**
 * Cost of one aggregated usage row in micro-dollars (not rounded).
 * row: { provider, model, bucket, input, cache_read, cache_write_5m, cache_write_1h, output }
 * pricing: { claude: { default, models }, codex: { default, models } }
 */
export function costMicros(pricing, row, day) {
  const model = normalizeModel(row.model);
  const tableName = modelFamily(row.provider, row.model);
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

export function totalTokens(row) {
  return row.input + row.cache_read + row.cache_write_5m + row.cache_write_1h + row.output;
}
