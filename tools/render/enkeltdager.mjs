// Tjenester & tider → Arbeidstider: modusbryteren («Faste ukedager» | «Tidene mine varierer») og «Enkeltdager»
// (datoavvik, backend 089).
//
// Stateful mock av GET/PUT/DELETE /api/dashboard/date-overrides og GET/PUT /api/dashboard/hours, med dry_run +
// berorte slik backend svarer (date-overrides: { ok, lagret|fjernet, berorte } + dry_run:true; /hours dry_run:
// { ok, dry_run, berorte } — datoer med unntak hoppes over). Catch-all på **/api/**; testen feiler hvis én eneste
// request når api.trybarberhq.com. «Nå» er fryst til tor 26.11.2026 10:00 (Oslo).
//
// Sjekker (exit 1 ved feil):
//   kalender  — mandag først, ukenummer, 44 px celler, ingen overflow @320/375, grenser (inneværende måned / i dag
//               + 400), passerte dager av, status per dag, bookingvinduet + «Kundene kan booke frem til …».
//   sirkel    — ÉN sirkel per dag (bredde = høyde, sentrert over prikken); i dag = ring, valgt = fylt blå,
//               valgt + i dag = fylt + ring utenfor; prikken vises også på valgt dag; ingen fokusring ved trykk.
//   utvalg    — trykk/ukenummer/rad legger til og fjerner, sveip bytter måned, utvalget overlever månedsbytte,
//               arket glir opp uten layoutsprang og innholdet kan scrolles over det.
//   arket     — Åpen | Stengt lagrer ingenting; «Sist brukt» (bare når det finnes) fyller bare Fra/Til;
//               «Lagre N dager» (av uten valg / ved Fra ≥ Til) → dry_run → lagre eller advarsel; «Tilbakestill til
//               faste tider» bare med unntak i utvalget → DELETE dry_run → DELETE; dry_run-feil → ingenting
//               lagres; toast + Angre; pauselinja; regel B (det som er skrevet står til arket lukkes);
//               forhåndsutfylling riktig for alle sju ukedager.
//   modus     — utledes av ukedagstidene; «varierer» → bekreftelse med PUT /hours dry_run-bookinger (+ «Pausene
//               dine fjernes.» bare med pauser) → PUT /hours alle stengt; Faste tider skjult + teksten i Enkeltdager;
//               tilbake til «Faste ukedager» viser tabellen uten å lagre.
//   annet     — «Kommende endringer» uten strek under siste rad, dagTimer() følger unntakene, publiserings-
//               sjekklista teller kommende åpne unntak, lys modus, reduced-motion, hentefeil.
// Skjermbilder → .render-ut/enkeltdager-<bredde>-<tilstand>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const UT = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(UT, { recursive: true });
for (const f of fs.readdirSync(UT)) if (/^enkeltdager-\d+-/.test(f)) fs.unlinkSync(path.join(UT, f));   // ingen gamle bilder
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
const UTEN_PAUSER = HOURS.map(h => ({ ...h, breaks:[] }));
const ALLE_STENGT = HOURS.map(h => ({ ...h, is_closed:true, breaks:[] }));
// Ulike tider per ukedag (forhåndsutfylling for alle sju): man 08–16 … lør 13–21, søn stengt.
const SJU = [1,2,3,4,5,6].map(wd => ({ weekday:wd, is_closed:false, open_time:String(6 + wd + 1).padStart(2, '0') + ':00',
  close_time:String(14 + wd + 1).padStart(2, '0') + ':00', breaks:[] })).concat([{ weekday:0, is_closed:true, open_time:null, close_time:null, breaks:[] }]);
