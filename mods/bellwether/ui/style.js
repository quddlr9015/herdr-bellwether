import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

// Instrument Sans (OFL) ships in this mod's fonts/ folder, which Herdr loads at start.
export const FONT = "Instrument Sans";

// Jewel tones that read on light and dark Herdr themes alike.
export const COLOR = {
  accent: "#1E8E5A",
  clay: "#C15F3C",
  plum: "#A43F86",
  indigo: "#3E4FA8",
  rust: "#9A4A21",
  slate: "#5B6676",
  gold: "#C9962B",
  silver: "#8A94A6",
  bronze: "#A8693A",
  white: "#FFFFFF",
  // Brighter pair for the Claude / Codex split in charts and model bars.
  coral: "#F2774B",
  blue: "#4C6FFF",
};

export const FAMILY = {
  claude: { label: "Claude", color: COLOR.coral },
  codex: { label: "Codex", color: COLOR.blue },
};

const MEDALS = [COLOR.gold, COLOR.silver, COLOR.bronze];
// Label ink on each medal: dark on gold and silver, white on bronze (all 4.4:1 or more).
const MEDAL_INK = ["#1B1B1E", "#1B1B1E", COLOR.white];
const AVATAR_COLORS = [COLOR.accent, COLOR.clay, COLOR.plum, COLOR.indigo, COLOR.rust, COLOR.slate];

/** `#rrggbb` with an opacity from 0 to 1. */
export const alpha = (hex, opacity) => hex + Math.round(opacity * 255).toString(16).padStart(2, "0");

export const down = (t) => t.ansi1 ?? t.blocked;

const luminance = (hex) => {
  const c = [1, 3, 5].map((i) => Number.parseInt(String(hex).slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** Green for text: deeper on light themes, lighter on dark ones, 5:1 or more on either. */
export const accentInk = (t) => (luminance(t.popover ?? "#ffffff") < 0.3 ? "#3FBF86" : "#17794C");

/** A section heading: the foreground in semibold, small. */
export const caption = (text, t) => div().text_size(12).font_semibold().text_color(t.foreground).child(text);

export const rule = (t) => div().h(1).bg(t.border).flex_none();

export function dot(color, size = 7) {
  return div().size(size).rounded_full().bg(color).flex_none();
}

export const vrule = (t, h = 32) => div().w(1).h(h).bg(t.border).flex_none();

/** A segmented control: a sunken track, the chosen option raised on a card with an edge. */
export function segmented(id, options, selected, onPick, t) {
  return h_flex().gap(2).p(2).rounded(8).bg(t.raised).border(1).border_color(t.border).children(options.map(([value, label]) => {
    const on = value === selected;
    return div().id(`${id}-${value}`).h(22).px(9).rounded(6).flex().items_center().cursor_pointer().whitespace_nowrap()
      .border(1).border_color(on ? t.border : t.raised)
      .bg(on ? t.popover : t.raised).text_color(on ? t.foreground : t.muted).when(on, (e) => e.font_semibold().shadow_sm())
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => onPick(value, cx))
      .child(label);
  }));
}

/**
 * Buttons in three weights, all 28px tall with a 7px corner:
 * primary is the theme's ink (`solid`), the default has an edge, `quiet` is text
 * that shows a surface on hover. `danger` reds the label; `icon` leads it.
 */
export function button(id, label, onClick, t, { primary = false, danger = false, quiet = false, icon = null } = {}) {
  // A theme without `solid` falls back to foreground ink on the popover's color, which reads in light and dark.
  const ink = primary ? (t.solid ? t.solid_foreground ?? t.popover : t.popover) : danger ? down(t) : t.foreground;
  return h_flex().id(id).h(28).px(quiet ? 8 : 12).gap(6).items_center().rounded(7).cursor_pointer().whitespace_nowrap().font_semibold()
    .when(primary, (e) => e.bg(t.solid ?? t.foreground).hover((s) => s.opacity(0.9)))
    .when(!primary && !quiet, (e) => e.bg(t.popover).border(1).border_color(t.border).shadow_sm().hover((s) => s.bg(t.hover)))
    .when(quiet, (e) => e.hover((s) => s.bg(t.hover)))
    .text_color(ink)
    .on_click((_e, cx) => onClick(cx))
    .when(Boolean(icon), (e) => e.child(svg(icon).size(14).text_color(ink)))
    .child(label);
}

/** A 26px square that shows a surface on hover, with a tooltip. */
export function iconButton(id, icon, tip, onClick, t) {
  return div().id(id).size(26).rounded(7).flex().items_center().justify_center().cursor_pointer().tooltip(tip)
    .hover((st) => st.bg(t.hover)).on_click((_e, cx) => onClick(cx))
    .child(svg(icon).size(14).text_color(t.muted));
}

/**
 * A number with its label above and a line under it, unboxed: rows of these are
 * split by `vrule`s instead of sitting in cards.
 */
export function figure(id, label, value, detail, t, { size = 20, color = null, onClick = null } = {}) {
  return v_flex().id(id).flex_1().min_w(0).gap(2).px(2).py(2).rounded(6)
    .when(Boolean(onClick), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(div().text_size(11.5).text_color(t.muted).child(label))
    .child(div().text_size(size).font_semibold().text_color(color ?? t.foreground).whitespace_nowrap().child(value))
    .when(detail != null, (e) => e.child(div().text_size(11.5).truncate().text_color(t.muted).child(detail)));
}

/**
 * GitHub's own sign-in button: the mark in white on GitHub's dark gray, the same
 * on light and dark themes (a faint edge keeps it from melting into dark ones).
 */
export function githubButton(id, label, onClick) {
  return h_flex().id(id).h(28).gap(7).items_center().px(12).rounded(7).cursor_pointer().whitespace_nowrap().font_semibold()
    .bg("#24292F").text_color(COLOR.white).border(1).border_color("#FFFFFF1F")
    .hover((s) => s.bg("#32383F"))
    .on_click((_e, cx) => onClick(cx))
    .child(svg("mods/bellwether/icons/github.svg").size(15).text_color(COLOR.white))
    .child(label);
}

export function toggle(id, on, onFlip, t) {
  return div().id(id).relative().w(30).h(18).rounded_full().cursor_pointer().flex_none()
    .bg(on ? COLOR.accent : t.border)
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
  if (!medal) return div().w(22).flex_none().flex().justify_center().text_color(t.muted).child(`${rank}`);
  return div().size(22).flex_none().rounded_full().flex().items_center().justify_center()
    .bg(medal).text_color(MEDAL_INK[rank - 1]).text_size(11.5).font_semibold().child(`${rank}`);
}

/** ▲ climbed, ▼ fell, NEW was not ranked in the previous period. */
export function rankChange(rank, previous, t) {
  const cell = div().w(34).flex_none().flex().justify_end().text_size(11.5).font_semibold();
  if (previous == null) {
    return cell.child(div().px(4).rounded(4).bg(alpha(COLOR.accent, 0.14)).text_color(accentInk(t)).child("NEW"));
  }
  if (previous > rank) return cell.text_color(accentInk(t)).child(`▲${previous - rank}`);
  if (previous < rank) return cell.text_color(down(t)).child(`▼${rank - previous}`);
  return cell.text_color(t.muted).child("–");
}
