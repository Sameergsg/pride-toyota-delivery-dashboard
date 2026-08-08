/**
 * Robust date parsing for values coming out of Microsoft Graph's
 * workbook usedRange(valuesOnly=false) response.
 *
 * Graph gives us three parallel grids for a range: `values` (raw, which for
 * a date cell is usually an Excel serial number OR sometimes an already
 * locale-formatted string depending on how the sheet stores it), `text`
 * (the cell's displayed string, always a string) and `numberFormat`
 * (the Excel format code, e.g. "dd-mm-yyyy" / "m/d/yyyy" / "General").
 *
 * Strategy:
 *   1. If numberFormat looks like a date format AND the raw value is
 *      numeric -> treat as an Excel serial date number (epoch 1899-12-30,
 *      with the infamous Excel 1900 leap-year bug baked in the same way
 *      Excel itself computes it, so serial 60 => 1900-02-29 "phantom day"
 *      is intentionally NOT specially special-cased beyond matching what
 *      Excel/Graph would already have normalized away for real dates).
 *   2. Otherwise, try to parse the displayed `text` against a set of
 *      explicit known formats: DD-MM-YYYY, DD/MM/YYYY, ISO (YYYY-MM-DD).
 *   3. Blank / unparseable -> null. We never silently coerce garbage into
 *      a fake date.
 *
 * Output is always a strict "YYYY-MM-DD" string or null.
 */

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // 1899-12-30
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True if an Excel numberFormat code represents a date (not a plain number/currency/etc). */
export function isDateNumberFormat(fmt) {
  if (!fmt || typeof fmt !== 'string') return false;
  if (fmt.toLowerCase() === 'general') return false;
  // Date format codes use d/m/y tokens (and sometimes h/m/s for datetime,
  // but not when the only letters are h/m/s with no d/y — that's a pure time).
  const hasDateToken = /[dy]/i.test(fmt.replace(/\[[^\]]*\]/g, ''));
  const looksNumericOrText = /[#0",]/i.test(fmt) && !hasDateToken;
  return hasDateToken && !looksNumericOrText;
}

/** Convert an Excel serial day number to a "YYYY-MM-DD" string (UTC-safe, no TZ drift). */
export function excelSerialToISO(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  // Using epoch 1899-12-30 (two days before 1900-01-01, instead of one)
  // already absorbs Excel's infamous "1900 was a leap year" bug for every
  // real-world date from 1900-03-01 onward — no further adjustment needed.
  // (It's only serials 1-59, i.e. Jan/Feb 1900, that map slightly off —
  // irrelevant for a vehicle-delivery dataset with no dates that old.)
  const ms = EXCEL_EPOCH_MS + n * MS_PER_DAY;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function toISODate(y, m, d) {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const yyyy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Try explicit known text formats: ISO, DD-MM-YYYY, DD/MM/YYYY (also 2-digit years). */
export function parseDateText(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (s === '') return null;

  // ISO: YYYY-MM-DD (optionally with time suffix)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toISODate(+m[1], +m[2], +m[3]);

  // DD-MM-YYYY or DD/MM/YYYY (also DD.MM.YYYY), 2 or 4 digit year
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    let year = +yy;
    if (yy.length === 2) year += year < 70 ? 2000 : 1900;
    return toISODate(year, +mm, +dd);
  }

  // Fallback: let the JS Date parser try (handles things like "12 Jan 2024",
  // "January 12, 2024"). Reject if it can't produce a sane result.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /[a-zA-Z]/.test(s)) {
    return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return null;
}

/**
 * Main entry point: given the three Graph-provided parallel values for a
 * single cell, return a strict ISO date string or null.
 *
 * @param {*} rawValue   the cell's `values` entry (number | string | boolean | null)
 * @param {string} displayText the cell's `text` entry
 * @param {string} numberFormat the cell's `numberFormat` entry
 */
export function parseCellDate(rawValue, displayText, numberFormat) {
  const isNumeric =
    typeof rawValue === 'number' ||
    (typeof rawValue === 'string' && rawValue.trim() !== '' && !Number.isNaN(Number(rawValue)));

  if (isDateNumberFormat(numberFormat) && isNumeric) {
    const iso = excelSerialToISO(rawValue);
    if (iso) return iso;
  }

  // Also handle the case where numberFormat is missing/General but the raw
  // value is still a plausible Excel serial (Graph sometimes omits format
  // metadata on usedRange responses for certain sheet configurations).
  if (isNumeric && !isDateNumberFormat(numberFormat) && numberFormat) {
    // numberFormat explicitly says "not a date" (e.g. plain number/currency)
    // -> don't guess a date out of an arbitrary number.
  } else if (isNumeric && !numberFormat) {
    const n = Number(rawValue);
    // Plausible Excel date serial range: 1900-01-01 (1) .. ~2100-01-01 (73050)
    if (n > 0 && n < 80000) {
      const iso = excelSerialToISO(n);
      if (iso) return iso;
    }
  }

  return parseDateText(displayText ?? rawValue);
}
