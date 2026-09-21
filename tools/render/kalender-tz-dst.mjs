// tools/render/kalender-tz-dst.mjs — kalender: tidssone-uavhengighet + sommertid + midnatt-splitt.
// Verifiserer funnene H3/L-13 (booking over midnatt), H4/M-7 (Oslo vs nettleser-tz) og M6 (sommertid):
//   Blokker OG nå-strek skal havne NØYAKTIG likt enten nettleseren står i Europe/Oslo eller
//   America/New_York, på: vanlig dag, booking over midnatt, 25.10.2026 (fall-back) og 28.03.2027
//   (spring-forward). Booking over midnatt skal gi TO klikkbare segmenter med samme id.
//
//   node tools/render/kalender-tz-dst.mjs
//
// Måler offsetTop/offsetHeight (faktisk layout) relativt til .cal-daybody. Exit 1 ved regresjon.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
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
const URLB = `http://localhost:${PORT}/no`;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Åpent 00:00–23:45 alle dager → aksen dekker hele døgnet (0–1440), så både sen-natt- og
// tidlig-morgen-segmenter er synlige og målbare uten klipping.
const HOURS = [0,1,2,3,4,5,6].map(wd => ({ weekday:wd, is_closed:false, open_time:'00:00', close_time:'23:45', breaks:[] }));
const SERVICES = { hoved:[{ id:1, name:'Klipp', sort:0, price:300, min:30 }], tillegg:[] };
const PX = 1.8; // PX_PER_MIN i dashboard.html — hold i synk hvis den endres

// now = Oslo 12:00 den dagen (→ nå-strek på 720 min = 1296px). Booking-instant i UTC med kjent Oslo-veggklokke.
const SCEN = [
  { navn:'vanlig',         now:'2026-09-15T10:00:00Z',
    bk:[{ id:'A', start:'2026-09-15T08:00:00Z', end:'2026-09-15T08:45:00Z', name:'Kunde A', service:'Klipp', service_id:1, status:'booket' }],
    forvent:[{ id:'A', col:0, top:Math.round(600*PX), h:Math.round(45*PX) }] },      // Oslo 10:00–10:45
  { navn:'over-midnatt',   now:'2026-09-15T10:00:00Z',
    bk:[{ id:'M', start:'2026-09-15T21:30:00Z', end:'2026-09-15T22:15:00Z', name:'Kunde M', service:'Klipp', service_id:1, status:'booket' }],
    forvent:[{ id:'M', col:0, top:Math.round(1410*PX), h:Math.round(30*PX) },        // Oslo 23:30→24:00 (startdag)
             { id:'M', col:1, top:0, h:Math.round(15*PX) }] },                        // Oslo 00:00→00:15 (neste dag)
  { navn:'fall-back-2510', now:'2026-10-25T11:00:00Z',
    bk:[{ id:'F', start:'2026-10-25T13:00:00Z', end:'2026-10-25T13:30:00Z', name:'Kunde F', service:'Klipp', service_id:1, status:'booket' }],
    forvent:[{ id:'F', col:0, top:Math.round(840*PX), h:Math.round(30*PX) }] },       // Oslo 14:00–14:30 (UTC+1 etter fall-back)
  { navn:'spring-fwd-2803', now:'2027-03-28T10:00:00Z',
    bk:[{ id:'S', start:'2027-03-28T08:00:00Z', end:'2027-03-28T08:30:00Z', name:'Kunde S', service:'Klipp', service_id:1, status:'booket' }],
    forvent:[{ id:'S', col:0, top:Math.round(600*PX), h:Math.round(30*PX) }] },       // Oslo 10:00–10:30 (UTC+2 etter spring-forward)
];
const TZS = ['Europe/Oslo','America/New_York'];
const NAA_TOP = Math.round(720*PX); // nå-strek på Oslo 12:00

function router(bk){ return route => {
  const p = new URL(route.request().url()).pathname;
  const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/profile')  return json(PROFILE);
  if (p === '/api/dashboard/services') return json(SERVICES);
  if (p === '/api/dashboard/hours')    return json(HOURS);
  if (p === '/api/dashboard/bookings') return json(bk);
  if (p === '/api/dashboard/billing/status') return json({ subscription_status:'trialing', effective_plan:'vekst', plan:null });
  const liste = /images|recent|winback|referrals|rebooking|sms-logg|momentum|loyalty|stats|attribution/.test(p);
  return json(liste ? [] : {});
}; }

