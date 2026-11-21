# Bellwether for Herdr

Track your **Claude Code and Codex token usage and cost** in [Herdr](https://herdr.dev)'s status bar, next to your plan limits, and see where you rank among other Herdr users: daily, weekly and monthly leaderboards for all models, Claude or Codex. A bellwether is the belled ram that leads the flock.

![Bellwether: usage, the leaderboard for all models and for Codex, and settings](demo.gif)

**Install with your agent.** In Herdr, ask your agent:

> Add herdr.dev/mods/quddlr9015/herdr-bellwether

It reads [RECIPE.md](RECIPE.md) and the files, tells you what the mod runs and reaches, and copies it in. Or install it by hand (below). Your usage stays on your machine until you sign in to rank.

Everything is in one block with one panel, opened by a click. The left part of the block is [herdr-usage-limits](https://github.com/nozikov/herdr-usage-limits), bundled with the same look: each provider's icon with its 5-hour, weekly and per-model limits as bars with a pace mark and a percentage. The right part is Bellwether: today's estimated cost and tokens, a seven-day sparkline and your rank.

Bellwether reads the session logs Claude Code and Codex already write on your machine, prices every request per model, counts the commits you made in the repositories your agents worked in, and puts it all in a panel with four tabs (a click on the block opens it; a click outside or Escape closes it):

- **Overview**: the plan limits panel from usage-limits (this session's context, every limit with its pace and time to reset, its refresh and settings), then today's and this week's cost and your weekly rank.
- **Usage**: today, this week and this month; the last 30 days split by Claude and Codex; your top models; a six-week activity map and your streak. Works without signing in, and nothing leaves your machine until you do.
- **Ranking**: daily, weekly and monthly leaderboards for all models, Claude or Codex, ranked by tokens (each row also shows the estimated cost) or, across all models, by commits, with medals, rank changes against the previous period, past periods, and a profile for every listed user.
- **Settings**: GitHub sign-in, whether you are listed, whether commit counts are shared, a weekly summary to paste anywhere, and deleting your data.


## Install by hand

1. Copy `mods/bellwether` into `~/.config/herdr-app/mods/`.
2. Put it in a layout. In the default layout's status row, add a block next to the existing ones:

   ```json
   { "id": "bellwether", "type": "block", "size": { "weight": 3.4 }, "min": 330, "content": { "mod": "bellwether" } }
   ```

   It already shows plan limits, so remove a separate `usage-limits` block if you have one. Limit display choices made there carry over until you change them in Bellwether.

3. Run `herdr-app check ~/.config/herdr-app/mods/bellwether`.

The status bar shows today's cost and tokens and a seven-day sparkline as soon as the first scan finishes. Click it, open **Ranking** and choose **Sign in with GitHub** to join.

Optional keys (`keys.json`): `"bellwether:open"` (the same panel in a tab), `"bellwether:refresh"`, `"bellwether:sign-in"`, `"bellwether:sign-out"`, `"bellwether:check-update"`, `"bellwether:update"`. The same commands run from a shell with `herdr-app do bellwether.open`.

Requirements: macOS or Linux, `git`, `curl`, `sh` and `awk`. [ripgrep](https://github.com/BurntSushi/ripgrep) is used when it is installed and makes the first scan of a large history much faster. Plan limits come from the installed `claude` and `codex` CLIs, as described in [herdr-usage-limits](https://github.com/nozikov/herdr-usage-limits#readme).

## Reporting a problem

Settings → **Report a problem** opens a new GitHub issue with the versions (Bellwether, Herdr, OS), the last scan result and the pricing table version filled in; nothing is sent until you submit it, and it never includes your login, numbers or file paths. A profile's **Report** button opens an account report for that login. The version lives in `mods/bellwether/lib/version.js`; releases are tagged `v<version>`.

## Updating

Once a day the mod asks GitHub for the latest release (one unauthenticated request). When a newer one is out it says so once, puts a dot on the logo, and Settings offers **Update to x.y.z**: `helpers/update.sh` downloads that tag's source archive, checks it carries that version, keeps a copy of the current folder in `~/.local/state/herdr-token-rank/backups` (the last three) and copies the new mod in, and Herdr reloads it. To release: bump `VERSION`, commit, tag `v<version>`, push the tag and publish a GitHub release for it.

## What is sent

Nothing leaves your machine until you sign in, apart from downloading the price table and public leaderboards. After you sign in, every 10 minutes the mod uploads, per UTC day:

- model ids with token counts (input, cache reads, cache writes, output), grouped by prompt size so long-context prices apply;
- the first 16 hex characters of each commit id you authored in the last 40 days, unless you turn commit sharing off (the server stores only a keyed hash of them, so a commit seen on two machines counts once);
- a random id for the machine, so two machines add up instead of overwriting each other.

Prompts, code, file names, repository names and paths are never sent. The leaderboard and your profile show your GitHub login, avatar and totals; turn **Show me on the leaderboard** off to keep them private (an open profile can stay cached for up to a minute). GitHub sign-in asks for no permissions (public profile only), and the server never stores the GitHub token. **Delete my data** removes your account and everything uploaded for it.

## How it counts

- **Claude Code**: `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR`). One request per message id and request id; a streamed request written twice counts once.
- **Codex**: `~/.codex/sessions` and `archived_sessions` (or `$CODEX_HOME`). One request per `token_count` event. Resumed sessions and subagents replay their parent's events in a new file; those replays are recognised by session, model, request usage and running total, and count once.
- **Cost** uses [pricing.json](worker/src/pricing.json) from [ai-token-monitor](https://github.com/soulduse/ai-token-monitor): list API prices per model, including cache and long-context tiers. The mod and the server share one implementation ([pricing.js](mods/bellwether/lib/pricing.js)), and the mod downloads the server's table, so the numbers you see match the leaderboard. Subscription plans are not reflected.
- **Commits** are non-merge commits on any branch whose author email matches `git config user.email` of that repository.
- Days are UTC days so everyone shares the same boundaries.

The scanner (`mods/bellwether/helpers`) records each request once in a local ledger under `~/.local/state/herdr-token-rank` and only re-reads log files that grew. A first scan of a large history runs in several 7-minute steps; later scans take seconds.

## Server

`worker/` is a Cloudflare Worker with a D1 database, deployed at `https://herdr-rank-api.kohanacloud.com`.

| Endpoint | Purpose |
|---|---|
| `GET /v1/leaderboard?period=day\|week\|month&metric=cost\|tokens\|commits[&date=YYYY-MM-DD]` | Top 100 with each entry's rank in the previous period, cached at the edge for 60 s |
| `GET /v1/users/:login` | A listed user's last 30 days and week and month totals, cached for 60 s |
| `GET /v1/pricing` | The price table the server ranks with, cached for an hour |
| `GET /v1/me?period=&metric=[&date=]` | Your totals, rank and settings |
| `PATCH /v1/me` | `{ "listed": bool, "share_commits": bool }` |
| `POST /v1/usage` | Upload day totals |
| `POST /v1/auth/device`, `POST /v1/auth/token` | GitHub device flow |
| `POST /v1/auth/logout`, `DELETE /v1/me` | End the session, delete the account |

Every upload replaces that machine's day totals and recomputes the user's day, week and month totals in one transaction, so a leaderboard read touches only the rows it returns. Uploads are validated (40-day window, integer counts, size limits) and rate limited per user; every endpoint is rate limited per IP.

### Operate

```sh
cd worker
npm install
npm test && npm run typecheck
npm run migrate:remote     # after adding a migration
npm run deploy
```

- Secret: `COMMIT_MARK_KEY` (`openssl rand -hex 32 | npx wrangler secret put COMMIT_MARK_KEY`). Optional `GITHUB_CLIENT_SECRET` lets the server revoke each GitHub token right after sign-in.
- Prices: replace `worker/src/pricing.json` with a newer copy from ai-token-monitor, run the tests, deploy. Mods pick up the new table within a day; days already stored on the server keep their cost until a machine uploads them again.
- Hide an account from public boards: `npx wrangler d1 execute herdr-token-rank --remote --command "UPDATE users SET hidden = 1 WHERE login = 'name'"`.
- A daily cron removes expired sessions and data older than 400 days.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
