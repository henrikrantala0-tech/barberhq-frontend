// Oversikt-redesign (17.11.2026) — render + vakter for hele Oversikt-fanen.
//
// Kilde: oversikt-vekst / oversikt-gratis (.dc.html, Henrik). Tre rammefrie seksjoner: I DAG → KOMMENDE → NØKKELTALL
// («Hentet inn av BarberHQ» er fjernet 27.11.2026 — tallene står i Vekst-kortet på Konto, se konto-vekst.mjs).
// Testen tegner tre tilstander på 320/375/1280 i mørk OG lys modus, og sjekker det som ikke synes på øyemål:
//   - I dag: passerte timer skjules, «N igjen», neste booking stort, «Neste kunde · om …» fra fast klokke,
//     «Tjeneste · varighet», alle passert → «Ingen flere bookinger i dag.»
//   - Kommende: dager etter i dag, «N neste 7 dager», «Onsdag 18. nov», ingen avlyste, ingen utenfor 7 døgn.
//   - Nøkkeltall: .ovs-seg valgt = nøytral flate (aldri blå), tallfargene arvet (Kunder --info, omsetning
//     #35d07a), ÉN linje under tallene, 110px stolpeområde (felles .stolpe, se stolper-felles.mjs), 0-dag = 3px, ensfarget fyll (ingen gradient).
//   - Ingen «Hentet inn»-seksjon og ingen /attribution-kall fra Oversikt (Vekst og Gratis).
//   - Header: én rad, navnet 20px på mobil / 26px på desktop, INGEN dato i headeren — datoen står i I DAG-etiketten
//     («I DAG · TIRSDAG 17. NOV»). Detaljene vaktes av header-lenke.mjs. Bunn-nav: nytt Oversikt-ikon (fire fliser).
//   - Ingen horisontal overflow, ingen pageerror, ingen forespørsel slipper forbi mocken.
//
// ALLE /api/** mockes (catch-all) — ingen skriv eller les mot prod. Klokka er låst til tirsdag 17.11.2026 10:10
// (Oslo) med page.clock, så nedtelling og dagsbøtter er deterministiske.
//   node tools/render/oversikt-redesign.mjs            → alle tilstander → .render-ut/oversikt-redesign/*.png
//   node tools/render/oversikt-redesign.mjs gratis     → bare skjermbilder av den tilstanden (vaktene kjører alltid)
//   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/oversikt-redesign');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// ── Fast «nå»: tirsdag 17.11.2026 10:10 Oslo (CET = UTC+1) ──────────────────────────────────────────────
const NAA = new Date('2026-11-17T09:10:00Z');
const bk = (id, name, service, startZ, min, extra={}) => {
  const s = new Date(startZ); return { id, name, service, start: s.toISOString(), end: new Date(s.getTime()+min*60000).toISOString(), status:'bekreftet', ...extra };
};
const BOOKINGER_FULL = [
  bk(1,'Ola Nordmann','Klipp','2026-11-17T08:00:00Z',30),          // 09:00 — passert, skal IKKE vises
  bk(2,'Jonas Berg','Fade','2026-11-17T10:30:00Z',40),              // 11:30 — neste (om 1 t 20 min)
  bk(3,'Emre Yilmaz','Skin fade','2026-11-17T12:00:00Z',45),        // 13:00
  bk(4,'Theo Nilsen','Klipp + skjegg','2026-11-17T13:30:00Z',60),   // 14:30
  bk(5,'Avlyst Person','Klipp','2026-11-17T15:00:00Z',30,{status:'avlyst'}),
  bk(6,'Karim Haddad','Fade','2026-11-18T09:00:00Z',40),            // onsdag 10:00
  bk(7,'Sindre Holm','Klipp','2026-11-18T11:30:00Z',30),            // onsdag 12:30
  bk(8,'Avlyst To','Fade','2026-11-18T13:00:00Z',30,{status:'avlyst'}),
  bk(9,'Jonas Berg','Skjegg','2026-11-19T14:00:00Z',20),            // torsdag 15:00
  bk(10,'Magnus Lie','Klipp','2026-11-21T10:00:00Z',30,{referral_discount:{rolle:'ny',pct:20}}), // lørdag
  bk(11,'Utenfor Vindu','Klipp','2026-11-25T10:00:00Z',30),         // > 7 døgn frem — skal IKKE vises
];
// Gratis-tilstanden: tom dag (som oversikt-gratis.dc.html), to kommende torsdag.
const BOOKINGER_TOMDAG = [
  bk(21,'Karim Haddad','Fade','2026-11-19T11:00:00Z',40),
  bk(22,'Sindre Holm','Klipp','2026-11-19T12:30:00Z',30),
];

