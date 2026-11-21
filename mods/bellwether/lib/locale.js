// Languages for the interface. Plain functions and tables, no Herdr imports, so
// any file can use them. main.js detects the system language once and sets the
// current one at the top of every render (`setCurrentLanguage`).
//
// Strings are written in English in the code and wrapped in `tr("…")`; each
// language's table maps that English text to its translation, with `{name}`
// placeholders filled from `tr(text, { name })`. A missing entry shows the
// English text.

/** The choices in Settings: "auto" follows the system. */
export const LANGUAGES = [
  ["auto", "System"],
  ["en", "English"],
  ["ko", "한국어"],
  ["ja", "日本語"],
  ["zh-Hans", "简体中文"],
  ["zh-Hant", "繁體中文"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
];
const CODES = LANGUAGES.slice(1).map(([code]) => code);

const tables = {};
let current = "en";

/** Adds translations: { ko: { "Today": "오늘", … }, ja: { … } }. */
export function addStrings(byLanguage) {
  for (const [code, table] of Object.entries(byLanguage)) tables[code] = { ...(tables[code] ?? {}), ...table };
}

/** "ko-KR", "zh_TW", "en_US.UTF-8" → a supported code, or null. */
export function matchLanguage(tag) {
  const t = String(tag ?? "").trim().replace(/_/g, "-").split(".")[0].toLowerCase();
  if (!t) return null;
  if (t.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(t) ? "zh-Hant" : "zh-Hans";
  const base = t.split("-")[0];
  return CODES.includes(base) ? base : null;
}

export function setCurrentLanguage(code) {
  current = CODES.includes(code) ? code : "en";
}

export const currentLanguage = () => current;

export function tr(text, vars) {
  const out = (current !== "en" && tables[current]?.[text]) || text;
  return vars ? out.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? "")) : out;
}

// ---- dates ------------------------------------------------------------------

const CJK_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const MONTH_SHORT = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ko: Array.from({ length: 12 }, (_, i) => `${i + 1}월`),
  ja: CJK_MONTHS,
  "zh-Hans": CJK_MONTHS,
  "zh-Hant": CJK_MONTHS,
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
};
const MONTH_LONG = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
};

const monthIndex = (day) => Number(day.slice(5, 7)) - 1;

/** The month's short name, for grid labels: "Nov", "11월", "11月", "nov.". */
export const monthAbbrev = (index) => (MONTH_SHORT[current] ?? MONTH_SHORT.en)[index];

/** A day without its year: "Nov 18", "11월 18일", "11月18日", "18 nov", "18. Nov.". */
export function formatShortDay(day) {
  const m = monthIndex(day);
  const d = Number(day.slice(8));
  switch (current) {
    case "ko": return `${m + 1}월 ${d}일`;
    case "ja": case "zh-Hans": case "zh-Hant": return `${m + 1}月${d}日`;
    case "es": case "fr": return `${d} ${MONTH_SHORT[current][m]}`;
    case "de": return `${d}. ${MONTH_SHORT.de[m]}`;
    default: return `${MONTH_SHORT.en[m]} ${d}`;
  }
}

/** A month with its year: "November 2026", "2026년 11월", "2026年11月", "noviembre de 2026". */
export function formatMonth(day) {
  const m = monthIndex(day);
  const y = day.slice(0, 4);
  switch (current) {
    case "ko": return `${y}년 ${m + 1}월`;
    case "ja": case "zh-Hans": case "zh-Hant": return `${y}年${m + 1}月`;
    case "es": return `${MONTH_LONG.es[m]} de ${y}`;
    case "fr": case "de": return `${MONTH_LONG[current][m]} ${y}`;
    default: return `${MONTH_LONG.en[m]} ${y}`;
  }
}
