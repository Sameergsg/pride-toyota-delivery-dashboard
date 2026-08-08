/**
 * Token acquisition for Microsoft Graph, shared by sync.mjs and
 * get-token.mjs. Supports two flows:
 *
 *  - Delegated (refresh_token grant) — the flow this project actually uses.
 *    A human signs in ONCE via scripts/get-token.mjs (device code flow),
 *    which mints an initial refresh token. From then on, every sync run
 *    exchanges that refresh token for a new access token *and* a new
 *    refresh token (Microsoft rotates them), so the caller must persist
 *    whatever refresh_token comes back or the next run will fail.
 *
 *  - Application (client_credentials grant) — kept as a fallback for if
 *    this tenant ever does grant admin consent for an app-only permission
 *    instead. Not the primary path, but harmless to support both.
 */

export const DELEGATED_SCOPE = 'https://graph.microsoft.com/Files.Read offline_access';

/**
 * @param {{tenantId: string, clientId: string, clientSecret?: string, refreshToken?: string}} opts
 * @returns {Promise<{accessToken: string, refreshToken: string|null}>}
 */
export async function getAccessToken({ tenantId, clientId, clientSecret, refreshToken }) {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  let body;
  if (refreshToken) {
    body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: DELEGATED_SCOPE,
    });
  } else if (clientSecret) {
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'https://graph.microsoft.com/.default',
    });
  } else {
    throw new Error(
      'No credentials to authenticate with — need AZURE_REFRESH_TOKEN (delegated, run scripts/get-token.mjs once) ' +
        'or AZURE_CLIENT_SECRET (application/client-credentials).',
    );
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}): ${json.error} — ${json.error_description ?? ''}`,
    );
  }
  return {
    accessToken: json.access_token,
    // For client_credentials there is no refresh token; for refresh_token
    // grant, Graph normally issues a new one every time — always prefer
    // whatever came back, falling back to the one we sent in.
    refreshToken: json.refresh_token ?? refreshToken ?? null,
  };
}
