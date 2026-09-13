// Vekst → Momentum-kort: gating mot Basis (datalekkasje-vern).
//
// Bug som ble fikset: loadMomentum() fetchet GET /api/dashboard/momentum UTEN erBasis()-guard,
// i motsetning til søsknene loadVerving/loadWinback/loadLoyalty. En Basis-bruker på Vekst-fanen
// trigget dermed kallet, og backendens ekte gjengangere/forfalte-tall ble regnet klient-side og
// skjult bak settSkjold — «ekte tall bak lås», nøyaktig mønsteret CLAUDE.md flagger.
//
// Denne testen asserter det som IKKE kan sees på et skjermbilde: at nettverkskallet ikke skjer.
//   BASIS:  api.momentum() fyrer 0 ganger  OG  #momentumCard er skjult.
//   VEKST:  api.momentum() fyrer            OG  #momentumCard vises (show:true, lav forfalt-andel).
// billingUkjent() FØR erBasis() — samme rekkefølge som søsknene.
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

const bill = (plan) => ({
  subscription_status:'active', plan, effective_plan:plan, effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_ends_at:null, trial_days_left:null,
  myk_periode:false, needs_attention:false, attention_grunn:null, nedtaking_dager_igjen:null,
});
// show:true, returning:10, overdue:1 → 0.1 < 0.20 (MOMENTUM_LAV_TERSKEL) → kortet skal vises for vekst.
const momentum = { show:true, returning:10, overdue:1 };

const browser = await chromium.launch();
const rapport = [];

for (const plan of ['basis','vekst']) {
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let momentumKall = 0;   // teller GET /api/dashboard/momentum — MÅ være 0 for basis
  await page.route('**/api/**', route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    const J = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/momentum') { momentumKall++; return J(momentum); }
    if (p === '/api/dashboard/billing/status') return J(bill(plan));
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
    if (p === '/api/dashboard/settings') { if (route.request().method()!=='GET') return J({}); return J({ sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35 }); }
    return J(/images|bookings|recent|services|hours|winback|referrals|customers|attribution|loyalty/.test(p) ? (/loyalty/.test(p)?{}:[]) : {});
  });

  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.$eval('button[data-panel="vekst"]', b => b.click());
  await page.waitForTimeout(900);   // la loadVekst + oppdaterSkjoldFlater (som re-kjører loadMomentum) rekke å kjøre

  const momSynlig = await page.evaluate(() => {
    const c = document.getElementById('momentumCard');
    return !!(c && !c.hidden && c.offsetParent !== null);
  });

  const forventKall = plan === 'vekst';
  const forventSynlig = plan === 'vekst';
  rapport.push({
    plan,
    'momentum-kall': momentumKall,
    'kall ok': (momentumKall > 0) === forventKall ? 'ok ✓' : (plan==='basis' ? 'LEKKER ✗' : 'MANGLER ✗'),
    'kort': momSynlig ? 'vist' : 'skjult',
    'kort ok': momSynlig === forventSynlig ? 'ok ✓' : 'AVVIK ✗',
    jsfeil: errs.length ? errs.join('; ').slice(0,50) : 'ingen',
  });
  await page.close();
}

console.table(rapport);
const ok = rapport.every(r => r['kall ok']==='ok ✓' && r['kort ok']==='ok ✓' && r.jsfeil==='ingen');
console.log('\nBasis fetcher ALDRI momentum:', rapport.find(r=>r.plan==='basis')['momentum-kall']===0 ? 'ja ✓' : 'NEI ✗ (lekkasje)');
console.log('Vekst får kortet sitt:       ', rapport.find(r=>r.plan==='vekst')['kort']==='vist' ? 'ja ✓' : 'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
