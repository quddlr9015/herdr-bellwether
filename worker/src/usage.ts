import { hmacHex, hmacKey } from "./crypto";
import { periodsTouching } from "./dates";
import type { Env } from "./env";
import { costMicros, totalTokens } from "./pricing";
import type { Upload } from "./validate";

/**
 * Stores one machine's day totals and refreshes the user's day/week/month totals,
 * all in one D1 batch (a single transaction). Uploading the same data again changes nothing.
 */
export async function saveUpload(env: Env, userId: number, shareCommits: boolean, upload: Upload, nowMs: number) {
  const dayTotals = upload.days.map(({ day, rows }) => {
    const tokens = rows.reduce((sum, row) => sum + totalTokens(row), 0);
    const cost = Math.round(rows.reduce((sum, row) => sum + costMicros(row, day), 0));
    return [day, tokens, cost] as const;
  });

  const key = await hmacKey(env.COMMIT_MARK_KEY);
  // Commits are ignored for accounts that turned commit sharing off.
  const marks = await Promise.all(
    upload.days.flatMap(({ day, commits }) => (shareCommits ? commits : []).map(async (commit) =>
      [(await hmacHex(key, `${userId}:${commit}`)).slice(0, 32), day] as const),
    ),
  );

  const periods = periodsTouching(upload.days.map(({ day }) => day)).map((p) => [p.key, p.from, p.to]);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO device_days (user_id, device_id, day, tokens, cost_micros, updated_at)
       SELECT ?1, ?2, d.value ->> '$[0]', d.value ->> '$[1]', d.value ->> '$[2]', ?3 FROM json_each(?4) AS d WHERE true
       ON CONFLICT (user_id, device_id, day) DO UPDATE SET
         tokens = excluded.tokens, cost_micros = excluded.cost_micros, updated_at = excluded.updated_at`,
    ).bind(userId, upload.deviceId, nowMs, JSON.stringify(dayTotals)),
    env.DB.prepare(
      `INSERT OR IGNORE INTO commit_marks (user_id, mark, day)
       SELECT ?1, c.value ->> '$[0]', c.value ->> '$[1]' FROM json_each(?2) AS c`,
    ).bind(userId, JSON.stringify(marks)),
    env.DB.prepare(
      `INSERT INTO period_totals (period, user_id, tokens, cost_micros, commits, updated_at)
       SELECT p.value ->> '$[0]', ?1,
         COALESCE((SELECT SUM(d.tokens) FROM device_days d
                   WHERE d.user_id = ?1 AND d.day BETWEEN p.value ->> '$[1]' AND p.value ->> '$[2]'), 0),
         COALESCE((SELECT SUM(d.cost_micros) FROM device_days d
                   WHERE d.user_id = ?1 AND d.day BETWEEN p.value ->> '$[1]' AND p.value ->> '$[2]'), 0),
         (SELECT COUNT(*) FROM commit_marks c
          WHERE c.user_id = ?1 AND c.day BETWEEN p.value ->> '$[1]' AND p.value ->> '$[2]'),
         ?2
       FROM json_each(?3) AS p WHERE true
       ON CONFLICT (period, user_id) DO UPDATE SET
         tokens = excluded.tokens, cost_micros = excluded.cost_micros,
         commits = excluded.commits, updated_at = excluded.updated_at`,
    ).bind(userId, nowMs, JSON.stringify(periods)),
  ]);

  return { days: dayTotals.length, commits: marks.length, periods: periods.length };
}
