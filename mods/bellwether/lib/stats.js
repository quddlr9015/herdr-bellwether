import { costMicros, modelFamily, normalizeModel, totalTokens } from "./pricing.js";
import { addDays, todayUtc } from "./dates.js";

const EMPTY_DAY = { tokens: 0, cost: 0, commits: 0, families: { claude: 0, codex: 0 }, models: new Map() };

/**
 * Per-day totals from a scan. Costs use the cached price table; without one they
 * stay null and the charts weigh by tokens instead.
 */
export function buildDays(scan, pricing) {
  const days = new Map();
  for (const [day, data] of scan?.days ?? []) {
    const entry = { tokens: 0, cost: pricing ? 0 : null, commits: data.commits.length, families: { claude: 0, codex: 0 }, models: new Map() };
    for (const row of data.usage) {
      const tokens = totalTokens(row);
      const cost = pricing ? costMicros(pricing, row, day) / 1e6 : 0;
      const family = modelFamily(row.provider, row.model);
      const model = normalizeModel(row.model);
      const byModel = entry.models.get(model) ?? { family, tokens: 0, cost: 0 };
      byModel.tokens += tokens;
      byModel.cost += cost;
      entry.models.set(model, byModel);
      entry.tokens += tokens;
      if (pricing) entry.cost += cost;
      entry.families[family] += pricing ? cost : tokens;
    }
    days.set(day, entry);
  }
  return days;
}

export const dayOf = (days, day) => days.get(day) ?? EMPTY_DAY;

/** Token, cost and commit totals over [from, to]. */
export function sumRange(days, from, to) {
  const total = { tokens: 0, cost: 0, commits: 0 };
  for (const [day, entry] of days) {
    if (day < from || day > to) continue;
    total.tokens += entry.tokens;
    total.cost += entry.cost ?? 0;
    total.commits += entry.commits;
  }
  return total;
}

/** The last `count` days, oldest first, with empty days filled in. */
export function lastDays(days, count) {
  const today = todayUtc();
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, i - count + 1);
    return { day, ...dayOf(days, day) };
  });
}

/** Models by cost (or tokens without prices) since `from`, with their share of the total. */
export function topModels(days, from, limit) {
  const totals = new Map();
  for (const [day, entry] of days) {
    if (day < from) continue;
    for (const [model, usage] of entry.models) {
      const sum = totals.get(model) ?? { model, family: usage.family, tokens: 0, cost: 0 };
      sum.tokens += usage.tokens;
      sum.cost += usage.cost;
      totals.set(model, sum);
    }
  }
  const list = [...totals.values()];
  const weight = (m) => m.cost || m.tokens;
  const all = list.reduce((sum, m) => sum + weight(m), 0) || 1;
  return list.sort((a, b) => weight(b) - weight(a)).slice(0, limit).map((m) => ({ ...m, share: weight(m) / all }));
}

/** Days in a row with any usage, counting back from today (or yesterday when today is still empty). */
/** Runs of consecutive days with usage: { current: {length, from, to}, longest: {length, from, to} }. */
export function streaks(days) {
  const active = [...days.entries()].filter(([, d]) => d.tokens > 0).map(([day]) => day).sort();
  let longest = { length: 0, from: null, to: null };
  let run = null;
  for (const day of active) {
    run = run && addDays(run.to, 1) === day ? { length: run.length + 1, from: run.from, to: day } : { length: 1, from: day, to: day };
    if (run.length > longest.length) longest = run;
  }
  const today = todayUtc();
  const current = run && (run.to === today || run.to === addDays(today, -1)) ? run : { length: 0, from: null, to: null };
  return { current, longest };
}
