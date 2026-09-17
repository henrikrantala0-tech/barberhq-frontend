// tools/render/kalender-nastrek.mjs — Oversikt-kalenderen: nå-strek, halvtimeslinjer, header + «I dag»-knapp.
// Verifiserer:
//   1. Header viser valgt dato i klartekst («Fredag 18. sep»), «I dag» når active=i dag (Oslo).
//   2. «I dag»-knapp KUN når active ≠ i dag.
//   3. Halvtimeslinjer mellom timelinjene, svakere.
//   4. Nå-strek (#4d8bff, prikk venstre) KUN på i dag (Oslo-tz), posisjon via minToPx, over blokker.
//      Ikke vist når nå ligger utenfor vist tidsrom. Interval ryddes ved lukking.
//
//   node tools/render/kalender-nastrek.mjs
//
// Skjermbilder → .render-ut/kal-nastrek-*.png (gitignorert).
// Alt fryses til Oslo-tz + fast dato 2026-09-17 for determinisme.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) { if (/^kal-nastrek-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'henriko-fade', email:'h@f.no', hasPassword:true, name:'Henrik', shop:'Henriko Fade',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const BILLING = { subscription_status:'trialing', page_status:'live', plan:null, effective_plan:'vekst',
  effective_plan_grunn:'trial_vindu', trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };

// Oslo wall-clock ISO (september = CEST +02:00) → deterministisk uansett maskin-tz.
const iso = (day, h, m) => `2026-09-${String(day).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+02:00`;
// service_id → farge-posisjon (hoved-lista under). 10=Herreklipp(blå),20=Skin fade(grønn),30=Skjegg(oransje).
const BOOKINGS = [
  { id:1, name:'Ola Nordmann',  service:'Herreklipp', service_id:10, start:iso(16,10,0),  end:iso(16,10,30), status:'fullfort' },
  { id:2, name:'Kari Nordmann', service:'Skin fade',  service_id:20, start:iso(17,11,0),  end:iso(17,11,30), status:'booket' },
  { id:3, name:'Amir Haddad',   service:'Herreklipp', service_id:10, start:iso(17,13,0),  end:iso(17,13,30), status:'booket' },
  { id:7, name:'Mikkel Berg',   service:'Skjegg',     service_id:30, start:iso(17,14,0),  end:iso(17,14,45), status:'booket' },
  { id:4, name:'Nina Dahl',     service:'Skin fade',  service_id:20, start:iso(18,9,0),   end:iso(18,9,45),  status:'booket' },
  { id:5, name:'Lars Vik',      service:'Herreklipp', service_id:10, start:iso(18,11,30), end:iso(18,12,0),  status:'booket' },
  { id:6, name:'Sara Ali',      service:'Skjegg',     service_id:30, start:iso(20,12,0),  end:iso(20,12,30), status:'booket' },
];
const HOURS = [0,1,2,3,4,5,6].map(w => ({ weekday:w, is_closed:false, open_time:'09:00', close_time:'17:00' }));
const SERVICES = { hoved:[ { id:10, name:'Herreklipp', sort:0 }, { id:20, name:'Skin fade', sort:1 }, { id:30, name:'Skjegg', sort:2 } ], tillegg:[] };

function router() {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const j = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')        return j(PROFILE);
    if (p === '/api/dashboard/billing/status') return j(BILLING);
    if (p === '/api/dashboard/bookings')       return j(BOOKINGS);
    if (p === '/api/dashboard/hours')          return j(HOURS);
    if (p === '/api/dashboard/services')       return j(SERVICES);
    return j(/images|recent|winback|referrals|rebooking|sms-logg|stats|attribution|momentum|loyalty|settings/.test(p) ? [] : {});
  };
}

const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;

// Fryser new Date()/Date.now() til et fast Oslo-øyeblikk. Beholder new Date(arg) uendret.
function freezeAt(isoUtc) {
  const FIXED = new Date(isoUtc).getTime();
  const _D = Date;
  function FakeDate(...a){ return a.length===0 ? new _D(FIXED) : new _D(...a); }
  FakeDate.now = () => FIXED; FakeDate.parse = _D.parse; FakeDate.UTC = _D.UTC; FakeDate.prototype = _D.prototype;
  window.Date = FakeDate;
}

const browser = await chromium.launch();
const rad = [];

