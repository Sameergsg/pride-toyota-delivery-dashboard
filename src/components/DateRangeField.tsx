import type { DateRangeFilter } from '../lib/filterLogic';

interface Props {
  label: string;
  value: DateRangeFilter;
  onChange: (next: DateRangeFilter) => void;
}

export function DateRangeField({ label, value, onChange }: Props) {
  const active = Boolean(value.from || value.to);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest text-text-muted mb-1.5">
        {label}
        {active && <span className="ml-1.5 text-toyota-red">●</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={value.from ?? ''}
          onChange={(e) => onChange({ ...value, from: e.target.value || null })}
          className="flex-1 min-w-0 bg-bg-raised border border-border-steel focus:border-toyota-red/60 rounded-md px-2 py-1.5 text-xs text-text-primary outline-none transition-colors duration-200"
        />
        <span className="text-text-muted text-xs">to</span>
        <input
          type="date"
          value={value.to ?? ''}
          onChange={(e) => onChange({ ...value, to: e.target.value || null })}
          className="flex-1 min-w-0 bg-bg-raised border border-border-steel focus:border-toyota-red/60 rounded-md px-2 py-1.5 text-xs text-text-primary outline-none transition-colors duration-200"
        />
        {active && (
          <button
            type="button"
            onClick={() => onChange({ from: null, to: null })}
            title="Clear range"
            className="text-text-muted hover:text-toyota-red transition-colors duration-150 text-xs px-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
