#!/usr/bin/env node
/**
 * Standalone verification for scripts/dateParser.mjs — run with:
 *   node scripts/test-date-parser.mjs
 *
 * Proves the top-priority requirement: an Excel serial number and a
 * locale-formatted text string for the SAME calendar date parse to the
 * SAME ISO output, plus edge cases (blank / garbage -> null, not a fake date).
 */
import { parseCellDate, excelSerialToISO, parseDateText } from './dateParser.mjs';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    pass++;
    console.log(`  ok   ${label}  ->  ${JSON.stringify(actual)}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}  ->  got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

console.log('\n=== Serial number vs. text string agree on the same calendar date ===');
// 2024-03-15 as an Excel serial number (days since 1899-12-30, with the 1900 leap bug)
const serial = 45366; // corresponds to 2024-03-15
check('excelSerialToISO(45366)', excelSerialToISO(serial), '2024-03-15');
check('parseDateText("15-03-2024")', parseDateText('15-03-2024'), '2024-03-15');
check('parseDateText("15/03/2024")', parseDateText('15/03/2024'), '2024-03-15');
check('parseDateText("2024-03-15")', parseDateText('2024-03-15'), '2024-03-15');
check(
  'parseCellDate(serial, text, dd-mm-yyyy fmt) === parseCellDate(0, "15-03-2024", General)',
  parseCellDate(45366, '15-03-2024', 'dd-mm-yyyy'),
  parseCellDate(undefined, '15-03-2024', 'General'),
);

console.log('\n=== Full matrix: cell delivered as serial vs. as formatted text, same date ===');
const cases = [
  { serial: 45658, ddmmyyyy: '01-01-2025', label: '2025-01-01' },
  { serial: 44955, ddmmyyyy: '29-01-2023', label: '2023-01-29' },
  { serial: 46001, ddmmyyyy: '10-12-2025', label: '2025-12-10' },
];
for (const c of cases) {
  const fromSerial = parseCellDate(c.serial, String(c.serial), 'dd-mm-yyyy');
  const fromText = parseCellDate(undefined, c.ddmmyyyy, 'General');
  check(`serial ${c.serial} == text "${c.ddmmyyyy}"`, fromSerial, c.label);
  check(`  (cross-check both equal expected)`, fromText, c.label);
  check(`  (cross-check serial === text)`, fromSerial, fromText);
}

console.log('\n=== DD/MM/YYYY slash variant ===');
check('parseDateText("05/07/2024") (5 Jul, not May 7)', parseDateText('05/07/2024'), '2024-07-05');

console.log('\n=== Blank / garbage -> null (never a fabricated date) ===');
check('parseDateText("")', parseDateText(''), null);
check('parseDateText(null)', parseDateText(null), null);
check('parseDateText("   ")', parseDateText('   '), null);
check('parseDateText("N/A")', parseDateText('N/A'), null);
check('parseDateText("TBD")', parseDateText('TBD'), null);
check('parseDateText("-")', parseDateText('-'), null);
check('parseCellDate(null, null, null)', parseCellDate(null, null, null), null);
check('parseCellDate(0, "", "General")', parseCellDate(0, '', 'General'), null);

console.log('\n=== ISO passthrough ===');
check('parseDateText("2025-08-08")', parseDateText('2025-08-08'), '2025-08-08');

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.exit(1);
}
