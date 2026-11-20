import { View } from "gpui-kit";
import { appHome, checking, exec, home, nextCommand, notify, props, readTextFile, spaces, theme, writeTextFile } from "herdr";
import { ApiError, request } from "./lib/api.js";
import { anchorDay, periodLabel, periodRange, todayUtc } from "./lib/dates.js";
import { commits, formatTokens, formatUsd } from "./lib/format.js";
import { pendingUpload, runScan } from "./lib/scan.js";
import { buildDays, dayOf, lastDays, sumRange } from "./lib/stats.js";
import { statusBar } from "./ui/bar.js";
import { rankPanel } from "./ui/panel.js";

const MOD = "token-rank";
const SCAN_EVERY_MS = 10 * 60 * 1000;
const FRESH_MS = 60 * 1000;
const PRICING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const GITHUB_DEVICE_URL = "https://github.com/login/device";
const AVATAR_PREFIX = "https://avatars.githubusercontent.com/";
const AVATARS_PER_BOARD = 40;
const REPO_URL = "https://github.com/quddlr9015/herdr-token-rank";

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
    this.stateDir = `${home()}/.local/state/herdr-token-rank`;
    this.paths = {
      auth: `${this.stateDir}/auth.json`,
      sent: `${this.stateDir}/uploaded.json`,
      pricing: `${this.stateDir}/pricing.json`,
    };
    this.files = { auth: null, sent: null, pricing: null };
    this.helper = `${appHome()}/mods/${MOD}/helpers/scan.sh`;
    this.tab = "usage";
    this.period = "week";
    this.metric = "cost";
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
    if (checking()) return;
    cx.spawn(async (later) => {
      await this.loadFiles();
      later.notify();
      await this.loadPricing(later);
      await this.sync(later);
    });
    cx.timer.every(SCAN_EVERY_MS, (later) => later.spawn((task) => this.sync(task)));
    // Commands for keys.json ("token-rank:refresh") or `herdr-app do token-rank.refresh`.
    cx.spawn(async (later) => {
      const commands = { refresh: this.act.refresh, "sign-in": this.act.signIn, "sign-out": this.act.signOut };
      for (;;) {
        const command = commands[await nextCommand()];
        if (command && (command !== this.act.signIn || !this.auth)) command(later);
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
      this.days = buildDays(this.scan, this.pricing);
      cx.notify();
    } catch {
      // Keep the cached table (or show tokens only) until the next scan retries.
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
      }
      this.scanError = null;
    } catch (error) {
      this.scanError = message(error);
    }
    this.scanning = false;
    this.days = buildDays(this.scan, this.pricing);
    cx.notify();
    await this.loadPricing(cx);
    if (this.auth && this.scan) await this.upload(cx);
    await this.refresh(cx, true);
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
      this.notice = "Your session ended. Sign in again to keep ranking.";
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

  /** The shown board and standing, today's standing for the status bar, and an open profile. */
  async refresh(cx, force = false) {
    const date = this.anchor();
    const query = `period=${this.period}&metric=${this.metric}&date=${date}`;
    const loads = [this.fetchCached(`board:${query}`, () => request("GET", `/v1/leaderboard?${query}`), force)];
    if (this.auth) {
      const token = this.auth.token;
      loads.push(this.fetchCached(`me:${query}`, () => request("GET", `/v1/me?${query}`, { token }), force));
      loads.push(this.fetchCached("me:today", () => request("GET", `/v1/me?period=day&metric=cost&date=${todayUtc()}`, { token }), force));
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
    const board = this.cache[`board:period=${this.period}&metric=${this.metric}&date=${this.anchor()}`]?.data;
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
        if (reply.status !== "ok") throw new Error(reply.status === "denied" ? "GitHub sign-in was cancelled." : "The code expired. Try again.");
        this.signIn = null;
        await this.setAuth({ token: reply.token, login: reply.user.login, avatar_url: reply.user.avatar_url });
        notify({ title: "Token Rank", body: `Signed in as ${reply.user.login}. Your totals upload every 10 minutes.`, level: "success" });
        this.tab = "ranking";
        cx.notify();
        await this.sync(cx);
        return;
      }
      throw new Error("The code expired. Try again.");
    } catch (error) {
      this.signIn = null;
      this.notice = message(error);
      cx.notify();
    }
  }

  summary() {
    const week = periodRange("week", todayUtc());
    const total = sumRange(this.days, week.from, week.to);
    const mine = this.cache[`me:period=week&metric=cost&date=${todayUtc()}`]?.data;
    const amount = this.pricing ? `${formatUsd(total.cost)} · ${formatTokens(total.tokens)} tokens` : `${formatTokens(total.tokens)} tokens`;
    const rank = mine?.rank ? ` · #${mine.rank} on Token Rank` : "";
    return `My AI coding this week: ${amount} · ${commits(total.commits)}${rank}. Herdr mod: ${REPO_URL}`;
  }

  actions() {
    const reload = (cx) => {
      cx.notify();
      cx.spawn((task) => this.refresh(task));
    };
    return {
      hover: (hovered, cx) => {
        if (hovered) cx.spawn((task) => this.refresh(task));
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
      refresh: (cx) => cx.spawn((task) => this.sync(task)),
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
            this.notice = "Your account and uploaded totals were deleted.";
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
    const today = dayOf(this.days, todayUtc());
    const priced = Boolean(this.pricing);
    const spark = this.scan ? lastDays(this.days, 7).map((d) => (priced ? d.cost : d.tokens)) : null;
    const rank = this.auth ? this.cache["me:today"]?.data?.rank ?? null : null;
    if (this.signIn) return { label: this.signIn.user_code ? `Enter ${this.signIn.user_code} on GitHub` : "Signing in…", accent: true };
    if (!this.scan) return { label: this.scanning ? "Reading logs…" : "Token Rank", accent: false };
    const amount = priced ? formatUsd(today.cost ?? 0) : `${formatTokens(today.tokens)} tokens`;
    return { rank, label: rank ? amount : `${amount} today`, accent: true, spark };
  }

  render(_cx) {
    const t = theme();
    const date = this.anchor();
    const query = `period=${this.period}&metric=${this.metric}&date=${date}`;
    const boardEntry = this.cache[`board:${query}`];
    const settings = this.cache["me:today"]?.data?.settings ?? null;
    const panel = rankPanel({
      act: this.act,
      tab: this.tab,
      days: this.days,
      priced: Boolean(this.pricing),
      pricingVersion: this.pricing?.version ?? null,
      scanned: Boolean(this.scan),
      period: this.period,
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
    return statusBar({ ...this.bar(), onHover: this.act.hover, panel, border: props()?.border }, t);
  }
}
