// Token Rank: its labels go through tr() for the interface language; stored labels stay English and are translated here, at display.
import { tr } from "../../lib/locale.js";

const WARN = 70;
const HOT = 90;
const PACE_MARGIN_POINTS = 10;

export function timeLeft(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return tr("<1m");
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return tr("{d}d {h}h", { d, h });
  if (h > 0) return tr("{h}h {m}m", { h, m });
  return tr("{m}m", { m });
}

export function tokens(n) {
  if (n < 1000) return String(n);
  if (n < 999500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
}

export function level(percent) {
  if (percent >= HOT) return "hot";
  if (percent >= WARN) return "warn";
  return "ok";
}

function verdict(percent, clock) {
  if (percent > clock + PACE_MARGIN_POINTS) return "ahead";
  if (percent < clock - PACE_MARGIN_POINTS) return "under";
  return "on pace";
}

export function pace(w, now) {
  if (w.resetsAt == null || !w.durationSec) return null;
  const elapsed = Math.min(1, Math.max(0, 1 - (w.resetsAt - now) / w.durationSec));
  return { elapsed, verdict: verdict(w.percent, elapsed * 100) };
}

export function ago(epoch, now) {
  const s = Math.max(0, now - epoch);
  if (s < 90) return tr("just now");
  if (s < 3600) return tr("{n} min ago", { n: Math.round(s / 60) });
  if (s < 86400) return tr("{n} h ago", { n: Math.round(s / 3600) });
  return tr("{n} d ago", { n: Math.round(s / 86400) });
}

// Window labels are made in English when a reading is fetched (and kept in
// shared state), so they are translated when shown: "5-hour", "Weekly",
// "Weekly · Fable", "Spark · 5-hour", "5h", "week", "Spark 5h".
function windowWord(word) {
  const hours = /^(\d+)-hour$/.exec(word) ?? /^(\d+)h$/.exec(word);
  if (hours) return tr(word.endsWith("h") ? "{n}h" : "{n}-hour", { n: hours[1] });
  return ["Weekly", "week", "primary", "secondary"].includes(word) ? tr(word) : word;
}

export function windowLabel(label) {
  const s = String(label ?? "");
  const dot = s.lastIndexOf(" · ");
  if (dot >= 0) {
    const head = s.slice(0, dot);
    const tail = s.slice(dot + 3);
    return head === "Weekly" ? tr("Weekly · {scope}", { scope: tail }) : `${head} · ${windowWord(tail)}`;
  }
  const space = s.lastIndexOf(" ");
  return space >= 0 ? `${s.slice(0, space)} ${windowWord(s.slice(space + 1))}` : windowWord(s);
}

/** A provider's error message, stored in English; unknown messages show as they are. */
export function reportMessage(message) {
  const count = /^Couldn't count (.+) tokens$/.exec(message ?? "");
  return count ? tr("Couldn't count {name} tokens", { name: count[1] }) : tr(message);
}
