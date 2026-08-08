import { useCallback, useEffect, useState } from 'react';
import { AccessGate, isUnlocked } from './components/AccessGate';
import { KpiRow } from './components/KpiRow';
import { FilterPanel } from './components/FilterPanel';
import { VehicleTable } from './components/VehicleTable';
import { fetchDataFile, type LoadState } from './lib/dataLoader';
import { makeEmptyFilterState, relativeTime, type FilterState } from './lib/filterLogic';

export default function App() {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filters, setFilters] = useState<FilterState>(makeEmptyFilterState());
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetchDataFile();
      setState({ status: 'ready', data });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  // Keep the "Last synced" relative-time badge ticking.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
  }

  function toggleStatus(status: string) {
    setFilters((prev) => {
      const next = new Set(prev.ctdmsStatus);
      if (status === '__ALL__') {
        next.clear();
      } else if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return { ...prev, ctdmsStatus: next };
    });
  }

  return (
    <div className="min-h-screen pb-12">
      <Header
        generatedAt={state.status === 'ready' ? state.data.generatedAt : null}
        now={now}
        onRefresh={load}
        loading={state.status === 'loading'}
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 flex flex-col gap-4 mt-4">
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
        {state.status === 'ready' && (
          <>
            <KpiRow rows={state.data.rows} filters={filters} onToggleStatus={toggleStatus} />
            <FilterPanel rows={state.data.rows} filters={filters} onChange={setFilters} />
            <VehicleTable allRows={state.data.rows} filters={filters} onFiltersChange={setFilters} />
          </>
        )}
      </main>
    </div>
  );
}

function Header({
  generatedAt,
  now,
  onRefresh,
  loading,
}: {
  generatedAt: string | null;
  now: number;
  onRefresh: () => void;
  loading: boolean;
}) {
  void now; // forces re-render every 30s so relativeTime() stays fresh
  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-border-steel">
      <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-toyota-red/60 to-transparent" />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-md bg-toyota-red/10 border border-toyota-red/50 flex items-center justify-center glow-ring">
            <span className="font-display font-bold text-toyota-red drop-shadow-[0_0_6px_rgba(255,31,57,0.7)]">
              P
            </span>
          </div>
          <div>
            <h1 className="font-display text-base font-semibold text-text-primary tracking-wide leading-none uppercase">
              Pride Toyota <span className="text-toyota-red">//</span> Delivery Dashboard
            </h1>
            <p className="text-[11px] text-text-muted mt-1 tracking-wide">Goyal Sons Automobiles Pvt. Ltd.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary bg-bg-raised border border-border-steel rounded-full px-3 py-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${generatedAt ? 'bg-emerald-400 pulse-dot' : 'bg-text-muted'}`}
            />
            <span className="tabular-nums">Last synced: {generatedAt ? relativeTime(generatedAt) : '—'}</span>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-text-primary bg-bg-raised hover:border-toyota-red/60 hover:text-toyota-red disabled:opacity-50 border border-border-steel rounded-full px-3 py-1.5 transition-colors duration-200"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M15.312 5.312a5.5 5.5 0 10.976 6.526.75.75 0 111.302.744A7 7 0 1116.53 4.47l1.72 1.72V3.5a.75.75 0 011.5 0v4.25a.75.75 0 01-.75.75H14.75a.75.75 0 010-1.5h2.19l-1.628-1.688z" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="glass-panel rounded-lg p-16 flex flex-col items-center justify-center gap-3 text-text-secondary">
      <svg className="w-6 h-6 animate-spin text-toyota-red" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm">Loading delivery data…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass-panel rounded-lg p-16 flex flex-col items-center justify-center gap-3 border-toyota-red/40">
      <div className="w-10 h-10 rounded-full bg-toyota-red/10 border border-toyota-red/40 flex items-center justify-center text-toyota-red">
        !
      </div>
      <p className="text-sm text-text-primary">Failed to load data.json</p>
      <p className="text-xs text-text-muted max-w-md text-center">{message}</p>
      <button
        onClick={onRetry}
        className="mt-2 text-xs font-medium text-white bg-toyota-red hover:bg-toyota-red-dim transition-colors duration-200 rounded-md px-3 py-1.5"
      >
        Retry
      </button>
    </div>
  );
}
