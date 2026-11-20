import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { barChart, familySegments, heatmap } from "./charts.js";
import { COLOR, FAMILY, caption, dot } from "./style.js";
import { addDays, periodRange, shortDay, todayUtc } from "../lib/dates.js";
import { commits, formatPercent, formatTokens, formatUsd } from "../lib/format.js";
import { dayOf, lastDays, streak, sumRange, topModels } from "../lib/stats.js";

const CHART_W = 396;

function statCard(label, total, priced, t) {
  const headline = priced ? formatUsd(total.cost) : formatTokens(total.tokens);
  return v_flex().flex_1().min_w(0).gap(3).p(10).rounded(8).bg(t.raised)
    .child(caption(label, t))
    .child(div().text_size(19).font_semibold().text_color(t.foreground).child(headline))
    .child(v_flex().text_size(10.5).text_color(t.dim)
      .child(div().truncate().child(priced ? `${formatTokens(total.tokens)} tokens` : "tokens"))
      .child(div().truncate().child(`${commits(total.commits)}`)));
}

/** A wide card: caption and since-date on the left, the total on the right. */
function totalCard(label, since, total, priced, t) {
  const headline = priced ? formatUsd(total.cost) : formatTokens(total.tokens);
  const detail = priced ? `${formatTokens(total.tokens)} tokens, ${commits(total.commits)}` : commits(total.commits);
  return h_flex().flex_1().min_w(0).gap(10).px(10).py(8).rounded(8).bg(t.raised).items_center()
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(caption(label, t))
      .child(div().text_size(10.5).truncate().text_color(t.dim).child(since)))
    .child(v_flex().items_end().gap(1)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(headline))
      .child(div().text_size(10.5).whitespace_nowrap().text_color(t.dim).child(detail)));
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
  const row = h_flex().gap(8);
  if (first < yearStart) row.child(totalCard(`${today.slice(0, 4)}`, "This year", sumRange(days, yearStart, today), priced, t));
  return row.child(totalCard("All time", `Since ${shortDay(first)}${first.slice(0, 4) === today.slice(0, 4) ? "" : `, ${first.slice(0, 4)}`}`, sumRange(days, first, today), priced, t));
}

function legend(t) {
  return h_flex().gap(10).text_size(10.5).text_color(t.muted).children(["claude", "codex"].map((family) =>
    h_flex().gap(4).items_center().child(dot(FAMILY[family].color)).child(FAMILY[family].label)));
}

function modelRow(model, priced, t) {
  const color = FAMILY[model.family]?.color ?? COLOR.slate;
  return v_flex().gap(4)
    .child(h_flex().gap(6).items_center()
      .child(dot(color))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(model.model))
      .child(div().text_color(t.muted).child(priced ? formatUsd(model.cost) : formatTokens(model.tokens)))
      .child(div().w(34).flex().justify_end().text_color(t.dim).child(formatPercent(model.share))))
    .child(div().h(4).rounded_full().bg(t.raised)
      .child(div().h(4).rounded_full().w(Math.max(4, Math.round(model.share * CHART_W))).bg(color)));
}

export function usageTab(s, t) {
  const { days } = s;
  const priced = Boolean(s.priced);
  const today = todayUtc();
  const week = periodRange("week", today);
  const month = periodRange("month", today);
  const recent = lastDays(days, 30);
  const models = topModels(days, addDays(today, -29), 4);
  const run = streak(days);
  const busiest = recent.reduce((best, d) => ((d.cost ?? d.tokens) > (best.cost ?? best.tokens) ? d : best), recent[0]);
  const weightOf = (day) => (priced ? dayOf(days, day).cost : dayOf(days, day).tokens);
  const amount = (d) => (priced ? formatUsd(d.cost ?? 0) : `${formatTokens(d.tokens)} tokens`);

  if (!s.scanned) {
    return v_flex().gap(6).py(24).items_center()
      .child(div().text_color(t.foreground).font_semibold().child("Reading your session logs…"))
      .child(div().text_size(11).text_color(t.dim).child("The first scan of a long history can take a few minutes."));
  }
  return v_flex().gap(14)
    .child(v_flex().gap(8)
      .child(h_flex().gap(8)
        .child(statCard("Today", sumRange(days, today, today), priced, t))
        .child(statCard("This week", sumRange(days, week.from, today), priced, t))
        .child(statCard("This month", sumRange(days, month.from, today), priced, t)))
      .when(days.size > 0, (e) => e.child(totals(days, today, priced, t))))
    .child(v_flex().gap(8)
      .child(h_flex().items_center().justify_between().child(caption("Last 30 days", t)).child(legend(t)))
      .child(barChart("tr-days", recent, {
        width: CHART_W,
        height: 64,
        segments: familySegments,
        tooltip: (d) => `${shortDay(d.day)} · ${amount(d)}`,
      }, t)))
    .when(models.length > 0, (e) => e.child(v_flex().gap(8)
      .child(caption("Top models, last 30 days", t))
      .children(models.map((m) => modelRow(m, priced, t)))))
    .child(v_flex().gap(8)
      .child(caption("Activity", t))
      .child(h_flex().gap(16).items_center()
        .child(heatmap(days, weightOf, t))
        .child(v_flex().gap(8)
          .child(v_flex().child(div().text_size(19).font_semibold().text_color(COLOR.accent).child(`${run}`))
            .child(div().text_size(10.5).text_color(t.dim).child("day streak")))
          .when(Boolean(busiest && (busiest.cost || busiest.tokens)), (e) => e.child(v_flex()
            .child(div().text_color(t.foreground).font_semibold().child(amount(busiest)))
            .child(div().text_size(10.5).text_color(t.dim).child(`busiest day, ${shortDay(busiest.day)}`)))))));
}
