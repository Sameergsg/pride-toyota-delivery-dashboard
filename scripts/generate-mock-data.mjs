#!/usr/bin/env node
/**
 * Generates a realistic public/data.json for demoing the dashboard before
 * Azure AD credentials are wired up. Matches the exact schema sync.mjs
 * produces, with varied CTDMS/Customer statuses (never hardcoded downstream —
 * this is just plausible sample data) and a spread of dates so the date
 * filters have something meaningful to slice.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'data.json');

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(42);
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function maybe(arr, blankChance = 0.15) {
  if (rand() < blankChance) return null;
  return pick(arr);
}
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const MODELS = [
  { model: 'INNOVA HYCROSS', suffixes: ['G', 'GX', 'VX', 'ZX'], fuels: ['HYBRID', 'PETROL'] },
  { model: 'FORTUNER', suffixes: ['GX', 'VX', 'LEGENDER'], fuels: ['DIESEL', 'PETROL'] },
  { model: 'CAMRY', suffixes: ['HYBRID'], fuels: ['HYBRID'] },
  { model: 'GLANZA', suffixes: ['E', 'S', 'G', 'V'], fuels: ['PETROL', 'CNG'] },
  { model: 'URBAN CRUISER TAISOR', suffixes: ['E', 'S', 'V'], fuels: ['PETROL', 'CNG'] },
  { model: 'HYRYDER', suffixes: ['E', 'S', 'G', 'V'], fuels: ['HYBRID', 'PETROL'] },
  { model: 'RUMION', suffixes: ['S', 'G', 'V'], fuels: ['PETROL'] },
  { model: 'VELLFIRE', suffixes: ['EXECUTIVE LOUNGE'], fuels: ['HYBRID'] },
];
const COLOURS = ['WHITE PEARL CS', 'SILVER METALLIC', 'ATTITUDE BLACK MC', 'PHANTOM BROWN MC', 'RED MC', 'GREY METALLIC', 'BLUE METALLIC', 'SUPER WHITE'];
const INT_COLOURS = ['BLACK', 'IVORY', 'TAN', 'BLACK/BROWN'];
const TL_NAMES = ['Rajesh Sharma', 'Amit Kumar', 'Vikas Yadav', 'Sunil Chauhan', 'Pooja Verma'];
const SO_NAMES = ['Ankit Gupta', 'Ravi Singh', 'Neha Jain', 'Deepak Malik', 'Priya Sharma', 'Manoj Tyagi', 'Kavita Rani', 'Suresh Kumar'];
const FIRST_NAMES = ['Rakesh', 'Sunita', 'Mahesh', 'Anita', 'Rohit', 'Kiran', 'Sanjay', 'Meena', 'Vijay', 'Rekha', 'Ashok', 'Geeta', 'Naresh', 'Usha', 'Deepak', 'Nisha'];
const LAST_NAMES = ['Bhiwani', 'Yadav', 'Sharma', 'Kumar', 'Gupta', 'Singh', 'Verma', 'Jain', 'Malik', 'Chauhan'];
const CTDMS_STATUSES = ['ALLOTTED', 'INVOICED', 'DELIVERED', 'STOCK', 'IN TRANSIT'];
const CUSTOMER_STATUSES = ['BOOKED', 'PAYMENT PENDING', 'READY FOR DELIVERY', 'DELIVERED', 'CANCELLED'];
const STOCK_STATUSES = ['AVAILABLE', 'ALLOTTED', 'BILLED', 'IN TRANSIT'];
const RTO_NAMES = ['BHIWANI RTO', 'HISAR RTO', 'ROHTAK RTO', 'CHARKHI DADRI RTO'];
const REMARKS = [null, null, null, 'Customer requested delay', 'Finance approval pending', 'Awaiting RTO slot', 'VIP customer', 'Exchange vehicle pending'];
const STOCK_LOCATIONS = ['BHIWANI YARD', 'DEALERSHIP FLOOR', 'TRANSIT HUB', 'CHARKHI DADRI YARD'];

function randomDateStr(startISO, endISO) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const t = start + rand() * (end - start);
  return new Date(t).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Matches the real sheet's current scale (~744 rows as of Aug 2026) so the
// demo dataset exercises pagination/scroll/filtering the same way the real
// data will. The sync pipeline itself (scripts/sync.mjs) has no row cap —
// it reads the full Excel Table/usedRange dynamically, so it will keep
// working unchanged as the real sheet grows well past this.
const ROW_COUNT = 744;
const rows = [];

for (let i = 1; i <= ROW_COUNT; i++) {
  const m = pick(MODELS);
  const invoiceDate = rand() < 0.9 ? randomDateStr('2024-06-01', '2026-08-08') : null;
  const estDeliveryDate = invoiceDate && rand() < 0.85 ? addDays(invoiceDate, randInt(3, 25)) : null;
  const dnDate = invoiceDate && rand() < 0.6 ? addDays(invoiceDate, randInt(1, 10)) : null;
  const deliveryDate = estDeliveryDate && rand() < 0.55 ? addDays(estDeliveryDate, randInt(-3, 6)) : null;
  const tfsPaymentDate = invoiceDate && rand() < 0.4 ? addDays(invoiceDate, randInt(-5, 2)) : null;
  const chassisSuffix = String(randInt(100000, 999999));
  const aging = invoiceDate
    ? String(Math.max(0, Math.round((Date.now() - new Date(invoiceDate).getTime()) / 86400000)))
    : null;

  rows.push({
    srNo: String(i),
    invoiceDate,
    aging,
    chassis: `MBJZ${m.model.slice(0, 2).toUpperCase()}${chassisSuffix}`,
    engNo: `2${pick(['TR', 'GD', 'NR', 'ZR'])}${randInt(1000000, 9999999)}`,
    mfYear: pick(['2024', '2025', '2026']),
    model: m.model,
    suffix: pick(m.suffixes),
    fuel: pick(m.fuels),
    variant: `${m.model} ${pick(m.suffixes)} ${pick(m.fuels)}`,
    colour: pick(COLOURS),
    intColour: pick(INT_COLOURS),
    tlName: pick(TL_NAMES),
    soName: pick(SO_NAMES),
    customerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    ctdmsStatus: pick(CTDMS_STATUSES),
    customerStatus: pick(CUSTOMER_STATUSES),
    estDeliveryDate,
    ctdmsInvoice: invoiceDate ? `INV${randInt(100000, 999999)}` : null,
    dnDate,
    deliveryDate,
    stockStatus: pick(STOCK_STATUSES),
    reference: maybe(SO_NAMES, 0.5),
    tfsPaymentDate,
    exShowroom: `${(randInt(950000, 2800000)).toLocaleString('en-IN')}`,
    rtoName: pick(RTO_NAMES),
    remarks: pick(REMARKS),
    stockLocation: pick(STOCK_LOCATIONS),
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  rows,
};

await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`✓ Wrote ${rows.length} mock rows to ${OUT_PATH}`);
