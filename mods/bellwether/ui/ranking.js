import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { barChart } from "./charts.js";
import { COLOR, FAMILY, accentInk, alpha, avatar, button, caption, dot, figure, githubButton, rankBadge, rankChange, rule, segmented, vrule } from "./style.js";
import { shortDay } from "../lib/dates.js";
import { commits, formatTokens, formatUsd } from "../lib/format.js";

const PERIODS = [["day", "Day"], ["week", "Week"], ["month", "Month"]];
// Ranked by tokens, with the estimated cost shown beside them. A commit belongs to
// no one model, so the Claude and Codex boards have tokens only and no switch.
const METRICS = [["tokens", "Tokens"], ["commits", "Commits"]];
const LIST_H = 236;
const LIST_H_UNDER_PODIUM = 172;
// Rows the list shows before it scrolls; a rank below them gets its own row under the list.
const VISIBLE_ROWS = 7;
const MEDALS = [COLOR.gold, COLOR.silver, COLOR.bronze];
const PODIUM = [{ place: 1, avatar: 30, base: 18 }, { place: 0, avatar: 38, base: 28 }, { place: 2, avatar: 30, base: 12 }];

const rankedValue = (metric, entry) => (metric === "commits" ? entry.commits ?? 0 : entry.tokens ?? 0);
const formatRanked = (metric, value) => (metric === "commits" ? commits(value) : `${formatTokens(value)} tokens`);

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
      .child(div().ml(4).text_size(11.5).text_color(t.muted).whitespace_nowrap().child(s.board ? `${s.board.participants} ranked` : ""))
      .child(div().flex_1())
      .when(s.family === "all", (e) => e.child(segmented("tr-metric", METRICS, s.metric, s.act.pickMetric, t))));
}

/** How far the next place is, or the lead over the one below, from the shown board. */
function gapLine(s) {
  const rank = s.mine?.rank;
  const entries = s.board?.entries ?? [];
  if (!rank || !entries.length) return null;
  const mine = rankedValue(s.metric, s.mine);
  if (rank === 1) {
    const second = entries[1];
    return second ? `Ahead of #2 by ${formatRanked(s.metric, Math.max(0, mine - rankedValue(s.metric, second)))}` : "Leading the flock";
  }
  const above = entries.find((entry) => entry.rank === rank - 1);
  return above ? `${formatRanked(s.metric, Math.max(0, rankedValue(s.metric, above) - mine))} to #${rank - 1}` : null;
}

function standingCard(s, t) {
  const mine = s.mine;
  const rank = mine?.rank;
  const hidden = s.settings && !s.settings.listed;
  const gap = hidden ? null : gapLine(s);
  return h_flex().gap(12).items_center()
    .child(avatar(s.login, s.avatarPath(s.login), 38))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().truncate().font_semibold().text_color(t.foreground).child(s.login))
      .child(div().text_size(11.5).truncate().text_color(t.muted).child(mine
        ? `${formatTokens(mine.tokens)} tokens, ${formatUsd(mine.cost_usd)}, ${commits(mine.commits)}`
        : "Loading…"))
      .when(Boolean(gap), (e) => e.child(div().text_size(11.5).truncate().text_color(rank === 1 ? accentInk(t) : t.foreground).child(gap ?? ""))))
    .child(v_flex().items_end()
      .child(div().text_size(28).font_semibold().text_color(t.foreground).child(rank ? `#${rank}` : "—"))
      .child(div().text_size(11.5).text_color(t.muted).child(hidden ? "hidden" : rank ? `of ${Math.max(s.board?.participants ?? 0, rank)}` : "no usage")));
}

