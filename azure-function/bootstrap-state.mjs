#!/usr/bin/env node
/**
 * ONE-TIME local script — run this once, after the Function App + Storage
 * Account are deployed, to seed the private-state blob with an initial
 * delegated refresh token. Without this, doSync() has nothing to
 * authenticate with.
 *
 *   cd azure-function
 *   npm install
 *   cp .env.local.example .env.local   # fill in the values below
 *   node --env-file=.env.local bootstrap-state.mjs
 *
 * Needs in azure-function/.env.local:
 *   AZURE_REFRESH_TOKEN              reuse the value from ../.env.local
 *                                     (the one scripts/get-token.mjs made),
 *                                     or run that script again for a fresh one
 *   STATE_STORAGE_CONNECTION_STRING  Azure Portal → your Storage Account →
 *                                     Access keys → Connection string
 */
import { BlobServiceClient } from '@azure/storage-blob';

const { AZURE_REFRESH_TOKEN, STATE_STORAGE_CONNECTION_STRING } = process.env;

if (!AZURE_REFRESH_TOKEN || !STATE_STORAGE_CONNECTION_STRING) {
  console.error(
    '\n✖ Missing AZURE_REFRESH_TOKEN or STATE_STORAGE_CONNECTION_STRING.\n' +
      '  See the comment at the top of this file for how to get these.\n',
  );
  process.exit(1);
}

const client = BlobServiceClient.fromConnectionString(STATE_STORAGE_CONNECTION_STRING);
const container = client.getContainerClient('private-state');
await container.createIfNotExists();
const blob = container.getBlockBlobClient('state.json');

const state = { refreshToken: AZURE_REFRESH_TOKEN, seededAt: new Date().toISOString() };
const body = JSON.stringify(state, null, 2);
await blob.upload(body, Buffer.byteLength(body), {
  blobHTTPHeaders: { blobContentType: 'application/json' },
});

console.log('✓ Seeded private-state/state.json.');
console.log('  The renewSubscription and fallbackSync timers will pick it up on their next run,');
console.log('  or trigger them manually from the Azure Portal to test immediately.');
