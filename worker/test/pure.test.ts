import { describe, expect, it } from "vitest";
import { periodOf, periodsTouching } from "../src/dates";
import { HttpError } from "../src/http";
import { type UsageRow, costMicros, normalizeModel, totalTokens } from "../src/pricing";
import pricing from "../src/pricing.json";
import { familyTotals } from "../src/usage";
import { parseUpload } from "../src/validate";

const MILLION = 1_000_000;
const row = (overrides: Partial<UsageRow>): UsageRow => ({
  provider: "claude", model: "claude-sonnet-4-5", bucket: 0,
  input: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, output: 0, ...overrides,
});
const entry = (table: "claude" | "codex", match: string) => {
  const found = (pricing[table].models as { match: string }[]).find((m) => m.match === match);
  if (!found) throw new Error(match);
  return found as Record<string, any>;
};

describe("periods", () => {
  it("puts a Friday in the Monday-to-Sunday week and its calendar month", () => {
    expect(periodOf("week", "2026-11-20")).toEqual({ kind: "week", key: "w2026-11-16", from: "2026-11-16", to: "2026-11-22" });
    expect(periodOf("month", "2028-02-10")).toMatchObject({ key: "m2028-02", from: "2028-02-01", to: "2028-02-29" });
  });

  it("lists each touched period once", () => {
    const keys = periodsTouching(["2026-11-20", "2026-11-21", "2026-12-01"]).map((p) => p.key);
    expect(keys.sort()).toEqual(["d2026-11-20", "d2026-11-21", "d2026-12-01", "m2026-11", "m2026-12", "w2026-11-16", "w2026-11-30"]);
  });
});

describe("pricing", () => {
  it("folds gateway spellings onto one model id", () => {
    expect(normalizeModel("anthropic/claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(normalizeModel("claude-opus-4.8")).toBe("claude-opus-4-8");
    expect(normalizeModel("openai-gpt-5.5")).toBe("gpt-5-5");
    expect(normalizeModel("gpt-6.2-sol")).toBe("gpt-6-2-sol");
  });

  it("bills every Claude token class at its own rate", () => {
    const opus = entry("claude", "opus-5-5");
    const usage = row({ model: "claude-opus-5-5", input: MILLION, output: MILLION, cache_read: MILLION, cache_write_5m: MILLION, cache_write_1h: MILLION });
    const expected = (opus.input + opus.output + opus.cache_read + opus.cache_write + opus.cache_write_1h) * MILLION;
    expect(costMicros(usage, "2026-11-20")).toBeCloseTo(expected, 6);
    expect(totalTokens(usage)).toBe(5 * MILLION);
  });

  it("prices a Claude model found in a Codex log from the Claude table", () => {
    const opus = entry("claude", "opus-5-5");
    const usage = row({ provider: "codex", model: "anthropic/claude-opus-5-5", input: MILLION });
    expect(costMicros(usage, "2026-11-20")).toBeCloseTo(opus.input * MILLION, 6);
  });

  it("switches OpenAI models to long-context rates only above the threshold", () => {
    const sol = entry("codex", "gpt-6.2-sol");
    const base = row({ provider: "codex", model: "gpt-6.2-sol", bucket: 2, input: MILLION, cache_read: MILLION, output: MILLION });
    expect(costMicros(base, "2026-11-20")).toBeCloseTo((sol.input + sol.cached_input + sol.output) * MILLION, 6);
    const long = { ...base, bucket: 3 as const };
    const high = sol.high_context;
    expect(costMicros(long, "2026-11-20")).toBeCloseTo((high.input + high.cached_input + high.output) * MILLION, 6);
  });

  it("uses a scheduled price from its start date", () => {
    const usage = row({ provider: "codex", model: "gpt-5.6-sol", input: MILLION });
    expect(costMicros(usage, "2026-11-30")).toBeCloseTo(4 * MILLION, 6);
    expect(costMicros(usage, "2026-12-01")).toBeCloseTo(5 * MILLION, 6);
  });
});

describe("upload validation", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const good = {
    device_id: "0123456789abcdef0123456789abcdef",
    days: [{ day: "2026-11-20", usage: [row({ input: 5 })], commits: ["0123456789abcdef"] }],
  };

  it("accepts a well-formed upload", () => {
    expect(parseUpload(good, now).days[0]?.rows[0]?.input).toBe(5);
  });

  it.each([
    ["a day outside the window", { ...good, days: [{ ...good.days[0], day: "2026-09-01" }] }],
    ["a future day", { ...good, days: [{ ...good.days[0], day: "2026-11-23" }] }],
    ["a fractional count", { ...good, days: [{ ...good.days[0], usage: [row({ input: 1.5 })] }] }],
    ["a negative count", { ...good, days: [{ ...good.days[0], usage: [row({ output: -1 })] }] }],
    ["a raw commit sha", { ...good, days: [{ ...good.days[0], commits: ["not-hex"] }] }],
    ["a short device id", { ...good, device_id: "abc" }],
    ["a repeated day", { ...good, days: [good.days[0], good.days[0]] }],
  ])("rejects %s", (_name, body) => {
    expect(() => parseUpload(body, now)).toThrow(HttpError);
  });
});

describe("families", () => {
  it("splits a day by the model's maker, so a Claude model run through Codex counts as Claude", () => {
    const rows = [
      row({ provider: "claude", model: "claude-opus-5-5", output: 1_000 }),
      row({ provider: "codex", model: "anthropic/claude-opus-5-5", output: 500 }),
      row({ provider: "codex", model: "gpt-6.1-sol", input: 2_000 }),
    ];
    const totals = familyTotals({ day: "2026-11-20", rows, commits: [] });
    expect(totals.map(([day, family, tokens]) => [day, family, tokens])).toEqual([
      ["2026-11-20", "claude", 1_500],
      ["2026-11-20", "codex", 2_000],
    ]);
    const all = Math.round(rows.reduce((sum, r) => sum + costMicros(r, "2026-11-20"), 0));
    expect(Math.abs(totals.reduce((sum, t) => sum + t[3], 0) - all)).toBeLessThanOrEqual(1);
  });

  it("leaves out a family with no usage that day", () => {
    const totals = familyTotals({ day: "2026-11-20", rows: [row({ provider: "codex", model: "gpt-6.1-sol", input: 10 })], commits: [] });
    expect(totals.map(([, family]) => family)).toEqual(["codex"]);
  });
});
