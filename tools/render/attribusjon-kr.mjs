// tools/render/attribusjon-kr.mjs — attribusjon med kroner på de to flatene:
//   Oversikt «Drevet av BarberHQ» (renderDrivenBy) + Vekst «Hvor kundene kommer fra» (renderAttribusjon)
//
// Serverer site/ lokalt, stubber /api/**. Mock-attribusjonen returnerer den NYE backend-formen
// { <kat>:{count,revenue}, total:{count,revenue} } (efaa553). Måler at kroner rendres, at total
// stemmer, og overflow/JS-feil på 320/375.
//
//   node tools/render/attribusjon-kr.mjs
//
// Skjermbilder → .render-ut/attr-*.png (gitignorert).

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

// Ny backend-form: kategorier som {count,revenue} + autoritativ total. sum(kat)==total per «sum er sann».
const ATTR = {
  uke:    { period:'uke',    rebooking:{count:4,revenue:1400}, vervet:{count:1,revenue:350}, recovery:{count:2,revenue:800},  total:{count:7,  revenue:2550} },
  '2uker':{ period:'2uker',  rebooking:{count:7,revenue:2450}, vervet:{count:2,revenue:700}, recovery:{count:3,revenue:1200}, total:{count:12, revenue:4350} },
  maaned: { period:'maaned', rebooking:{count:14,revenue:4900},vervet:{count:5,revenue:1750},recovery:{count:6,revenue:2400}, total:{count:25, revenue:9050} },
};

// utenTotal=true → strip .total fra svaret (simulerer gammel/ufullstendig backend).
// Da SKAL flatene vise feilstate, ALDRI et klient-summert tall.
function router(utenTotal) {
  return route => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile') return json(PROFILE);
    if (p === '/api/dashboard/attribution') {
      const per = url.searchParams.get('period') || 'maaned';
      const base = ATTR[per] || ATTR.maaned;
      if (utenTotal) { const { total, ...rest } = base; return json(rest); }
      return json(base);
    }
    const listeAktig = /images|bookings|recent|services|hours|stats|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

const visSrc = `el => { if (!el) return false; const r = el.getBoundingClientRect();
  return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; }`;

const browser = await chromium.launch();
const rad = [];

for (const bredde of [320, 375]) {
  // ── Oversikt: «Drevet av BarberHQ» ────────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(false));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1800);
    await page.evaluate(() => { const w = document.querySelector('#drivenByWrap'); if (w) w.scrollIntoView({block:'center'}); });
    await page.waitForTimeout(200);
    await page.screenshot({ path:`${OUT}/attr-drevet-${bredde}.png`, fullPage:false });
    const m = await page.evaluate(([visSrc]) => { const vis = eval(visSrc);
      const t = s => (document.querySelector(s)||{}).textContent || '';
      return { wrapSynlig:vis(document.querySelector('#drivenBy')),
        heroNum:t('.drv-hero-num'),
        rader:[...document.querySelectorAll('#drivenBy .drv-row2')].map(r =>
          (r.querySelector('.drv-nm')||{}).textContent + ':' + (r.querySelector('.drv-val')||{}).textContent),
        overflow: document.documentElement.scrollWidth - window.innerWidth }; }, [visSrc]);
    rad.push({ flate:'Drevet av (uke)', bredde, hero:m.heroNum,
      rader:m.rader.join(' | '), overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
  // ── Vekst: «Hvor kundene kommer fra» ──────────────────────────────────────────────
  {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(false));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1800);
    await page.evaluate(() => { const w = document.querySelector('#attrRows'); if (w) w.scrollIntoView({block:'center'}); });
    await page.waitForTimeout(200);
    await page.screenshot({ path:`${OUT}/attr-vekst-${bredde}.png`, fullPage:false });
    const m = await page.evaluate(([visSrc]) => { const vis = eval(visSrc);
      const t = s => (document.querySelector(s)||{}).textContent || '';
      return { synlig:vis(document.querySelector('#attrRows')),
        rader:[...document.querySelectorAll('#attrRows .drv-row2')].map(r =>
          (r.querySelector('.drv-nm')||{}).textContent + ':' + (r.querySelector('.drv-val')||{}).textContent),
        total:t('#attrRows .attr-total .drv-val'),
        overflow: document.documentElement.scrollWidth - window.innerWidth }; }, [visSrc]);
    rad.push({ flate:'Vekst attr (maaned)', bredde, hero:m.total,
      rader:m.rader.join(' | '), overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);

// ── Feilstate: svar UTEN total → begge flater viser «Kunne ikke hente», ALDRI klient-sum ──────
const feil = [];
for (const bredde of [320, 375]) {
  // Drevet av
  {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(true));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1800);
    await page.evaluate(() => { const w = document.querySelector('#drivenByWrap'); if (w) w.scrollIntoView({block:'center'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path:`${OUT}/attr-drevet-feil-${bredde}.png`, fullPage:false });
    const m = await page.evaluate(() => {
      const wrap = document.querySelector('#drivenBy');
      const txt = wrap ? wrap.textContent : '';
      return { txt, harHero: !!document.querySelector('.drv-hero-num'),
        seeAllSkjult: (document.querySelector('#drivenBySeeAll')||{}).hidden }; });
    feil.push({ flate:'Drevet av (uten total)', bredde, tekst:m.txt.trim().slice(0,40),
      heroBorte:!m.harHero, feilmld:/Kunne ikke hente/.test(m.txt), jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
  // Vekst
  {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(true));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1800);
    await page.evaluate(() => { const w = document.querySelector('#attrRows'); if (w) w.scrollIntoView({block:'center'}); });
    await page.waitForTimeout(150);
    await page.screenshot({ path:`${OUT}/attr-vekst-feil-${bredde}.png`, fullPage:false });
    const m = await page.evaluate(() => {
      const el = document.querySelector('#attrRows');
      const txt = el ? el.textContent : '';
      return { txt, harTotalRad: !!document.querySelector('#attrRows .attr-total') }; });
    feil.push({ flate:'Vekst attr (uten total)', bredde, tekst:m.txt.trim().slice(0,40),
      heroBorte:!m.harTotalRad, feilmld:/Kunne ikke hente/.test(m.txt), jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.log('\n=== FEILSTATE (svar uten data.total) ===');
console.table(feil);
const okFeil = feil.every(f => f.feilmld && f.heroBorte && f.jsfeil === 'ingen');
console.log('Feilstate OK (feilmelding vist, ingen total/hero, ingen klient-sum, 0 JS-feil):', okFeil ? 'JA' : 'NEI');

await browser.close(); server.close();
