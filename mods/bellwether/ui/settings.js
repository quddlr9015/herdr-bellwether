import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { avatar, button, caption, down, githubButton, rule, toggle } from "./style.js";

function setting(id, title, detail, on, onFlip, t) {
  return h_flex().gap(12).items_center()
    .child(v_flex().flex_1().gap(2)
      .child(div().text_color(t.foreground).child(title))
      .child(div().text_size(11.5).text_color(t.muted).child(detail)))
    .child(toggle(id, on, onFlip, t));
}

/** Version, what GitHub has, and the one action that fits: update, or look again. */
function updateRow(s, t) {
  const u = s.update ?? {};
  let status = "Up to date";
  if (u.installing) status = `Installing ${u.latest?.version}…`;
  else if (u.checking) status = "Checking for updates…";
  else if (u.error) status = `Update check failed: ${u.error}`;
  else if (u.available) status = `Version ${u.latest.version} is out`;
  else if (!u.latest) status = "Not checked yet";
  const action = u.available
    ? button("tr-update", u.installing ? "Installing…" : `Update to ${u.latest.version}`, s.act.installUpdate, t, { primary: true })
    : button("tr-check-update", "Check for updates", s.act.checkUpdate, t);
  return h_flex().gap(12).items_center()
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_color(t.foreground).child(`Bellwether ${s.version}${s.herdrVersion ? `, Herdr ${s.herdrVersion}` : ""}`))
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11.5).truncate().text_color(u.error ? down(t) : t.muted).child(status))
        .when(Boolean(u.available && u.latest?.url), (e) => e.child(div().id("tr-release-notes").text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act.openRelease(cx)).child("What's new")))))
    .child(div().flex_none().child(action));
}

export function settingsTab(s, t) {
  const body = v_flex().gap(14);
  if (s.login) {
    const settings = s.settings ?? { listed: true, share_commits: true };
    body
      .child(h_flex().gap(10).items_center()
        .child(avatar(s.login, s.avatarPath(s.login), 32))
        .child(v_flex().flex_1()
          .child(div().font_semibold().text_color(t.foreground).child(s.login))
          .child(div().text_size(11.5).text_color(t.muted).child("Signed in with GitHub")))
        .child(button("tr-sign-out", "Sign out", s.act.signOut, t)))
      .child(rule(t))
      .child(caption("Privacy", t))
      .child(setting("tr-listed", "Show me on the leaderboard", "Off keeps your totals private; you still see your own rank.",
        settings.listed, (on, cx) => s.act.changeSetting("listed", on, cx), t))
      .child(setting("tr-commits", "Share my commit count", "Off removes commits you already shared.",
        settings.share_commits, (on, cx) => s.act.changeSetting("share_commits", on, cx), t));
  } else {
    body.child(v_flex().gap(8)
      .child(div().font_semibold().text_color(t.foreground).child("Not signed in"))
      .child(div().text_size(11.5).text_color(t.muted).child(
        "Your usage stays on this Mac. Signing in sends daily totals only: tokens and cost per model, and how many commits you made. Prompts, code, and file or repository names are never sent."))
      .child(h_flex().child(githubButton("tr-settings-sign-in", "Sign in with GitHub", s.act.signIn))));
  }
  body
    .child(rule(t))
    .child(caption("Share", t))
    .child(h_flex().gap(8)
      .child(button("tr-copy", s.copied ? "Copied" : "Copy this week's summary", s.act.copySummary, t))
      .child(button("tr-refresh-now", "Scan now", s.act.refresh, t)));
  if (s.login) {
    body.child(rule(t)).child(h_flex().items_center().justify_between()
      .child(v_flex().gap(2)
        .child(div().text_color(t.foreground).child("Delete my data"))
        .child(div().text_size(11.5).text_color(t.muted).child("Removes your account and everything uploaded.")))
      .child(button("tr-delete", s.confirmDelete ? "Click again to delete" : "Delete", s.act.deleteData, t, { danger: true })));
  }
  body.child(rule(t)).child(updateRow(s, t)).child(h_flex().items_center().justify_between()
    .child(div().text_size(11.5).text_color(t.muted).child("Something broken or wrong?"))
    .child(button("tr-report", "Report a problem", s.act.reportBug, t)));
  return body.child(div().text_size(11.5).text_color(t.muted).child(
    `Costs are estimates at API list prices${s.pricingVersion ? ` (prices v${s.pricingVersion})` : ""}; subscription plans are not reflected. Days are UTC.`));
}
