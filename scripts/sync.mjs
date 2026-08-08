#!/usr/bin/env node
/**
 * Pulls the live vehicle-delivery workbook from SharePoint via Microsoft
 * Graph (client-credentials / daemon-app flow) and writes public/data.json.
 *
 * Required env vars (see .env.example / SETUP.md):
 *   AZURE_TENANT_ID
 *   AZURE_CLIENT_ID
 *   AZURE_CLIENT_SECRET
 *   SHAREPOINT_SHARE_URL
 *
 * Run locally:   node scripts/sync.mjs
 * Run in CI:     invoked by .github/workflows/sync.yml with the same env
 *                vars injected from GitHub Actions encrypted secrets.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCellDate } from './dateParser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'data.json');

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  SHAREPOINT_SHARE_URL,
} = process.env;

function requireEnv() {
  const missing = [];
  if (!AZURE_TENANT_ID) missing.push('AZURE_TENANT_ID');
  if (!AZURE_CLIENT_ID) missing.push('AZURE_CLIENT_ID');
  if (!AZURE_CLIENT_SECRET) missing.push('AZURE_CLIENT_SECRET');
  if (!SHAREPOINT_SHARE_URL) missing.push('SHAREPOINT_SHARE_URL');
  if (missing.length) {
    console.error(
      `\n✖ Missing required env var(s): ${missing.join(', ')}\n` +
        `  See SETUP.md for how to obtain these, then put them in .env.local\n` +
        `  (local) or GitHub Actions repo secrets (CI).\n`,
    );
    process.exit(1);
  }
}

// --- Internal schema: fixed keys the frontend expects -----------------
// Source header (normalized: trimmed, whitespace-collapsed, lowercased)
// mapped to internal key + whether it's a date field.
const HEADER_MAP = [
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

function normalizeHeader(h) {
  return String(h ?? '')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function base64UrlEncodeShareUrl(url) {
  const b64 = Buffer.from(url, 'utf8').toString('base64');
  const urlSafe = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'u!' + urlSafe;
}

async function getAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function graphGet(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function resolveDriveItem(token) {
  const shareId = base64UrlEncodeShareUrl(SHAREPOINT_SHARE_URL);
  const url = `https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem?$expand=workbook`;
  return graphGet(token, url);
}

async function findWorksheetAndTable(token, driveId, itemId) {
  // Prefer a named Excel Table if one exists.
  const tablesUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables`;
  const tables = await graphGet(token, tablesUrl);
  if (tables.value && tables.value.length > 0) {
    return { table: tables.value[0] };
  }
  const worksheetsUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets`;
  const sheets = await graphGet(token, worksheetsUrl);
  if (!sheets.value || sheets.value.length === 0) {
    throw new Error('Workbook has no worksheets.');
  }
  return { worksheet: sheets.value[0] };
}

async function readViaTable(token, driveId, itemId, tableName) {
  const headerUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableName)}/headerRowRange`;
  const bodyUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tableName)}/range?$select=values,text,numberFormat`;
  const [header, body] = await Promise.all([
    graphGet(token, headerUrl),
    graphGet(token, bodyUrl),
  ]);
  return {
    headers: header.values[0],
    values: body.values,
    text: body.text,
    numberFormat: body.numberFormat,
  };
}

async function readViaUsedRange(token, driveId, itemId, sheetName) {
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/usedRange(valuesOnly=false)?$select=values,text,numberFormat`;
  const range = await graphGet(token, url);
  const [headers, ...rest] = range.values;
  const [, ...textRest] = range.text;
  const [, ...fmtRest] = range.numberFormat;
  return { headers, values: rest, text: textRest, numberFormat: fmtRest };
}

function buildColumnMapping(headers) {
  // Map: source column index -> { key, isDate }
  const byNormalizedHeader = new Map(HEADER_MAP.map(([h, key, isDate]) => [h, { key, isDate }]));
  return headers.map((h) => byNormalizedHeader.get(normalizeHeader(h)) ?? null);
}

function rowsFromGrid({ headers, values, text, numberFormat }) {
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
        const s = txt !== undefined && txt !== null ? String(txt).trim() : raw === null || raw === undefined ? '' : String(raw).trim();
        out[col.key] = s === '' ? null : s;
      }
    });
    return out;
  });

  // Drop fully-blank trailing rows (usedRange sometimes over-includes).
  return rows.filter((row) => Object.values(row).some((v) => v !== null && v !== ''));
}

async function main() {
  requireEnv();
  console.log('→ Authenticating with Azure AD (client credentials)…');
  const token = await getAccessToken();

  console.log('→ Resolving shared workbook…');
  const driveItem = await resolveDriveItem(token);
  const driveId = driveItem.parentReference.driveId;
  const itemId = driveItem.id;
  console.log(`  drive=${driveId} item=${itemId} name="${driveItem.name}"`);

  console.log('→ Locating table/worksheet…');
  const { table, worksheet } = await findWorksheetAndTable(token, driveId, itemId);

  let grid;
  if (table) {
    console.log(`  using Excel Table "${table.name}"`);
    grid = await readViaTable(token, driveId, itemId, table.name);
  } else {
    console.log(`  using worksheet "${worksheet.name}" usedRange`);
    grid = await readViaUsedRange(token, driveId, itemId, worksheet.name);
  }

  console.log(`→ Mapping ${grid.values.length} rows across ${grid.headers.length} columns…`);
  const rows = rowsFromGrid(grid);

  const output = {
    generatedAt: new Date().toISOString(),
    rows,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`✓ Wrote ${rows.length} rows to ${OUT_PATH}`);

  if (process.env.CI) {
    await commitIfChanged();
  }
}

async function commitIfChanged() {
  try {
    execSync('git diff --quiet -- public/data.json', { stdio: 'ignore' });
    console.log('→ No changes to public/data.json; skipping commit.');
    return;
  } catch {
    // non-zero exit means there IS a diff
  }
  console.log('→ Changes detected; committing…');
  execSync('git config user.name "github-actions[bot]"');
  execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
  execSync('git add public/data.json');
  execSync('git commit -m "chore: sync data [skip ci-deploy-loop-guard]"');
  execSync('git push');
  console.log('✓ Pushed data update.');
}

main().catch((err) => {
  console.error('\n✖ Sync failed:', err.message);
  process.exit(1);
});
