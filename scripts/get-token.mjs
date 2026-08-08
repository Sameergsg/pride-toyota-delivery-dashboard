#!/usr/bin/env node
/**
 * ONE-TIME interactive sign-in that mints a delegated Microsoft Graph
 * refresh token for scripts/sync.mjs to use going forward.
 *
 * Run this once, locally:
 *
 *   node --env-file=.env.local scripts/get-token.mjs
 *
 * It prints a URL + short code. Open the URL in a browser, sign in with an
 * account that has access to the SharePoint workbook (e.g.
 * edp.bhiwani@pridetoyota.in), enter the code, and approve the requested
 * "Files.Read" permission. No admin approval needed as long as your tenant
 * allows user consent for this permission — the same way the existing
 * Sales dashboard's sign-in works.
 *
 * On success it prints the refresh token AND writes it into .env.local as
 * AZURE_REFRESH_TOKEN (for local testing) — you still need to add it as
 * the AZURE_REFRESH_TOKEN GitHub Actions secret for the automated 30-min
 * sync to pick it up. See SETUP.md.
 *
 * Requires AZURE_TENANT_ID and AZURE_CLIENT_ID (see SETUP.md for how to
 * register the secret-less "public client" app these come from).
 */
import { DELEGATED_SCOPE } from './graphAuth.mjs';
import { upsertEnvLocal } from './envLocal.mjs';

const { AZURE_TENANT_ID, AZURE_CLIENT_ID } = process.env;

if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
  console.error(
    '\n✖ Missing AZURE_TENANT_ID / AZURE_CLIENT_ID.\n' +
      '  Put them in .env.local (copy .env.example first), then run:\n' +
      '    node --env-file=.env.local scripts/get-token.mjs\n' +
      '  See SETUP.md for how to register the app these come from.\n',
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDeviceCode() {
  const res = await fetch(
    `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: AZURE_CLIENT_ID, scope: DELEGATED_SCOPE }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Device code request failed: ${json.error} — ${json.error_description ?? ''}`);
  }
  return json;
}

async function pollForToken(deviceCode) {
  let interval = (deviceCode.interval ?? 5) * 1000;
  const expiresAt = Date.now() + deviceCode.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await sleep(interval);
    const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: AZURE_CLIENT_ID,
        device_code: deviceCode.device_code,
      }),
    });
    const json = await res.json();
    if (res.ok) return json;
    if (json.error === 'authorization_pending') continue;
    if (json.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    throw new Error(`Sign-in failed: ${json.error} — ${json.error_description ?? ''}`);
  }
  throw new Error('Device code expired before sign-in completed — run this script again.');
}

async function main() {
  console.log('→ Requesting device code…');
  const deviceCode = await requestDeviceCode();
  console.log(`\n${deviceCode.message}\n`);

  console.log('→ Waiting for you to sign in…');
  const tokens = await pollForToken(deviceCode);

  console.log('\n✓ Signed in successfully.\n');
  console.log('Refresh token (also saved to .env.local as AZURE_REFRESH_TOKEN):\n');
  console.log(tokens.refresh_token);
  console.log(
    '\n→ Add this same value as the AZURE_REFRESH_TOKEN GitHub Actions secret\n' +
      '  so the automated 30-min sync can use it too. See SETUP.md, step 5.\n',
  );

  await upsertEnvLocal({ AZURE_REFRESH_TOKEN: tokens.refresh_token });
}

main().catch((err) => {
  console.error('\n✖ Sign-in failed:', err.message);
  process.exit(1);
});
