import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";

// Jewel tones that read on light and dark Herdr themes alike.
export const COLOR = {
  violet: "#6E56CF",
  plum: "#A43F86",
  emerald: "#0E8A6E",
  indigo: "#3E4FA8",
  rust: "#9A4A21",
  slate: "#5B6676",
  gold: "#C9962B",
  silver: "#8A94A6",
  bronze: "#A8693A",
  white: "#FFFFFF",
};

export const FAMILY = {
  claude: { label: "Claude", color: COLOR.plum },
  codex: { label: "Codex", color: COLOR.emerald },
};

const MEDALS = [COLOR.gold, COLOR.silver, COLOR.bronze];
const AVATAR_COLORS = [COLOR.violet, COLOR.plum, COLOR.emerald, COLOR.indigo, COLOR.rust, COLOR.slate];

/** `#rrggbb` with an opacity from 0 to 1. */
export const alpha = (hex, opacity) => hex + Math.round(opacity * 255).toString(16).padStart(2, "0");

export const down = (t) => t.ansi1 ?? t.blocked;

export const caption = (text, t) => div().text_size(10.5).font_semibold().text_color(t.dim).child(text.toUpperCase());

export const rule = (t) => div().h(1).bg(t.border).flex_none();

export function dot(color, size = 7) {
  return div().size(size).rounded_full().bg(color).flex_none();
}

/** A pill-shaped segmented control. */
export function segmented(id, options, selected, onPick, t) {
  return h_flex().gap(2).p(2).rounded(7).bg(t.raised).children(options.map(([value, label]) => {
    const on = value === selected;
    return div().id(`${id}-${value}`).px(9).py(3).rounded(5).cursor_pointer().whitespace_nowrap()
      .bg(on ? t.popover : t.raised).text_color(on ? t.foreground : t.muted).when(on, (e) => e.font_semibold().shadow_sm())
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => onPick(value, cx))
      .child(label);
  }));
}

export function button(id, label, onClick, t, { primary = false, danger = false } = {}) {
  return div().id(id).px(11).py(5).rounded(6).cursor_pointer().whitespace_nowrap().font_semibold()
    .bg(primary ? COLOR.violet : t.raised)
    .text_color(primary ? COLOR.white : danger ? down(t) : t.foreground)
    .hover((s) => s.opacity(0.88))
    .on_click((_e, cx) => onClick(cx))
    .child(label);
}

export function toggle(id, on, onFlip, t) {
  return div().id(id).relative().w(30).h(18).rounded_full().cursor_pointer().flex_none()
    .bg(on ? COLOR.violet : t.border)
    .on_click((_e, cx) => onFlip(!on, cx))
    .child(div().absolute().top(2).left(on ? 14 : 2).size(14).rounded_full().bg(COLOR.white).shadow_sm());
}

/** A GitHub avatar once it is cached on disk, else the login's initial on a stable color. */
export function avatar(login, path, size) {
  if (path) return image(path).size(size).rounded_full().flex_none();
  const hash = [...login].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 997, 7);
  return div().size(size).rounded_full().flex_none().flex().items_center().justify_center()
    .bg(AVATAR_COLORS[hash % AVATAR_COLORS.length]).text_color(COLOR.white).text_size(size * 0.48).font_semibold()
    .child(login.slice(0, 1).toUpperCase());
}

export function rankBadge(rank, t) {
  const medal = MEDALS[rank - 1];
  if (!medal) return div().w(22).flex_none().flex().justify_center().text_color(t.dim).child(`${rank}`);
  return div().size(22).flex_none().rounded_full().flex().items_center().justify_center()
    .bg(medal).text_color(COLOR.white).text_size(11).font_semibold().child(`${rank}`);
}

/** ▲ climbed, ▼ fell, NEW was not ranked in the previous period. */
export function rankChange(rank, previous, t) {
  const cell = div().w(34).flex_none().flex().justify_end().text_size(10.5).font_semibold();
  if (previous == null) {
    return cell.child(div().px(4).rounded(4).bg(alpha(COLOR.violet, 0.14)).text_color(COLOR.violet).child("NEW"));
  }
  if (previous > rank) return cell.text_color(COLOR.emerald).child(`▲${previous - rank}`);
  if (previous < rank) return cell.text_color(down(t)).child(`▼${rank - previous}`);
  return cell.text_color(t.dim).child("–");
}
