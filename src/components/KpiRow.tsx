import { useMemo } from 'react';
import type { VehicleRow } from '../types';
import type { FilterState } from '../lib/filterLogic';
import { applyNonStatusFilters, distinctValues } from '../lib/filterLogic';

interface Props {
  rows: VehicleRow[];
  filters: FilterState;
  onToggleStatus: (status: string) => void;
}

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
        className={`glass-panel rounded-lg p-4 text-left transition-all duration-200 hover:border-toyota-red/50 ${
          filters.ctdmsStatus.size === 0 ? 'glow-ring' : ''
        }`}
      >
        <div className="text-[11px] uppercase tracking-widest text-text-muted mb-1">
          Total
        </div>
        <div className="text-2xl font-semibold text-text-primary tabular-nums">{total}</div>
        <div className="text-xs text-text-secondary mt-0.5">100%</div>
      </button>

      {statuses.map((status) => {
        const count = counts.get(status) ?? 0;
        const share = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        const active = filters.ctdmsStatus.has(status);
        return (
          <button
            key={status}
            onClick={() => onToggleStatus(status)}
            className={`glass-panel rounded-lg p-4 text-left transition-all duration-200 hover:border-toyota-red/50 ${
              active ? 'glow-ring border-toyota-red/60' : ''
            }`}
          >
            <div className="text-[11px] uppercase tracking-widest text-text-muted mb-1 truncate" title={status}>
              {status}
            </div>
            <div className="text-2xl font-semibold text-text-primary tabular-nums">{count}</div>
            <div className="text-xs text-text-secondary mt-0.5">{share}%</div>
          </button>
        );
      })}
    </div>
  );
}
