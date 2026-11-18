// _utkast/ks-v2book/bygg.mjs — bygger Selvbooking-telefonens v2-klon (funksjoner.html, #ksBook) fra den EKTE
// v2-bookingsiden til Grand Barber (prod, 18.11.2026, kun GET — se kilde/).
//
//   node _utkast/ks-v2book/bygg.mjs      → ut/v2book.css + ut/v2book.html (+ statistikk). Rører ikke site/.
//
// Kilde: kilde/3-tillegg-valgt.html (steg 1: Skinfade + Skjegg valgt) og kilde/6-tid-valgt.html (steg 2: dag + tid valgt).
// CSS-en er sidens EGEN <style> (v2-css.cjs + datovelger), maskinelt scopet til `.ks-scene .v2b`:
//   · :root / html / body → klonens rot (`.ks-scene .v2b`). `html.v2-lb-laast body` (bildeoverlegget) droppes.
//   · @media vurderes ved klonens designbredde 390×848 på en telefon (hover:none, pointer:coarse, ingen redusert
//     bevegelse): treff → reglene flates ut, ellers droppes de. @media er viewport-basert og meningsløs i en klon.
//   · vw/dvh regnes om til px mot 390×848 (CLAUDE.md: vw i en fastbreddet klon løses mot LANDINGSSIDAS viewport).
//   · @font-face og @keyframes droppes (.ks-scene * har animation:none; Inter + Plus Jakarta Sans lastes av siden).
//   · Bare regler der BASIS-selektoren (pseudo-klasser/-elementer strippet) treffer et element i klonen beholdes —
//     testet mot en «supermengde» av klonen der alle tilstandsklassene finnes (er-valgt, chosen, done, …).
//   · id-er prefikses (ksv2-) i både CSS og markup, så de ikke kolliderer med funksjoner.html.
// Markup: kildens ekte elementer. Tilstandene (steg 1 → 2, valgt dag, valgt tid, aktiv knapp) settes av scenens
// tick-funksjon (funksjoner.html, v2bTick). Dagene i kalenderen bygges der (neste fredag, som før).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const HER = import.meta.dirname, KILDE = path.join(HER, 'kilde'), UT = path.join(HER, 'ut');
fs.mkdirSync(UT, { recursive: true });
const steg1 = fs.readFileSync(path.join(KILDE, '3-tillegg-valgt.html'), 'utf8');
const steg2 = fs.readFileSync(path.join(KILDE, '6-tid-valgt.html'), 'utf8');
const W = 390, H = 848;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
const page = await ctx.newPage();
await page.route('**/*', r => r.abort());   // ingen nettverk: bare parsing
await page.setContent(steg2, { waitUntil: 'domcontentloaded' });

