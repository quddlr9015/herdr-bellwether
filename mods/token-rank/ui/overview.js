import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { COLOR, caption, rule } from "./style.js";
import { periodRange, todayUtc } from "../lib/dates.js";
import { formatTokens, formatUsd } from "../lib/format.js";
import { sumRange } from "../lib/stats.js";

function card(id, title, value, detail, t, { accent = false, onClick = null } = {}) {
  return v_flex().id(id).flex_1().min_w(0).gap(3).p(10).rounded(8).bg(t.raised)
    .when(Boolean(onClick), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(caption(title, t))
    .child(div().text_size(17).font_semibold().text_color(accent ? COLOR.violet : t.foreground).child(value))
    .child(div().text_size(10.5).truncate().text_color(t.dim).child(detail));
}

/** Plan limits on top, then today's and this week's spend and the weekly rank. */
export function overviewTab(s, t) {
  const today = todayUtc();
  const week = periodRange("week", today);
  const spent = (from) => {
    const total = sumRange(s.days, from, today);
    return s.priced ? [formatUsd(total.cost), `${formatTokens(total.tokens)} tokens`] : [formatTokens(total.tokens), "tokens"];
  };
  const [todayValue, todayDetail] = spent(today);
  const [weekValue, weekDetail] = spent(week.from);
  const rank = s.weekStanding?.rank;
  let rankCard;
  if (!s.login) rankCard = card("tr-ov-rank", "Rank", "Join", "Sign in to rank", t, { accent: true, onClick: (cx) => s.act.pickTab("ranking", cx) });
  else rankCard = card("tr-ov-rank", "Rank · week", rank ? `#${rank}` : "—", rank ? "See leaderboard" : "No usage yet", t, { accent: true, onClick: (cx) => s.act.pickTab("ranking", cx) });

  return v_flex().gap(12)
    .child(s.limitsPanel ?? div().text_color(t.dim).child("Reading plan limits…"))
    .child(rule(t))
    .child(s.scanned
      ? h_flex().gap(8)
        .child(card("tr-ov-today", "Today", todayValue, todayDetail, t, { onClick: (cx) => s.act.pickTab("usage", cx) }))
        .child(card("tr-ov-week", "This week", weekValue, weekDetail, t, { onClick: (cx) => s.act.pickTab("usage", cx) }))
        .child(rankCard)
      : div().text_color(t.dim).child("Reading your session logs…"));
}
