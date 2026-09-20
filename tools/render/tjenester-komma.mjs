// tools/render/tjenester-komma.mjs — render-test for pris-parsing i Tjenester-fanen.
//
// Prisfeltet er type="text" inputmode="decimal" (ikke number) så JS ser råstrengen inkl. komma.
// Verifiserer: «45,5» → 46 (komma→punktum, rund til nærmeste hele krone), «45,4» → 45,
// «-50» → 0 (klamp negativ), «300» uendret. Leser parset STATE ved å taste inn, kalle
// renderSvc() (rebygger feltet fra hoved[]/tillegg[]) og lese den nye value-en.
// Skjermbilder @320/375 bekrefter at feltet ser riktig ut uten number-spinnere.
//
//   node tools/render/tjenester-komma.mjs
//
// Skjermbilder → .render-ut/tjenester-komma-<bredde>.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug: 'grand-barber', email: 'g@b.no', hasPassword: true, name: 'Henrik',
  shop: 'Grand Barber', address: '', tagline: '', bio: '', booking_horizon_days: 28 };
const DESIGN  = { palette: 'minimal', font: 'fraunces', layout: 'showcase', mode: 'mork' };
const SERVICES = { hoved: [{ name: 'Herreklipp', price: 350, min: 30 }, { name: 'Skjeggtrim', price: 200, min: 20 }],
  tillegg: [{ name: 'Hårvask', price: 80, min: 0 }] };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday: wd, is_closed: false, open_time: '10:00', close_time: '18:00', breaks: [] }))
  .concat([6,0].map(wd => ({ weekday: wd, is_closed: true, open_time: '10:00', close_time: '18:00', breaks: [] })));
const BILLING = { subscription_status: null, page_status: 'forhandsvist', trial_start_at: null,
  trial_days_left: null, nedtaking_dager_igjen: null, myk_periode: false, needs_attention: false,
  attention_grunn: null, plan: null, effective_plan: null };

const router = route => {
  const p = new URL(route.request().url()).pathname;
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  if (p === '/api/dashboard/profile')        return json(PROFILE);
  if (p === '/api/dashboard/design')         return json(DESIGN);
  if (p === '/api/dashboard/services')       return json(SERVICES);
  if (p === '/api/dashboard/hours')          return json(HOURS);
  if (p === '/api/dashboard/billing/status') return json(BILLING);
  if (p === '/api/dashboard/preview')        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><body></body>' });
  const listeAktig = /images|bookings|recent|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
  return json(listeAktig ? [] : {});
};

// Tast inn i første hoved-prisfelt, kall renderSvc() (rebygger fra state), les den nye value-en.
async function parseInn(page, tekst) {
  const felt = page.locator('#hovedList .svc-row-h').first().locator('.svc-pris');
  await felt.fill(tekst);
  await page.evaluate(() => window.renderSvc());
  return page.locator('#hovedList .svc-row-h').first().locator('.svc-pris').inputValue();
}

const browser = await chromium.launch();

// ── Skjermbilder @320/375: feltet uten number-spinnere, «Sett pris»-styling intakt ──
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 800 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#tjenester`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => { if (typeof window.loadTjenester === 'function') return window.loadTjenester(); });
  await page.waitForTimeout(600);
  const felttype = await page.evaluate(() =>
    (document.querySelector('#hovedList .svc-pris') || {}).getAttribute?.('type') || (document.querySelector('#hovedList .svc-pris') || {}).type || '');
  await page.screenshot({ path: `${OUT}/tjenester-komma-${bredde}.png`, fullPage: false });
  console.log(`@${bredde}: prisfelt type="${felttype}", jsfeil=${errs.length ? errs.join('; ') : 'ingen'}`);
  await page.close();
}

// ── Parse-verifisering @375 ──
const page = await browser.newPage({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.route('**/api/**', router);
await page.goto(`http://localhost:${PORT}/no/dashboard.html#tjenester`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.evaluate(() => { if (typeof window.loadTjenester === 'function') return window.loadTjenester(); });
await page.waitForTimeout(600);

const cases = [
  { inn: '45,5', vent: '46' },   // komma → punktum → rund opp
  { inn: '45,4', vent: '45' },   // komma → rund ned
  { inn: '-50',  vent: '0'  },   // negativ → klamp 0
  { inn: '300',  vent: '300' },  // normal heltall uendret
  { inn: '1 500', vent: '1500' },// tusenskille-mellomrom strippet
];
const rad = [];
for (const c of cases) {
  const ut = await parseInn(page, c.inn);
  rad.push({ inn: c.inn, resultat: ut, ventet: c.vent, ok: ut === c.vent });
}
console.table(rad);
console.log('jsfeil:', errs.length ? errs.join('; ') : 'ingen');
await page.close();
await browser.close(); server.close();

const alleOk = rad.every(r => r.ok) && errs.length === 0;
console.log('\nKomma-parsing OK (45,5→46 · 45,4→45 · -50→0 · 300→300 · «1 500»→1500, 0 JS-feil):', alleOk ? 'JA' : 'NEI');
process.exit(alleOk ? 0 : 1);
