// tools/render/periodepiller.mjs — periode-pillene på Oversikt (#segs) og Vekst (#attrPeriod).
// Måler tekst-klipp (button.scrollWidth > clientWidth = nowrap-tekst spiller ut av knappeboksen)
// + dokument-overflow, og screenshotter begge barene på 320/375/390. Delt CSS (.segs:not(.segs-val)),
// så én fiks må dekke begge.
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
    const listeAktig = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

// Måler én pille-bar: container-bredde + per-knapp bredde og tekst-klipp (scrollWidth>clientWidth+1).
const MAAL = `(sel) => {
  const bar = document.querySelector(sel);
  if (!bar) return { finnes:false };
  const r = bar.getBoundingClientRect();
  const cs = getComputedStyle(bar);
  const padR = parseFloat(cs.paddingRight)||0, padL = parseFloat(cs.paddingLeft)||0;
  const btns = [...bar.querySelectorAll('button')].map(b => {
    const br = b.getBoundingClientRect();
    return {
      tekst: b.textContent.trim(),
      w: Math.round(br.width),
      klipp: b.scrollWidth > b.clientWidth + 1,   // nowrap-tekst bredere enn knappeboksen
      overflowPx: Math.max(0, b.scrollWidth - b.clientWidth),
      rightEdge: br.right,
    };
  });
  // Skjevhet: differanse mellom bredeste og smaleste knapp (0 = perfekt like segmenter).
  const ws = btns.map(b=>b.w);
  const skjevPx = ws.length ? Math.max(...ws) - Math.min(...ws) : 0;
  // Jammet: gap mellom siste knapps høyrekant og barens innhold-høyrekant (bør ≈ padding, ikke <1).
  const last = btns[btns.length-1];
  const hoyreGap = last ? Math.round((r.right - padR) - last.rightEdge) : null;
  return { finnes:true, barW: Math.round(r.width),
    skjevPx, hoyreGap, klippKnapp: btns.filter(b=>b.klipp).map(b=>b.tekst+'('+b.overflowPx+'px)').join(',')||'—',
    bredder: ws.join('/'), btns };
}`;

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 375, 390]) {
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
    rad.push({ flate, bredde, barW:m.barW, bredder:m.bredder, skjevPx:m.skjevPx, hoyreGap:m.hoyreGap,
      klippKnapp:m.klippKnapp, docOverflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  }
  await page.close();
}
console.table(rad);
// OK = like segmenter (skjev ≤2px), ikke overflower høyre (gap ≥0), ingen tekst-klipp, ingen dok-overflow.
// (hoyreGap≈1 er måle-artefakt fra border/avrunding — kravet er bare at siste knapp ikke går forbi kanten.)
const ok = rad.every(r => r.skjevPx <= 2 && r.hoyreGap >= 0 && r.klippKnapp === '—' && r.docOverflow <= 0 && r.jsfeil === 'ingen');
console.log('\nPiller OK (like segmenter, ikke jammet forbi høyrekant, ingen klipp/overflow, 0 JS-feil):', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
