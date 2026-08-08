import { useMemo, useState } from 'react';
import type { VehicleRow } from '../types';
import type { FilterState, SortState } from '../lib/filterLogic';
import { TABLE_COLUMNS, applyAllFilters, applySort, distinctValues } from '../lib/filterLogic';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

interface Props {
  allRows: VehicleRow[];
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

export function VehicleTable({ allRows, filters, onFiltersChange }: Props) {
  const [sort, setSort] = useState<SortState>({ key: null, dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const filtered = useMemo(() => applyAllFilters(allRows, filters), [allRows, filters]);
  const sorted = useMemo(() => applySort(filtered, sort), [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [sorted, clampedPage, pageSize],
  );

  function toggleSort(key: (typeof TABLE_COLUMNS)[number]['key']) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  function setColumnFilter(key: (typeof TABLE_COLUMNS)[number]['key'], value: string) {
    setPage(1);
    onFiltersChange({ ...filters, columnFilters: { ...filters.columnFilters, [key]: value } });
  }

  function setSearch(value: string) {
    setPage(1);
    onFiltersChange({ ...filters, search: value });
  }

  return (
    <div className="glass-panel rounded-lg overflow-hidden flex flex-col">
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border-steel">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search across all visible columns…"
            className="w-full bg-bg-raised border border-border-steel focus:border-toyota-red/60 rounded-md pl-9 pr-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200"
          />
        </div>
        <div className="text-xs text-text-secondary whitespace-nowrap">
          Showing <span className="text-text-primary font-medium tabular-nums">{pageRows.length}</span> of{' '}
          <span className="text-text-primary font-medium tabular-nums">{sorted.length}</span> records
          {sorted.length !== allRows.length && (
            <span className="text-text-muted"> (of {allRows.length} total)</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[1100px]">
          <thead>
            <tr className="border-b border-border-steel">
              {TABLE_COLUMNS.map((col) => (
                <th key={col.key} className="text-left align-top p-0">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="w-full flex items-center gap-1 px-3 pt-3 pb-1.5 text-[11px] uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors duration-150"
                  >
                    {col.label}
                    <SortIcon active={sort.key === col.key} dir={sort.dir} />
                  </button>
                  <div className="px-3 pb-2.5">
                    <ColumnFilterControl
                      col={col}
                      rows={allRows}
                      value={filters.columnFilters[col.key] ?? ''}
                      onChange={(v) => setColumnFilter(col.key, v)}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={`${row.chassis ?? 'row'}-${i}`}
                className="border-b border-border-steel/60 hover:bg-toyota-red/5 transition-colors duration-150"
              >
                {TABLE_COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-text-primary/90 whitespace-nowrap">
                    {row[col.key] || <span className="text-text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-1">
            <p className="text-sm">No rows match your filters.</p>
            <p className="text-xs">Try clearing a filter or broadening your search.</p>
          </div>
        )}
      </div>

      <div className="p-3 flex items-center justify-between gap-3 border-t border-border-steel text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-bg-raised border border-border-steel rounded px-2 py-1 text-xs text-text-primary outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={clampedPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-border-steel disabled:opacity-30 hover:border-toyota-red/50 transition-colors duration-150"
          >
            Prev
          </button>
          <span className="tabular-nums">
            Page {clampedPage} / {totalPages}
          </span>
          <button
            disabled={clampedPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded border border-border-steel disabled:opacity-30 hover:border-toyota-red/50 transition-colors duration-150"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <svg
      className={`w-3 h-3 transition-transform duration-200 ${active ? 'text-toyota-red' : 'text-text-muted'} ${
        active && dir === 'desc' ? 'rotate-180' : ''
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ColumnFilterControl({
  col,
  rows,
  value,
  onChange,
}: {
  col: (typeof TABLE_COLUMNS)[number];
  rows: VehicleRow[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (col.kind === 'select') {
    const options = distinctValues(rows, col.key);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-bg-raised border rounded px-1.5 py-1 text-[11px] text-text-primary outline-none transition-colors duration-150 ${
          value ? 'border-toyota-red/50' : 'border-border-steel'
        }`}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="contains…"
      className={`w-full bg-bg-raised border rounded px-1.5 py-1 text-[11px] text-text-primary outline-none transition-colors duration-150 ${
        value ? 'border-toyota-red/50' : 'border-border-steel'
      }`}
    />
  );
}
