-- Claude and Codex boards. One row per user, machine, UTC day and model family
-- (by the model's maker, the same split as the mod's charts). Each upload
-- replaces the uploaded days' rows. Family period totals live in period_totals
-- under keys prefixed with the family ("claude:w2026-11-16"); their commits are
-- 0, since a commit belongs to no one model.
CREATE TABLE device_family_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  family TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  cost_micros INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, day, family)
) WITHOUT ROWID;
CREATE INDEX device_family_days_user_day ON device_family_days(user_id, family, day);
