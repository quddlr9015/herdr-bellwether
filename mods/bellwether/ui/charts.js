import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { COLOR, FAMILY, alpha } from "./style.js";
import { addDays, monthShort, periodRange, shortDay, todayUtc } from "../lib/dates.js";
import { tr } from "../lib/locale.js";

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

export function familySegments(entry) {
  return [
    { value: entry.families?.codex ?? 0, color: FAMILY.codex.color },
    { value: entry.families?.claude ?? 0, color: FAMILY.claude.color },
  ];
}

const weekdayOf = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
const shadeFor = (max, t) => (value) => (!value ? t.raised : alpha(COLOR.accent, 0.22 + 0.78 * Math.sqrt(value / max)));

/**
 * GitHub-style squares for the days from `from` to `to`: a column per week,
 * Monday on top, month names over the weeks they start in, Mon/Wed/Fri at the
 * left. Days after today are faint; days outside the range are left out; today
 * has an outline.
 */
export function activityGrid(from, to, weightOf, tooltipOf, t, { cell, gap }) {
  const today = todayUtc();
  const start = addDays(from, -weekdayOf(from));
  const weekCount = Math.ceil((weekdayOf(from) + (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 + 1) / 7);
  const weeks = Array.from({ length: weekCount }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const inRange = (day) => day >= from && day <= to;
  const max = Math.max(...weeks.flat().filter((day) => inRange(day) && day <= today).map((day) => weightOf(day) ?? 0), 0) || 1;
  const shade = shadeFor(max, t);
  const LABEL_W = 26;
  const monthRow = h_flex().gap(gap).h(15).pl(LABEL_W).children(weeks.map((week, w) => {
    const firstOfMonth = week.find((day) => inRange(day) && day.endsWith("-01"));
    const label = firstOfMonth ?? (w === 0 ? week.find(inRange) : null);
    const show = label && (firstOfMonth || !weeks.slice(1, 3).some((wk) => wk.some((day) => inRange(day) && day.endsWith("-01"))));
    return div().w(cell).flex_none().text_size(11.5).text_color(t.muted).whitespace_nowrap().child(show ? monthShort(Number(label.slice(5, 7)) - 1) : "");
  }));
  const dayLabels = v_flex().w(LABEL_W).flex_none().gap(gap).children([tr("Mon"), "", tr("Wed"), "", tr("Fri"), "", ""].map((label) =>
    div().h(cell).flex().items_center().text_size(Math.min(11.5, cell + 3)).text_color(t.muted).child(label)));
  const grid = h_flex().gap(gap).children(weeks.map((week) => v_flex().gap(gap).children(week.map((day) => {
    if (!inRange(day)) return div().size(cell);
    const future = day > today;
    const value = future ? 0 : weightOf(day);
    return div().id(`tr-act-${day}`).size(cell).rounded(Math.max(1.5, cell / 5))
      .bg(future ? t.popover : shade(value))
      .when(future, (e) => e.border(1).border_color(t.raised))
      .when(day === today, (e) => e.border(1.5).border_color(t.foreground))
      .when(!future, (e) => e.tooltip(tooltipOf(day)));
  }))));
  return v_flex().gap(3).child(monthRow).child(h_flex().gap(4).child(dayLabels).child(grid));
}

/** Less ▢▢▢▢ More. */
export function shadeLegend(t) {
  return h_flex().gap(3).items_center().text_size(11.5).text_color(t.muted)
    .child(tr("Less"))
    .children([0, 0.25, 0.5, 0.75, 1].map((f) => div().size(9).rounded(2).bg(f ? alpha(COLOR.accent, 0.22 + 0.78 * Math.sqrt(f)) : t.raised)))
    .child(tr("More"));
}
