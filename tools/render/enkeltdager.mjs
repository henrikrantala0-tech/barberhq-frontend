// Tjenester & tider → Arbeidstider → «Enkeltdager» (datoavvik, backend 089).
//
// Stateful mock av GET/PUT/DELETE /api/dashboard/date-overrides, inkludert dry_run + berorte (backend-kontrakten
// i barberhq-backend src/routes/dashboard.js «Datoavvik» + src/lib/datoavvik.js). Catch-all på **/api/**, og
// testen feiler hvis én eneste request når api.trybarberhq.com. «Nå» er fryst til tor 26.11.2026 10:00 (Oslo).
//
// Sjekker (exit 1 ved feil):
//   kalender  — mandag først, ukenummer, 44 px celler, ingen horisontal overflow @320/375, ‹ av i inneværende
//               måned, › av i siste måned (i dag + 400), passerte dager av, i dag = ring, status per dag
//               (faste/egne/stengt), dager etter bookingvinduet dempet + «Kundene kan booke frem til …».
//   utvalg    — trykk legger til/fjerner, ukenummer velger kommende dager i uka (og fjerner dem igjen), sveip
//               bytter måned, utvalget overlever månedsbytte, arket glir opp (200 ms, reduced-motion: 0) uten at
//               noe over flytter seg, og kalenderen kan scrolles fram over arket.
//   lagring   — Stengt/chip: PUT dry_run først, så PUT; Faste tider: DELETE dry_run først, så DELETE (berorte
//               regnet mot ukedagstidene); manuell tid → «Lagre» (av når Fra ≥ Til); berørte bookinger → advarsel med
//               «Lagre likevel»/«Avbryt»; dry_run-feil → ingenting lagres + feiltekst; toast «Lagret» + Angre
//               setter dagene tilbake; pauselinja; forhåndsutfylling; «Kommende endringer» velger dagen.
//   kalender  — bookingkalenderens dagTimer() følger unntakene (stengt / egne tider).
// Skjermbilder → .render-ut/enkeltdager-<bredde>-<tilstand>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const UT = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(UT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const NAA = '2026-11-26T10:00:00+01:00';   // torsdag, uke 48
const bill = { subscription_status:'active', effective_plan:'vekst', effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false };
// Man–fre 10–18 med pause 12:00–12:30, lør 10–16, søn stengt.
const PAUSE = { start_time:'12:00', end_time:'12:30' };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday:wd, is_closed:false, open_time:'10:00', close_time:'18:00', breaks:[{ weekday:wd, ...PAUSE }] }))
  .concat([{ weekday:6, is_closed:false, open_time:'10:00', close_time:'16:00', breaks:[] },
           { weekday:0, is_closed:true, open_time:null, close_time:null, breaks:[] }]);
// Bookinger (UTC; CET = UTC+1 i nov/des). Fre 4.12: 11:00 + 14:30. Tor 3.12: 17:30.
const BOOKINGER = [
  { id:'b1', start:'2026-12-04T10:00:00Z', end:'2026-12-04T10:30:00Z', name:'Ola Nordmann', service:'Skinfade', kilde:'kunde' },
  { id:'b2', start:'2026-12-04T13:30:00Z', end:'2026-12-04T14:15:00Z', name:'Ali Hassan', service:'Klipp + skjegg', kilde:'kunde' },
  { id:'b3', start:'2026-12-03T16:30:00Z', end:'2026-12-03T17:00:00Z', name:'Jonas Berg', service:'Skjegg', kilde:'manuell' },
  // Søn 6.12 12:00 — søndag er stengt i Faste tider, så «Faste tider» på 6.12 berører denne.
  { id:'b4', start:'2026-12-06T11:00:00Z', end:'2026-12-06T11:30:00Z', name:'Emil Strand', service:'Skinfade', kilde:'kunde' },
];
const BLANDET = {
  '2026-11-28': { closed:false, open_time:'12:00', close_time:'20:00' },
  '2026-11-30': { closed:true, open_time:null, close_time:null },
  '2026-12-01': { closed:true, open_time:null, close_time:null },
  '2026-12-02': { closed:true, open_time:null, close_time:null },
  '2026-12-06': { closed:false, open_time:'11:00', close_time:'15:00' },
  '2026-12-12': { closed:false, open_time:'10:00', close_time:'14:00' },
};
const lokalMin = iso => { const d = new Date(iso); return ((d.getUTCHours() + 1) % 24) * 60 + d.getUTCMinutes(); };
const hm = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const datoAv = iso => new Date(new Date(iso).getTime() + 3600e3).toISOString().slice(0, 10);
function berorte(dates, body) {
  return BOOKINGER.filter(b => dates.includes(datoAv(b.start))).filter(b => {
    if (body.closed) return true;
    const s = lokalMin(b.start), e = lokalMin(b.end);
    if (s < hm(body.open_time) || e > hm(body.close_time)) return true;
    const wd = new Date(datoAv(b.start) + 'T12:00:00Z').getUTCDay();
    const p = HOURS.find(h => h.weekday === wd)?.breaks?.[0];
    return !!p && s < hm(p.end_time) && e > hm(p.start_time);
  }).map(b => ({ ...b, dato: datoAv(b.start) }));
}
// DELETE (tilbake til Faste tider): hver dato regnes mot sin ukedag i HOURS — som backend.
function berorteFaste(dates) {
  return dates.flatMap(d => {
    const h = HOURS.find(x => x.weekday === new Date(d + 'T12:00:00Z').getUTCDay());
    return berorte([d], h.is_closed ? { closed:true } : { closed:false, open_time:h.open_time, close_time:h.close_time });
  });
}

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FEIL ') + msg); if (!c) fails++; };
const browser = await chromium.launch();

