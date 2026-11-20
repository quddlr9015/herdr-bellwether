import { div, svg } from "gpui-kit";
import { HoverCard, h_flex } from "gpui-base";

const OPEN_DELAY_MS = 250;
const CLOSE_DELAY_MS = 300;

export function statusBar({ label, accent, onHover, onResize, panel, border }, t) {
  const trigger = h_flex().id("tr-trigger").gap(6).items_center().flex_none().on_hover(onHover)
    .child(svg("mods/token-rank/icons/trophy.svg").size(13).text_color(accent ? t.foreground : t.muted))
    .child(div().whitespace_nowrap().text_color(accent ? t.foreground : t.muted).child(label));
  return h_flex().id("root").size_full().px(12).items_center().justify_end().overflow_hidden()
    .bg(t.chrome).when(border !== false, (e) => e.border_t(1).border_color(t.border))
    .text_size(11.8).on_size_change(onResize)
    .child(HoverCard.new("tr-panel").anchor("bottom_right").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
      .trigger(trigger)
      .content(panel));
}
