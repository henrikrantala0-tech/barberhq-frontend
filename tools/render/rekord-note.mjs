// tools/render/rekord-note.mjs — «Rekord settes denne uka»-noten (Oversikt, applyRekord).
// Rotårsak-verifisering: noten skal IKKE stå ved 0 kr uten record (tom påstand).
//   A: fersk + 0 kr, ingen record        → note TOM
//   B: ingen record, current_week > 0     → «Rekord settes denne uka» (invitasjon står)
//   C: har record, current < best         → «Beste uke: … » (regresjonssjekk)
//
//   node tools/render/rekord-note.mjs
//
// Skjermbilder → .render-ut/rekord-*.png (gitignorert).

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

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Trial-billing (ingen skjold) — rekord-noten er uavhengig av plan, men vi vil ikke ha skjold i veien.
const BILLING = { subscription_status:'trialing', page_status:'live', plan:null,
  effective_plan:'vekst', effective_plan_grunn:'trial_vindu', trial_days_left:30 };

function dag(d, kr){ return { d, kr, count: kr?1:0, new:0, returning:0 }; }
const STATS = {
  A: { daily:[], months_with_data:[], current_week_revenue:0, best_week_revenue:0, best_week_start:null, weekly_revenue:[] },
  B: { daily:[dag('2026-09-04',800)], months_with_data:[], current_week_revenue:800, best_week_revenue:0, best_week_start:null, weekly_revenue:[] },
  C: { daily:[dag('2026-09-04',5000)], months_with_data:[], current_week_revenue:5000, best_week_revenue:13950,
       best_week_start:'2026-07-14', best_week_approximate:false, weekly_revenue:[{week_start:'2026-07-14',revenue:13950},{week_start:'2026-07-21',revenue:9000}] },
};
function router(kase){
  return route => {
    const p = new URL(route.request().url()).pathname;
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')        return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json(BILLING);
    if (p === '/api/dashboard/stats')          return json(STATS[kase]);
    const listeAktig = /images|bookings|recent|services|hours|attribution|winback|referrals|rebooking|sms-logg|momentum/.test(p);
    return json(listeAktig ? [] : {});
  };
}

const browser = await chromium.launch();
const rad = [];
for (const [kase, forventet] of [['A',''], ['B','Rekord settes denne uka'], ['C','Beste uke']]) {
  for (const bredde of [320, 375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(kase));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1600);
    const m = await page.evaluate(() => {
      const n = document.querySelector('#rekordNote');
      const vis = n && getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().height > 0;
      return { note: n ? n.textContent.trim() : '(mangler)', synlig: !!vis,
        overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    await page.evaluate(()=>{const e=document.querySelector('#stats');if(e)e.scrollIntoView({block:'start'});});
    await page.waitForTimeout(120); await page.screenshot({ path:`${OUT}/rekord-${kase}-${bredde}.png`, fullPage:false, clip:{x:0,y:0,width:bredde,height:340} });
    const ok = kase==='A' ? (m.note==='') : (m.note.startsWith(forventet));
    rad.push({ kase, bredde, note:JSON.stringify(m.note), forventet:kase==='A'?'(tom)':forventet, ok,
      overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);
const allOk = rad.every(r => r.ok && r.overflow<=0 && r.jsfeil==='ingen');
console.log('\nRekord-note OK (A tom, B invitasjon, C beste uke, ingen overflow, 0 JS-feil):', allOk ? 'JA' : 'NEI');
await browser.close(); server.close();
