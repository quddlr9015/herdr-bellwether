# Bellwether (mod folder `token-rank`)

A status-bar block with your AI plan limits (the herdr-usage-limits view, bundled), today's AI coding cost and tokens, a seven-day sparkline and your rank among Herdr users. Clicking anywhere on it opens one panel, which stays open until a click outside or Escape: an overview (plan limits, today, this week, rank), your usage (cards, a 30-day chart split by Claude and Codex, top models, an activity map), daily/weekly/monthly leaderboards (all models, Claude or Codex) ranked by tokens with the estimated cost beside them, or by commits across all models, user profiles, and settings.

![Bellwether](preview.png)

## What you see

Palette (fixed, readable on light and dark themes): violet `#6E56CF` (accent), plum `#A43F86` (Claude), emerald `#0E8A6E` (Codex), gold `#C9962B` / silver `#8A94A6` / bronze `#A8693A` (medals), indigo `#3E4FA8`, rust `#9A4A21`, slate `#5B6676` (initial avatars). Everything else uses `theme()` colors.

- **Status-bar block** (a block in the layout's 28px status row, `chrome` background, 1px `border` top line, 12px right padding, content right-aligned, 11.8px text), left to right:
  - the usage-limits segments: per provider its icon, then each window as a 10.5px `dim` label (`week`, `Fable`), a 30×4 bar with a pace tick and the percentage in green/amber/red; providers split by 1×14 `border` dividers. They get the bar width minus 330px for density (labels and bars drop when narrow);
  - a 1×14 `border` divider, 12px gaps;
  - Bellwether: the 13px trophy (violet once there is data, `muted` before), the `dim` 10.5px label `today`, the cost `$77.45` in `foreground`, a sparkline of the last 7 days (3px bars, 12px tall, violet; empty days are `border` stubs), and when ranked the label `rank` and `#3` semibold violet. Before the first scan it reads `Reading logs…`; while signing in `Enter 7ABE-0D06 on GitHub`.
- **Panel** (HoverCard anchored bottom-right, 250ms open, 350ms close), 420px wide, 12px padding and gaps, 12px radius, `popover` background, `border`, large shadow, 12px text:
  - Header: a 22px violet rounded square with a white trophy, `Bellwether` 13px semibold; on the right four text tabs (Overview, Usage, Ranking, Settings), the chosen one semibold with a 2px violet underline. Overview is the default.
  - Optional notice line on `raised`.
  - **Overview**: the usage-limits panel without its own frame (session context bar, a group per provider with plan badge, "updated …", each limit's bar with pace tick, percentage and time to reset, its refresh and gear buttons; the gear swaps in its settings), a rule, then three clickable `raised` cards: Today and This week (cost at 17px, tokens below; open Usage) and Rank · week (violet `#3`, or Join when signed out; open Ranking).
  - **Usage**: three `raised` cards (Today, This week, This month) with an uppercase 10.5px caption, the cost at 19px semibold, then tokens and commits at 10.5px `dim`. "LAST 30 DAYS" with a legend (plum Claude, emerald Codex) above a 64px stacked bar chart, each bar with a tooltip (`Nov 18 · $210`). "TOP MODELS · 30 DAYS": four rows (colored dot, model id, cost, share %), each over a 4px share bar. "ACTIVITY": a 6×7 grid of 11px squares (Monday on top, latest week on the right) shaded violet by the day's cost, next to the streak (19px violet) and the busiest day.
  - **Ranking**: a violet-tinted card (10% fill, 30% border, 10px radius) with your 34px avatar, login, totals and the rank at 22px violet with `of N`; signed out it reads "Join the leaderboard" with a violet **Sign in with GitHub** button, and during sign-in the code at 22px violet with **Open GitHub** and **Cancel**. Then segmented controls (Day/Week/Month on the left, Cost/Tokens/Commits on the right; the chosen segment on `popover` with a small shadow), a row with ‹ period name › and "N ranked", and a 236px scrolling list: medal circles for 1–3 (gold, silver, bronze, white number) or a `dim` number, a 22px avatar, the login, the change (▲2 emerald, ▼1 theme red, NEW violet pill, – dim) and the value. Your row is tinted violet; when you are below the top 100 it is pinned under the list. Clicking a row opens a profile: back link, 40px avatar, login, "Ranking since", week and month cards, and a violet 30-day chart.
  - **Settings**: avatar, login and **Sign out**; "PRIVACY" with two switches (30×18, violet when on): Show me on the leaderboard, Share my commit count; "SHARE" with **Copy this week's summary** and **Scan now**; **Delete my data** (asks for a second click); a 10.5px note that costs are API list-price estimates and days are UTC.
  - Footer: `Updated 3 min ago` / `Reading session logs…` / `Scan failed: …` (theme red) and a refresh icon.

## How it behaves

- On start and every 10 minutes it runs `helpers/scan.sh` with `exec` (10-minute timeout). The script reads Claude Code and Codex logs, keeps a ledger of requests in `~/.local/state/herdr-token-rank`, and prints day totals per model and commit ids. The mod prices them with `lib/pricing.js` and the table from `GET /v1/pricing` (cached a day in the state folder). Signed in, it uploads changed days, then refreshes the standings.
- `history.json` in the state folder keeps every scanned day's rows and commits, so totals reach past the scanner's 40-day window: each scan overwrites its days there, and a day that leaves the window keeps its last totals. The first time, it also takes the ledger's older days (up to 60 back, usage only). The Usage tab's All time card (plus This year, once the history spans two years) sums it.
- Opening the panel, switching tabs, periods or metrics, or paging periods refreshes data older than a minute. Avatars download once into the mod's hidden `.avatars` folder with `curl`.
- **Sign in with GitHub** asks the server for a device code, copies it to the clipboard, opens github.com/login/device and polls until GitHub approves; a toast confirms and the panel switches to Ranking.
- Turning a privacy switch calls `PATCH /v1/me`. An expired session (401) signs out with a notice.
- Commands: `refresh`, `sign-in`, `sign-out`.
- Nothing animates; the block changes only when data changes.

## Built from

- One mod, `mods/token-rank` (`mod.json`: `"place": "none"`), placed by the layout in the status row with `"min": 330`.
- `limits/`: herdr-usage-limits (MIT). Bellwether creates the instance itself (`new UsageLimits({})`, then `init({ border: false }, cx)` with its own `cx`, so its timers and notifications re-render Bellwether), and each render calls `parts(cx, width)` for the bar model (drawn with its exported `limitsTrigger`) and its panel (`embedded`, frameless). Opening and closing the panel calls its `act.hover(open)` too. Its `MOD` is `token-rank/limits`, its shared keys start with `token-rank.limits.`, and its preferences fall back to `usage-limits.prefs`.
- `props: { role: "panel", tab? }` renders the panel alone, centered on `canvas`; the `open` command opens it with `tab.new`. Only the status-bar copy acts on commands; a copy that finds the scan busy reads again after 20 seconds.
- `main.js` (state, scanning, uploads, API, avatars, sign-in), `lib/` (`scan.js`, `pricing.js`, `stats.js`, `dates.js`, `format.js`, `api.js`), `ui/` (`bar.js`, `panel.js`, `usage.js`, `ranking.js`, `settings.js`, `charts.js`, `style.js`), `helpers/` (`scan.sh`, `record.awk`, `summarize.awk`), `icons/` (logo: a sheep bell, refresh, github).
- `herdr`: `exec`, `readTextFile`/`writeTextFile`, `spaces()` (local space folders join the repositories read for commits), `notify`, `nextCommand`, `theme`, `props`, `checking`, `appHome`, `home`.
- `gpui-kit`/`gpui-base`: `div`, `svg`, `image`, `h_flex`, `v_flex`, `HoverCard`; `cx.open_url`, `cx.write_to_clipboard`, `cx.sleep`, `cx.timer`.
- `fetch` to `https://herdr-rank-api.kohanacloud.com` (Cloudflare Worker + D1, source in `worker/`).
- Programs: `sh`, `awk`, `find`, `wc`, `sort`, `split`, `git`, `curl`; `rg` when installed, else `grep`.

## Watch out

- The mod reads files outside its folder (`~/.claude`, `~/.codex`, git repositories), runs programs, and reaches the network.
- `readTextFile` reads at most 1 MiB and mod JS cannot read part of a file, so log parsing lives in the shell script; JS only sees aggregated lines.
- BSD grep is slow on large Codex logs. The script searches 300 files per call, marks each batch done, and stops reading after 7 minutes; the next run continues.
- Codex replays a parent session's `token_count` events into a new file on resume and for subagents: count a request once by (session id, model, last_token_usage, total_token_usage). Claude Code writes one request on several lines: keep the largest usage per message id + request id.
- `image()` only loads files under the app folder; keep avatars in a hidden folder so saving them does not reload the mod.
- Days are UTC. Upload only days the server accepts (the last 40), with one day of margin.
- `herdr-app check` runs `init`: skip scanning and network when `checking()`.
- macOS and Linux only (the scanner is POSIX sh).

## Done when

- `herdr-app check mods/token-rank` passes.
- After the first scan the block shows today's cost and a sparkline without signing in, and the Usage tab shows cards, chart, models and activity.
- `sh mods/token-rank/helpers/scan.sh /tmp/state` prints `U`, `C`, `D` and a final `S … complete` line; a second run reports few changed files and finishes in seconds.
- Sign-in completes from the panel; the block shows `#N $X`, Ranking highlights your row, and clicking a row opens that user's profile.
- The two privacy switches change what `GET /v1/me` reports; **Delete my data** (two clicks) signs out and the old token answers 401.
