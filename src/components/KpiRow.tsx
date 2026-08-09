import { useMemo } from 'react';
import type { VehicleRow } from '../types';
import type { ApplyFiltersOptions, FilterState } from '../lib/filterLogic';
import { applyFilters, distinctValues } from '../lib/filterLogic';

interface Props {
  rows: VehicleRow[];
  filters: FilterState;
  field: keyof VehicleRow;
  selected: Set<string>;
  /** How this row's own dimension should be excluded from its own scoping — see ApplyFiltersOptions. */
  skipOpts: ApplyFiltersOptions;
  onToggle: (value: string) => void;
  sectionLabel: string;
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

/**
 * A row of compact, clickable KPI cards for one dimension (CTDMS Status,
 * Customer Status, Model, MF. Year, ...). Scoped by every OTHER active
 * filter — status/date filters, other column filters, and search — so
 * these counts always match what's actually visible in the table below,
 * except for this row's own dimension (self-excluding facet counts, so
 * selecting a card doesn't zero out its own count). Cards wrap onto as
 * few rows as fit the viewport rather than a fixed grid, so dimensions
 * with many distinct values (e.g. Model) still stay compact.
 */
export function KpiRow({ rows, filters, field, selected, skipOpts, onToggle, sectionLabel }: Props) {
  const scoped = useMemo(() => applyFilters(rows, filters, skipOpts), [rows, filters, skipOpts]);

  const values = useMemo(() => distinctValues(scoped, field), [scoped, field]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of scoped) {
      const v = row[field];
      if (!v) continue;
      const key = String(v);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [scoped, field]);

  const total = scoped.length;

  return (
    <div>
      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-text-muted mb-1.5">
        {sectionLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onToggle('__ALL__')}
          className={`group relative overflow-hidden glass-panel rounded-md px-2.5 py-1.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-toyota-red/50 min-w-[86px] ${
            selected.size === 0 ? 'glow-ring' : ''
          }`}
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-toyota-red to-transparent opacity-80" />
          <div className="text-[8px] font-display font-semibold uppercase tracking-wider text-text-muted">Total</div>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-display font-semibold text-text-primary tabular-nums">{total}</span>
            <span className="text-[9px] text-text-secondary tabular-nums">100%</span>
          </div>
        </button>

        {values.map((value, i) => {
          const count = counts.get(value) ?? 0;
          const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          const active = selected.has(value);
          const signal = SIGNAL_COLORS[i % SIGNAL_COLORS.length];
          return (
            <button
              key={value}
              onClick={() => onToggle(value)}
              title={value}
              style={
                active
                  ? { boxShadow: `0 0 0 1px ${signal.ring}, 0 0 14px 1px ${signal.ring.replace('0.55', '0.22')}` }
                  : undefined
              }
              className="group relative overflow-hidden glass-panel rounded-md px-2.5 py-1.5 text-left transition-all duration-150 hover:-translate-y-0.5 min-w-[86px] max-w-[140px]"
            >
              <span
                className={`absolute inset-x-0 top-0 h-px ${signal.bg} opacity-70 group-hover:opacity-100 transition-opacity duration-150`}
              />
              <div className="text-[8px] font-display font-semibold uppercase tracking-wider text-text-muted truncate">
                {value}
              </div>
              <div className="flex items-baseline gap-1">
                <span className={`text-base font-display font-semibold tabular-nums ${signal.text}`}>{count}</span>
                <span className="text-[9px] text-text-secondary tabular-nums">{share}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
