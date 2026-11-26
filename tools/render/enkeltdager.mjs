// Tjenester & tider → Arbeidstider: modusbryteren («Faste ukedager» | «Tidene mine varierer») og «Enkeltdager»
// (datoavvik, backend 089).
//
// Stateful mock av GET/PUT/DELETE /api/dashboard/date-overrides og GET/PUT /api/dashboard/hours, med dry_run +
// berorte slik backend svarer (date-overrides: { ok, lagret|fjernet, berorte } + dry_run:true; /hours dry_run:
// { ok, dry_run, berorte } — datoer med unntak hoppes over). Catch-all på **/api/**; testen feiler hvis én eneste
// request når api.trybarberhq.com. «Nå» er fryst til tor 26.11.2026 10:00 (Oslo).
//
// Sjekker (exit 1 ved feil):
//   kalender  — sju kolonner (ingen ukenummer), mandag først, celler ≥ 44 px høye, ingen overflow, grenser (inneværende måned / i dag + 400),
//               passerte dager av, «Trykk på dagene du vil endre.», bookingvinduet + «Kundene kan booke frem til …».
//   sirkel    — ÉN sirkel per dag; status som fylling (vanlig = svak grønn, endret = svak blå, stengt = ingen +
//               dempet tall), valgt = fylt blå, i dag = ring, valgt + i dag = fylt + ring utenfor; ingen fokusramme
//               ved trykk; forklaringen «Vanlig · Endret · Stengt»; lys modus: mørkt tall på mørkere fylling.
//   arket     — tittel i ord, statuslinja («Vanligvis …» / «Endret: …» / «Dagene har ulike tider nå»), «Jobber | Stengt»,
//               «Fra [ ] til [ ]» uten overlapp, hurtigvalg («Vanlig 10–18» / «Vanlige tider» / ingen + maks to sist
//               brukte som ikke er like de faste; fyller bare feltene), «Lagre» / «Lagre N dager», smart forhåndsvalg,
//               regel B, sju ukedager.
//   lagring   — per dato: resultat lik ukedagens faste → DELETE (bare der unntak finnes), ellers PUT; én lagring kan gi
//               begge, med dry_run for begge og én samlet advarsel; Angre setter alle datoene tilbake; ingenting å
//               endre → ingen kall; unntak lik faste vises som vanlig (kalender, status, liste).
//   modus     — utledning, bekreftelse med PUT /hours dry_run, «Pausene dine fjernes.», Sett som stengt, tilbake.
//   annet     — Faste tider-radene uten overlapp, «Kommende endringer» uten strek under siste rad, dagTimer(),
//               sjekklista, reduced-motion, hentefeil.
// Skjermbilder (Chromium og WebKit med iPhone-profil, 320/375) → .render-ut/enkeltdager-<motor>-<bredde>-<tilstand>.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const UT = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(UT, { recursive: true });
for (const f of fs.readdirSync(UT)) if (/^enkeltdager-/.test(f)) fs.unlinkSync(path.join(UT, f));   // ingen gamle bilder
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
const MOTOR = { chromium: await chromium.launch(), webkit: await webkit.launch() };
const IPHONE = devices['iPhone 13'];

