// Oversikt → «Drevet av BarberHQ»: billingUkjent()-vakt i renderDrivenBy.
//
// Bug som ble fikset: renderDrivenBy hadde kun erBasis()-sjekk, ingen billingUkjent()-vakt. Den
// kjøres ved oppstart (loadOversikt) FØR loadBilling svarer, så i race-vinduet var _billing===null
// → erBasis() false → den hentet ekte /attribution. En Basis-kontos ekte tall kunne dermed nå
// nettleseren før planen var kjent. Fiks: billingUkjent() FØRST, så erBasis() — som loadMomentum.
//
// Test med KUNSTIG TREGT /billing/status (700 ms) = race-vinduet:
//   Måler /attribution-kall FØR billing lander (400 ms) → MÅ være 0 for begge planer (vakten holder).
//   Basis: 0 kall totalt, eksempel + «Eksempel»-merke rendres når billing lander.
//   Vekst: kall > 0 etter billing (uke + 2uker for delta), ekte tall vises, INGEN «Eksempel»-merke.
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
// Ekte attribusjon (kun brukt av vekst — basis skal aldri hente den). total = ENESTE totalkilde.
const attrData = { period:'uke', total:{count:7,revenue:2398}, rebooking:{count:7,revenue:2398},
  vervet:{count:0,revenue:0}, recovery:{count:0,revenue:0} };
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
    if (p === '/api/dashboard/attribution') { attrKall++; return J(attrData); }
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
      eksempelMerke: !!(w && w.querySelector(':scope > .eksempel-merke')),
      skjold: !!(w && w.classList.contains('skjold-vert')),
      heroNum: (w && w.querySelector('.drv-hero-num')) ? w.querySelector('.drv-hero-num').textContent.trim() : '(ingen)',
      innerLen: w ? w.innerHTML.length : 0,
    };
  });

  const forventKall = plan === 'vekst';
  rapport.push({
    plan,
    'kall i race (må=0)': kallIRace === 0 ? '0 ✓' : (kallIRace + ' ✗ LEKKASJE'),
    'kall etter billing': kallEtter,
    'kall ok': (kallEtter > 0) === forventKall ? 'ok ✓' : (plan==='basis' ? 'LEKKER ✗' : 'MANGLER ✗'),
    'eksempel-merke': dom.eksempelMerke ? 'ja' : 'nei',
    'merke ok': dom.eksempelMerke === (plan==='basis') ? 'ok ✓' : 'AVVIK ✗',
    'hero': dom.heroNum,
    jsfeil: errs.length ? errs.join('; ').slice(0,40) : 'ingen',
  });
  await page.close();
}

console.table(rapport);
const b = rapport.find(r=>r.plan==='basis'), v = rapport.find(r=>r.plan==='vekst');
const ok = rapport.every(r => r['kall i race (må=0)']==='0 ✓' && r['kall ok']==='ok ✓' && r['merke ok']==='ok ✓' && r.jsfeil==='ingen');
console.log('\nIngen attribution i race-vinduet (begge planer):', rapport.every(r=>r['kall i race (må=0)']==='0 ✓') ? 'ja ✓' : 'NEI ✗');
console.log('Basis: 0 kall totalt + eksempel-merke:          ', (b['kall etter billing']===0 && b['eksempel-merke']==='ja') ? 'ja ✓' : 'NEI ✗');
const vHero = v.hero.replace(/[  ]/g,' '); // toLocaleString('no-NO') bruker hardt mellomrom som tusenskille
console.log('Vekst: attribution fyrer + ekte tall, ingen merke:', (v['kall etter billing']>0 && v['eksempel-merke']==='nei' && vHero==='2 398 kr') ? 'ja ✓ ('+v['kall etter billing']+' kall: uke + 2uker-delta)' : 'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
