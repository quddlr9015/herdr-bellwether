import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { COLOR, FAMILY, alpha } from "./style.js";
import { addDays, shortDay, todayUtc } from "../lib/dates.js";

const BAR_GAP = 2;
const MIN_BAR = 2;

/**
 * Vertical bars, one per item, each stacked from `segments(item)`: [{ value, color }].
 * Empty bars show a faint stub so the time axis stays readable.
 */
export function barChart(id, items, { width, height, segments, tooltip }, t) {
  const barW = Math.max(3, Math.floor((width - BAR_GAP * (items.length - 1)) / items.length));
  const totals = items.map((item) => segments(item).reduce((sum, s) => sum + s.value, 0));
  const max = Math.max(...totals, 0) || 1;
  return h_flex().h(height).items_end().gap(BAR_GAP).children(items.map((item, i) => {
    const bar = v_flex().id(`${id}-${i}`).w(barW).h(height).justify_end().tooltip(tooltip(item));
    if (!totals[i]) return bar.child(div().h(MIN_BAR).rounded(1).bg(t.border));
    const column = v_flex().rounded(2).overflow_hidden();
    for (const s of segments(item).filter((s) => s.value > 0)) {
      column.child(div().h(Math.max(1, Math.round((s.value / max) * height))).bg(s.color));
    }
    return bar.child(column);
  }));
}

/** Tiny bars for the status bar. */
export function sparkline(values, color, t) {
  const max = Math.max(...values, 0) || 1;
  return h_flex().h(12).items_end().gap(1.5).flex_none().children(values.map((v) =>
    div().w(3).rounded(1).h(Math.max(2, Math.round((v / max) * 12))).bg(v ? color : t.border)));
}

/** Six weeks of days, Monday at the top, most recent week on the right. */
export function heatmap(days, weightOf, t) {
  const today = todayUtc();
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -weekday - 35);
  const values = Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((day) => ({ day, value: day > today ? null : weightOf(day) }));
  const max = Math.max(...values.map((v) => v.value ?? 0), 0) || 1;
  const shade = (value) => {
    if (value == null) return alpha(COLOR.violet, 0);
    if (!value) return t.raised;
    return alpha(COLOR.violet, 0.22 + 0.78 * Math.sqrt(value / max));
  };
  return h_flex().gap(3).children(Array.from({ length: 6 }, (_, week) =>
    v_flex().gap(3).children(values.slice(week * 7, week * 7 + 7).map(({ day, value }) =>
      div().id(`tr-heat-${day}`).size(11).rounded(2).bg(shade(value)).when(value != null, (e) => e.tooltip(shortDay(day)))))));
}

export function familySegments(entry) {
  return [
    { value: entry.families?.codex ?? 0, color: FAMILY.codex.color },
    { value: entry.families?.claude ?? 0, color: FAMILY.claude.color },
  ];
}