// /stats: siste 7 dager som i designet (ONS 11.11 … TIR 17.11), søndag 0.
const dag = (d, revenue, count) => ({ day:d, revenue, count, new:Math.round(count/3), returning:count-Math.round(count/3) });
const STATS_FULL = {
  daily: [ dag('2026-11-05',1200,3), dag('2026-11-08',2100,5), dag('2026-11-10',600,2),
           dag('2026-11-11',1400,3), dag('2026-11-12',1850,4), dag('2026-11-13',2300,5), dag('2026-11-14',2600,6),
           dag('2026-11-16',900,3), dag('2026-11-17',800,2) ],
  months_with_data:['2026-08','2026-09','2026-10','2026-11'],
  current_week_revenue: 9850, best_week_revenue: 14768, best_week_start:'2026-08-10', best_week_approximate:false,
  weekly_revenue: [14768,12000,11000,10500,10200,9000,8000,13000].map((r,i)=>({ week_start:'2026-0'+(8+Math.floor(i/4))+'-1'+(i%4), revenue:r })),
};
const STATS_GRATIS = {
  daily: [ dag('2026-11-12',1000,1), dag('2026-11-13',300,1), dag('2026-11-14',1000,1) ],
  months_with_data:['2026-10','2026-11'],
  current_week_revenue: 2300, best_week_revenue: 14768, best_week_start:'2026-08-10', weekly_revenue: [],
};

const PAAVEI_NY = { rebooking:{naar_vindu_30d:2,med_samtykke:1}, winback:{ foerste_passerer_60:'2026-12-03', passerer_innen_30d:5, borte:12, no_show:5 } };


const bill = (plan) => plan==='vekst'
  ? { subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription', page_status:'live',
      days_left:99, trial_days_left:null, needs_attention:false, current_period_end:'2026-12-17T00:00:00Z', cancel_at_period_end:false }
  : { subscription_status:null, plan:null, effective_plan:'basis', effective_plan_grunn:'gratis', page_status:'live',
      days_left:null, trial_days_left:null, needs_attention:false, sms_pakke_kan_kjopes:false };

const TILSTANDER = {
  'vekst':             { plan:'vekst', bookinger:BOOKINGER_FULL,   stats:STATS_FULL,   attr:{ paaVei:PAAVEI_NY } },
  // attr sendes likevel, så vakta ser at den IKKE hentes (Oversikt kaller ikke /attribution lenger).
  'gratis':            { plan:'basis', bookinger:BOOKINGER_TOMDAG, stats:STATS_GRATIS, attr:{ paaVei:{ ...PAAVEI_NY, winback:{ ...PAAVEI_NY.winback, borte:17, no_show:3 } } }, story:true },
};

const browser = await chromium.launch();
const sjekker = [];
const sjekk = (navn, ok, detalj='') => { sjekker.push({ navn, ok:!!ok, detalj }); };
const bilder = [];

