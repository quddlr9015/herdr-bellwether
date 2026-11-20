export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  AUTH_LIMITER: RateLimiter;
  WRITE_LIMITER: RateLimiter;
  READ_LIMITER: RateLimiter;
  /** Public client id of the GitHub OAuth app (device flow enabled). */
  GITHUB_CLIENT_ID: string;
  /** Optional. When set, the GitHub token is revoked right after sign-in. */
  GITHUB_CLIENT_SECRET?: string;
  /** Secret key for the commit hashes stored in commit_marks. */
  COMMIT_MARK_KEY: string;
}
