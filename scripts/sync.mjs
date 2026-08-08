#!/usr/bin/env node
/**
 * Pulls the live vehicle-delivery workbook from SharePoint via Microsoft
 * Graph and writes public/data.json.
 *
 * Auth: delegated (refresh_token) flow — a human signs in ONCE via
 * scripts/get-token.mjs, and this script exchanges that refresh token for
 * a new access token on every run. Microsoft rotates the refresh token on
 * every exchange, so when running in CI this script also writes the new
 * refresh token back into the AZURE_REFRESH_TOKEN GitHub Actions secret
 * (via scripts/githubSecrets.mjs) so the *next* scheduled run still has a
 * valid one. See SETUP.md.
 *
 * Required env vars (see .env.example / SETUP.md):
 *   AZURE_TENANT_ID
 *   AZURE_CLIENT_ID
 *   AZURE_REFRESH_TOKEN     (delegated flow — from scripts/get-token.mjs)
 *   SHAREPOINT_SHARE_URL
 *
 * Optional (only used in CI, to persist the rotated refresh token):
 *   GH_PAT                  fine-grained PAT scoped to this repo,
 *                            "Secrets: read and write" permission
 *   GITHUB_REPOSITORY       auto-set by GitHub Actions ("owner/repo")
 *
 * Also supported as a fallback (application/client-credentials flow, if
 * this tenant ever grants admin consent for an app-only permission):
 *   AZURE_CLIENT_SECRET     (used instead of AZURE_REFRESH_TOKEN)
 *
 * Run locally:   node --env-file=.env.local scripts/sync.mjs
 * Run in CI:     invoked by .github/workflows/sync.yml with the same env
 *                vars injected from GitHub Actions encrypted secrets.
 */
import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCellDate } from './dateParser.mjs';
import { getAccessToken } from './graphAuth.mjs';
import { updateRepoSecret } from './githubSecrets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'data.json');

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_REFRESH_TOKEN,
  SHAREPOINT_SHARE_URL,
  GH_PAT,
  GITHUB_REPOSITORY,
} = process.env;

function requireEnv() {
  const missing = [];
  if (!AZURE_TENANT_ID) missing.push('AZURE_TENANT_ID');
  if (!AZURE_CLIENT_ID) missing.push('AZURE_CLIENT_ID');
  if (!SHAREPOINT_SHARE_URL) missing.push('SHAREPOINT_SHARE_URL');
  if (!AZURE_REFRESH_TOKEN && !AZURE_CLIENT_SECRET) {
    missing.push('AZURE_REFRESH_TOKEN (run scripts/get-token.mjs once) or AZURE_CLIENT_SECRET');
  }
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
  console.log(
    `→ Authenticating with Azure AD (${AZURE_REFRESH_TOKEN ? 'delegated refresh-token' : 'client-credentials'} flow)…`,
  );
  const { accessToken: token, refreshToken: newRefreshToken } = await getAccessToken({
    tenantId: AZURE_TENANT_ID,
    clientId: AZURE_CLIENT_ID,
    clientSecret: AZURE_CLIENT_SECRET,
    refreshToken: AZURE_REFRESH_TOKEN,
  });

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
    await persistRotatedRefreshToken(newRefreshToken);
  }
}

/**
 * Microsoft invalidates the previous refresh token every time a new one is
 * issued (rolling refresh tokens). If we don't save the new one back into
 * the GitHub secret, the *next* scheduled run 30 minutes from now will
 * fail. Only relevant for the delegated flow (AZURE_REFRESH_TOKEN set).
 */
async function persistRotatedRefreshToken(newRefreshToken) {
  if (!AZURE_REFRESH_TOKEN) return; // client-credentials flow — nothing to rotate
  if (!newRefreshToken || newRefreshToken === AZURE_REFRESH_TOKEN) {
    console.log('→ Refresh token unchanged; skipping secret update.');
    return;
  }
  if (!GH_PAT || !GITHUB_REPOSITORY) {
    console.warn(
      '⚠ Refresh token rotated but GH_PAT/GITHUB_REPOSITORY not set — cannot persist it. ' +
        'The next scheduled sync run will fail. See SETUP.md for the GH_PAT secret.',
    );
    return;
  }
  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  console.log('→ Refresh token rotated; updating AZURE_REFRESH_TOKEN secret…');
  await updateRepoSecret({
    owner,
    repo,
    token: GH_PAT,
    secretName: 'AZURE_REFRESH_TOKEN',
    secretValue: newRefreshToken,
  });
  console.log('✓ AZURE_REFRESH_TOKEN secret updated for the next run.');
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