async function aapne(t, { bredde, tema, naa=NAA, attrOverride=null }) {
  const T = TILSTANDER[t];
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(naa);
  await page.addInitScript((tm) => { try { localStorage.setItem('bhq-theme', tm); } catch(e){} }, tema);
  const st = { errs:[], attrKall:[], uMocket:[] };
  page.on('pageerror', e => st.errs.push(e.message));
  // Alt mot prod-API-et som IKKE er /api/** avbrytes og telles (skal være 0).
  await page.route('https://api.trybarberhq.com/**', route => {
    const u = new URL(route.request().url());
    if (!u.pathname.startsWith('/api/')) { st.uMocket.push(u.pathname); return route.abort(); }
    return route.fallback();
  });
  await page.route('**/api/**', async route => {
    const u = new URL(route.request().url()); const p = u.pathname;
    const J = (o, s=200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
    if (route.request().method() !== 'GET') return J({ ok:true });   // skriv besvares lokalt, aldri videre
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'test@example.no', slug:'grand-barber' });
    if (p === '/api/dashboard/billing/status') return J(bill(T.plan));
    if (p === '/api/dashboard/stats') return J(T.stats);
    if (p === '/api/dashboard/bookings') return J(T.bookinger);
    if (p === '/api/dashboard/attribution') { st.attrKall.push(u.searchParams.get('period')); return J(attrOverride || T.attr); }
    if (p === '/api/dashboard/aktivering') return J({ har_booking:true, steg:{} });
    if (p === '/api/dashboard/ledige') {
      const dato = u.searchParams.get('dato');
      return J(T.story && dato==='2026-11-17' ? { dato, antall:6, vis_banner:true, stengt:false } : { dato, antall:0, vis_banner:false });
    }
    if (p === '/api/dashboard/story/ledige-timer/data') return J({ tjenester:1, har_ledige:true, apne_dager:4, tilgjengelige_dager:4, dager:[] });
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
    return J(/images|recent|services|hours|referrals|customers/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('#idagInnhold .idag-neste, #idagInnhold .idag-tom', { timeout:15000 });
  await page.waitForSelector('#chartBars .cbar-col', { timeout:15000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, st };
}
const norm = s => (s||'').replace(/[\s  ]+/g,' ').trim();

// ── 1) Skjermbilder: tilstandene × 320/375/1280 × mørk/lys ──────────────────────────────────────────────
const KUN = process.argv[2];   // valgfritt: bare skjermbilder av én tilstand
for (const t of Object.keys(TILSTANDER).filter(k => !KUN || k===KUN)) for (const tema of ['dark','light']) for (const bredde of [320,375,1280]) {
  const { ctx, page, st } = await aapne(t, { bredde, tema });
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    navnPx: getComputedStyle(document.getElementById('barberName')).fontSize,
    datoIHeader: !!document.getElementById('dashDato'),
    idagEtikett: document.getElementById('ovsIdagH').innerText,
  }));
  const tag = `${t} ${tema} ${bredde}`;
  sjekk(`${tag}: ingen horisontal overflow`, m.overflow <= 0, m.overflow+'px');
  sjekk(`${tag}: ingen pageerror`, st.errs.length===0, st.errs.join(' | ').slice(0,120));
  sjekk(`${tag}: ingen forespørsel forbi mocken`, st.uMocket.length===0, st.uMocket.join(','));
  if (bredde===375) {
    sjekk(`${tag}: butikknavn 20px (mobil)`, m.navnPx==='20px', m.navnPx);
    sjekk(`${tag}: dato i I DAG-etiketten, ikke i headeren`, !m.datoIHeader && m.idagEtikett==='I DAG · TIRSDAG 17. NOV', m.idagEtikett);
  }
  const fil = path.join(OUT, `${t}-${tema}-${bredde}.png`);
  // Bunn-navet er sticky: med fullPage og 900px viewport tegnes det midt i sida. Strekk viewporten til hele
  // dokumenthøyden først, så havner det nederst — slik det står når barbereren har scrollet til bunns.
  const hoyde = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width:bredde, height:hoyde });
  await page.waitForTimeout(150);
  await page.screenshot({ path:fil, fullPage:true });
  bilder.push(fil);
  await ctx.close();
}