async function aapne(width, opt = {}) {
  const motor = opt.motor || 'chromium';
  const ctx = await MOTOR[motor].newContext({
    ...(motor === 'webkit' ? { userAgent: IPHONE.userAgent, isMobile: true } : {}),
    viewport:{ width, height: opt.hoyde || (width === 320 ? 640 : 760) }, deviceScaleFactor:2,
    reducedMotion: opt.redusert ? 'reduce' : 'no-preference', hasTouch:true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(NAA) });
  await page.addInitScript(([lys, sist]) => { try {
    if (lys) localStorage.setItem('bhq-theme', 'light');
    if (sist) localStorage.setItem('bhq-ed-sist', JSON.stringify(sist));
  } catch (_) {} }, [!!opt.lys, opt.sist || null]);
  // WebKit: «ResizeObserver loop completed …» kommer ustabilt på Tjenester også på HEAD 1172172, uten Enkeltdager-arket
  // (kjent, PLAN.md «Kjent rød … ResizeObserver-løkke på Tjenester»). Bare akkurat den meldingen, bare i WebKit.
  const errs = []; page.on('pageerror', e => { if (motor === 'webkit' && /^ResizeObserver loop completed/.test(e.message)) return; errs.push(e.message); });
  const prod = [], mocket = new Set();
  page.on('request', q => { if (q.url().includes('api.trybarberhq.com')) prod.push(q); });
  const avvik = JSON.parse(JSON.stringify(opt.avvik || {}));
  let timer = JSON.parse(JSON.stringify(opt.hours || HOURS));
  const kall = [], timerKall = [];
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
async function radOverArk(page, ymd) {
  await page.evaluate(y => {
    const r = document.querySelector('#edGrid .ed-dag[data-ymd="' + y + '"]').getBoundingClientRect();
    const a = document.querySelector('#edArk').getBoundingClientRect().top;
    scrollBy(0, r.bottom - a + 14);
  }, ymd);
  await page.waitForTimeout(120);
}
async function skjerm(page, motor, w, navn) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const fil = path.join(UT, `enkeltdager-${motor}-${w}-${navn}.png`);
  await page.screenshot({ path: fil });
  console.log('  → ' + fil);
}
const celle = (page, ymd) => page.$eval(dag(ymd), b => {
  const n = b.querySelector('.ed-n'), rn = n.getBoundingClientRect(), rb = b.getBoundingClientRect(), cs = getComputedStyle(n);
  return { c: b.className, dis: b.disabled, h: rb.height, nw: rn.width, nh: rn.height,
    sentrert: Math.abs((rn.left + rn.width / 2) - (rb.left + rb.width / 2)) < 0.6 && Math.abs((rn.top + rn.height / 2) - (rb.top + rb.height / 2)) < 0.6,
    fyll: cs.backgroundColor, tall: cs.color, ring: cs.boxShadow, omriss: cs.outlineStyle + ' ' + cs.outlineWidth,
    celleOmriss: getComputedStyle(b).outlineStyle, radius: cs.borderTopLeftRadius, prikker: b.querySelectorAll('.ed-p').length };
});
// Fra/Til og Faste tider: ingen felt overlapper, og ingen rad flyter over.
const overlapp = page => page.evaluate(() => {
  const ut = [];
  const vis = e => e.checkVisibility({ visibilityProperty: true });   // også visibility:hidden (lukket ark) = ikke synlig
  const sjekk = (navn, rad, felt) => {
    felt = felt.filter(vis);
    const r = felt.map(f => f.getBoundingClientRect()), rr = rad.getBoundingClientRect();
    for (let i = 1; i < r.length; i++) if (r[i].left < r[i - 1].right - 0.5) ut.push(navn + ': felt ' + i + ' overlapper');
    if (r.length && r[r.length - 1].right > rr.right + 0.5) ut.push(navn + ': går ut av raden');
    if (rad.scrollWidth > rad.clientWidth + 1) ut.push(navn + ': raden flyter over');
  };
  const t = document.querySelector('.ed-tidrad');
  if (t && vis(t)) sjekk('Fra/Til', t, [...t.children]);
  document.querySelectorAll('#hoursList .day').forEach((d, i) => { if (vis(d)) sjekk('Faste tider rad ' + (i + 1), d, [...d.children]); });
  return ut;
});
const arkInn = page => page.$eval('#edArk', a => a.classList.contains('inn') && !a.inert);
const tittel = page => tekst(page, '#edArkTittel');
const status = page => tekst(page, '#edArkStatus');
const lagreKnapp = page => page.$eval('#edLagre', b => ({ t: b.textContent, av: b.disabled }));
const valgt = page => page.$$eval('.ed-valg [data-ed]', b => b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.ed).join(''));
const tider = page => page.evaluate(() => edFra.value + '–' + edTil.value);
const BLAA = 'rgb(77, 139, 255)', TOM = 'rgba(0, 0, 0, 0)', HVIT = 'rgb(255, 255, 255)';
const FYLL_VANLIG = 'rgba(62, 207, 126, 0.18)', FYLL_ENDRET = 'rgba(77, 139, 255, 0.18)';

