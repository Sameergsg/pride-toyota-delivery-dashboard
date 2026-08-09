import { useState } from 'react';
import type { VehicleRow } from '../types';
import type { FilterState } from '../lib/filterLogic';
import { isFilterStateEmpty } from '../lib/filterLogic';
import { DateRangeField } from './DateRangeField';

interface Props {
  rows: VehicleRow[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

// CTDMS Status and Customer Status now have their own clickable KPI cards
// above (see App.tsx's Dashboard) — no need for a duplicate dropdown here.
export function FilterPanel({ filters, onChange }: Props) {
  const [dateSectionOpen, setDateSectionOpen] = useState(false);

  const dateRangeCount = Object.values(filters.dateRanges).filter((r) => r.from || r.to).length;

  function clearAll() {
    onChange({
      ctdmsStatus: new Set(),
      customerStatus: new Set(),
      dateRanges: {
        invoiceDate: { from: null, to: null },
        estDeliveryDate: { from: null, to: null },
        dnDate: { from: null, to: null },
        deliveryDate: { from: null, to: null },
        tfsPaymentDate: { from: null, to: null },
      },
      columnFilters: {},
      search: '',
    });
  }

  return (
    <div className="glass-panel rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setDateSectionOpen((o) => !o)}
          className="flex-1 flex items-center justify-between text-sm text-text-secondary hover:text-text-primary transition-colors duration-150"
        >
          <span className="flex items-center gap-2">
            Date filters
            {dateRangeCount > 0 && (
              <span className="text-[10px] bg-toyota-red/20 text-toyota-red rounded-full px-1.5 py-0.5">
                {dateRangeCount} active
              </span>
            )}
          </span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${dateSectionOpen ? 'rotate-180' : ''}`}
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
        {!isFilterStateEmpty(filters) && (
          <button
            onClick={clearAll}
            className="ml-3 shrink-0 text-xs text-toyota-red hover:text-white hover:bg-toyota-red transition-colors duration-150 border border-toyota-red/50 rounded px-2 py-1"
          >
            Clear all filters
          </button>
        )}
      </div>

      {dateSectionOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateRangeField
            label="Invoice Date"
            value={filters.dateRanges.invoiceDate}
            onChange={(next) => onChange({ ...filters, dateRanges: { ...filters.dateRanges, invoiceDate: next } })}
          />
          <DateRangeField
            label="EST Delivery Date"
            value={filters.dateRanges.estDeliveryDate}
            onChange={(next) =>
              onChange({ ...filters, dateRanges: { ...filters.dateRanges, estDeliveryDate: next } })
            }
          />
          <DateRangeField
            label="DN Date"
            value={filters.dateRanges.dnDate}
            onChange={(next) => onChange({ ...filters, dateRanges: { ...filters.dateRanges, dnDate: next } })}
          />
          <DateRangeField
            label="Delivery Date"
            value={filters.dateRanges.deliveryDate}
            onChange={(next) => onChange({ ...filters, dateRanges: { ...filters.dateRanges, deliveryDate: next } })}
          />
        </div>
      )}
    </div>
  );
}