// Bookinger (UTC; CET = UTC+1 i nov/des). Fre 4.12: 11:00 + 14:30. Tor 3.12: 17:30. Søn 6.12: 12:00.
const BOOKINGER = [
  { id:'b1', start:'2026-12-04T10:00:00Z', end:'2026-12-04T10:30:00Z', name:'Ola Nordmann', service:'Skinfade', kilde:'kunde' },
  { id:'b2', start:'2026-12-04T13:30:00Z', end:'2026-12-04T14:15:00Z', name:'Ali Hassan', service:'Klipp + skjegg', kilde:'kunde' },
  { id:'b3', start:'2026-12-03T16:30:00Z', end:'2026-12-03T17:00:00Z', name:'Jonas Berg', service:'Skjegg', kilde:'manuell' },
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
const ukedagAv = d => new Date(d + 'T12:00:00Z').getUTCDay();
// Havner bookingen utenfor tidene {closed} | {open_time, close_time} (+ ukedagens pause)?
function utenfor(b, tid, timer) {
  if (tid.closed || tid.is_closed) return true;
  const s = lokalMin(b.start), e = lokalMin(b.end);
  if (s < hm(tid.open_time) || e > hm(tid.close_time)) return true;
  const p = timer.find(h => h.weekday === ukedagAv(datoAv(b.start)))?.breaks?.[0];
  return !!p && s < hm(p.end_time) && e > hm(p.start_time);
}
const somBerort = b => ({ ...b, dato: datoAv(b.start) });

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FEIL ') + msg); if (!c) fails++; };
const browser = await chromium.launch();

async function aapne(width, opt = {}) {
  const ctx = await browser.newContext({ viewport:{ width, height: opt.hoyde || (width === 320 ? 640 : 760) }, deviceScaleFactor:2,
    reducedMotion: opt.redusert ? 'reduce' : 'no-preference', hasTouch:true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NAA) });
  await page.addInitScript(([lys, sist]) => { try {
    if (lys) localStorage.setItem('bhq-theme', 'light');
    if (sist) localStorage.setItem('bhq-ed-sist', JSON.stringify(sist));
  } catch (_) {} }, [!!opt.lys, opt.sist || null]);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const prod = [], mocket = new Set();
  page.on('request', q => { if (q.url().includes('api.trybarberhq.com')) prod.push(q); });
  const avvik = JSON.parse(JSON.stringify(opt.avvik || {}));
  let timer = JSON.parse(JSON.stringify(opt.hours || HOURS));
  const kall = [];       // skriv mot date-overrides: {m, body}
  const timerKall = [];  // PUT /hours: body
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
      if (body.dry_run && opt.dryFeil) return J({ error:'x' }, 500);
      if (m === 'DELETE') {
        // { ok, fjernet, berorte } (+ dry_run:true, fjernet:0). Bare datoer som HADDE et unntak regnes og fjernes.
        const hadde = body.dates.filter(d => avvik[d]);
        const bf = BOOKINGER.filter(b => hadde.includes(datoAv(b.start)))
          .filter(b => utenfor(b, timer.find(h => h.weekday === ukedagAv(datoAv(b.start))), timer)).map(somBerort);
        if (body.dry_run) return J({ ok:true, dry_run:true, fjernet:0, berorte:bf });
        hadde.forEach(d => delete avvik[d]); return J({ ok:true, fjernet: hadde.length, berorte:bf });
      }
      const b = BOOKINGER.filter(x => body.dates.includes(datoAv(x.start))).filter(x => utenfor(x, body, timer)).map(somBerort);
      if (body.dry_run) return J({ ok:true, dry_run:true, lagret:0, bookinger:b.length, berorte:b });
      body.dates.forEach(d => { avvik[d] = body.closed ? { closed:true, open_time:null, close_time:null }
                                                       : { closed:false, open_time:body.open_time, close_time:body.close_time }; });
      return J({ ok:true, lagret: body.dates.length, bookinger:b.length, berorte:b });
    }
    if (p === '/api/dashboard/hours') {
      if (m === 'GET') return J(timer);
      const body = JSON.parse(q.postData() || '{}'); timerKall.push(body);
      if (body.dry_run) {
        if (opt.timerDryFeil) return J({ error:'x' }, 500);
        // Kommende bookinger som havner utenfor de nye ukedagstidene — datoer med unntak hoppes over.
        const bf = BOOKINGER.filter(b => new Date(b.start) >= new Date(NAA) && !avvik[datoAv(b.start)])
          .filter(b => utenfor(b, body.days.find(d => d.weekday === ukedagAv(datoAv(b.start))), body.days.map(d => ({ ...d, breaks:[] })))).map(somBerort);
        return J({ ok:true, dry_run:true, berorte:bf });
      }
      timer = body.days.map(d => ({ ...d, breaks: (body.breaks || []).filter(x => x.weekday === d.weekday) }));
      return J({ ok:true });
    }
    if (p === '/api/dashboard/booking-settings') return J({ cluster_bookings:false, booking_horizon_days:28 });
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
  return { ctx, page, errs, lekk, kall, timerKall, avvik };
}
const dag = ymd => `#edGrid .ed-dag[data-ymd="${ymd}"]`;
const trykk = async (page, sel) => { await page.click(sel); await page.waitForTimeout(260); };
const vent = (page, ms = 320) => page.waitForTimeout(ms);
const skjult = (page, sel) => page.$eval(sel, e => !e.checkVisibility());   // MÅLT synlighet — author display kan slå [hidden]
const tekst = (page, sel) => page.$eval(sel, e => e.textContent.trim());
async function tilKalender(page) {
  await page.evaluate(() => { const h = document.querySelector('#enkeltdager'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 12); });
  await vent(page, 120);
}
async function tilArbeidstider(page) {
  await page.evaluate(() => { const h = [...document.querySelectorAll('#tjenester .block-h')].find(e => e.textContent.trim() === 'Arbeidstider'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 16); });
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
const celle = (page, ymd) => page.$eval(dag(ymd), b => {
  const n = b.querySelector('.ed-n'), p = b.querySelector('.ed-p'), rn = n.getBoundingClientRect(), rp = p.getBoundingClientRect(), cs = getComputedStyle(n);
  return { c: b.className, dis: b.disabled, h: b.getBoundingClientRect().height, nw: rn.width, nh: rn.height,
    sentrert: Math.abs((rn.left + rn.width / 2) - (rp.left + rp.width / 2)) < 0.6, prikk: getComputedStyle(p).backgroundColor,
    fyll: cs.backgroundColor, ring: cs.boxShadow, omriss: cs.outlineStyle + ' ' + cs.outlineWidth, celleOmriss: getComputedStyle(b).outlineStyle,
    radius: cs.borderTopLeftRadius };
});
const arkInn = page => page.$eval('#edArk', a => a.classList.contains('inn') && !a.inert);
const tittel = page => tekst(page, '#edArkTittel');
const lagreKnapp = page => page.$eval('#edLagre', b => ({ t: b.textContent, av: b.disabled }));
const valgt = page => page.$$eval('.ed-valg [data-ed]', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.ed).join(''));
const tider = page => page.evaluate(() => edFra.value + '–' + edTil.value);
const BLAA = 'rgb(77, 139, 255)', GRONN = 'rgb(62, 207, 126)', TOM = 'rgba(0, 0, 0, 0)';

