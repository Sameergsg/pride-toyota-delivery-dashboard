/**
 * Daily timer: creates the Graph change-notification subscription if none
 * exists yet, or renews it before it expires. Subscriptions on driveItem
 * resources are relatively short-lived (we request 3 days at a time), so
 * this needs to run regularly or the webhook silently stops firing.
 */
import { app } from '@azure/functions';
import { getAccessToken } from '../../shared/vendored/graphAuth.mjs';
import { getState, setState } from '../../shared/storage.js';
import { doSync } from '../../shared/doSync.js';

const SUBSCRIPTION_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — comfortably under Graph's driveItem limit
const RENEW_IF_EXPIRING_WITHIN_MS = 12 * 60 * 60 * 1000; // renew once <12h remain

app.timer('renewSubscription', {
  schedule: '0 0 6 * * *', // daily at 06:00 UTC
  runOnStartup: true, // also run once at deploy time so the subscription exists immediately
  handler: async (myTimer, context) => {
    let state = await getState();

    if (!state?.refreshToken) {
      context.warn('No refresh token in state yet — skipping (run bootstrap-state.mjs after deploying).');
      return;
    }

    if (!state.driveId || !state.itemId) {
      context.log('driveId/itemId not resolved yet — running a full sync first.');
      await doSync(context);
      state = await getState();
    }

    const { AZURE_TENANT_ID, AZURE_CLIENT_ID, WEBHOOK_PUBLIC_URL, GRAPH_CLIENT_STATE } = process.env;
    if (!WEBHOOK_PUBLIC_URL || !GRAPH_CLIENT_STATE) {
      context.error('WEBHOOK_PUBLIC_URL / GRAPH_CLIENT_STATE app settings are missing — cannot manage the subscription.');
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } = await getAccessToken({
      tenantId: AZURE_TENANT_ID,
      clientId: AZURE_CLIENT_ID,
      refreshToken: state.refreshToken,
    });

    const expiresAt = state.subscriptionExpiresAt ? new Date(state.subscriptionExpiresAt).getTime() : 0;
    const stillFresh = state.subscriptionId && expiresAt - Date.now() > RENEW_IF_EXPIRING_WITHIN_MS;

    if (stillFresh) {
      context.log(`Subscription ${state.subscriptionId} still valid until ${state.subscriptionExpiresAt} — nothing to do.`);
      if (newRefreshToken && newRefreshToken !== state.refreshToken) {
        await setState({ ...state, refreshToken: newRefreshToken });
      }
      return;
    }

    const newExpiration = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString();
    let created = null;

    if (state.subscriptionId) {
      const patchRes = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${state.subscriptionId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expirationDateTime: newExpiration }),
      });
      if (patchRes.ok) {
        context.log(`Renewed subscription ${state.subscriptionId} until ${newExpiration}.`);
        await setState({
          ...state,
          refreshToken: newRefreshToken,
          subscriptionExpiresAt: newExpiration,
        });
        return;
      }
      context.warn(`Renewal PATCH failed (${patchRes.status}) — subscription likely expired; creating a new one.`);
    }

    const createRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeType: 'updated',
        notificationUrl: WEBHOOK_PUBLIC_URL,
        resource: `/drives/${state.driveId}/items/${state.itemId}`,
        expirationDateTime: newExpiration,
        clientState: GRAPH_CLIENT_STATE,
      }),
    });
    created = await createRes.json();
    if (!createRes.ok) {
      context.error(`Failed to create subscription (${createRes.status}):`, JSON.stringify(created));
      if (newRefreshToken && newRefreshToken !== state.refreshToken) {
        await setState({ ...state, refreshToken: newRefreshToken });
      }
      return;
    }

    context.log(`Created subscription ${created.id}, expires ${created.expirationDateTime}.`);
    await setState({
      ...state,
      refreshToken: newRefreshToken,
      subscriptionId: created.id,
      subscriptionExpiresAt: created.expirationDateTime,
    });
  },
});
