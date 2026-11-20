import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { formatAgo, formatMetric, formatTokens, formatUsd } from "../lib/format.js";

const PANEL_W = 360;
const LIST_H = 280;
const PERIODS = [["day", "Today"], ["week", "Week"], ["month", "Month"]];
const METRICS = [["cost", "Cost"], ["tokens", "Tokens"], ["commits", "Commits"]];

const rule = (t) => div().h(1).bg(t.border).flex_none();

function button(id, label, onClick, t, { primary = false, danger = false } = {}) {
  return div().id(id).px(10).py(5).rounded(5).cursor_pointer().whitespace_nowrap()
    .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : danger ? (t.ansi1 ?? t.blocked) : t.foreground)
    .hover((s) => s.opacity(0.85))
    .on_click((_e, cx) => onClick(cx))
    .child(label);
}

function tabs(id, options, selected, onPick, t) {
  return h_flex().gap(2).p(2).rounded(6).bg(t.raised).children(options.map(([value, label]) =>
    div().id(`${id}-${value}`).flex_1().flex().justify_center().py(3).rounded(4).cursor_pointer()
      .bg(value === selected ? t.selected : t.raised)
      .text_color(value === selected ? t.foreground : t.muted)
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => onPick(value, cx))
      .child(label)));
}

function signedOut(s, t) {
  return v_flex().gap(8)
    .child(div().text_color(t.muted).child("Rank your AI coding spend, tokens and commits against other Herdr users."))
    .child(div().text_size(11).text_color(t.dim).child(
      "Shares daily totals only: model names, token counts, an estimated cost and commit count. Never prompts, code, file or repository names."))
    .child(h_flex().child(button("tr-sign-in", "Sign in with GitHub", s.act.signIn, t, { primary: true })));
}

function signingIn(s, t) {
  const code = s.signIn.user_code;
  return v_flex().gap(8)
    .child(div().text_color(t.muted).child(code ? "Enter this code on GitHub. It is on your clipboard." : "Asking GitHub for a code…"))
    .when(Boolean(code), (e) => e.child(
      h_flex().gap(8).items_center()
        .child(div().text_size(20).font_semibold().text_color(t.foreground).child(code))
        .child(button("tr-open-github", "Open GitHub", s.act.openGitHub, t, { primary: true }))))
    .child(h_flex().child(button("tr-cancel", "Cancel", s.act.cancelSignIn, t)));
}

function standing(s, t) {
  const mine = s.mine;
  const rank = mine?.rank ? `#${mine.rank}` : "—";
  const of = s.board?.participants ? ` of ${s.board.participants}` : "";
  return h_flex().gap(10).items_center().p(10).rounded(6).bg(t.raised)
    .child(div().text_size(22).font_semibold().text_color(t.foreground).child(rank))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().text_color(t.foreground).child(`${s.login}${of}`))
      .child(div().text_size(11).text_color(t.dim).child(mine
        ? `${formatUsd(mine.cost_usd)} · ${formatTokens(mine.tokens)} tokens · ${mine.commits} commits`
        : "Loading…")));
}

function board(s, t) {
  const { board, metric, login } = s;
  if (s.boardError) return div().text_color(t.dim).child(s.boardError);
  if (!board) return div().text_color(t.dim).child("Loading…");
  if (!board.entries.length) return div().text_color(t.dim).child("No one on this board yet.");
  return v_flex().id("tr-list").h(LIST_H).overflow_y_scrollbar().children(board.entries.map((entry) =>
    h_flex().id(`tr-row-${entry.rank}`).gap(8).px(6).py(4).rounded(4).items_center()
      .when(entry.login === login, (e) => e.bg(t.selected))
      .child(div().w(28).flex_none().flex().justify_end().text_color(entry.rank <= 3 ? t.foreground : t.dim).child(`${entry.rank}`))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(entry.login))
      .child(div().flex_none().whitespace_nowrap().text_color(t.muted).child(formatMetric(metric, entry)))));
}

function footer(s, t) {
  const status = s.scanError ? `Scan failed: ${s.scanError}` : s.scanning ? "Reading session logs…" : s.scannedAt ? `Updated ${formatAgo(s.scannedAt)}` : "Not scanned yet";
  return h_flex().gap(8).items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(s.scanError ? (t.ansi1 ?? t.blocked) : t.dim).child(status))
    .child(div().id("tr-refresh").size(22).rounded(5).flex().items_center().justify_center().cursor_pointer().tooltip("Scan and refresh now")
      .hover((st) => st.bg(t.hover)).on_click((_e, cx) => s.act.refresh(cx))
      .child(svg("mods/token-rank/icons/refresh.svg").size(13).text_color(t.muted)))
    .when(Boolean(s.login), (e) => e
      .child(div().id("tr-sign-out").text_size(11).text_color(t.dim).cursor_pointer().hover((st) => st.text_color(t.foreground))
        .on_click((_e, cx) => s.act.signOut(cx)).child("Sign out"))
      .child(div().id("tr-delete").text_size(11).text_color(s.confirmDelete ? (t.ansi1 ?? t.blocked) : t.dim).cursor_pointer()
        .hover((st) => st.text_color(t.ansi1 ?? t.blocked))
        .on_click((_e, cx) => s.act.deleteData(cx)).child(s.confirmDelete ? "Click again to delete" : "Delete my data")));
}

export function rankPanel(s, t) {
  let account;
  if (s.signIn) account = signingIn(s, t);
  else if (s.login) account = standing(s, t);
  else account = signedOut(s, t);
  return v_flex().id("tr-panel-body").w(PANEL_W).p(12).gap(10).rounded(8).border(1).border_color(t.border).bg(t.popover).shadow_lg()
    .text_size(12).text_color(t.foreground)
    .child(h_flex().items_center().justify_between()
      .child(div().font_semibold().child("Token Rank"))
      .child(div().text_size(11).text_color(t.dim).child("UTC days")))
    .child(tabs("tr-period", PERIODS, s.period, s.act.pickPeriod, t))
    .child(tabs("tr-metric", METRICS, s.metric, s.act.pickMetric, t))
    .when(Boolean(s.notice), (e) => e.child(div().text_size(11).text_color(t.ansi3 ?? t.done).child(s.notice ?? "")))
    .child(account)
    .child(rule(t))
    .child(board(s, t))
    .child(rule(t))
    .child(footer(s, t));
}
