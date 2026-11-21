import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { COLOR, button, caption, down, rule } from "./style.js";
import { periodRange, todayUtc } from "../lib/dates.js";
import { formatTokens, formatUsd } from "../lib/format.js";
import { sumRange } from "../lib/stats.js";

/** A newer release, offered where the panel opens: one line, gone once it is installed. */
function updateLine(s, t) {
  const u = s.update;
  const text = u.error ? `Update failed: ${u.error}` : u.installing ? `Installing ${u.latest.version}…` : `Bellwether ${u.latest.version} is out`;
  return v_flex().gap(12)
    .child(h_flex().gap(10).items_center()
      .child(div().flex_1().min_w(0).truncate().text_color(u.error ? down(t) : t.foreground).child(text))
      .when(Boolean(u.latest.url), (e) => e.child(div().id("tr-ov-whats-new").text_size(11).text_color(t.muted).cursor_pointer()
        .hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act.openRelease(cx)).child("What's new")))
      .child(div().flex_none().child(button("tr-ov-update", u.installing ? "Installing…" : "Update", s.act.installUpdate, t, { primary: true }))))
    .child(rule(t));
}

function card(id, title, value, detail, t, { accent = false, onClick = null } = {}) {
  return v_flex().id(id).flex_1().min_w(0).gap(3).p(10).rounded(8).bg(t.raised)
    .when(Boolean(onClick), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(caption(title, t))
    .child(div().text_size(17).font_semibold().text_color(accent ? COLOR.accent : t.foreground).child(value))
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
  else rankCard = card("tr-ov-rank", "Rank this week", rank ? `#${rank}` : "—", rank ? "See leaderboard" : "No usage yet", t, { accent: true, onClick: (cx) => s.act.pickTab("ranking", cx) });

  return v_flex().gap(12)
    .when(Boolean(s.update?.available), (e) => e.child(updateLine(s, t)))
    .child(s.limitsPanel ?? div().text_color(t.dim).child("Reading plan limits…"))
    .child(rule(t))
    .child(h_flex().gap(8)
      .child(card("tr-ov-today", "Today", s.scanned ? todayValue : "—", s.scanned ? todayDetail : "Reading logs…", t, { onClick: (cx) => s.act.pickTab("usage", cx) }))
      .child(card("tr-ov-week", "This week", s.scanned ? weekValue : "—", s.scanned ? weekDetail : "Reading logs…", t, { onClick: (cx) => s.act.pickTab("usage", cx) }))
      .child(rankCard));
}
