import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { PROVIDERS } from "../providers/index.js";
import { MOD } from "../lib/mod.js";

export const NO_READING = "—";
export const SESSION_TITLE = "This session";
export const DIMMED = 0.55;
export const LEFT_COLUMN_W = 48;
export const PERCENT_COLUMN_W = 36;
const ICON_SIZE = 13;

export const modIcon = (name) => `mods/${MOD}/icons/${name}.svg`;

const ONE_COLOR_GLYPHS = new Set(PROVIDERS.filter((p) => p.oneColorGlyph).map((p) => p.id));

export function providerIcon(id, path, color) {
  return ONE_COLOR_GLYPHS.has(id) ? svg(path).size(ICON_SIZE).text_color(color) : image(path).size(ICON_SIZE);
}

export function levelColor(level, t) {
  // Token Rank: the Token Rank palette (emerald, gold, crimson) instead of the terminal's ANSI colors.
  if (level === "hot") return "#C2263D";
  if (level === "warn") return "#C9962B";
  return "#0E8A6E";
}

export function sessionNumberColor(level, text, t) {
  if (level !== "ok") return levelColor(level, t);
  return text === NO_READING ? t.dim : t.foreground;
}

export const limitNumberColor = (level, text, t) => (text === NO_READING ? t.dim : levelColor(level, t));

// Token Rank: a segmented meter. Lit segments show the share used; the segment
// at the pace mark (how much of the window has passed) stands taller.
const SEGMENT_W = 3;
const SEGMENT_GAP = 1.5;

export function usageBar(width, fill, tick, color, t) {
  const count = Math.max(5, Math.round((width + SEGMENT_GAP) / (SEGMENT_W + SEGMENT_GAP)));
  const lit = fill > 0 ? Math.max(1, Math.round(fill * count)) : 0;
  const paceAt = tick == null ? null : Math.min(count - 1, Math.floor(tick * count));
  return h_flex().h(10).gap(SEGMENT_GAP).items_center().flex_none().children(Array.from({ length: count }, (_, i) =>
    div().w(SEGMENT_W).h(i === paceAt ? 10 : 6).rounded(1)
      .bg(i < lit ? color : t.border)
      .when(i === paceAt && i >= lit, (e) => e.bg(t.muted))));
}

export const divider = (t) => div().w(1).h(14).bg(t.border).flex_none();

export const rule = (t) => div().h(1).bg(t.border).flex_none();

export function iconButton({ id, icon, label, enabled, onClick }, t) {
  return div().id(id).size(24).rounded(5).flex().items_center().justify_center().tooltip(label)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(svg(modIcon(icon)).size(14).text_color(enabled ? t.muted : t.dim));
}

export function numberCell(width, text) {
  return div().w(width).flex_none().flex().justify_end().whitespace_nowrap().child(text);
}
