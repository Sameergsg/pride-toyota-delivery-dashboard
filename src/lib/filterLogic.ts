import type { VehicleRow, DateField } from '../types';

export interface DateRangeFilter {
  from: string | null; // inclusive, ISO YYYY-MM-DD
  to: string | null; // inclusive, ISO YYYY-MM-DD
}

export const EMPTY_RANGE: DateRangeFilter = { from: null, to: null };

/** Table columns, each with its own per-column filter/search control. */
export const TABLE_COLUMNS = [
  { key: 'customerName', label: 'Customer Name', kind: 'text' as const },
  { key: 'chassis', label: 'Chassis', kind: 'text' as const },
  { key: 'engNo', label: 'Eng No.', kind: 'text' as const },
  { key: 'mfYear', label: 'MF. Year', kind: 'select' as const },
  { key: 'model', label: 'Model', kind: 'select' as const },
  { key: 'suffix', label: 'Suffix', kind: 'select' as const },
  { key: 'fuel', label: 'Fuel', kind: 'select' as const },
  { key: 'variant', label: 'Variant', kind: 'select' as const },
  { key: 'colour', label: 'Colour', kind: 'select' as const },
  { key: 'intColour', label: 'Int. Colour', kind: 'select' as const },
  { key: 'soName', label: 'SO Name', kind: 'select' as const },
  { key: 'tlName', label: 'TL Name', kind: 'select' as const },
  { key: 'exShowroom', label: 'Ex-Showroom', kind: 'text' as const },
] satisfies { key: keyof VehicleRow; label: string; kind: 'text' | 'select' }[];

export type ColumnKey = (typeof TABLE_COLUMNS)[number]['key'];

export interface FilterState {
  ctdmsStatus: Set<string>;
  customerStatus: Set<string>;
  dateRanges: Record<DateField, DateRangeFilter>;
  columnFilters: Partial<Record<ColumnKey, string>>;
  search: string;
}

export function makeEmptyFilterState(): FilterState {
  return {
    ctdmsStatus: new Set(),
    customerStatus: new Set(),
    dateRanges: {
      invoiceDate: { ...EMPTY_RANGE },
      estDeliveryDate: { ...EMPTY_RANGE },
      dnDate: { ...EMPTY_RANGE },
      deliveryDate: { ...EMPTY_RANGE },
      tfsPaymentDate: { ...EMPTY_RANGE },
    },
    columnFilters: {},
    search: '',
  };
}

export function isFilterStateEmpty(f: FilterState): boolean {
  if (f.ctdmsStatus.size > 0 || f.customerStatus.size > 0) return false;
  if (f.search.trim() !== '') return false;
  if (Object.values(f.columnFilters).some((v) => v && v.trim() !== '')) return false;
  if (Object.values(f.dateRanges).some((r) => r.from || r.to)) return false;
  return true;
}

/** Inclusive range check on ISO "YYYY-MM-DD" strings (lexicographic compare is safe for ISO dates). */
function inRange(value: string | null, range: DateRangeFilter): boolean {
  if (!range.from && !range.to) return true; // no constraint
  if (!value) return false; // constrained but row has no date -> excluded
  if (range.from && value < range.from) return false;
  if (range.to && value > range.to) return false;
  return true;
}

export function distinctValues(rows: VehicleRow[], key: keyof VehicleRow): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row[key];
    if (v !== null && v !== undefined && v !== '') set.add(String(v));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Apply status + date-range filters only (used for KPI computation, which excludes CTDMS status itself). */
export function applyNonStatusFilters(
  rows: VehicleRow[],
  filters: FilterState,
  opts: { skipCtdmsStatus?: boolean } = {},
): VehicleRow[] {
  return rows.filter((row) => {
    if (!opts.skipCtdmsStatus && filters.ctdmsStatus.size > 0) {
      if (!row.ctdmsStatus || !filters.ctdmsStatus.has(row.ctdmsStatus)) return false;
    }
    if (filters.customerStatus.size > 0) {
      if (!row.customerStatus || !filters.customerStatus.has(row.customerStatus)) return false;
    }
    for (const field of Object.keys(filters.dateRanges) as DateField[]) {
      if (!inRange(row[field], filters.dateRanges[field])) return false;
    }
    return true;
  });
}

/** Full pipeline: status + date ranges + per-column filters + global search. */
export function applyAllFilters(rows: VehicleRow[], filters: FilterState): VehicleRow[] {
  let out = applyNonStatusFilters(rows, filters);

  for (const col of TABLE_COLUMNS) {
    const val = filters.columnFilters[col.key];
    if (!val || val.trim() === '') continue;
    if (col.kind === 'select') {
      out = out.filter((row) => String(row[col.key] ?? '') === val);
    } else {
      const needle = val.trim().toLowerCase();
      out = out.filter((row) => String(row[col.key] ?? '').toLowerCase().includes(needle));
    }
  }

  const search = filters.search.trim().toLowerCase();
  if (search) {
    out = out.filter((row) =>
      TABLE_COLUMNS.some((col) => String(row[col.key] ?? '').toLowerCase().includes(search)),
    );
  }

  return out;
}

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: ColumnKey | null;
  dir: SortDirection;
}

export function applySort(rows: VehicleRow[], sort: SortState): VehicleRow[] {
  if (!sort.key) return rows;
  const key = sort.key;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
