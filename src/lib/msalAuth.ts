/**
 * Browser-side Microsoft sign-in (MSAL.js, Authorization Code + PKCE —
 * the standard SPA flow). Once signed in, the dashboard calls Microsoft
 * Graph directly from the browser to read the workbook — no backend, no
 * webhook, no polling infrastructure. This is the primary real-time path;
 * see SETUP.md for the one Azure Portal step it needs (a redirect URI).
 *
 * Falls back to the passcode + bundled-data.json flow automatically if
 * VITE_AZURE_CLIENT_ID isn't configured at build time.
 */
import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';

const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || '';
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || '';

export const isMsalConfigured = Boolean(CLIENT_ID && TENANT_ID);

const SCOPES = ['Files.Read'];

let msalInstance: PublicClientApplication | null = null;
let initPromise: Promise<PublicClientApplication> | null = null;

function getMsal(): Promise<PublicClientApplication> {
  if (!isMsalConfigured) {
    return Promise.reject(new Error('MSAL is not configured (VITE_AZURE_CLIENT_ID/VITE_AZURE_TENANT_ID missing).'));
  }
  if (!initPromise) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin + import.meta.env.BASE_URL,
      },
      cache: {
        cacheLocation: 'localStorage', // survives tab/browser restarts
      },
    });
    initPromise = msalInstance.initialize().then(() => msalInstance!);
  }
  return initPromise;
}

export function getActiveAccount(): AccountInfo | null {
  if (!msalInstance) return null;
  return msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
}

/** Interactive sign-in (popup). Call this from a user click (e.g. "Sign in" button). */
export async function signIn(): Promise<AccountInfo> {
  const app = await getMsal();
  const result = await app.loginPopup({ scopes: SCOPES });
  app.setActiveAccount(result.account);
  return result.account;
}

export async function signOut(): Promise<void> {
  const app = await getMsal();
  const account = getActiveAccount();
  if (account) {
    await app.logoutPopup({ account });
  }
}

/**
 * Gets a Graph access token, silently refreshing if there's already a
 * signed-in account. Throws InteractionRequiredAuthError-derived errors if
 * an interactive sign-in is needed (caller should show the sign-in gate).
 */
export async function getAccessToken(): Promise<string> {
  const app = await getMsal();
  const account = getActiveAccount();
  if (!account) {
    throw new Error('Not signed in.');
  }
  try {
    const result = await app.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await app.loginPopup({ scopes: SCOPES });
      app.setActiveAccount(result.account);
      return result.accessToken;
    }
    throw err;
  }
}
