import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { barChart, familySegments } from "./charts.js";
import { COLOR, FAMILY, caption, dot, figure, rule, vrule } from "./style.js";
import { addDays, periodRange, shortDay, todayUtc } from "../lib/dates.js";
import { commits, formatPercent, formatTokens, formatUsd } from "../lib/format.js";
import { lastDays, sumRange, topModels } from "../lib/stats.js";
import { tr } from "../lib/locale.js";

const CHART_W = 390;

const headline = (total, priced) => (priced ? formatUsd(total.cost) : formatTokens(total.tokens));
const tokensLine = (total, priced) => (priced ? tr("{n} tokens", { n: formatTokens(total.tokens) }) : tr("tokens"));

/** Today, this week and this month as three figures split by hairlines. */
function periods(days, today, week, month, priced, t) {
  const cell = (id, label, total) => figure(id, label, headline(total, priced), tokensLine(total, priced), t, { size: 22 });
  return h_flex().gap(12).items_center()
    .child(cell("tr-u-today", tr("Today"), sumRange(days, today, today)))
    .child(vrule(t, 44))
    .child(cell("tr-u-week", tr("This week"), sumRange(days, week.from, today)))
    .child(vrule(t, 44))
    .child(cell("tr-u-month", tr("This month"), sumRange(days, month.from, today)));
}

/** One line: what the total covers on the left, the amount and its tokens on the right. */
function totalLine(label, since, total, priced, t) {
  const detail = priced ? `${tr("{n} tokens", { n: formatTokens(total.tokens) })}, ${commits(total.commits)}` : commits(total.commits);
  return h_flex().gap(10).items_center()
    .child(v_flex().flex_1().min_w(0)
      .child(div().font_semibold().text_color(t.foreground).child(label))
      .child(div().text_size(11.5).truncate().text_color(t.muted).child(since)))
    .child(v_flex().items_end()
      .child(div().text_size(16).font_semibold().text_color(t.foreground).child(headline(total, priced)))
      .child(div().text_size(11.5).whitespace_nowrap().text_color(t.muted).child(detail)));
}

/**
 * All time, and this year once the history reaches into an earlier year (until
 * then the two are the same number). Local history only: it starts with the
 * oldest session log there was when Token Rank first scanned.
 */
function totals(days, today, priced, t) {
  const first = [...days.keys()].sort()[0];
  if (!first) return null;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const rows = v_flex().gap(10);
  if (first < yearStart) rows.child(totalLine(tr("This year"), today.slice(0, 4), sumRange(days, yearStart, today), priced, t));
  return rows.child(totalLine(tr("All time"), tr("Since {date}", { date: first.slice(0, 4) === today.slice(0, 4) ? shortDay(first) : tr("{date}, {year}", { date: shortDay(first), year: first.slice(0, 4) }) }), sumRange(days, first, today), priced, t));
}

function legend(t) {
  return h_flex().gap(10).text_size(11.5).text_color(t.muted).children(["claude", "codex"].map((family) =>
    h_flex().gap(4).items_center().child(dot(FAMILY[family].color)).child(FAMILY[family].label)));
}

function modelRow(model, priced, t) {
  const color = FAMILY[model.family]?.color ?? COLOR.slate;
  return v_flex().gap(4)
    .child(h_flex().gap(6).items_center()
      .child(dot(color))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(model.model))
      .child(div().text_color(t.muted).child(priced ? formatUsd(model.cost) : formatTokens(model.tokens)))
      .child(div().w(34).flex().justify_end().text_color(t.muted).child(formatPercent(model.share))))
    .child(div().h(6).rounded_full().bg(t.raised)
      .child(div().h(6).rounded_full().w(Math.max(6, Math.round(model.share * CHART_W))).bg(color)));
}

export function usageTab(s, t) {
  const { days } = s;
  const priced = Boolean(s.priced);
  const today = todayUtc();
  const week = periodRange("week", today);
  const month = periodRange("month", today);
  const recent = lastDays(days, 30);
  const models = topModels(days, addDays(today, -29), 4);
  const amount = (d) => (priced ? formatUsd(d.cost ?? 0) : tr("{n} tokens", { n: formatTokens(d.tokens) }));

  if (!s.scanned) {
    return v_flex().gap(6).py(24).items_center()
      .child(div().text_color(t.foreground).font_semibold().child(tr("Reading your session logs…")))
      .child(div().text_size(11.5).text_color(t.muted).child(tr("The first scan of a long history can take a few minutes.")));
  }
  const peak = recent.reduce((max, d) => Math.max(max, priced ? d.cost ?? 0 : d.tokens), 0);
  return v_flex().gap(16)
    .child(periods(days, today, week, month, priced, t))
    .when(days.size > 0, (e) => e.child(rule(t)).child(totals(days, today, priced, t)).child(rule(t)))
    .child(v_flex().gap(8)
      .child(h_flex().items_center().justify_between().child(caption(tr("Last 30 days"), t)).child(legend(t)))
      .child(v_flex().gap(4)
        .child(div().text_size(11.5).text_color(t.muted).child(tr("Peak {amount}", { amount: priced ? formatUsd(peak) : formatTokens(peak) })))
        .child(barChart("tr-days", recent, {
          width: CHART_W,
          height: 80,
          segments: familySegments,
          tooltip: (d) => `${shortDay(d.day)}: ${amount(d)}`,
        }, t))
        .child(h_flex().justify_between().text_size(11.5).text_color(t.muted)
          .child(shortDay(recent[0].day)).child(tr("Today")))))
    .when(models.length > 0, (e) => e.child(v_flex().gap(8)
      .child(caption(tr("Top models, last 30 days"), t))
      .children(models.map((m) => modelRow(m, priced, t)))));
}
