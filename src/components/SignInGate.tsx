import { useState } from 'react';
import { signIn } from '../lib/msalAuth';

export function SignInGate() {
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  async function handleSignIn() {
    setSigning(true);
    setError(null);
    try {
      // Navigates the tab away to Microsoft — this only "returns" (and
      // only via the catch below) if something goes wrong before the
      // redirect happens. On success the page unloads; when it comes
      // back, App.tsx's redirect-response handling takes over.
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      setSigning(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-void px-4">
      <div className="w-full max-w-sm glass-panel rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-lg bg-toyota-red/10 border border-toyota-red/50 flex items-center justify-center glow-ring">
            <span className="font-display text-toyota-red font-bold text-2xl drop-shadow-[0_0_8px_rgba(255,31,57,0.7)]">
              P
            </span>
          </div>
          <h1 className="font-display text-xl font-semibold text-text-primary tracking-wide uppercase mt-1">
            Pride Toyota
          </h1>
          <p className="text-[11px] text-text-muted uppercase tracking-[0.2em]">
            Delivery &amp; Inventory Dashboard
          </p>
        </div>

        <div className="hairline mb-6" />

        <p className="text-xs text-text-secondary text-center mb-4 leading-relaxed">
          Sign in with your Microsoft account to view live delivery data.
          Your account needs access to the source workbook.
        </p>

        <button
          onClick={handleSignIn}
          disabled={signing}
          className="w-full flex items-center justify-center gap-2 bg-toyota-red hover:bg-toyota-red-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 text-white text-sm font-display font-semibold uppercase tracking-wider rounded-md px-3 py-2.5 shadow-[0_0_20px_-4px_rgba(255,31,57,0.7)]"
        >
          <MicrosoftLogo />
          {signing ? 'Signing in…' : 'Sign in with Microsoft'}
        </button>

        {error && <p className="mt-3 text-xs text-toyota-red text-center">{error}</p>}

        <p className="mt-6 text-[11px] leading-relaxed text-text-muted text-center">
          Data is read directly from Microsoft Graph using your own
          permissions — this dashboard has no separate login system.
        </p>
      </div>
    </div>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
