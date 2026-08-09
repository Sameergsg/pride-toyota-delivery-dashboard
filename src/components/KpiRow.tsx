import { useMemo } from 'react';
import type { VehicleRow } from '../types';
import type { FilterState } from '../lib/filterLogic';
import { applyFilters, distinctValues } from '../lib/filterLogic';

interface Props {
  rows: VehicleRow[];
  filters: FilterState;
  field: 'ctdmsStatus' | 'customerStatus';
  selected: Set<string>;
  /** Which of the two status facets to exclude from THIS row's own scoping — always its own field, so a card's count reflects everything else currently filtered (including the table's column filters/search), not itself. */
  skipCtdmsStatus?: boolean;
  skipCustomerStatus?: boolean;
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
 * A row of clickable KPI cards for one status dimension (CTDMS or
 * Customer Status). Scoped by every OTHER active filter — the top panel's
 * status/date filters AND the table's per-column filters/search — so
 * these counts always match what's actually visible in the table below,
 * except for this row's own dimension (self-excluding facet counts, so
 * selecting a card doesn't make its own count vanish).
 */
export function KpiRow({
  rows,
  filters,
  field,
  selected,
  skipCtdmsStatus,
  skipCustomerStatus,
  onToggle,
  sectionLabel,
}: Props) {
  const scoped = useMemo(
    () => applyFilters(rows, filters, { skipCtdmsStatus, skipCustomerStatus }),
    [rows, filters, skipCtdmsStatus, skipCustomerStatus],
  );

  const statuses = useMemo(() => distinctValues(scoped, field), [scoped, field]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of scoped) {
      const v = row[field];
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }, [scoped, field]);

  const total = scoped.length;

  return (
    <div>
      <p className="text-[11px] font-display font-semibold uppercase tracking-widest text-text-muted mb-2">
        {sectionLabel}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          onClick={() => onToggle('__ALL__')}
          className={`group relative overflow-hidden glass-panel rounded-lg p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-toyota-red/50 ${
            selected.size === 0 ? 'glow-ring' : ''
          }`}
        >
          <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-toyota-red to-transparent opacity-80" />
          <div className="text-[11px] font-display font-semibold uppercase tracking-widest text-text-muted mb-1">
            Total
          </div>
          <div className="text-3xl font-display font-semibold text-text-primary tabular-nums">
            {total}
          </div>
          <div className="text-xs text-text-secondary mt-0.5 tabular-nums">100%</div>
        </button>

        {statuses.map((status, i) => {
          const count = counts.get(status) ?? 0;
          const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
          const active = selected.has(status);
          const signal = SIGNAL_COLORS[i % SIGNAL_COLORS.length];
          return (
            <button
              key={status}
              onClick={() => onToggle(status)}
              style={
                active
                  ? { boxShadow: `0 0 0 1px ${signal.ring}, 0 0 20px 2px ${signal.ring.replace('0.55', '0.25')}` }
                  : undefined
              }
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
    </div>
  );
}
