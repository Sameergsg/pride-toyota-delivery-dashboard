/**
 * Everything needed to turn "a Graph access token + a SharePoint share URL"
 * into normalized VehicleRow objects. Shared by scripts/sync.mjs (the
 * 30-min-cron GitHub Actions path) and azure-function/ (the real-time
 * webhook path) — one source of truth for the worksheet auto-detection,
 * column mapping, and date parsing logic so the two paths can't drift.
 */
import { parseCellDate } from './dateParser.mjs';

// --- Internal schema: fixed keys the frontend expects -----------------
// Source header (normalized: trimmed, whitespace-collapsed, lowercased)
// mapped to internal key + whether it's a date field.
export const HEADER_MAP = [
  ['sr. no.', 'srNo', false],
  ['invoice date', 'invoiceDate', true],
  ['aging', 'aging', false],
  ['chassis', 'chassis', false],
  ['eng no.', 'engNo', false],
  ['mf. year', 'mfYear', false],
  ['model', 'model', false],
  ['suffix', 'suffix', false],
  ['fuel', 'fuel', false],
  ['variant', 'variant', false],
  ['colour', 'colour', false],
  ['int. colour', 'intColour', false],
  ['tl name', 'tlName', false],
  ['so name', 'soName', false],
  ['customer name', 'customerName', false],
  ['ctdms status', 'ctdmsStatus', false],
  ['customer status', 'customerStatus', false],
  ['est delivery date', 'estDeliveryDate', true],
  ['ctdms invoice', 'ctdmsInvoice', false],
  ['dn date', 'dnDate', true],
  ['delivery date', 'deliveryDate', true],
  ['stock status', 'stockStatus', false],
  ['reference', 'reference', false],
  ['tfs payment date', 'tfsPaymentDate', true],
  ['ex-showroom', 'exShowroom', false],
  ['rto name', 'rtoName', false],
  ['remarks', 'remarks', false],
  ['stock location', 'stockLocation', false],
];

export function normalizeHeader(h) {
  return String(h ?? '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Uses TextEncoder + btoa (not Node's Buffer) so this module works
// unmodified in both Node and the browser — the browser is where the
// real-time direct-Graph-from-the-frontend path (see src/lib/liveGraph.ts)
// needs it.
export function base64UrlEncodeShareUrl(url) {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'u!' + urlSafe;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Graph occasionally returns transient 5xx (observed: 504
// MaxRequestDurationExceeded on large worksheet queries) — retry those a
// couple of times with backoff rather than failing the whole sync run.
export async function graphGet(token, url, attempt = 1) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status >= 500 && attempt < 3) {
      const delay = attempt * 3000;
      console.warn(`  ⚠ Graph ${res.status} on attempt ${attempt}, retrying in ${delay}ms…`);
      await sleep(delay);
      return graphGet(token, url, attempt + 1);
    }
    throw new Error(`Graph GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function resolveDriveItem(token, shareUrl) {
  const shareId = base64UrlEncodeShareUrl(shareUrl);
  // Note: `$expand=workbook` isn't supported on this endpoint (Graph
  // returns 501 NotImplemented) — and we don't need it, since we only
  // read driveId/itemId here and hit the workbook endpoints separately.
  const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`;
  return graphGet(token, url);
}

export function buildColumnMapping(headers) {
  // Map: source column index -> { key, isDate }
  const byNormalizedHeader = new Map(HEADER_MAP.map(([h, key, isDate]) => [h, { key, isDate }]));
  return headers.map((h) => byNormalizedHeader.get(normalizeHeader(h)) ?? null);
}

// A workbook may have many tabs (reports, summaries, etc alongside the
// actual data). Rather than blindly using the first table/worksheet, pick
// whichever one's header row matches our expected schema best — this way
// adding/reordering/renaming other tabs in the future can't silently break
// the sync.
const MIN_HEADER_MATCH = 8; // out of HEADER_MAP.length (28) — confidence floor

export async function findWorksheetAndTable(token, driveId, itemId) {
  const tablesUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables`;
  const tables = await graphGet(token, tablesUrl);
  if (tables.value && tables.value.length > 0) {
    if (tables.value.length === 1) return { table: tables.value[0] };
    // Multiple tables — score each by its header row, same as worksheets below.
    let best = null;
    let bestScore = 0;
    for (const t of tables.value) {
      const headerUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(t.name)}/headerRowRange`;
      const header = await graphGet(token, headerUrl);
      const score = buildColumnMapping(header.values[0]).filter(Boolean).length;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
      if (bestScore === HEADER_MAP.length) break; // perfect match — no need to check the rest
    }
    if (best && bestScore >= MIN_HEADER_MATCH) return { table: best };
    // Fall through to worksheet scoring if no table matches well.
  }

  const worksheetsUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const sheets = await graphGet(token, worksheetsUrl);
  if (!sheets.value || sheets.value.length === 0) {
    throw new Error('Workbook has no worksheets.');
  }

  let best = null;
  let bestScore = 0;
  for (const sheet of sheets.value) {
    const headerUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheet.name)}')/range(address='1:1')?$select=values`;
    const headerRes = await graphGet(token, headerUrl);
    const headerRow = headerRes.values?.[0] ?? [];
    const score = buildColumnMapping(headerRow).filter(Boolean).length;
    if (score > bestScore) {
      bestScore = score;
      best = sheet;
    }
    if (bestScore === HEADER_MAP.length) break; // perfect match — no need to check the rest
  }

  if (!best || bestScore < MIN_HEADER_MATCH) {
    throw new Error(
      `Could not find a worksheet whose header row matches the expected schema ` +
        `(best: "${best?.name}" with ${bestScore}/${HEADER_MAP.length} columns matched). ` +
        `Checked tabs: ${sheets.value.map((s) => s.name).join(', ')}`,
    );
  }
  console.log(`  Auto-detected worksheet "${best.name}" (${bestScore}/${HEADER_MAP.length} expected columns matched)`);
  return { worksheet: best };
}

