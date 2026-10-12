/*
 * South Fork Deli Day Sheet — calculation module.
 * Loaded by index.html (as window.DaySheetCalc) and by node tests (module.exports).
 * All money math is done in integer CENTS to avoid floating-point rounding errors.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DaySheetCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Starting drawer ("on start") lines. kind:'count' => quantity x value; kind:'amount' => dollars typed directly.
  var START_DENOMS = [
    { key: 'singles',  label: 'SINGLES',  value: 1,    kind: 'count' },
    { key: 'fives',    label: 'Fives',    value: 5,    kind: 'count' },
    { key: 'tens',     label: 'Tens',     value: 10,   kind: 'count' },
    { key: 'twenties', label: 'Twenties', value: 20,   kind: 'count' },
    { key: 'other',    label: 'Other ($)', value: 1,   kind: 'amount' },
    { key: 'pennies',  label: 'Pennies',  value: 0.01, kind: 'count' },
    { key: 'nickels',  label: 'Nickels',  value: 0.05, kind: 'count' },
    { key: 'dimes',    label: 'Dimes',    value: 0.10, kind: 'count' },
    { key: 'quarters', label: 'Quarters', value: 0.25, kind: 'count' }
  ];

  // Leave-in cash lines (all counts).
  var LEAVE_DENOMS = [
    { key: 'hundreds', label: 'Hundreds', value: 100,  kind: 'count' },
    { key: 'fifties',  label: 'Fifties',  value: 50,   kind: 'count' },
    { key: 'twenties', label: 'Twenties', value: 20,   kind: 'count' },
    { key: 'tens',     label: 'Tens',     value: 10,   kind: 'count' },
    { key: 'fives',    label: 'Fives',    value: 5,    kind: 'count' },
    { key: 'singles',  label: 'Singles',  value: 1,    kind: 'count' },
    { key: 'quarters', label: 'Quarters', value: 0.25, kind: 'count' },
    { key: 'dimes',    label: 'Dimes',    value: 0.10, kind: 'count' },
    { key: 'nickels',  label: 'Nickels',  value: 0.05, kind: 'count' },
    { key: 'pennies',  label: 'Pennies',  value: 0.01, kind: 'count' }
  ];

  // Parse user input ("1,234.5", "$20", "") into a number. Blank/invalid => 0.
  function num(v) {
    if (v === null || v === undefined) return 0;
    var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function toCents(dollars) { return Math.round(num(dollars) * 100); }
  function fromCents(c) { return c / 100; }

  // Amount (in cents) for a denomination line.
  function lineCents(d, raw) {
    if (d.kind === 'amount') return toCents(raw);
    return Math.round(num(raw) * Math.round(d.value * 100));
  }

  function blockCents(denoms, obj) {
    obj = obj || {};
    var lines = {}, total = 0;
    denoms.forEach(function (d) {
      var c = lineCents(d, obj[d.key]);
      lines[d.key] = c; total += c;
    });
    return { lines: lines, total: total };
  }

  function rowsCents(rows) {
    var t = 0;
    (rows || []).forEach(function (r) { t += toCents(r && r.amount); });
    return t;
  }

  /* =========================================================================
   * computeDaySheet(day)  —  THE DAY SHEET FORMULAS (edit here to adjust)
   * -------------------------------------------------------------------------
   *   On start            = sum of starting drawer lines
   *   Payouts             = sum of payout rows        (cash paid out to vendors)
   *   Over-rings          = sum of over-ring rows     (voided/over-rung sales)
   *   Leave-in cash       = sum of leave-in cash lines
   *   Merchant services   = Clover credit + debit total (non-cash)
   *
   *   Books after payouts = On start + Sales - Payouts - Over-rings
   *   Actual balance      = Leave-in cash + Merchant services
   *   Difference          = Actual balance - Books after payouts
   *                           > 0  => OVER   (green)
   *                           < 0  => SHORT  (red)
   *                           = 0  => EVEN
   *   Income              = Actual balance - On start
   *
   * "Sales" is Clover "Amount collected". Taxable sales / sales tax are recorded
   * for reporting only and do NOT enter the over/short math.
   * All intermediate math is in cents; results are returned in dollars.
   * ========================================================================= */
  function computeDaySheet(day) {
    day = day || {};
    var start = blockCents(START_DENOMS, day.start);
    var leave = blockCents(LEAVE_DENOMS, day.leave);

    var onStart    = start.total;
    var sales      = toCents(day.sales);
    var payouts    = rowsCents(day.payouts);
    var overrings  = rowsCents(day.overrings);
    var merchant   = toCents(day.merchant);
    var leaveTotal = leave.total;

    var booksAfterPayouts = onStart + sales - payouts - overrings;
    var actualBalance     = leaveTotal + merchant;
    var difference        = actualBalance - booksAfterPayouts;
    var income            = actualBalance - onStart;

    var startLines = {}, leaveLines = {};
    Object.keys(start.lines).forEach(function (k) { startLines[k] = fromCents(start.lines[k]); });
    Object.keys(leave.lines).forEach(function (k) { leaveLines[k] = fromCents(leave.lines[k]); });

    return {
      startLines: startLines,
      leaveLines: leaveLines,
      onStart: fromCents(onStart),
      sales: fromCents(sales),
      taxable: fromCents(toCents(day.taxable)),
      taxCollected: fromCents(toCents(day.taxCollected)),
      payouts: fromCents(payouts),
      overrings: fromCents(overrings),
      merchant: fromCents(merchant),
      leaveTotal: fromCents(leaveTotal),
      booksAfterPayouts: fromCents(booksAfterPayouts),
      actualBalance: fromCents(actualBalance),
      difference: fromCents(difference),
      status: difference > 0 ? 'OVER' : (difference < 0 ? 'SHORT' : 'EVEN'),
      income: fromCents(income)
    };
  }

  // Map the previous day's leave-in cash to the next day's starting drawer.
  // Hundreds and fifties have no start line, so they go into "Other ($)".
  function startFromLeave(leave) {
    leave = leave || {};
    var big = num(leave.hundreds) * 100 + num(leave.fifties) * 50;
    var s = {
      singles: leave.singles || '', fives: leave.fives || '', tens: leave.tens || '',
      twenties: leave.twenties || '', other: big ? String(big) : '',
      pennies: leave.pennies || '', nickels: leave.nickels || '',
      dimes: leave.dimes || '', quarters: leave.quarters || ''
    };
    return s;
  }

  // Day label like 10062026TUE from an ISO date "2026-10-06".
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function dayLabel(iso) {
    var p = String(iso).split('-');
    if (p.length !== 3) return '';
    var dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return p[1] + p[2] + p[0] + DOW[dt.getUTCDay()];
  }

  // Today's date (YYYY-MM-DD) in America/New_York.
  function todayNY(now) {
    var f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    return f.format(now || new Date());
  }

  function money(v) {
    var n = num(v), neg = n < 0;
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-$' : '$') + s;
  }

  return {
    START_DENOMS: START_DENOMS, LEAVE_DENOMS: LEAVE_DENOMS,
    computeDaySheet: computeDaySheet, startFromLeave: startFromLeave,
    dayLabel: dayLabel, todayNY: todayNY, money: money, num: num
  };
});
