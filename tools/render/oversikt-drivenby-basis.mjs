// Oversikt → «Hvor kundene kommer fra»: billingUkjent()-vakt i renderDrivenBy.
//
// Bug som ble fikset: renderDrivenBy manglet en billingUkjent()-vakt. Den kjøres ved oppstart
// (loadOversikt) FØR loadBilling svarer, så i race-vinduet var _billing===null → panelet kunne
// hente /attribution før planen var kjent. Fiks (e5aa245): billingUkjent() FØRST → ingen henting/
// render før planen er kjent; oppdaterSkjoldFlater re-kjører renderDrivenBy når billing lander.
//
// ⚠ 14.09-omlegging (backend plan-shaper + VEKST_EKSEMPEL fjernet): panelet henter nå /attribution
// for BEGGE planer (ingen erBasis()-gren i renderDrivenBy — kun billingUkjent()-vakten). Basis/vekst
// skilles av RESPONS-SHAPEN, ikke av et klient-gate: backend sender `hentetInn` KUN for vekst.
//   - Basis-svar = { paaVei } (INGEN hentetInn) → panelet viser maskerte, låste armer (.di-basis-laast:
//     «* klipp · **** kr») + selg-linje + CTA. INGEN ekte total, INGEN «Eksempel»-merke (fjernet 14.09).
//   - Vekst-svar = { paaVei, hentetInn:{ total, ... } } → ekte total (.di-total-kr) + tre armer.
//
// Test med KUNSTIG TREGT /billing/status (700 ms) = race-vinduet:
//   Måler /attribution-kall FØR billing lander (400 ms) → MÅ være 0 for begge planer (vakten holder).
//   Basis: kall > 0 ETTER billing, men svaret er maskert (.di-basis-laast), ingen ekte total/merke.
//   Vekst: kall > 0 etter billing (uke + 2uker for delta), ekte total (2 398 kr) vises, ingen maskering.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const bill = (plan) => ({
  subscription_status:'active', plan, effective_plan:plan, effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false });
// Attribusjons-svaret PLAN-SHAPES av backend (14.09): hentetInn sendes KUN for vekst. total inne i
// hentetInn = ENESTE totalkilde (46701a3). paaVei sendes for begge (På vei-blokka + Basis-CTA-noten).
const paaVei = { rebooking:{naar_vindu_30d:12,med_samtykke:3}, winback:{foerste_passerer_60:null,passerer_innen_30d:0} };
const attrVekst = { paaVei, hentetInn:{ period:'siste_maaned', total:{count:7,revenue:2398},
  vervet:{count:0,revenue:0}, vinnTilbake:{count:0,revenue:0}, rebooking:{count:7,revenue:2398,aktivert:true} } };
const attrBasis = { paaVei };   // INGEN hentetInn → panelet viser maskerte låste armer + CTA
const attrFor = (plan) => plan==='vekst' ? attrVekst : attrBasis;
const BILLING_DELAY = 700;

const browser = await chromium.launch();
const rapport = [];

for (const plan of ['basis','vekst']) {
  const page = await browser.newPage({ viewport:{ width:375, height:1200 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let attrKall = 0;
  await page.route('**/api/**', async route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    const J = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/attribution') { attrKall++; return J(attrFor(plan)); }
    if (p === '/api/dashboard/billing/status') { await new Promise(r=>setTimeout(r, BILLING_DELAY)); return J(bill(plan)); } // TREGT → race-vindu
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
    if (p === '/api/dashboard/stats') return J({ daily:[], months_with_data:[], current_week_revenue:0, best_week_revenue:0, best_week_start:null, weekly_revenue:[] });
    if (p === '/api/dashboard/settings') return J({});
    return J(/images|bookings|recent|services|hours|winback|referrals|customers|loyalty/.test(p) ? [] : {});
  });

  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'domcontentloaded' });
  // 400 ms < 700 ms billing-delay: billing har IKKE landet → race-vinduet. Ingen attribution skal ha fyrt.
  await page.waitForTimeout(400);
  const kallIRace = attrKall;
  // Vent til billing har landet + oppdaterSkjoldFlater har re-kjørt renderDrivenBy.
  await page.waitForTimeout(1400);
  const kallEtter = attrKall;

  const dom = await page.evaluate(() => {
    const w = document.getElementById('drivenBy');
    return {
      // «Eksempel»-merke er FJERNET fra dette panelet (14.09) — skal aldri finnes for noen plan.
      eksempelMerke: !!(w && w.querySelector(':scope > .eksempel-merke')),
      // Basis-signal: maskerte låste armer «* klipp · **** kr».
      maskert: !!(w && w.querySelector('.di-basis-laast')),
      // Vekst-signal: ekte total i .di-total-kr (erstattet .drv-hero-num, fjernet 14.09).
      totalKr: (w && w.querySelector('.di-total-kr')) ? w.querySelector('.di-total-kr').textContent.trim() : '(ingen)',
      innerLen: w ? w.innerHTML.length : 0,
    };
  });

  const norm = s => (s||'').replace(/[\s  ]+/g,' ').trim();
  // Begge planer henter nå /attribution etter at billing lander (backend plan-shaper svaret) — ingen
  // klient-gate lenger. Skillet ligger i RESPONSEN: basis maskeres, vekst viser ekte total.
  const kallOk = kallEtter > 0;
  const renderOk = plan==='basis'
    ? (dom.maskert && dom.totalKr==='(ingen)')                 // basis: maskerte armer, INGEN ekte total
    : (!dom.maskert && norm(dom.totalKr)==='2 398 kr');        // vekst: ekte total, ingen maskering
  rapport.push({
    plan,
    'kall i race (må=0)': kallIRace === 0 ? '0 ✓' : (kallIRace + ' ✗ LEKKASJE'),
    'kall etter billing': kallEtter,
    'kall ok': kallOk ? 'ok ✓' : 'MANGLER ✗',
    'maskert (basis)': dom.maskert ? 'ja' : 'nei',
    'ekte total': norm(dom.totalKr),
    'merke (skal=nei)': dom.eksempelMerke ? 'JA ✗' : 'nei ✓',
    'render ok': renderOk ? 'ok ✓' : 'AVVIK ✗',
    jsfeil: errs.length ? errs.join('; ').slice(0,40) : 'ingen',
  });
  await page.close();
}

console.table(rapport);
const b = rapport.find(r=>r.plan==='basis'), v = rapport.find(r=>r.plan==='vekst');
const ok = rapport.every(r => r['kall i race (må=0)']==='0 ✓' && r['kall ok']==='ok ✓' && r['render ok']==='ok ✓' && r['merke (skal=nei)']==='nei ✓' && r.jsfeil==='ingen');
console.log('\nIngen attribution i race-vinduet (begge planer):', rapport.every(r=>r['kall i race (må=0)']==='0 ✓') ? 'ja ✓' : 'NEI ✗');
console.log('Basis: henter etter billing, men SVARET er maskert (ingen ekte total/merke):', (b['kall etter billing']>0 && b['maskert (basis)']==='ja' && b['ekte total']==='(ingen)' && b['merke (skal=nei)']==='nei ✓') ? 'ja ✓' : 'NEI ✗');
console.log('Vekst: attribution fyrer + ekte total, ingen maskering/merke:', (v['kall etter billing']>0 && v['ekte total']==='2 398 kr' && v['maskert (basis)']==='nei' && v['merke (skal=nei)']==='nei ✓') ? 'ja ✓ ('+v['kall etter billing']+' kall)' : 'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
