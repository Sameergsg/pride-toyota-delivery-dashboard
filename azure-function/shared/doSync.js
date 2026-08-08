/**
 * The real-time sync: read the workbook fresh via Graph, write the result
 * to the public blob the frontend polls, and persist the rotated refresh
 * token so the next invocation (webhook-triggered or timer-triggered)
 * still has valid credentials.
 */
import { getAccessToken } from './vendored/graphAuth.mjs';
import { fetchWorkbookRows } from './vendored/workbookReader.mjs';
import { getState, setState, writePublicData } from './storage.js';

export async function doSync(context) {
  const log = context?.log ? context.log.bind(context) : console.log;

  const state = await getState();
  if (!state?.refreshToken) {
    throw new Error(
      'No refresh token in the private-state blob yet — run `node --env-file=.env.local bootstrap-state.mjs` once ' +
        'from azure-function/ after deploying (see azure-function/README.md).',
    );
  }

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID } = process.env;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID) {
    throw new Error('AZURE_TENANT_ID / AZURE_CLIENT_ID app settings are not configured on this Function App.');
  }

  const { accessToken, refreshToken: newRefreshToken } = await getAccessToken({
    tenantId: AZURE_TENANT_ID,
    clientId: AZURE_CLIENT_ID,
    refreshToken: state.refreshToken,
  });

  const shareUrl = process.env.SHAREPOINT_SHARE_URL;
  if (!shareUrl) throw new Error('SHAREPOINT_SHARE_URL app setting is not configured on this Function App.');

  const { rows, fileName, sourceName, driveId, itemId } = await fetchWorkbookRows(accessToken, shareUrl);
  log(`Synced ${rows.length} rows from "${fileName}" via ${sourceName}`);

  const output = { generatedAt: new Date().toISOString(), rows };
  await writePublicData(output);

  await setState({
    ...state,
    refreshToken: newRefreshToken,
    driveId,
    itemId,
    lastSyncAt: output.generatedAt,
  });

  return output;
}
