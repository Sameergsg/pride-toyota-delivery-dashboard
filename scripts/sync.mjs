#!/usr/bin/env node
/**
 * Pulls the live vehicle-delivery workbook from SharePoint via Microsoft
 * Graph and writes public/data.json. This is the 30-minute-cron fallback
 * path (.github/workflows/sync.yml) — for near-instant updates see
 * azure-function/, which reacts to Graph webhook notifications instead of
 * polling. Both paths share their worksheet-reading logic via
 * scripts/workbookReader.mjs, so they can't silently drift apart.
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
import { writeFile, appendFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAccessToken } from './graphAuth.mjs';
import { updateRepoSecret } from './githubSecrets.mjs';
import { upsertEnvLocal } from './envLocal.mjs';
import { fetchWorkbookRows } from './workbookReader.mjs';

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
  const { rows, fileName, sourceName } = await fetchWorkbookRows(token, SHAREPOINT_SHARE_URL);
  console.log(`  "${fileName}" via ${sourceName}`);
  console.log(`✓ Mapped ${rows.length} rows`);

  const output = {
    generatedAt: new Date().toISOString(),
    rows,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`✓ Wrote ${rows.length} rows to ${OUT_PATH}`);

  if (process.env.CI) {
    const changed = await commitIfChanged();
    // GitHub's default GITHUB_TOKEN deliberately does NOT trigger other
    // workflows when it pushes (infinite-loop protection), so a data
    // commit here would silently NOT redeploy the site. Signal back to
    // the workflow YAML via $GITHUB_OUTPUT so it can explicitly dispatch
    // deploy.yml itself when (and only when) data actually changed.
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `data_changed=${changed}\n`, 'utf8');
    }
  }
  await persistRotatedRefreshToken(newRefreshToken);
}

/**
 * Microsoft invalidates the previous refresh token every time a new one is
 * issued (rolling refresh tokens). If we don't save the new one, the
 * *next* run — whether that's you locally or the scheduled CI job 30
 * minutes from now — will fail. Only relevant for the delegated flow
 * (AZURE_REFRESH_TOKEN set).
 */
async function persistRotatedRefreshToken(newRefreshToken) {
  if (!AZURE_REFRESH_TOKEN) return; // client-credentials flow — nothing to rotate
  if (!newRefreshToken || newRefreshToken === AZURE_REFRESH_TOKEN) {
    console.log('→ Refresh token unchanged; skipping.');
    return;
  }

  if (process.env.CI) {
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
  } else {
    console.log('→ Refresh token rotated; updating .env.local…');
    await upsertEnvLocal({ AZURE_REFRESH_TOKEN: newRefreshToken });
    console.log('✓ .env.local updated for the next local run.');
  }
}

/** @returns {Promise<boolean>} whether a commit was made */
async function commitIfChanged() {
  try {
    execSync('git diff --quiet -- public/data.json', { stdio: 'ignore' });
    console.log('→ No changes to public/data.json; skipping commit.');
    return false;
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
  return true;
}

main().catch((err) => {
  console.error('\n✖ Sync failed:', err.message);
  process.exit(1);
});