const res = await page.evaluate(({ steg1Html, W, H }) => {
  const P = new DOMParser();
  const d1 = P.parseFromString(steg1Html, 'text/html'), d2 = document;
  const ut = { feil: [] };
  const ta = (doc, sel) => { const e = doc.querySelector(sel); if (!e) ut.feil.push('mangler ' + sel); return e; };

  // ---------- MARKUP ----------
  const nav = ta(d1, '#flow-frame > nav.flow-nav').cloneNode(true);
  const ol  = ta(d1, '#flow-steps ol.steps').cloneNode(true);
  const s1  = ta(d1, '#flow-step1').cloneNode(true);
  const s2  = ta(d2, '#flow-dynamic').cloneNode(true);
  const fot = ta(d2, 'footer.flow-footer').cloneNode(true);
  s1.removeAttribute('hidden'); s2.removeAttribute('style');
  // Stegraden: steg 1-versjonen, li-ene får id-er (tick bytter klasser + «Steg X av 3»).
  const lis = ol.querySelectorAll('li'); lis.forEach((li, i) => li.id = 'ksV2Li' + (i + 1));
  s1.id = 'ksV2S1'; s2.id = 'ksV2S2';
  s1.querySelector('#flow-to-date').id = 'ksV2Cta1';
  // Kalenderen: måned + dager bygges av scenen (neste fredag). Tom celle-mal beholdes ikke.
  const mnd = s2.querySelector('.bhq-dv-topp h3'); mnd.id = 'ksV2Mnd';
  const dager = s2.querySelector('.bhq-dv-dager'); dager.id = 'ksV2Dager'; dager.innerHTML = '';
  // Klokkeslett: kildens 12 tider; «chosen» fjernes (tick setter den på 11:30 ved t23).
  const tider = s2.querySelector('#flow-times'); tider.id = 'ksV2Tider';
  tider.querySelector('.time-heading h3').id = 'ksV2TidDag';
  // Klokkeslettene: kildens EGEN knapp (button.time) klonet for hver tid i fredagens ledige hull (samme liste som scenen alltid
  // har brukt), og 11:00 er den som velges — SMS-påminnelsen sier «kl 11:00». Kildens tider gjaldt prod-dagen, ikke en fredag fram i tid.
  const TIDER = ['11:00', '11:30', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
  const grid = tider.querySelector('.time-grid'), mal = grid.querySelector('.time').cloneNode(true);
  mal.classList.remove('chosen'); mal.setAttribute('aria-pressed', 'false'); ['data-start', 'data-end', 'id'].forEach(a => mal.removeAttribute(a));
  grid.innerHTML = '';
  for (const x of TIDER) { const b = mal.cloneNode(true); b.textContent = x; b.dataset.label = x; if (x === '11:00') b.id = 'ksV2Tid'; grid.appendChild(b); }
  tider.querySelector('.selection-line').id = 'ksV2Valgt';
  // Knappen nederst: ekte «deaktivert» knapp + ekte aktiv knapp lagt OPPÅ (#ksNext2 tones inn ved t27 — samme
  // takt som før). Begge er sidens egen .primary; plasseringen er klonens eneste tillegg (ren layout).
  const akt = s2.querySelector('.flow-action'); akt.classList.add('ksv2-action');
  const aktiv = akt.querySelector('.primary'); aktiv.id = 'ksNext2';
  const av = aktiv.cloneNode(true); av.removeAttribute('id'); av.setAttribute('disabled', ''); akt.insertBefore(av, aktiv);
  // Rydd: id-er fra kilden (flow-*) prefikses; data-id/aria-pressed-støy beholdes ikke der det ikke trengs.
  const rot = document.createElement('div'); rot.className = 'v2b';
  const scale = document.createElement('div'); scale.className = 'pv-scale';
  const main = document.createElement('main'); main.className = 'frame';
  const flow = document.createElement('section'); flow.className = 'flow'; flow.id = 'flow-frame';
  const stegW = document.createElement('div'); stegW.id = 'flow-steps'; stegW.appendChild(ol);
  const body = document.createElement('div'); body.id = 'flow-body'; body.append(s1, s2);
  flow.append(nav, stegW, body, fot); main.appendChild(flow); scale.appendChild(main); rot.appendChild(scale);
  rot.querySelectorAll('[id]').forEach(e => { if (/^(flow-|v2-)/.test(e.id)) e.id = 'ksv2-' + e.id; });
  rot.querySelectorAll('[data-id]').forEach(e => e.removeAttribute('data-id'));
  rot.querySelectorAll('a').forEach(a => { a.removeAttribute('href'); a.removeAttribute('target'); a.removeAttribute('rel'); });
  rot.querySelectorAll('[tabindex]').forEach(e => e.removeAttribute('tabindex'));
  // Supermengde for regelutvalget: legg til alle tilstander klonen kan vise.
  const sup = rot.cloneNode(true);
  const dg = sup.querySelector('#ksV2Dager');
  dg.innerHTML = '<span class="bhq-dv-tom"></span>' + ['', ' er-idag', ' er-valgt', ' er-valgt er-idag'].map((k, i) =>
    `<button class="bhq-dv-dag${k}" type="button"${i === 0 ? ' disabled' : ''}>${i + 1}</button>`).join('');
  sup.querySelectorAll('.time')[0].classList.add('chosen');
  sup.querySelectorAll('.steps li').forEach((li, i) => li.classList.add(i === 0 ? 'done' : 'active'));
  document.body.innerHTML = ''; document.body.appendChild(sup);
  ut.html = rot.outerHTML;

  // ---------- CSS ----------
  const sheet = [...document.styleSheets].find(s => s.ownerNode && s.ownerNode.tagName === 'STYLE');
  const ROT = '.ks-scene .v2b';
  const stripPseudo = s => s.replace(/::?(before|after|placeholder|selection|marker|backdrop|-webkit-[\w-]+)/g, '')
    .replace(/:(not|has|is|where)\((?:[^()]|\([^()]*\))*\)/g, '').replace(/:[\w-]+(\([^)]*\))?/g, '');
  const idPrefiks = s => s.replace(/#(flow-[\w-]+|v2-[\w-]+)/g, '#ksv2-$1');
  const regler = [], statistikk = { inn: 0, beholdt: 0, droppetIkkeTreff: 0, droppetMedia: 0, droppetAnnet: 0, media: [] };
  const verdi = t => t.replace(/(-?[\d.]+)vw/g, (m, n) => (+n * W / 100).toFixed(2) + 'px')
    .replace(/(-?[\d.]+)(dvh|svh|lvh|vh)/g, (m, n) => (+n * H / 100).toFixed(2) + 'px')
    .replace(/'PlusJakartaSans'/g, "'Plus Jakarta Sans'").replace(/"PlusJakartaSans"/g, "'Plus Jakarta Sans'");
  function behandle(rule) {
    if (rule.type === CSSRule.MEDIA_RULE) {
      const treff = matchMedia(rule.conditionText).matches; statistikk.media.push(rule.conditionText + ' → ' + (treff ? 'beholdt' : 'droppet'));
      if (!treff) { statistikk.droppetMedia += rule.cssRules.length; return; }
      for (const r of rule.cssRules) behandle(r); return;
    }
    if (rule.type !== CSSRule.STYLE_RULE) { statistikk.droppetAnnet++; return; }
    statistikk.inn++;
    const deler = rule.selectorText.split(/,(?![^()]*\))/).map(s => s.trim());
    const ut = [];
    for (const s of deler) {
      if (/^html\.v2-lb-laast/.test(s)) continue;
      const rotTreff = s.match(/^(:root|html|body)(?=$|[\s>+~.:[])/);
      if (rotTreff) { const rest = s.slice(rotTreff[0].length).trim(); ut.push(rest ? ROT + ' ' + idPrefiks(rest) : ROT); continue; }
      const base = stripPseudo(idPrefiks(s)).trim() || '*';
      let treff = false; try { treff = !!sup.querySelector(base) || sup.matches(base); } catch (e) { treff = false; }
      if (treff) ut.push(ROT + ' ' + idPrefiks(s));
    }
    if (!ut.length) { statistikk.droppetIkkeTreff++; return; }
    statistikk.beholdt++;
    regler.push(ut.join(',') + '{' + verdi(rule.style.cssText) + '}');
  }
  for (const r of sheet.cssRules) behandle(r);
  ut.css = regler.join('\n'); ut.statistikk = statistikk;
  ut.vwIgjen = (ut.css.match(/[\d.]+(vw|vh|dvh|svh)/g) || []);
  ut.fixedIgjen = (ut.css.match(/position:\s*fixed/g) || []).length;
  return ut;
}, { steg1Html: steg1, W, H });
await browser.close();

if (res.feil.length) { console.error('AVBRYTER:', res.feil); process.exit(1); }
if (res.vwIgjen.length) { console.error('AVBRYTER: viewport-enheter igjen', res.vwIgjen); process.exit(1); }
if (res.fixedIgjen) { console.error('AVBRYTER: position:fixed igjen i klonen', res.fixedIgjen); process.exit(1); }
const hode = `/* ===== Selvbooking-telefonen: v2-bookingen (Grand Barber) — GENERERT av _utkast/ks-v2book/bygg.mjs, ikke rediger for hånd.
   Kilde: den ekte v2-bookingsiden i prod 18.11.2026 (sidens egen <style>), scopet til ${'.ks-scene .v2b'}. ===== */\n`;
fs.writeFileSync(path.join(UT, 'v2book.css'), hode + res.css + '\n');
fs.writeFileSync(path.join(UT, 'v2book.html'), res.html + '\n');
console.log(JSON.stringify(res.statistikk, null, 1));
console.log('css', (res.css.length / 1024).toFixed(1) + ' KB, html', (res.html.length / 1024).toFixed(1) + ' KB');

// --skriv: legg CSS + markup inn i site/no/funksjoner.html mellom markørene (nøyaktig ett par av hver, ellers avbryt).
if (process.argv.includes('--skriv')) {
  const F = path.resolve(HER, '../../site/no/funksjoner.html');
  let s = fs.readFileSync(F, 'utf8');
  const EOL = s.includes('\r\n') ? '\r\n' : '\n';
  const bytt = (a, b, innhold, navn) => {
    const na = s.split(a).length - 1, nb = s.split(b).length - 1;
    if (na !== 1 || nb !== 1) { console.error(`AVBRYTER ${navn}: markører ${na}/${nb}, ventet 1/1`); process.exit(1); }
    const i = s.indexOf(a) + a.length, j = s.indexOf(b);
    if (j < i) { console.error(`AVBRYTER ${navn}: markørene står i feil rekkefølge`); process.exit(1); }
    s = s.slice(0, i) + EOL + innhold.replace(/\r?\n/g, EOL).trimEnd() + EOL + s.slice(j);
  };
  bytt('/* KS-V2BOOK-CSS:START */', '/* KS-V2BOOK-CSS:SLUTT */', fs.readFileSync(path.join(UT, 'v2book.css'), 'utf8'), 'css');
  bytt('<!-- KS-V2BOOK-HTML:START -->', '<!-- KS-V2BOOK-HTML:SLUTT -->', res.html, 'html');
  fs.writeFileSync(F, s);
  console.log('skrevet inn i', F);
}