/** The top three on steps, first in the middle; a click opens a profile. */
function podium(s, t) {
  const entries = s.board.entries;
  return h_flex().gap(8).items_end().children(PODIUM.map(({ place, avatar: size, base }) => {
    const entry = entries[place];
    const medal = MEDALS[place];
    const mine = entry.login === s.login;
    return v_flex().id(`tr-podium-${place}`).flex_1().min_w(0).gap(4).items_center().cursor_pointer()
      .on_click((_e, cx) => s.act.openProfile(entry.login, cx))
      .child(div().p(2).rounded_full().bg(medal).child(avatar(entry.login, s.avatarPath(entry.login), size)))
      .child(div().max_w_full().truncate().text_color(t.foreground).when(mine, (e) => e.font_semibold()).child(entry.login))
      .child(div().font_semibold().text_color(t.foreground).whitespace_nowrap().child(s.metric === "commits" ? commits(entry.commits ?? 0) : formatTokens(entry.tokens ?? 0)))
      .child(div().text_size(11.5).text_color(t.muted).whitespace_nowrap().child(s.metric === "commits" ? formatTokens(entry.tokens ?? 0) : formatUsd(entry.cost_usd ?? 0)))
      .child(div().w_full().h(base).rounded_t(6).bg(alpha(medal, 0.22)).flex().items_center().justify_center()
        .text_size(11.5).font_semibold().text_color(t.foreground).child(`${place + 1}`));
  }));
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
      .child(div().text_size(11.5).text_color(t.muted).child("Totals only. No prompts or code.")))
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
  if (s.boardError) return div().py(20).text_color(t.muted).child(s.boardError);
  if (!board) return div().py(20).text_color(t.muted).child("Loading…");
  if (!board.entries.length) {
    return v_flex().py(28).gap(4).items_center()
      .child(div().font_semibold().text_color(t.foreground).child("No one here yet"))
      .child(div().text_size(11.5).text_color(t.muted).child("Be the first on this board."));
  }
  const stepped = board.entries.length >= 3;
  const rows = stepped ? board.entries.slice(3) : board.entries;
  // My row under the list whenever the list would not show it without scrolling.
  const place = board.entries.findIndex((entry) => entry.login === s.login);
  const shown = stepped ? 3 + Math.floor(LIST_H_UNDER_PODIUM / 34) : VISIBLE_ROWS;
  const pinned = s.login && s.mine?.rank && (place === -1 || place >= shown) && !(s.settings && !s.settings.listed);
  return v_flex().gap(4)
    .when(stepped, (e) => e.child(podium(s, t)).child(div().h(6)))
    .child(v_flex().id("tr-list").h(stepped ? LIST_H_UNDER_PODIUM : LIST_H).overflow_y_scrollbar().children(rows.map((entry) => row(entry, s, t))))
    .when(Boolean(pinned), (e) => e.child(div().h(1).bg(t.border)).child(row({
      rank: s.mine?.rank, login: s.login, cost_usd: s.mine?.cost_usd, tokens: s.mine?.tokens, commits: s.mine?.commits,
    }, s, t, { pinned: true })));
}

function profileView(s, t) {
  const data = s.profile?.data;
  const header = h_flex().items_center().gap(6)
    .child(button("tr-back", "‹ Leaderboard", s.act.closeProfile, t, { quiet: true }));
  if (s.profile?.error) return v_flex().gap(10).child(header).child(div().py(20).text_color(t.muted).child(s.profile.error));
  if (!data) return v_flex().gap(10).child(header).child(div().py(20).text_color(t.muted).child("Loading…"));
  const stat = (label, value) => figure(`tr-profile-${label}`, label, `${formatTokens(value.tokens)} tokens`, `${formatUsd(value.cost_usd)}, ${commits(value.commits)}`, t, { size: 18 });
  return v_flex().gap(12)
    .child(header)
    .child(h_flex().gap(12).items_center()
      .child(avatar(data.login, s.avatarPath(data.login), 40))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(15).font_semibold().text_color(t.foreground).truncate().child(data.login))
        .child(div().text_size(11.5).text_color(t.muted).child(`Ranking since ${shortDay(data.joined)}`)))
      .child(h_flex().gap(6)
        .child(button("tr-report-account", "Report", (cx) => s.act.reportAccount(data.login, cx), t, { quiet: true }))
        .child(button("tr-github", "GitHub", (cx) => s.act.openGitHubProfile(data.login, cx), t, { icon: "mods/bellwether/icons/arrow-up-right.svg" }))))
    .child(h_flex().gap(12).items_center().child(stat("This week", data.week)).child(vrule(t, 44)).child(stat("This month", data.month)))
    .child(v_flex().gap(8)
      .child(caption("Last 30 days", t))
      .child(barChart("tr-profile-days", data.days, {
        width: 390,
        height: 72,
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
