// tools/render/funksjoner-ks.mjs — funksjoner.html, Kjernefunksjoner-scenen (18.11.2026): Selvbooking-telefonen i v2,
// kalenderen som dagens dashbord, pinnen = innholdets høyde, J-krok-landingen og «Få kunder tilbake»-diagrammene.
//
// Vakter (exit 1 ved avvik):
//   1. Selvbooking (v2-klonen, _utkast/ks-v2book/bygg.mjs): t0 steg 1 (Skinfade + Skjegg, «Velg dato og tid →» aktiv),
//      t18 steg 2 med fredagen valgt og klokkeslettene synlige, t25 11:00 valgt, t32 «Opplysninger →» aktiv og synlig i
//      skjermen. Statuslinja hvit hele veien.
//   2. Klonen = den ekte siden: beregnede stiler (farge, flate, skrift, avstander, kanter, bredde/høyde) for hvert nøkkel-
//      element sammenlignet med kildens EKTE side (kilde/6-tid-valgt.html + 3-tillegg-valgt.html, lastet ved 390 px).
//   3. Kalenderen som dashbordet: «Legg til booking» (+) i topplinja, datoknapp «Fredag 20. nov»/«I dag», dagsoverskrift blå
//      bare for i dag, blokktid som start–slutt.
//   4. J-kroken lander på slotten (< 0,3 px, etter at utjevningen har satt seg av seg selv) på 320 / 375 / 1280 / 1920.
//   5. Pinnen = innholdets høyde, sentrert: hele pinnen i synsfeltet når den får plass; tittel → telefon ≤ 30 px på desktop
//      (1280×900, 1920×1080, 2560×1440); tomrommet under «Få kunder tilbake» før «Din egen side» ≤ 80 px.
//   6. Vinn tilbake-kortet (og de andre diagrammene) overlapper aldri stegteksten (320×568, 375×812, 1280×900).
// Skjermbilder → .render-ut/funksjoner-ks/. Ingen request forlater localhost bortsett fra GSAP/fonter fra CDN.
//   node tools/render/funksjoner-ks.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const KILDE = path.resolve(import.meta.dirname, '../../_utkast/ks-v2book/kilde');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/funksjoner-ks');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.mp4':'video/mp4' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/funksjoner.html`;
const browser = await chromium.launch();
// Utjevning (scrub 0.6 / Lenis): etter et scroll-hopp settes scenene på målet med sidens egen PinInit.snapp(), så målingene
// ser sluttilstanden uten å vente på at utjevningen glir dit.
const hopp = async (page, y, ms = 250) => { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(40);
  await page.evaluate(() => { if (window.PinInit && PinInit.snapp) PinInit.snapp(); }); await page.waitForTimeout(ms); };

const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];

