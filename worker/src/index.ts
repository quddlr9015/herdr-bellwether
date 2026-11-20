import { deleteAccount, endSession, pollDeviceFlow, requireUser, startDeviceFlow, updateSettings } from "./auth";
import { DAY_MS, dayStartMs, type PeriodKind, utcDay } from "./dates";
import type { Env, RateLimiter } from "./env";
import { HttpError, errorResponse, json, readJson } from "./http";
import { type Board, METRICS, type Metric, leaderboard, profile, standing } from "./leaderboard";
import { FAMILIES, PRICING, PRICING_VERSION } from "./pricing";
import { saveUpload } from "./usage";
import { parseUpload } from "./validate";

const MAX_UPLOAD_BYTES = 512 * 1024;
const PUBLIC_TTL_S = 60;
const PRICING_TTL_S = 60 * 60;
const HISTORY_DAYS = 400;
const PERIOD_KINDS: readonly PeriodKind[] = ["day", "week", "month"];
const PROFILE_PATH = /^\/v1\/users\/([A-Za-z0-9-]{1,39})$/;
const KNOWN_PATHS = ["/v1/health", "/v1/pricing", "/v1/leaderboard", "/v1/auth/device", "/v1/auth/token", "/v1/auth/logout", "/v1/me", "/v1/usage"];

async function limit(limiter: RateLimiter, key: string): Promise<void> {
  const { success } = await limiter.limit({ key });
  if (!success) throw new HttpError(429, "rate_limited", "Too many requests. Try again in a minute.");
}

const clientIp = (request: Request) => request.headers.get("cf-connecting-ip") ?? "unknown";

/** Signed-in endpoints: an IP limit first, so made-up tokens cannot hammer the session lookup. */
async function signedIn(request: Request, env: Env, nowMs: number) {
  await limit(env.READ_LIMITER, clientIp(request));
  return requireUser(request, env, nowMs);
}

/** period, metric and date query parameters, defaulting to today's daily cost ranking. */
function rankingQuery(url: URL, nowMs: number) {
  const kind = (url.searchParams.get("period") ?? "day") as PeriodKind;
  const metric = (url.searchParams.get("metric") ?? "cost") as Metric;
  const day = url.searchParams.get("date") ?? utcDay(nowMs);
  if (!PERIOD_KINDS.includes(kind)) throw new HttpError(400, "bad_period");
  if (!(metric in METRICS)) throw new HttpError(400, "bad_metric");
  const board = (url.searchParams.get("family") ?? "all") as Board;
  if (board !== "all" && !(FAMILIES as readonly string[]).includes(board)) throw new HttpError(400, "bad_family");
  if (board !== "all" && metric === "commits") throw new HttpError(400, "bad_metric", "Commits are not split by model family.");
  const start = dayStartMs(day);
  if (start === null || start > nowMs + DAY_MS || start < nowMs - HISTORY_DAYS * DAY_MS) throw new HttpError(400, "bad_date");
  return { kind, metric, day, board };
}

/**
 * Public answers are identical for everyone, so they are cached at the edge.
 * Only a cache miss counts against the caller's read limit.
 */
