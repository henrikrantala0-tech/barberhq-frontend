// tools/render/pris0-markor.mjs — pris-0-markør i Tjenester & tider (#tjenester).
// Navngitt tjeneste uten pris → rød pris-kant (.pris-0) + «Sett pris»-linje (.svc-flag).
// Blank/navnløs rad flagges IKKE. Live: skriv pris → flagg forsvinner; tøm navn → flagg forsvinner.
//
//   node tools/render/pris0-markor.mjs
//
// Skjermbilder → .render-ut/pris0-*.png (gitignorert).

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

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Herreklipp har pris (skal IKKE flagges), Skjeggtrim er navngitt uten pris (SKAL flagges).
// Tillegg-raden er blank (navnløs) → skal IKKE flagges.
const SERVICES = { hoved:[ { name:'Herreklipp', price:350, min:30 }, { name:'Skjeggtrim', price:0, min:20 } ],
  tillegg:[ { name:'', price:0, min:0 } ] };
function router() {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')  return json(PROFILE);
    if (p === '/api/dashboard/services') return json(SERVICES);
    const listeAktig = /images|bookings|recent|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

const MAAL = `() => {
  const rows = [...document.querySelectorAll('#hovedList .svc-row-h')];
  const r = rows.map(row => {
    const navn = row.querySelector('.svc-navn');
    const pris = row.querySelector('.svc-pris');
    const flag = row.querySelector('.svc-flag');
    const flagVis = flag && getComputedStyle(flag).display !== 'none';
    return { navn: navn.value, pris: pris.value, prisRød: pris.classList.contains('pris-0'), flagg: !!flagVis };
  });
  const tRow = document.querySelector('#tilleggList .svc-row-t');
  const tFlag = tRow && tRow.querySelector('.svc-flag');
  return { rows: r, tilleggFlagg: !!(tFlag && getComputedStyle(tFlag).display !== 'none'),
    overflow: document.documentElement.scrollWidth - window.innerWidth };
}`;

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router());
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('tjenester'));
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const b = document.querySelector('#hovedList'); if (b) b.scrollIntoView({block:'start'}); });
  await page.waitForTimeout(150);
  await page.screenshot({ path:`${OUT}/pris0-${bredde}.png`, fullPage:false, clip:{ x:0, y:0, width:bredde, height:340 } });
  const m0 = await page.evaluate(eval(MAAL));

  // Live 1: skriv pris 250 i Skjeggtrim (rad 2) → flagg + rød skal forsvinne.
  await page.fill('#hovedList .svc-row-h:nth-of-type(2) .svc-pris', '250');
  await page.waitForTimeout(150);
  const m1 = await page.evaluate(eval(MAAL));

  // Live 2: tøm navnet på Skjeggtrim etter å ha nullstilt prisen igjen → navnløs, skal IKKE flagges.
  await page.fill('#hovedList .svc-row-h:nth-of-type(2) .svc-pris', '0');
  await page.fill('#hovedList .svc-row-h:nth-of-type(2) .svc-navn', '');
  await page.waitForTimeout(150);
  const m2 = await page.evaluate(eval(MAAL));

  rad.push({ bredde,
    start_r1: m0.rows[0].flagg, start_r2: m0.rows[1].flagg, start_r2rød: m0.rows[1].prisRød,
    tilleggFlagg: m0.tilleggFlagg,
    etterPris_r2: m1.rows[1].flagg, etterTømtNavn_r2: m2.rows[1].flagg,
    overflow: m0.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  await page.close();
}
console.table(rad);
// Forventet: r1 (har pris) aldri flagg; r2 (navngitt, pris 0) flagg+rød ved start; blank tillegg ingen flagg;
// etter pris → flagg vekk; etter tømt navn → flagg vekk. Ingen overflow / JS-feil.
const ok = rad.every(r => !r.start_r1 && r.start_r2 && r.start_r2rød && !r.tilleggFlagg
  && !r.etterPris_r2 && !r.etterTømtNavn_r2 && r.overflow <= 0 && r.jsfeil === 'ingen');
console.log('\nPris-0-markør OK (navngitt u/pris flagges, blank/priset flagges ikke, live-toggle, ingen overflow):', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