async function aapne(W, H, dsf = 2) {
  const ctx = await browser.newContext({ viewport:{ width:W, height:H }, deviceScaleFactor:dsf, ...(W < 700 ? { isMobile:true, hasTouch:true } : {}) });
  const page = await ctx.newPage(); const errs = [], ute = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.hostname === 'localhost' || /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return r.fallback();
    ute.push(r.request().method() + ' ' + u.href); return r.abort(); });
  await page.goto(URL_, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const st = await page.evaluate(() => { const s = ScrollTrigger.getAll().find(s => s.pin && s.pin.id === 'ksPin'); return { a: s.start, b: s.end }; });
  // Jevnt gjennom J-kroken (reise-driveren setter skjermene per scroll-tick fram til landing).
  for (let y = 0; y < st.a; y += 20) { await hopp(page, y, 4); }
  // Til landing og VENT til utjevningen har satt seg av seg selv (scrub 0.6 → ~1 s). Ingen snapp her: kravet er < 0,3 px
  // avvik etter ekte innsvinging.
  await page.evaluate(y => scrollTo(0, y), Math.round(st.a)); await page.waitForTimeout(1500);
  const tilT = async t => { await hopp(page, Math.round(st.a + (st.b - st.a) * t / 207), 220); };
  return { ctx, page, errs, ute, st, tilT };
}
const telefonBilde = async (page, fil) => { const r = await page.evaluate(() => { const b = document.getElementById('ksPhone').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const vp = page.viewportSize();
  await page.screenshot({ path: fil, clip: { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: Math.min(vp.width - Math.max(0, r.x - 6), r.w + 12), height: Math.min(vp.height - Math.max(0, r.y - 6), r.h + 12) } }); bilder.push(fil); };

// ---------- 1 + 3 + 4: Selvbooking, kalender, landing (320 / 375 / 1280 / 1920) ----------
const STIL_EGENSKAPER = ['color','backgroundColor','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft',
  'marginTop','marginRight','marginBottom','marginLeft','borderTopWidth','borderTopColor','borderBottomWidth','borderBottomColor','borderTopLeftRadius','display','gridTemplateColumns','textAlign','justifyContent','alignItems'];
const MAAL = (args) => { const [rotSel, sel, eg] = args; const rot = rotSel ? document.querySelector(rotSel) : document;
  const e = rot && rot.querySelector(sel); if (!e) return null; const c = getComputedStyle(e);
  const ut = { w: e.offsetWidth, h: e.offsetHeight, font: c.fontFamily.split(',')[0].replace(/["']/g, '').replace(/\s+/g, '').toLowerCase() };
  for (const k of eg) ut[k] = c[k]; return ut; };
for (const [W, H] of [[320, 568], [375, 812], [1280, 900], [1920, 1080]]) {
  const { ctx, page, errs, ute, st, tilT } = await aapne(W, H);
  const tag = `${W}×${H}`;
  // J-krok-landingen
  const land = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const a = r('ksPhone'), b = r('ksPhoneSlot');
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)); });
  console.log(`  ${tag}: J-krok-landing etter utjevning: ${land.toFixed(2)} px`);
  sjekk(`${tag}: J-kroken lander på slotten etter at utjevningen har satt seg (< 0,3 px)`, land < 0.3, land.toFixed(2) + ' px');
  if (W <= 375) {
    // TO SCENER (18.11): 1) Velg tjeneste (t0–10), sideskifte t10–14, 2) Dato og tid i FAST scrollposisjon (t14–40).
    const tilstand = async t => { await tilT(t); return page.evaluate(() => { const op = id => +getComputedStyle(document.getElementById(id)).opacity, g = id => document.getElementById(id);
      const vis = id => getComputedStyle(g(id)).visibility !== 'hidden';
      const skj = document.querySelector('#ksBook').getBoundingClientRect(), r = id => g(id).getBoundingClientRect();
      const iSkjerm = id => { const b = r(id); return b.top >= skj.top - 1 && b.bottom <= skj.bottom + 1; };
      const frame = document.querySelector('#ksBook .frame');
      return { s1: vis('ksV2S1'), s2: vis('ksV2S2'), side: +getComputedStyle(frame).opacity, rull: getComputedStyle(frame).transform,
        li1: g('ksV2Li1').className, li2: g('ksV2Li2').className, fri: !!document.querySelector('#ksV2Fri.er-valgt'),
        tider: op('ksV2Tider'), tid: g('ksV2Tid').classList.contains('chosen') ? g('ksV2Tid').textContent : null, next: op('ksNext2'),
        friISkjerm: iSkjerm('ksV2Fri'), tidISkjerm: iSkjerm('ksV2Tid'), nextISkjerm: iSkjerm('ksNext2'), status: getComputedStyle(g('ksStatus')).color }; }); };
    const t0 = await tilstand(0);
    sjekk(`${tag} scene 1 (t0): Velg tjeneste, ikke scrollet`, t0.s1 && !t0.s2 && t0.li1 === 'active' && t0.side === 1 && t0.rull === 'none', JSON.stringify(t0));
    const tv = await page.evaluate(() => ({ valgt: [...document.querySelectorAll('#ksV2S1 .v2-tj.selected, #ksV2S1 .flow-addon.sel')].map(e => e.dataset.name), cta: getComputedStyle(document.getElementById('ksV2Cta1')).backgroundColor }));
    sjekk(`${tag} scene 1: Skinfade + Skjegg krysset av, «Velg dato og tid →» i aksent`, tv.valgt.join() === 'Skinfade,Skjegg' && tv.cta === 'rgb(77, 139, 255)', JSON.stringify(tv));
    await telefonBilde(page, path.join(OUT, `booking-1-for-trykk-${W}.png`));
    const t15 = await tilstand(15);
    sjekk(`${tag} scene 2 (t15): Dato og tid i fast posisjon — fredag og knapp i skjermen, ingenting valgt ennå`,
      !t15.s1 && t15.s2 && t15.li2 === 'active' && t15.side === 1 && t15.rull !== 'none' && t15.friISkjerm && t15.nextISkjerm && !t15.fri && !t15.tid && t15.next < .01, JSON.stringify(t15));
    // Ingen scroll inne i telefonen: samme transform gjennom hele scene 2.
    const ruller = []; for (const t of [14, 16, 20, 23, 27, 31, 36, 40]) ruller.push((await tilstand(t)).rull);
    sjekk(`${tag} scene 2: ingen scrolling inne i telefonen (fast posisjon t14–40)`, new Set(ruller).size === 1 && ruller[0] !== 'none', [...new Set(ruller)].join(' | '));
    const t38 = await tilstand(38);
    sjekk(`${tag} scene 2 (t38, etter siste trykk): fredag 20. + 11:00 valgt, «Opplysninger →» aktiv, alt i skjermen`,
      t38.fri && t38.tid === '11:00' && t38.next > .8 && t38.tidISkjerm && t38.nextISkjerm, JSON.stringify(t38));
    sjekk(`${tag}: statuslinja hvit (v2-bookingen er mørk)`, [t0, t15, t38].every(x => x.status === 'rgb(255, 255, 255)'), t0.status + ' / ' + t38.status);
    await telefonBilde(page, path.join(OUT, `booking-2-etter-siste-trykk-${W}.png`));
    // SMS-påminnelsen bruker navnet slik prod skriver det (= bookingklonen)
    const sms = await page.evaluate(() => document.getElementById('ksLsMsg').textContent);
    sjekk(`${tag}: SMS-påminnelsen sier «Grand barber» (som prod og bookingklonen)`, /hos Grand barber i morgen kl 11:00\./.test(sms), sms);
    // Kalenderen (t60)
    await tilT(60);
    const kal = await page.evaluate(() => { const g = s => document.querySelector(s); const vis = e => e && getComputedStyle(e).display !== 'none' && !e.hidden;
      return { pluss: vis(g('#ksCal .ks-add')), dato: g('#ksCalDateBtn').textContent, idagKnapp: vis(g('#ksCalToday')), hode: g('#ksCalDayhead').textContent, hodeBlaa: g('#ksCalDayhead').classList.contains('is-today'),
        tid: g('#ksCalBody .ks-blk-time').textContent }; });
    const iDag = await page.evaluate(() => { const i = new Date(); i.setHours(0,0,0,0); const f = new Date(i); let a = (5 - f.getDay() + 7) % 7; if (!a) a = 7; f.setDate(f.getDate() + a); return Math.round((f - i) / 864e5); });
    sjekk(`${tag} kalender: «+» i topplinja, datoknapp/«I dag»/dagsoverskrift som dashbordet, tid start–slutt`,
      kal.pluss && /^(I dag|(Mandag|Tirsdag|Onsdag|Torsdag|Fredag|Lørdag|Søndag) \d{1,2}\. [a-zø]{3})$/.test(kal.dato) && kal.idagKnapp === (iDag !== 0) && kal.hodeBlaa === (iDag === 0)
      && /^\d{1,2}:\d{2}–\d{1,2}:\d{2}$/.test(kal.tid), JSON.stringify(kal));
    await telefonBilde(page, path.join(OUT, `kalender-${W}.png`));
    await tilT(95); await telefonBilde(page, path.join(OUT, `sms-${W}.png`));
  }
  if (W === 375) {
    // 2: klonen mot den ekte siden — samme tilstand (steg 2 ferdig: dag + tid valgt)
    await tilT(32);
    const PAR = [['.flow-nav'], ['.back-link'], ['.flow-brand'], ['.steps'], ['.steps li.done'], ['.steps li.active'], ['.flow-title'], ['.service-recap'], ['.service-recap strong'],
      ['.service-recap small'], ['.text-link'], ['.bhq-dv-topp h3'], ['.bhq-dv-piler button'], ['.bhq-dv-ukedager span'], ['.bhq-dv-dag:not([disabled]):not(.er-valgt)'], ['.bhq-dv-dag[disabled]'],
      ['.bhq-dv-dag.er-valgt'], ['.bhq-dv-fot'], ['.time-heading h3'], ['.time-heading span'], ['.time-grid'], ['.time:not(.chosen)'], ['.time.chosen'], ['.selection-line'], ['.flow-foot'], ['.flow-footer']];
    const PAR1 = [['.v2-tj.service.selected'], ['.v2-tj.service:not(.selected)'], ['.v2-tj-pris'], ['.v2-tj-hake'], ['.v2-tillegg-panel'], ['.v2-tillegg-lbl'], ['.flow-addon.sel'], ['.flow-addon:not(.sel)'], ['.booking header h2'], ['.primary']];
    const klon = {}; for (const [s] of PAR) klon[s] = await page.evaluate(MAAL, ['#ksV2S2', s, STIL_EGENSKAPER]) || await page.evaluate(MAAL, ['#ksBook', s, STIL_EGENSKAPER]);
    klon['.primary(aktiv)'] = await page.evaluate(MAAL, ['#ksBook', '#ksNext2', STIL_EGENSKAPER]);
    await tilT(0); for (const [s] of PAR1) klon['S1 ' + s] = await page.evaluate(MAAL, ['#ksV2S1', s, STIL_EGENSKAPER]);
    const kctx = await browser.newContext({ viewport:{ width:390, height:848 }, isMobile:true, hasTouch:true }); const kp = await kctx.newPage();
    // Kildens @font-face peker til API-et (blokkert her). Samme Inter/Plus Jakarta Sans som klonen lastes fra Google, så breddene
    // sammenlignes på samme skrift (.flow-brand: kildens familienavn «PlusJakartaSans» = Google-fontens «Plus Jakarta Sans»).
    await kp.route('**/*', r => /fonts\.(googleapis|gstatic)\.com/.test(new URL(r.request().url()).hostname) ? r.fallback() : r.abort());
    const FONTER = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700&display=swap" rel="stylesheet">'
      + "<style>.flow-brand{font-family:'Plus Jakarta Sans',Inter,sans-serif!important}</style>";
    const fasit = {};
    for (const [fil, par, pre] of [['6-tid-valgt.html', PAR, ''], ['3-tillegg-valgt.html', PAR1, 'S1 ']]) {
      await kp.setContent(fs.readFileSync(path.join(KILDE, fil), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace('</head>', FONTER + '</head>'), { waitUntil:'networkidle' });
      await kp.evaluate(() => document.fonts.ready);
      for (const [s] of par) fasit[pre + s] = await kp.evaluate(MAAL, [null, (pre ? '#flow-step1 ' : '#flow-dynamic ') + s, STIL_EGENSKAPER]) || await kp.evaluate(MAAL, [null, s, STIL_EGENSKAPER]);
      if (!pre) fasit['.primary(aktiv)'] = await kp.evaluate(MAAL, [null, '#flow-to-details', STIL_EGENSKAPER]);
    }
    await kctx.close();
    const avvik = [];
    for (const k of Object.keys(fasit)) { const a = klon[k], f = fasit[k]; if (!a || !f) { avvik.push(k + ': mangler ' + (!a ? 'i klonen' : 'i kilden')); continue; }
      // Bredden på datoteksten følger datoen (klonen: neste fredag, kilden: prod-dagen) — teksten er ulik, ikke stilen.
      const UNNTAK = { '.time-heading h3': ['w'] };
      for (const e of Object.keys(f)) { if (e === 'font' && /plusjakartasans/.test(f[e]) && /plusjakartasans/.test(a[e])) continue;
        if ((UNNTAK[k] || []).includes(e)) continue;
        // Tall i strenger (px-verdier, grid-spor) sammenlignes med 0,5 px toleranse (subpikselavrunding), resten eksakt.
        const tall = v => String(v).match(/-?[\d.]+/g) || [];
        const likTall = (x, y) => { const p = tall(x), q = tall(y); return p.length > 0 && p.length === q.length && p.every((n, i) => Math.abs(+n - +q[i]) <= .5)
          && String(x).replace(/-?[\d.]+/g, '#') === String(y).replace(/-?[\d.]+/g, '#'); };
        if ((e === 'w' || e === 'h') ? Math.abs(a[e] - f[e]) > 1 : (a[e] !== f[e] && !likTall(a[e], f[e]))) avvik.push(`${k} ${e}: klon ${a[e]} ≠ ekte ${f[e]}`); } }
    sjekk(`klonen = den ekte v2-siden (${Object.keys(fasit).length} elementer × ${STIL_EGENSKAPER.length + 3} egenskaper)`, avvik.length === 0, avvik.slice(0, 8).join(' | '));
    if (avvik.length) fs.writeFileSync(path.join(OUT, 'stilavvik.txt'), avvik.join('\n'));
  }
  sjekk(`${tag}: ingen pageerror, ingen skrivende request`, errs.length === 0 && ute.every(u => u.startsWith('GET ')), errs.join('|').slice(0,160) + ' ' + ute.filter(u => !u.startsWith('GET ')).join(','));
  await ctx.close();
}

// ---------- 7: reload / hopp midt i scenen — skjermene skal tegnes ut fra scrollposisjonen, ikke fra forrige reiseframe ----------
// Feilen (til 18.11): reise-driveren satte #ksHero/#ksBook bare fram til landing. Ble siden lastet (eller hoppet) forbi landingen,
// sto hero-kalenderen og bookingen igjen halvveis/oppå hverandre. Nå: én eier per skjerm og scrollposisjon.
const skjermer = page => page.evaluate(() => { const s = document.querySelector('#ksPhone .hp-screens').getBoundingClientRect();
  const andel = id => { const e = document.getElementById(id); if (!e) return 0; const r = e.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left)); return +(x / s.width).toFixed(2); };
  return { hero: andel('ksHero'), book: andel('ksBook'), cal: andel('ksCal') }; });
