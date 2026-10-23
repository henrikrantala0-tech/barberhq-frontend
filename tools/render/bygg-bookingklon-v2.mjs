// tools/render/bygg-bookingklon-v2.mjs — bygger forsidens bookingside-klon (#produkt, kort data-i="2")
// fra v2-malen og skriver den inn i site/no/index.html mellom to markørpar:
//   CSS:    /* <bookingklon-v2:css> */ … /* </bookingklon-v2:css> */
//   Markup: <!-- <bookingklon-v2:markup> --> … <!-- </bookingklon-v2:markup> -->
//
//   node tools/render/bygg-bookingklon-v2.mjs            (backend-sti: BHQ_BACKEND, ellers standard)
//
// METODE (samme som de andre klonene, se CLAUDE.md «Maskinell CSS-scoping»):
//   1. Den EKTE v2-sida rendres lokalt med backendens fillV2/fillBookV2 (fixtures/v2-fasit.mjs) og
//      kjøres i Chromium på 320 px mot lokale /api-mocker. Ingen kall ut; aldri prod.
//   2. Markupen hentes fra DOM-en i fire tilstander (forside med valgt tjeneste, dato+tid valgt,
//      opplysninger, kvittering) — steg 2–4 rendres av flyt-JS-en og finnes ikke i HTML-en fra serveren.
//      Utgangstilstanden (ingenting valgt) avledes ved å fjerne de samme klassene/attributtene som
//      sidas JS setter. Begge variantene brukes i CSS-utvelgelsen, så kjøretidsklasser (.selected,
//      .chosen, .open, .shown) tas med.
//   3. Stilarket leses som CSSOM fra den rendrede sida. En regel beholdes hvis BASIS-selektoren
//      (alle pseudo-klasser/-elementer strippet — querySelectorAll kaster på ::before) treffer noe.
//   4. Scoping: :root/html/body → «#produkt .pv-book», alt annet prefikses. @media evalueres mot
//      designbredden 320: min-/max-width og hover/pointer avgjøres her og nå; prefers-* beholdes.
//      vw/vh/dvh regnes om mot 320×693, med teller og en vakt som feiler hvis noe gjenstår.
//      position:fixed: vakt (eneste kilde er lightboxen, som ikke er med).
//   5. @font-face droppes: Inter og Plus Jakarta Sans kommer fra forsidens Google Fonts-lenke.
//   6. Treff telles FØR skriving; avvik → exit 1 og ingenting skrives.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startV2Server, gaaTil, DEMO_DATO, DEMO_TID } from './fixtures/v2-fasit.mjs';

const INDEX = path.resolve(import.meta.dirname, '../../site/no/index.html');
const W = 320, H = 693;
const ROT = '#produkt .pv-book';
const stopp = m => { console.error('AVBRUTT: ' + m); process.exit(1); };

const srv = await startV2Server();
const browser = await chromium.launch();

// ── 1–2: markup per tilstand ───────────────────────────────────────────────
async function hent(tilstand){
  const page = await browser.newPage({ viewport:{ width:W, height:H }, deviceScaleFactor:2 });
  const feil = []; page.on('pageerror', e => feil.push(e.message));
  await gaaTil(page, srv.base, tilstand);
  if (feil.length) stopp(`${tilstand}: ${feil.join('; ')}`);
  const ut = await page.evaluate(() => document.querySelector('main.frame').outerHTML);
  const css = tilstand === 'forside-valgt' ? await page.evaluate(() => {
    // CSSOM, ikke tekst: nettleseren har allerede parset, og cssText er normalisert.
    const ut = [];
    const gaa = (rules, media) => { for (const r of rules) {
      if (r instanceof CSSMediaRule) gaa(r.cssRules, r.conditionText);
      else if (r instanceof CSSStyleRule) ut.push({ t:'stil', media, sel:r.selectorText, body:r.style.cssText });
      else if (r instanceof CSSKeyframesRule) ut.push({ t:'kf', media, navn:r.name, tekst:r.cssText });
      else if (r instanceof CSSFontFaceRule) ut.push({ t:'ff' });
      else ut.push({ t:'ukjent', tekst:r.cssText });
    } };
    for (const s of document.styleSheets) gaa(s.cssRules, null);
    return ut;
  }) : null;
  const cssTekst = await page.evaluate(() => [...document.querySelectorAll('style')].map(s => s.textContent).join('\n'));
  await page.close();
  return { html:ut, css, cssTekst };
}
const forside = await hent('forside-valgt');
const dato    = await hent('tid');
const skjema  = await hent('skjema');
const kvitt   = await hent('kvittering');
if (forside.cssTekst !== dato.cssTekst) stopp('forsiden og bookingsida har ulikt stilark — utvelgelsen må kjøres per side');