export async function readViaTable(token, driveId, itemId, tableName) {
  const headerUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableName)}/headerRowRange`;
  const bodyUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableName)}/range?$select=values,text,numberFormat`;
  const [header, body] = await Promise.all([graphGet(token, headerUrl), graphGet(token, bodyUrl)]);
  return {
    headers: header.values[0],
    values: body.values,
    text: body.text,
    numberFormat: body.numberFormat,
  };
}

export async function readViaUsedRange(token, driveId, itemId, sheetName) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange(valuesOnly=false)?$select=values,text,numberFormat`;
  const range = await graphGet(token, url);
  const [headers, ...rest] = range.values;
  const [, ...textRest] = range.text;
  const [, ...fmtRest] = range.numberFormat;
  return { headers, values: rest, text: textRest, numberFormat: fmtRest };
}

export function rowsFromGrid({ headers, values, text, numberFormat }) {
  const mapping = buildColumnMapping(headers);
  const unmapped = headers.filter((h, i) => mapping[i] === null && normalizeHeader(h) !== '');
  if (unmapped.length) {
    console.warn(`⚠ Unmapped columns (ignored): ${unmapped.join(', ')}`);
  }

  const rows = values.map((rawRow, r) => {
    const out = {};
    for (const [, key] of HEADER_MAP) out[key] = null; // ensure every key present
    mapping.forEach((col, c) => {
      if (!col) return;
      const raw = rawRow[c];
      const txt = text?.[r]?.[c];
      const fmt = numberFormat?.[r]?.[c];
      if (col.isDate) {
        out[col.key] = parseCellDate(raw, txt, fmt);
      } else {
        const s =
          txt !== undefined && txt !== null
            ? String(txt).trim()
            : raw === null || raw === undefined
              ? ''
              : String(raw).trim();
        out[col.key] = s === '' ? null : s;
      }
    });
    return out;
  });

  // Drop fully-blank trailing rows (usedRange sometimes over-includes).
  return rows.filter((row) => Object.values(row).some((v) => v !== null && v !== ''));
}

/**
 * High-level entry point: token + share URL in, { rows, driveId, itemId,
 * fileName, sourceName } out. Used by both the CI cron path and the
 * real-time Azure Function path.
 */
export async function fetchWorkbookRows(token, shareUrl) {
  const driveItem = await resolveDriveItem(token, shareUrl);
  const driveId = driveItem.parentReference.driveId;
  const itemId = driveItem.id;

  const { table, worksheet } = await findWorksheetAndTable(token, driveId, itemId);

  let grid;
  let sourceName;
  if (table) {
    grid = await readViaTable(token, driveId, itemId, table.name);
    sourceName = `table:${table.name}`;
  } else {
    grid = await readViaUsedRange(token, driveId, itemId, worksheet.name);
    sourceName = `worksheet:${worksheet.name}`;
  }

  const rows = rowsFromGrid(grid);
  return { rows, driveId, itemId, fileName: driveItem.name, sourceName };
}