async function cachedPublic(request: Request, env: Env, ctx: ExecutionContext, cacheUrl: string, ttlS: number, produce: () => Promise<Response>) {
  const cacheKey = new Request(cacheUrl);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  await limit(env.READ_LIMITER, clientIp(request));
  const response = await produce();
  if (response.ok) {
    response.headers.set("cache-control", `public, max-age=${ttlS}`);
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  }
  return response;
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const nowMs = Date.now();
  const endpoint = `${request.method} ${url.pathname}`;

  switch (endpoint) {
    case "GET /v1/health":
      return json({ ok: true, pricing_version: PRICING_VERSION });

    case "GET /v1/pricing":
      return cachedPublic(request, env, ctx, `${url.origin}/v1/pricing?v=${PRICING_VERSION}`, PRICING_TTL_S, async () => json(PRICING));

    case "GET /v1/leaderboard": {
      const { kind, metric, day, board } = rankingQuery(url, nowMs);
      const cacheUrl = `${url.origin}/v1/leaderboard?period=${kind}&metric=${metric}&date=${day}&family=${board}`;
      return cachedPublic(request, env, ctx, cacheUrl, PUBLIC_TTL_S, async () =>
        json({ ...(await leaderboard(env, kind, metric, day, board)), generated_at: new Date(nowMs).toISOString() }));
    }

    case "POST /v1/auth/device": {
      await limit(env.AUTH_LIMITER, clientIp(request));
      return json(await startDeviceFlow(env));
    }

    case "POST /v1/auth/token": {
      await limit(env.AUTH_LIMITER, clientIp(request));
      const body = await readJson(request, 4096);
      const deviceCode = (body as { device_code?: unknown })?.device_code;
      if (typeof deviceCode !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceCode)) throw new HttpError(400, "bad_device_code");
      return json(await pollDeviceFlow(env, ctx, deviceCode, nowMs));
    }

    case "POST /v1/auth/logout": {
      const user = await signedIn(request, env, nowMs);
      await endSession(env, user);
      return json({ ok: true });
    }

    case "GET /v1/me": {
      const user = await signedIn(request, env, nowMs);
      const { kind, metric, day, board } = rankingQuery(url, nowMs);
      const mine = await standing(env, user.id, kind, metric, day, board);
      return json({
        user: { login: user.login, avatar_url: user.avatar_url },
        settings: { listed: user.listed, share_commits: user.share_commits },
        ...mine,
      });
    }

    case "PATCH /v1/me": {
      const user = await signedIn(request, env, nowMs);
      await limit(env.WRITE_LIMITER, `user:${user.id}`);
      return json({ settings: await updateSettings(env, user, await readJson(request, 1024), nowMs) });
    }

    case "DELETE /v1/me": {
      const user = await signedIn(request, env, nowMs);
      await deleteAccount(env, user);
      return json({ ok: true });
    }

    case "POST /v1/usage": {
      const user = await signedIn(request, env, nowMs);
      await limit(env.WRITE_LIMITER, `user:${user.id}`);
      const upload = parseUpload(await readJson(request, MAX_UPLOAD_BYTES), nowMs);
      return json({ ok: true, ...(await saveUpload(env, user.id, user.share_commits, upload, nowMs)) });
    }
  }

  const login = PROFILE_PATH.exec(url.pathname)?.[1];
  if (login && request.method === "GET") {
    const cacheUrl = `${url.origin}/v1/users/${login.toLowerCase()}?day=${utcDay(nowMs)}`;
    return cachedPublic(request, env, ctx, cacheUrl, PUBLIC_TTL_S, async () => {
      const found = await profile(env, login, nowMs);
      if (!found) throw new HttpError(404, "not_found", "No public profile with that login.");
      return json(found);
    });
  }
  if (KNOWN_PATHS.includes(url.pathname) || login) throw new HttpError(405, "method_not_allowed");
  throw new HttpError(404, "not_found");
}

/** Daily cleanup: expired sessions and anything older than the history window. */
async function cleanUp(env: Env, nowMs: number): Promise<void> {
  const cutoff = utcDay(nowMs - HISTORY_DAYS * DAY_MS);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(nowMs),
    env.DB.prepare("DELETE FROM device_days WHERE day < ?1").bind(cutoff),
    env.DB.prepare("DELETE FROM commit_marks WHERE day < ?1").bind(cutoff),
    env.DB.prepare("DELETE FROM period_totals WHERE period LIKE 'd%' AND substr(period, 2) < ?1").bind(cutoff),
  ]);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error, error.status === 429 ? { "retry-after": "60" } : {});
      }
      console.error("unhandled", error instanceof Error ? error.stack : String(error));
      return errorResponse(new HttpError(500, "internal_error", "Something went wrong."));
    }
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(cleanUp(env, Date.now()));
  },
} satisfies ExportedHandler<Env>;
