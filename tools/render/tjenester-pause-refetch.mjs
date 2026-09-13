// Tjenester & tider → arbeidstider: refetch etter lagring speiler backend-normalisering.
//
// Bug som ble fikset: api.saveHours dropper ufullstendige pauser (start uten slutt) fra payloaden,
// men #saveHours-handleren refetchet ikke — i motsetning til saveSvc/savePay. Lokal `hours` beholdt
// fantompausen, og pause-modalen viste den som avkrysset til en full reload.
//
// Stateful mock: PUT lagrer nøyaktig det backend ville lagret (dropper den ufullstendige pausen),
// GET returnerer den normaliserte tilstanden. Assert: etter «tøm slutt-felt → lagre» viser
// pause-modalen SAMME tilstand som backend (mandag uten pause) UTEN full reload.
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

// Backend-tilstand: mandag (weekday 1) åpen 09–17 MED pause 12:00–12:30. Resten stengt.
let hoursState = { days: [{ weekday:1, is_closed:false, open_time:'09:00', close_time:'17:00' }],
                   breaks: [{ weekday:1, start_time:'12:00', end_time:'12:30' }] };
function getHours() {
  return hoursState.days.map(d => ({ ...d,
    breaks: hoursState.breaks.filter(b => b.weekday === d.weekday) }));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));

let putBreaks = null;   // hva backend faktisk mottok (skal ikke inneholde den ufullstendige pausen)
await page.route('**/api/**', route => {
  const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
  const J = (o) => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/hours') {
    if (m !== 'GET') {   // PUT: backend lagrer nøyaktig payloaden (frontend har alt droppet ufullstendige pauser)
      const body = JSON.parse(route.request().postData() || '{}');
      putBreaks = body.breaks || [];
      hoursState = { days: body.days || [], breaks: body.breaks || [] };
      return J({ ok:true });
    }
    return J(getHours());
  }
  if (p === '/api/dashboard/billing/status') return J(bill);
  if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
  if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
  if (p === '/api/dashboard/services') return J({ hoved:[], tillegg:[] });
  if (p === '/api/dashboard/settings') { if (m !== 'GET') return J({}); return J({ payment_methods:[] }); }
  return J(/images|bookings|recent|winback|referrals|customers|attribution/.test(p) ? [] : {});
});

await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
await page.$eval('button[data-panel="tjenester"]', b => b.click());
await page.waitForTimeout(700);

// Åpne pause-modalen og bekreft utgangspunkt: mandag avkrysset med 12:00–12:30.
await page.$eval('#pauseBtn', b => b.click());
await page.waitForTimeout(300);
const foer = await page.evaluate(() => {
  const rad = document.querySelector('#pauseModalList .pm-row');
  const cb = rad && rad.querySelector('input[type="checkbox"]');
  const end = document.querySelector('#pauseModalList input[data-pmf="end"]');
  return { avkrysset: !!(cb && cb.checked), slutt: end ? end.value : '(ingen felt)' };
});

// Tøm SLUTT-feltet på mandagens pause → breaks[0] = {start:'12:00', end:''} (ufullstendig).
await page.evaluate(() => {
  const end = document.querySelector('#pauseModalList input[data-pmf="end"]');
  end.value = '';
  end.dispatchEvent(new Event('change', { bubbles:true }));
});
// Lukk modalen (Ferdig) og lagre arbeidstider.
await page.$eval('#pauseFerdig', b => b.click());
await page.waitForTimeout(200);
await page.$eval('#saveHours', b => b.click());
await page.waitForTimeout(800);   // la api.saveHours + refetch (loadArbeidstider) fullføre

// Reopen pause-modalen UTEN full reload. Nå skal den speile backend: mandag UTEN pause.
await page.$eval('#pauseBtn', b => b.click());
await page.waitForTimeout(300);
const etter = await page.evaluate(() => {
  const rad = document.querySelector('#pauseModalList .pm-row');
  const cb = rad && rad.querySelector('input[type="checkbox"]');
  const felt = document.querySelector('#pauseModalList input[data-pmf="start"]');
  return { avkrysset: !!(cb && cb.checked), harFelt: !!felt };
});

const rapport = {
  'før: avkrysset': foer.avkrysset ? 'ja' : 'nei',
  'før: slutt': foer.slutt,
  'PUT breaks': JSON.stringify(putBreaks),
  'backend droppet pause': (Array.isArray(putBreaks) && putBreaks.length === 0) ? 'ja ✓' : 'NEI ✗',
  'etter: modal avkrysset': etter.avkrysset ? 'JA ✗ (fantom)' : 'nei ✓',
  'etter: felt vist': etter.harFelt ? 'JA ✗' : 'nei ✓',
  jsfeil: errs.length ? errs.join('; ').slice(0,50) : 'ingen',
};
console.table([rapport]);
const ok = foer.avkrysset && Array.isArray(putBreaks) && putBreaks.length === 0
  && !etter.avkrysset && !etter.harFelt && errs.length === 0;
console.log('\nbackend droppet ufullstendig pause:', (Array.isArray(putBreaks)&&putBreaks.length===0) ? 'ja ✓' : 'NEI ✗');
console.log('modal speiler backend (ingen fantom):', !etter.avkrysset ? 'ja ✓' : 'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
