// tools/render/diagram-etiketter.mjs — x-akse-etiketter i Oversikt-diagrammet (renderBarChart).
// KOLLISJONSMÅLING: overflow-testen fanger ikke overlappende søsken-etiketter (de holder seg
// innenfor diagrambredden). Her måles nabo-etikettenes rects mot hverandre for faktisk overlapp.
// Fokus: «Siste 2 uker» (14 dager) på mobil, men dekker alle periodene.
//
//   node tools/render/diagram-etiketter.mjs
//
// Skjermbilder → .render-ut/etikett-<periode>-<bredde>.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik',
  shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// 14 dager daglig data ankret mot Oslo-i DAG (samme anker som sliceDaily) så 2uker-vinduet
// faktisk treffer dataene → ekte stolper. ⚠ sliceDaily leser d.day + d.revenue (IKKE d/kr).
const osloToday = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Oslo' }).format(new Date());
const anchor = new Date(osloToday + 'T00:00:00Z');
const daily = [];
for (let i = 13; i >= 0; i--) {
  const d = new Date(anchor.getTime() - i*86400000);
  daily.push({ day: d.toISOString().slice(0,10), revenue: 300 + ((i*137)%900), count:1, new:0, returning:1 });
}
const STATS = { daily, months_with_data:['2026-04','2026-05','2026-06','2026-07','2026-08'],
  months:[{ym:'2026-04',customers:14},{ym:'2026-05',customers:22},{ym:'2026-06',customers:19},{ym:'2026-07',customers:31},{ym:'2026-08',customers:18}],
  record_customers_month:{ym:'2026-07',customers:31}, completed_all_time:214,
  current_week_revenue:2550, best_week_revenue:0, best_week_start:null, weekly_revenue:[] };
function billing(shape){
  if (shape==='basis') return { subscription_status:'active', page_status:'live', plan:'basis', effective_plan:'basis', effective_plan_grunn:'subscription' };
  return { subscription_status:'trialing', page_status:'live', plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu', trial_days_left:30 };
}
function router(shape){ return route => {
  const p = new URL(route.request().url()).pathname;
  const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p==='/api/dashboard/profile')        return json(PROFILE);
  if (p==='/api/dashboard/billing/status') return json(billing(shape));
  if (p==='/api/dashboard/stats')          return json(STATS);
  const l=/images|bookings|recent|services|hours|attribution|winback|referrals|rebooking|sms-logg|momentum/.test(p);
  return json(l?[]:{}); }; }

// Kollisjon: for hvert nabo-par (sortert på left), overlapper de horisontalt hvis
// venstres høyrekant > høyres venstrekant (+1px slingring). Måler .cbar-lbl-boksene.
const KOLLISJON = `(sel) => {
  const lbls = [...document.querySelectorAll(sel)]
    .filter(el => getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0)
    .map(el => el.getBoundingClientRect()).sort((a,b)=>a.left-b.left);
  let kollisjoner = 0, verste = 0;
  for (let i=0;i<lbls.length-1;i++){ const ov = lbls[i].right - lbls[i+1].left; if (ov > 1){ kollisjoner++; verste = Math.max(verste, Math.round(ov)); } }
  return { synligeEtiketter: lbls.length, kollisjoner, versteOverlappPx: verste };
}`;

const PERIODER = [ ['uke','Siste uke'], ['2uker','Siste 2 uker'] ];
const browser = await chromium.launch();
const rad = [];
for (const shape of ['trial','basis']) {
  for (const bredde of [320, 375, 390]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror', e=>errs.push(e.message));
    await page.route('**/api/**', router(shape));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1600);
    for (const [pid,label] of PERIODER) {
      await page.evaluate((p)=>{ const b=document.querySelector('#segs button[data-p="'+p+'"]'); if(b)b.click(); }, pid);
      await page.waitForTimeout(900);
      const m = await page.evaluate(eval(KOLLISJON), '#chartBars .cbar-lbl');
      // Bekreft at stolpene FAKTISK har data (ikke flate/0) — ellers er «7 etiketter» meningsløst.
      const dat = await page.evaluate(() => {
        const bars = [...document.querySelectorAll('#chartBars .cbar-bar')];
        const maxH = bars.reduce((a,b)=>Math.max(a, b.getBoundingClientRect().height), 0);
        return { tittel:(document.querySelector('#chartTitle')||{}).textContent||'', sub:(document.querySelector('#chartSub')||{}).textContent||'',
          stolper:bars.length, maxStolpePx:Math.round(maxH) };
      });
      m.tittel = dat.tittel; m.stolper = dat.stolper; m.maxStolpePx = dat.maxStolpePx;
      // 2uker (fiksen) fanges i BEGGE shapes; uke kun trial. Screenshot av SELVE diagrammet
      // (.chart-wrap) så x-akse-etikettene er med — ikke toppen av sida (KPI-kortene).
      if (pid==='2uker' || shape==='trial') {
        const cw = page.locator('.chart-wrap').first();
        await cw.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
        await cw.screenshot({ path:`${OUT}/etikett-${pid}-${shape}-${bredde}.png` });
      }
      rad.push({ shape, bredde, flate:'Oversikt · '+label, ...m, jsfeil: errs.length ? errs.join(';').slice(0,40) : 'ingen' });
    }
    // Vekst-fanens «Kunder per måned»-diagram (#trend .mlbl) — samme label-familie, færre punkter.
    await page.evaluate(()=>switchPanel('vekst'));
    await page.waitForTimeout(1100);
    const mt = await page.evaluate(eval(KOLLISJON), '#trend .mlbl');
    if (shape==='trial') { const tr = page.locator('#trend').first();
      await tr.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
      await tr.screenshot({ path:`${OUT}/etikett-vekst-trend-${bredde}.png` }); }
    rad.push({ shape, bredde, flate:'Vekst · Kunder/mnd', ...mt, jsfeil: errs.length ? errs.join(';').slice(0,40) : 'ingen' });
    await page.close();
  }
}
console.table(rad);
const kolliderer = rad.filter(r => r.kollisjoner > 0);
console.log('\n=== ETIKETT-KOLLISJON ===');
if (kolliderer.length) { console.log('OVERLAPP funnet:'); console.table(kolliderer); }
else console.log('Ingen overlapp målt.');
await browser.close(); server.close();
