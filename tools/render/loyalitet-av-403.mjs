// Lojalitet → «Slå av likevel» ved 403: knappen må re-enables (ikke henge på «Slår av …»).
//
// Bug som ble fikset: 403-grenen gjorde visSettingsLaas(...); return; UTEN å re-enable knappen,
// mens søsken-grenene (5411/5426) re-enabler. Knappen frøs på «Slår av …».
//
// Flyt: vekst-konto, lojalitet PÅ med belønning klar (totals.ready>0) → toggle av viser
// bekreftelsen «Slå av likevel». Klikk den; PUT /settings svarer 403.
//   Assert: knappen er disabled=false OG teksten er «Slå av likevel» igjen (som søsknene).
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
const loyalty = { enabled:true, threshold:10, pct:100, activated_at:'2026-01-01', count_history:false,
  participants:[{customer_id:'c1',name:'Ola',phone:'900',opt_in_at:'2026-01-01',stamps:10,reward_ready:true}],
  eligible:[], totals:{ in_progress:2, ready:1, redeemed_month:0, participants:1, eligible:0 } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.route('**/api/**', route => {
  const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
  const J = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/settings' && m !== 'GET')     // PUT → 403 (simulerer Vekst-lås/backend-gate)
    return route.fulfill({ status:403, contentType:'application/json', body:JSON.stringify({ error:'plan' }) });
  if (p === '/api/dashboard/loyalty') return J(loyalty);
  if (p === '/api/dashboard/billing/status') return J(bill);
  if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
  if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
  if (p === '/api/dashboard/settings') return J({ sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, loyalty_enabled:true });
  return J(/images|bookings|recent|services|hours|winback|referrals|customers|attribution/.test(p) ? [] : {});
});

await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
await page.$eval('button[data-panel="vekst"]', b => b.click());
await page.waitForTimeout(700);
await page.$eval('#accLoyal .acc-head', b => b.click());   // åpne lojalitet-trekkspillet
await page.waitForTimeout(500);

// Toggle AV → belønning klar (ready:1) → bekreftelsen «Slå av likevel» vises (bryter holdes PÅ).
await page.evaluate(() => { const t=document.getElementById('tog-loyal'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true})); });
await page.waitForTimeout(300);
const warnVist = await page.evaluate(() => { const w=document.getElementById('loyalOffWarn'); return !!(w && !w.hidden && w.querySelector('.kl-off-ja')); });

// Klikk «Slå av likevel» → PUT 403.
await page.evaluate(() => { const b=document.querySelector('.kl-off-ja'); if(b) b.click(); });
await page.waitForTimeout(500);   // la await api.saveSettings (403) resolve + fixen re-enable

const etter = await page.evaluate(() => {
  const b = document.querySelector('.kl-off-ja');
  return b ? { finnes:true, disabled:b.disabled, tekst:b.textContent.trim() } : { finnes:false };
});

const rapport = {
  'advarsel vist': warnVist ? 'ja ✓' : 'NEI ✗',
  'knapp finnes': etter.finnes ? 'ja' : 'NEI ✗',
  'disabled etter 403': etter.disabled ? 'JA ✗ (henger)' : 'nei ✓',
  'tekst etter 403': etter.tekst,
  'tekst ok': etter.tekst === 'Slå av likevel' ? 'ok ✓' : 'AVVIK ✗',
  jsfeil: errs.length ? errs.join('; ').slice(0,50) : 'ingen',
};
console.table([rapport]);
const ok = warnVist && etter.finnes && !etter.disabled && etter.tekst === 'Slå av likevel' && errs.length === 0;
console.log('\nknapp re-enabled etter 403:', !etter.disabled ? 'ja ✓' : 'NEI ✗ (henger på «Slår av …»)');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
