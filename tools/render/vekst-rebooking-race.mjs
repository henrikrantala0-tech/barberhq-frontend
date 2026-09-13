// Vekst → Rebooking-piller: dobbeltklikk-race.
//
// Bug som ble fikset: pillene manglet synkron disable FØR await (i motsetning til #vervRecipient
// i af7fe16). To raske klikk ga to samtidige PUT /settings; svarene kunne lande i feil rekkefølge,
// og aria-selected (via setRebookPills) endte motsatt av siste klikk.
//
// Assert: klikk pille A, så pille B mens A-kallet er i lufta (PUT forsinket).
//   → NØYAKTIG 1 PUT (B-klikket blokkeres av disabled-pillene; disabled button fyrer ingen click).
//   → sluttilstand = A (den eneste pilla som gikk gjennom), backend og UI enige.
// Før fixen: 2 PUT-er.
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

const bill = { subscription_status:'active', effective_plan:'vekst', effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));

let putKall = 0;             // teller PUT /settings med rebooking_interval_days
let sisteSendt = null;
await page.route('**/api/**', async route => {
  const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
  const J = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/settings' && m !== 'GET') {
    const body = JSON.parse(route.request().postData() || '{}');
    if ('rebooking_interval_days' in body) { putKall++; sisteSendt = body.rebooking_interval_days; }
    await new Promise(r => setTimeout(r, 250));   // forsink svaret → andre klikk skjer mens kallet er i lufta
    return J({});
  }
  if (p === '/api/dashboard/billing/status') return J(bill);
  if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
  if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
  if (p === '/api/dashboard/settings') return J({ sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35 });
  return J(/images|bookings|recent|services|hours|winback|referrals|customers|attribution/.test(p) ? [] : {});
});

await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
await page.$eval('button[data-panel="vekst"]', b => b.click());
await page.waitForTimeout(500);
await page.$eval('#accRebook .acc-head', b => b.click());
await page.waitForTimeout(300);

// Utgangspunkt: 35 er lagret/valgt. Dobbeltklikk 45 så 28 i samme mikrotask-runde.
// Begge .click() kalles synkront; det første kjører handleren til await (disabler alle piller),
// det andre treffer da en disabled knapp → ingen click-event. Modellerer en ekte rask dobbelttrykk.
await page.evaluate(() => {
  document.querySelector('#rebookPills button[data-days="45"]').click();
  document.querySelector('#rebookPills button[data-days="28"]').click();
});
await page.waitForTimeout(700);   // la det forsinkede kallet fullføre + finally re-enable

const valgt = await page.$eval('#rebookPills',
  el => [...el.querySelectorAll('button')].filter(b => b.getAttribute('aria-selected')==='true').map(b=>b.dataset.days).join(',') || '—');
const noenDisabled = await page.$eval('#rebookPills',
  el => [...el.querySelectorAll('button')].some(b => b.disabled));

const rapport = {
  'PUT-kall': putKall,
  'kall ok (1)': putKall === 1 ? 'ok ✓' : (putKall + ' ✗'),
  'sendt verdi': sisteSendt,
  'valgt pille': valgt,
  'valgt ok (45)': valgt === '45' ? 'ok ✓' : 'AVVIK ✗',
  're-enabled etter': noenDisabled ? 'NOEN DISABLED ✗' : 'alle på ✓',
  jsfeil: errs.length ? errs.join('; ').slice(0,50) : 'ingen',
};
console.table([rapport]);
const ok = putKall === 1 && valgt === '45' && !noenDisabled && errs.length === 0;
console.log('\ndobbeltklikk → 1 PUT:', putKall === 1 ? 'ja ✓' : 'NEI ✗ ('+putKall+')');
console.log('piller re-enabled:   ', noenDisabled ? 'NEI ✗' : 'ja ✓');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
