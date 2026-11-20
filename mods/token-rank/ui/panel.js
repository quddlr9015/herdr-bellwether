import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { rankingTab } from "./ranking.js";
import { overviewTab } from "./overview.js";
import { settingsTab } from "./settings.js";
import { COLOR, FONT, down, rule } from "./style.js";
import { usageTab } from "./usage.js";
import { formatAgo } from "../lib/format.js";

const PANEL_W = 420;
const TABS = [["overview", "Overview"], ["usage", "Usage"], ["ranking", "Ranking"], ["settings", "Settings"]];

function tabs(s, t) {
  return h_flex().gap(12).children(TABS.map(([value, label]) => {
    const on = value === s.tab;
    return v_flex().id(`tr-tab-${value}`).gap(4).cursor_pointer().on_click((_e, cx) => s.act.pickTab(value, cx))
      .child(div().text_color(on ? t.foreground : t.muted).when(on, (e) => e.font_semibold()).hover((st) => st.text_color(t.foreground)).child(label))
      .child(div().h(2).rounded_full().bg(on ? COLOR.accent : t.popover));
  }));
}

function iconButton(id, icon, tip, onClick, t) {
  return div().id(id).size(22).rounded(5).flex().items_center().justify_center().cursor_pointer().tooltip(tip)
    .hover((st) => st.bg(t.hover)).on_click((_e, cx) => onClick(cx))
    .child(svg(icon).size(13).text_color(t.muted));
}

function footer(s, t) {
  let status = s.scannedAt ? `Updated ${formatAgo(s.scannedAt)}` : "Not scanned yet";
  if (s.scanning) status = "Reading session logs…";
  if (s.scanError) status = `Scan failed: ${s.scanError}`;
  return h_flex().gap(8).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(s.scanError ? down(t) : t.dim).child(status))
    .child(iconButton("tr-refresh", "mods/token-rank/icons/refresh.svg", "Scan and refresh now", s.act.refresh, t))
    .when(s.tab === "overview", (e) => e.child(iconButton("tr-limits-settings", "mods/token-rank/limits/icons/gear.svg", "Plan limit settings", s.act.limitsSettings, t)));
}

export function rankPanel(s, t) {
  let body;
  if (s.tab === "overview") body = overviewTab(s, t);
  else if (s.tab === "ranking") body = rankingTab(s, t);
  else if (s.tab === "settings") body = settingsTab(s, t);
  else body = usageTab(s, t);
  return v_flex().id("tr-panel-body").w(PANEL_W).min_h(s.panelMinH).on_size_change((size, cx) => s.act.panelSize(size, cx)).p(12).gap(12).rounded(12).border(1).border_color(t.border).bg(t.popover).shadow_lg().font_family(FONT)
    .text_size(12).text_color(t.foreground)
    .child(h_flex().items_center().justify_between()
      .child(h_flex().gap(7).items_center()
        .child(svg("mods/token-rank/icons/logo.svg").size(22).text_color(COLOR.accent))
        .child(div().text_size(13).font_semibold().child("Bellwether")))
      .child(tabs(s, t)))
    .when(Boolean(s.notice), (e) => e.child(div().px(10).py(6).rounded(6).bg(t.raised).text_size(11).text_color(t.foreground).child(s.notice ?? "")))
    .child(body)
    .child(div().flex_1())
    .child(rule(t))
    .child(footer(s, t));
}
