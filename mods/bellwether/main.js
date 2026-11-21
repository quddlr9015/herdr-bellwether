import "./lib/strings.js";
import { View } from "gpui-kit";
import { appHome, checking, exec, home, nextCommand, notify, props, readTextFile, run, setShared, shared, spaces, theme, updates, writeTextFile } from "herdr";
import { h_flex } from "gpui-base";
import { ApiError, request } from "./lib/api.js";
import { anchorDay, periodLabel, periodRange, todayUtc } from "./lib/dates.js";
import { commits, formatTokens, formatUsd } from "./lib/format.js";
import { historyFile, mergeHistory, parseHistory, readLedger } from "./lib/history.js";
import { accountReportUrl, bugReportUrl, diagnostics } from "./lib/report.js";
import { pendingUpload, runScan } from "./lib/scan.js";
import { CHECK_EVERY_MS, compareVersions, latestRelease } from "./lib/update.js";
import { VERSION } from "./lib/version.js";
import { matchLanguage, setCurrentLanguage, tr } from "./lib/locale.js";
import { buildDays, dayOf, lastDays, sumRange } from "./lib/stats.js";
import { statusBar } from "./ui/bar.js";
import { rankPanel } from "./ui/panel.js";
import UsageLimits from "./limits/main.js";
import { limitsTrigger } from "./limits/ui/bar.js";

const MOD = "bellwether";
const SCAN_EVERY_MS = 10 * 60 * 1000;
const FRESH_MS = 60 * 1000;
const PRICING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GITHUB_DEVICE_URL = "https://github.com/login/device";
const AVATAR_PREFIX = "https://avatars.githubusercontent.com/";
const AVATARS_PER_BOARD = 40;
const REPO_URL = "https://github.com/quddlr9015/herdr-bellwether";
// Room the Token Rank numbers take at the right of the bar; the plan limits get the rest.
const TOKEN_RANK_BAR_W = 330;

// The interface language every copy reads: "auto" (the system's) or a code from LANGUAGES.
const LANGUAGE_KEY = "bellwether.language";

