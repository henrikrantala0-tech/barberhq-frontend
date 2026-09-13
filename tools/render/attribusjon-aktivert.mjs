// rebooking.aktivert-flagget i «Drevet av»-panelet + vakt at LOJALITET aldri vises.
// Mot EKTE prod-shapes (13.09), men lojalitet fjernet som arm (14.09):
//  - grand-barber: rebooking AV men M/TALL → «Av»-rad (di-off) selv om armen har kr.
//  - ahmed-fadezz: rebooking PÅ (normal rad m/kr).
//  - utan-deltakere: rebooking aktivert, 0 → «Ingen ennå».
// Alle tre mock-ene BÆRER en lojalitet-node (count/revenue/program) — vakten vokter at panelet
// IGNORERER den fullstendig: ingen «Lojalitet»-arm, ingen .di-setup, ingen «kunder i programmet».
// Vakten BITER hvis lojalitet-raden kommer tilbake. page.on('pageerror') obligatorisk.
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
// total = TRE armer (verving+vinn-tilbake+rebooking), lojalitet EKSKLUDERT (speiler backend 14.09).
const STATES = {
  // rebooking AV m/tall (6/2048) → «Av». lojalitet-node BÆRES men skal ignoreres av panelet.
  'grand-barber': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:6,revenue:2048},
    vervet:{count:0,revenue:0}, lojalitet:{count:1,revenue:0,program:{klipp:9,kunder:4,aktivert:true}},
    vinnTilbake:{count:0,revenue:0}, rebooking:{count:6,revenue:2048,aktivert:false} } },
  // rebooking PÅ (5/1750) → normal. lojalitet AV (aktivert:false) — skal likevel ikke gi «Sett opp»-rad.
  'ahmed-fadezz': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:8,revenue:2850},
    vervet:{count:2,revenue:700}, lojalitet:{count:0,revenue:0,program:{klipp:0,kunder:0,aktivert:false}},
    vinnTilbake:{count:1,revenue:400}, rebooking:{count:5,revenue:1750,aktivert:true} } },
  // rebooking aktivert, 0 → «Ingen ennå». lojalitet aktivert m/tall — skal ikke vises.
  'utan-deltakere': { paaVei, hentetInn:{ period:'siste_maaned', total:{count:0,revenue:0},
    vervet:{count:0,revenue:0}, lojalitet:{count:2,revenue:900,program:{klipp:12,kunder:5,aktivert:true}},
    vinnTilbake:{count:0,revenue:0}, rebooking:{count:0,revenue:0,aktivert:true} } },
};
const stats = { daily:[], months_with_data:[], current_week_revenue:0, best_week_revenue:0, best_week_start:null, weekly_revenue:[] };
// Kun rebooking-arm vaktes nå. aktivert=false → «Av» (di-off) UAVHENGIG av tall; count>0 → «N klipp · X kr»;
// count===0 (aktivert) → «Ingen ennå». Lojalitet: se lojFinnes-vakten (skal ALDRI finnes).
const forvent = {
  'grand-barber':  { value:'Av', off:true },
  'ahmed-fadezz':  { inneholder:'klipp', off:false },
  'utan-deltakere':{ value:'Ingen ennå', off:false },
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
      const finn = (arm) => { for (const r of document.querySelectorAll('#drivenBy .di-row')) {
        const a=r.querySelector('.di-arm'); if (!a || a.textContent.trim()!==arm) continue;
        const v=r.querySelector('.di-value');
        return { value:v?v.textContent.trim():'', off:r.classList.contains('di-off') };
      } return null; };
      const armer = [...document.querySelectorAll('#drivenBy .di-row .di-arm')].map(a=>a.textContent.trim());
      // Lojalitet skal ALDRI finnes: ingen «Lojalitet»-arm, ingen .di-setup i panelet.
      const lojFinnes = armer.includes('Lojalitet') || !!document.querySelector('#drivenBy .di-setup');
      return { rebooking:finn('Rebooking'), armer, lojFinnes };
    });
    const node = await page.$('#drivenBy'); if (node && bredde===375) await node.screenshot({ path:`${OUT}/aktivert-${navn}-375.png` });

    const f = forvent[navn];
    const rb = rad.rebooking || {};
    let ok = errs.length===0 && rad.rebooking && !rad.lojFinnes;
    if (f.value!=null)      ok = ok && rb.value===f.value;
    if (f.inneholder)       ok = ok && (rb.value||'').includes(f.inneholder) && !/Av/.test(rb.value||'');
    if (f.off!=null)        ok = ok && rb.off===f.off;
    rapport.push({ konto:navn, bredde,
      'rebooking': (rb.value||'(mangler)')+(rb.off?' [di-off]':''),
      'armer': rad.armer.join(','),
      'lojalitet': rad.lojFinnes?'FINNES✗':'borte',
      jsfeil: errs.length?errs.join('; ').slice(0,40):'ingen', ok: ok?'✓':'✗' });
    await page.close();
  }
}
console.table(rapport);
const ok = rapport.every(r => r.ok==='✓');
console.log('«Av» vises uavhengig av tall (grand-barber):', rapport.filter(r=>r.konto==='grand-barber').every(r=>/^Av \[di-off\]/.test(r.rebooking)) ? 'ja ✓':'NEI ✗');
console.log('Lojalitet ALDRI i panelet (biter hvis raden kommer tilbake):', rapport.every(r=>r.lojalitet==='borte') ? 'ja ✓':'NEI ✗');
console.log('Armer = kun Verving/Vinn tilbake/Rebooking:', rapport.every(r=>r.armer==='Verving,Vinn tilbake,Rebooking') ? 'ja ✓':'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
