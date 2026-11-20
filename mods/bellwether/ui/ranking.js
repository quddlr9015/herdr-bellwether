import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { barChart } from "./charts.js";
import { COLOR, FAMILY, avatar, button, caption, dot, githubButton, rankBadge, rankChange, rule, segmented } from "./style.js";
import { shortDay } from "../lib/dates.js";
import { commits, formatTokens, formatUsd } from "../lib/format.js";

const PERIODS = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
// Ranked by tokens, with the estimated cost shown beside them. A commit belongs to
// no one model, so the Claude and Codex boards have tokens only and no switch.
const METRICS = [["tokens", "Tokens"], ["commits", "Commits"]];
const LIST_H = 236;
// Rows the list shows before it scrolls; a rank below them gets its own row under the list.
const VISIBLE_ROWS = 7;

const familyLabel = (family, t) => (family === "all" ? "All" : h_flex().gap(5).items_center()
  .child(dot(FAMILY[family].color, 6)).child(FAMILY[family].label));

function navButton(id, label, enabled, onClick, t) {
  return div().id(id).size(22).rounded(5).flex().items_center().justify_center()
    .text_color(enabled ? t.foreground : t.border)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(label);
}

function controls(s, t) {
  const families = ["all", "claude", "codex"].map((family) => [family, familyLabel(family, t)]);
  return v_flex().gap(8)
    .child(h_flex().justify_between()
      .child(segmented("tr-family", families, s.family, s.act.pickFamily, t))
      .child(segmented("tr-period", PERIODS, s.period, s.act.pickPeriod, t)))
    .child(h_flex().items_center().gap(4)
      .child(navButton("tr-prev", "‹", s.offset < 12, (cx) => s.act.shift(1, cx), t))
      .child(div().font_semibold().text_color(t.foreground).whitespace_nowrap().child(s.periodText))
      .child(navButton("tr-next", "›", s.offset > 0, (cx) => s.act.shift(-1, cx), t))
      .child(div().ml(4).text_size(11).text_color(t.dim).whitespace_nowrap().child(s.board ? `${s.board.participants} ranked` : ""))
      .child(div().flex_1())
      .when(s.family === "all", (e) => e.child(segmented("tr-metric", METRICS, s.metric, s.act.pickMetric, t))));
}

function standingCard(s, t) {
  const mine = s.mine;
  const rank = mine?.rank;
  const hidden = s.settings && !s.settings.listed;
  return h_flex().gap(12).items_center()
    .child(avatar(s.login, s.avatarPath(s.login), 34))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().font_semibold().text_color(t.foreground).child(s.login))
      .child(div().text_size(11).text_color(t.muted).child(mine
        ? `${formatTokens(mine.tokens)} tokens, ${formatUsd(mine.cost_usd)}, ${commits(mine.commits)}`
        : "Loading…")))
    .child(v_flex().items_end()
      .child(div().text_size(22).font_semibold().text_color(t.foreground).child(rank ? `#${rank}` : "—"))
      .child(div().text_size(10.5).text_color(t.dim).child(hidden ? "hidden" : rank ? `of ${Math.max(s.board?.participants ?? 0, rank)}` : "no usage")));
}

function joinCard(s, t) {
  const code = s.signIn?.user_code;
  if (s.signIn) {
    return v_flex().gap(8)
      .child(div().text_color(t.muted).child(code ? "Enter this code on GitHub. It is on your clipboard." : "Asking GitHub for a code…"))
      .when(Boolean(code), (e) => e.child(h_flex().gap(10).items_center()
        .child(div().px(10).py(4).rounded(6).border(1).border_color(t.border).text_size(20).font_semibold().text_color(t.foreground).child(code))
        .child(githubButton("tr-open-github", "Open GitHub", s.act.openGitHub))
        .child(button("tr-cancel", "Cancel", s.act.cancelSignIn, t))));
  }
  return h_flex().gap(12).items_center()
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().font_semibold().text_color(t.foreground).child("Join the leaderboard"))
      .child(div().text_size(11).text_color(t.muted).child("Totals only. No prompts or code.")))
    .child(div().flex_none().child(githubButton("tr-sign-in", "Sign in with GitHub", s.act.signIn)));
}

/**
 * Two columns at the right: the cost (or, on the commits board, the tokens), then
 * the ranked number in bold. Same size, so the cost reads at a glance too.
 */
