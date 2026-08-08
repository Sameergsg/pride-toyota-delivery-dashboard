import { useMemo } from 'react';
import type { VehicleRow } from '../types';
import type { FilterState } from '../lib/filterLogic';
import { applyNonStatusFilters, distinctValues } from '../lib/filterLogic';

interface Props {
  rows: VehicleRow[];
  filters: FilterState;
  onToggleStatus: (status: string) => void;
}

// Cyclic "signal" accent per status card, purely visual — status values
// themselves are never hardcoded (see distinctValues below).
const SIGNAL_COLORS = [
  { text: 'text-signal-cyan', bg: 'bg-signal-cyan', ring: 'rgba(34,211,238,0.55)' },
  { text: 'text-signal-amber', bg: 'bg-signal-amber', ring: 'rgba(251,191,36,0.55)' },
  { text: 'text-signal-emerald', bg: 'bg-signal-emerald', ring: 'rgba(52,211,153,0.55)' },
  { text: 'text-signal-violet', bg: 'bg-signal-violet', ring: 'rgba(167,139,250,0.55)' },
  { text: 'text-toyota-red', bg: 'bg-toyota-red', ring: 'rgba(255,31,57,0.55)' },
];

export function KpiRow({ rows, filters, onToggleStatus }: Props) {
  const scoped = useMemo(
    () => applyNonStatusFilters(rows, filters, { skipCtdmsStatus: true }),
    [rows, filters],
  );

  const statuses = useMemo(() => distinctValues(scoped, 'ctdmsStatus'), [scoped]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of scoped) {
      if (!row.ctdmsStatus) continue;
      m.set(row.ctdmsStatus, (m.get(row.ctdmsStatus) ?? 0) + 1);
    }
    return m;
  }, [scoped]);

  const total = scoped.length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <button
        onClick={() => onToggleStatus('__ALL__')}
        className={`group relative overflow-hidden glass-panel rounded-lg p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-toyota-red/50 ${
          filters.ctdmsStatus.size === 0 ? 'glow-ring' : ''
        }`}
      >
        <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-toyota-red to-transparent opacity-80" />
        <div className="text-[11px] font-display font-semibold uppercase tracking-widest text-text-muted mb-1">
          Total Fleet
        </div>
        <div className="text-3xl font-display font-semibold text-text-primary tabular-nums">
          {total}
        </div>
        <div className="text-xs text-text-secondary mt-0.5 tabular-nums">100%</div>
      </button>

      {statuses.map((status, i) => {
        const count = counts.get(status) ?? 0;
        const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const active = filters.ctdmsStatus.has(status);
        const signal = SIGNAL_COLORS[i % SIGNAL_COLORS.length];
        return (
          <button
            key={status}
            onClick={() => onToggleStatus(status)}
            style={active ? { boxShadow: `0 0 0 1px ${signal.ring}, 0 0 20px 2px ${signal.ring.replace('0.55', '0.25')}` } : undefined}
            className="group relative overflow-hidden glass-panel rounded-lg p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
          >
            <span
              className={`absolute inset-x-0 top-0 h-[2px] ${signal.bg} opacity-70 group-hover:opacity-100 transition-opacity duration-200`}
            />
            <div
              className="text-[11px] font-display font-semibold uppercase tracking-widest text-text-muted mb-1 truncate"
              title={status}
            >
              {status}
            </div>
            <div className={`text-3xl font-display font-semibold tabular-nums ${signal.text}`}>
              {count}
            </div>
            <div className="text-xs text-text-secondary mt-0.5 tabular-nums">{share}%</div>
          </button>
        );
      })}
    </div>
  );
}
