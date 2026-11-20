-- GitHub accounts that signed in. `hidden` is the manual admin switch that keeps
-- an account off the public leaderboard.
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Only the SHA-256 of a session token is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- One row per user, machine and UTC day. Each upload replaces the day's totals.
CREATE TABLE device_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  cost_micros INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, day)
) WITHOUT ROWID;
CREATE INDEX device_days_user_day ON device_days(user_id, day);
CREATE INDEX device_days_day ON device_days(day);

-- A keyed hash per commit, so a commit seen on two machines counts once.
CREATE TABLE commit_marks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mark TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, mark)
) WITHOUT ROWID;
CREATE INDEX commit_marks_user_day ON commit_marks(user_id, day);
CREATE INDEX commit_marks_day ON commit_marks(day);

-- Per-period totals kept up to date on every upload, so a leaderboard read
-- touches only the rows it returns.
CREATE TABLE period_totals (
  period TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokens INTEGER NOT NULL,
  cost_micros INTEGER NOT NULL,
  commits INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (period, user_id)
) WITHOUT ROWID;
CREATE INDEX period_totals_cost ON period_totals(period, cost_micros DESC);
CREATE INDEX period_totals_tokens ON period_totals(period, tokens DESC);
CREATE INDEX period_totals_commits ON period_totals(period, commits DESC);
CREATE INDEX period_totals_user ON period_totals(user_id);
