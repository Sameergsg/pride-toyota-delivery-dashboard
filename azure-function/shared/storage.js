/**
 * Blob Storage helpers, reusing the Function App's own linked storage
 * account (AzureWebJobsStorage) rather than provisioning a second one.
 *
 *   public-data/data.json    anonymous-read blob — this is the URL the
 *                            frontend polls for near-real-time updates.
 *   private-state/state.json server-only — current refresh token +
 *                            resolved driveId/itemId + subscription info.
 *                            Never exposed publicly.
 */
import { BlobServiceClient } from '@azure/storage-blob';

const PUBLIC_CONTAINER = 'public-data';
const PRIVATE_CONTAINER = 'private-state';
const DATA_BLOB = 'data.json';
const STATE_BLOB = 'state.json';

let _serviceClient;
function getServiceClient() {
  if (!_serviceClient) {
    const conn = process.env.AzureWebJobsStorage;
    if (!conn) throw new Error('AzureWebJobsStorage is not set — this only runs inside an Azure Function (or Azurite locally).');
    _serviceClient = BlobServiceClient.fromConnectionString(conn);
  }
  return _serviceClient;
}

async function ensurePublicContainer() {
  const client = getServiceClient().getContainerClient(PUBLIC_CONTAINER);
  // access: 'blob' = anonymous read on individual blobs, no container listing
  await client.createIfNotExists({ access: 'blob' });
  return client;
}

async function ensurePrivateContainer() {
  const client = getServiceClient().getContainerClient(PRIVATE_CONTAINER);
  await client.createIfNotExists();
  return client;
}

export async function writePublicData(data) {
  const container = await ensurePublicContainer();
  const blob = container.getBlockBlobClient(DATA_BLOB);
  const body = JSON.stringify(data, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: {
      blobContentType: 'application/json',
      // Frontend polls every few seconds — make sure CDN/browser caches
      // never serve stale data instead of hitting the blob fresh.
      blobCacheControl: 'no-cache, max-age=0',
    },
  });
}

export function getPublicDataUrl() {
  const container = getServiceClient().getContainerClient(PUBLIC_CONTAINER);
  return container.getBlockBlobClient(DATA_BLOB).url;
}

export async function getState() {
  const container = await ensurePrivateContainer();
  const blob = container.getBlockBlobClient(STATE_BLOB);
  if (!(await blob.exists())) return null;
  const buf = await blob.downloadToBuffer();
  return JSON.parse(buf.toString('utf8'));
}

export async function setState(state) {
  const container = await ensurePrivateContainer();
  const blob = container.getBlockBlobClient(STATE_BLOB);
  const body = JSON.stringify(state, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}