// ════════════════ Logikk (Chromium, 320 og 375) ════════════════
const velg = async (page, datoer) => { for (const d of datoer) await trykk(page, dag(d)); };
const chips = page => page.$$eval('#edChips .ed-chip', c => c.map(x => x.textContent));
const LIK_FASTE = { '2026-11-27': { closed:false, open_time:'10:00', close_time:'18:00' } };   // gammelt unntak = fredagens faste tider
for (const w of [320, 375]) {
  console.log(`\n@${w}`);
  const D = w === 320 ? 34 : 40;

  // 1. Kalender: sju kolonner, sirkel og fylling
  let { ctx, page, errs, lekk, kall, timerKall } = await aapne(w, { avvik: { ...BLANDET, ...LIK_FASTE } });
  await tilKalender(page);
  ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) === 0, 'ingen horisontal overflow');
  ok(await tekst(page, '#edMnd') === 'November 2026' && await page.$eval('#edForrige', b => b.disabled), 'inneværende måned, ‹ av');
  ok(await page.$$eval('.ed-ukedager span', s => s.map(x => x.textContent).join('')) === 'MTOTFLS', 'sju ukedager, mandag først');
  ok(await page.$$eval('#edGrid > *', k => k.length % 7 === 0 && k.every(x => x.classList.contains('ed-dag'))) && await page.$$eval('.ed-uke', u => u.length) === 0, 'ingen ukenummer-kolonne');
  ok(await page.$eval('#edGrid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length) === 7, 'grid med sju kolonner');
  ok(await tekst(page, '.ed-hint') === 'Trykk på dagene du vil endre.', '«Trykk på dagene du vil endre.»');
  ok((await page.$$eval('.ed-forkl > span', s => s.map(x => x.textContent.replace(/8/g, '').trim()).join(' '))) === 'Vanlig · Endret · Stengt', 'forklaringen');
  let c = await celle(page, '2026-11-26');
  ok(c.h >= 44 && c.nw === D && c.nh === D && c.radius === '50%' && c.sentrert, `større sirkel ${c.nw}×${c.nh} (${D}), celle ${c.h} px høy`);
  const bredde = await page.$eval(dag('2026-11-26'), b => b.getBoundingClientRect().width);
  ok(bredde >= 38, `trykkflate ${Math.round(bredde)}×${c.h} (hele cellen)`);
  ok(c.ring.includes('inset') && c.fyll === FYLL_VANLIG && c.tall === HVIT, 'i dag (vanlig): ring + svak grønn fylling');
  ok((await celle(page, '2026-11-28')).fyll === FYLL_ENDRET, 'endret: svak blå fylling');
  ok((await celle(page, '2026-11-30')).fyll === TOM && (await celle(page, '2026-11-29')).fyll === TOM, 'stengt: ingen fylling');
  ok((await celle(page, '2026-11-27')).fyll === FYLL_VANLIG, 'unntak lik de faste tidene vises som vanlig, ikke endret');
  ok(!(await page.$$eval('#edListe .ed-rad', r => r.map(x => x.dataset.ymd))).includes('2026-11-27'), '… og står ikke i «Kommende endringer»');
  const dt = await page.evaluate(async () => {
    await calFetch();
    const k = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
    return { stengt: dagTimer(k('2026-11-30')), egne: dagTimer(k('2026-11-28')) };
  });
  ok(dt.stengt.closed && dt.egne.open === 720 && dt.egne.close === 1200, 'dagTimer følger unntakene');
  const st = await page.$$eval('#edListe .ed-rad', r => r.map(x => ({ b: getComputedStyle(x).borderBottomWidth, o: getComputedStyle(x).borderTopWidth })));
  ok(st.length === 6 && st.every(x => x.b === '0px') && st.slice(1).every(x => x.o === '1px'), '«Kommende endringer»: linje bare mellom rader');
  ok(await page.$$eval('#edListe .ed-p', p => p.every(x => x.getBoundingClientRect().width === 5)), '«Kommende endringer»: markøren vises');
  await page.click('#edNeste'); await vent(page);
  ok((await celle(page, '2026-12-28')).c.includes('vindu') && (await celle(page, '2026-12-28')).fyll === FYLL_VANLIG, 'etter bookingvinduet: dempet, fyllingen står');
  for (let i = 0; i < 12; i++) await page.click('#edNeste');
  ok(await page.$eval('#edNeste', b => b.disabled) && (await celle(page, '2028-01-01')).dis && !(await celle(page, '2027-12-31')).dis, 'siste måned / i dag + 400');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 2. Én dag: tittel, status, «Jobber | Stengt», hurtigvalg
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: { ...BLANDET, ...LIK_FASTE } }));
  await tilKalender(page);
  const topFoer = await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top);
  await trykk(page, dag('2026-11-26'));
  ok(Math.abs(await page.$eval('#enkeltdager', e => e.getBoundingClientRect().top) - topFoer) < 0.5, 'ingen layoutsprang');
  ok(await tittel(page) === 'Torsdag 26. november' && await status(page) === 'Vanligvis 10:00–18:00', 'én dag: tittel + «Vanligvis 10:00–18:00»');
  ok(await page.$$('#edSporsmal').then(x => x.length) === 0, 'spørsmålet er borte');
  ok(await page.$$eval('.ed-valg [data-ed]', b => b.map(x => x.textContent).join('|')) === 'Jobber|Stengt', 'segmentet «Jobber | Stengt»');
  ok(await valgt(page) === 'apen' && await tider(page) === '10:00–18:00' && JSON.stringify(await lagreKnapp(page)) === '{"t":"Lagre","av":false}', 'åpen dag: Jobber + tidene, «Lagre» klar');
  ok((await chips(page)).join('|') === 'Vanlig 10–18', `hurtigvalg «Vanlig 10–18», ingen etikett (${(await chips(page)).join('|')})`);
  ok(await page.$$('#edTilbake').then(x => x.length) === 0, '«Bruk vanlige tider» er borte');
  c = await celle(page, '2026-11-26');
  ok(c.fyll === BLAA && c.omriss.startsWith('solid') && c.celleOmriss === 'none', 'i dag valgt: fylt blå + ring utenfor, ingen fokusramme');
  ok((await overlapp(page)).length === 0, 'Fra/Til overlapper ikke');
  await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 0 && !(await arkInn(page)), 'vanlig dag lagret uendret → ingen kall, arket lukket');
  await trykk(page, dag('2026-11-27'));
  ok(await status(page) === 'Vanligvis 10:00–18:00', 'unntak lik faste: statuslinja sier «Vanligvis», ikke «Endret»');
  await trykk(page, dag('2026-11-27'));
  await trykk(page, dag('2026-11-29'));
  ok(await status(page) === 'Vanligvis stengt' && await valgt(page) === 'apen' && await tider(page) === '10:00–18:00', 'stengt søndag: Jobber + vanligste tider');
  ok((await chips(page)).length === 0 && await skjult(page, '#edChips'), 'stengt ukedag uten historikk: ingen hurtigvalg');
  await trykk(page, dag('2026-11-29'));
  await trykk(page, dag('2026-11-28'));
  ok(await status(page) === 'Endret: 12:00–20:00' && await tider(page) === '12:00–20:00' && (await chips(page)).join() === 'Vanlig 10–16', 'endret lørdag: tidene + «Vanlig 10–16»');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 3. Flere dager: titler (uten ukenummer), sveip, hurtigvalg med ulike faste, Lagre
  ({ ctx, page, errs, lekk, kall } = await aapne(w));
  await tilKalender(page);
  const UKE49 = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'];
  await velg(page, UKE49);
  ok(await tittel(page) === '7 dager: 30. nov – 6. des' && await status(page) === 'Dagene har ulike tider nå', 'sju sammenhengende dager');
  ok(await valgt(page) === '' && (await lagreKnapp(page)).av, 'blanding av åpne og stengte: ingenting valgt');
  await page.evaluate(() => {
    const f = document.querySelector('#edFlate'), r = f.getBoundingClientRect(), y = r.top + 60;
    const ev = (t, x) => f.dispatchEvent(new PointerEvent(t, { bubbles:true, pointerType:'touch', clientX:x, clientY:y, isPrimary:true }));
    ev('pointerdown', r.right - 30); ev('pointerup', r.left + 30);
  });
  await vent(page);
  ok(await tekst(page, '#edMnd') === 'Desember 2026' && (await celle(page, '2026-12-02')).c.includes('valgt'), 'sveip → desember, utvalget står');
  await velg(page, ['2026-12-14', '2026-12-16']);
  ok(await tittel(page) === '9 dager valgt' && await tekst(page, '#edArkDatoer') === '30. nov, 1. des, 2. des …', 'ikke sammenhengende: «9 dager valgt» + datoene');
  await velg(page, ['2026-12-14', '2026-12-16']);
  await trykk(page, '[data-ed=apen]');
  ok((await chips(page)).join('|') === 'Vanlige tider', 'ulike faste tider: hurtigvalg «Vanlige tider»');
  ok(await tekst(page, '#edPause') === 'Pause 12:00–12:30 gjelder også på mandager, tirsdager, onsdager, torsdager og fredager.', 'pauselinja');
  await page.fill('#edFra', '11:00'); await page.fill('#edTil', '21:00'); await vent(page, 100);
  ok(kall.length === 0 && JSON.stringify(await lagreKnapp(page)) === '{"t":"Lagre 7 dager","av":false}', '«Lagre 7 dager», ingenting lagret ennå');
  await trykk(page, '#edLagre'); await vent(page, 400);
  ok(kall.map(k => k.m + (k.body.dry_run ? '?' : '')).join() === 'PUT?,PUT' && kall[1].body.dates.length === 7, '11–21 ≠ faste på alle → PUT dry_run, så PUT på 7');
  await velg(page, ['2026-12-01', '2026-12-02', '2026-12-03']);
  ok(await status(page) === 'Endret: 11:00–21:00' && await tider(page) === '11:00–21:00', 'like endrede tider: Jobber + tidene');
  ok((await chips(page)).join('|') === 'Vanlig 10–18|11:00–21:00', `hurtigvalg: vanlig først, så sist brukt (${(await chips(page)).join('|')})`);
  await trykk(page, dag('2026-12-08'));
  ok(await valgt(page) === 'apen' && await tider(page) === '–' && (await lagreKnapp(page)).av, 'ulike åpne tider: Jobber, tomme felt, «Lagre» av');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 4. Forhåndsvalg med «Sist brukt», Stengt på stengt ukedag uten unntak = ingenting å lagre
  ({ ctx, page, kall } = await aapne(w, { sist: [{ open:'09:00', close:'15:00' }, { open:'10:00', close:'18:00' }, { open:'08:00', close:'12:00' }] }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-29'));
  ok(await tider(page) === '09:00–15:00', 'stengt dag: sist brukte tider først');
  ok((await chips(page)).join('|') === '09:00–15:00|10:00–18:00', 'stengt ukedag: ingen «Vanlig»-chip, maks to sist brukte');
  await trykk(page, dag('2026-11-29')); await trykk(page, dag('2026-11-27'));
  ok((await chips(page)).join('|') === 'Vanlig 10–18|09:00–15:00|08:00–12:00', 'sist brukte lik de faste (10–18) vises ikke som egen chip');
  await trykk(page, '#edChips .ed-chip:nth-child(2)');
  ok(kall.length === 0 && await tider(page) === '09:00–15:00', 'chip fyller bare feltene');
  await trykk(page, '#edFjern'); await trykk(page, dag('2026-11-29'));
  await trykk(page, '[data-ed=stengt]');
  ok(await valgt(page) === 'stengt' && await skjult(page, '#edTider'), 'Stengt: ingen tider');
  await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 0 && !(await arkInn(page)), 'Stengt på stengt ukedag uten unntak → ingenting å lagre, ingen kall');
  await ctx.close();

  // 5. Lagreregelen per dato: lik faste → DELETE, ellers PUT — begge med dry_run og én samlet advarsel; Angre alle
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: { '2026-11-28': BLANDET['2026-11-28'], '2026-12-05': { closed:false, open_time:'12:00', close_time:'14:00' } } }));
  await tilKalender(page);
  // Endret lørdag 28. → «Vanlig 10–16» → bare DELETE.
  await trykk(page, dag('2026-11-28'));
  await trykk(page, '#edChips .ed-chip');
  ok(await tider(page) === '10:00–16:00', '«Vanlig 10–16» fyller feltene');
  await trykk(page, '#edLagre'); await vent(page, 400);
  ok(kall.map(k => k.m + (k.body.dry_run ? '?' : '')).join() === 'DELETE?,DELETE' && kall[1].body.dates.join() === '2026-11-28', 'lik faste → DELETE dry_run + DELETE, ingen PUT');
  ok((await celle(page, '2026-11-28')).c.includes('s-faste') && !(await page.$$eval('#edListe .ed-rad', r => r.map(x => x.dataset.ymd))).includes('2026-11-28'), 'dagen er vanlig igjen, borte fra listen');
  await trykk(page, '#edAngre'); await vent(page, 300);
  ok(kall.at(-1).m === 'PUT' && kall.at(-1).body.open_time === '12:00' && (await celle(page, '2026-11-28')).c.includes('s-egne'), 'Angre → PUT 12–20 tilbake');
  // Tre datoer, tre ukedager, 10–16: lørdag 5. (har unntak 12–14) = faste → DELETE; tor 3./fre 4. → PUT.
  await page.click('#edNeste'); await vent(page);
  const n0 = kall.length;
  await velg(page, ['2026-12-03', '2026-12-04', '2026-12-05']);
  await page.fill('#edFra', '10:00'); await page.fill('#edTil', '16:00'); await vent(page, 100);
  await trykk(page, '#edLagre'); await vent(page, 400);
  const nye = kall.slice(n0);
  const putDry = nye.find(k => k.m === 'PUT' && k.body.dry_run), delDry = nye.find(k => k.m === 'DELETE' && k.body.dry_run);
  ok(putDry?.body.dates.join() === '2026-12-03,2026-12-04' && delDry?.body.dates.join() === '2026-12-05' && nye.length === 2, `én lagring → PUT dry_run (3., 4.) + DELETE dry_run (5.) (${nye.map(k => k.m + (k.body.dry_run ? '?' : '') + ':' + k.body.dates.join('/')).join(' ')})`);
  const adv = await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent));
  ok(!(await skjult(page, '#edAdvarsel')) && adv.join('|') === 'Jonas BergTor 3. des · 17:30', `samlet advarsel (${adv.join(' | ')})`);
  await trykk(page, '#edLagreLikevel'); await vent(page, 400);
  const lagret = kall.slice(n0 + 2);
  ok(lagret.map(k => k.m + ':' + k.body.dates.join('/')).join(' ') === 'PUT:2026-12-03/2026-12-04 DELETE:2026-12-05' && lagret.every(k => k.body.dry_run === undefined), 'Lagre likevel → PUT (3., 4.) + DELETE (5.)');
  ok((await celle(page, '2026-12-05')).c.includes('s-faste') && (await celle(page, '2026-12-03')).c.includes('s-egne'), 'kalenderen: 5. vanlig, 3. endret');
  const n1 = kall.length;
  await trykk(page, '#edAngre'); await vent(page, 400);
  const angret = kall.slice(n1).map(k => k.m + ':' + k.body.dates.join('/') + (k.body.open_time ? ':' + k.body.open_time + '-' + k.body.close_time : '')).sort().join(' ');
  ok(angret === 'DELETE:2026-12-03/2026-12-04 PUT:2026-12-05:12:00-14:00', `Angre setter alle tre tilbake (${angret})`);
  // Stengt på søndag med unntak (11–15 i BLANDET? her: ingen) → via «Vanlige tider» på fre+lør med unntak.
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 6. «Vanlige tider» (ulike faste) → teksten i feltene → DELETE for datoene med unntak; Stengt på stengt ukedag med unntak
  ({ ctx, page, errs, lekk, kall } = await aapne(w, { avvik: { '2026-12-04': { closed:true, open_time:null, close_time:null }, '2026-12-05': { closed:false, open_time:'12:00', close_time:'14:00' }, '2026-12-06': BLANDET['2026-12-06'] } }));
  await tilKalender(page);
  await page.click('#edNeste'); await vent(page);
  await velg(page, ['2026-12-04', '2026-12-05']);
  await trykk(page, '[data-ed=apen]');
  ok((await chips(page)).join() === 'Vanlige tider', 'fre + lør: «Vanlige tider»');
  await trykk(page, '#edChips .ed-chip');
  ok(!(await skjult(page, '#edVanlige')) && await skjult(page, '#edFra') && await tekst(page, '#edVanlige') === 'Vanlige tider', 'feltene viser «Vanlige tider»');
  ok(JSON.stringify(await lagreKnapp(page)) === '{"t":"Lagre 2 dager","av":false}' && await skjult(page, '#edPause'), '«Lagre 2 dager» klar, ingen pauselinje');
  await trykk(page, '#edLagre'); await vent(page, 400);
  ok(kall.map(k => k.m + (k.body.dry_run ? '?' : '') + ':' + k.body.dates.join('/')).join(' ') === 'DELETE?:2026-12-04/2026-12-05 DELETE:2026-12-04/2026-12-05', 'Vanlige tider → DELETE for begge');
  await trykk(page, dag('2026-12-06'));
  await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 400);
  const k6 = kall.slice(2);
  ok(k6[0]?.m === 'DELETE' && k6[0].body.dry_run && await page.$$eval('#edAdvListe .ed-adv-rad', r => r.map(x => x.textContent).join()) === 'Emil StrandSøn 6. des · 12:00', 'Stengt på stengt søndag med unntak → DELETE dry_run → advarsel');
  await trykk(page, '#edLagreLikevel'); await vent(page, 300);
  ok(kall.at(-1).m === 'DELETE' && kall.at(-1).body.dry_run === undefined, 'Lagre likevel → DELETE');
  // Tilbake fra «Vanlige tider» til klokkeslett.
  await velg(page, ['2026-12-11', '2026-12-12']);
  await trykk(page, '[data-ed=apen]'); await trykk(page, '#edChips .ed-chip'); await trykk(page, '#edVanlige');
  ok(!(await skjult(page, '#edFra')) && await tider(page) === '–' && (await lagreKnapp(page)).av, 'trykk på «Vanlige tider» → tomme klokkeslett');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();

  // 7. Bookingadvarsel (Stengt fre+lør) + dry_run-feil
  ({ ctx, page, kall } = await aapne(w));
  await tilKalender(page);
  await page.click('#edNeste'); await vent(page);
  await velg(page, ['2026-12-04', '2026-12-05']);
  await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 1 && kall[0].m === 'PUT' && kall[0].body.dry_run && (await page.$$eval('#edAdvListe .ed-adv-rad', r => r.length)) === 2, 'Stengt på åpne dager → PUT dry_run → advarsel');
  await trykk(page, '#edAvbryt');
  ok(kall.length === 1 && await valgt(page) === 'stengt', 'Avbryt → ingenting lagret');
  await ctx.close();
  ({ ctx, page, kall } = await aapne(w, { dryFeil: true }));
  await tilKalender(page);
  await trykk(page, dag('2026-11-27')); await trykk(page, '[data-ed=stengt]'); await trykk(page, '#edLagre'); await vent(page, 300);
  ok(kall.length === 1 && await tekst(page, '#edFeil') === 'Klarte ikke å sjekke bookingene. Prøv igjen', 'dry_run feiler → ingenting lagret');
  await ctx.close();

  // 8. Modus + Faste tider uten overlapp
  ({ ctx, page, errs, lekk, timerKall } = await aapne(w));
  await tilArbeidstider(page);
  ok((await overlapp(page)).length === 0, 'Faste tider: ingen overlapp');
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok((await tekst(page, '#atBekreftTekst')).endsWith('Pausene dine fjernes.') && timerKall[0]?.dry_run === true, 'bekreftelse + PUT /hours dry_run');
  await trykk(page, '#atBekreftOk'); await vent(page, 600);
  ok(timerKall.at(-1).dry_run === undefined && await skjult(page, '#fasteTider'), 'Sett som stengt → varierer');
  ok(errs.length === 0 && lekk().length === 0, `ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();
}

// Regel B + forhåndsutfylling for alle sju ukedager (375).
{
  console.log('\nregel B og ukedager');
  let { ctx, page, errs } = await aapne(375);
  await tilKalender(page);
  await trykk(page, dag('2026-11-29'));
  await page.fill('#edTil', '17:00'); await vent(page, 80);
  await trykk(page, dag('2026-11-26')); await trykk(page, dag('2026-11-29'));
  ok(await tider(page) === '10:00–17:00' && await valgt(page) === 'apen', 'regel B: skrevet tid står når utvalget endres');
  await trykk(page, '#edFjern');
  await trykk(page, dag('2026-11-26'));
  ok(await tider(page) === '10:00–18:00', 'Fjern valg nullstiller → torsdag 10:00–18:00');
  await trykk(page, '#edFjern');
  await trykk(page, dag('2026-11-28'));
  ok(await tider(page) === '10:00–16:00', 'urørt: lørdag 10:00–16:00');
  await trykk(page, dag('2026-11-27')); await trykk(page, dag('2026-11-28'));
  ok(await tider(page) === '10:00–18:00', 'urørt Fra/Til følger utvalget (lørdag ut → fredag 10:00–18:00)');
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();

  ({ ctx, page, errs } = await aapne(375, { hours: SJU }));
  await tilKalender(page);
  const forventet = ['08:00–16:00', '09:00–17:00', '10:00–18:00', '11:00–19:00', '12:00–20:00', '13:00–21:00', '08:00–16:00'];
  const datoer = ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'];
  const navn = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag (stengt → vanligste, likt antall → først i uka)'];
  for (let i = 0; i < 7; i++) {
    await trykk(page, dag(datoer[i]));
    const t = await tider(page);
    ok(t === forventet[i] && await valgt(page) === 'apen', `forhåndsutfylling ${navn[i]} ${datoer[i]}: ${t}`);
    await trykk(page, '#edFjern');
  }
  ok(errs.length === 0, `ingen pageerror (${errs.join(' | ')})`);
  await ctx.close();
}

// Modus: utledning, pause-setningen, sjekklista. Lys modus, reduced motion, hentefeil.
{
  console.log('\nmodus, sjekkliste, lys, redusert, hentefeil');
  let { ctx, page, timerKall } = await aapne(375, { hours: UTEN_PAUSER });
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok((await tekst(page, '#atBekreftTekst')).endsWith('beholdes.'), 'uten pauser: ingen «Pausene dine fjernes.»');
  await ctx.close();
  ({ ctx, page, timerKall } = await aapne(375, { hours: ALLE_STENGT, avvik: { '2026-11-28': BLANDET['2026-11-28'] } }));
  ok(await page.$$eval('#atModus [aria-pressed=true]', b => b.map(x => x.dataset.modus).join()) === 'varierer', 'alle stengt → «Tidene mine varierer»');
  ok(await page.evaluate(async () => { await hentSjekklisteData(); return _sjekkData.apneDager; }) === 1, 'sjekklista teller kommende åpent unntak');
  await ctx.close();
  ({ ctx, page } = await aapne(375, { timerDryFeil: true }));
  await trykk(page, '#atModus [data-modus=varierer]'); await vent(page, 300);
  ok(await page.$eval('#atBekreftOk', b => b.disabled), 'dry_run-feil i bekreftelsen → «Sett som stengt» av');
  await ctx.close();
  ({ ctx, page } = await aapne(375, { avvik: BLANDET, lys: true }));
  const lv = await celle(page, '2026-11-27'), le = await celle(page, '2026-11-28');
  ok(lv.fyll === 'rgba(31, 157, 85, 0.16)' && le.fyll === 'rgba(37, 99, 235, 0.14)' && lv.tall === 'rgb(10, 10, 10)', `lys: mørkere fylling, mørkt tall (${lv.fyll} / ${le.fyll} / ${lv.tall})`);
  await ctx.close();
  ({ ctx, page } = await aapne(375, { redusert: true }));
  ok(await page.$eval('#edArk', a => getComputedStyle(a).transitionDuration) === '0s', 'prefers-reduced-motion → ingen overgang');
  await ctx.close();
  ({ ctx, page } = await aapne(375, { getFeil: true }));
  ok((await tekst(page, '#edGrid')).includes('Klarte ikke å laste enkeltdagene.'), 'GET-feil → feiltekst');
  await ctx.close();
}

// ════════════════ Skjermbilder: Chromium + WebKit (iPhone-profil), 320 og 375 ════════════════
for (const motor of ['chromium', 'webkit']) for (const w of [320, 375]) {
  console.log(`\nskjermbilder ${motor} @${w}`);
  for (const lys of [false, true]) {
    const { ctx, page, errs } = await aapne(w, { motor, avvik: BLANDET, lys });
    await tilKalender(page);
    await skjerm(page, motor, w, lys ? '1b-kalender-lys' : '1a-kalender-mork');
    ok(errs.length === 0, `${motor}@${w} ${lys ? 'lys' : 'mørk'}: ingen pageerror (${errs.join(' | ')})`);
    await ctx.close();
  }
  const { ctx, page, errs, lekk } = await aapne(w, { motor, avvik: BLANDET, sist: [{ open:'11:00', close:'19:00' }] });
  await tilKalender(page);
  await trykk(page, dag('2026-11-27')); await radOverArk(page, '2026-11-27');
  ok((await overlapp(page)).length === 0, `${motor}@${w}: Fra/Til overlapper ikke`);
  await skjerm(page, motor, w, '2-vanlig-dag');
  await trykk(page, '#edFjern');
  await trykk(page, dag('2026-11-28')); await radOverArk(page, '2026-11-28');
  await skjerm(page, motor, w, '3-endret-dag');
  await trykk(page, '#edFjern');
  await trykk(page, dag('2026-11-29')); await radOverArk(page, '2026-11-29');
  await skjerm(page, motor, w, '4-stengt-dag');
  await trykk(page, '#edFjern');
  // Flere dager med ulike faste tider: fre 4. (10–18) + lør 5. (10–16).
  await page.click('#edNeste'); await vent(page);
  await trykk(page, dag('2026-12-04')); await trykk(page, dag('2026-12-05'));
  await radOverArk(page, '2026-12-04');
  await skjerm(page, motor, w, '5-flere-dager-ulike-faste');
  await trykk(page, '#edChips .ed-chip[data-vanlige]'); await radOverArk(page, '2026-12-04');
  await skjerm(page, motor, w, '6-vanlige-tider-valgt');
  await trykk(page, '#edFjern');
  await tilArbeidstider(page);
  await page.evaluate(() => scrollBy(0, 70)); await vent(page, 100);
  ok((await overlapp(page)).length === 0, `${motor}@${w}: Faste tider — ingen overlapp`);
  await skjerm(page, motor, w, '7-faste-tider');
  ok(errs.length === 0 && lekk().length === 0, `${motor}@${w}: ingen pageerror / prod-kall (${errs.join(' | ')} ${lekk().join(' , ')})`);
  await ctx.close();
}

await MOTOR.chromium.close(); await MOTOR.webkit.close(); server.close();
console.log(fails ? `\n${fails} FEIL` : '\nalt ok');
process.exit(fails ? 1 : 0);
