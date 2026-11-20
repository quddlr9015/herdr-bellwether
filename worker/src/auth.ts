import { randomToken, sha256Hex } from "./crypto";
import { DAY_MS } from "./dates";
import type { Env } from "./env";
import { HttpError } from "./http";

const SESSION_PREFIX = "htr_";
const SESSION_DAYS = 180;
const RENEW_WITHIN_DAYS = 30;
const MAX_SESSIONS_PER_USER = 20;
const USER_AGENT = "herdr-token-rank";

export interface SessionUser {
  id: number;
  login: string;
  avatar_url: string | null;
  listed: boolean;
  share_commits: boolean;
  tokenHash: string;
}

interface GitHubTokenReply {
  access_token?: string;
  error?: string;
  interval?: number;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url?: string;
}

async function postGitHubForm(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams(form),
  });
  if (!response.ok) throw new HttpError(502, "github_unavailable", `GitHub answered ${response.status}.`);
  return response.json();
}

/** Starts GitHub's device flow. The person enters `user_code` at `verification_uri`. */
export async function startDeviceFlow(env: Env) {
  const reply = await postGitHubForm("https://github.com/login/device/code", { client_id: env.GITHUB_CLIENT_ID, scope: "" });
  if (typeof reply.device_code !== "string") throw new HttpError(502, "github_unavailable", String(reply.error ?? "no device code"));
  return {
    device_code: reply.device_code,
    user_code: reply.user_code,
    verification_uri: reply.verification_uri,
    expires_in: reply.expires_in,
    interval: reply.interval,
  };
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": USER_AGENT,
    },
  });
  if (!response.ok) throw new HttpError(502, "github_unavailable", `GitHub user lookup answered ${response.status}.`);
  const user = (await response.json()) as GitHubUser;
  if (!Number.isSafeInteger(user.id) || typeof user.login !== "string") throw new HttpError(502, "github_unavailable");
  return user;
}

/** The GitHub token is only needed to learn who signed in; drop it at GitHub too when we can. */
async function revokeGitHubToken(env: Env, accessToken: string): Promise<void> {
  if (!env.GITHUB_CLIENT_SECRET) return;
  await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
    method: "DELETE",
    headers: {
      authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
      accept: "application/vnd.github+json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
}

async function createSession(env: Env, user: GitHubUser, nowMs: number): Promise<string> {
  const token = randomToken(SESSION_PREFIX);
  const tokenHash = await sha256Hex(token);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, login, avatar_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT (id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`,
    ).bind(user.id, user.login, user.avatar_url ?? null, nowMs),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
      .bind(tokenHash, user.id, nowMs, nowMs + SESSION_DAYS * DAY_MS),
    env.DB.prepare(
      `DELETE FROM sessions WHERE user_id = ?1 AND token_hash NOT IN
         (SELECT token_hash FROM sessions WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2)`,
    ).bind(user.id, MAX_SESSIONS_PER_USER),
  ]);
  return token;
}

/** One poll of the device flow. On approval it creates our own session and forgets the GitHub token. */
export async function pollDeviceFlow(env: Env, ctx: ExecutionContext, deviceCode: string, nowMs: number) {
  const reply = (await postGitHubForm("https://github.com/login/oauth/access_token", {
    client_id: env.GITHUB_CLIENT_ID,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  })) as GitHubTokenReply;

  if (reply.error === "authorization_pending") return { status: "pending" as const };
  if (reply.error === "slow_down") return { status: "slow_down" as const, interval: reply.interval };
  if (reply.error === "expired_token") return { status: "expired" as const };
  if (reply.error === "access_denied") return { status: "denied" as const };
  if (!reply.access_token) throw new HttpError(400, "device_flow_failed", reply.error ?? "no token");

  const accessToken = reply.access_token;
  const user = await fetchGitHubUser(accessToken);
  ctx.waitUntil(revokeGitHubToken(env, accessToken).catch((error) => console.error("token revoke failed", String(error))));
  const token = await createSession(env, user, nowMs);
  return { status: "ok" as const, token, user: { login: user.login, avatar_url: user.avatar_url ?? null } };
}

/** The signed-in user for a `Bearer htr_…` header. Renews sessions that are close to expiring. */
export async function requireUser(request: Request, env: Env, nowMs: number): Promise<SessionUser> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (htr_[A-Za-z0-9_-]{43})$/.exec(header);
  if (!match?.[1]) throw new HttpError(401, "unauthorized");
  const tokenHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.login, u.avatar_url, u.listed, u.share_commits FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1`,
  ).bind(tokenHash).first<{ expires_at: number; id: number; login: string; avatar_url: string | null; listed: number; share_commits: number }>();
  if (!row || row.expires_at <= nowMs) throw new HttpError(401, "unauthorized");
  if (row.expires_at - nowMs < RENEW_WITHIN_DAYS * DAY_MS) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ?2 WHERE token_hash = ?1")
      .bind(tokenHash, nowMs + SESSION_DAYS * DAY_MS).run();
  }
  return {
    id: row.id,
    login: row.login,
    avatar_url: row.avatar_url,
    listed: row.listed === 1,
    share_commits: row.share_commits === 1,
    tokenHash,
  };
}

/** Applies the owner's settings. Turning commit sharing off forgets the commits already sent. */
export async function updateSettings(env: Env, user: SessionUser, body: unknown, nowMs: number) {
  const { listed, share_commits: shareCommits } = (body ?? {}) as { listed?: unknown; share_commits?: unknown };
  if ((listed !== undefined && typeof listed !== "boolean") || (shareCommits !== undefined && typeof shareCommits !== "boolean")) {
    throw new HttpError(400, "bad_settings", "listed and share_commits must be booleans.");
  }
  const next = { listed: listed ?? user.listed, share_commits: shareCommits ?? user.share_commits };
  const statements = [
    env.DB.prepare("UPDATE users SET listed = ?2, share_commits = ?3, updated_at = ?4 WHERE id = ?1")
      .bind(user.id, next.listed ? 1 : 0, next.share_commits ? 1 : 0, nowMs),
  ];
  if (!next.share_commits) {
    statements.push(
      env.DB.prepare("DELETE FROM commit_marks WHERE user_id = ?1").bind(user.id),
      env.DB.prepare("UPDATE period_totals SET commits = 0, updated_at = ?2 WHERE user_id = ?1").bind(user.id, nowMs),
    );
  }
  await env.DB.batch(statements);
  return next;
}

export async function endSession(env: Env, user: SessionUser): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(user.tokenHash).run();
}

/** Removes the account and everything uploaded for it (sessions and totals cascade). */
export async function deleteAccount(env: Env, user: SessionUser): Promise<void> {
  await env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(user.id).run();
}
