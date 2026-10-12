/* South Fork Deli Day Sheet — UI + storage. No dependencies. */
(function () {
  'use strict';
  var C = window.DaySheetCalc;
  var APP_VERSION = '1.1.0';
  var STORE_KEY = 'sfd.daysheet.v1';
  var DRAFT_KEY = 'sfd.daysheet.draft.v1';

  var $ = function (id) { return document.getElementById(id); };
  var money = C.money;

  // ---------------------------------------------------------------- storage
  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && s.days && typeof s.days === 'object') return s;
    } catch (e) { console.error(e); }
    return { app: 'south-fork-deli-daysheet', version: 1, days: {} };
  }
  var store = loadStore();
  store.drawers = store.drawers || {};  // leave-in drawers assigned to a future date: { "YYYY-MM-DD": {start, leave, fromDate, fromLabel, assignedAt} }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); return true; }
    catch (e) { alert('Could not save: storage is full or blocked. Export a backup now.\n' + e.message); return false; }
  }
  function sortedDates(desc) {
    var d = Object.keys(store.days).sort();
    return desc ? d.reverse() : d;
  }
  function prevSavedDay(iso) {
    var d = sortedDates(true);
    for (var i = 0; i < d.length; i++) if (d[i] < iso) return store.days[d[i]];
    return null;
  }

  // ---------------------------------------------------------------- state
  function blankDay(iso) {
    return {
      date: iso, label: C.dayLabel(iso),
      start: {}, sales: '', taxable: '', taxCollected: '',
      payouts: [], overrings: [], merchant: '', leave: {}, notes: ''
    };
  }
  var cur = null;          // day being edited
  var dirty = false;
  var prefilledFrom = '';  // label of the day the start was prefilled from
  function startNonZero(start) { return C.computeDaySheet({ start: start }).onStart !== 0; }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- build denomination grids
  function buildGrid(el, denoms, group) {
    var h = '<div class="hd">Denomination</div><div class="hd r">' + (group === 'start' ? 'Count' : 'Count') + '</div><div class="hd r">Amount</div>';
    denoms.forEach(function (d) {
      var id = group + '_' + d.key;
      var isAmt = d.kind === 'amount';
      h += '<label for="' + id + '">' + d.label + '</label>' +
        '<input class="n" id="' + id + '" data-path="' + group + '.' + d.key + '" inputmode="' + (isAmt ? 'decimal' : 'numeric') +
        '" autocomplete="off" placeholder="' + (isAmt ? '$0.00' : '0') + '">' +
        '<div class="amt" id="' + id + '_amt">$0.00</div>';
    });
    el.innerHTML = h;
  }
  buildGrid($('startGrid'), C.START_DENOMS, 'start');
  buildGrid($('leaveGrid'), C.LEAVE_DENOMS, 'leave');

  // ---------------------------------------------------------------- rows (payouts / over-rings)
  var ROWCFG = {
    payouts:   { el: 'payoutRows',   ph: 'Vendor name', empty: 'No payouts.' },
    overrings: { el: 'overringRows', ph: 'Note (optional)', empty: 'No over-rings.' }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function renderRows(kind) {
    var cfg = ROWCFG[kind], rows = cur[kind], h = '';
    if (!rows.length) h = '<p class="empty">' + cfg.empty + '</p>';
    rows.forEach(function (r, i) {
      var nameKey = kind === 'payouts' ? 'vendor' : 'note';
      h += '<div class="row">' +
        '<input class="t" data-row="' + kind + '" data-idx="' + i + '" data-field="' + nameKey + '" placeholder="' + cfg.ph + '" value="' + esc(r[nameKey]) + '" autocomplete="off" aria-label="' + cfg.ph + '">' +
        '<div class="money-in"><input class="n" data-row="' + kind + '" data-idx="' + i + '" data-field="amount" inputmode="decimal" placeholder="0.00" value="' + esc(r.amount) + '" autocomplete="off" aria-label="Amount"></div>' +
        '<button class="x" type="button" data-del="' + kind + '" data-idx="' + i + '" aria-label="Remove">&times;</button></div>';
    });
    $(cfg.el).innerHTML = h;
  }

  // ---------------------------------------------------------------- fill form from state
  function fillForm() {
    document.querySelectorAll('[data-path]').forEach(function (el) {
      var p = el.getAttribute('data-path').split('.');
      var v = p.length === 2 ? (cur[p[0]] || {})[p[1]] : cur[p[0]];
      el.value = v == null ? '' : v;
    });
    renderRows('payouts'); renderRows('overrings');
    $('date').value = cur.date;
    $('dayLabel').textContent = C.dayLabel(cur.date);
    $('assignDate').value = C.addDays(cur.date, 1);
    $('assignDate').min = C.addDays(cur.date, 1);
    updateAssignNote();
    recalc();
  }

  // ---------------------------------------------------------------- recalc + render results
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function recalc() {
    var r = C.computeDaySheet(cur);
    C.START_DENOMS.forEach(function (d) { setText('start_' + d.key + '_amt', money(r.startLines[d.key])); });
    C.LEAVE_DENOMS.forEach(function (d) { setText('leave_' + d.key + '_amt', money(r.leaveLines[d.key])); });
    setText('startTotal', money(r.onStart));
    setText('leaveTotal', money(r.leaveTotal));
    setText('payoutTotal', money(r.payouts));
    setText('overringTotal', money(r.overrings));
    setText('rOnStart', money(r.onStart));
    setText('rSales', money(r.sales));
    setText('rPayouts', money(r.payouts));
    setText('rOverrings', money(r.overrings));
    setText('rBooks', money(r.booksAfterPayouts));
    setText('rLeave', money(r.leaveTotal));
    setText('rMerchant', money(r.merchant));
    setText('rActual', money(r.actualBalance));
    setText('rIncome', money(r.income));
    var abs = money(Math.abs(r.difference));
    var cls = r.status === 'OVER' ? 'over' : r.status === 'SHORT' ? 'short' : '';
    $('diffBox').className = 'diff ' + cls;
    setText('diffLbl', r.status);
    setText('diffVal', (r.status === 'SHORT' ? '-' : r.status === 'OVER' ? '+' : '') + abs);
    setText('bbLbl', r.status === 'EVEN' ? 'Over / short' : r.status);
    var bb = $('bbVal');
    bb.textContent = (r.status === 'SHORT' ? '-' : r.status === 'OVER' ? '+' : '') + abs;
    bb.className = 'v ' + (cls ? cls + '-t' : '');
    updateStatus();
    return r;
  }

  function updateStatus() {
    var pill = $('statusPill');
    var saved = !!store.days[cur.date];
    if (dirty) { pill.textContent = saved ? 'Unsaved changes' : 'Not saved'; pill.className = 'pill dirty'; }
    else if (saved) { pill.textContent = 'Saved'; pill.className = 'pill saved'; }
    else { pill.textContent = 'New'; pill.className = 'pill'; }
    $('deleteBtn').disabled = !saved;
    $('taxDriverNote').textContent = cur.taxDriver === 'tax' ? '(taxable figured from tax)' : cur.taxDriver === 'taxable' ? '(tax figured from taxable)' : '';
    $('prefillNote').textContent = cur.drawerFrom ? 'drawer assigned from ' + cur.drawerFrom + ' leave-in' + (prefilledFrom.indexOf('edited') >= 0 ? ' (edited)' : '') : prefilledFrom ? 'prefilled from ' + prefilledFrom.replace(', edited', '') + ' leave-in' + (prefilledFrom.indexOf('edited') >= 0 ? ' (edited)' : '') : '';
  }

  // ---------------------------------------------------------------- draft autosave
  var draftTimer = null;
  function markDirty() {
    dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: cur.date, day: cur, prefilledFrom: prefilledFrom })); } catch (e) {}
    }, 300);
  }
  function clearDraft() { clearTimeout(draftTimer); localStorage.removeItem(DRAFT_KEY); $('draftBanner').hidden = true; }

  // ---------------------------------------------------------------- open a date
  function openDate(iso, opts) {
    opts = opts || {};
    prefilledFrom = '';
    $('draftBanner').hidden = true;
    if (store.days[iso]) {
      cur = clone(store.days[iso]);
      cur.payouts = cur.payouts || []; cur.overrings = cur.overrings || [];
      cur.start = cur.start || {}; cur.leave = cur.leave || {};
      prefilledFrom = cur.prefilledFrom || '';
    } else {
      cur = blankDay(iso);
      var prev = prevSavedDay(iso), asg = store.drawers[iso];
      if (asg) { cur.start = clone(asg.start); cur.drawerFrom = asg.fromLabel; cur.drawerFromDate = asg.fromDate; prefilledFrom = asg.fromLabel; }
      else if (prev) { cur.start = C.startFromLeave(prev.leave); prefilledFrom = prev.label || C.dayLabel(prev.date); }
    }
    dirty = false;
    if (!opts.ignoreDraft) {
      try {
        var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        if (d && d.date === iso && d.day) {
          var savedJson = store.days[iso] ? JSON.stringify(store.days[iso]) : null;
          if (JSON.stringify(d.day) !== savedJson) {
            cur = d.day; prefilledFrom = d.prefilledFrom || ''; dirty = true;
            $('draftBanner').hidden = false;
          } else clearDraft();
        }
      } catch (e) {}
    }
    fillForm();
  }

  function confirmLeave() {
    return !dirty || confirm('You have unsaved changes for ' + C.dayLabel(cur.date) + '. Discard them?');
  }

  // ---------------------------------------------------------------- save / delete
  function cleanRows(rows, nameKey) {
    return rows.filter(function (r) { return String(r.amount || '').trim() !== '' || String(r[nameKey] || '').trim() !== ''; });
  }
  function saveDay() {
    var active = document.activeElement; if (active && active.blur) active.blur();
    cur.payouts = cleanRows(cur.payouts, 'vendor');
    cur.overrings = cleanRows(cur.overrings, 'note');
    cur.label = C.dayLabel(cur.date);
    var r = C.computeDaySheet(cur);
    cur.computed = r;  // snapshot of results for history/CSV readers (recomputed on load anyway)
    cur.savedAt = new Date().toISOString();
    cur.prefilledFrom = prefilledFrom;
    store.days[cur.date] = clone(cur);
    delete store.drawers[cur.date];  // assigned drawer is now part of the saved day
    if (persist()) {
      dirty = false; clearDraft();
      renderRows('payouts'); renderRows('overrings');
      recalc(); renderHistory();
      toast('Saved ' + cur.label + ' — ' + r.status + ' ' + money(Math.abs(r.difference)));
    }
  }
  function deleteDay() {
    if (!store.days[cur.date]) return;
    if (!confirm('Delete the day sheet for ' + C.dayLabel(cur.date) + '? This cannot be undone.')) return;
    delete store.days[cur.date];
    persist(); clearDraft(); renderHistory();
    openDate(cur.date, { ignoreDraft: true });
    toast('Deleted');
  }

  // ---------------------------------------------------------------- NY sales tax link (8.75%)
  // Only runs on user input: the field just edited drives the other. Loading a saved day never recomputes.
  function linkTax(field) {
    if (field === 'taxable') { cur.taxDriver = 'taxable'; cur.taxCollected = C.taxFromTaxable(cur.taxable); $('taxCollected').value = cur.taxCollected; }
    else { cur.taxDriver = 'tax'; cur.taxable = C.taxableFromTax(cur.taxCollected); $('taxable').value = cur.taxable; }
  }

  // ---------------------------------------------------------------- leave-in drawer -> future day
  function updateAssignNote() {
    var t = $('assignDate').value, a = t && store.drawers[t], sd = t && store.days[t];
    var n = 'Sets that day\u2019s starting drawer to this leave-in count. Print the slip and put it in the drawer.';
    if (a && a.fromDate === cur.date) n = 'Already sent to ' + C.dayLabel(t) + ' (' + money(C.computeDaySheet({ leave: a.leave }).leaveTotal) + ').';
    else if (sd && sd.drawerFromDate === cur.date) n = 'Already sent to ' + C.dayLabel(t) + '.';
    $('assignNote').textContent = n;
  }
  function assignDrawer() {
    var t = $('assignDate').value;
    if (!t) { toast('Pick the day this drawer will be used'); return; }
    if (t <= cur.date) { toast('Pick a day after ' + C.dayLabel(cur.date)); return; }
    var lv = C.computeDaySheet({ leave: cur.leave }).leaveTotal;
    if (!lv) { toast('Count the leave-in cash first'); return; }
    var start = C.startFromLeave(cur.leave), from = C.dayLabel(cur.date), tl = C.dayLabel(t);
    var sd = store.days[t], ex = store.drawers[t];
    if (sd) {
      if (startNonZero(sd.start) && !confirm(tl + ' is already saved with a starting drawer of ' + money(C.computeDaySheet(sd).onStart) + '. Replace it with ' + from + '\u2019s leave-in (' + money(lv) + ')?')) return;
      sd.start = start; sd.drawerFrom = from; sd.drawerFromDate = cur.date; sd.prefilledFrom = from;
      sd.computed = C.computeDaySheet(sd);
    } else {
      if (ex && ex.fromDate !== cur.date && !confirm(tl + ' already has a drawer assigned from ' + ex.fromLabel + ' (' + money(C.computeDaySheet({ start: ex.start }).onStart) + '). Replace it?')) return;
    }
    store.drawers[t] = { start: start, leave: clone(cur.leave), fromDate: cur.date, fromLabel: from, assignedAt: new Date().toISOString() };
    if (sd) delete store.drawers[t];
    try { var dr = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (dr && dr.date === t) localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    if (persist()) { updateAssignNote(); renderHistory(); toast('Drawer ' + money(lv) + ' sent to ' + tl); }
  }
  function buildSlip() {
    var t = $('assignDate').value || C.addDays(cur.date, 1);
    var r = C.computeDaySheet({ leave: cur.leave });
    var h = '<div class="slip"><h1>South Fork Deli &mdash; Leave-in Drawer</h1>' +
      '<div>For use on</div><div class="lab">' + C.dayLabel(t) + '</div><div>' + fmtDate(t) + '</div>' +
      '<p>Counted at close of <b>' + C.dayLabel(cur.date) + '</b> (' + fmtDate(cur.date) + ')</p>' +
      '<table><tr><th>Denomination</th><th class="r">Count</th><th class="r">Amount</th></tr>';
    C.LEAVE_DENOMS.forEach(function (x) { h += '<tr><td>' + x.label + '</td><td class="r">' + esc(cur.leave[x.key] || '0') + '</td><td class="r">' + money(r.leaveLines[x.key]) + '</td></tr>'; });
    h += '<tr class="tot"><td colspan="2">Total in drawer</td><td class="r">' + money(r.leaveTotal) + '</td></tr></table>' +
      '<div class="big">TOTAL ' + money(r.leaveTotal) + '</div>' +
      '<p class="sig">Counted by: ____________________ &nbsp; Verified by: ____________________</p>' +
      '<div class="foot">Printed ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET</div></div>';
    $('printSheet').innerHTML = h;
  }
  var printMode = 'day';
  $('assignBtn').addEventListener('click', assignDrawer);
  $('assignDate').addEventListener('change', updateAssignNote);
  $('slipBtn').addEventListener('click', function () {
    if (!C.computeDaySheet({ leave: cur.leave }).leaveTotal) { toast('Count the leave-in cash first'); return; }
    printMode = 'slip'; buildSlip(); window.print();
    setTimeout(function () { printMode = 'day'; }, 1000);
  });

  // ---------------------------------------------------------------- input wiring
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-path')) {
      var p = el.getAttribute('data-path').split('.');
      if (p.length === 2) { cur[p[0]] = cur[p[0]] || {}; cur[p[0]][p[1]] = el.value; }
      else cur[p[0]] = el.value;
      if (p[0] === 'taxable' || p[0] === 'taxCollected') linkTax(p[0]);
      if (p[0] === 'start' && prefilledFrom && prefilledFrom.indexOf('edited') < 0) prefilledFrom += ', edited';
      markDirty(); recalc();
    } else if (el.hasAttribute('data-row')) {
      var kind = el.getAttribute('data-row'), i = +el.getAttribute('data-idx');
      cur[kind][i][el.getAttribute('data-field')] = el.value;
      markDirty(); recalc();
    }
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    if (t.hasAttribute('data-add')) {
      var kind = t.getAttribute('data-add');
      cur[kind].push(kind === 'payouts' ? { vendor: '', amount: '' } : { note: '', amount: '' });
      renderRows(kind); markDirty(); recalc();
      var inputs = $(ROWCFG[kind].el).querySelectorAll('input');
      if (inputs.length) inputs[inputs.length - 2].focus();
    } else if (t.hasAttribute('data-del')) {
      var k = t.getAttribute('data-del');
      cur[k].splice(+t.getAttribute('data-idx'), 1);
      renderRows(k); markDirty(); recalc();
    } else if (t.hasAttribute('data-view')) {
      showView(t.getAttribute('data-view'));
    } else if (t.hasAttribute('data-range')) {
      setRange(t.getAttribute('data-range'));
    } else if (t.hasAttribute('data-open')) {
      if (!confirmLeave()) return;
      openDate(t.getAttribute('data-open'), { ignoreDraft: true });
      showView('day'); window.scrollTo(0, 0);
    }
  });
  // Select contents on focus so typing replaces the value (easier on phones).
  document.addEventListener('focusin', function (e) {
    if (e.target.matches && e.target.matches('input.n')) { try { e.target.select(); } catch (x) {} }
  });

  $('date').addEventListener('change', function () {
    var iso = this.value;
    if (!iso) { this.value = cur.date; return; }
    if (!confirmLeave()) { this.value = cur.date; return; }
    if (dirty) clearDraft();
    openDate(iso);
  });
  $('saveBtn').addEventListener('click', saveDay);
  $('saveBtn2').addEventListener('click', saveDay);
  $('deleteBtn').addEventListener('click', deleteDay);
  $('discardDraft').addEventListener('click', function () { clearDraft(); openDate(cur.date, { ignoreDraft: true }); });
  $('prefillBtn').addEventListener('click', function () {
    var prev = prevSavedDay(cur.date);
    if (!prev) { toast('No earlier saved day to copy from'); return; }
    cur.start = C.startFromLeave(prev.leave); prefilledFrom = prev.label || C.dayLabel(prev.date);
    delete cur.drawerFrom; delete cur.drawerFromDate;
    fillForm(); markDirty(); recalc();
  });
  $('clearStartBtn').addEventListener('click', function () {
    cur.start = {}; prefilledFrom = ''; delete cur.drawerFrom; delete cur.drawerFromDate; fillForm(); markDirty(); recalc();
  });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- views
  function showView(v) {
    ['day', 'history', 'tools'].forEach(function (n) { $('view-' + n).hidden = n !== v; });
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-view') === v)); });
    $('bottombar').hidden = v !== 'day';
    document.body.style.paddingBottom = v === 'day' ? '' : '24px';
    if (v === 'history') renderHistory();
    if (v === 'tools') renderStorageInfo();
  }

  // ---------------------------------------------------------------- history + summary
  function fmtDate(iso) {
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function renderHistory() {
    var dates = sortedDates(true), h = '';
    dates.forEach(function (iso) {
      var day = store.days[iso], r = C.computeDaySheet(day);
      var cls = r.status === 'OVER' ? 'over-t' : r.status === 'SHORT' ? 'short-t' : '';
      h += '<li><button type="button" data-open="' + iso + '">' +
        '<span><span class="lab">' + C.dayLabel(iso) + '</span><br><span class="dt">' + fmtDate(iso) + '</span></span>' +
        '<span><span class="s">' + money(r.sales) + '</span><br><span class="o ' + cls + '">' + r.status + ' ' + money(Math.abs(r.difference)) + '</span></span>' +
        '</button></li>';
    });
    var today = C.todayNY(), dh = '';
    Object.keys(store.drawers).sort().forEach(function (iso) {
      var a = store.drawers[iso];
      dh += '<li><button type="button" data-open="' + iso + '"><span><span class="lab">' + C.dayLabel(iso) + '</span><br><span class="dt">from ' + esc(a.fromLabel) + '</span></span><span class="s">' + money(C.computeDaySheet({ start: a.start }).onStart) + '</span></button></li>';
    });
    $('drawerList').innerHTML = dh || '<li class="hint" style="padding:8px 0">No drawers assigned to upcoming days.</li>';
    $('histList').innerHTML = h || '<li class="hint" style="padding:8px 0">No saved days yet.</li>';
    $('histCount').textContent = dates.length ? dates.length + ' day' + (dates.length === 1 ? '' : 's') : '';
    renderSummary();
  }
  function daysInRange() {
    var f = $('from').value || '0000-00-00', t = $('to').value || '9999-99-99';
    return sortedDates(false).filter(function (d) { return d >= f && d <= t; });
  }
  function renderSummary() {
    var tot = { n: 0, sales: 0, taxable: 0, tax: 0, payouts: 0, overrings: 0, merchant: 0, diff: 0, income: 0, over: 0, short: 0 };
    var cents = function (v) { return Math.round(v * 100); };
    daysInRange().forEach(function (iso) {
      var r = C.computeDaySheet(store.days[iso]);
      tot.n++; tot.sales += cents(r.sales); tot.taxable += cents(r.taxable); tot.tax += cents(r.taxCollected);
      tot.payouts += cents(r.payouts); tot.overrings += cents(r.overrings); tot.merchant += cents(r.merchant);
      tot.diff += cents(r.difference); tot.income += cents(r.income);
      if (r.status === 'OVER') tot.over++; if (r.status === 'SHORT') tot.short++;
    });
    var d = tot.diff / 100, dc = d > 0 ? 'over-t' : d < 0 ? 'short-t' : '';
    var rows = [
      ['Days', tot.n + (tot.n ? ' (' + tot.over + ' over, ' + tot.short + ' short)' : '')],
      ['Sales (Amount collected)', money(tot.sales / 100)],
      ['Taxable sales', money(tot.taxable / 100)],
      ['Sales tax collected', money(tot.tax / 100)],
      ['Payouts', money(tot.payouts / 100)],
      ['Over-rings', money(tot.overrings / 100)],
      ['Merchant services', money(tot.merchant / 100)],
      ['Income', money(tot.income / 100)],
      ['Net over / short', '<span class="' + dc + '">' + (d > 0 ? 'OVER ' : d < 0 ? 'SHORT ' : '') + money(Math.abs(d)) + '</span>']
    ];
    $('summary').innerHTML = rows.map(function (r) { return '<div>' + r[0] + '</div><div>' + r[1] + '</div>'; }).join('');
  }
  function setRange(kind) {
    var today = C.todayNY();
    if (kind === 'all') { $('from').value = ''; $('to').value = ''; }
    else if (kind === 'month') { $('from').value = today.slice(0, 8) + '01'; $('to').value = today; }
    else if (kind === 'week') {
      var p = today.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - 6));
      $('from').value = d.toISOString().slice(0, 10); $('to').value = today;
    }
    renderSummary();
  }
  $('from').addEventListener('change', renderSummary);
  $('to').addEventListener('change', renderSummary);

  // ---------------------------------------------------------------- files: CSV / JSON
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function saveFile(name, mime, content) {
    var blob = new Blob([content], { type: mime });
    try {
      if (isTouch && navigator.canShare && typeof File === 'function') {
        var file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') download(blob, name); });
          return;
        }
      }
    } catch (e) { /* fall through to download */ }
    download(blob, name);
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCSV(dates) {
    var head = ['date', 'label', 'on_start', 'sales_amount_collected', 'taxable_sales', 'sales_tax_collected',
      'payouts_total', 'payout_detail', 'overrings_total', 'overring_detail', 'merchant_services', 'leave_in_cash',
      'books_after_payouts', 'actual_balance', 'difference', 'status', 'income', 'notes'];
    var lines = [head.join(',')];
    var f = function (n) { return n.toFixed(2); };
    dates.forEach(function (iso) {
      var d = store.days[iso], r = C.computeDaySheet(d);
      var pd = (d.payouts || []).map(function (p) { return (p.vendor || '?') + ' ' + f(C.num(p.amount)); }).join('; ');
      var od = (d.overrings || []).map(function (p) { return (p.note ? p.note + ' ' : '') + f(C.num(p.amount)); }).join('; ');
      lines.push([iso, C.dayLabel(iso), f(r.onStart), f(r.sales), f(r.taxable), f(r.taxCollected), f(r.payouts), pd,
        f(r.overrings), od, f(r.merchant), f(r.leaveTotal), f(r.booksAfterPayouts), f(r.actualBalance), f(r.difference),
        r.status, f(r.income), d.notes || ''].map(csvCell).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }
  $('csvAllBtn').addEventListener('click', function () {
    var d = sortedDates(false); if (!d.length) return toast('No saved days');
    saveFile('south-fork-deli-history-' + C.todayNY() + '.csv', 'text/csv', buildCSV(d));
  });
  $('csvRangeBtn').addEventListener('click', function () {
    var d = daysInRange(); if (!d.length) return toast('No saved days in range');
    saveFile('south-fork-deli-' + d[0] + '_to_' + d[d.length - 1] + '.csv', 'text/csv', buildCSV(d));
  });
  $('exportBtn').addEventListener('click', function () {
    var data = { app: 'south-fork-deli-daysheet', version: 1, exportedAt: new Date().toISOString(), days: store.days, drawers: store.drawers };
    saveFile('south-fork-deli-backup-' + C.todayNY() + '.json', 'application/json', JSON.stringify(data, null, 2));
  });
  $('importBtn').addEventListener('click', function () { $('importFile').value = ''; $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var days = data && data.days;
        if (Array.isArray(days)) { var m = {}; days.forEach(function (d) { if (d && d.date) m[d.date] = d; }); days = m; }
        if (!days || typeof days !== 'object') throw new Error('No "days" found in file.');
        var keys = Object.keys(days).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); });
        if (!keys.length) throw new Error('Backup contains no days.');
        var overlap = keys.filter(function (k) { return store.days[k]; }).length;
        if (!confirm('Import ' + keys.length + ' day(s)?' + (overlap ? '\n' + overlap + ' day(s) already on this phone will be replaced by the backup version.' : ''))) return;
        keys.forEach(function (k) { var d = days[k]; d.date = k; d.payouts = d.payouts || []; d.overrings = d.overrings || []; d.start = d.start || {}; d.leave = d.leave || {}; store.days[k] = d; });
        if (data.drawers && typeof data.drawers === 'object') Object.keys(data.drawers).forEach(function (k) { if (!store.days[k]) store.drawers[k] = data.drawers[k]; });
        persist(); renderHistory(); renderStorageInfo();
        if (!dirty) openDate(cur.date, { ignoreDraft: true });
        toast('Imported ' + keys.length + ' day(s)');
      } catch (e) { alert('Import failed: ' + e.message); }
    };
    reader.readAsText(file);
  });
  function renderStorageInfo() {
    var n = Object.keys(store.days).length;
    var bytes = (localStorage.getItem(STORE_KEY) || '').length;
    $('storageInfo').textContent = n + ' saved day(s), ~' + Math.max(1, Math.round(bytes / 1024)) + ' KB on this device.';
  }
  $('appVersion').textContent = 'Version ' + APP_VERSION;

  // ---------------------------------------------------------------- print / share
  function buildPrintSheet() {
    var r = C.computeDaySheet(cur), d = cur;
    var tbl = function (title, denoms, block, lines, totalLabel, total) {
      var h = '<table><tr><th>' + title + '</th><th class="r">Count</th><th class="r">Amount</th></tr>';
      denoms.forEach(function (x) {
        var raw = (block || {})[x.key];
        h += '<tr><td>' + x.label + '</td><td class="r">' + (x.kind === 'amount' ? '' : esc(raw || '')) + '</td><td class="r">' + money(lines[x.key]) + '</td></tr>';
      });
      return h + '<tr class="tot"><td colspan="2">' + totalLabel + '</td><td class="r">' + money(total) + '</td></tr></table>';
    };
    var list = function (title, rows, nameKey, total) {
      var h = '<table><tr><th>' + title + '</th><th class="r">Amount</th></tr>';
      (rows || []).filter(function (x) { return C.num(x.amount) || x[nameKey]; }).forEach(function (x) {
        h += '<tr><td>' + esc(x[nameKey] || '') + '</td><td class="r">' + money(C.num(x.amount)) + '</td></tr>';
      });
      return h + '<tr class="tot"><td>Total</td><td class="r">' + money(total) + '</td></tr></table>';
    };
    var row = function (l, v) { return '<tr><td>' + l + '</td><td class="r">' + v + '</td></tr>'; };
    var h = '<h1>South Fork Deli Day Sheet</h1><div class="lab">' + C.dayLabel(d.date) + '</div>' +
      '<div class="cols"><div>' + tbl('On start', C.START_DENOMS, d.start, r.startLines, 'Total on start', r.onStart) +
      tbl('Leave-in cash', C.LEAVE_DENOMS, d.leave, r.leaveLines, 'Total leave-in', r.leaveTotal) + '</div><div>' +
      '<table><tr><th>Sales</th><th class="r"></th></tr>' + row('Amount collected (Clover)', money(r.sales)) +
      row('Taxable sales', money(r.taxable)) + row('Sales tax collected', money(r.taxCollected)) + '</table>' +
      list('Payouts', d.payouts, 'vendor', r.payouts) + list('Over-rings', d.overrings, 'note', r.overrings) +
      '<table><tr><th>Balance</th><th class="r"></th></tr>' +
      row('On start', money(r.onStart)) + row('+ Sales', money(r.sales)) + row('&minus; Payouts', money(r.payouts)) +
      row('&minus; Over-rings', money(r.overrings)) + '<tr class="tot"><td>Books after payouts</td><td class="r">' + money(r.booksAfterPayouts) + '</td></tr>' +
      row('Leave-in cash', money(r.leaveTotal)) + row('+ Merchant services', money(r.merchant)) +
      '<tr class="tot"><td>Actual balance</td><td class="r">' + money(r.actualBalance) + '</td></tr></table>' +
      '<div class="diffbox">' + r.status + ' ' + money(Math.abs(r.difference)) + '</div>' +
      '<table>' + row('<b>Income</b> (actual &minus; on start)', '<b>' + money(r.income) + '</b>') + '</table>' +
      '</div></div>' + (d.notes ? '<p><b>Notes:</b> ' + esc(d.notes) + '</p>' : '') +
      '<div class="foot">Printed ' + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET' + (dirty ? ' — NOT SAVED' : '') + '</div>';
    $('printSheet').innerHTML = h;
  }
  window.addEventListener('beforeprint', function () { if (printMode === 'slip') buildSlip(); else buildPrintSheet(); });
  window.addEventListener('afterprint', function () { printMode = 'day'; });
  $('printBtn').addEventListener('click', function () { buildPrintSheet(); window.print(); });

  function textSummary() {
    var r = C.computeDaySheet(cur), d = cur, L = [];
    L.push('South Fork Deli Day Sheet — ' + C.dayLabel(d.date));
    L.push('On start: ' + money(r.onStart));
    L.push('Sales (amount collected): ' + money(r.sales));
    L.push('Taxable sales: ' + money(r.taxable) + (r.taxCollected ? ' | Tax: ' + money(r.taxCollected) : ''));
    L.push('Payouts: ' + money(r.payouts));
    (d.payouts || []).forEach(function (p) { if (C.num(p.amount)) L.push('  - ' + (p.vendor || '?') + ': ' + money(C.num(p.amount))); });
    L.push('Over-rings: ' + money(r.overrings));
    L.push('Books after payouts: ' + money(r.booksAfterPayouts));
    L.push('Leave-in cash: ' + money(r.leaveTotal));
    L.push('Merchant services: ' + money(r.merchant));
    L.push('Actual balance: ' + money(r.actualBalance));
    L.push(r.status + ': ' + money(Math.abs(r.difference)));
    L.push('Income: ' + money(r.income));
    if (d.notes) L.push('Notes: ' + d.notes);
    return L.join('\n');
  }
  $('shareBtn').addEventListener('click', function () {
    var text = textSummary();
    if (navigator.share) {
      navigator.share({ title: 'Day Sheet ' + C.dayLabel(cur.date), text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('Day sheet copied to clipboard'); }, function () { prompt('Copy:', text); });
    } else prompt('Copy:', text);
  });

  // ---------------------------------------------------------------- toast
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------------------------------------------------------------- install / SW / persistence
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', function () { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; $('installBtn').hidden = true; } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW failed', e); }); });
  }
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }

  // ---------------------------------------------------------------- boot
  window.__daysheet = { get cur() { return cur; }, get store() { return store; }, compute: function () { return C.computeDaySheet(cur); }, saveDay: saveDay, openDate: openDate, buildSlip: function () { printMode = 'slip'; buildSlip(); }, dayPrintMode: function () { printMode = 'day'; } };
  setRange('month');
  openDate(C.todayNY());
  renderHistory();
})();