for (const w of [320, 375]) {
  console.log(`\n@${w}`);
  const D = w === 320 ? 28 : 32;   // sirkeldiameter

  // 1. Tom kalender + sirkelen
  let { ctx, page, errs, lekk, kall, timerKall } = await aapne(w);
  await tilKalender(page);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ov === 0, `ingen horisontal overflow (${ov})`);
  ok(await tekst(page, '#edMnd') === 'November 2026' && await page.$eval('#edForrige', b => b.disabled), 'inneværende måned, ‹ av');
  ok(await page.$$eval('.ed-ukedager span', s => s.map(x => x.textContent).join('')) === 'MTOTFLS', 'mandag først');
  ok(await page.$$eval('#edGrid .ed-uke', u => u.map(x => x.textContent).join(',')) === '44,45,46,47,48,49', 'ukenummer');
  let c = await celle(page, '2026-11-26');
  ok(c.h >= 44, `cellehøyde ${c.h} ≥ 44`);
  ok(c.nw === D && c.nh === D && c.radius === '50%', `én sirkel ${c.nw}×${c.nh} (${D}), border-radius 50%`);
  ok(c.sentrert, 'sirkelen er sentrert over prikken');
  ok(c.c.includes('idag') && c.ring.includes('inset') && c.fyll === TOM, `i dag (ikke valgt) = ring, ingen fyll (${c.ring})`);
  ok(c.prikk === GRONN, `torsdag = grønn prikk (${c.prikk})`);
  ok((await celle(page, '2026-11-25')).dis, 'passert dag er av');
  ok((await celle(page, '2026-11-29')).prikk === TOM, 'søndag (stengt ukedag) = ingen prikk');
  ok(await tekst(page, '#edListe') === 'Ingen kommende endringer.', 'tom liste');
  ok(await tekst(page, '#edHorisont') === 'Kundene kan booke frem til 24. desember.', 'bookingvindu-linja');
  await skjerm(page, w, '01-idag-ikke-valgt');
  for (let i = 0; i < 13; i++) await page.click('#edNeste');
  ok(await tekst(page, '#edMnd') === 'Desember 2027' && await page.$eval('#edNeste', b => b.disabled), '› av i siste måned (des 2027)');
  ok((await celle(page, '2028-01-01')).dis && !(await celle(page, '2027-12-31')).dis, 'i dag + 400 = siste valgbare dag');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();

  // 2. I dag valgt / en annen dag valgt (sirkel, prikk, fokus)
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  const topFoer = await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top);
  ok((await page.$eval('#edArk', a => getComputedStyle(a).transitionDuration)).startsWith('0.2s'), 'arket glir på 200 ms');
  await trykk(page, dag('2026-11-26'));
  ok(await arkInn(page) && await tittel(page) === '1 dag valgt', 'trykk på i dag → «1 dag valgt»');
  ok(Math.abs(await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top) - topFoer) < 0.5, 'ingen layoutsprang når arket åpnes');
  c = await celle(page, '2026-11-26');
  ok(c.fyll === BLAA && c.omriss.startsWith('solid') && c.nw === D, `i dag valgt = fylt blå sirkel + ring utenfor (${c.fyll} / ${c.omriss})`);
  ok(c.prikk === GRONN && c.sentrert, 'prikken vises (statusfarge) og står sentrert under sirkelen også når dagen er valgt');
  ok(c.celleOmriss === 'none', 'ingen fokusramme rundt cellen etter trykk');
  ok(await valgt(page) === '' && JSON.stringify(await lagreKnapp(page)) === '{"t":"Lagre 1 dag","av":true}', '«Lagre 1 dag», av uten valg');
  ok(await skjult(page, '#edTilbake'), '«Tilbakestill til faste tider» skjult uten unntak');
  await radOverArk(page, '2026-11-26');
  await skjerm(page, w, '02-idag-valgt');
  await trykk(page, dag('2026-11-26'));
  await trykk(page, dag('2026-11-27'));
  c = await celle(page, '2026-11-27');
  ok(c.fyll === BLAA && c.omriss.startsWith('none') && c.celleOmriss === 'none', `annen dag valgt = fylt blå, ingen ring, ingen fokusramme (${c.omriss})`);
  ok((await celle(page, '2026-11-26')).fyll === TOM, 'i dag tilbake til bare ring');
  const over = await page.evaluate(() => { scrollTo(0, document.documentElement.scrollHeight); return { a: document.querySelector('#edArk').getBoundingClientRect().top, l: document.querySelector('#bkRegler').getBoundingClientRect().bottom }; });
  ok(over.l <= over.a + 1, 'innholdet kan scrolles fram over arket');
  await tilKalender(page); await radOverArk(page, '2026-11-27');
  await skjerm(page, w, '03-annen-dag-valgt');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 3. Flere dager, Åpen uten/med «Sist brukt», Stengt
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 49"]');
  ok(await tittel(page) === '7 dager valgt', 'ukenummer velger hele uka');
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 48"]');
  ok(await tittel(page) === '11 dager valgt', 'uke 48 legger til bare kommende dager');
  await trykk(page, '#edGrid .ed-uke[aria-label="Uke 48"]');
  ok(await tittel(page) === '7 dager valgt', 'trykk igjen fjerner uka');
  await page.evaluate(() => {
    const f = document.querySelector('#edFlate'), r = f.getBoundingClientRect(), y = r.top + 60;
    const ev = (t, x) => f.dispatchEvent(new PointerEvent(t, { bubbles:true, pointerType:'touch', clientX:x, clientY:y, isPrimary:true }));
    ev('pointerdown', r.right - 30); ev('pointerup', r.left + 30);
  });
  await vent(page);
  ok(await tekst(page, '#edMnd') === 'Desember 2026' && (await celle(page, '2026-12-02')).c.includes('valgt'), 'sveip → desember, utvalget står');
  await page.click('#edForrige'); await vent(page);
  await tilKalender(page); await radOverArk(page, '2026-11-30');
  await skjerm(page, w, '04-flere-dager-valgt');
  await trykk(page, '[data-ed=apen]');
  ok(kall.length === 0, 'Åpen lagrer ingenting');
  ok(!(await skjult(page, '#edTider')) && await skjult(page, '#edChips'), 'Åpen viser Fra/Til; ingen «Sist brukt» uten historikk');
  ok(await tider(page) === '10:00–18:00', 'forhåndsutfylt fra første dags faste tider (man 10–18)');
  ok(await tekst(page, '#edPause') === 'Pause 12:00–12:30 gjelder også på mandager, tirsdager, onsdager, torsdager og fredager.', 'pauselinja for flere dager');
  ok(JSON.stringify(await lagreKnapp(page)) === '{"t":"Lagre 7 dager","av":false}', '«Lagre 7 dager» på');
  await radOverArk(page, '2026-11-30');
  await skjerm(page, w, '05-ark-apen-uten-sist');
  await page.fill('#edFra', '18:00'); await vent(page, 100);
  ok((await lagreKnapp(page)).av, '«Lagre» av når Fra ≥ Til');
  await page.fill('#edFra', '11:00'); await page.fill('#edTil', '21:00'); await vent(page, 100);
  ok(!(await lagreKnapp(page)).av && kall.length === 0, '«Lagre» på igjen; fortsatt ingenting lagret');
  await trykk(page, '#edLagre'); await vent(page, 400);
  ok(kall.map(k => k.m + (k.body.dry_run ? '?' : '')).join() === 'PUT?,PUT' && kall[1].body.open_time === '11:00' && kall[1].body.dates.length === 7, 'Lagre → PUT dry_run, så PUT 11–21 på 7 dager');
  ok(!(await arkInn(page)), 'lagret → arket lukkes (regel B: nullstilles)');
  ok(!(await skjult(page, '#edToast')) && await tekst(page, '#edToastTekst') === 'Lagret', 'toast «Lagret»');
  ok((await celle(page, '2026-11-30')).c.includes('s-egne'), 'dagene viser egne tider');
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-09'));
  await trykk(page, '[data-ed=apen]');
  const sist = await page.$$eval('#edChips > *', c => c.map(x => x.textContent));
  ok(sist.join('|') === 'Sist brukt|11:00–21:00', `«Sist brukt» + 11:00–21:00 (${sist.join('|')})`);
  const n0 = kall.length;
  await trykk(page, '#edChips .ed-chip');
  ok(kall.length === n0 && await tider(page) === '11:00–21:00', 'chip fyller bare Fra/Til — lagrer ingenting');
  await radOverArk(page, '2026-12-09');
  await skjerm(page, w, '06-ark-apen-med-sist');
  await trykk(page, '[data-ed=stengt]');
  ok(kall.length === n0 && await valgt(page) === 'stengt' && await skjult(page, '#edTider') && !(await lagreKnapp(page)).av, 'Stengt: ingen tider, «Lagre 1 dag» på, ingenting lagret');
  await radOverArk(page, '2026-12-09');
  await skjerm(page, w, '07-ark-stengt');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 4. Bookingadvarsel + dry_run-feil
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-04')); await trykk(page, dag('2026-12-05'));
  await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 1 && kall[0].body.dry_run === true && kall[0].body.closed === true, 'Lagre (Stengt) → PUT dry_run');
  const adv = await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent));
  ok(!(await skjult(page, '#edAdvarsel')) && adv.join('|') === 'Ola NordmannFre 4. des · 11:00|Ali HassanFre 4. des · 14:30', `advarsel (${adv.join(' | ')})`);
  ok(await page.$eval('#edAdvListe .ed-adv-rad:last-child', r => getComputedStyle(r).borderBottomWidth) === '0px', 'advarsel: ingen strek under siste rad');
  await radOverArk(page, '2026-12-04');
  await skjerm(page, w, '08-advarsel');
  await trykk(page, '#edAvbryt');
  ok(kall.length === 1 && await valgt(page) === 'stengt' && await tittel(page) === '2 dager valgt', 'Avbryt → ingenting lagret, valget står');
  await trykk(page, '#edLagre'); await vent(page, 300); await trykk(page, '#edLagreLikevel'); await vent(page, 300);
  ok(kall.length === 3 && kall[2].body.dry_run === undefined && kall[2].body.closed === true && !(await arkInn(page)), 'Lagre likevel → PUT, arket lukket');
  await ctx.close();
  ({ ctx, page, kall } = await aapne(w, { dryFeil: true }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-27')); await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 1 && await tekst(page, '#edFeil') === 'Klarte ikke å sjekke bookingene. Prøv igjen' && await arkInn(page), 'dry_run feiler → ingenting lagret, feiltekst, arket står');
  await ctx.close();

  // 5. Angre + «Tilbakestill til faste tider»
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: { '2026-12-06': BLANDET['2026-12-06'] } }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-27')); await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 350);
  ok((await celle(page, '2026-11-27')).c.includes('s-stengt'), 'lagret stengt');
  await skjerm(page, w, '09-toast');
  await trykk(page, '#edAngre'); await vent(page, 300);
  ok(kall.at(-1).m === 'DELETE' && (await celle(page, '2026-11-27')).c.includes('s-faste'), 'Angre → DELETE, dagen tilbake til faste tider');
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-06'));
  ok(!(await skjult(page, '#edTilbake')) && await valgt(page) === 'apen' && await tider(page) === '11:00–15:00', 'dag med egne tider: Åpen + tidene forhåndsutfylt, «Tilbakestill» synlig');
  const n1 = kall.length;
  await trykk(page, '#edTilbake'); await vent(page, 350);
  ok(kall[n1]?.m === 'DELETE' && kall[n1].body.dry_run === true && await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent).join()) === 'Emil StrandSøn 6. des · 12:00', 'Tilbakestill → DELETE dry_run → advarsel (søndag er stengt)');
  await trykk(page, '#edLagreLikevel'); await vent(page, 300);
  ok(kall[n1 + 1]?.m === 'DELETE' && kall[n1 + 1].body.dry_run === undefined && !(await arkInn(page)), 'Lagre likevel → DELETE, arket lukket');
  await trykk(page, '#edAngre'); await vent(page, 300);
  ok(kall.at(-1).m === 'PUT' && kall.at(-1).body.open_time === '11:00', 'Angre → PUT med de gamle egne tidene');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 6. Modus: Faste ukedager → bekreftelse → Tidene mine varierer → tilbake
  ({ ctx, page, errs, lekk, kall, timerKall } = await aapne(w));
  await tilArbeidstider(page);
  ok(await page.$$eval('#atModus [aria-pressed=true]', b => b.map(x => x.dataset.modus).join()) === 'faste' && !(await skjult(page, '#fasteTider')) && await skjult(page, '#edVarier'), 'åpne ukedager → «Faste ukedager», tabellen synlig');
  const klipp = await page.$$eval('#atModus .ovs-seg-btn', b => b.map(x => x.scrollWidth - x.clientWidth));
  ok(klipp.every(x => x <= 0), `modusknappene klipper ikke teksten (${klipp.join(',')})`);
  await skjerm(page, w, '10-modus-faste');
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok(!(await skjult(page, '#atBekreft')), 'varierer → bekreftelsesark');
  ok(await tekst(page, '#atBekreftTekst') === 'Alle faste dager settes som stengt. Du åpner dagene du jobber i kalenderen under. Dager du allerede har lagt inn beholdes. Pausene dine fjernes.', 'bekreftelsesteksten + «Pausene dine fjernes.» (har pauser)');
  ok(timerKall.length === 1 && timerKall[0].dry_run === true && timerKall[0].days.length === 7 && timerKall[0].days.every(d => d.is_closed) && timerKall[0].breaks.length === 0, 'PUT /hours dry_run med alle sju stengt, uten pauser');
  const bk = await page.$$eval('#atBekreftListe .ed-adv-rad', r => r.map(x => x.textContent));
  ok(bk.length === 4 && bk[0] === 'Jonas BergTor 3. des · 17:30' && await tekst(page, '#atBekreftBH') === '4 bookinger havner utenfor', `bookingene listes (${bk.join(' | ')})`);
  await skjerm(page, w, '11-bekreftelse');
  await trykk(page, '#atBekreftAvbryt');
  ok(timerKall.length === 1 && await skjult(page, '#atBekreft') && !(await skjult(page, '#fasteTider')), 'Avbryt → ingenting lagret, Faste ukedager står');
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  await trykk(page, '#atBekreftOk'); await vent(page, 600);
  ok(timerKall.length === 3 && timerKall[2].dry_run === undefined && timerKall[2].days.every(d => d.is_closed), 'Sett som stengt → PUT /hours alle stengt');
  ok(await page.$$eval('#atModus [aria-pressed=true]', b => b.map(x => x.dataset.modus).join()) === 'varierer' && await skjult(page, '#fasteTider') && !(await skjult(page, '#edVarier')), '«Tidene mine varierer»: tabellen skjult, teksten vises');
  ok(await tekst(page, '#edVarier') === 'Ingen dager er åpne før du åpner dem her.', 'teksten i Enkeltdager');
  ok((await celle(page, '2026-11-27')).c.includes('s-stengt'), 'kalenderen: dager uten unntak er stengt');
  await tilArbeidstider(page);
  await skjerm(page, w, '12-modus-varierer');
  await trykk(page, '#atModus [data-modus=faste]');
  ok(timerKall.length === 3 && !(await skjult(page, '#fasteTider')) && await page.$$eval('#hoursList input[type=checkbox]', i => i.every(x => !x.checked)), 'tilbake til «Faste ukedager»: tabellen vises, alle stengt, ingenting lagret');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 7. Blandede statuser, dagTimer, bookingvindu, «Kommende endringer» (ingen dobbel strek)
  ({ ctx, page, errs } = await aapne(w, { avvik: BLANDET }));
  await tilKalender(page);
  ok((await celle(page, '2026-11-28')).prikk === BLAA && (await celle(page, '2026-11-30')).prikk === TOM, 'egne tider = blå prikk, stengt = ingen prikk');
  const dt = await page.evaluate(async () => {
    await calFetch();
    const k = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
    return { stengt: dagTimer(k('2026-11-30')), egne: dagTimer(k('2026-11-28')), vanlig: dagTimer(k('2026-11-27')) };
  });
  ok(dt.stengt.closed && dt.egne.open === 720 && dt.egne.close === 1200 && dt.vanlig.open === 600, 'dagTimer følger unntakene');
  await page.evaluate(() => { const h = document.querySelector('.ed-liste-h'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 40); });
  await vent(page, 120);
  const st = await page.$$eval('#edListe .ed-rad', r => r.map(x => ({ t: x.textContent, b: getComputedStyle(x).borderBottomWidth, o: getComputedStyle(x).borderTopWidth })));
  ok(st.length === 6 && st[0].t === 'Lørdag 28. nov12:00–20:00', 'kommende endringer');
  ok(st.every(x => x.b === '0px') && st[0].o === '0px' && st.slice(1).every(x => x.o === '1px'), 'skillelinje bare mellom rader — ingen under siste');
  await skjerm(page, w, '13-kommende-endringer');
  await page.click('#edNeste'); await vent(page);
  ok((await celle(page, '2026-12-28')).c.includes('vindu') && !(await celle(page, '2026-12-24')).c.includes('vindu'), 'bookingvinduet: 25.12+ dempet, 24.12 ikke');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();
}

