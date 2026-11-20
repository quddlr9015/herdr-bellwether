import { hmacHex, hmacKey } from "./crypto";
import { periodsTouching } from "./dates";
import type { Env } from "./env";
import { FAMILIES, costMicros, modelFamily, totalTokens } from "./pricing";
import type { Upload, UploadDay } from "./validate";

/** A day's tokens and cost per model family, families with no usage left out. */
export function familyTotals({ day, rows }: UploadDay) {
  const byFamily = new Map<string, { tokens: number; cost: number }>();
  for (const row of rows) {
    const family = modelFamily(row);
    const total = byFamily.get(family) ?? { tokens: 0, cost: 0 };
    total.tokens += totalTokens(row);
    total.cost += costMicros(row, day);
    byFamily.set(family, total);
  }
  return FAMILIES.filter((family) => byFamily.has(family))
    .map((family) => [day, family, byFamily.get(family)!.tokens, Math.round(byFamily.get(family)!.cost)] as const);
}

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

  const touched = periodsTouching(upload.days.map(({ day }) => day));
  const periods = touched.map((p) => [p.key, p.from, p.to]);
  const familyPeriods = touched.flatMap((p) => FAMILIES.map((family) => [`${family}:${p.key}`, family, p.from, p.to]));
  const familyDays = upload.days.flatMap(familyTotals);

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
    // Family rows: the uploaded days are replaced whole, so a family that vanished from a day drops out.
    env.DB.prepare(
      `DELETE FROM device_family_days WHERE user_id = ?1 AND device_id = ?2 AND day IN (SELECT value FROM json_each(?3))`,
    ).bind(userId, upload.deviceId, JSON.stringify(upload.days.map(({ day }) => day))),
    env.DB.prepare(
      `INSERT INTO device_family_days (user_id, device_id, day, family, tokens, cost_micros, updated_at)
       SELECT ?1, ?2, d.value ->> '$[0]', d.value ->> '$[1]', d.value ->> '$[2]', d.value ->> '$[3]', ?3 FROM json_each(?4) AS d`,
    ).bind(userId, upload.deviceId, nowMs, JSON.stringify(familyDays)),
    env.DB.prepare(
      `INSERT INTO period_totals (period, user_id, tokens, cost_micros, commits, updated_at)
       SELECT p.value ->> '$[0]', ?1,
         COALESCE((SELECT SUM(f.tokens) FROM device_family_days f WHERE f.user_id = ?1 AND f.family = p.value ->> '$[1]'
                   AND f.day BETWEEN p.value ->> '$[2]' AND p.value ->> '$[3]'), 0),
         COALESCE((SELECT SUM(f.cost_micros) FROM device_family_days f WHERE f.user_id = ?1 AND f.family = p.value ->> '$[1]'
                   AND f.day BETWEEN p.value ->> '$[2]' AND p.value ->> '$[3]'), 0),
         0, ?2
       FROM json_each(?3) AS p WHERE true
       ON CONFLICT (period, user_id) DO UPDATE SET
         tokens = excluded.tokens, cost_micros = excluded.cost_micros, updated_at = excluded.updated_at`,
    ).bind(userId, nowMs, JSON.stringify(familyPeriods)),
  ]);

  return { days: dayTotals.length, commits: marks.length, periods: periods.length };
}