// isoUtc bestemmer "nå" i Oslo. gotoDag: null=i dag, ellers dagnr (17=i dag,18=neste).
async function skudd(navn, bredde, isoUtc, gotoDag) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:820 }, deviceScaleFactor:2, timezoneId:'Europe/Oslo' });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(freezeAt, isoUtc);
  await page.addInitScript(() => { try { localStorage.setItem('bhq-theme','dark'); } catch(e){} });
  await page.route('**/api/**', router());
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.addStyleTag({ content: SKJUL_BARER });
  await page.waitForTimeout(500);
  await page.evaluate(async () => { await openKalender('today'); });
  if (gotoDag != null) await page.evaluate(d => { calGoto(new Date(2026,8,d).setHours(0,0,0,0)); }, gotoDag);
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const now = document.querySelector('.cal-now');
    const half = document.querySelectorAll('.cal-halfline');
    const hour = document.querySelectorAll('.cal-hourline');
    const hLbl = document.querySelectorAll('.cal-axis .cal-hour>span:not(.cal-half)');
    const halfLbl = document.querySelectorAll('.cal-axis .cal-half');
    const todayBtn = document.querySelector('#calToday');
    const dateBtn = document.querySelector('#calDateBtn');
    const axis = document.querySelector('.cal-axis');
    const nowTop = now ? Math.round(parseFloat(now.style.top)) : null;
    // Kolliderer noen halvtimeetikett med en timeetikett vertikalt? (mindre enn 6px mellom rektangler)
    const rects = [...hLbl, ...halfLbl].map(e => e.getBoundingClientRect());
    let kollisjon = false;
    for (let a = 0; a < hLbl.length; a++) for (let b = 0; b < halfLbl.length; b++) {
      const ra = hLbl[a].getBoundingClientRect(), rb = halfLbl[b].getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) < 6 && !(ra.right < rb.left || rb.right < ra.left)) kollisjon = true;
    }
    // Går noen etikett ut over aksekolonnen (breddevekst / spiser dagkolonnen)?
    const axr = axis.getBoundingClientRect();
    let utafor = false;
    [...hLbl, ...halfLbl].forEach(e => { if (e.getBoundingClientRect().right > axr.right + 0.5) utafor = true; });
    const hs = hLbl.length ? getComputedStyle(hLbl[0]) : null, xs = halfLbl.length ? getComputedStyle(halfLbl[0]) : null;
    return {
      header: dateBtn ? dateBtn.textContent.trim() : null,
      todayBtnVist: todayBtn ? (todayBtn.offsetParent !== null) : false,
      naaStrek: !!now, nowTop,
      nowColor: now ? getComputedStyle(now).borderTopColor || getComputedStyle(now).backgroundColor : null,
      halvlinjer: half.length, timelinjer: hour.length,
      halvOpacity: half.length ? getComputedStyle(half[0]).opacity : null,
      timeLbl: hLbl.length, halvLbl: halfLbl.length,
      timeLblTekst: hLbl.length ? hLbl[0].textContent : null,
      halvLblTekst: halfLbl.length ? halfLbl[0].textContent : null,
      // Er ALLE heltimeetiketter på HH:MM-format? (samme format som halvtimene)
      timeHHMM: [...hLbl].every(e => /^\d{2}:\d{2}$/.test(e.textContent)),
      timeFs: hs ? hs.fontSize : null, halvFs: xs ? xs.fontSize : null,
      timeOp: hs ? hs.opacity : null, halvOp: xs ? xs.opacity : null,
      aksebredde: Math.round(axr.width), lblKollisjon: kollisjon, lblUtafor: utafor,
    };
  });
  await page.locator('#calOverlay').screenshot({ path:`${OUT}/kal-nastrek-${navn}-${bredde}.png` });
  rad.push({ skudd:navn, bredde, header:m.header, idagKnapp:m.todayBtnVist, naaStrek:m.naaStrek,
    nowTop:m.nowTop, timeTekst:m.timeLblTekst, halvTekst:m.halvLblTekst, timeHHMM:m.timeHHMM,
    fs:`${m.timeFs}/${m.halvFs}`, op:`${m.timeOp}/${m.halvOp}`, akse:m.aksebredde,
    kollisjon:m.lblKollisjon, utafor:m.lblUtafor, jsfeil: errs.length?errs.join('; '):'ingen' });
  await ctx.close();
}

for (const bredde of [320, 375]) {
  // I DAG (17.), nå = 10:20 Oslo → strek nær topp, ingen «I dag»-knapp, ingen strek-over-blokk-kollisjon
  await skudd('idag', bredde, '2026-09-17T08:20:00Z', null);
  // ANNEN DAG (18.) — dato i header, «I dag»-knapp synlig, INGEN nå-strek
  await skudd('annen', bredde, '2026-09-17T08:20:00Z', 18);
  // MOCK 14:15 på i dag — strek gjennom Mikkel-blokka (14:00–14:45)
  await skudd('mock1415', bredde, '2026-09-17T12:15:00Z', null);
}

console.table(rad);
console.log('\nForventet:');
console.log('  idag:     header «I dag», idagKnapp=false, naaStrek=true, halvLbl=timeLbl (HH:30)');
console.log('  annen:    header «Fredag 18. sep», idagKnapp=true, naaStrek=false');
console.log('  mock1415: naaStrek=true, nowTop ≈ (14:15−09:00)*1.8 = 567px');
console.log('  Alle:     fs 11px/9px, op 1/.6, ingen kollisjon, ingen utafor akse (46px)');
console.log('Heltime på HH:MM-format overalt:', rad.every(r=>r.timeHHMM) ? 'OK' : 'FEIL');
console.log('Ingen kollisjon / utafor akse:', rad.every(r=>!r.kollisjon && !r.utafor) ? 'OK' : 'FEIL');
console.log('JS-feil:', rad.filter(r=>r.jsfeil!=='ingen').length);
for (const r of rad) console.log(`  ${OUT}\\kal-nastrek-${r.skudd}-${r.bredde}.png`);

await browser.close(); server.close();