// Regel B + forhåndsutfylling for alle sju ukedager (375).
{
  console.log('\nregel B og ukedager');
  let { ctx, page, errs } = await aapne(375);
  await tilKalender(page);
  // Skrevet tid står mens arket er åpent, også når utvalget endres (29 → +26 → −29).
  await trykk(page, dag('2026-11-29')); await trykk(page, '[data-ed=apen]');
  ok(await tider(page) === '10:00–18:00', 'søndag (stengt ukedag), ingen historikk → 10:00–18:00');
  await page.fill('#edTil', '17:00'); await vent(page, 80);
  await trykk(page, dag('2026-11-26')); await trykk(page, dag('2026-11-29'));
  ok(await tider(page) === '10:00–17:00' && await valgt(page) === 'apen', 'regel B: skrevet tid og Åpen står når utvalget endres');
  await trykk(page, '#edFjern');
  await trykk(page, dag('2026-11-26')); await trykk(page, '[data-ed=apen]');
  ok(await tider(page) === '10:00–18:00', 'Fjern valg nullstiller → torsdag forhåndsutfylles 10:00–18:00');
  await trykk(page, '#edFjern');
  // Urørt: forhåndsutfyllingen følger utvalget (29 → +28 gir lørdagens 10–16).
  await trykk(page, dag('2026-11-29')); await trykk(page, '[data-ed=apen]'); await trykk(page, dag('2026-11-28'));
  ok(await tider(page) === '10:00–16:00', 'urørt Fra/Til følger utvalget (første dag lørdag → 10:00–16:00)');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();

  ({ ctx, page, errs } = await aapne(375, { hours: SJU }));
  await tilKalender(page);
  const forventet = ['08:00–16:00', '09:00–17:00', '10:00–18:00', '11:00–19:00', '12:00–20:00', '13:00–21:00', '10:00–18:00'];
  const datoer = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'];
  const navn = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag (stengt → standard)'];
  for (let i = 0; i < 7; i++) {
    await trykk(page, dag(datoer[i])); await trykk(page, '[data-ed=apen]');
    const t = await tider(page);
    ok(t === forventet[i], `forhåndsutfylling ${navn[i]} ${datoer[i]}: ${t}`);
    await trykk(page, '#edFjern');
  }
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();
}

