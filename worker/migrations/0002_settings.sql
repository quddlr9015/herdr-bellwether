-- Owner-controlled settings. `listed = 0` keeps the account off public boards and
-- profiles; `share_commits = 0` drops its commit marks and ignores new ones.
ALTER TABLE users ADD COLUMN listed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN share_commits INTEGER NOT NULL DEFAULT 1;
CREATE INDEX users_login ON users(login COLLATE NOCASE);
