import * as shared from "../../mods/token-rank/lib/pricing.js";
import pricingJson from "./pricing.json";

export type Provider = "claude" | "codex";
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

/** The tables the mod and the server price from (claude and codex only). */
export const PRICING = { version: pricingJson.version, claude: pricingJson.claude, codex: pricingJson.codex };

export const PRICING_VERSION = pricingJson.version;

export const normalizeModel = (model: string): string => shared.normalizeModel(model);

/** Cost of one aggregated usage row in micro-dollars (not rounded). */
export const costMicros = (row: UsageRow, day: string): number => shared.costMicros(PRICING, row, day);

export const totalTokens = (row: UsageRow): number => shared.totalTokens(row);

export const FAMILIES = ["claude", "codex"] as const;
export type Family = (typeof FAMILIES)[number];

/** By the model's maker, as the mod's charts split it: a Claude model run through Codex is Claude. */
export const modelFamily = (row: UsageRow): Family => shared.modelFamily(row.provider, row.model) as Family;
