// Headless browser test. Needs puppeteer-core + Chrome:
//   NODE_PATH=/workspace/deli-daysheet-test/node_modules node tests/e2e.test.js
// Serves the app on http://localhost:8765 (service workers work on localhost).
const puppeteer = require('puppeteer-core');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const results = []; let failed = 0;
const check = (name, ok, info) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' -> ' + info : '')); if (!ok) failed++; };

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });

  check('title', (await page.title()) === 'South Fork Deli Day Sheet');
  const today = await page.$eval('#date', e => e.value);
  check('date defaults to today (NY)', today === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()), today);

  const setDate = async iso => { await page.$eval('#date', (e, v) => { e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, iso); };
  // Scroll target to the middle of the screen first (like a person would), so the fixed bottom bar never covers it.
  const center = sel => page.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  const tap = async sel => { await center(sel); await page.click(sel); };
  const type = async (sel, v) => { await center(sel); await page.click(sel, { clickCount: 3 }); await page.type(sel, String(v)); };
  const txt = sel => page.$eval(sel, e => e.textContent.trim());

  // ---- Day 1: 2026-10-05 sample day, entered through the UI
  await setDate('2026-10-05');
  check('day label', (await txt('#dayLabel')) === '10052026MON', await txt('#dayLabel'));
  const start = { singles: 40, fives: 10, tens: 5, twenties: 3, pennies: 50, nickels: 40, dimes: 50, quarters: 40 };
  for (const [k, v] of Object.entries(start)) await type('#start_' + k, v);
  await type('#sales', '2345.67'); await type('#taxable', '812.40'); await type('#taxCollected', '70.07');
  const payouts = [["Boar's Head", '312.45'], ['Sysco', '88.10'], ['Coke', '46']];
  for (let i = 0; i < payouts.length; i++) {
    await tap('[data-add="payouts"]');
    await type(`[data-row="payouts"][data-idx="${i}"][data-field="vendor"]`, payouts[i][0]);
    await type(`[data-row="payouts"][data-idx="${i}"][data-field="amount"]`, payouts[i][1]);
  }
  const ors = ['12.50', '4.25'];
  for (let i = 0; i < ors.length; i++) { await tap('[data-add="overrings"]'); await type(`[data-row="overrings"][data-idx="${i}"][data-field="amount"]`, ors[i]); }
  await type('#merchant', '1410.22');
  const leave = { hundreds: 2, fifties: 1, twenties: 10, tens: 8, fives: 12, singles: 47, quarters: 36, dimes: 25, nickels: 20, pennies: 63 };
  for (const [k, v] of Object.entries(leave)) await type('#leave_' + k, v);

  const want = { '#startTotal': '$217.50', '#payoutTotal': '$446.55', '#overringTotal': '$16.75', '#leaveTotal': '$650.13',
    '#rBooks': '$2,099.87', '#rActual': '$2,060.35', '#diffLbl': 'SHORT', '#diffVal': '-$39.52', '#rIncome': '$1,842.85', '#bbVal': '-$39.52' };
  for (const [sel, v] of Object.entries(want)) { const got = await txt(sel); check('UI ' + sel + ' = ' + v, got === v, got); }
  const diffColor = await page.$eval('#diffBox', e => getComputedStyle(e).color);
  check('SHORT shown in red', diffColor === 'rgb(179, 38, 30)', diffColor);

  // layout checks at 390x844
  const lay = await page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const small = [...document.querySelectorAll('#view-day input, #view-day button, .bottombar button')]
      .filter(e => e.offsetParent).filter(e => { const r = e.getBoundingClientRect(); return r.height < 44; }).map(e => e.id || e.className);
    const decimals = [...document.querySelectorAll('input.n')].every(e => ['decimal', 'numeric'].includes(e.inputMode));
    return { sw, small, decimals };
  });
  check('no horizontal overflow at 390px', lay.sw <= 390, 'scrollWidth=' + lay.sw);
  check('touch targets >= 44px', lay.small.length === 0, JSON.stringify(lay.small));
  check('numeric keypads on all number inputs', lay.decimals);

  // Screenshots
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(ROOT, 'screenshot-top.png') });
  await page.evaluate(() => document.querySelector('.results').scrollIntoView({ block: 'center' }));
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: path.join(ROOT, 'screenshot.png') });
  await page.screenshot({ path: path.join(ROOT, 'screenshot-full.png'), fullPage: true });

  await page.click('#saveBtn');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sfd.daysheet.v1')).days['2026-10-05']);
  check('day saved to localStorage', !!stored && stored.computed.difference === -39.52, stored && stored.computed.difference);
  check('status pill Saved', (await txt('#statusPill')) === 'Saved');

  // ---- Day 2: prefill from previous leave-in
  await setDate('2026-10-06');
  check('day 2 label', (await txt('#dayLabel')) === '10062026TUE');
  check('start prefilled from prev leave-in', (await txt('#startTotal')) === '$650.13', await txt('#startTotal'));
  check('Other = hundreds+fifties', (await page.$eval('#start_other', e => e.value)) === '250');
  await type('#sales', '1800'); await type('#taxable', '600'); await type('#merchant', '1100');
  await tap('[data-add="payouts"]');
  await type('[data-row="payouts"][data-idx="0"][data-field="vendor"]', 'Bread guy');
  await type('[data-row="payouts"][data-idx="0"][data-field="amount"]', '40');
  for (const [k, v] of Object.entries({ hundreds: 3, twenties: 10, tens: 5, fives: 10, singles: 50, quarters: 40, dimes: 50, nickels: 40, pennies: 50 })) await type('#leave_' + k, v);
  // books = 650.13+1800-40 = 2410.13 ; leave = 300+200+50+50+50+10+5+2+0.5 = 667.50 ; actual = 1767.50 ; diff = -642.63? -> intentionally check math
  const d2 = await page.evaluate(() => window.__daysheet.compute());
  check('day 2 books', d2.booksAfterPayouts === 2410.13, d2.booksAfterPayouts);
  check('day 2 actual', d2.actualBalance === 1767.5, d2.actualBalance);
  check('day 2 difference', d2.difference === -642.63 && d2.status === 'SHORT', d2.difference);
  await type('#merchant', '1755.13'); // make it OVER by $12.50
  check('day 2 OVER after merchant fix', (await txt('#diffLbl')) === 'OVER' && (await txt('#diffVal')) === '+$12.50', await txt('#diffVal'));
  const overColor = await page.$eval('#diffBox', e => getComputedStyle(e).color);
  check('OVER shown in green', overColor === 'rgb(31, 107, 58)', overColor);
  await page.click('#saveBtn');

  // ---- History + summary
  await page.click('nav.tabs [data-view="history"]');
  await page.click('[data-range="all"]');
  const hist = await page.$$eval('#histList .lab', els => els.map(e => e.textContent));
  check('history newest first', JSON.stringify(hist) === '["10062026TUE","10052026MON"]', JSON.stringify(hist));
  const summ = await page.$eval('#summary', e => e.innerText.replace(/\n/g, ' | '));
  check('summary sales total $4,145.67', summ.includes('$4,145.67'), summ);
  check('summary net SHORT $27.02', summ.includes('SHORT $27.02'), summ);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-history.png') });

  // CSV + backup content (generated through the app's own functions via download interception)
  const client = await page.target().createCDPSession();
  const dl = path.join(ROOT, 'tests', '_downloads'); fs.rmSync(dl, { recursive: true, force: true }); fs.mkdirSync(dl, { recursive: true });
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  await page.evaluate(() => { window.matchMedia = () => ({ matches: false }); });
  await page.click('#csvAllBtn'); await new Promise(r => setTimeout(r, 800));
  await page.click('nav.tabs [data-view="tools"]'); await page.click('#exportBtn'); await new Promise(r => setTimeout(r, 800));
  const files = fs.readdirSync(dl);
  const csvF = files.find(f => f.endsWith('.csv')), jsonF = files.find(f => f.endsWith('.json'));
  check('CSV exported', !!csvF, files.join(','));
  if (csvF) { const csv = fs.readFileSync(path.join(dl, csvF), 'utf8'); check('CSV has 2 rows + header and -39.52', csv.trim().split(/\r?\n/).length === 3 && csv.includes('-39.52,SHORT'), csv.split('\n')[1]); }
  check('JSON backup exported', !!jsonF);

  // Import round-trip: clear storage, import backup
  if (jsonF) {
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.click('nav.tabs [data-view="tools"]');
    const input = await page.$('#importFile');
    await input.uploadFile(path.join(dl, jsonF));
    await new Promise(r => setTimeout(r, 500));
    const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sfd.daysheet.v1')).days).length);
    check('JSON import restores 2 days', n === 2, n);
  }

  // Print view renders
  await page.click('nav.tabs [data-view="history"]');
  await page.click('[data-open="2026-10-05"]');
  await page.emulateMediaType('print');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const pr = await page.$eval('#printSheet', e => ({ vis: getComputedStyle(e).display, t: e.innerText }));
  check('print sheet visible in print media with SHORT $39.52', pr.vis === 'block' && pr.t.includes('SHORT $39.52') && pr.t.includes('10052026MON'));
  await page.pdf({ path: path.join(ROOT, 'tests', 'sample-day-sheet.pdf'), format: 'letter', printBackground: true });
  await page.emulateMediaType('screen');

  // Delete with confirm
  await page.click('#deleteBtn');
  const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sfd.daysheet.v1')).days));
  check('delete day (confirmed)', JSON.stringify(left) === '["2026-10-06"]', JSON.stringify(left));

  // Service worker + offline
  const swOk = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  check('service worker active', swOk);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('loads offline', (await page.title()) === 'South Fork Deli Day Sheet');
  await page.setOfflineMode(false);

  const man = await page.evaluate(async () => (await fetch('manifest.json')).json());
  check('manifest has 192 + 512 icons, standalone', man.display === 'standalone' && man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512'));
  check('no JS errors', errors.length === 0, errors.join(' | '));

  await browser.close(); server.close();
  console.log(results.join('\n'));
  console.log(failed ? `\n${failed} FAILED` : `\nALL ${results.length} E2E CHECKS PASSED`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
