// tools/render/legg-til-booking.mjs — «Legg til booking» (barberen legger inn en booking selv), 12.11.2026.
//
// Kontrakt (backend, branch manuell-booking) — mocket her, ALT under /api/** besvares av mocken. Formene er
// backendens (src/lib/manuellBooking.js): aapningstid {is_closed, open, close, avvik}, pauser som ISO-intervaller.
//   GET  /api/dashboard/bookings/dag?dato=YYYY-MM-DD → {dato, aapningstid, bookinger:[…], pauser:[{start,end}]}
//   POST /api/dashboard/bookings/manuell {dato, klokkeslett, service_id, customer_name, customer_phone?}
//        201 {ok, booking (med price_label som GET /bookings), paaminnelse_sendes} · 409 {error, konflikt} · 400 {error}
//
// Sjekker @320 og @375:
//   1. Tom modal fra Oversikt: dato = i dag, klokkeslett viser dempet «00:00» (value tom, ingen «--:--»), knappen grå.
//   2. Datovelgeren er den DELTE BhqDatovelger (backend src/klient/datovelger.*, lastet fra /book/_/ på eget domene —
//      testen leverer backendens filer fra disk): i dag valgt + nøytral (ingen blå/aksent), før i dag deaktivert,
//      ← deaktivert i inneværende måned. Dashbordet har ingen egen kopi igjen.
//   3. Dato valgt: tatte tider fra /bookings/dag (bookinger + pause), sortert, med åpningstid.
//   4. Overlapp: rød linje som navngir bookingen, kollisjonsraden markert, knappen grå.
//   5. Tid valgt: tallet i --ink (hvit), «00:00» borte, knappen virker. Inntil-kant er ikke overlapp; pause er bare info.
//   6. 409: melding med bookingen den kræsjer med, lista hentet på nytt, knappen grå. Body uten telefon.
//   7. Varslingen: med SMS-linje KUN når paaminnelse_sendes er true; uten telefon og med telefon + false → bare
//      «Booking lagt til» + «Vis i kalender». «Vis i kalender» åpner riktig dag med blokka.
//   8. Fra kalenderen uten telefon: kalenderens dag, blokka med en gang; detaljflaten uten telefon og uten «null»,
//      Pris fra bookingens price_label.
//   9. Datogrenser i velgeren (i går / i dag / ett år / ett år + én dag, → deaktivert i siste måned), sommertid-hullet,
//      dagsfeil + «Prøv igjen», og økt-vakten (svar etter lukk + ny åpning lukker ikke den nye modalen).
//  10. Datovelger-fila kommer ikke (404): tydelig tekst, ingen JS-feil, dagens dato kan fortsatt brukes.
//  11. Ingen pageerror, ingen request til api.trybarberhq.com utenom mocken, ingen horisontal overflow.
//   node tools/render/legg-til-booking.mjs   → .render-ut/legg-til-booking/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/legg-til-booking');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
               '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// Den delte datovelgeren (BhqDatovelger) bor i backend (src/klient/datovelger.{js,css}) og serveres på /book/_/… gjennom
// Netlify-proxyen. Lokalt finnes ingen proxy, så testen leverer backendens egne filer fra disk (søsterrepoet) — samme
// innhold som prod serverer. BHQ_KLIENT overstyrer stien.
const KLIENT = process.env.BHQ_KLIENT || path.resolve(import.meta.dirname, '../../../barberhq-backend/barberhq-backend/src/klient');
if (!fs.existsSync(path.join(KLIENT, 'datovelger.js')) || !fs.existsSync(path.join(KLIENT, 'datovelger.css'))) {
  console.error(`Fant ikke datovelger.js/.css i ${KLIENT} — sjekk ut barberhq-backend (med BhqDatovelger) ved siden av, eller sett BHQ_KLIENT.`);
  process.exit(1);
}

const NAA = new Date('2026-11-12T09:00:00Z');   // torsdag 12.11.2026 10:00 Oslo (UTC+1)
const IDAG = '2026-11-12', LOR = '2026-11-14';
const oslo = (dato, hm) => new Date(`${dato}T${hm}:00${dato < '2027-03-28' || dato > '2027-10-31' ? '+01:00' : '+02:00'}`).toISOString();
const SVC = [{ id:11, name:'Herreklipp', min:30, price:350, sort:0 },
             { id:12, name:'Skin fade', min:45, price:400, sort:1 },
             { id:13, name:'Klipp og skjegg', min:60, price:500, sort:2 }];
const bk = (id, dato, fra, til, name, svcId, phone = '+4791234567') => {
  const s = SVC.find(x => x.id === svcId);
  return { id, start:oslo(dato, fra), end:oslo(dato, til), name, phone, service:s.name, service_id:svcId,
           status:'bekreftet', kilde:'kunde', price_label:s.price + ' kr', addons:[] };
};
const HOURS = [0,1,2,3,4,5,6].map(wd => ({ weekday:wd, is_closed:wd === 0, open_time:'10:00', close_time:'18:00', breaks:[] }));
const bill = { subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription',
               page_status:'live', needs_attention:false };

