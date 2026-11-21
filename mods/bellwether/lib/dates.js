import { currentLanguage, formatMonth, formatShortDay, monthAbbrev, tr } from "./locale.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
export const todayUtc = () => utcDay(Date.now());
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day, n) => utcDay(dayMs(day) + n * DAY_MS);

/** The UTC day, Monday-to-Sunday week or calendar month that contains `day`. */
export function periodRange(kind, day) {
  if (kind === "day") return { from: day, to: day };
  const date = new Date(dayMs(day));
  if (kind === "week") {
    const from = addDays(day, -((date.getUTCDay() + 6) % 7));
    return { from, to: addDays(from, 6) };
  }
  return {
    from: utcDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    to: utcDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  };
}

/** A day inside the period `offset` steps before the current one. */
export function anchorDay(kind, offset) {
  const today = todayUtc();
  if (kind === "day") return addDays(today, -offset);
  if (kind === "week") return addDays(today, -7 * offset);
  const date = new Date(dayMs(today));
  return utcDay(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - offset, 1));
}

/** "November 2026" (in the interface's language) for any day in that month. */
export const monthLabel = (day) => formatMonth(day);

export const monthShort = (index) => monthAbbrev(index);

export const shortDay = (day) => formatShortDay(day);

export function periodLabel(kind, day, offset) {
  const { from, to } = periodRange(kind, day);
  if (kind === "day") return offset === 0 ? tr("Today") : offset === 1 ? tr("Yesterday") : shortDay(day);
  if (kind === "week") {
    if (offset === 0) return tr("This week");
    // English shortens a same-month range ("Oct 12 – 18"); other languages spell both days.
    const sameMonth = from.slice(5, 7) === to.slice(5, 7) && currentLanguage() === "en";
    return `${shortDay(from)} – ${sameMonth ? Number(to.slice(8)) : shortDay(to)}`;
  }
  return offset === 0 ? tr("This month") : formatMonth(from);
}
