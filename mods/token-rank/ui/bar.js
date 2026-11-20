import { div, svg } from "gpui-kit";
import { HoverCard, h_flex } from "gpui-base";
import { sparkline } from "./charts.js";
import { COLOR } from "./style.js";

const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 350;

/** [#rank] $today ▁▃▅ — or the trophy and a short message before there are numbers. */
function trigger(b, t) {
  const content = h_flex().id("tr-trigger").gap(7).items_center().flex_none().on_hover(b.onHover);
  if (b.rank) {
    content.child(div().px(6).py(1).rounded(5).bg(COLOR.violet).text_color(COLOR.white).text_size(11).font_semibold().child(`#${b.rank}`));
  } else {
    content.child(svg("mods/token-rank/icons/trophy.svg").size(13).text_color(b.accent ? COLOR.violet : t.muted));
  }
  content.child(div().whitespace_nowrap().text_color(b.accent ? t.foreground : t.muted).child(b.label));
  if (b.spark) content.child(sparkline(b.spark, COLOR.violet, t));
  return content;
}

export function statusBar(b, t) {
  return h_flex().id("root").size_full().px(12).items_center().justify_end().overflow_hidden()
    .bg(t.chrome).when(b.border !== false, (e) => e.border_t(1).border_color(t.border))
    .text_size(11.8)
    .child(HoverCard.new("tr-panel").anchor("bottom_right").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
      .trigger(trigger(b, t))
      .content(b.panel));
}