// Modus: utledning, pause-setningen, sjekklista.
{
  console.log('\nmodus og sjekkliste');
  let { ctx, page, timerKall } = await aapne(375, { hours: UTEN_PAUSER });
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok((await tekst(page, '#atBekreftTekst')).endsWith('beholdes.'), 'uten pauser: ingen «Pausene dine fjernes.»');
  await ctx.close();
  ({ ctx, page, timerKall } = await aapne(375, { hours: ALLE_STENGT, avvik: { '2026-11-28': BLANDET['2026-11-28'] } }));
  ok(await page.$$eval('#atModus [aria-pressed=true]', b => b.map(x => x.dataset.modus).join()) === 'varierer' && await skjult(page, '#fasteTider'), 'alle ukedager stengt → «Tidene mine varierer» utledet');
  await trykk(page, '#atModus [data-modus=faste]'); await trykk(page, '#atModus [data-modus=varierer]');
  ok(timerKall.length === 0 && await skjult(page, '#atBekreft') && await skjult(page, '#fasteTider'), 'fram og tilbake når alt er stengt: ingen bekreftelse, ingen lagring');
  const apne = await page.evaluate(async () => { await hentSjekklisteData(); return _sjekkData.apneDager; });
  ok(apne === 1, `sjekklista teller kommende åpent unntak (${apne})`);
  await ctx.close();
  ({ ctx, page } = await aapne(375, { hours: ALLE_STENGT, avvik: { '2026-11-28': { closed:true, open_time:null, close_time:null } } }));
  const ingen = await page.evaluate(async () => { await hentSjekklisteData(); return _sjekkData.apneDager; });
  ok(ingen === 0, `stengt unntak teller ikke (${ingen})`);
  await ctx.close();
  ({ ctx, page } = await aapne(375, { timerDryFeil: true }));
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok(await tekst(page, '#atBekreftFeil') === 'Klarte ikke å sjekke bookingene. Prøv igjen' && await page.$eval('#atBekreftOk', b => b.disabled), 'dry_run-feil i bekreftelsen → «Sett som stengt» av');
  await ctx.close();
}

// Lys modus, reduced motion, hentefeil.
{
  console.log('\nlys / redusert / hentefeil');
  let { ctx, page } = await aapne(375, { avvik: BLANDET, lys: true });
  const lys = [await celle(page, '2026-11-28'), await celle(page, '2026-11-27')];
  ok(lys[0].prikk === 'rgb(37, 99, 235)' && lys[1].prikk === 'rgb(31, 157, 85)', 'lys modus: #2563eb / #1f9d55');
  await ctx.close();
  ({ ctx, page } = await aapne(375, { redusert: true }));
  ok(await page.$eval('#edArk', a => getComputedStyle(a).transitionDuration) === '0s', 'prefers-reduced-motion → ingen overgang');
  await ctx.close();
  ({ ctx, page } = await aapne(375, { getFeil: true }));
  ok((await tekst(page, '#edGrid')).includes('Klarte ikke å laste enkeltdagene.'), 'GET-feil → feiltekst + Prøv igjen');
  await ctx.close();
}

await browser.close(); server.close();
console.log(fails ? `\n${fails} FEIL` : '\nalt ok');
process.exit(fails ? 1 : 0);