function nyState() {
  return {
    base: [ bk('b1', LOR, '10:00', '10:30', 'Ola Nordmann', 11), bk('b2', LOR, '11:00', '11:45', 'Ali Khan', 12),
            bk('b3', LOR, '13:00', '14:00', 'Per Hansen', 13), bk('b4', '2026-11-13', '11:00', '11:30', 'Emil Strand', 11) ],
    ekstra: [], lagret: [], posts: [], dagKall: [], gi409: false, n: 0, paam: null, dagFeil: false, forsinkMs: 0,
    dvKall: [], dvFeil: false,
  };
}
const dagFor = (st, dato) => ({
  dato,
  aapningstid: dato === LOR ? { is_closed:false, open:'10:00', close:'16:00', avvik:false } : { is_closed:false, open:'10:00', close:'18:00', avvik:false },
  bookinger: st.base.concat(st.ekstra, st.lagret).filter(b => b.start.slice(0, 10) === dato)
    .map(({ id, name, phone, service, service_id, start, end, status, kilde }) => ({ id, name, phone, customer_id:null, service, service_id, start, end, status, kilde })),
  pauser: dato === LOR ? [{ start:oslo(LOR, '12:00'), end:oslo(LOR, '12:30') }] : [],
});

const browser = await chromium.launch();
async function aapne(w, st) {
  const ctx = await browser.newContext({ timezoneId:'Europe/Oslo', viewport:{ width:w, height:844 }, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const prod = [], mocket = new Set();
  page.on('request', q => { if (new URL(q.url()).hostname === 'api.trybarberhq.com') prod.push(q); });
  await page.clock.setFixedTime(NAA);
  await page.route('**/book/_/datovelger.*', route => {
    const u = route.request().url(), navn = new URL(u).pathname.split('/').pop();
    st.dvKall.push(u);
    if (st.dvFeil) return route.fulfill({ status:404, contentType:'text/plain', body:'404' });
    return route.fulfill({ status:200, contentType:navn.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8',
                           body:fs.readFileSync(path.join(KLIENT, navn)) });
  });
  await page.route('**/api/**', async route => {
    mocket.add(route.request());
    if (st.forsinkMs && route.request().method() === 'POST') await new Promise(r => setTimeout(r, st.forsinkMs));
    const q = route.request(), u = new URL(q.url()), p = u.pathname, m = q.method();
    const J = (o, s = 200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile') return J({ slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', booking_horizon_days:28 });
    if (p === '/api/dashboard/billing/status') return J(bill);
    if (p === '/api/dashboard/hours') return J(HOURS);
    if (p === '/api/dashboard/services') return J({ hoved:SVC, tillegg:[] });
    if (p === '/api/dashboard/bookings') return J(st.base.concat(st.ekstra, st.lagret));
    if (p === '/api/dashboard/bookings/dag') { const d = u.searchParams.get('dato'); st.dagKall.push(d); return st.dagFeil ? J({ error:'x' }, 500) : J(dagFor(st, d)); }
    if (p === '/api/dashboard/bookings/manuell' && m === 'POST') {
      const body = JSON.parse(q.postData() || '{}'); st.posts.push(body);
      if (st.gi409) {   // noen booket 14:00 mens skjemaet sto åpent
        st.gi409 = false;
        const sara = bk('k1', LOR, '14:00', '14:30', 'Sara Lie', 11); st.ekstra.push(sara);
        return J({ error:'Tiden overlapper en annen booking.', konflikt:{ id:sara.id, name:sara.name, service:sara.service, start:sara.start, end:sara.end, kilde:'kunde' } }, 409);
      }
      const s = SVC.find(x => x.id === body.service_id), start = oslo(body.dato, body.klokkeslett);
      // Som GET /bookings: price_label (brukes direkte av detaljflaten) + price_nok.
      const b = { id:'n' + (++st.n), name:body.customer_name, phone:body.customer_phone || null, customer_id:null,
                  service:s.name, service_id:s.id, price_label:s.price + ' kr', price_nok:s.price, start, end:new Date(new Date(start).getTime() + s.min * 60000).toISOString(),
                  status:'bekreftet', kilde:'manuell', total_minutes:s.min };
      st.lagret.push(b);
      const paam = st.paam != null ? st.paam : !!body.customer_phone;
      return J({ ok:true, booking:b, paaminnelse_sendes:paam }, 201);
    }
    if (p === '/api/dashboard/google/status') return J({ connected:false, scope_ok:true });
    return J(/images|recent|winback|referrals|rebooking|sms-logg|momentum|loyalty|stats|attribution|customers/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  const lekk = () => prod.filter(q => !mocket.has(q)).map(q => q.method() + ' ' + q.url());
  return { ctx, page, errs, lekk };
}
const les = page => page.evaluate(() => {
  // checkVisibility, ikke offsetParent: bekreftelsen er position:fixed, og der er offsetParent ALLTID null.
  const $ = s => document.querySelector(s), vis = el => !!el && el.checkVisibility();
  const modal = $('#bkNyBackdrop .pause-modal'), tid = $('#bkNyTid');
  return {
    aapen: !$('#bkNyBackdrop').hidden,
    dato: $('#bkNyDato').value, datoTekst: $('#bkNyDatoTekst').textContent,
    rader: [...document.querySelectorAll('#bkNyDag .bkn-rad')].map(r => ({ t:r.querySelector('.bkn-tid').textContent, h:r.querySelector('.bkn-hva').textContent, kol:r.classList.contains('kollisjon'), pause:r.classList.contains('pause') })),
    dagTekst: $('#bkNyDag').innerText.replace(/\s+/g, ' ').trim(),
    under: vis($('#bkNyUnder')) ? $('#bkNyUnder').textContent : '', underFeil: $('#bkNyUnder').classList.contains('feil'),
    feil: vis($('#bkNyFeil')) ? $('#bkNyFeil').textContent : '',
    knappAv: $('#bkNyLagre').disabled, knapp: $('#bkNyLagre').textContent,
    hint: [...document.querySelectorAll('#bkNyBackdrop .fld-hint')].map(e => e.textContent).join(' | '),
    tidVerdi: tid.value, tidFarge: getComputedStyle(tid).color, inkFarge: getComputedStyle($('#bkNyNavn')).color,
    tidPh: vis($('.bkn-tid-ph')), tidPhFarge: getComputedStyle($('.bkn-tid-ph')).color, mutFarge: getComputedStyle(document.body).getPropertyValue('--mut').trim(),
    kalAapen: vis($('#bkNyKal')),
    modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : null,
    sideOverflow: document.documentElement.scrollWidth - innerWidth,
    ok: vis($('#bkLagtTil')), okTekst: vis($('#bkLagtTil')) ? $('#bkLagtTil').innerText.replace(/\s+/g, ' ').trim() : '',
    okVis: vis($('#bkLagtTilVis')), okSms: vis($('#bkLagtTilSms')),
  };
});
const kal = page => page.evaluate(() => {
  const k = document.querySelector('#bkNyKal');
  const dager = [...k.querySelectorAll('.bhq-dv-dag')].map(b => ({ d:b.dataset.date, av:b.disabled, valgt:b.classList.contains('er-valgt'), idag:b.classList.contains('er-idag'),
    bg:getComputedStyle(b).backgroundColor, ring:getComputedStyle(b).boxShadow, farge:getComputedStyle(b).color }));
  const [forrige, neste] = k.querySelectorAll('[data-mon]');
  return { mnd:k.querySelector('.bhq-dv-topp h3')?.textContent, dager, forrigeAv:forrige?.disabled, nesteAv:neste?.disabled,
           cellebredde:Math.round(k.querySelector('.bhq-dv-dag')?.getBoundingClientRect().width || 0),
           over:k.scrollWidth - k.clientWidth, delt:k.classList.contains('bhq-dv'), versjon:window.BhqDatovelger && window.BhqDatovelger.versjon };
});
// Nøytral = gråtone (r=g=b) — ingen blå/aksent i valgt-flate, ring eller tekst.
const graa = c => { const m = String(c).match(/\d+(\.\d+)?/g); if (!m) return true; const [r, g, b] = m.map(Number); return Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2; };
const venteDag = (page, txt) => page.waitForFunction(t => document.querySelector('#bkNyDag').innerText.includes(t), txt, { timeout:4000 }).catch(() => {});
// Velg dato som barberen: åpne velgeren, bla til riktig måned med pilene, trykk dagen.
async function velgDato(page, iso) {
  if (!(await les(page)).kalAapen) await page.click('#bkNyDatoKnapp');
  const maal = iso.slice(0, 7);
  for (let i = 0; i < 14; i++) {
    const cur = await page.$eval('#bkNyKal .bhq-dv-dag', b => b.dataset.date.slice(0, 7));
    if (cur === maal) break;
    await page.click(`#bkNyKal [data-mon="${cur < maal ? 1 : -1}"]`);
  }
  await page.click(`#bkNyKal .bhq-dv-dag[data-date="${iso}"]`);
}
const bilder = [];
async function skjerm(page, navn) {
  // Hele arket skal synes: er det høyere enn 88 % av vinduet, gjøres vinduet høyere for bildet (ingen indre scroll).
  const h = await page.evaluate(() => { const m = document.querySelector('#bkNyBackdrop:not([hidden]) .pause-modal'); return m ? m.scrollHeight : 0; });
  const w = page.viewportSize().width, trengs = Math.ceil(h / 0.88) + 4;
  if (trengs > 844) await page.setViewportSize({ width:w, height:trengs });
  await page.waitForTimeout(250);
  const fil = path.join(OUT, `${navn}.png`); await page.screenshot({ path:fil }); bilder.push(fil);
  if (trengs > 844) await page.setViewportSize({ width:w, height:844 });
}
async function lagreOgVent(page) {
  await page.click('#bkNyLagre');
  await page.waitForFunction(() => document.querySelector('#bkNyBackdrop').hidden, null, { timeout:4000 }).catch(() => {});
  await page.waitForTimeout(150);
}

for (const w of [320, 375]) {
  console.log(`\n@${w} — fra Oversikt`);
  let st = nyState();
  let { ctx, page, errs, lekk } = await aapne(w, st);

  // 1. Tom modal — dempet 00:00, grå knapp
  await page.click('#upLeggTil'); await venteDag(page, 'Ingen bookinger');
  let v = await les(page);
  sjekk(v.aapen && v.dato === IDAG && v.datoTekst === 'Torsdag 12. november', `${w} modalen åpnes med i dag`, `${v.dato} «${v.datoTekst}»`);
  sjekk(v.tidVerdi === '' && v.tidPh && v.tidFarge === 'rgba(0, 0, 0, 0)', `${w} tomt klokkeslett: «00:00» vises, nettleserens tekst er skjult, value tom`, JSON.stringify([v.tidVerdi, v.tidPh, v.tidFarge]));
  sjekk(v.tidPhFarge !== v.inkFarge, `${w} «00:00» er dempet (ikke tekstfargen)`, `${v.tidPhFarge} vs ${v.inkFarge}`);
  sjekk(v.knappAv && v.knapp === 'Legg til booking', `${w} knappen er grå i tom modal`);
  await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Uten Tid');
  v = await les(page);
  sjekk(v.knappAv, `${w} tjeneste + navn uten klokkeslett → knappen fortsatt grå (00:00 teller ikke)`);
  await page.selectOption('#bkNySvc', ''); await page.fill('#bkNyNavn', '');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  v = await les(page);
  sjekk(v.dagTekst.includes('Ingen bookinger eller pauser.') && v.dagTekst.includes('Åpent 10:00–18:00'), `${w} tom dag + åpningstid fra {is_closed,open,close}`, v.dagTekst);
  sjekk(v.hint.includes('Uten nummer får kunden ingen påminnelse eller rebooking.'), `${w} telefonlinja står under feltet`, v.hint);
  sjekk(v.modalOverflow === 0 && v.sideOverflow === 0, `${w} ingen horisontal overflow`, `${v.modalOverflow}/${v.sideOverflow}`);
  await skjerm(page, `1-tom-${w}`);

  // 2. Datovelgeren åpen
  await page.click('#bkNyDatoKnapp'); await page.waitForTimeout(100);
  let k = await kal(page);
  const iDag = k.dager.find(d => d.d === IDAG), iGaar = k.dager.find(d => d.d === '2026-11-11');
  sjekk(k.delt && k.versjon === 1, `${w} velgeren er den delte BhqDatovelger (versjon 1)`, JSON.stringify([k.delt, k.versjon]));
  sjekk(st.dvKall.length >= 2 && st.dvKall.every(u => new URL(u).hostname === 'localhost' && new URL(u).pathname.startsWith('/book/_/datovelger.')),
        `${w} JS + CSS hentes fra eget domene (/book/_/…, Netlify-proxyen)`, JSON.stringify(st.dvKall));
  sjekk((await les(page)).kalAapen && k.mnd === 'November 2026', `${w} datovelgeren åpner på november 2026`, k.mnd);
  sjekk(iDag && iDag.valgt && iDag.idag && !iDag.av && iGaar && iGaar.av, `${w} i dag valgt, i går deaktivert`, JSON.stringify([iDag, iGaar]));
  sjekk(k.forrigeAv && !k.nesteAv, `${w} ← deaktivert i inneværende måned, → aktiv`);
  sjekk(graa(iDag.bg) && graa(iDag.ring) && graa(iDag.farge), `${w} valgt dag er nøytral (grå/hvit, ikke blå/aksent)`, JSON.stringify([iDag.bg, iDag.ring, iDag.farge]));
  sjekk(k.cellebredde >= 30 && k.over === 0, `${w} dagcellene får plass (${k.cellebredde}px), ingen overflow`, JSON.stringify(k));
  sjekk(k.dager.filter(d => d.d < IDAG).every(d => d.av) && k.dager.filter(d => d.d >= IDAG).every(d => !d.av), `${w} alle dager før i dag deaktivert, resten aktive`);
  await skjerm(page, `2-datovelger-aapen-${w}`);

  // 3. Dato valgt — tatte tider
  await velgDato(page, LOR); await venteDag(page, 'Pause');
  v = await les(page);
  sjekk(!v.kalAapen && v.dato === LOR && v.datoTekst === 'Lørdag 14. november', `${w} valgt dag lukker velgeren og står i feltet`, `${v.dato} «${v.datoTekst}»`);
  const forvent = [['10:00–10:30','Herreklipp'],['11:00–11:45','Skin fade'],['12:00–12:30','Pause'],['13:00–14:00','Klipp og skjegg']];
  sjekk(JSON.stringify(v.rader.map(r => [r.t, r.h])) === JSON.stringify(forvent), `${w} tatte tider: tre bookinger + pause (ISO), sortert`, JSON.stringify(v.rader));
  sjekk(v.dagTekst.includes('Åpent 10:00–16:00'), `${w} åpningstiden for dagen vises`, v.dagTekst);
  await skjerm(page, `3-dato-valgt-${w}`);
  await page.selectOption('#bkNySvc', '13');
  v = await les(page);
  sjekk(v.under === 'Varer 60 min' && !v.underFeil && v.knappAv, `${w} tjeneste uten klokkeslett viser varigheten`, v.under);
  const felt = await page.evaluate(() => {
    const s = document.querySelector('#bkNySvc');
    return { hoyder: [...document.querySelectorAll('#bkNyBackdrop .fld input:not([type=hidden]), #bkNyBackdrop .kl-select, #bkNyDatoKnapp')].map(e => Math.round(e.getBoundingClientRect().height)),
             plass: s.clientWidth - 42, tekst: (() => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(s).font;
               return Math.ceil(Math.max(...[...s.options].map(o => c.measureText(o.text).width))); })() };
  });
  sjekk(felt.hoyder.every(h => h === 46), `${w} alle felt er like høye (46px)`, JSON.stringify(felt.hoyder));
  sjekk(felt.tekst <= felt.plass, `${w} lengste tjenestenavn får plass i valget`, JSON.stringify(felt));
  // Raden klokkeslett + tjeneste. Feilen fra ekte iPhone (12.11.2026) — tidsfeltet høyere, lavere og bredere enn
  // kolonnen — kom av iOS Safaris innebygde stil for input[type=time], som Playwright-WebKit på Windows IKKE har.
  // Geometrien under ville derfor vært grønn også før fiksen; det som faktisk vokter er at det native oppsettet
  // er slått av (appearance:none) og at feltet er en blokk-flex. Ekte iOS sjekkes på iPhone, ikke her.
  const rad = await page.evaluate(() => {
    const t = document.querySelector('#bkNyTid'), s = document.querySelector('#bkNySvc'), kol = t.closest('.fld'), d = document.querySelector('#bkNyDatoKnapp');
    const T = t.getBoundingClientRect(), S = s.getBoundingClientRect(), K = kol.getBoundingClientRect(), ts = getComputedStyle(t), ds = getComputedStyle(d), ss = getComputedStyle(s);
    const app = c => c.webkitAppearance || c.appearance;
    return { toppAvvik: Math.abs(T.top - S.top), innenfor: T.right <= K.right + .5 && T.right <= S.left + .5, tidApp: app(ts), tidDisplay: ts.display, svcApp: app(ss), datoApp: app(ds) };
  });
  sjekk(rad.toppAvvik < .6 && rad.innenfor, `${w} klokkeslett og tjeneste står på samme topp, tidsfeltet innenfor kolonnen`, JSON.stringify(rad));
  sjekk(rad.tidApp === 'none' && rad.tidDisplay === 'flex', `${w} tidsfeltet har native oppsett slått av (appearance:none, display:flex)`, JSON.stringify(rad));
  sjekk(rad.svcApp === 'none' && rad.datoApp === 'none', `${w} tjeneste- og datofeltet har native oppsett slått av`, JSON.stringify(rad));

  // 4. Overlapp — 10:45 Skin fade (→ 11:30) kræsjer med Ali 11:00–11:45
  await page.fill('#bkNyTid', '10:45'); await page.selectOption('#bkNySvc', '12'); await page.fill('#bkNyNavn', 'Jonas Berg');
  v = await les(page);
  sjekk(v.under === 'Overlapper med Ali Khan, 11:00–11:45 · Skin fade.' && v.underFeil, `${w} overlapp navngir bookingen, rød`, v.under);
  sjekk(v.knappAv, `${w} knappen er grå ved overlapp`);
  sjekk(v.rader[1] && v.rader[1].kol && v.rader.filter(r => r.kol).length === 1, `${w} kollisjonsraden (11:00) er markert, bare den`);
  await skjerm(page, `4-overlapp-${w}`);

  // 5. Tid valgt — hvit tekst. 10:30 Herreklipp (→ 11:00) er inntil Ali, ikke overlapp.
  await page.fill('#bkNyTid', '10:30'); await page.selectOption('#bkNySvc', '11');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  v = await les(page);
  sjekk(!v.knappAv && v.under === 'Ferdig 11:00 · 30 min' && !v.underFeil, `${w} slutt = neste start er ikke overlapp, knappen virker`, v.under);
  sjekk(v.tidVerdi === '10:30' && !v.tidPh && v.tidFarge === v.inkFarge, `${w} valgt tid står i tekstfargen, «00:00» borte`, JSON.stringify([v.tidVerdi, v.tidPh, v.tidFarge, v.inkFarge]));
  await skjerm(page, `5-tid-valgt-${w}`);
  await page.fill('#bkNyTid', '12:00');
  v = await les(page);
  sjekk(!v.knappAv && v.under === 'Ferdig 12:30 · 30 min · Ligger i pausen.', `${w} pause stopper ikke, bare info`, v.under);

  // 6. 409 — 14:00 er ledig i lista, men noen booket den samtidig
  st.gi409 = true;
  await page.fill('#bkNyTid', '14:00');
  await page.click('#bkNyLagre');
  await venteDag(page, '14:00–14:30'); await page.waitForTimeout(200);
  v = await les(page);
  sjekk(st.posts.length === 1 && JSON.stringify(st.posts[0]) === JSON.stringify({ dato:LOR, klokkeslett:'14:00', service_id:11, customer_name:'Jonas Berg' }),
        `${w} POST-body uten telefon er riktig`, JSON.stringify(st.posts[0]));
  sjekk(v.aapen && v.under === 'Noen booket denne tiden akkurat nå: Sara Lie, 14:00–14:30 · Herreklipp. Velg en annen tid.' && v.underFeil,
        `${w} 409 sier hvem den kræsjer med`, v.under);
  sjekk(v.knappAv && v.knapp === 'Legg til booking', `${w} knappen grå etter 409`);
  sjekk(v.rader.some(r => r.t === '14:00–14:30' && r.kol), `${w} lista viser den nye bookingen, markert`, JSON.stringify(v.rader));
  sjekk(st.dagKall.filter(d => d === LOR).length >= 2, `${w} dagen ble hentet på nytt etter 409`);
  await skjerm(page, `6-409-${w}`);

  // 7a. Varsling MED SMS-linje: telefon + paaminnelse_sendes true
  await page.fill('#bkNyTid', '15:00'); await page.fill('#bkNyTlf', '912 34 567');
  await lagreOgVent(page);
  v = await les(page);
  sjekk(st.posts.at(-1).customer_phone === '912 34 567', `${w} POST-body med telefon`, JSON.stringify(st.posts.at(-1)));
  sjekk(!v.aapen && v.ok && v.okSms && v.okVis && v.okTekst === 'Booking lagt til Kunden får SMS-påminnelse dagen før. Vis i kalender',
        `${w} paaminnelse_sendes true → SMS-linja + «Vis i kalender»`, v.okTekst);
  const kommende = await page.$eval('#upcomingList', e => e.innerText.replace(/\s+/g, ' '));
  // Dagsoverskrift i Kommende er «Lørdag 14. nov» etter Oversikt-redesignet (17.11), før «LØR 14. NOV».
  sjekk(/Lørdag 14\. nov.*15:00 Jonas Berg/.test(kommende), `${w} Kommende viser bookingen med en gang`, kommende.slice(0, 160));
  await skjerm(page, `7-varsling-med-sms-${w}`);

  // 7b. Varsling UTEN SMS-linje: ingen telefon → paaminnelse_sendes false
  await page.click('#upLeggTil'); await venteDag(page, 'Ingen bookinger');
  sjekk(!(await les(page)).ok, `${w} varslingen forsvinner når modalen åpnes igjen`);
  await velgDato(page, LOR); await venteDag(page, 'Pause');
  await page.fill('#bkNyTid', '15:30'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Lars Moe');
  await lagreOgVent(page);
  v = await les(page);
  sjekk(!v.aapen && v.ok && !v.okSms && v.okVis && v.okTekst === 'Booking lagt til Vis i kalender', `${w} uten telefon → bare «Booking lagt til» + «Vis i kalender»`, v.okTekst);
  await skjerm(page, `8-varsling-uten-sms-${w}`);

  // 7c. Telefon, men paaminnelse_sendes false (f.eks. Gratis uten SMS) → heller ingen SMS-linje
  st.paam = false;
  await page.click('#upLeggTil'); await venteDag(page, 'Ingen bookinger');
  await velgDato(page, LOR); await venteDag(page, 'Pause');
  await page.fill('#bkNyTid', '16:00'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Kari Nilsen'); await page.fill('#bkNyTlf', '98765432');
  await lagreOgVent(page);
  v = await les(page);
  sjekk(v.ok && !v.okSms && v.okTekst === 'Booking lagt til Vis i kalender', `${w} telefon + paaminnelse_sendes false → ingen SMS-linje`, v.okTekst);
  await page.click('#bkLagtTilVis'); await page.waitForTimeout(400);
  const kalv = await page.evaluate(() => ({ open:!document.querySelector('#calOverlay').hidden,
    hode:document.querySelector('#calDays .cal-day .cal-dayhead')?.textContent.trim(),
    navn:[...document.querySelectorAll('#calDays .cal-day:first-child .cal-block .blk-name')].map(e => e.textContent) }));
  sjekk(kalv.open && /14\./.test(kalv.hode) && ['Jonas Berg', 'Lars Moe', 'Kari Nilsen'].every(n => kalv.navn.includes(n)), `${w} «Vis i kalender» åpner lørdag 14. med alle tre`, JSON.stringify(kalv));
  sjekk(errs.length === 0, `${w} ingen pageerror (Oversikt)`, errs.join(' | '));
  sjekk(lekk().length === 0, `${w} alle API-kall gikk gjennom mocken (Oversikt)`, lekk().join(' , '));
  await ctx.close();

  // 8. Fra kalenderen, uten telefon
  console.log(`@${w} — fra kalenderen`);
  st = nyState();
  ({ ctx, page, errs, lekk } = await aapne(w, st));
  await page.click('#calOpenUpcoming'); await page.waitForTimeout(300);
  const lorKey = await page.evaluate(() => new Date(2026, 10, 14).getTime());
  await page.click(`.cal-chip[data-key="${lorKey}"]`); await page.waitForTimeout(200);
  const topp = await page.evaluate(() => {
    const bar = document.querySelector('.cal-topbar'), a = document.querySelector('#calAdd').getBoundingClientRect(),
          c = document.querySelector('#calClose').getBoundingClientRect(), t = document.querySelector('#calToday').getBoundingClientRect();
    return { over: bar.scrollWidth - bar.clientWidth, luft: Math.round(c.left - a.right), etterIdag: Math.round(a.left - t.right), aH: Math.round(a.height) };
  });
  sjekk(topp.over === 0 && topp.luft >= 8 && topp.etterIdag >= 8 && topp.aH === 36, `${w} «+» får plass i toppbaren (lørdag + «I dag» synlig)`, JSON.stringify(topp));
  await page.click('#calAdd'); await venteDag(page, 'Pause');
  v = await les(page);
  sjekk(v.aapen && v.dato === LOR, `${w} modalen fra kalenderen har kalenderens dag`, v.dato);
  await page.fill('#bkNyTid', '15:00'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Mona Dahl');
  await lagreOgVent(page);
  v = await les(page);
  const blk = await page.evaluate(() => { const b = [...document.querySelectorAll('#calDays .cal-day:first-child .cal-block')].find(e => e.textContent.includes('Mona Dahl')); return b ? { id:b.dataset.id, top:b.offsetTop, tekst:b.innerText.replace(/\s+/g, ' ') } : null; });
  sjekk(!v.aapen && blk && /15:00–15:30/.test(blk.tekst), `${w} blokka står i kalenderen med en gang`, JSON.stringify(blk));
  sjekk(!('customer_phone' in st.posts.at(-1)), `${w} POST uten telefon-felt når feltet er tomt`, JSON.stringify(st.posts.at(-1)));
  sjekk(v.ok && v.okTekst === 'Booking lagt til' && !v.okVis, `${w} fra kalenderen: «Booking lagt til», uten SMS-linje og uten «Vis i kalender»`, v.okTekst);
  if (blk) { await page.$eval('.cal-scroll', (e, y) => { e.scrollTop = Math.max(0, y - 260); }, blk.top); await page.waitForTimeout(150); }
  await skjerm(page, `9-kalender-etter-lagring-${w}`);

  await page.click(`.cal-block[data-id="${blk ? blk.id : 'n1'}"]`); await page.waitForTimeout(250);
  const det = await page.evaluate(() => { const d = document.querySelector('#bkDetailBackdrop .bk-detail');
    return d ? { tlf: !!d.querySelector('.bk-detail-phone'), tekst: d.innerText.replace(/\s+/g, ' ') } : null; });
  sjekk(det && !det.tlf && det.tekst.includes('Mona Dahl') && !/null|undefined/.test(det.tekst), `${w} detaljflaten uten telefon: ingen lenke, ingen «null»`, JSON.stringify(det));
  sjekk(det && /Pris 350 kr/.test(det.tekst), `${w} Pris fra bookingens price_label`, det && det.tekst);
  sjekk(!(await les(page)).ok, `${w} varslingen skjules når detaljflaten åpnes`);
  const nullNoe = await page.evaluate(() => /\bnull\b|\bundefined\b/.test(document.querySelector('#calOverlay').innerText + ' ' + document.querySelector('#upcomingList').innerText));
  sjekk(!nullNoe, `${w} «null»/«undefined» står ikke i kalenderen eller Kommende`);
  await skjerm(page, `10-detalj-uten-telefon-${w}`);
  sjekk(errs.length === 0, `${w} ingen pageerror (kalender)`, errs.join(' | '));
  sjekk(lekk().length === 0, `${w} alle API-kall gikk gjennom mocken (kalender)`, lekk().join(' , '));
  await ctx.close();
}

// 9. Grenser, sommertid, dagsfeil, økt-vakt (375)
{
  console.log('\ngrenser');
  const st = nyState();
  const { ctx, page, errs } = await aapne(375, st);
  await page.click('#upLeggTil'); await venteDag(page, 'Ingen bookinger');
  const html = fs.readFileSync(path.join(ROOT, 'no/dashboard.html'), 'utf8');
  sjekk(!/tegnKal|kal-dag\b|\.kal-(topp|piler|ukedager|dager)|data-mnd|bknIsoDel/.test(html), 'dashbordet har ingen egen kalender-kopi igjen');
  sjekk(html.includes('src="/book/_/datovelger.js"') && html.includes('href="/book/_/datovelger.css"'), 'dashbordet laster den delte fila fra /book/_/');
  await page.click('#bkNyDatoKnapp');
  for (let i = 0; i < 12; i++) await page.click('#bkNyKal [data-mon="1"]');
  let k = await kal(page);
  const d12 = k.dager.find(d => d.d === '2027-11-12'), d13 = k.dager.find(d => d.d === '2027-11-13');
  sjekk(k.mnd === 'November 2027' && k.nesteAv && !k.forrigeAv, 'grenser: november 2027 er siste måned (→ deaktivert)', JSON.stringify([k.mnd, k.nesteAv, k.forrigeAv]));
  sjekk(d12 && !d12.av && d13 && d13.av && k.dager.filter(d => d.d > '2027-11-12').every(d => d.av), 'grenser: 12.11.2027 lov, 13.11.2027 og senere deaktivert', JSON.stringify([d12, d13]));
  await page.click('#bkNyKal .bhq-dv-dag[data-date="2027-11-12"]'); await venteDag(page, 'Ingen bookinger');
  let v = await les(page);
  sjekk(v.dato === '2027-11-12' && v.datoTekst === 'Fredag 12. november 2027', 'grenser: ett år fram kan velges, året står med', v.datoTekst);
  await velgDato(page, '2027-03-28'); await venteDag(page, 'Ingen bookinger');
  await page.fill('#bkNyTid', '02:30'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Test');
  v = await les(page);
  sjekk(v.under === 'Klokkeslettet finnes ikke denne dagen (sommertid).' && v.knappAv, 'grenser: 28.03.2027 02:30 finnes ikke', v.under);

  // Dagslista feiler → «Prøv igjen» → laster.
  st.dagFeil = true;
  await velgDato(page, LOR); await venteDag(page, 'Klarte ikke');
  v = await les(page);
  sjekk(v.dagTekst.includes('Klarte ikke å hente dagen. Prøv igjen'), 'dagsfeil: feiltekst + «Prøv igjen»', v.dagTekst);
  st.dagFeil = false;
  await page.click('#bkNyDag .retry-lenke'); await venteDag(page, 'Pause');
  v = await les(page);
  sjekk(v.rader.length === 4, 'dagsfeil: «Prøv igjen» henter dagen', JSON.stringify(v.rader.length));

  // Escape lukker datovelgeren først, så modalen.
  await page.click('#bkNyDatoKnapp'); await page.keyboard.press('Escape');
  v = await les(page);
  sjekk(!v.kalAapen && v.aapen, 'Escape: lukker datovelgeren, modalen står');

  // Økt-vakt: modalen lukkes og åpnes på nytt mens lagringen går.
  await velgDato(page, '2026-11-13'); await venteDag(page, 'Herreklipp');
  await page.fill('#bkNyTid', '16:00'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Treg Lagring');
  st.forsinkMs = 900;
  await page.click('#bkNyLagre'); await page.waitForTimeout(100);
  await page.click('#bkNyLukk'); await page.click('#upLeggTil'); await page.waitForTimeout(1400);
  v = await les(page);
  const navn = await page.$eval('#bkNyNavn', e => e.value);
  // I dag og Kommende er to seksjoner etter Oversikt-redesignet — bookingen kan havne i den ene eller den andre.
  const kommende = await page.evaluate(() => document.querySelector('#idagInnhold').innerText + ' ' + document.querySelector('#upcomingList').innerText);
  sjekk(v.aapen && navn === '' && v.knapp === 'Legg til booking' && v.tidPh, 'økt-vakt: den nye modalen står åpen og urørt', JSON.stringify({ aapen:v.aapen, navn, knapp:v.knapp }));
  sjekk(kommende.includes('Treg Lagring'), 'økt-vakt: den lagrede bookingen kom likevel inn i Kommende');
  sjekk(errs.length === 0, 'grenser: ingen pageerror', errs.join(' | '));
  await ctx.close();
}

// 10. Datovelger-fila kommer ikke (API nede): tydelig tekst i rammen, ingen JS-feil, dagens dato står og kan brukes.
{
  console.log('\ndatovelger mangler');
  const st = nyState(); st.dvFeil = true;
  const { ctx, page, errs } = await aapne(375, st);
  await page.click('#upLeggTil'); await venteDag(page, 'Ingen bookinger');
  await page.click('#bkNyDatoKnapp'); await page.waitForTimeout(100);
  const tekst = await page.$eval('#bkNyKal', e => e.innerText.trim());
  sjekk(tekst === 'Klarte ikke å laste datovelgeren. Last inn siden på nytt.', 'mangler: tydelig tekst i stedet for tom ramme', tekst);
  await page.fill('#bkNyTid', '15:00'); await page.selectOption('#bkNySvc', '11'); await page.fill('#bkNyNavn', 'Uten Velger');
  const v = await les(page);
  sjekk(v.dato === IDAG && !v.knappAv, 'mangler: dagens dato står, og bookingen kan lagres', JSON.stringify([v.dato, v.knappAv]));
  sjekk(errs.length === 0, 'mangler: ingen pageerror', errs.join(' | '));
  await ctx.close();
}

await browser.close(); server.close();
console.log('\nBilder:\n' + bilder.join('\n'));
ferdig();