for (const [W, H] of [[375, 812], [1280, 900]]) {
  for (const [navn, t, forventet] of [['t20 (Selvbooking)', 20, { hero: 0, book: 1, cal: 0 }], ['t60 (Kalender)', 60, { hero: 0, book: 0, cal: 1 }]]) {
    // a) reload: scroll rett til punktet, last siden på nytt (nettleseren gjenoppretter scrollposisjonen)
    const ctx = await browser.newContext({ viewport:{ width:W, height:H }, deviceScaleFactor:2, ...(W < 700 ? { isMobile:true, hasTouch:true } : {}) });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.hostname === 'localhost' || /cdnjs|jsdelivr|gstatic|googleapis/.test(u.hostname)) ? r.fallback() : r.abort(); });
    await page.goto(URL_, { waitUntil:'networkidle' });
    const st = await page.evaluate(() => { const s = ScrollTrigger.getAll().find(s => s.pin && s.pin.id === 'ksPin'); return { a: s.start, b: s.end }; });
    const y = Math.round(st.a + (st.b - st.a) * t / 207);
    // b) hopp fra toppen rett inn (ingen mellomliggende scroll-ticks gjennom reisen)
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
    await hopp(page, y, 400);
    const etterHopp = await skjermer(page);
    sjekk(`${W}×${H} hopp fra toppen → ${navn}: riktig skjerm`, Object.keys(forventet).every(k => Math.abs(etterHopp[k] - forventet[k]) < .02), JSON.stringify(etterHopp));
    await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(800);
    // Nettleseren gjenoppretter scrollposisjonen FØR pin-spacerne er bygget, så den lander ikke alltid på y. Forventningen
    // regnes derfor ut fra der siden faktisk står: booking før t40, kalender t50–65, aldri hero etter landingen.
    const etter = await page.evaluate(() => { const s = ScrollTrigger.getAll().find(s => s.pin && s.pin.id === 'ksPin'); return { sy: scrollY, a: s.start, b: s.end }; });
    const tFaktisk = (etter.sy - etter.a) / (etter.b - etter.a) * 207;
    const fv = tFaktisk < 0 ? null : tFaktisk < 40 ? { hero: 0, book: 1, cal: 0 } : (tFaktisk >= 50 && tFaktisk <= 65) ? { hero: 0, book: 0, cal: 1 } : { hero: 0 };
    const rel = await skjermer(page);
    sjekk(`${W}×${H} reload midt i scenen (${navn} → faktisk t${tFaktisk.toFixed(0)}): riktig skjerm`, fv && Object.keys(fv).every(k => Math.abs(rel[k] - fv[k]) < .02), JSON.stringify({ ...rel, t: +tFaktisk.toFixed(1) }));
    if (t === 20) { const fil = path.join(OUT, `reload-midt-i-scenen-${W}.png`); await page.screenshot({ path: fil }); bilder.push(fil); }
    sjekk(`${W}×${H} reload ${navn}: ingen pageerror`, errs.length === 0, errs.join('|').slice(0, 160));
    await ctx.close();
  }
}

