/**
 * Safety net: runs a plain sync every 15 minutes regardless of whether any
 * webhook notifications arrived. If the Graph subscription lapses, a
 * notification gets dropped, or anything else goes wrong with the
 * real-time path, the dashboard is still never more than ~15 minutes
 * stale — a big improvement on the 30-minute GitHub Actions cron alone,
 * and independent of it (belt and suspenders: two unrelated systems both
 * keeping data fresh).
 */
import { app } from '@azure/functions';
import { doSync } from '../../shared/doSync.js';

app.timer('fallbackSync', {
  schedule: '0 */15 * * * *', // every 15 minutes
  runOnStartup: false,
  handler: async (myTimer, context) => {
    try {
      const result = await doSync(context);
      context.log(`Fallback sync complete: ${result.rows.length} rows.`);
    } catch (err) {
      context.error('Fallback sync failed:', err);
    }
  },
});