function value(metric, entry, t) {
  const ranked = metric === "commits" ? `${entry.commits ?? 0}` : formatTokens(entry.tokens ?? 0);
  const other = metric === "commits" ? formatTokens(entry.tokens ?? 0) : formatUsd(entry.cost_usd ?? 0);
  return h_flex().flex_none().items_center()
    .child(div().w(66).flex().justify_end().whitespace_nowrap().text_color(t.muted).child(other))
    .child(div().w(58).flex().justify_end().whitespace_nowrap().font_semibold().text_color(t.foreground).child(ranked));
}

function row(entry, s, t, { pinned = false } = {}) {
  const mine = entry.login === s.login;
  return h_flex().id(`tr-row-${pinned ? "me" : entry.rank}`).gap(9).px(8).py(5).rounded(7).items_center().cursor_pointer()
    .when(mine, (e) => e.bg(t.raised))
    .hover((st) => st.bg(t.hover))
    .on_click((_e, cx) => s.act.openProfile(entry.login, cx))
    .child(rankBadge(entry.rank, t))
    .child(avatar(entry.login, s.avatarPath(entry.login), 22))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).when(mine, (e) => e.font_semibold()).child(entry.login))
    .when(!pinned, (e) => e.child(rankChange(entry.rank, entry.previous_rank, t)))
    .child(value(s.metric, entry, t));
}

function list(s, t) {
  const { board } = s;
  if (s.boardError) return div().py(20).text_color(t.dim).child(s.boardError);
  if (!board) return div().py(20).text_color(t.dim).child("Loading…");
  if (!board.entries.length) {
    return v_flex().py(28).gap(4).items_center()
      .child(div().font_semibold().text_color(t.foreground).child("No one here yet"))
      .child(div().text_size(11).text_color(t.dim).child("Be the first on this board."));
  }
  // My row under the list whenever the list would not show it without scrolling.
  const place = board.entries.findIndex((entry) => entry.login === s.login);
  const pinned = s.login && s.mine?.rank && (place === -1 || place >= VISIBLE_ROWS) && !(s.settings && !s.settings.listed);
  return v_flex().gap(4)
    .child(v_flex().id("tr-list").h(LIST_H).overflow_y_scrollbar().children(board.entries.map((entry) => row(entry, s, t))))
    .when(Boolean(pinned), (e) => e.child(div().h(1).bg(t.border)).child(row({
      rank: s.mine?.rank, login: s.login, cost_usd: s.mine?.cost_usd, tokens: s.mine?.tokens, commits: s.mine?.commits,
    }, s, t, { pinned: true })));
}

function profileView(s, t) {
  const data = s.profile?.data;
  const header = h_flex().items_center().gap(6)
    .child(div().id("tr-back").px(6).py(3).rounded(5).cursor_pointer().text_color(t.muted).hover((st) => st.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => s.act.closeProfile(cx)).child("‹ Leaderboard"));
  if (s.profile?.error) return v_flex().gap(10).child(header).child(div().py(20).text_color(t.dim).child(s.profile.error));
  if (!data) return v_flex().gap(10).child(header).child(div().py(20).text_color(t.dim).child("Loading…"));
  const stat = (label, value) => v_flex().flex_1().gap(3).p(10).rounded(8).bg(t.raised)
    .child(caption(label, t))
    .child(div().text_size(17).font_semibold().text_color(t.foreground).child(`${formatTokens(value.tokens)} tokens`))
    .child(div().text_size(10.5).text_color(t.dim).child(`${formatUsd(value.cost_usd)}, ${commits(value.commits)}`));
  return v_flex().gap(12)
    .child(header)
    .child(h_flex().gap(12).items_center()
      .child(avatar(data.login, s.avatarPath(data.login), 40))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).truncate().child(data.login))
        .child(div().text_size(11).text_color(t.dim).child(`Ranking since ${shortDay(data.joined)}`)))
      .child(button("tr-github", "GitHub", (cx) => s.act.openGitHubProfile(data.login, cx), t)))
    .child(h_flex().gap(8).child(stat("This week", data.week)).child(stat("This month", data.month)))
    .child(v_flex().gap(8)
      .child(caption("Last 30 days", t))
      .child(barChart("tr-profile-days", data.days, {
        width: 396,
        height: 64,
        segments: (d) => [{ value: d.tokens, color: COLOR.accent }],
        tooltip: (d) => `${shortDay(d.day)}: ${formatTokens(d.tokens)} tokens, ${formatUsd(d.cost_usd)}, ${commits(d.commits)}`,
      }, t)));
}

export function rankingTab(s, t) {
  if (s.viewing) return profileView(s, t);
  return v_flex().gap(12)
    .child(s.login ? standingCard(s, t) : joinCard(s, t))
    .child(rule(t))
    .child(controls(s, t))
    .child(list(s, t));
}
