import { type Period, type PeriodKind, periodOf } from "./dates";
import type { Env } from "./env";

export const METRICS = { cost: "cost_micros", tokens: "tokens", commits: "commits" } as const;
export type Metric = keyof typeof METRICS;

const TOP = 100;

interface TotalsRow {
  user_id: number;
  login: string;
  avatar_url: string | null;
  tokens: number;
  cost_micros: number;
  commits: number;
}

const present = (row: Pick<TotalsRow, "tokens" | "cost_micros" | "commits">) => ({
  cost_usd: row.cost_micros / 1e6,
  tokens: row.tokens,
  commits: row.commits,
});

export async function leaderboard(env: Env, kind: PeriodKind, metric: Metric, day: string) {
  const period = periodOf(kind, day);
  const column = METRICS[metric];
  const visible = `FROM period_totals t JOIN users u ON u.id = t.user_id
                   WHERE t.period = ?1 AND u.hidden = 0 AND t.${column} > 0`;
  const [top, count] = await env.DB.batch<TotalsRow | { participants: number }>([
    env.DB.prepare(
      `SELECT t.user_id, u.login, u.avatar_url, t.tokens, t.cost_micros, t.commits ${visible}
       ORDER BY t.${column} DESC, t.user_id ASC LIMIT ${TOP}`,
    ).bind(period.key),
    env.DB.prepare(`SELECT COUNT(*) AS participants ${visible}`).bind(period.key),
  ]);
  const rows = (top?.results ?? []) as TotalsRow[];
  return {
    period,
    metric,
    participants: (count?.results?.[0] as { participants: number } | undefined)?.participants ?? 0,
    entries: rows.map((row, index) => ({ rank: index + 1, login: row.login, avatar_url: row.avatar_url, ...present(row) })),
  };
}

/** The signed-in user's totals and rank. Rank is null when the user has nothing in this metric. */
export async function standing(env: Env, userId: number, kind: PeriodKind, metric: Metric, day: string) {
  const period: Period = periodOf(kind, day);
  const column = METRICS[metric];
  const mine = await env.DB.prepare(
    "SELECT tokens, cost_micros, commits FROM period_totals WHERE period = ?1 AND user_id = ?2",
  ).bind(period.key, userId).first<Pick<TotalsRow, "tokens" | "cost_micros" | "commits">>();
  const totals = mine ?? { tokens: 0, cost_micros: 0, commits: 0 };
  const value = totals[column];
  let rank: number | null = null;
  if (value > 0) {
    const ahead = await env.DB.prepare(
      `SELECT COUNT(*) AS ahead FROM period_totals t JOIN users u ON u.id = t.user_id
       WHERE t.period = ?1 AND u.hidden = 0 AND (t.${column} > ?2 OR (t.${column} = ?2 AND t.user_id < ?3))`,
    ).bind(period.key, value, userId).first<{ ahead: number }>();
    rank = (ahead?.ahead ?? 0) + 1;
  }
  return { period, metric, rank, ...present(totals) };
}
