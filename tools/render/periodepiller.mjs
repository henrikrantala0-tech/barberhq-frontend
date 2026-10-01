// tools/render/periodepiller.mjs — periode-pillene på Oversikt (#segs) og Vekst (#attrPeriod).
// Invariant som voktes: de tre pillene står på ÉN linje, like brede segmenter, uten tekst-klipp
// og uten å dytte dokumentet i horisontal overflow — på alle smale bredder.
//
// Mekanismen er .perbar / .perbar-btn (display:flex; .perbar-btn{flex:1;min-width:0;white-space:nowrap}),
// IKKE den gamle .segs:not(.segs-val) (den klassen bærer nå bare verdi-pillene #rebookPills/#vervRecipient).
//
// ⚠ #segs og #attrPeriod INNEHOLDER en skjult .perseg-meny (måned-/lengre-dropdownen) med egne <button>.
//   Et naivt querySelectorAll('button') sveiper dem med (0-brede, top 0) og gir falsk skjevhet/overflow —
//   derfor måler vi KUN direkte-barn .perbar-btn. (Denne fella ga en falsk «pillene brekker»-rapport.)
//
//   node tools/render/periodepiller.mjs
//
// Skjermbilder → .render-ut/pill-*.png (gitignorert).

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
function router() {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile') return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json({ subscription_status:'active', plan:'vekst', effective_plan:'vekst', page_status:'live' });
    const listeAktig = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg|ledige/.test(p);
    return json(listeAktig ? [] : {});
  };
}

// Måler én pille-bar. KUN direkte-barn .perbar-btn (ekskluderer nested .perseg-meny-knapper).
// rader = antall distinkte topp-posisjoner blant pillene → 1 = på én linje, >1 = brukket.
const MAAL = `(sel) => {
  const bar = document.querySelector(sel);
  if (!bar) return { finnes:false };
  const r = bar.getBoundingClientRect();
  const cs = getComputedStyle(bar);
  const padR = parseFloat(cs.paddingRight)||0;
  const btns = [...bar.children].filter(c => c.classList.contains('perbar-btn')).map(b => {
    const br = b.getBoundingClientRect();
    return {
      tekst: b.textContent.trim(),
      w: Math.round(br.width),
      top: Math.round(br.top),
      klipp: b.scrollWidth > b.clientWidth + 1,   // nowrap-tekst bredere enn knappeboksen
      overflowPx: Math.max(0, b.scrollWidth - b.clientWidth),
      rightEdge: br.right,
    };
  });
  const rader = new Set(btns.map(b => b.top)).size;          // 1 = én linje
  const ws = btns.map(b=>b.w);
  const skjevPx = ws.length ? Math.max(...ws) - Math.min(...ws) : 0;   // 0 = perfekt like segmenter
  const last = btns[btns.length-1];
  const hoyreGap = last ? Math.round((r.right - padR) - last.rightEdge) : null;   // ≥0 = ikke forbi kanten
  return { finnes:true, barW: Math.round(r.width), nBtns: btns.length, rader,
    skjevPx, hoyreGap, klippKnapp: btns.filter(b=>b.klipp).map(b=>b.tekst+'('+b.overflowPx+'px)').join(',')||'—',
    bredder: ws.join('/') };
}`;

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 360, 375, 390]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router());
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1400);
  // Oversikt (#segs) — standardpanel
  const segs = await page.evaluate(eval(MAAL), '#segs');
  await page.evaluate(() => { const b = document.querySelector('#segs'); if (b) b.scrollIntoView({block:'start'}); });
  await page.waitForTimeout(150);
  await page.screenshot({ path:`${OUT}/pill-oversikt-${bredde}.png`, fullPage:false, clip:{ x:0, y:0, width:bredde, height:200 } });
  // Vekst (#attrPeriod)
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(900);
  const attr = await page.evaluate(eval(MAAL), '#attrPeriod');
  await page.evaluate(() => { const b = document.querySelector('#attrPeriod'); if (b) b.scrollIntoView({block:'start'}); });
  await page.waitForTimeout(150);
  await page.screenshot({ path:`${OUT}/pill-vekst-${bredde}.png`, fullPage:false, clip:{ x:0, y:0, width:bredde, height:200 } });
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  for (const [flate, m] of [['Oversikt #segs', segs], ['Vekst #attrPeriod', attr]]) {
    rad.push({ flate, bredde, barW:m.barW, nBtns:m.nBtns, rader:m.rader, bredder:m.bredder, skjevPx:m.skjevPx,
      hoyreGap:m.hoyreGap, klippKnapp:m.klippKnapp, docOverflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  }
  await page.close();
}
console.table(rad);
// OK = på ÉN linje (rader===1), like segmenter (skjev ≤2px), ikke forbi høyrekant (gap ≥0),
// ingen tekst-klipp, ingen dok-overflow, 0 JS-feil. 3 piller forventet per bar.
// (hoyreGap≈1 er måle-artefakt fra border/avrunding — kravet er bare at siste knapp ikke går forbi kanten.)
const ok = rad.every(r => r.rader === 1 && r.nBtns === 3 && r.skjevPx <= 2 && r.hoyreGap >= 0
  && r.klippKnapp === '—' && r.docOverflow <= 0 && r.jsfeil === 'ingen');
console.log('\nPiller OK (én linje, like segmenter, ikke jammet forbi høyrekant, ingen klipp/overflow, 0 JS-feil):', ok ? 'JA' : 'NEI');
process.exitCode = ok ? 0 : 1;
await browser.close(); server.close();
