import { View } from "gpui-kit";
import { appHome, checking, exec, home, nextCommand, notify, props, readTextFile, spaces, theme, writeTextFile } from "herdr";
import { ApiError, request } from "./lib/api.js";
import { formatTokens, formatUsd } from "./lib/format.js";
import { dayTokens, pendingUpload, runScan, todayUtc } from "./lib/scan.js";
import { statusBar } from "./ui/bar.js";
import { rankPanel } from "./ui/panel.js";

const MOD = "token-rank";
const SCAN_EVERY_MS = 10 * 60 * 1000;
const FRESH_MS = 60 * 1000;
const GITHUB_DEVICE_URL = "https://github.com/login/device";

const message = (error) => (error instanceof Error ? error.message : String(error));

export default class TokenRank extends View {
  init(_props, cx) {
    this.stateDir = `${home()}/.local/state/herdr-token-rank`;
    this.authPath = `${this.stateDir}/auth.json`;
    this.sentPath = `${this.stateDir}/uploaded.json`;
    this.helper = `${appHome()}/mods/${MOD}/helpers/scan.sh`;
    this.period = "day";
    this.metric = "cost";
    this.auth = null;
    this.files = { auth: null, sent: null };
    this.sent = {};
    this.scan = null;
    this.scanning = false;
    this.scannedAt = null;
    this.scanError = null;
    this.signIn = null;
    this.notice = null;
    this.confirmDelete = false;
    this.cache = {};
    this.act = this.actions();
    if (checking()) return;
    cx.spawn(async (later) => {
      await this.loadFiles();
      later.notify();
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
    this.files.auth = await readTextFile(this.authPath);
    this.files.sent = await readTextFile(this.sentPath);
    this.auth = this.parse(this.files.auth, null);
    this.sent = this.parse(this.files.sent, {});
  }

  parse(text, fallback) {
    try {
      return text ? JSON.parse(text) ?? fallback : fallback;
    } catch {
      return fallback;
    }
  }

  /** Replaces one of our JSON files, re-reading it once if another write got there first. */
  async save(name, path, value) {
    const text = JSON.stringify(value);
    try {
      await writeTextFile(path, text, this.files[name]);
    } catch {
      await writeTextFile(path, text, await readTextFile(path));
    }
    this.files[name] = text;
  }

  async setAuth(auth) {
    this.auth = auth;
    this.cache = {};
    await this.save("auth", this.authPath, auth);
    if (!auth) {
      this.sent = {};
      await this.save("sent", this.sentPath, {});
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
    cx.notify();
    if (this.auth && this.scan) await this.upload(cx);
    await this.refresh(cx, true);
  }

  async upload(cx) {
    const { days, signatures } = pendingUpload(this.scan, this.sent);
    if (!days.length || !this.scan.deviceId) return;
    try {
      await request("POST", "/v1/usage", { token: this.auth.token, body: { device_id: this.scan.deviceId, days } });
      this.sent = signatures;
      await this.save("sent", this.sentPath, signatures);
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

  // ---- leaderboard data -----------------------------------------------------

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

  /** The shown board, the user's standing in it, and today's cost standing for the bar. */
  async refresh(cx, force = false) {
    const views = [[this.period, this.metric], ["day", "cost"]];
    const loads = [this.fetchCached(`board:${this.period}:${this.metric}`,
      () => request("GET", `/v1/leaderboard?period=${this.period}&metric=${this.metric}`), force)];
    if (this.auth) {
      for (const [period, metric] of views) {
        loads.push(this.fetchCached(`me:${period}:${metric}`,
          () => request("GET", `/v1/me?period=${period}&metric=${metric}`, { token: this.auth.token }), force));
      }
    }
    await Promise.all(loads);
    const expired = Object.values(this.cache).find((entry) => entry.error instanceof ApiError && entry.error.status === 401);
    if (expired) await this.handleApiError(expired.error, cx);
    cx.notify();
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

  actions() {
    return {
      hover: (hovered, cx) => {
        if (hovered) cx.spawn((task) => this.refresh(task));
      },
      resize: () => {},
      pickPeriod: (period, cx) => {
        this.period = period;
        cx.notify();
        cx.spawn((task) => this.refresh(task));
      },
      pickMetric: (metric, cx) => {
        this.metric = metric;
        cx.notify();
        cx.spawn((task) => this.refresh(task));
      },
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

  barLabel() {
    if (this.signIn) return this.signIn.user_code ? `Enter ${this.signIn.user_code} on GitHub` : "Signing in…";
    const today = this.cache["me:day:cost"]?.data;
    if (this.auth && today?.rank) return `#${today.rank} today · ${formatUsd(today.cost_usd)}`;
    if (this.auth && today) return `${formatUsd(today.cost_usd)} today`;
    const tokens = dayTokens(this.scan?.days.get(todayUtc()));
    if (this.scan) return `${formatTokens(tokens)} tokens today`;
    return this.scanning ? "Reading logs…" : "Token Rank";
  }

  render(_cx) {
    const t = theme();
    const boardEntry = this.cache[`board:${this.period}:${this.metric}`];
    const panel = rankPanel({
      act: this.act,
      period: this.period,
      metric: this.metric,
      login: this.auth?.login ?? null,
      signIn: this.signIn,
      mine: this.cache[`me:${this.period}:${this.metric}`]?.data ?? null,
      board: boardEntry?.data ?? null,
      boardError: boardEntry?.error && !boardEntry.data ? message(boardEntry.error) : null,
      notice: this.notice,
      confirmDelete: this.confirmDelete,
      scanning: this.scanning,
      scannedAt: this.scannedAt,
      scanError: this.scanError,
    }, t);
    return statusBar({
      label: this.barLabel(),
      accent: Boolean(this.auth || this.signIn),
      onHover: this.act.hover,
      onResize: this.act.resize,
      panel,
      border: props()?.border,
    }, t);
  }
}