/** The system's language: macOS's first preferred language, else LC_ALL / LC_MESSAGES / LANG. */
async function systemLanguage() {
  const apple = await exec("defaults", ["read", "-g", "AppleLanguages"]).catch(() => null);
  const first = apple?.code === 0 ? /"?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)"?/.exec(apple.stdout.replace(/^[\s(]+/, ""))?.[1] : null;
  if (matchLanguage(first)) return matchLanguage(first);
  const env = await exec("sh", ["-c", 'printf %s "${LC_ALL:-${LC_MESSAGES:-$LANG}}"']).catch(() => null);
  return matchLanguage(env?.stdout) ?? "en";
}

const message = (error) => (error instanceof Error ? error.message : String(error));
const parseJson = (text, fallback) => {
  try {
    return text ? JSON.parse(text) ?? fallback : fallback;
  } catch {
    return fallback;
  }
};

export default class TokenRank extends View {
  init(_props, cx) {
    // Kept from when the mod was called token-rank, so sign-in and history carry over.
    this.stateDir = `${home()}/.local/state/herdr-token-rank`;
    this.paths = {
      auth: `${this.stateDir}/auth.json`,
      sent: `${this.stateDir}/uploaded.json`,
      pricing: `${this.stateDir}/pricing.json`,
      history: `${this.stateDir}/history.json`,
      update: `${this.stateDir}/update.json`,
    };
    this.files = { auth: null, sent: null, pricing: null, history: null, update: null };
    this.helper = `${appHome()}/mods/${MOD}/helpers/scan.sh`;
    // role "panel": the whole panel in a tab (`bellwether:open`) instead of a status-bar block.
    this.role = props()?.role === "panel" ? "panel" : "bar";
    this.tab = props()?.tab ?? "overview";
    this.period = "week";
    // Boards rank by tokens; each row shows the estimated cost beside them.
    this.metric = "tokens";
    // Board: "all", "claude" or "codex". Commits are only ranked on "all".
    this.family = "all";
    // Usage → Activity: "weeks" (the last 16), "month" or "year" (`activityOffset` months or years back).
    this.activityView = "weeks";
    this.activityOffset = 0;
    this.offset = 0;
    this.viewing = null;
    this.auth = null;
    this.sent = {};
    this.pricing = null;
    this.scan = null;
    this.days = new Map();
    this.scanning = false;
    this.scannedAt = null;
    this.scanError = null;
    this.signIn = null;
    this.notice = null;
    this.confirmDelete = false;
    this.copied = false;
    this.cache = {};
    this.avatarsReady = new Set();
    this.avatarQueue = [];
    this.avatarBusy = false;
    this.act = this.actions();
    this.barWidth = 0;
    this.updateState = { checking: false, installing: false, error: null };
    this.systemLanguage = "en";
    this.languageMenu = false;
    // Tallest the panel has been. The hover panel hangs from the bar, so a shorter
    // tab would pull its top edge (and the tabs) out from under the pointer and close it.
    this.panelMinH = 0;
    this.panelOpen = false;
    if (checking()) return;
    // Plan limits exactly as the usage-limits mod shows them. This view owns the
    // instance, so its bar segments and panel land in Token Rank's bar and panel.
    this.limits = new UsageLimits({});
    this.limits.init({ border: false }, cx);
    cx.spawn(async (later) => {
      await this.loadFiles();
      this.systemLanguage = await systemLanguage();
      later.notify();
      await this.checkUpdate(later);
      await this.loadPricing(later);
      await this.sync(later);
    });
    cx.timer.every(SCAN_EVERY_MS, (later) => later.spawn((task) => this.sync(task)));
    cx.timer.every(6 * 60 * 60 * 1000, (later) => later.spawn((task) => this.checkUpdate(task)));
    // Commands for keys.json ("bellwether:refresh") or `herdr-app do bellwether.refresh`.
    cx.spawn(async (later) => {
      const commands = { refresh: this.act.refresh, "sign-in": this.act.signIn, "sign-out": this.act.signOut, open: this.act.openTab, "check-update": this.act.checkUpdate, update: this.act.installUpdate };
      for (;;) {
        const command = commands[await nextCommand()];
        // Every shown copy hears a command; only the status-bar copy acts on it.
        if (command && this.role === "bar" && (command !== this.act.signIn || !this.auth)) command(later);
      }
    });
  }

  // ---- local files ----------------------------------------------------------

  async loadFiles() {
    await exec("sh", ["-c", 'mkdir -p "$1" && chmod 700 "$1"', "sh", this.stateDir]);
    for (const name of Object.keys(this.paths)) this.files[name] = await readTextFile(this.paths[name]);
    this.auth = parseJson(this.files.auth, null);
    this.sent = parseJson(this.files.sent, {});
    this.pricing = parseJson(this.files.pricing, null)?.table ?? null;
    this.history = parseHistory(this.files.history);
    this.updateInfo = parseJson(this.files.update, {});
  }

  /** Replaces one of our JSON files, re-reading it once if another write got there first. */
  async save(name, value) {
    const text = JSON.stringify(value);
    try {
      await writeTextFile(this.paths[name], text, this.files[name]);
    } catch {
      await writeTextFile(this.paths[name], text, await readTextFile(this.paths[name]));
    }
    this.files[name] = text;
  }

  async setAuth(auth) {
    this.auth = auth;
    this.cache = {};
    this.viewing = null;
    await this.save("auth", auth);
    if (!auth) {
      this.sent = {};
      await this.save("sent", {});
    }
  }

  /** Prices come from the server (the same table it ranks with) and are kept for a day. */
  async loadPricing(cx) {
    const saved = parseJson(this.files.pricing, null);
    if (saved?.table && Date.now() - saved.fetched_at < PRICING_MAX_AGE_MS) return;
    try {
      const table = await request("GET", "/v1/pricing");
      this.pricing = table;
      await this.save("pricing", { fetched_at: Date.now(), table });
      this.rebuildDays();
      cx.notify();
    } catch {
      // Keep the cached table (or show tokens only) until the next scan retries.
    }
  }

  // ---- updates -------------------------------------------------------------

  /**
   * Once a day (or now, when asked) reads GitHub's latest release. A newer one is
   * announced once; the first start after an update says it went in.
   */
  async checkUpdate(cx, force = false) {
    if (this.role !== "bar") return;
    const info = this.updateInfo ?? {};
    if (info.seen_version && info.seen_version !== VERSION) {
      notify({ title: "Bellwether", body: tr("Updated to {version}.", { version: VERSION }), level: "success" });
    }
    if (info.seen_version !== VERSION) await this.saveUpdateInfo({ seen_version: VERSION });
    if (!force && info.checked_at && Date.now() - info.checked_at < CHECK_EVERY_MS) return;
    this.updateState = { ...this.updateState, checking: true, error: null };
    cx.notify();
    try {
      const latest = await latestRelease();
      const fresh = compareVersions(latest.version, VERSION) > 0;
      if (fresh && this.updateInfo.notified !== latest.version) {
        notify({ title: "Bellwether", body: tr("Version {version} is out. Settings → Update.", { version: latest.version }) });
        await this.saveUpdateInfo({ notified: latest.version });
      }
      await this.saveUpdateInfo({ checked_at: Date.now(), latest });
      this.updateState = { checking: false, error: null };
    } catch (error) {
      this.updateState = { checking: false, error: message(error) };
    }
    cx.notify();
  }

  async saveUpdateInfo(change) {
    this.updateInfo = { ...(this.updateInfo ?? {}), ...change };
    await this.save("update", this.updateInfo).catch(() => {});
  }

  /** Installs the latest release over this folder; Herdr then reloads the new files. */
  async installUpdate(cx) {
    const latest = this.updateInfo?.latest;
    if (!latest || this.updateState?.installing) return;
    this.updateState = { installing: true, error: null };
    cx.notify();
    const script = `${appHome()}/mods/${MOD}/helpers/update.sh`;
    const result = await exec("sh", [script, latest.tag, `${appHome()}/mods/${MOD}`, this.stateDir], { timeout: 3 * 60 * 1000 }).catch((error) => ({ code: -1, stderr: message(error) }));
    // On success Herdr reloads this mod from the new files and this copy stops here.
    if (result.code !== 0) {
      this.updateState = { installing: false, error: result.stderr?.trim().split("\n").pop() || tr("update exited with {code}", { code: result.code }) };
      cx.notify();
    }
  }

  // ---- scanning and uploading -----------------------------------------------

  repoFolders() {
    return [...new Set(spaces().filter((s) => !s.machine && s.folder).map((s) => s.folder))];
  }

  async sync(cx) {
    if (this.scanning) return;
    this.scanning = true;
    cx.notify();
    try {
      const scan = await runScan(this.helper, this.stateDir, this.repoFolders());
      if (scan) {
        this.scan = scan;
        this.scannedAt = Date.now();
      } else if (!this.scan) {
        // Another copy is scanning; read its result shortly instead of waiting ten minutes.
        cx.timer.after(20 * 1000, (later) => later.spawn((task) => this.sync(task)));
      }
      this.scanError = null;
    } catch (error) {
      this.scanError = message(error);
    }
    this.scanning = false;
    await this.keepHistory();
    this.rebuildDays();
    cx.notify();
    await this.loadPricing(cx);
    if (this.auth && this.scan) await this.upload(cx);
    await this.refresh(cx, true);
  }

  /** Days for the charts and totals: the kept history with the current scan on top. */
  rebuildDays() {
    this.days = buildDays({ days: mergeHistory(this.history, this.scan) }, this.pricing);
  }

  /** Writes the scanned days into history.json (the first time, with the ledger's older days). */
  async keepHistory() {
    if (!this.scan) return;
    try {
      const saved = this.history ?? await readLedger(`${appHome()}/mods/${MOD}/helpers`, this.stateDir);
      const days = mergeHistory(saved, this.scan);
      const file = historyFile(days);
      if (JSON.stringify(file) === this.files.history) return;
      this.history = days;
      await this.save("history", file);
    } catch {
      // Totals still show the scan window; the next scan tries again.
    }
  }

  async upload(cx) {
    const { days, signatures } = pendingUpload(this.scan, this.sent);
    if (!days.length || !this.scan.deviceId) return;
    try {
      await request("POST", "/v1/usage", { token: this.auth.token, body: { device_id: this.scan.deviceId, days } });
      this.sent = signatures;
      await this.save("sent", signatures);
      this.cache = {};
    } catch (error) {
      await this.handleApiError(error, cx);
    }
  }

  async handleApiError(error, cx) {
    if (error instanceof ApiError && error.status === 401) {
      await this.setAuth(null);
      this.notice = tr("Your session ended. Sign in again to keep ranking.");
    } else {
      this.notice = message(error);
    }
    cx.notify();
  }

  // ---- server data ----------------------------------------------------------

  anchor() {
    return anchorDay(this.period, this.offset);
  }

  async fetchCached(key, load, force) {
    const hit = this.cache[key];
    if (!force && hit && Date.now() - hit.at < FRESH_MS) return;
    this.cache[key] = { ...hit, at: Date.now() };
    try {
      this.cache[key] = { at: Date.now(), data: await load(), error: null };
    } catch (error) {
      this.cache[key] = { at: Date.now(), data: hit?.data ?? null, error };
    }
  }

  boardQuery(date) {
    return `period=${this.period}&metric=${this.metric}&date=${date}&family=${this.family}`;
  }

  /** The shown board and standing, today's standing for the status bar, and an open profile. */
  async refresh(cx, force = false) {
    const date = this.anchor();
    const query = this.boardQuery(date);
    const loads = [this.fetchCached(`board:${query}`, () => request("GET", `/v1/leaderboard?${query}`), force)];
    if (this.auth) {
      const token = this.auth.token;
      loads.push(this.fetchCached(`me:${query}`, () => request("GET", `/v1/me?${query}`, { token }), force));
      loads.push(this.fetchCached("me:today", () => request("GET", `/v1/me?period=day&metric=tokens&date=${todayUtc()}`, { token }), force));
      loads.push(this.fetchCached("me:week", () => request("GET", `/v1/me?period=week&metric=tokens&date=${todayUtc()}`, { token }), force));
    }
    if (this.viewing) {
      const login = this.viewing;
      loads.push(this.fetchCached(`profile:${login}`, () => request("GET", `/v1/users/${encodeURIComponent(login)}`), force));
    }
    await Promise.all(loads);
    const expired = Object.values(this.cache).find((entry) => entry.error instanceof ApiError && entry.error.status === 401);
    if (expired) await this.handleApiError(expired.error, cx);
    this.queueAvatars(cx);
    cx.notify();
  }

  // ---- avatars --------------------------------------------------------------

  avatarPath(login) {
    return this.avatarsReady.has(login) ? `mods/${MOD}/.avatars/${login}.png` : null;
  }

  /** Downloads avatars of the shown rows into the mod's hidden .avatars folder, one at a time. */
  queueAvatars(cx) {
    const board = this.cache[`board:${this.boardQuery(this.anchor())}`]?.data;
    const people = (board?.entries ?? []).slice(0, AVATARS_PER_BOARD).map((e) => [e.login, e.avatar_url]);
    if (this.auth) people.push([this.auth.login, this.auth.avatar_url]);
    const profile = this.viewing && this.cache[`profile:${this.viewing}`]?.data;
    if (profile) people.push([profile.login, profile.avatar_url]);
    for (const [login, url] of people) {
      const valid = /^[A-Za-z0-9-]{1,39}$/.test(login) && typeof url === "string" && url.startsWith(AVATAR_PREFIX);
      if (valid && !this.avatarsReady.has(login) && !this.avatarQueue.some(([queued]) => queued === login)) this.avatarQueue.push([login, url]);
    }
    if (this.avatarBusy || !this.avatarQueue.length) return;
    this.avatarBusy = true;
    cx.spawn(async (task) => {
      while (this.avatarQueue.length) {
        const [login, url] = this.avatarQueue.shift();
        const file = `${appHome()}/mods/${MOD}/.avatars/${login}.png`;
        const sized = `${url}${url.includes("?") ? "&" : "?"}s=64`;
        const result = await exec("sh", ["-c", 'mkdir -p "$(dirname "$1")" && { test -s "$1" || curl -sfL --max-time 10 -o "$1" "$2"; }', "sh", file, sized])
          .catch(() => ({ code: 1 }));
        if (result.code === 0) this.avatarsReady.add(login);
        task.notify();
      }
      this.avatarBusy = false;
    });
  }

  // ---- sign in --------------------------------------------------------------

  async runSignIn(cx) {
    try {
      const device = await request("POST", "/v1/auth/device");
      if (!this.signIn) return;
      this.signIn = device;
      cx.write_to_clipboard(device.user_code);
      cx.open_url(device.verification_uri || GITHUB_DEVICE_URL);
      cx.notify();
      let waitMs = (device.interval ?? 5) * 1000;
      const deadline = Date.now() + (device.expires_in ?? 900) * 1000;
      while (Date.now() < deadline) {
        await cx.sleep(waitMs);
        if (this.signIn !== device) return;
        const reply = await request("POST", "/v1/auth/token", { body: { device_code: device.device_code } });
        if (reply.status === "pending") continue;
        if (reply.status === "slow_down") {
          waitMs += 5000;
          continue;
        }
        if (reply.status !== "ok") throw new Error(reply.status === "denied" ? tr("GitHub sign-in was cancelled.") : tr("The code expired. Try again."));
        this.signIn = null;
        await this.setAuth({ token: reply.token, login: reply.user.login, avatar_url: reply.user.avatar_url });
        notify({ title: "Bellwether", body: tr("Signed in as {login}. Your totals upload every 10 minutes.", { login: reply.user.login }), level: "success" });
        this.tab = "ranking";
        cx.notify();
        await this.sync(cx);
        return;
      }
      throw new Error(tr("The code expired. Try again."));
    } catch (error) {
      this.signIn = null;
      this.notice = message(error);
      cx.notify();
    }
  }

  summary() {
    const week = periodRange("week", todayUtc());
    const total = sumRange(this.days, week.from, week.to);
    const mine = this.cache["me:week"]?.data;
    const tokens = tr("{n} tokens", { n: formatTokens(total.tokens) });
    const amount = this.pricing ? `${formatUsd(total.cost)} · ${tokens}` : tokens;
    const vars = { amount, commits: commits(total.commits), rank: mine?.rank, url: REPO_URL };
    return mine?.rank
      ? tr("My AI coding this week: {amount} · {commits} · #{rank} on Bellwether. Herdr mod: {url}", vars)
      : tr("My AI coding this week: {amount} · {commits}. Herdr mod: {url}", vars);
  }

  actions() {
    const reload = (cx) => {
      cx.notify();
      cx.spawn((task) => this.refresh(task));
    };
    return {
      openPanel: (open, cx) => {
        this.panelOpen = open;
        // Each opening starts at the panel's own height again.
        if (open) this.panelMinH = 0;
        this.limits?.act.hover(open, cx);
        if (open) cx.spawn((task) => this.refresh(task));
        cx.notify();
      },
      resize: (size, cx) => {
        if (size.width === this.barWidth) return;
        this.barWidth = size.width;
        cx.notify();
      },
      panelSize: (size, cx) => {
        if (size.height <= this.panelMinH + 1) return;
        this.panelMinH = Math.ceil(size.height);
        cx.notify();
      },
      pickTab: (tab, cx) => {
        this.tab = tab;
        this.confirmDelete = false;
        reload(cx);
      },
      pickPeriod: (period, cx) => {
        this.period = period;
        this.offset = 0;
        reload(cx);
      },
      pickMetric: (metric, cx) => {
        this.metric = metric;
        reload(cx);
      },
      toggleLanguages: (cx) => {
        this.languageMenu = !this.languageMenu;
        cx.notify();
      },
      pickLanguage: (code, cx) => {
        this.languageMenu = false;
        setShared(LANGUAGE_KEY, code);
        cx.notify();
      },
      pickActivity: (view, cx) => {
        this.activityView = view;
        this.activityOffset = 0;
        cx.notify();
      },
      shiftActivity: (steps, cx) => {
        this.activityOffset = Math.max(0, this.activityOffset + steps);
        cx.notify();
      },
      pickFamily: (family, cx) => {
        this.family = family;
        if (family !== "all" && this.metric === "commits") this.metric = "tokens";
        reload(cx);
      },
      shift: (steps, cx) => {
        this.offset = Math.max(0, this.offset + steps);
        reload(cx);
      },
      openProfile: (login, cx) => {
        this.viewing = login;
        reload(cx);
      },
      closeProfile: (cx) => {
        this.viewing = null;
        cx.notify();
      },
      openGitHubProfile: (login, cx) => cx.open_url(`https://github.com/${login}`),
      reportAccount: (login, cx) => cx.open_url(accountReportUrl(login)),
      checkUpdate: (cx) => cx.spawn((task) => this.checkUpdate(task, true)),
      installUpdate: (cx) => cx.spawn((task) => this.installUpdate(task)),
      openRelease: (cx) => this.updateInfo?.latest?.url && cx.open_url(this.updateInfo.latest.url),
      reportBug: (cx) => cx.spawn(async (task) => {
        const os = await exec("uname", ["-sr"]).then((r) => r.stdout.trim()).catch(() => null);
        const versions = updates();
        task.open_url(bugReportUrl(diagnostics({
          version: VERSION, herdr: versions?.app?.version, core: versions?.core?.version, os,
          scanError: this.scanError, scannedAt: this.scannedAt, pricingVersion: this.pricing?.version, signedIn: Boolean(this.auth),
        }, home())));
      }),
      openTab: () => run("tab.new", { name: "Bellwether", mod: MOD, props: { role: "panel" } }),
      refresh: (cx) => {
        this.limits?.act.refresh(cx);
        cx.spawn((task) => this.sync(task));
      },
      limitsSettings: (cx) => this.limits?.act.show("settings", cx),
      signIn: (cx) => {
        this.notice = null;
        this.signIn = {};
        cx.notify();
        cx.spawn((task) => this.runSignIn(task));
      },
      openGitHub: (cx) => cx.open_url(this.signIn?.verification_uri || GITHUB_DEVICE_URL),
      cancelSignIn: (cx) => {
        this.signIn = null;
        cx.notify();
      },
      signOut: (cx) => cx.spawn(async (task) => {
        const token = this.auth?.token;
        await this.setAuth(null);
        task.notify();
        if (token) await request("POST", "/v1/auth/logout", { token }).catch(() => {});
      }),
      changeSetting: (key, on, cx) => cx.spawn(async (task) => {
        try {
          await request("PATCH", "/v1/me", { token: this.auth.token, body: { [key]: on } });
          await this.refresh(task, true);
        } catch (error) {
          await this.handleApiError(error, task);
        }
      }),
      copySummary: (cx) => {
        cx.write_to_clipboard(this.summary());
        this.copied = true;
        cx.notify();
        cx.timer.after(2000, (later) => {
          this.copied = false;
          later.notify();
        });
      },
      deleteData: (cx) => {
        if (!this.confirmDelete) {
          this.confirmDelete = true;
          cx.notify();
          return;
        }
        this.confirmDelete = false;
        cx.spawn(async (task) => {
          try {
            await request("DELETE", "/v1/me", { token: this.auth.token });
            await this.setAuth(null);
            this.notice = tr("Your account and uploaded totals were deleted.");
          } catch (error) {
            await this.handleApiError(error, task);
          }
          task.notify();
        });
      },
    };
  }

  // ---- view -----------------------------------------------------------------

  bar() {
    const todayUsage = dayOf(this.days, todayUtc());
    const priced = Boolean(this.pricing);
    const spark = this.scan ? lastDays(this.days, 7).map((d) => (priced ? d.cost : d.tokens)) : null;
    const rank = this.auth ? this.cache["me:today"]?.data?.rank ?? null : null;
    if (this.signIn) return { label: this.signIn.user_code ? tr("Enter {code} on GitHub", { code: this.signIn.user_code }) : tr("Signing in…"), accent: true };
    if (!this.scan) return { label: this.scanning ? tr("Reading logs…") : "Bellwether", accent: false };
    const today = priced ? formatUsd(todayUsage.cost ?? 0) : null;
    const update = Boolean(this.updateInfo?.latest && compareVersions(this.updateInfo.latest.version, VERSION) > 0);
    return { rank, today: today ?? formatTokens(todayUsage.tokens), todayTokens: today ? formatTokens(todayUsage.tokens) : null, accent: true, spark, update };
  }

  render(cx) {
    const chosen = shared(LANGUAGE_KEY) ?? "auto";
    setCurrentLanguage(chosen === "auto" ? this.systemLanguage : chosen);
    const t = theme();
    const limits = this.limits?.parts(cx, Math.max(0, this.barWidth - TOKEN_RANK_BAR_W)) ?? null;
    const date = this.anchor();
    const query = this.boardQuery(date);
    const boardEntry = this.cache[`board:${query}`];
    const settings = this.cache["me:today"]?.data?.settings ?? null;
    const panel = rankPanel({
      act: this.act,
      tab: this.tab,
      panelMinH: this.panelMinH,
      limitsPanel: limits?.panel ?? null,
      weekStanding: this.cache["me:week"]?.data ?? null,
      days: this.days,
      priced: Boolean(this.pricing),
      pricingVersion: this.pricing?.version ?? null,
      version: VERSION,
      update: {
        ...this.updateState,
        latest: this.updateInfo?.latest ?? null,
        available: Boolean(this.updateInfo?.latest && compareVersions(this.updateInfo.latest.version, VERSION) > 0),
      },
      herdrVersion: updates()?.app?.version ?? null,
      scanned: Boolean(this.scan),
      period: this.period,
      family: this.family,
      activityView: this.activityView,
      language: shared(LANGUAGE_KEY) ?? "auto",
      systemLanguage: this.systemLanguage,
      languageMenu: this.languageMenu,
      activityOffset: this.activityOffset,
      metric: this.metric,
      offset: this.offset,
      periodText: periodLabel(this.period, date, this.offset),
      login: this.auth?.login ?? null,
      settings,
      signIn: this.signIn,
      mine: this.cache[`me:${query}`]?.data ?? null,
      board: boardEntry?.data ?? null,
      boardError: boardEntry?.error && !boardEntry.data ? message(boardEntry.error) : null,
      viewing: this.viewing,
      profile: this.viewing ? {
        data: this.cache[`profile:${this.viewing}`]?.data ?? null,
        error: this.cache[`profile:${this.viewing}`]?.error ? message(this.cache[`profile:${this.viewing}`].error) : null,
      } : null,
      avatarPath: (login) => this.avatarPath(login),
      notice: this.notice,
      confirmDelete: this.confirmDelete,
      copied: this.copied,
      scanning: this.scanning,
      scannedAt: this.scannedAt,
      scanError: this.scanError,
    }, t);
    if (this.role === "panel") {
      return h_flex().id("root").size_full().justify_center().items_start().p(16).bg(t.canvas).overflow_hidden().child(panel);
    }
    return statusBar({
      ...this.bar(),
      limits: limits ? limitsTrigger({ ...limits.bar, onHover: () => {} }, t) : null,
      open: this.panelOpen,
      onOpenChange: this.act.openPanel,
      onResize: this.act.resize,
      panel,
      border: props()?.border,
    }, t);
  }
}
