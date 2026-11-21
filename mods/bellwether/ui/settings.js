import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { avatar, button, caption, down, githubButton, rule, toggle } from "./style.js";
import { LANGUAGES, tr } from "../lib/locale.js";

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
  let status = tr("Up to date");
  if (u.installing) status = tr("Installing {version}…", { version: u.latest?.version });
  else if (u.checking) status = tr("Checking for updates…");
  else if (u.error) status = tr("Update check failed: {error}", { error: u.error });
  else if (u.available) status = tr("Version {version} is out", { version: u.latest.version });
  else if (!u.latest) status = tr("Not checked yet");
  const action = u.available
    ? button("tr-update", u.installing ? tr("Installing…") : tr("Update to {version}", { version: u.latest.version }), s.act.installUpdate, t, { primary: true })
    : button("tr-check-update", tr("Check for updates"), s.act.checkUpdate, t);
  return h_flex().gap(12).items_center()
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_color(t.foreground).child(`Bellwether ${s.version}${s.herdrVersion ? `, Herdr ${s.herdrVersion}` : ""}`))
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11.5).truncate().text_color(u.error ? down(t) : t.muted).child(status))
        .when(Boolean(u.available && u.latest?.url), (e) => e.child(div().id("tr-release-notes").text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((st) => st.text_color(t.foreground)).on_click((_e, cx) => s.act.openRelease(cx)).child(tr("What's new"))))))
    .child(div().flex_none().child(action));
}

const nameOf = (code) => LANGUAGES.find(([c]) => c === code)?.[1] ?? code;

/**
 * The interface language: a row with the current choice, and under it, while it
 * is open, the choices three to a row. System follows the Mac's language.
 */
function languageRow(s, t) {
  const shown = s.language === "auto" ? `${tr("System")} (${nameOf(s.systemLanguage)})` : nameOf(s.language);
  const row = h_flex().gap(12).items_center()
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_color(t.foreground).child(tr("Language")))
      .child(div().text_size(11.5).truncate().text_color(t.muted).child(shown)))
    .child(button("tr-language", s.languageMenu ? tr("Done") : tr("Change"), s.act.toggleLanguages, t));
  if (!s.languageMenu) return row;
  const options = LANGUAGES.map(([code, name]) => {
    const on = code === s.language;
    return div().id(`tr-lang-${code}`).flex_1().h(30).px(10).rounded(7).flex().items_center().cursor_pointer().whitespace_nowrap()
      .border(1).border_color(on ? t.foreground : t.border).bg(on ? t.raised : t.popover)
      .text_color(t.foreground).when(on, (e) => e.font_semibold())
      .hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => s.act.pickLanguage(code, cx))
      .child(code === "auto" ? tr("System") : name);
  });
  const rows = [0, 3, 6].map((i) => h_flex().gap(6).children(options.slice(i, i + 3)));
  return v_flex().gap(8).child(row).children(rows);
}

export function settingsTab(s, t) {
  const body = v_flex().gap(12);
  body.child(languageRow(s, t)).child(rule(t));
  if (s.login) {
    const settings = s.settings ?? { listed: true, share_commits: true };
    body
      .child(h_flex().gap(10).items_center()
        .child(avatar(s.login, s.avatarPath(s.login), 32))
        .child(v_flex().flex_1()
          .child(div().font_semibold().text_color(t.foreground).child(s.login))
          .child(div().text_size(11.5).text_color(t.muted).child(tr("Signed in with GitHub"))))
        .child(button("tr-sign-out", tr("Sign out"), s.act.signOut, t)))
      .child(rule(t))
      .child(caption(tr("Privacy"), t))
      .child(setting("tr-listed", tr("Show me on the leaderboard"), tr("Off keeps your totals private; you still see your own rank."),
        settings.listed, (on, cx) => s.act.changeSetting("listed", on, cx), t))
      .child(setting("tr-commits", tr("Share my commit count"), tr("Off removes commits you already shared."),
        settings.share_commits, (on, cx) => s.act.changeSetting("share_commits", on, cx), t));
  } else {
    body.child(v_flex().gap(8)
      .child(div().font_semibold().text_color(t.foreground).child(tr("Not signed in")))
      .child(div().text_size(11.5).text_color(t.muted).child(
        tr("Your usage stays on this Mac. Signing in sends daily totals only: tokens and cost per model, and how many commits you made. Prompts, code, and file or repository names are never sent.")))
      .child(h_flex().child(githubButton("tr-settings-sign-in", tr("Sign in with GitHub"), s.act.signIn))));
  }
  body
    .child(rule(t))
    .child(caption(tr("Share"), t))
    .child(h_flex().gap(8)
      .child(button("tr-copy", s.copied ? tr("Copied") : tr("Copy this week's summary"), s.act.copySummary, t))
      .child(button("tr-refresh-now", tr("Scan now"), s.act.refresh, t)));
  if (s.login) {
    body.child(rule(t)).child(h_flex().items_center().justify_between()
      .child(v_flex().gap(2)
        .child(div().text_color(t.foreground).child(tr("Delete my data")))
        .child(div().text_size(11.5).text_color(t.muted).child(tr("Removes your account and everything uploaded."))))
      .child(button("tr-delete", s.confirmDelete ? tr("Click again to delete") : tr("Delete"), s.act.deleteData, t, { danger: true })));
  }
  body.child(rule(t)).child(updateRow(s, t)).child(h_flex().items_center().justify_between()
    .child(div().text_size(11.5).text_color(t.muted).child(tr("Something broken or wrong?")))
    .child(button("tr-report", tr("Report a problem"), s.act.reportBug, t)));
  return body.child(div().text_size(11.5).text_color(t.muted).child(
    s.pricingVersion
      ? tr("Costs are estimates at API list prices (prices v{version}); subscription plans are not reflected. Days are UTC.", { version: s.pricingVersion })
      : tr("Costs are estimates at API list prices; subscription plans are not reflected. Days are UTC.")));
}