// Klon-markupen bygges i en tom side med DOM-API-er (ikke regex på HTML).
const page = await browser.newPage({ viewport:{ width:W, height:H } });
await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
const klon = await page.evaluate(({ forside, dato, skjema, kvitt, DEMO_DATO, DEMO_TID }) => {
  const lag = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; };
  const tell = {};
  const krev = (rot, sel, n, hva) => { const x = rot.querySelectorAll(sel); tell[hva] = x.length;
    if (x.length !== n) throw new Error(`${hva}: ${x.length} treff på ${sel}, ventet ${n}`); return x[0]; };
  function rens(rot){
    rot.querySelectorAll('script, .v2-lb, [hidden]:not(.v2-valg-total)').forEach(e => e.remove());
    rot.querySelectorAll('*').forEach(e => {
      for (const a of ['id','for','aria-controls','aria-describedby','aria-labelledby','tabindex','target','rel',
                       'nonce','href','onclick','data-full','novalidate','aria-live'])
        e.removeAttribute(a);
      if (e.tagName === 'IMG') e.setAttribute('src', e.getAttribute('src').replace(/^\//, ''));
      if (e.tagName === 'BUTTON' && e.getAttribute('type') === 'submit') e.setAttribute('type', 'button');
      if (e.tagName === 'INPUT') { e.removeAttribute('maxlength'); e.removeAttribute('name'); }
    });
    // <form> → <div>: klonen skal aldri kunne sende noe, heller ikke ved et klikk i kortet.
    rot.querySelectorAll('form').forEach(f => { const d = document.createElement('div');
      d.setAttribute('style', f.getAttribute('style') || ''); while (f.firstChild) d.appendChild(f.firstChild); f.replaceWith(d); });
    rot.removeAttribute('id');
    return rot;
  }
  // ── Forsiden ──
  const f = lag(forside);
  const svc = krev(f, `.service[data-id="svc-skinfade"]`, 1, 'tjeneste Skinfade');
  const grp = krev(f, '.v2-tillegg', 1, 'tilleggsblokk');
  const tot = krev(f, '.v2-valg-total', 1, 'total');
  const nst = krev(f, '#front-continue', 1, 'videre-knapp');
  krev(f, '.v2-pane:not([hidden])', 1, 'synlig fane');
  svc.classList.add('pv-svc'); grp.classList.add('pv-tillegg'); tot.classList.add('pv-total');
  nst.classList.add('pv-neste1', 'pv-anim-btn');
  rens(f);
  const fValgt = f.outerHTML;
  svc.classList.remove('selected'); svc.setAttribute('aria-checked', 'false'); svc.setAttribute('aria-expanded', 'false');
  grp.classList.remove('open'); grp.setAttribute('aria-hidden', 'true'); grp.setAttribute('inert', '');
  tot.hidden = true; nst.disabled = true;
  const fStart = f.outerHTML;
  // ── Steg 2: dato og tid ──
  const d = lag(dato);
  const dag = krev(d, `.day[data-date="${DEMO_DATO}"].chosen`, 1, 'valgt dag');
  const tider = krev(d, '#flow-times > .time-panel', 1, 'tidspanel');
  const slot = krev(d, `.time[data-label="${DEMO_TID}"].chosen`, 1, 'valgt tid');
  const sel = krev(d, '#flow-selline', 1, 'valgt-linje');
  const n2 = krev(d, '#flow-to-details', 1, 'Opplysninger-knapp');
  dag.classList.add('pv-dag'); tider.classList.add('pv-tider'); slot.classList.add('pv-slot', 'pv-anim-slot');
  sel.classList.add('pv-selline'); n2.classList.add('pv-next2', 'pv-anim-btn');
  sel.dataset.pvValgt = sel.textContent;
  rens(d);
  const dValgt = d.outerHTML;
  dag.classList.remove('chosen'); dag.setAttribute('aria-pressed', 'false');
  slot.classList.remove('chosen'); slot.setAttribute('aria-pressed', 'false');
  // Teksten før et klokkeslett er valgt — ordrett fra booking-flow.cjs (loadSlots).
  sel.textContent = sel.dataset.pvTom = 'Velg et klokkeslett for å fortsette.'; n2.disabled = true; tider.hidden = true;
  const dStart = d.outerHTML;
  // ── Steg 3: opplysninger ──
  const s = lag(skjema);
  krev(s, 'input[autocomplete="name"]', 1, 'navnefelt'); krev(s, 'input[autocomplete="tel"]', 1, 'telefonfelt');
  krev(s, '.flow-consent-slot.shown', 1, 'samtykke (shown)');
  krev(s, '#flow-sub', 1, 'Bekreft time').classList.add('pv-send', 'pv-anim-btn');
  rens(s);
  // ── Kvittering ──
  const k = lag(kvitt);
  krev(k, '.confirmation-title', 1, 'kvitteringstittel');
  rens(k);
  return { fStart, fValgt, dStart, dValgt, s:s.outerHTML, k:k.outerHTML, tell };
}, { forside:forside.html, dato:dato.html, skjema:skjema.html, kvitt:kvitt.html, DEMO_DATO, DEMO_TID });
console.log('markup-treff:', klon.tell);

// ── 3: CSS-utvelgelse ──────────────────────────────────────────────────────
const PSEUDO = /::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g;
// Kombinatorer normaliseres FØR tomme sammensetninger fylles med *: «.a > :hover» → «.a>*». (Uten
// normaliseringen ble «.a > b» til «.a >* b» — barnebarn i stedet for barn — og regelen falt stille ut.)
const basis = sel => sel.replace(PSEUDO, '').replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').trim()
  .replace(/(^|[>+~ (])(?=[>+~ )]|$)/g, '$1*');
const delListe = sel => { const ut = []; let dyb = 0, cur = '';
  for (const c of sel) { if (c === '(' || c === '[') dyb++; if (c === ')' || c === ']') dyb--;
    if (c === ',' && !dyb) { ut.push(cur.trim()); cur = ''; } else cur += c; }
  if (cur.trim()) ut.push(cur.trim()); return ut; };
const ROOTSEL = /^(:root|html|body)(?![\w-])/;
await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' +
  [klon.fStart, klon.fValgt, klon.dStart, klon.dValgt, klon.s, klon.k].join('') + '</body></html>');
