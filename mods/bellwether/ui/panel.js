import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { rankingTab } from "./ranking.js";
import { overviewTab } from "./overview.js";
import { settingsTab } from "./settings.js";
import { COLOR, FONT, down, iconButton, rule } from "./style.js";
import { usageTab } from "./usage.js";
import { formatAgo } from "../lib/format.js";

const PANEL_W = 420;
const ICONS = "mods/bellwether/icons";
const TABS = [
  ["overview", "Overview", "layout-dashboard"],
  ["usage", "Usage", "chart-column"],
  ["ranking", "Ranking", "trophy"],
  ["settings", "Settings", "settings"],
];

/** Four equal tabs under the header, icon and label, the chosen one inked and underlined. */
function tabs(s, t) {
  return h_flex().children(TABS.map(([value, label, icon]) => {
    const on = value === s.tab;
    const ink = on ? t.foreground : t.muted;
    return v_flex().id(`tr-tab-${value}`).flex_1().cursor_pointer().on_click((_e, cx) => s.act.pickTab(value, cx))
      .child(h_flex().h(30).gap(6).items_center().justify_center().rounded(6).hover((st) => st.bg(t.hover))
        .child(svg(`${ICONS}/${icon}.svg`).size(14).text_color(ink))
        .child(div().text_color(ink).when(on, (e) => e.font_semibold()).child(label)))
      .child(div().h(2).mx(10).rounded_full().bg(on ? t.foreground : t.popover));
  }));
}

function footer(s, t) {
  let status = s.scannedAt ? `Updated ${formatAgo(s.scannedAt)}` : "Not scanned yet";
  if (s.scanning) status = "Reading session logs…";
  if (s.scanError) status = `Scan failed: ${s.scanError}`;
  return h_flex().gap(8).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(s.scanError ? down(t) : t.muted).child(status))
    .child(iconButton("tr-refresh", "mods/bellwether/icons/refresh.svg", "Scan and refresh now", s.act.refresh, t))
    .when(s.tab === "overview", (e) => e.child(iconButton("tr-limits-settings", "mods/bellwether/limits/icons/gear.svg", "Plan limit settings", s.act.limitsSettings, t)));
}

export function rankPanel(s, t) {
  let body;
  if (s.tab === "overview") body = overviewTab(s, t);
  else if (s.tab === "ranking") body = rankingTab(s, t);
  else if (s.tab === "settings") body = settingsTab(s, t);
  else body = usageTab(s, t);
  return v_flex().id("tr-panel-body").w(PANEL_W).min_h(s.panelMinH).on_size_change((size, cx) => s.act.panelSize(size, cx)).p(14).gap(14).rounded(12).border(1).border_color(t.border).bg(t.popover).shadow_lg().font_family(FONT)
    .text_size(12).text_color(t.foreground)
    .child(v_flex().gap(6)
      .child(h_flex().gap(8).items_center()
        .child(svg("mods/bellwether/icons/logo.svg").size(22).text_color(COLOR.accent))
        .child(div().text_size(14).font_semibold().child("Bellwether"))
        .child(div().flex_1())
        .child(div().text_size(11.5).text_color(t.muted).child(`v${s.version}`)))
      .child(v_flex().child(tabs(s, t)).child(rule(t))))
    .when(Boolean(s.notice), (e) => e.child(div().px(10).py(6).rounded(6).bg(t.raised).text_size(11.5).text_color(t.foreground).child(s.notice ?? "")))
    .child(body)
    .child(div().flex_1())
    .child(rule(t))
    .child(footer(s, t));
}
