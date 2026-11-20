import { div, svg } from "gpui-kit";
import { Popover, h_flex } from "gpui-base";
import { sparkline } from "./charts.js";
import { COLOR, FONT } from "./style.js";

// Same grammar as the limit segments beside it: a small dim label, then the value.
const label = (text, t) => div().text_size(10.5).text_color(t.dim).whitespace_nowrap().child(text);

/** (logo) today $77.16 | 120M ▁▃▅ rank #3, or a short message before there are numbers. */
function tokenRank(b, t) {
  const content = h_flex().gap(5).items_center().flex_none()
    .child(svg("mods/bellwether/icons/logo.svg").size(15).text_color(b.accent ? COLOR.accent : t.muted).mr(2));
  if (b.today == null) return content.child(div().whitespace_nowrap().text_color(b.accent ? t.foreground : t.muted).child(b.label));
  content.child(label("today", t)).child(div().whitespace_nowrap().text_color(t.foreground).child(b.today));
  if (b.todayTokens) {
    content.child(div().w(1).h(11).bg(t.border).flex_none())
      .child(div().whitespace_nowrap().text_color(t.foreground).child(b.todayTokens));
  }
  if (b.spark) content.child(div().ml(3).child(sparkline(b.spark, COLOR.accent, t)));
  if (b.rank) {
    content.child(label("rank", t).ml(7))
      .child(div().whitespace_nowrap().font_semibold().text_color(COLOR.accent).child(`#${b.rank}`));
  }
  return content;
}

/**
 * One block, one panel: the plan limits (drawn by the bundled usage-limits code)
 * and Token Rank's numbers side by side. A click opens the panel and it stays open
 * until a click outside or Escape: it holds tabs, buttons and a sign-in flow, which
 * a hover card would drop whenever the pointer strays.
 */
export function statusBar(b, t) {
  const trigger = h_flex().id("tr-trigger").gap(12).items_center().flex_none().px(6).py(2).rounded(5).cursor_pointer()
    .bg(b.open ? t.hover : t.chrome).hover((st) => st.bg(t.hover))
    .when(Boolean(b.limits), (e) => e.child(b.limits).child(div().w(1).h(14).bg(t.border).flex_none()))
    .child(tokenRank(b, t));
  return h_flex().id("root").size_full().px(12).items_center().justify_end().overflow_hidden().font_family(FONT)
    .bg(t.chrome).when(b.border !== false, (e) => e.border_t(1).border_color(t.border))
    .text_size(11.8).text_color(t.muted)
    .on_size_change(b.onResize)
    .child(Popover.new("tr-panel").anchor("bottom_right").open(Boolean(b.open))
      .on_open_change((open, cx) => b.onOpenChange(open, cx))
      .trigger(trigger)
      .content(b.panel));
}
