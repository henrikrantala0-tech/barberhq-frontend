// aktivert-flaggene i «Drevet av»-panelet: rebooking.aktivert + lojalitet.program.aktivert.
// Mot to EKTE prod-shapes (13.09):
//  - grand-barber: rebooking AV men M/TALL → «Av»-rad (di-off) selv om armen har kr; lojalitet PÅ.
//  - ahmed-fadezz: rebooking PÅ (normal rad); lojalitet AV (aktivert=false) → «Sett opp» (blå).
// Vokter at aktivert=false gir av/«Sett opp» UAVHENGIG av tall, og at «uten deltakere» (aktivert,
// 0 kunder) skilles fra «Sett opp» (ikke aktivert). page.on('pageerror') obligatorisk.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

const bill = { subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false };
const paaVei = { rebooking:{naar_vindu_30d:88,med_samtykke:7}, winback:{foerste_passerer_60:'2026-09-14',passerer_innen_30d:3}, lojalitet:{aktive_stampkort:4,ett_klipp_unna:1}, verving:{lenke_finnes:true} };
const STATES = {
  // rebooking AV m/tall (6/2048) → «Av». lojalitet PÅ (aktivert, 4 kunder) → tall.
  'grand-barber': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:6,revenue:2048},
    vervet:{count:0,revenue:0}, lojalitet:{count:0,revenue:0,program:{klipp:9,kunder:4,aktivert:true}},
    vinnTilbake:{count:0,revenue:0}, rebooking:{count:6,revenue:2048,aktivert:false} } },
  // rebooking PÅ (5/1750) → normal. lojalitet AV (aktivert:false) → «Sett opp».
  'ahmed-fadezz': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:8,revenue:2850},
    vervet:{count:2,revenue:700}, lojalitet:{count:0,revenue:0,program:{klipp:0,kunder:0,aktivert:false}},
    vinnTilbake:{count:1,revenue:400}, rebooking:{count:5,revenue:1750,aktivert:true} } },
  // Ekstra vakt: lojalitet AKTIVERT men 0 kunder → dempet «0 klipp · 0 kunder», IKKE «Sett opp».
  'utan-deltakere': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:0,revenue:0},
    vervet:{count:0,revenue:0}, lojalitet:{count:0,revenue:0,program:{klipp:0,kunder:0,aktivert:true}},
    vinnTilbake:{count:0,revenue:0}, rebooking:{count:0,revenue:0,aktivert:true} } },
};
const stats = { daily:[], months_with_data:[], current_week_revenue:0, best_week_revenue:0, best_week_start:null, weekly_revenue:[] };
const forvent = {
  'grand-barber':  { rebooking:{value:'Av', off:true},                 lojalitet:{inneholder:'kunder i programmet', setup:false, zero:false} },
  'ahmed-fadezz':  { rebooking:{inneholder:'klipp', off:false},        lojalitet:{value:'Sett opp', setup:true} },
  'utan-deltakere':{ rebooking:{inneholder:'klipp', off:false},        lojalitet:{value:'0 klipp · 0 kunder i programmet', setup:false, zero:true} },
};

const browser = await chromium.launch();
const rapport = [];
for (const [navn, attr] of Object.entries(STATES)) {
  for (const bredde of [320,375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1400 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
      const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
      if (p === '/api/dashboard/billing/status') return J(bill);
      if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Barber', shop:navn, email:'h@g.no', slug:navn });
      if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
      if (p === '/api/dashboard/attribution') return J(attr);
      if (p === '/api/dashboard/stats') return J(stats);
      if (p === '/api/dashboard/settings') { if (m!=='GET') return J({}); return J({ payment_methods:[] }); }
      return J(/images|bookings|recent|winback|referrals|customers|loyalty/.test(p) ? [] : {});
    });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(900);
    const rad = await page.evaluate(() => {
      const finn = (arm) => { for (const r of document.querySelectorAll('#drivenBy .di-row')) { const a=r.querySelector('.di-arm'); if (a && a.textContent.trim()===arm) { const v=r.querySelector('.di-value'); return { value:v?v.textContent.trim():'', off:r.classList.contains('di-off'), zero:r.classList.contains('di-zero'), setup:!!r.querySelector('.di-setup') }; } } return null; };
      return { rebooking:finn('Rebooking'), lojalitet:finn('Lojalitet') };
    });
    const node = await page.$('#drivenBy'); if (node && bredde===375) await node.screenshot({ path:`${OUT}/aktivert-${navn}-375.png` });

    const f = forvent[navn];
    const rb = rad.rebooking || {}, lo = rad.lojalitet || {};
    let ok = errs.length===0 && rad.rebooking && rad.lojalitet;
    if (f.rebooking.value!=null)      ok = ok && rb.value===f.rebooking.value;
    if (f.rebooking.inneholder)       ok = ok && rb.value.includes(f.rebooking.inneholder) && !/Av/.test(rb.value);
    if (f.rebooking.off!=null)        ok = ok && rb.off===f.rebooking.off;
    if (f.lojalitet.value!=null)      ok = ok && lo.value===f.lojalitet.value;
    if (f.lojalitet.inneholder)       ok = ok && lo.value.includes(f.lojalitet.inneholder);
    if (f.lojalitet.setup!=null)      ok = ok && lo.setup===f.lojalitet.setup;
    if (f.lojalitet.zero!=null)       ok = ok && lo.zero===f.lojalitet.zero;
    rapport.push({ konto:navn, bredde,
      'rebooking': (rb.value||'(mangler)')+(rb.off?' [di-off]':''),
      'lojalitet': (lo.value||'(mangler)')+(lo.setup?' [blå]':(lo.zero?' [dempet]':'')),
      jsfeil: errs.length?errs.join('; ').slice(0,40):'ingen', ok: ok?'✓':'✗' });
    await page.close();
  }
}
console.table(rapport);
const ok = rapport.every(r => r.ok==='✓');
console.log('«Av» vises uavhengig av tall (grand-barber):', rapport.filter(r=>r.konto==='grand-barber').every(r=>/^Av \[di-off\]/.test(r.rebooking)) ? 'ja ✓':'NEI ✗');
console.log('«Sett opp» kun ved ikke-aktivert (ahmed):   ', rapport.filter(r=>r.konto==='ahmed-fadezz').every(r=>/Sett opp \[blå\]/.test(r.lojalitet)) ? 'ja ✓':'NEI ✗');
console.log('«uten deltakere» ≠ «Sett opp»:             ', rapport.filter(r=>r.konto==='utan-deltakere').every(r=>/\[dempet\]/.test(r.lojalitet)) ? 'ja ✓':'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
