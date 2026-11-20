import { div, svg } from "gpui-kit";
import { HoverCard, h_flex } from "gpui-base";
import { sparkline } from "./charts.js";
import { COLOR } from "./style.js";

const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 350;

// Same grammar as the limits segments beside it: a small dim label, then the value.
const label = (text, t) => div().text_size(10.5).text_color(t.dim).whitespace_nowrap().child(text);

/** 🏆 today $77.16 ▁▃▅ rank #3 — or a short message before there are numbers. */
function trigger(b, t) {
  const content = h_flex().id("tr-trigger").gap(5).items_center().flex_none().on_hover(b.onHover)
    .child(svg("mods/token-rank/icons/trophy.svg").size(13).text_color(b.accent ? COLOR.violet : t.muted).mr(3));
  if (b.today == null) return content.child(div().whitespace_nowrap().text_color(b.accent ? t.foreground : t.muted).child(b.label));
  content.child(label("today", t)).child(div().whitespace_nowrap().text_color(t.foreground).child(b.today));
  if (b.spark) content.child(div().ml(3).child(sparkline(b.spark, COLOR.violet, t)));
  if (b.rank) {
    content.child(label("rank", t).ml(7))
      .child(div().whitespace_nowrap().font_semibold().text_color(COLOR.violet).child(`#${b.rank}`));
  }
  return content;
}

/** Plan limits (the bundled usage-limits view, with its own hover panel) on the left, the rank on the right. */
export function statusBar(b, t) {
  return h_flex().id("root").size_full().pr(12).items_center().justify_end().overflow_hidden()
    .bg(t.chrome).when(b.border !== false, (e) => e.border_t(1).border_color(t.border))
    .text_size(11.8).when(!b.limits, (e) => e.pl(12))
    .when(Boolean(b.limits), (e) => e
      .child(div().flex_1().min_w(0).h_full().child(b.limits))
      .child(div().w(1).h(14).bg(t.border).flex_none().mr(12)))
    .child(HoverCard.new("tr-panel").anchor("bottom_right").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
      .trigger(trigger(b, t))
      .content(b.panel));
}
