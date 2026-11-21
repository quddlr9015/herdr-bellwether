// New releases come from GitHub: a daily look at the latest release, and an
// install that runs helpers/update.sh when the person presses Update.

const LATEST = "https://api.github.com/repos/quddlr9015/herdr-bellwether/releases/latest";
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** Positive when version `a` is newer than `b` ("1.10.0" > "1.9.2"). */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** { tag, version, url } of the newest published release. */
export async function latestRelease() {
  const response = await fetch(LATEST, { headers: { accept: "application/vnd.github+json", "user-agent": "bellwether-herdr-mod" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const data = await response.json();
  const tag = String(data.tag_name ?? "");
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("GitHub's latest release has no version tag");
  return { tag, version: tag.slice(1), url: String(data.html_url ?? "") };
}
