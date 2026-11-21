// GitHub issue forms with fields filled in from the URL. Nothing is sent: the
// person sees the issue page, can edit or delete anything, and submits it.

const REPO = "https://github.com/quddlr9015/herdr-bellwether";

const issueUrl = (template, fields) =>
  `${REPO}/issues/new?${Object.entries({ template, ...fields }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;

/** Diagnostics for a bug report: versions and the last scan, never a login, numbers or paths. */
export function diagnostics({ version, herdr, core, os, scanError, scannedAt, pricingVersion, signedIn }, home) {
  const scan = scanError
    ? `failed: ${scanError.split(home).join("~")}`
    : scannedAt ? `ok, ${new Date(scannedAt).toISOString().slice(0, 16)}Z` : "not finished yet";
  return [
    `- Bellwether: ${version}`,
    `- Herdr: ${herdr ?? "?"} (core ${core ?? "?"})`,
    `- OS: ${os ?? "?"}`,
    `- Last scan: ${scan}`,
    `- Pricing table: ${pricingVersion ? `v${pricingVersion}` : "not loaded"}`,
    `- Signed in: ${signedIn ? "yes" : "no"}`,
  ].join("\n");
}

export const bugReportUrl = (diag) => issueUrl("bug.yml", { diagnostics: diag });

export const accountReportUrl = (login) => issueUrl("account.yml", { title: `Account report: ${login}`, login });
