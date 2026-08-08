/**
 * HTTP-triggered receiver for Microsoft Graph change notifications.
 *
 * Two request shapes hit this same endpoint:
 *  1. GET  ?validationToken=... — Graph's subscription-creation handshake.
 *     Must echo the token back as plain text within 10s or the
 *     subscription is rejected. (Also arrives as a POST with the token as
 *     a query param in some Graph SDK/tooling flows, so we check both.)
 *  2. POST { value: [...] }     — the actual change notifications. Graph
 *     deliberately does NOT include what changed (privacy/size), so on
 *     any valid notification we just re-fetch the whole sheet.
 */
import { app } from '@azure/functions';
import { doSync } from '../../shared/doSync.js';

app.http('webhook', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous', // Graph must be able to reach this with no function key
  route: 'webhook',
  handler: async (request, context) => {
    const validationToken = request.query.get('validationToken');
    if (validationToken) {
      context.log('Subscription validation handshake received.');
      return { status: 200, headers: { 'Content-Type': 'text/plain' }, body: validationToken };
    }

    if (request.method !== 'POST') {
      return { status: 405, body: 'Method not allowed' };
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return { status: 400, body: 'Invalid JSON' };
    }

    const notifications = payload?.value ?? [];
    const expected = process.env.GRAPH_CLIENT_STATE;
    const isGenuine = notifications.some((n) => expected && n.clientState === expected);

    if (!isGenuine) {
      // Not from our subscription (or clientState missing/wrong) — ack
      // with 202 anyway so Graph doesn't retry, but don't act on it.
      context.warn(`Ignoring notification: clientState mismatch (got ${notifications.length} item(s)).`);
      return { status: 202 };
    }

    context.log(`${notifications.length} change notification(s) confirmed — resyncing…`);
    try {
      const result = await doSync(context);
      context.log(`Resync complete: ${result.rows.length} rows.`);
    } catch (err) {
      // Graph doesn't need — or want — us to fail the webhook response
      // over this; the next notification, or the daily renewal timer's
      // fallback sync, will catch it. Log loudly so it's visible in
      // Application Insights / the portal's Monitor blade.
      context.error('Webhook-triggered sync failed:', err);
    }

    return { status: 202 };
  },
});
