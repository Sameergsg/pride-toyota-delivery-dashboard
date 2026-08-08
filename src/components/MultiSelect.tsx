import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function MultiSelect({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggle(opt: string) {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(next);
  }

  const summary =
    selected.size === 0
      ? 'All'
      : selected.size === 1
        ? Array.from(selected)[0]
        : `${selected.size} selected`;

  return (
    <div className="relative" ref={ref}>
      <label className="block text-[11px] uppercase tracking-widest text-text-muted mb-1.5">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 bg-bg-raised border rounded-md px-3 py-2 text-sm text-left transition-colors duration-200 ${
          open ? 'border-toyota-red/60 glow-ring' : 'border-border-steel hover:border-toyota-red/40'
        }`}
      >
        <span className={selected.size ? 'text-text-primary' : 'text-text-muted'}>{summary}</span>
        <svg
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto glass-panel rounded-md shadow-xl py-1">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-toyota-red/10 hover:text-text-primary transition-colors duration-150"
          >
            Clear (All)
          </button>
          <div className="hairline my-1" />
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">No values in data</div>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-toyota-red/10 cursor-pointer transition-colors duration-150"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="accent-[#eb0a1e]"
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