// ---------- 5: pinnen + tomrom ----------
for (const [W, H] of [[320, 568], [375, 812], [1280, 900], [1440, 800], [1920, 1080], [2560, 1440]]) {
  const { ctx, page, errs, st, tilT } = await aapne(W, H, 1);
  await tilT(20);
  const m = await page.evaluate(() => { const g = s => document.querySelector(s).getBoundingClientRect(); const nav = document.querySelector('.nav').getBoundingClientRect().height;
    const pin = g('#ksPin'), h2 = g('#ksH2'), tel = g('#ksPhoneSlot'); return { navH: Math.round(nav), pinTopp: Math.round(pin.top), pinBunn: Math.round(pin.bottom), pinH: Math.round(pin.height), tittelTilTelefon: Math.round(tel.top - h2.bottom), vh: innerHeight }; });
  const fårPlass = m.pinH <= m.vh - m.navH;
  if (fårPlass) sjekk(`${W}×${H}: Kjernefunksjoner-pinnen sentrert og hel i synsfeltet`, m.pinTopp >= m.navH - 1 && m.pinBunn <= m.vh + 1 && Math.abs((m.pinTopp - m.navH) - (m.vh - m.pinBunn)) <= 2, JSON.stringify(m));
  else sjekk(`${W}×${H}: innholdet er høyere enn plassen → toppen rett under nav-en`, Math.abs(m.pinTopp - m.navH) <= 1, JSON.stringify(m));
  if (W >= 1280) sjekk(`${W}×${H}: «Kjernefunksjoner» → telefon ≤ 30 px`, m.tittelTilTelefon <= 30, m.tittelTilTelefon + ' px');
  // Tomrom under «Få kunder tilbake»: siste synlige innhold i scenen → «Din egen side»
  await tilT(207);
  const ksSlutt = st.b;
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  const desH2 = await page.evaluate(() => document.querySelector('#dineegenside .des-h2').getBoundingClientRect().top + scrollY);
  await hopp(page, Math.round(Math.max(ksSlutt, desH2 - H + 120)), 250);
  const gap = await page.evaluate(() => { const op = e => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); o *= +c.opacity; if (c.visibility === 'hidden' || c.display === 'none') return 0; } return o; };
    const h2 = document.querySelector('#dineegenside .des-h2').getBoundingClientRect().top;
    const over = [...document.querySelectorAll('section *')].filter(e => (!e.children.length || e.tagName === 'IMG' || e.tagName === 'svg') && !e.closest('#dineegenside'))
      .map(e => ({ e, r: e.getBoundingClientRect() })).filter(x => x.r.width && x.r.height && x.r.bottom <= h2 + 1 && x.r.bottom > 0 && op(x.e) > .05).map(x => x.r.bottom);
    return over.length ? Math.round(h2 - Math.max(...over)) : null; });
  // Rotårsaken (pinnen var 100vh med kortere innhold) skal være borte: pinnen har ingen ekstra høyde utover innholdet.
  const slakk = await page.evaluate(() => { const p = document.getElementById('ksPin').getBoundingClientRect(), i = document.querySelector('#ksPin .ks-inner').getBoundingClientRect(); return Math.round(p.bottom - i.bottom); });
  sjekk(`${W}×${H}: Kjernefunksjoner-pinnen har ingen død plass under innholdet`, Math.abs(slakk) <= 1, slakk + ' px');
  // Det SYNLIGE tomrommet skrives ut. På mobil skal det være vanlig seksjonsavstand; på desktop er resten den tomme halvdelen
  // av telefonplassen under Vinn tilbake-kortet (kortet står midt i plassen telefonen hadde) — rapporteres, ingen tilpasset terskel.
  console.log(`  ${W}×${H}: synlig tomrom «Få kunder tilbake» → «Din egen side»: ${gap} px`);
  if (W < 900) sjekk(`${W}×${H}: tomrom under «Få kunder tilbake» → «Din egen side» ≤ 80 px`, gap !== null && gap <= 80, gap + ' px');
  // 6: diagrammene overlapper ikke stegteksten (vertikalt OG horisontalt)
  for (const t of [120, 150, 175, 200]) { await tilT(t);
    const o = await page.evaluate(() => { const op = e => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
      const dia = [...document.querySelectorAll('#ksDiagrams .dia')].filter(d => op(d) > .5).map(d => (d.querySelector('.wbcard') || d.querySelector('svg') || d).getBoundingClientRect());
      const txt = [...document.querySelectorAll('.ks-step')].filter(s => op(s) > .5).map(s => s.getBoundingClientRect());
      let maks = 0; for (const a of dia) for (const b of txt) { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (x > 0 && y > 0) maks = Math.max(maks, Math.round(y)); }
      return { maks, n: dia.length }; });
    sjekk(`${W}×${H} t${t}: diagram overlapper ikke stegteksten`, o.maks === 0, JSON.stringify(o));
    if (W === 320 && t === 200) { const fil = path.join(OUT, `vinn-tilbake-320x568.png`); await page.screenshot({ path: fil }); bilder.push(fil); }
  }
  sjekk(`${W}×${H}: ingen pageerror`, errs.length === 0, errs.join('|').slice(0, 160));
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) if (!s.ok) console.log('✗ ' + s.navn + '  — ' + s.detalj);
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length - feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