async function aapne(width, opt = {}) {
  const ctx = await browser.newContext({ viewport:{ width, height: opt.hoyde || (width === 320 ? 640 : 760) }, deviceScaleFactor:2,
    reducedMotion: opt.redusert ? 'reduce' : 'no-preference', hasTouch:true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NAA) });
  if (opt.lys) await page.addInitScript(() => { try { localStorage.setItem('bhq-theme', 'light'); } catch (_) {} });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const prod = [], mocket = new Set();
  page.on('request', q => { if (q.url().includes('api.trybarberhq.com')) prod.push(q); });
  const avvik = JSON.parse(JSON.stringify(opt.avvik || {}));
  const kall = [];   // {m, body} for date-overrides-skriv
  await page.route('**/api/**', route => {
    mocket.add(route.request());
    const q = route.request(), u = new URL(q.url()), p = u.pathname, m = q.method();
    const J = (o, s = 200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/date-overrides') {
      if (m === 'GET') {
        if (opt.getFeil) return J({ error:'x' }, 500);
        const fra = u.searchParams.get('from'), til = u.searchParams.get('to');
        return J({ overrides: Object.keys(avvik).sort().filter(d => d >= fra && d <= til).map(d => ({ date:d, ...avvik[d] })) });
      }
      const body = JSON.parse(q.postData() || '{}'); kall.push({ m, body });
      if (m === 'DELETE') {
        // Backend-formen: { ok, fjernet, berorte } (+ dry_run:true, fjernet:0). Bare datoer som faktisk HADDE et unntak
        // regnes (og fjernes) — en dato uten unntak følger allerede ukedagen.
        const hadde = body.dates.filter(d => avvik[d]);
        const bf = berorteFaste(hadde);
        if (body.dry_run) return opt.dryFeil ? J({ error:'x' }, 500) : J({ ok:true, dry_run:true, fjernet:0, berorte:bf });
        hadde.forEach(d => delete avvik[d]); return J({ ok:true, fjernet: hadde.length, berorte:bf });
      }
      if (body.dry_run && opt.dryFeil) return J({ error:'x' }, 500);
      const b = berorte(body.dates, body);
      if (body.dry_run) return J({ ok:true, dry_run:true, lagret:0, bookinger:b.length, berorte:b });
      body.dates.forEach(d => { avvik[d] = body.closed ? { closed:true, open_time:null, close_time:null }
                                                       : { closed:false, open_time:body.open_time, close_time:body.close_time }; });
      return J({ ok:true, lagret: body.dates.length, bookinger:b.length, berorte:b });
    }
    if (p === '/api/dashboard/booking-settings') return J({ cluster_bookings:false, booking_horizon_days:28 });
    if (p === '/api/dashboard/hours') return J(HOURS);
    if (p === '/api/dashboard/billing/status') return J(bill);
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber', booking_horizon_days:28 });
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
    if (p === '/api/dashboard/services') return J({ hoved:[{ id:1, name:'Skinfade', price:450, duration:30, sort:0 }], tillegg:[] });
    if (p === '/api/dashboard/settings') return J({ payment_methods:[] });
    if (p === '/api/dashboard/google/status') return J({ connected:false, scope_ok:true, missing_scopes:[] });
    if (p === '/api/dashboard/bookings') return J(BOOKINGER.map(b => ({ ...b, status:'bekreftet' })));
    return J(/images|recent|winback|referrals|customers|attribution/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.$eval('button[data-panel="tjenester"]', b => b.click());
  await page.waitForSelector(opt.getFeil ? '#edGrid .wb-empty' : '#edGrid .ed-dag');
  await page.waitForTimeout(400);
  const lekk = () => prod.filter(q => !mocket.has(q)).map(q => q.method() + ' ' + q.url());
  return { ctx, page, errs, lekk, kall, avvik };
}
const dag = ymd => `#edGrid .ed-dag[data-ymd="${ymd}"]`;
const trykk = async (page, sel) => { await page.click(sel); await page.waitForTimeout(260); };
const vent = (page, ms = 320) => page.waitForTimeout(ms);
async function tilKalender(page) {
  await page.evaluate(() => { const h = document.querySelector('#enkeltdager'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 12); });
  await vent(page, 120);
}
// Scroller så raden med ymd står rett over arkets topp (valgte dager synlige sammen med arket).
async function radOverArk(page, ymd) {
  await page.evaluate(y => {
    const r = document.querySelector('#edGrid .ed-dag[data-ymd="' + y + '"]').getBoundingClientRect();
    const a = document.querySelector('#edArk').getBoundingClientRect().top;
    scrollBy(0, r.bottom - a + 14);
  }, ymd);
  await page.waitForTimeout(120);
}
async function skjerm(page, w, navn) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fil = path.join(UT, `enkeltdager-${w}-${navn}.png`);
  await page.screenshot({ path: fil });
  console.log('  → ' + fil);
}
const celle = (page, ymd) => page.$eval(dag(ymd), b => ({ c: b.className, dis: b.disabled, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width,
  prikk: getComputedStyle(b.querySelector('.ed-p')).backgroundColor, ring: getComputedStyle(b.querySelector('.ed-n')).boxShadow }));
const arkInn = page => page.$eval('#edArk', a => a.classList.contains('inn') && !a.inert);
const skjult = (page, sel) => page.$eval(sel, e => !e.checkVisibility());   // MÅLT synlighet — author display kan slå [hidden]
const tittel = page => page.$eval('#edArkTittel', e => e.textContent);

for (const w of [320, 375]) {
  console.log(`\n@${w}`);

  // 1. Tom kalender
  let { ctx, page, errs, lekk, kall } = await aapne(w);
  await tilKalender(page);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ov === 0, `ingen horisontal overflow (${ov})`);
  ok(await page.$eval('#edMnd', e => e.textContent) === 'November 2026', 'viser inneværende måned');
  ok(await page.$eval('#edForrige', b => b.disabled), '‹ er av i inneværende måned');
  const hd = await page.$$eval('.ed-ukedager span', s => s.map(x => x.textContent).join(''));
  ok(hd === 'MTOTFLS', `mandag først (${hd})`);
  const uker = await page.$$eval('#edGrid .ed-uke', u => u.map(x => x.textContent).join(','));
  ok(uker === '44,45,46,47,48,49', `ukenummer (${uker})`);
  let c = await celle(page, '2026-11-26');
  ok(c.h >= 44, `cellehøyde ${c.h} ≥ 44`);
  ok(c.c.includes('idag') && c.ring !== 'none', 'i dag har ring');
  ok(c.c.includes('s-faste') && c.prikk === 'rgb(62, 207, 126)', `torsdag = grønn prikk (${c.prikk})`);
  c = await celle(page, '2026-11-25');
  ok(c.dis && c.c.includes('forbi'), 'passert dag er av');
  c = await celle(page, '2026-11-29');
  ok(c.c.includes('s-stengt') && c.prikk === 'rgba(0, 0, 0, 0)', 'søndag (stengt ukedag) = ingen prikk');
  ok(await page.$eval('#edListe', e => e.textContent.trim()) === 'Ingen kommende endringer.', 'tom liste');
  ok(await page.$eval('#edHorisont', e => e.textContent) === 'Kundene kan booke frem til 24. desember.', 'bookingvindu-linja');
  await skjerm(page, w, '1-tom');

  // Siste måned: › av ved i dag + 400 (= 31.12.2027).
  for (let i = 0; i < 13; i++) await page.click('#edNeste');
  ok(await page.$eval('#edMnd', e => e.textContent) === 'Desember 2027' && await page.$eval('#edNeste', b => b.disabled), '› av i siste måned (des 2027)');
  ok((await celle(page, '2028-01-01')).dis, 'dag etter i dag + 400 (1.1.2028) er av');
  ok(!(await celle(page, '2027-12-31')).dis, 'i dag + 400 (31.12.2027) kan velges');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();

  // 2. Blandede statuser (+ desember med bookingvinduet)
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: BLANDET }));
  await tilKalender(page);
  c = await celle(page, '2026-11-28'); ok(c.c.includes('s-egne') && c.prikk === 'rgb(77, 139, 255)', `egne tider = blå prikk (${c.prikk})`);
  c = await celle(page, '2026-11-30'); ok(c.c.includes('s-stengt') && c.prikk === 'rgba(0, 0, 0, 0)', 'stengt unntak = dempet uten prikk');
  await skjerm(page, w, '2-blandet');
  // dagTimer i bookingkalenderen følger unntakene.
  const dt = await page.evaluate(async () => {
    await calFetch();   // bookingkalenderens egen henting (hentAvvik + /hours)
    const k = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
    return { stengt: dagTimer(k('2026-11-30')), egne: dagTimer(k('2026-11-28')), vanlig: dagTimer(k('2026-11-27')) };
  });
  ok(dt.stengt.closed === true, 'dagTimer: stengt unntak → stengt (mandag)');
  ok(dt.egne.open === 720 && dt.egne.close === 1200, `dagTimer: egne tider 12–20 i stedet for lørdagens 10–16 (${JSON.stringify(dt.egne)})`);
  ok(dt.vanlig.open === 600 && dt.vanlig.close === 1080, 'dagTimer: dag uten unntak følger ukedagen');
  await page.click('#edNeste'); await vent(page);
  c = await celle(page, '2026-12-28');
  ok(c.c.includes('vindu') && !c.dis, 'dag etter bookingvinduet: dempet, men kan velges');
  ok(!(await celle(page, '2026-12-24')).c.includes('vindu'), '24.12 (siste bookbare) ikke dempet');
  await skjerm(page, w, '3-desember-vindu');
  // Liste over kommende endringer
  await page.click('#edForrige'); await vent(page);
  await page.evaluate(() => { const h = document.querySelector('.ed-liste-h'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 140); });
  await vent(page, 120);
  const rader = await page.$$eval('#edListe .ed-rad', r => r.map(x => x.textContent));
  ok(rader.length === 6 && rader[0] === 'Lørdag 28. nov12:00–20:00' && rader[1] === 'Mandag 30. novStengt', `kommende endringer (${rader.slice(0, 2).join(' | ')})`);
  await skjerm(page, w, '4-liste');
  // Trykk på rad (desember) → blar dit og velger dagen.
  await page.click('#edListe .ed-rad[data-ymd="2026-12-12"]'); await vent(page);
  ok(await page.$eval('#edMnd', e => e.textContent) === 'Desember 2026' && (await celle(page, '2026-12-12')).c.includes('valgt'), 'rad i lista velger dagen og blar til måneden');
  ok(await arkInn(page), 'arket åpent etter valg fra lista');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 3. Én dag valgt (har egne tider → forhåndsutfylt)
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: BLANDET }));
  await tilKalender(page);
  const topFoer = await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top);
  const transDur = await page.$eval('#edArk', a => getComputedStyle(a).transitionDuration);
  ok(transDur.startsWith('0.2s'), `arket glir på 200 ms (${transDur})`);
  await trykk(page, dag('2026-11-28'));
  ok(await arkInn(page) && await tittel(page) === '1 dag valgt', 'ett trykk → arket «1 dag valgt»');
  const topEtter = await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top);
  ok(Math.abs(topEtter - topFoer) < 0.5, `ingen layoutsprang når arket åpnes (${topFoer} → ${topEtter})`);
  const f1 = await page.evaluate(() => ({ fra: edFra.value, til: edTil.value, apen: document.querySelector('[data-ed=apen]').getAttribute('aria-pressed'), tider: document.querySelector('#edTider').checkVisibility(), lagre: document.querySelector('#edLagre').checkVisibility() }));
  ok(f1.fra === '12:00' && f1.til === '20:00' && f1.apen === 'true' && f1.tider && !f1.lagre, `egne tider forhåndsutfylt, Åpen valgt, ingen Lagre (${JSON.stringify(f1)})`);
  ok(await page.$eval('#edFra', i => i.step) === '900', 'step 900');
  // Kalenderen kan scrolles fram over arket: bunnen av lista kommer over arkets topp.
  const over = await page.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); const a = document.querySelector('#edArk').getBoundingClientRect().top; const l = document.querySelector('#bkRegler').getBoundingClientRect().bottom; return { a, l }; });
  ok(over.l <= over.a + 1, `innholdet kan scrolles fram over arket (${Math.round(over.l)} ≤ ${Math.round(over.a)})`);
  await tilKalender(page); await radOverArk(page, '2026-11-28');
  await skjerm(page, w, '5-en-dag');
  await trykk(page, dag('2026-11-28'));
  await vent(page, 260);
  ok(!(await arkInn(page)), 'trykk igjen fjerner dagen → arket lukkes');
  await ctx.close();

  // 4. Flere dager + tidsvelger (ukenummer 49, Åpen, manuell endring)
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 49"]');
  ok(await tittel(page) === '7 dager valgt', `ukenummer velger hele uka (${await tittel(page)})`);
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 48"]');
  ok(await tittel(page) === '11 dager valgt', `uke 48 legger til bare kommende dager (26.–29.) (${await tittel(page)})`);
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 48"]');
  ok(await tittel(page) === '7 dager valgt', 'trykk igjen fjerner uka');
  // Sveip venstre → desember; utvalget står.
  await page.evaluate(() => {
    const f = document.querySelector('#edFlate'), r = f.getBoundingClientRect(), y = r.top + 60;
    const ev = (t, x) => f.dispatchEvent(new PointerEvent(t, { bubbles:true, pointerType:'touch', clientX:x, clientY:y, isPrimary:true }));
    ev('pointerdown', r.right - 30); ev('pointerup', r.left + 30);
  });
  await vent(page);
  ok(await page.$eval('#edMnd', e => e.textContent) === 'Desember 2026', 'sveip venstre → neste måned');
  ok((await celle(page, '2026-12-02')).c.includes('valgt'), 'utvalget overlever månedsbytte');
  await page.click('#edGrid .ed-uke[aria-label="Uke 51"]'); await vent(page);
  ok(await tittel(page) === '14 dager valgt', `flere uker over måneder (${await tittel(page)})`);
  await page.click('#edGrid .ed-uke[aria-label="Uke 51"]'); await vent(page);
  await page.click('#edForrige'); await vent(page);
  await trykk(page, '[data-ed=apen]');
  ok(!(await skjult(page, '#edTider')), 'Åpen viser Fra/Til');
  const chips = await page.$$eval('#edChips .ed-chip', c => c.map(x => x.textContent));
  ok(chips.includes('10:00–18:00') && chips.includes('10:00–16:00'), `chips med faste tider (${chips.join(', ')})`);
  ok(await page.$eval('#edPause', p => p.textContent) === 'Pause 12:00–12:30 gjelder også på mandager, tirsdager, onsdager, torsdager og fredager.', `pauselinja for flere dager (${await page.$eval('#edPause', p => p.textContent)})`);
  await page.fill('#edFra', '18:00'); await vent(page, 100);
  ok(!(await skjult(page, '#edLagre')) && await page.$eval('#edLagre', b => b.disabled), '«Lagre» vises og er av når Fra ≥ Til');
  await page.fill('#edFra', '14:00'); await page.fill('#edTil', '21:00'); await vent(page, 100);
  ok(!(await page.$eval('#edLagre', b => b.disabled)), '«Lagre» på når Fra < Til');
  ok(kall.length === 0, 'manuell endring lagrer ingenting før «Lagre»');
  ok((await skjult(page, '#edPause')), 'pauselinja borte når pausen ligger utenfor Fra–Til');
  await page.fill('#edFra', '11:00'); await vent(page, 100);
  ok(await page.$eval('#edPause', p => p.textContent).then(t => t.startsWith('Pause 12:00–12:30')), 'pauselinja tilbake når pausen faller innenfor');
  await tilKalender(page); await radOverArk(page, '2026-11-30');
  await skjerm(page, w, '6-flere-tider');
  // «Lagre» 11:00–21:00 på uke 49: alle tre bookingene ligger innenfor og utenom pausen → dry_run tom → PUT.
  await trykk(page, '#edLagre'); await vent(page, 400);
  ok(kall[0]?.body.dry_run === true && kall[0].body.open_time === '11:00' && kall[0].body.close_time === '21:00' && kall[0].body.dates.length === 7, `Lagre → PUT dry_run først (${JSON.stringify(kall[0]?.body).slice(0, 90)})`);
  ok(kall.length === 2 && kall[1].m === 'PUT' && kall[1].body.dry_run === undefined, 'ingen berørte → PUT uten dry_run');
  ok(await arkInn(page) && await skjult(page, '#edLagre'), 'Åpen lagret: arket står, «Lagre» borte');
  ok((await celle(page, '2026-11-30')).c.includes('s-egne'), 'dagene viser egne tider');
  const sist = await page.$$eval('#edChips .ed-chip', c => c.map(x => x.textContent));
  ok(sist[0] === '11:00–21:00', `sist brukte tider først blant chipene (${sist.join(', ')})`);
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 5. Bookingadvarsel (Stengt på fre 4.12 med to bookinger) + dry_run-feil
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-04'));
  await trykk(page, dag('2026-12-05'));
  await trykk(page, '[data-ed=stengt]'); await vent(page, 300);
  ok(kall.length === 1 && kall[0].body.dry_run === true && kall[0].body.closed === true, 'Stengt → PUT dry_run');
  ok(!(await skjult(page, '#edAdvarsel')), 'berørte bookinger → advarsel i arket');
  const adv = await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent));
  ok(adv.length === 2 && adv[0] === 'Ola NordmannFre 4. des · 11:00' && adv[1] === 'Ali HassanFre 4. des · 14:30', `advarselen lister dato, tid, navn (${adv.join(' | ')})`);
  ok(await page.$eval('.ed-adv-s', p => p.textContent) === 'Bookingene avlyses ikke automatisk.', 'advarselsteksten');
  await radOverArk(page, '2026-12-04');
  await skjerm(page, w, '7-advarsel');
  await trykk(page, '#edAvbryt');
  ok(kall.length === 1 && !(await skjult(page, '#edHoved')) && await tittel(page) === '2 dager valgt', 'Avbryt → ingenting lagret, utvalget står');
  await trykk(page, '[data-ed=stengt]'); await vent(page, 300);
  await trykk(page, '#edLagreLikevel'); await vent(page, 300);
  ok(kall.length === 3 && kall[2].m === 'PUT' && kall[2].body.dry_run === undefined && kall[2].body.closed === true, 'Lagre likevel → PUT uten dry_run');
  ok(!(await arkInn(page)), 'Stengt lagret → utvalget tømt og arket lukket');
  ok((await celle(page, '2026-12-04')).c.includes('s-stengt'), 'dagen oppdatert til stengt');
  await ctx.close();

  // dry_run-feil → ingenting lagres
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { dryFeil: true }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-27'));
  await trykk(page, '[data-ed=stengt]'); await vent(page, 300);
  ok(kall.length === 1 && kall[0].body.dry_run === true, 'dry_run feiler → ingen ekte PUT');
  ok((await page.$eval('#edFeil', e => e.textContent)) === 'Klarte ikke å sjekke bookingene. Prøv igjen', `feiltekst (${await page.$eval('#edFeil', e => e.textContent)})`);
  ok(await arkInn(page), 'arket står åpent med feilen');
  await ctx.close();

  // 6. Toast med Angre (Stengt på dag uten bookinger) + Faste tider + chip
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: { '2026-12-06': BLANDET['2026-12-06'] } }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-27'));
  await trykk(page, '[data-ed=stengt]'); await vent(page, 350);
  ok(kall.map(k => k.m + (k.body.dry_run ? '?' : '')).join(',') === 'PUT?,PUT', 'Stengt uten berørte → dry_run, så PUT');
  ok(!(await skjult(page, '#edToast')) && await page.$eval('#edToastTekst', t => t.textContent) === 'Lagret', 'toast «Lagret»');
  ok((await celle(page, '2026-11-27')).c.includes('s-stengt'), 'dagen viser stengt');
  await skjerm(page, w, '8-toast');
  await trykk(page, '#edAngre'); await vent(page, 300);
  ok(kall.at(-1).m === 'DELETE' && kall.at(-1).body.dates.join() === '2026-11-27', 'Angre på dag uten unntak → DELETE');
  ok((await celle(page, '2026-11-27')).c.includes('s-faste'), 'Angre setter dagen tilbake til faste tider');
  // Chip lagrer direkte
  await trykk(page, dag('2026-11-28'));
  await trykk(page, '[data-ed=apen]');
  const n0 = kall.length;
  await trykk(page, '#edChips .ed-chip[data-open="10:00"][data-close="18:00"]'); await vent(page, 350);
  ok(kall.length === n0 + 2 && kall[n0].body.dry_run && kall[n0 + 1].body.open_time === '10:00' && kall[n0 + 1].body.close_time === '18:00', 'chip → dry_run + PUT med chip-tidene');
  ok(await arkInn(page), 'Åpen lagret → arket står (kan justeres)');
  ok((await celle(page, '2026-11-28')).c.includes('s-egne'), 'lørdag 28. = egne tider');
  // Faste tider på søndag 6.12 (stengt ukedag, Emil 12:00) → DELETE dry_run → advarsel → «Lagre likevel» → DELETE.
  await trykk(page, '#edFjern');
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-06'));
  const n1 = kall.length;
  await trykk(page, '[data-ed=faste]'); await vent(page, 350);
  ok(kall.length === n1 + 1 && kall[n1].m === 'DELETE' && kall[n1].body.dry_run === true && kall[n1].body.dates.join() === '2026-12-06',
     `Faste tider → DELETE dry_run (${kall.slice(n1).map(k => k.m + (k.body.dry_run ? '?' : '')).join(',')})`);
  const advF = await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent));
  ok(!(await skjult(page, '#edAdvarsel')) && advF.join() === 'Emil StrandSøn 6. des · 12:00', `berørt booking ved Faste tider → advarsel (${advF.join(' | ')})`);
  await trykk(page, '#edLagreLikevel'); await vent(page, 300);
  ok(kall.length === n1 + 2 && kall[n1 + 1].m === 'DELETE' && kall[n1 + 1].body.dry_run === undefined, 'Lagre likevel → DELETE uten dry_run');
  ok(!(await arkInn(page)) && (await celle(page, '2026-12-06')).c.includes('s-stengt'), 'Faste tider lagret → arket lukket, søndag 6.12 stengt (ukedagen)');
  await trykk(page, '#edAngre'); await vent(page, 300);
  ok(kall.at(-1).m === 'PUT' && kall.at(-1).body.open_time === '11:00' && kall.at(-1).body.close_time === '15:00', 'Angre → PUT med de gamle egne tidene');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  ok(lekk().length === 0, `alle API-kall besvart av mocken, ingen til prod (${lekk().join(' , ')})`);
  await ctx.close();

  // Lys modus (blandet) — mørkere prikkfarger.
  ({ ctx, page, errs } = await aapne(w, { avvik: BLANDET, lys: true }));
  await tilKalender(page);
  c = await celle(page, '2026-11-28'); const cg = await celle(page, '2026-11-27');
  ok(c.prikk === 'rgb(37, 99, 235)' && cg.prikk === 'rgb(31, 157, 85)', `lys modus: blå #2563eb / grønn #1f9d55 (${c.prikk} / ${cg.prikk})`);
  await skjerm(page, w, '9-blandet-lys');
  await ctx.close();
}

// Reduced motion: arket uten overgang.
{
  console.log('\nredusert bevegelse');
  const { ctx, page } = await aapne(375, { redusert: true });
  ok(await page.$eval('#edArk', a => getComputedStyle(a).transitionDuration) === '0s', 'prefers-reduced-motion → ingen overgang på arket');
  await ctx.close();
}
// GET-feil → feilstate med «Prøv igjen».
{
  console.log('\nhentefeil');
  const { ctx, page } = await aapne(375, { getFeil: true }).catch(async () => ({}));
  if (page) {
    ok((await page.$eval('#edGrid', g => g.textContent)).includes('Klarte ikke å laste enkeltdagene.'), 'GET-feil → «Klarte ikke å laste enkeltdagene.» + Prøv igjen');
    await ctx.close();
  } else ok(false, 'hentefeil-siden åpnet ikke');
}

await browser.close(); server.close();
console.log(fails ? `\n${fails} FEIL` : '\nalt ok');
process.exit(fails ? 1 : 0);