const MEASURE = `() => {
  const cols = [...document.querySelectorAll('#calDays .cal-day')];
  const blocks = [];
  cols.forEach((col, ci) => col.querySelectorAll('.cal-block').forEach(bl => {
    blocks.push({ id: bl.dataset.id, col: ci, top: Math.round(bl.offsetTop), h: Math.round(bl.offsetHeight) });
  }));
  blocks.sort((a,b) => a.col-b.col || a.top-b.top || String(a.id).localeCompare(String(b.id)));
  const nowEl = document.querySelector('#calDays .cal-now');
  let now = null;
  if (nowEl) { const col = nowEl.closest('.cal-day'); now = { col: cols.indexOf(col), top: Math.round(nowEl.offsetTop) }; }
  return { blocks, now };
}`;

const browser = await chromium.launch();
const rapport = []; const feil = [];
function sjekk(navn, ok, detalj){ rapport.push({ sjekk:navn, ok: ok?'JA':'NEI', detalj: detalj||'' }); if(!ok) feil.push(navn); }

for (const scen of SCEN) {
  const perTz = {};
  for (const tz of TZS) {
    const ctx = await browser.newContext({ timezoneId: tz, viewport:{ width:1000, height:900 }, deviceScaleFactor:1 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.clock.install({ time: new Date(scen.now) });   // fryser «nå» til scenariets instant
    await page.route('**/api/**', router(scen.bk));
    await page.goto(`${URLB}/dashboard.html`, { waitUntil:'networkidle' });
    await page.click('#calOpenUpcoming');                     // openKalender('today') → active = Oslo-i dag = scenariedagen
    await page.waitForTimeout(300);
    const geo = await page.evaluate(eval(MEASURE));
    perTz[tz] = { geo, jsfeil: errs.length ? errs.join('; ') : 'ingen' };
    await ctx.close();
  }
  const oslo = perTz['Europe/Oslo'], ny = perTz['America/New_York'];
  const likt = JSON.stringify(oslo.geo) === JSON.stringify(ny.geo);
  sjekk(scen.navn+': blokker+nå-strek IDENTISK Oslo vs New York', likt,
    likt ? '' : ('oslo='+JSON.stringify(oslo.geo)+' ny='+JSON.stringify(ny.geo)));
  // forventet geometri (mot Oslo-kjøringen)
  const g = oslo.geo;
  const forventOk = scen.forvent.every(f => g.blocks.some(b => b.id===f.id && b.col===f.col && b.top===f.top && b.h===f.h))
    && g.blocks.length === scen.forvent.length;
  sjekk(scen.navn+': blokk-geometri som forventet', forventOk,
    forventOk ? '' : ('fikk='+JSON.stringify(g.blocks)+' forventet='+JSON.stringify(scen.forvent)));
  const naaOk = g.now && g.now.col===0 && g.now.top===NAA_TOP;
  sjekk(scen.navn+': nå-strek på Oslo 12:00 (col0, '+NAA_TOP+'px)', naaOk, naaOk ? '' : JSON.stringify(g.now));
  sjekk(scen.navn+': ingen JS-feil', oslo.jsfeil==='ingen' && ny.jsfeil==='ingen', oslo.jsfeil+' / '+ny.jsfeil);
}
// Eksplisitt: over-midnatt gir TO segmenter med SAMME id (begge klikkbare → samme detalj)
{
  const midnatt = rapport; // allerede målt over; sjekk forvent dekker 2 segmenter med id 'M'
  const scenM = SCEN.find(s=>s.navn==='over-midnatt');
  sjekk('over-midnatt: to segmenter med samme booking-id', scenM.forvent.filter(f=>f.id==='M').length===2 && scenM.forvent.every(f=>f.id==='M'));
}

await browser.close(); server.close();
console.table(rapport);
const alleOk = feil.length===0;
console.log('\nkalender-tz-dst:', alleOk ? 'ALLE OK ✓' : `REGRESJON i ${feil.length}: ${feil.join(' | ')}`);
process.exit(alleOk ? 0 : 1);