// ── 2) Innholdsvakter (375, mørk) ─────────────────────────────────────────────────────────────────────
{ // Vekst, full data
  const { ctx, page, st } = await aapne('vekst', { bredde:375, tema:'dark' });
  const d = await page.evaluate(() => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
    const valgt = q('#segs .ovs-seg-btn[aria-selected="true"]');
    const bars = qa('#chartBars .cbar-bar');
    return {
      idagAntall: q('#idagAntall').textContent,
      idagTid: q('.idag-tid')?.textContent, idagNavn: q('.idag-navn')?.textContent, idagSvc: q('.idag-svc')?.textContent,
      idagOm: q('.idag-om')?.textContent, idagRader: qa('#idagInnhold .up-row .up-name').map(e=>e.textContent),
      idagTekst: q('#ovsIdag').textContent,
      komAntall: q('#kommendeAntall').textContent,
      komDager: qa('#upcomingList .up-day').map(e=>e.textContent),
      komNavn: qa('#upcomingList .up-name').map(e=>e.textContent),
      etiketter: qa('#oversikt .ovs-etikett').map(e=>e.innerText),
      etikettStil: (()=>{ const e=q('#ovsIdagH'); const c=getComputedStyle(e); return [c.fontSize,c.fontWeight,c.letterSpacing,c.color].join(' '); })(),
      segValgtBg: cs(valgt,'backgroundColor'), segValgtFarge: cs(valgt,'color'),
      segHoyde: q('#segs').getBoundingClientRect().height,
      kpiFarge: cs(q('#kpiCount'),'color'), revFarge: cs(q('#estRevValue').parentElement,'color'),
      kpiTekst: norm2(q('#stats').innerText),
      note: q('#rekordNote').textContent, noteLinjer: Math.round(q('#rekordNote').getBoundingClientRect().height / parseFloat(getComputedStyle(q('#rekordNote')).lineHeight)),
      sporHoyde: q('#chartBars .cbar-spor').getBoundingClientRect().height,
      antallStolper: bars.length,
      nullHoyde: bars.filter(b=>b.classList.contains('null')).map(b=>b.getBoundingClientRect().height),
      gradient: bars.some(b=>/gradient/.test(getComputedStyle(b).backgroundImage)),
      idagLbl: cs(q('#chartBars .cbar-col.idag .cbar-lbl > span'),'color'),
      hentetInn: !!q('#drivenBy, #drivenByWrap, .hi-total, .pv-blokk') || /Hentet inn av BarberHQ/.test(q('#oversikt').innerText),
      sisteSek: qa('#oversikt section.ovs-sek').pop()?.id,
      ikonRects: document.querySelectorAll('#ic-oversikt rect').length,
      kort: qa('#oversikt .ovs-sek').filter(s=>{ const c=getComputedStyle(s); return parseFloat(c.borderTopWidth)>0 && parseFloat(c.borderLeftWidth)>0; }).length,
      smaTrykk: qa('#oversikt button, #oversikt a').filter(e=>e.offsetParent && !e.closest('.perseg-meny') && !e.classList.contains('ovs-seg-btn') && e.getBoundingClientRect().height<44).map(e=>(e.id||e.className)+':'+Math.round(e.getBoundingClientRect().height)),
    };
    function norm2(s){ return (s||'').replace(/[\s  ]+/g,' ').trim(); }
  });
  sjekk('I dag: «3 igjen» (passert + avlyst telles ikke)', d.idagAntall==='3 igjen', d.idagAntall);
  sjekk('I dag: neste = 11:30 Jonas Berg', d.idagTid==='11:30' && /Jonas Berg/.test(d.idagNavn), d.idagTid+' '+d.idagNavn);
  sjekk('I dag: «Fade · 40 min»', d.idagSvc==='Fade · 40 min', d.idagSvc);
  sjekk('I dag: «Neste kunde · om 1 t 20 min»', d.idagOm==='Neste kunde · om 1 t 20 min', d.idagOm);
  sjekk('I dag: resten som rader (Emre, Theo)', JSON.stringify(d.idagRader)==='["Emre Yilmaz","Theo Nilsen"]', JSON.stringify(d.idagRader));
  sjekk('I dag: passert/avlyst vises ikke', !/Ola Nordmann|Avlyst Person/.test(d.idagTekst));
  sjekk('Kommende: «4 neste 7 dager»', d.komAntall==='4 neste 7 dager', d.komAntall);
  sjekk('Kommende: dagsoverskrifter', JSON.stringify(d.komDager)==='["Onsdag 18. nov","Torsdag 19. nov","Lørdag 21. nov"]', JSON.stringify(d.komDager));
  sjekk('Kommende: ingen i dag/avlyst/utenfor vindu', !d.komNavn.some(n=>/Emre|Avlyst|Utenfor/.test(n)), JSON.stringify(d.komNavn));
  sjekk('Etiketter i versaler, rekkefølge', JSON.stringify(d.etiketter)==='["I DAG · TIRSDAG 17. NOV","KOMMENDE","NØKKELTALL"]', JSON.stringify(d.etiketter));
  sjekk('Etikett-stil 11.5px/600/#8a8a8a', /^11\.5px 600 .* rgb\(138, 138, 138\)$/.test(d.etikettStil), d.etikettStil);
  sjekk('Seg valgt = #262626 (ikke blå), hvit tekst', d.segValgtBg==='rgb(38, 38, 38)' && d.segValgtFarge==='rgb(255, 255, 255)', d.segValgtBg+' / '+d.segValgtFarge);
  sjekk('Seg-container ≥44px (trykkflate)', d.segHoyde>=44, d.segHoyde);
  sjekk('Kunder-tallet arver --info (blå)', d.kpiFarge==='rgb(77, 139, 255)', d.kpiFarge);
  sjekk('Omsetning arver #35d07a (grønn)', d.revFarge==='rgb(53, 208, 122)', d.revFarge);
  sjekk('KPI: 23 kunder / 9 850 kr', /Kunder 23 fullførte klipp/.test(d.kpiTekst) && /9 850 ?kr/.test(d.kpiTekst), d.kpiTekst);
  sjekk('Én linje: «Beste uke: 14 768 kr · august»', norm(d.note)==='Beste uke: 14 768 kr · august' && d.noteLinjer===1, d.note+' ('+d.noteLinjer+' linjer)');
  sjekk('Stolpeområde 110px, 7 stolper', Math.round(d.sporHoyde)===110 && d.antallStolper===7, d.sporHoyde+' / '+d.antallStolper);
  sjekk('0-dag (søndag) = 3px', d.nullHoyde.length===1 && Math.round(d.nullHoyde[0])===3, JSON.stringify(d.nullHoyde));
  sjekk('Stolper ensfarget (ingen gradient)', !d.gradient);
  sjekk('I dag-etikett under diagrammet er hvit', d.idagLbl==='rgb(255, 255, 255)', d.idagLbl);
  sjekk('Ingen «Hentet inn»-seksjon; Nøkkeltall er siste seksjon', !d.hentetInn && d.sisteSek==='ovsTall', d.sisteSek);
  sjekk('Oversikt henter ikke /attribution', st.attrKall.length===0, JSON.stringify(st.attrKall));
  sjekk('Ingen rammer rundt seksjonene', d.kort===0, d.kort);
  sjekk('Trykkflater ≥44px', d.smaTrykk.length===0, d.smaTrykk.join(', '));
  sjekk('Bunn-nav: Oversikt-ikon = fire fliser', d.ikonRects===4, d.ikonRects);

  // Nøkkeltall 2 uker: gap krymper, 14 stolper, rekordlinja forsvinner ikke ut av én linje.
  await page.click('#segs [data-p="2uker"]');
  await page.waitForFunction(() => document.querySelectorAll('#chartBars .cbar-col').length===14);
  const to = await page.evaluate(() => ({ gap: getComputedStyle(document.getElementById('chartBars')).columnGap, attr: null }));
  sjekk('2 uker: 14 stolper, gap 4px', to.gap==='4px', to.gap);
  // Navnet er 20px også på Vekst-fanen (mobil).
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(200);
  const v = await page.evaluate(() => ({ navn: getComputedStyle(document.getElementById('barberName')).fontSize }));
  sjekk('Navnet 20px også på Vekst-fanen (mobil)', v.navn==='20px', v.navn);
  sjekk('vekst-interaksjon: ingen pageerror', st.errs.length===0, st.errs.join(' | ').slice(0,160));
  await ctx.close();
}
{ // Måned: 31-dagersakse får plass på 320 (gap 2px), ingen overflow
  const { ctx, page, st } = await aapne('vekst', { bredde:320, tema:'dark' });
  await page.click('#maanedBtn');
  await page.click('#maanedMeny [data-ym=""]');
  await page.waitForFunction(() => document.querySelectorAll('#chartBars .cbar-col').length===17);
  const m = await page.evaluate(() => ({ gap:getComputedStyle(document.getElementById('chartBars')).columnGap, of:document.documentElement.scrollWidth-innerWidth,
    hoyre: Math.round(document.querySelector('#chartBars').lastElementChild.getBoundingClientRect().right), bredde: Math.round(document.querySelector('#chartBars').getBoundingClientRect().right) }));
  sjekk('Denne måneden @320: gap 2px, stolpene innenfor', m.gap==='2px' && m.of<=0 && m.hoyre<=m.bredde, JSON.stringify(m));
  sjekk('måned: ingen pageerror', st.errs.length===0, st.errs.join(' | '));
  await ctx.close();
}
for (const t of ['gratis']) {
  const { ctx, page, st } = await aapne(t, { bredde:375, tema:'dark' });
  const d = await page.evaluate(() => {
    return { hentetInn: !!document.querySelector('#drivenBy, .gr-h') || /Hentet inn av BarberHQ|Se Vekst/.test(document.getElementById('oversikt').innerText),
      idag: document.querySelector('#idagInnhold').textContent, idagAnt: document.querySelector('#idagAntall').textContent,
      story: !!document.getElementById('storyOpenOversikt').offsetParent, storyLinje: document.getElementById('storyLedigeLinje').textContent };
  });
  sjekk(`${t}: ingen «Hentet inn» / «Se Vekst» på Oversikt`, !d.hentetInn);
  sjekk(`${t}: ingen /attribution-kall på Gratis`, st.attrKall.length===0, JSON.stringify(st.attrKall));
  sjekk(`${t}: tom dag «Ingen bookinger i dag.» / «0 igjen»`, d.idag==='Ingen bookinger i dag.' && d.idagAnt==='0 igjen', d.idag+' / '+d.idagAnt);
  sjekk(`${t}: story-lenke + «Du har 6 ledige timer i dag»`, d.story && d.storyLinje==='Du har 6 ledige timer i dag', d.storyLinje);
  sjekk(`${t}: ingen pageerror`, st.errs.length===0, st.errs.join(' | ').slice(0,160));
  await ctx.close();
}
{ // Alle dagens timer passert (17:00 Oslo) → «Ingen flere bookinger i dag.» / «0 igjen»
  const { ctx, page } = await aapne('vekst', { bredde:375, tema:'dark', naa:new Date('2026-11-17T16:00:00Z') });
  const d = await page.evaluate(() => ({ t: document.querySelector('#idagInnhold').textContent, a: document.querySelector('#idagAntall').textContent }));
  sjekk('Alle passert: «Ingen flere bookinger i dag.» / «0 igjen»', d.t==='Ingen flere bookinger i dag.' && d.a==='0 igjen', JSON.stringify(d));
  await ctx.close();
}
{ // Lys modus: valgt segment er nøytral (ikke blå), etiketter --mut
  const { ctx, page } = await aapne('vekst', { bredde:375, tema:'light' });
  const d = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('#segs [aria-selected="true"]')).backgroundColor,
    hair: getComputedStyle(document.getElementById('ovsIdag')).borderBottomColor, body: getComputedStyle(document.body).backgroundColor }));
  sjekk('Lys: valgt segment nøytral grå', d.bg==='rgb(233, 233, 233)', d.bg);
  sjekk('Lys: hårlinje lys (ikke #1a1a1a)', d.hair==='rgb(235, 235, 235)', d.hair);
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) console.log((s.ok?'✓ ':'✗ ')+s.navn+(s.ok||!s.detalj?'':'  — '+s.detalj));
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
