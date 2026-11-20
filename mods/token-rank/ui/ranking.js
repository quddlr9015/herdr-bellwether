import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { barChart } from "./charts.js";
import { COLOR, alpha, avatar, button, caption, rankBadge, rankChange, segmented } from "./style.js";
import { shortDay } from "../lib/dates.js";
import { commits, formatMetric, formatTokens, formatUsd } from "../lib/format.js";

const PERIODS = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
const METRICS = [["cost", "Cost"], ["tokens", "Tokens"], ["commits", "Commits"]];
const LIST_H = 236;

function navButton(id, label, enabled, onClick, t) {
  return div().id(id).size(22).rounded(5).flex().items_center().justify_center()
    .text_color(enabled ? t.foreground : t.border)
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)))
    .child(label);
}

function controls(s, t) {
  return v_flex().gap(8)
    .child(h_flex().justify_between()
      .child(segmented("tr-period", PERIODS, s.period, s.act.pickPeriod, t))
      .child(segmented("tr-metric", METRICS, s.metric, s.act.pickMetric, t)))
    .child(h_flex().items_center().gap(4)
      .child(navButton("tr-prev", "‹", s.offset < 12, (cx) => s.act.shift(1, cx), t))
      .child(div().font_semibold().text_color(t.foreground).child(s.periodText))
      .child(navButton("tr-next", "›", s.offset > 0, (cx) => s.act.shift(-1, cx), t))
      .child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(s.board ? `${s.board.participants} ranked` : "")));
}

function standingCard(s, t) {
  const mine = s.mine;
  const rank = mine?.rank;
  const hidden = s.settings && !s.settings.listed;
  return h_flex().gap(12).items_center().p(12).rounded(10)
    .bg(alpha(COLOR.violet, 0.1)).border(1).border_color(alpha(COLOR.violet, 0.3))
    .child(avatar(s.login, s.avatarPath(s.login), 34))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().font_semibold().text_color(t.foreground).child(s.login))
      .child(div().text_size(11).text_color(t.muted).child(mine
        ? `${formatUsd(mine.cost_usd)} · ${formatTokens(mine.tokens)} tokens · ${commits(mine.commits)}`
        : "Loading…")))
    .child(v_flex().items_end()
      .child(div().text_size(22).font_semibold().text_color(COLOR.violet).child(rank ? `#${rank}` : "—"))
      .child(div().text_size(10.5).text_color(t.dim).child(hidden ? "hidden" : rank ? `of ${Math.max(s.board?.participants ?? 0, rank)}` : "no usage")));
}

function joinCard(s, t) {
  const code = s.signIn?.user_code;
  if (s.signIn) {
    return v_flex().gap(8).p(12).rounded(10).bg(alpha(COLOR.violet, 0.1)).border(1).border_color(alpha(COLOR.violet, 0.3))
      .child(div().text_color(t.muted).child(code ? "Enter this code on GitHub. It is on your clipboard." : "Asking GitHub for a code…"))
      .when(Boolean(code), (e) => e.child(h_flex().gap(10).items_center()
        .child(div().text_size(22).font_semibold().text_color(COLOR.violet).child(code))
        .child(button("tr-open-github", "Open GitHub", s.act.openGitHub, t, { primary: true }))
        .child(button("tr-cancel", "Cancel", s.act.cancelSignIn, t))));
  }
  return h_flex().gap(12).items_center().p(12).rounded(10).bg(alpha(COLOR.violet, 0.1)).border(1).border_color(alpha(COLOR.violet, 0.3))
    .child(v_flex().flex_1().gap(2)
      .child(div().font_semibold().text_color(t.foreground).child("Join the leaderboard"))
      .child(div().text_size(11).text_color(t.muted).child("Daily totals only. Never prompts, code or file names.")))
    .child(button("tr-sign-in", "Sign in with GitHub", s.act.signIn, t, { primary: true }));
}

function row(entry, s, t, { pinned = false } = {}) {
  const mine = entry.login === s.login;
  return h_flex().id(`tr-row-${pinned ? "me" : entry.rank}`).gap(9).px(8).py(5).rounded(7).items_center().cursor_pointer()
    .when(mine, (e) => e.bg(alpha(COLOR.violet, 0.12)))
    .hover((st) => st.bg(mine ? alpha(COLOR.violet, 0.18) : t.hover))
    .on_click((_e, cx) => s.act.openProfile(entry.login, cx))
    .child(rankBadge(entry.rank, t))
    .child(avatar(entry.login, s.avatarPath(entry.login), 22))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).when(mine, (e) => e.font_semibold()).child(entry.login))
    .when(!pinned, (e) => e.child(rankChange(entry.rank, entry.previous_rank, t)))
    .child(div().w(64).flex_none().flex().justify_end().font_semibold().text_color(t.foreground).child(formatMetric(s.metric, entry)));
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
  const listed = board.entries.some((entry) => entry.login === s.login);
  const pinned = s.login && !listed && s.mine?.rank && !(s.settings && !s.settings.listed);
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
    .child(div().text_size(17).font_semibold().text_color(t.foreground).child(formatUsd(value.cost_usd)))
    .child(div().text_size(10.5).text_color(t.dim).child(`${formatTokens(value.tokens)} tokens · ${commits(value.commits)}`));
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
        segments: (d) => [{ value: d.cost_usd, color: COLOR.violet }],
        tooltip: (d) => `${shortDay(d.day)} · ${formatUsd(d.cost_usd)} · ${commits(d.commits)}`,
      }, t)));
}

export function rankingTab(s, t) {
  if (s.viewing) return profileView(s, t);
  return v_flex().gap(12)
    .child(s.login ? standingCard(s, t) : joinCard(s, t))
    .child(controls(s, t))
    .child(list(s, t));
}
