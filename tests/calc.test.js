// Unit test for the day sheet formulas: node tests/calc.test.js
const assert = require('assert');
const C = require('../calc.js');

const sample = {
  date: '2026-10-05',
  start: { singles: 40, fives: 10, tens: 5, twenties: 3, other: '', pennies: 50, nickels: 40, dimes: 50, quarters: 40 },
  sales: '2,345.67', taxable: '812.40', taxCollected: '70.07',
  payouts: [{ vendor: "Boar's Head", amount: '312.45' }, { vendor: 'Sysco', amount: '88.10' }, { vendor: 'Coke', amount: '46' }],
  overrings: [{ note: 'wrong item', amount: '12.50' }, { note: '', amount: '4.25' }],
  merchant: '1410.22',
  leave: { hundreds: 2, fifties: 1, twenties: 10, tens: 8, fives: 12, singles: 47, quarters: 36, dimes: 25, nickels: 20, pennies: 63 }
};
const expected = {
  onStart: 217.50, sales: 2345.67, taxable: 812.40, taxCollected: 70.07, payouts: 446.55, overrings: 16.75,
  merchant: 1410.22, leaveTotal: 650.13, booksAfterPayouts: 2099.87, actualBalance: 2060.35,
  difference: -39.52, status: 'SHORT', income: 1842.85
};
let pass = 0;
const r = C.computeDaySheet(sample);
for (const k of Object.keys(expected)) { assert.strictEqual(r[k], expected[k], k + ': got ' + r[k] + ' want ' + expected[k]); pass++; }

// OVER case: +$50 more card
const r2 = C.computeDaySheet(Object.assign({}, sample, { merchant: '1460.22' }));
assert.strictEqual(r2.difference, 10.48); assert.strictEqual(r2.status, 'OVER'); pass += 2;

// EVEN case
const r3 = C.computeDaySheet(Object.assign({}, sample, { merchant: '1449.74' }));
assert.strictEqual(r3.difference, 0); assert.strictEqual(r3.status, 'EVEN'); pass += 2;

// Blank day computes to zeros without NaN
const r4 = C.computeDaySheet({});
assert.ok(Object.values(r4).every(v => typeof v !== 'number' || v === 0)); pass++;

// Prefill next day's start from leave-in (hundreds+fifties -> Other $250)
const s = C.startFromLeave(sample.leave);
assert.strictEqual(s.other, '250');
assert.strictEqual(C.computeDaySheet({ start: s }).onStart, 650.13); pass += 2;

// Labels / timezone
assert.strictEqual(C.dayLabel('2026-10-06'), '10062026TUE');
assert.strictEqual(C.dayLabel('2026-10-05'), '10052026MON');
assert.strictEqual(C.todayNY(new Date('2026-10-07T02:30:00Z')), '2026-10-06'); // 10:30 PM ET still Oct 6
assert.strictEqual(C.money(-39.52), '-$39.52');
pass += 4;

// NY sales tax 8.75% link
assert.strictEqual(C.TAX_RATE, 0.0875);
assert.strictEqual(C.taxableFromTax('87.50'), '1000.00');
assert.strictEqual(C.taxFromTaxable('812.40'), '71.09');   // 71.085 rounds up
assert.strictEqual(C.taxFromTaxable('1,000'), '87.50');
assert.strictEqual(C.taxableFromTax('71.09'), '812.46');
assert.strictEqual(C.taxFromTaxable('600'), '52.50');
assert.strictEqual(C.taxFromTaxable(''), '');
assert.strictEqual(C.taxableFromTax(''), '');
assert.strictEqual(C.taxFromTaxable('0.05'), '0.00');
pass += 9;
// addDays (month/year rollover)
assert.strictEqual(C.addDays('2026-10-10', 1), '2026-10-11');
assert.strictEqual(C.addDays('2026-10-31', 1), '2026-11-01');
assert.strictEqual(C.addDays('2026-12-31', 2), '2027-01-02');
pass += 3;

console.log('calc tests passed: ' + pass + ' assertions');
console.log(JSON.stringify(r, null, 1));
