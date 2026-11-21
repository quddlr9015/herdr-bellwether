import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { activityGrid, shadeLegend } from "./charts.js";
import { CONTENT_W, accentInk, caption, segmented } from "./style.js";
import { addDays, anchorDay, monthLabel, periodRange, shortDay, todayUtc } from "../lib/dates.js";
import { commits, formatTokens, formatUsd } from "../lib/format.js";
import { dayOf, streaks, sumRange } from "../lib/stats.js";
import { tr } from "../lib/locale.js";

function navButton(id, label, enabled, onClick, t) {
  return div().id(id).size(24).rounded(6).flex().items_center().justify_center()
    .text_color(enabled ? t.foreground : t.border)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(label);
}

const VIEWS = () => [["weeks", tr("Weeks")], ["month", tr("Month")], ["year", tr("Year")]];
// Square sizes per view. The year fills the width: 53 week columns beside the day labels.
const YEAR_CELL = Math.floor(((CONTENT_W - 30 - 52) / 53) * 10) / 10;
const GRID = { weeks: { cell: 12, gap: 3 }, month: { cell: 16, gap: 3 }, year: { cell: YEAR_CELL, gap: 1 } };
const WEEKS = 12;

/** The days the chosen view covers, its title, and whether ‹ › can move. */
function activityRange(view, offset, first, today) {
  if (view === "year") {
    const year = Number(today.slice(0, 4)) - offset;
    return { from: `${year}-01-01`, to: `${year}-12-31`, title: `${year}`, older: `${year}` > first.slice(0, 4), paged: true };
  }
  if (view === "month") {
    const month = periodRange("month", anchorDay("month", offset));
    return { ...month, title: monthLabel(month.from), older: month.from > first, paged: true };
  }
  const week = periodRange("week", today);
  return { from: addDays(week.from, -7 * (WEEKS - 1)), to: week.to, title: tr("Last {n} weeks", { n: WEEKS }), older: false, paged: false };
}

/**
 * The green squares, for the last 16 weeks, a month or a calendar year, with ‹ ›
 * to page back; under them the range's total, best day and daily average, and
 * the current and longest streaks.
 */
/** One line of the summary: a muted label, the value semibold, an optional muted note. */
function stat(label, value, note, t, color = null) {
  return h_flex().flex_1().min_w(0).gap(6).items_center()
    .child(div().text_size(11.5).text_color(t.muted).whitespace_nowrap().child(label))
    .child(div().font_semibold().text_color(color ?? t.foreground).whitespace_nowrap().child(value))
    .when(Boolean(note), (e) => e.child(div().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(note ?? "")));
}

export function activitySection(s, t) {
  const { days } = s;
  const priced = Boolean(s.priced);
  const weightOf = (day) => (priced ? dayOf(days, day).cost : dayOf(days, day).tokens);
  const amount = (d) => (priced ? formatUsd(d.cost ?? 0) : tr("{n} tokens", { n: formatTokens(d.tokens) }));
  const today = todayUtc();
  const first = [...days.keys()].sort()[0] ?? today;
  const view = s.activityView;
  const range = activityRange(view, s.activityOffset, first, today);
  const tooltipOf = (day) => {
    const d = days.get(day);
    return d && d.tokens ? `${shortDay(day)}: ${amount(d)}, ${tr("{n} tokens", { n: formatTokens(d.tokens) })}, ${commits(d.commits)}` : `${shortDay(day)}: ${tr("no usage")}`;
  };
  const end = range.to < today ? range.to : today;
  const inRange = [...days.entries()].filter(([day, d]) => day >= range.from && day <= end && d.tokens > 0);
  const total = sumRange(days, range.from, end);
  const best = inRange.reduce((top, [day, d]) => (!top || (priced ? d.cost : d.tokens) > (priced ? top[1].cost : top[1].tokens) ? [day, d] : top), null);
  const perDay = inRange.length ? { cost: total.cost / inRange.length, tokens: total.tokens / inRange.length } : null;
  const runs = streaks(days);
  const daysText = (n) => (n === 1 ? tr("1 day") : tr("{n} days", { n }));
  const usedDays = (n) => (n === 1 ? tr("1 day with usage") : tr("{n} days with usage", { n }));

  const head = h_flex().items_center().gap(4)
    .child(caption(tr("Activity"), t))
    .child(div().w(6))
    .when(range.paged, (e) => e
      .child(navButton("tr-act-prev", "‹", range.older, (cx) => s.act.shiftActivity(1, cx), t))
      .child(div().font_semibold().text_color(t.foreground).whitespace_nowrap().child(range.title))
      .child(navButton("tr-act-next", "›", s.activityOffset > 0, (cx) => s.act.shiftActivity(-1, cx), t)))
    .when(!range.paged, (e) => e.child(div().text_color(t.muted).whitespace_nowrap().child(range.title)))
    .child(div().flex_1())
    .child(segmented("tr-activity", VIEWS(), view, s.act.pickActivity, t));

  return v_flex().gap(10)
    .child(head)
    .child(activityGrid(range.from, range.to, weightOf, tooltipOf, t, GRID[view] ?? GRID.weeks))
    .child(h_flex().justify_between().items_center()
      .child(div().text_size(11.5).text_color(t.muted).child(usedDays(inRange.length)))
      .child(shadeLegend(t)))
    .child(v_flex().gap(4)
      .child(h_flex().gap(16)
        .child(stat(tr("Total"), total.tokens ? amount(total) : "—", total.tokens ? tr("{n} tokens", { n: formatTokens(total.tokens) }) : null, t))
        .child(stat(tr("Best day"), best ? amount(best[1]) : "—", best ? shortDay(best[0]) : null, t)))
      .child(h_flex().gap(16)
        .child(stat(tr("Daily average"), perDay ? amount(perDay) : "—", null, t))
        .child(stat(tr("Streak"), daysText(runs.current.length), runs.longest.length ? tr("best {n}", { n: daysText(runs.longest.length) }) : null, t,
          runs.current.length ? accentInk(t) : null))));
}
