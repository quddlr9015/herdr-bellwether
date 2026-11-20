import { DAY_MS, type PeriodKind, dayStartMs, periodOf, utcDay } from "./dates";
import type { Env } from "./env";
import type { Family } from "./pricing";

/** "all", or one model family. Family boards have no commits (a commit belongs to no one model). */
export type Board = "all" | Family;

const keyOf = (board: Board, key: string) => (board === "all" ? key : `${board}:${key}`);

export const METRICS = { cost: "cost_micros", tokens: "tokens", commits: "commits" } as const;
export type Metric = keyof typeof METRICS;

const TOP = 100;
const PROFILE_DAYS = 30;

/** Accounts that show on public boards: not hidden by an admin, not opted out by their owner. */
const PUBLIC = "u.hidden = 0 AND u.listed = 1";

interface Totals {
  tokens: number;
  cost_micros: number;
  commits: number;
}

interface TotalsRow extends Totals {
  user_id: number;
  login: string;
  avatar_url: string | null;
  previous_rank: number | null;
}

const present = (row: Totals) => ({ cost_usd: row.cost_micros / 1e6, tokens: row.tokens, commits: row.commits });

/** The period of the same kind just before the one containing `day`. */
function previousPeriod(kind: PeriodKind, day: string) {
  const start = dayStartMs(periodOf(kind, day).from) ?? 0;
  return periodOf(kind, utcDay(start - DAY_MS));
}

export async function leaderboard(env: Env, kind: PeriodKind, metric: Metric, day: string, board: Board = "all") {
  const period = periodOf(kind, day);
  const previous = previousPeriod(kind, day);
  const column = METRICS[metric];
  const [top, count] = await env.DB.batch<TotalsRow | { participants: number }>([
    env.DB.prepare(
      `WITH before AS (
         SELECT t.user_id, ROW_NUMBER() OVER (ORDER BY t.${column} DESC, t.user_id ASC) AS place
         FROM period_totals t JOIN users u ON u.id = t.user_id
         WHERE t.period = ?2 AND ${PUBLIC} AND t.${column} > 0)
       SELECT t.user_id, u.login, u.avatar_url, t.tokens, t.cost_micros, t.commits, before.place AS previous_rank
       FROM period_totals t JOIN users u ON u.id = t.user_id LEFT JOIN before ON before.user_id = t.user_id
       WHERE t.period = ?1 AND ${PUBLIC} AND t.${column} > 0
       ORDER BY t.${column} DESC, t.user_id ASC LIMIT ${TOP}`,
    ).bind(keyOf(board, period.key), keyOf(board, previous.key)),
    env.DB.prepare(
      `SELECT COUNT(*) AS participants FROM period_totals t JOIN users u ON u.id = t.user_id
       WHERE t.period = ?1 AND ${PUBLIC} AND t.${column} > 0`,
    ).bind(keyOf(board, period.key)),
  ]);
  const rows = (top?.results ?? []) as TotalsRow[];
  return {
    period,
    metric,
    family: board,
    participants: (count?.results?.[0] as { participants: number } | undefined)?.participants ?? 0,
    entries: rows.map((row, index) => ({
      rank: index + 1,
      previous_rank: row.previous_rank,
      login: row.login,
      avatar_url: row.avatar_url,
      ...present(row),
    })),
  };
}

/** The signed-in user's totals and rank. Rank is null when the user has nothing in this metric. */
export async function standing(env: Env, userId: number, kind: PeriodKind, metric: Metric, day: string, board: Board = "all") {
  const period = periodOf(kind, day);
  const key = keyOf(board, period.key);
  const column = METRICS[metric];
  const mine = await env.DB.prepare("SELECT tokens, cost_micros, commits FROM period_totals WHERE period = ?1 AND user_id = ?2")
    .bind(key, userId).first<Totals>();
  const totals = mine ?? { tokens: 0, cost_micros: 0, commits: 0 };
  const value = totals[column];
  let rank: number | null = null;
  if (value > 0) {
    const ahead = await env.DB.prepare(
      `SELECT COUNT(*) AS ahead FROM period_totals t JOIN users u ON u.id = t.user_id
       WHERE t.period = ?1 AND ${PUBLIC} AND t.user_id != ?3 AND (t.${column} > ?2 OR (t.${column} = ?2 AND t.user_id < ?3))`,
    ).bind(key, value, userId).first<{ ahead: number }>();
    rank = (ahead?.ahead ?? 0) + 1;
  }
  return { period, metric, family: board, rank, ...present(totals) };
}

/** A public account's last 30 days and its week and month totals, or null when it is not public. */
export async function profile(env: Env, login: string, nowMs: number) {
  const user = await env.DB.prepare(
    `SELECT u.id, u.login, u.avatar_url, u.created_at FROM users u WHERE u.login = ?1 COLLATE NOCASE AND ${PUBLIC}`,
  ).bind(login).first<{ id: number; login: string; avatar_url: string | null; created_at: number }>();
  if (!user) return null;
  const today = utcDay(nowMs);
  const from = utcDay(nowMs - (PROFILE_DAYS - 1) * DAY_MS);
  const week = periodOf("week", today).key;
  const month = periodOf("month", today).key;
  const { results } = await env.DB.prepare(
    `SELECT period, tokens, cost_micros, commits FROM period_totals
     WHERE user_id = ?1 AND ((period BETWEEN ?2 AND ?3) OR period IN (?4, ?5))`,
  ).bind(user.id, `d${from}`, `d${today}`, week, month).all<Totals & { period: string }>();
  const byPeriod = new Map(results.map((row) => [row.period, row]));
  const empty = { tokens: 0, cost_micros: 0, commits: 0 };
  const days = Array.from({ length: PROFILE_DAYS }, (_, i) => {
    const day = utcDay(nowMs - (PROFILE_DAYS - 1 - i) * DAY_MS);
    return { day, ...present(byPeriod.get(`d${day}`) ?? empty) };
  });
  return {
    login: user.login,
    avatar_url: user.avatar_url,
    joined: new Date(user.created_at).toISOString().slice(0, 10),
    week: present(byPeriod.get(week) ?? empty),
    month: present(byPeriod.get(month) ?? empty),
    days,
  };
}
