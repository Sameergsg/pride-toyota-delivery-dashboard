import { useState, type FormEvent } from 'react';
import { PASSCODE_SHA256, SESSION_STORAGE_KEY } from '../config/access';

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_STORAGE_KEY) === '1';
}

export function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(false);
    const hash = await sha256Hex(value);
    if (hash === PASSCODE_SHA256) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
      onUnlock();
    } else {
      setError(true);
    }
    setChecking(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-void px-4">
      <div className="w-full max-w-sm glass-panel rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-lg bg-toyota-red/10 border border-toyota-red/40 flex items-center justify-center glow-ring">
            <span className="text-toyota-red font-bold text-xl">P</span>
          </div>
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">
            Pride Toyota
          </h1>
          <p className="text-xs text-text-muted uppercase tracking-widest">
            Delivery &amp; Inventory Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="passcode" className="text-xs text-text-secondary">
            Enter access passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            className={`bg-bg-raised border rounded-md px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200 ${
              error ? 'border-toyota-red glow-ring' : 'border-border-steel focus:border-toyota-red/60'
            }`}
            placeholder="••••••••"
          />
          {error && (
            <p className="text-xs text-toyota-red">Incorrect passcode. Try again.</p>
          )}
          <button
            type="submit"
            disabled={checking || !value}
            className="mt-2 bg-toyota-red hover:bg-toyota-red-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 text-white text-sm font-medium rounded-md px-3 py-2"
          >
            {checking ? 'Checking…' : 'Enter'}
          </button>
        </form>

        <p className="mt-6 text-[11px] leading-relaxed text-text-muted text-center">
          This is a soft deterrent only, not real security — the built site
          is publicly reachable. See the README for details.
        </p>
      </div>
    </div>
  );
}