const stilRegler = forside.css.filter(r => r.t === 'stil');
const ukjente = forside.css.filter(r => r.t === 'ukjent');
if (ukjente.length) stopp('ukjent regeltype: ' + ukjente.map(u => u.tekst.slice(0, 60)).join(' | '));
const treff = await page.evaluate(lister => lister.map(sels => sels.some(s => {
  try { return /^(:root|html|body)(?![\w-])/.test(s) || document.querySelector(s) !== null; }
  catch (e) { throw new Error('ugyldig basis-selektor: ' + s); } })),
  stilRegler.map(r => delListe(r.sel).map(basis)));
await page.close();

// @media mot designbredden.
function mediaGjelder(m){
  if (!m) return true;
  if (/prefers-(reduced-motion|color-scheme)/.test(m) && !/width|hover|pointer/.test(m)) return 'behold';
  let ok = true, kjent = false;
  m.replace(/\(\s*min-width:\s*(\d+)px\s*\)/g, (_, n) => { kjent = true; ok = ok && W >= +n; });
  m.replace(/\(\s*max-width:\s*(\d+)px\s*\)/g, (_, n) => { kjent = true; ok = ok && W <= +n; });
  if (/hover|pointer/.test(m)) { kjent = true; ok = false; }   // klonen er en telefon: ingen hover
  if (!kjent) stopp('ukjent @media: ' + m);
  return ok;
}
let vwTeller = 0;
const omregn = body => body
  .replace(/(-?\d*\.?\d+)vw\b/g, (_, n) => { vwTeller++; return +(n * W / 100).toFixed(3) + 'px'; })
  .replace(/(-?\d*\.?\d+)(d|s|l)?vh\b/g, (_, n) => { vwTeller++; return +(n * H / 100).toFixed(3) + 'px'; })
  .replace(/["']?PlusJakartaSans["']?/g, '"Plus Jakarta Sans"');
const scope = sel => delListe(sel).map(s => ROOTSEL.test(s) ? s.replace(ROOTSEL, ROT).replace(/^(#produkt \.pv-book)\s+(html|body)\b/, '$1') : `${ROT} ${s}`).join(', ');
const brukteKf = new Set();
const linjer = []; let beholdt = 0, droppetTreff = 0, droppetMedia = 0, aapenMedia = null;
const lukk = () => { if (aapenMedia) { linjer.push('}'); aapenMedia = null; } };
stilRegler.forEach((r, i) => {
  if (!treff[i]) { droppetTreff++; return; }
  const g = mediaGjelder(r.media);
  if (!g) { droppetMedia++; return; }
  const body = omregn(r.body).replace(/animation(-name)?:\s*([^;]*)/g, (m0, n, v) =>
    m0.replace(/\b(riseIn|[a-zA-Z][\w-]*)\b/g, w => { if (forside.css.some(k => k.t === 'kf' && k.navn === w)) { brukteKf.add(w); return 'pvb-' + w; } return w; }));
  if (g === 'behold') { if (aapenMedia !== r.media) { lukk(); linjer.push(`@media ${r.media}{`); aapenMedia = r.media; } }
  else lukk();
  linjer.push(`${scope(r.sel)}{${body}}`); beholdt++;
});
lukk();
for (const k of forside.css.filter(k => k.t === 'kf' && brukteKf.has(k.navn)))
  linjer.push(k.tekst.replace(/@keyframes\s+([\w-]+)/, '@keyframes pvb-$1').replace(/\n\s*/g, ' '));
const kildeCss = linjer.join('\n');
if (/\d(vw|vh|dvh|svh|lvh|vmin|vmax)\b/.test(kildeCss)) stopp('viewport-enheter igjen etter omregning');
if (/position:\s*fixed/.test(kildeCss)) stopp('position:fixed i klonet CSS');
if (/@font-face/.test(kildeCss)) stopp('@font-face i klonet CSS');
console.log(`CSS: ${stilRegler.length} regler → ${beholdt} beholdt (${droppetTreff} treffer ingenting, ${droppetMedia} @media usann ved ${W}px), ${vwTeller} viewport-enheter regnet om, keyframes: ${[...brukteKf].join(',') || 'ingen'}`);

// ── 4: blokkene som skrives inn ────────────────────────────────────────────
const dato_ = new Date().toISOString().slice(0, 10);
const CSS = `/* <bookingklon-v2:css> — GENERERT av tools/render/bygg-bookingklon-v2.mjs (${dato_}). Ikke rediger for hånd;
   endre skriptet eller v2-malen i backend og bygg på nytt.
   ===== KLONET: bookingsida, v2-malen =========================================================
   Kilde: backendens v2-mal (forside.v2 + book.v2 + v2-css.cjs + booking-flow.cjs), rendret lokalt med
   fillV2/fillBookV2 for demobarberen Grand Barber: lys modus, aksent blå (#0071e3), sjappenavn i
   standardfonten (Plus Jakarta Sans 700, V2_STANDARD_FONT). Fire tilstander hentet fra DOM-en etter at
   flyt-JS-en har rendret dem. CSS valgt maskinelt mot klon-markupen (begge tilstandsvarianter), scopet
   under ${ROT}; :root/html/body → roten. @media avgjort ved ${W}px, vw/vh regnet om mot ${W}×${H}.
   Fonter: Inter + Plus Jakarta Sans fra Google Fonts-lenka i <head> (ingen @font-face her).
   Innholdet er klonens demodata; stil og struktur er v2-malens. */
${kildeCss}
/* ↑ Klonet CSS slutter her. Under: klonens egne regler — tilstander og nøytralisering, ingen spacing. */
${ROT}{position:relative;height:100%;overflow:hidden;min-height:0}
/* Skjermflatens origo pinnes (samme grunn som før: roten er sentrerende i kilden). */
${ROT} .pv-scale{position:absolute;top:0;left:0}
${ROT} .pv-stage{width:${W}px;background:var(--bg)}
/* Tilstander — én klasse på .pv-book, samme som scene-JS-en og render-testene setter:
   (ingen) forsiden · vis-sheet bookingflyten, steg «Dato og tid» · vis-skjema steg «Opplysninger» ·
   vis-success kvitteringen (sluttilstand; vinner over de andre). vis-sheet beholder navnet fra v1-klonen
   så frysBooking/testene ikke må lære et nytt ord for «flyten er åpen». */
${ROT} .pv-v2-flyt, ${ROT} .pv-v2-skjema, ${ROT} .pv-v2-kvittering{display:none}
${ROT}.vis-sheet .pv-v2-forside, ${ROT}.vis-success .pv-v2-forside{display:none}
${ROT}.vis-sheet .pv-v2-flyt, ${ROT}.vis-success .pv-v2-flyt{display:block}
${ROT}.vis-skjema .pv-v2-dato{display:none}
${ROT}.vis-skjema .pv-v2-skjema{display:block}
${ROT}.vis-success .pv-v2-dato, ${ROT}.vis-success .pv-v2-skjema{display:none}
${ROT}.vis-success .pv-v2-kvittering{display:block}
/* «Scroll» i en klon som ikke kan scrolle: flyten flyttes, styrt av --pv-scroll (målt i scene-JS-en). */
${ROT}.vis-scroll .pv-v2-flyt{transform:translateY(var(--pv-scroll,0px));transition:transform .55s cubic-bezier(.4,0,.2,1)}
${ROT}.pv-hopp .pv-v2-flyt{transition:none}
@media (prefers-reduced-motion:reduce){${ROT}.vis-scroll .pv-v2-flyt{transition:none}}
/* </bookingklon-v2:css> */`;
const ind = '          ';
const MARKUP = `${ind}<!-- <bookingklon-v2:markup> — GENERERT av tools/render/bygg-bookingklon-v2.mjs (${dato_}). Ikke rediger for hånd. -->
${ind}<div class="pv-book" id="pvBook"><div class="pv-scale"><div class="pv-stage">
${ind}  <div class="pv-v2-forside">${klon.fStart}</div>
${ind}  <div class="pv-v2-flyt">
${ind}    <div class="pv-v2-dato">${klon.dStart}</div>
${ind}    <div class="pv-v2-skjema">${klon.s}</div>
${ind}    <div class="pv-v2-kvittering">${klon.k}</div>
${ind}  </div>
${ind}</div></div></div>
${ind}<!-- </bookingklon-v2:markup> -->`;

// ── 5: skriv inn, tell FØR skriving ────────────────────────────────────────
let src = fs.readFileSync(INDEX, 'utf8');
if (src.includes('\r\n')) stopp('index.html har CRLF — skriptet forventer ren LF');
const erstatt = (start, slutt, ny, hva) => {
  const a = src.split(start).length - 1, b = src.split(slutt).length - 1;
  if (a !== 1 || b !== 1) stopp(`${hva}: ${a}×start / ${b}×slutt, ventet 1/1`);
  const i = src.indexOf(start), j = src.indexOf(slutt, i) + slutt.length;
  // Linjestart: bytt hele linjer, ikke midt i en innrykket linje.
  const li = src.lastIndexOf('\n', i) + 1;
  console.log(`${hva}: linje ${src.slice(0, li).split('\n').length}–${src.slice(0, j).split('\n').length}, ${j - li} → ${ny.length} byte`);
  src = src.slice(0, li) + ny + src.slice(j);
};
erstatt('/* <bookingklon-v2:css>', '/* </bookingklon-v2:css> */', CSS, 'CSS');
erstatt(`${ind}<!-- <bookingklon-v2:markup>`, '<!-- </bookingklon-v2:markup> -->', MARKUP, 'markup');
fs.writeFileSync(INDEX, src);
console.log('skrevet: ' + INDEX);
await browser.close(); srv.close();
