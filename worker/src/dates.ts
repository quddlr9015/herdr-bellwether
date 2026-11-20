export const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodKind = "day" | "week" | "month";

export interface Period {
  kind: PeriodKind;
  key: string;
  from: string;
  to: string;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Milliseconds at UTC midnight of a `YYYY-MM-DD` day, or null when it is not a real date. */
export function dayStartMs(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms) || utcDay(ms) !== day) return null;
  return ms;
}

/** The day, ISO week (Monday to Sunday) or calendar month that contains `day`. */
export function periodOf(kind: PeriodKind, day: string): Period {
  const start = dayStartMs(day);
  if (start === null) throw new Error(`not a day: ${day}`);
  if (kind === "day") return { kind, key: `d${day}`, from: day, to: day };
  if (kind === "week") {
    const daysSinceMonday = (new Date(start).getUTCDay() + 6) % 7;
    const monday = start - daysSinceMonday * DAY_MS;
    const from = utcDay(monday);
    return { kind, key: `w${from}`, from, to: utcDay(monday + 6 * DAY_MS) };
  }
  const date = new Date(start);
  const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const last = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
  return { kind, key: `m${day.slice(0, 7)}`, from: utcDay(first), to: utcDay(last) };
}

/** Every day, week and month period touched by the given days, without duplicates. */
export function periodsTouching(days: Iterable<string>): Period[] {
  const byKey = new Map<string, Period>();
  for (const day of days) {
    for (const kind of ["day", "week", "month"] as const) {
      const period = periodOf(kind, day);
      byKey.set(period.key, period);
    }
  }
  return [...byKey.values()];
}
