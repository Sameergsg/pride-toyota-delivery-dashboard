/**
 * Browser-side Microsoft sign-in (MSAL.js, Authorization Code + PKCE —
 * the standard SPA flow). Once signed in, the dashboard calls Microsoft
 * Graph directly from the browser to read the workbook — no backend, no
 * webhook, no polling infrastructure. This is the primary real-time path;
 * see SETUP.md for the one Azure Portal step it needs (a redirect URI).
 *
 * Uses the REDIRECT flow (not popup) — popups turned out to be unreliable
 * across real-world browser/extension combinations (nested-popup errors,
 * stuck "interaction in progress" state). Redirect just navigates the tab
 * away to Microsoft and back; the app re-processes the response on load
 * via ensureMsalReady()'s handleRedirectPromise() call.
 *
 * Falls back to the passcode + bundled-data.json flow automatically if
 * VITE_AZURE_CLIENT_ID isn't configured at build time.
 */
import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';

const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || '';
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || '';

export const isMsalConfigured = Boolean(CLIENT_ID && TENANT_ID);

// Files.Read.All (not just Files.Read) so this works for any org member
// the file gets shared with — not only its owner. See SETUP.md.
const SCOPES = ['Files.Read.All'];

let msalInstance: PublicClientApplication | null = null;
let readyPromise: Promise<PublicClientApplication> | null = null;

/**
 * Initializes MSAL and processes any pending redirect response (the
 * result of a just-completed signIn() round trip). Call this once on app
 * mount before checking getActiveAccount() — cheap/safe to call more than
 * once, subsequent calls reuse the same promise.
 */
export function ensureMsalReady(): Promise<PublicClientApplication> {
  if (!isMsalConfigured) {
    return Promise.reject(new Error('MSAL is not configured (VITE_AZURE_CLIENT_ID/VITE_AZURE_TENANT_ID missing).'));
  }
  if (!readyPromise) {
    const app = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin + import.meta.env.BASE_URL,
      },
      cache: {
        cacheLocation: 'localStorage', // survives tab/browser restarts
      },
    });
    msalInstance = app;
    readyPromise = app.initialize().then(async () => {
      const result = await app.handleRedirectPromise();
      if (result?.account) {
        app.setActiveAccount(result.account);
      }
      return app;
    });
  }
  return readyPromise;
}

export function getActiveAccount(): AccountInfo | null {
  if (!msalInstance) return null;
  return msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
}

/**
 * Kicks off sign-in by navigating the current tab to Microsoft — this
 * call does not "return" in the success case (the page unloads). The app
 * resumes on the next load via ensureMsalReady() processing the redirect
 * response, and the caller's UI naturally re-renders as signed-in.
 */
export async function signIn(): Promise<void> {
  const app = await ensureMsalReady();
  await app.loginRedirect({ scopes: SCOPES });
}

export async function signOut(): Promise<void> {
  const app = await ensureMsalReady();
  const account = getActiveAccount();
  if (account) {
    await app.logoutRedirect({ account });
  }
}

/**
 * Gets a Graph access token, silently refreshing if there's already a
 * signed-in account. If interactive sign-in is required (token fully
 * expired, no session), redirects — same caveat as signIn() above.
 */
export async function getAccessToken(): Promise<string> {
  const app = await ensureMsalReady();
  const account = getActiveAccount();
  if (!account) {
    throw new Error('Not signed in.');
  }
  try {
    const result = await app.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      await app.acquireTokenRedirect({ scopes: SCOPES });
      // Navigates away — nothing after this line runs in this page load.
      throw new Error('Redirecting to sign in again…');
    }
    throw err;
  }
}
