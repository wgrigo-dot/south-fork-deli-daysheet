# South Fork Deli Day Sheet (PWA)

Mobile-first, installable, offline web app for South Fork Deli's nightly cash-out.
No build step and no dependencies — just static files. Host the folder on any HTTPS
static host and "Add to Home Screen" on iPhone (Safari) or Android (Chrome).

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell / UI markup |
| `styles.css` | Mobile-first styles + print (PDF) layout |
| `calc.js` | **All day-sheet formulas** (`computeDaySheet`) + denominations, day label, NY date |
| `app.js` | UI, localStorage, history, summary, CSV/JSON export/import, print, share |
| `sw.js` | Service worker (offline cache). Bump `CACHE` after editing any file |
| `manifest.json` | PWA manifest (name, icons, standalone display) |
| `icons/` | SVG + PNG icons (192, 512, maskable 512, 180 apple-touch) |
| `tests/calc.test.js` | Node unit test of the formulas (`node tests/calc.test.js`) |
| `tests/e2e.test.js` | Headless-Chrome end-to-end test at 390x844 (needs `puppeteer-core`) |

## Formulas (edit in `calc.js` → `computeDaySheet`)
```
On start            = sum of starting drawer (singles, fives, tens, twenties, other $, pennies, nickels, dimes, quarters)
Payouts             = sum of payout rows (vendor + amount)
Over-rings          = sum of over-ring rows
Leave-in cash       = sum of leave-in (hundreds, fifties, twenties, tens, fives, singles, quarters, dimes, nickels, pennies)
Merchant services   = Clover credit + debit total

Books after payouts = On start + Sales - Payouts - Over-rings
Actual balance      = Leave-in cash + Merchant services
Difference          = Actual balance - Books after payouts    (> 0 OVER / green, < 0 SHORT / red, 0 EVEN)
Income              = Actual balance - On start
```
"Sales" = Clover **Amount collected**. Taxable sales and sales tax are recorded and totaled
for reporting only; they do not affect over/short. Math is done in whole cents.

Note: Actual balance counts only the leave-in cash. If cash is pulled from the drawer
(e.g. a bank deposit) and not left in, it will show as SHORT unless you add it to the
formula (e.g. add a "cash removed/deposit" field and include it in Actual balance).

## NY sales tax (8.75%)
`TAX_RATE = 0.0875` in `calc.js` (one constant). Taxable sales and Sales tax are linked:
- Type **taxable sales** → tax = taxable × 0.0875 (rounded to cents), e.g. 812.40 → 71.09.
- Type **sales tax** → taxable = tax ÷ 0.0875 (rounded to cents), e.g. 87.50 → 1000.00.
- The field you edited last drives the other; the filled-in field stays editable (editing it makes it the driver).
- Linking happens only while typing; opening a saved day shows exactly what was saved.

## Leave-in drawer for a later day
In the Leave-in cash card, pick the day the drawer will be used (defaults to the next day)
and tap **Send to that day**. That day's starting drawer is set to this leave-in count
(hundreds + fifties → "Other $") and shows "drawer assigned from <label> leave-in".
If that day is already saved with a starting drawer, or already has a drawer from another
day, you are asked before it's replaced. An assigned drawer takes precedence over the
automatic "previous saved day" prefill. Unsaved assignments are listed in History →
Upcoming drawers (stored under `drawers` in the same localStorage key and in backups).
**Print drawer slip** prints a sheet to put in the drawer: target day/label, source day,
count and amount per denomination, total, and counted/verified lines.

## Behavior
- Date defaults to today in America/New_York; label like `10062026TUE`.
- A new day's starting drawer is prefilled from the most recent earlier saved day's
  leave-in cash (hundreds + fifties go into "Other $"). Editable; "Copy prev. leave-in" / "Clear" buttons.
- Unsaved edits are auto-kept as a draft (restored if the app is closed before saving).
- History (newest first) with sales and over/short; tap to view/edit; delete with confirm.
- Summary for a date range (last 7 days / this month / all / custom): sales, taxable,
  tax, payouts, over-rings, merchant, income, net over/short.
- CSV export (range or all), JSON backup export + import (merge; same dates replaced).
  On phones, exports open the share sheet (save to Files / Drive / email); on desktop they download.
- Print / PDF: one-page letter-size day sheet (use the browser's Print → Save as PDF).
- Share: sends a text summary of the day via the phone share sheet (or copies it).

## Data
Stored only on the device in `localStorage` key `sfd.daysheet.v1`
(`{ version, days: { "YYYY-MM-DD": {...} } }`). Clearing Safari website data or deleting
the home-screen app can erase it — **export a JSON backup regularly**.
On iPhone, the home-screen app and Safari have separate storage.

## Hosting
Any HTTPS static host works (GitHub Pages, Netlify, Cloudflare Pages, Vercel, S3...).
Upload the folder contents as-is. Service workers require HTTPS (or localhost).
Local test: `python3 -m http.server 8000` then open http://localhost:8000.
