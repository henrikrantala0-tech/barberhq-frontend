// Tjenester & tider → bookingregler under arbeidstidene: «Samle bookinger» + «Kunder kan booke inntil».
//
// Stateful mock av GET/PUT /api/dashboard/booking-settings (backend: dashboard.js). Sjekker:
//  1. GET-verdiene vises (bryter av, 4 uker) og kontrollene åpnes først etter GET.
//  2. Bryter på → PUT {cluster_bookings:true}; select 2 måneder → PUT {booking_horizon_days:60}.
//  3. Ny lasting av sida leser de lagrede verdiene inn igjen.
//  4. PUT-feil ruller tilbake + viser backendens feiltekst. GET-feil → kontroller av + «Prøv igjen».
//  5. Ingen request til api.trybarberhq.com.
// Skjermbilder av åpningstid-delen @320/375, bryter av og på → .render-ut/booking-regler-*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const UT = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(UT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const bill = { subscription_status:'active', effective_plan:'vekst', effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday:wd, is_closed:false, open_time:'09:00', close_time:'17:00', breaks:[] }))
  .concat([{ weekday:6, is_closed:false, open_time:'10:00', close_time:'15:00', breaks:[] },
           { weekday:0, is_closed:true, open_time:'09:00', close_time:'17:00', breaks:[] }]);

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FEIL ') + msg); if (!c) fails++; };

const browser = await chromium.launch();

async function aapne(width, state, opt = {}) {
  const ctx = await browser.newContext({ viewport:{ width, height:900 }, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // Dashbordet kaller API-et med absolutt base (api.trybarberhq.com) også fra localhost. Catch-all-
  // mocken skal besvare HVER slik request — ingen får nå nettet. lekk = prod-requests mocken ikke så.
  const prod = [], mocket = new Set();
  page.on('request', q => { if (q.url().includes('api.trybarberhq.com')) prod.push(q); });
  const puts = [];
  await page.route('**/api/**', route => {
    mocket.add(route.request());
    const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
    const J = (o, s = 200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/booking-settings') {
      if (m === 'GET') return opt.getFeil ? J({ error:'x' }, 500) : J(state);
      const body = JSON.parse(route.request().postData() || '{}'); puts.push(body);
      if (opt.putFeil) return J({ error:'booking_horizon_days må være en av 7, 14, 21, 28, 60.' }, 400);
      Object.assign(state, body);
      return J({ ok:true, ...state });
    }
    if (p === '/api/dashboard/hours') return J(HOURS);
    if (p === '/api/dashboard/billing/status') return J(bill);
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
    if (p === '/api/dashboard/services') return J({ hoved:[], tillegg:[] });
    if (p === '/api/dashboard/settings') return J({ payment_methods:[] });
    if (p === '/api/dashboard/google/status') return J({ connected:false, scope_ok:true, missing_scopes:[] });
    return J(/images|bookings|recent|winback|referrals|customers|attribution/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.$eval('button[data-panel="tjenester"]', b => b.click());
  await page.waitForTimeout(700);
  const lekk = () => prod.filter(q => !mocket.has(q)).map(q => q.method() + ' ' + q.url());
  return { ctx, page, errs, lekk, puts };
}
const les = page => page.evaluate(() => ({
  samle: document.querySelector('#bkSamle').checked,
  horisont: document.querySelector('#bkHorisont').value,
  av: document.querySelector('#bkSamle').disabled || document.querySelector('#bkHorisont').disabled,
  err: (() => { const e = document.querySelector('#bkErr'); return e.hidden ? '' : e.textContent.trim(); })(),
}));
async function skjerm(page, navn) {
  // Fra «Arbeidstider»-overskriften til slutten av bookingreglene.
  const box = await page.evaluate(() => {
    const h = [...document.querySelectorAll('#tjenester .tt-h1')].find(e => e.textContent.trim() === 'Arbeidstider');
    const a = h.getBoundingClientRect(), b = document.querySelector('#bkRegler').getBoundingClientRect();
    return { y: a.top + scrollY - 16, h: b.bottom - a.top + 32 };
  });
  const vw = page.viewportSize().width;
  await page.setViewportSize({ width: vw, height: Math.max(900, Math.ceil(box.y + box.h) + 40) });
  await page.waitForTimeout(150);
  const fil = path.join(UT, `booking-regler-${navn}.png`);
  await page.screenshot({ path: fil, clip: { x:0, y:box.y, width:vw, height:box.h } });
  console.log('  → ' + fil);
}

for (const w of [320, 375]) {
  console.log(`\n@${w}`);
  const state = { cluster_bookings:false, booking_horizon_days:28 };
  let { ctx, page, errs, lekk, puts } = await aapne(w, state);
  let v = await les(page);
  ok(!v.samle && v.horisont === '28' && !v.av, `GET leses inn: av + 4 uker, kontroller åpne (${JSON.stringify(v)})`);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ov === 0, `ingen horisontal overflow (${ov})`);
  await skjerm(page, `${w}-av`);

  await page.click('#bkSamle + .sl'); await page.waitForTimeout(300);
  ok(JSON.stringify(puts.at(-1)) === '{"cluster_bookings":true}', `bryter på → PUT ${JSON.stringify(puts.at(-1))}`);
  await page.selectOption('#bkHorisont', '60'); await page.waitForTimeout(300);
  ok(JSON.stringify(puts.at(-1)) === '{"booking_horizon_days":60}', `2 måneder → PUT ${JSON.stringify(puts.at(-1))}`);
  await page.waitForTimeout(1900);   // «Lagret ✓» falmer før bildet
  await skjerm(page, `${w}-paa`);
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  ok(lekk().length === 0, `alle API-kall besvart av mocken, ingen til prod (${lekk().join(' , ')})`);
  await ctx.close();

  // Ny lasting leser lagrede verdier.
  ({ ctx, page, errs } = await aapne(w, state));
  v = await les(page);
  ok(v.samle && v.horisont === '60', `ny lasting: på + 2 måneder (${JSON.stringify(v)})`);
  await ctx.close();
}

// PUT-feil → rull tilbake + feiltekst.
{
  console.log('\nfeil');
  const state = { cluster_bookings:false, booking_horizon_days:14 };
  let { ctx, page } = await aapne(375, state, { putFeil:true });
  await page.selectOption('#bkHorisont', '60'); await page.waitForTimeout(300);
  let v = await les(page);
  ok(v.horisont === '14' && v.err.includes('booking_horizon_days'), `PUT 400 → tilbake til 2 uker + feil (${JSON.stringify(v)})`);
  await page.click('#bkSamle + .sl'); await page.waitForTimeout(300);
  v = await les(page);
  ok(!v.samle, `PUT 400 → bryter tilbake til av`);
  await ctx.close();
  ({ ctx, page } = await aapne(375, state, { getFeil:true }));
  v = await les(page);
  ok(v.av && v.horisont === '' && v.err.includes('Klarte ikke'), `GET 500 → kontroller av + feiltekst (${JSON.stringify(v)})`);
  await ctx.close();
}

await browser.close(); server.close();
console.log(fails ? `\n${fails} FEIL` : '\nalt ok');
process.exit(fails ? 1 : 0);
