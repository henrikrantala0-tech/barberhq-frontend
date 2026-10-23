// Booking-klonens tilstander (#produkt, kort data-i="2") mot den EKTE v2-sida, tilstand for tilstand.
//
// Fasiten er v2-malen rendret LOKALT med backendens egne fyll-funksjoner (fixtures/v2-fasit.mjs) for
// samme demobarber, på 320 px — samme designbredde som klonen. Ingen nettverk ut: fasit-sida får bare
// snakke med den lokale serveren (alt annet aborteres), og /api/** er mocket der, også booking-POST-en
// som gir kvitteringen. Klonen lastes fra site/ med alt utenom localhost + fonter blokkert.
//
// To dommer per tilstand:
//   1. COMPUTED STYLE: synlige elementer i klonens skjerm og i fasitens <main> gås i takt (samme tagg +
//      klasser, pv-*-hooks ignorert), og et sett typografi/farge/boks-egenskaper sammenlignes. getComputedStyle
//      gir designverdiene FØR klonens transform:scale, så tallene er direkte sammenlignbare. Dette fanger
//      kollisjoner med landingssidas egne regler (samme klassenavn) som er usynlige på øyemål.
//   2. Skjema-tilstanden: «Bekreft time» og infolinjene står innenfor skjermen etter «scrollingen».
// Bildene monteres side om side i .render-ut/likhet-booking-tilstander.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';
import { startV2Server, gaaTil, DEMO_NAVN, DEMO_TLF } from './fixtures/v2-fasit.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.jpg':'image/jpeg' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type':MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const LOKAL = `http://localhost:${server.address().port}`;
const fasitSrv = await startV2Server();

const TILSTANDER = [
  { n:1, navn:'forside',        fasit:'forside' },
  { n:2, navn:'tjeneste-valgt', fasit:'forside-valgt' },
  { n:3, navn:'velg-dato',      fasit:'dato' },
  { n:4, navn:'tid-valgt',      fasit:'tid' },
  { n:5, navn:'opplysninger',   fasit:'skjema' },
  { n:6, navn:'bekreftelse',    fasit:'kvittering' },
];
const EGENSKAPER = ['display','font-family','font-size','font-weight','line-height','letter-spacing','color',
  'background-color','text-align','text-transform','border-top-width','border-top-color','border-bottom-width',
  'border-bottom-color','border-left-width','border-top-left-radius','padding-top','padding-right','padding-bottom',
  'padding-left','margin-top','margin-right','margin-bottom','margin-left','gap','opacity','box-shadow','width','height'];

// Kjøres i nettleseren: synlige elementer under rot, i dokumentrekkefølge, med stilene over.
function maal(rotSel, EGENSKAPER){
  const rot = document.querySelector(rotSel);
  const ut = [];
  const gaa = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    // Lukket tilleggsblokk har null høyde; klonen har den stående under Skinfade (der sidas skript
    // flytter den ved valg), fasiten bakerst i lista. Usynlig i begge — hoppes over.
    if (el.classList.contains('v2-tillegg') && !el.classList.contains('open')) return;
    const kl = [...el.classList].filter(k => !/^pv-/.test(k)).sort().join('.');
    const st = {};
    for (const p of EGENSKAPER) {
      let v = cs.getPropertyValue(p);
      if (p === 'font-family') v = v.replace(/["'\s]/g, '').toLowerCase();
      if (p === 'width' || p === 'height') v = Math.round(parseFloat(v) || 0);
      st[p] = v;
    }
    // klonens <form> er en <div> (klonen skal aldri kunne sende noe)
    ut.push({ id:(el.tagName === 'FORM' ? 'div' : el.tagName.toLowerCase()) + (kl ? '.' + kl : ''), tekst:(el.childElementCount ? '' : el.textContent.trim().slice(0, 24)), pil:/[←→]/.test(el.textContent), st });
    for (const c of el.children) gaa(c);
  };
  gaa(rot);
  return ut;
}

const browser = await chromium.launch();
const rapport = [], klonBilder = {}, fasitBilder = {};
let klonPx = null;
for (const t of TILSTANDER) {
  // ── Klonen ──
  const page = await browser.newPage({ viewport:{ width:420, height:1000 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ut = [];
  await page.route(u => !u.href.startsWith(LOKAL) && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), r => { ut.push(r.request().url()); r.abort(); });
  await page.goto(`${LOKAL}/no/index.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const klonInfo = await page.evaluate(({ steg, navn, tlf }) => {
    document.querySelectorAll('#scene .mock').forEach(x => x.classList.toggle('on', x.dataset.i === '2'));
    const st = document.createElement('style');
    st.textContent = '#produkt .pv-book, #produkt .pv-book *{transition:none !important;animation:none !important}';
    document.head.appendChild(st);
    const b = document.getElementById('pvBook');
    const q = s => b.querySelector(s);
    const svc = q('.pv-svc'), dag = q('.pv-dag'), tider = q('.pv-tider'), slot = q('.pv-slot'),
          linje = q('.pv-selline'), next2 = q('.pv-next2');
    // Fra nullstilt basis (markupens utgangstilstand), samme DOM-steg som scene-JS-en.
    b.className = 'pv-book'; b.style.setProperty('--pv-scroll', '0px');
    const valgt = steg !== 'forside';
    svc.classList.toggle('selected', valgt); svc.setAttribute('aria-checked', String(valgt)); svc.setAttribute('aria-expanded', String(valgt));
    q('.pv-tillegg').classList.toggle('open', valgt); q('.pv-total').hidden = !valgt; q('.pv-neste1').disabled = !valgt;
    const tid = ['tid', 'skjema', 'kvittering'].includes(steg);
    dag.classList.toggle('chosen', tid); tider.hidden = !tid; slot.classList.toggle('chosen', tid);
    linje.textContent = tid ? linje.dataset.pvValgt : linje.dataset.pvTom; next2.disabled = !tid;
    if (['dato', 'tid'].includes(steg)) b.classList.add('vis-sheet');
    if (steg === 'skjema') {
      b.classList.add('vis-sheet', 'vis-skjema', 'vis-scroll');
      q('input[autocomplete="name"]').value = navn; q('input[autocomplete="tel"]').value = tlf;
    }
    if (steg === 'kvittering') b.classList.add('vis-success');
    const rot = { forside:'.pv-v2-forside', 'forside-valgt':'.pv-v2-forside', dato:'.pv-v2-dato', tid:'.pv-v2-dato',
                  skjema:'.pv-v2-skjema', kvittering:'.pv-v2-kvittering' }[steg];
    let knapp = '—';
    if (steg === 'skjema') {   // samme måling som settScroll() i scenen
      const skjerm = b.closest('.iph-screen'), sk = q('.pv-scale').getBoundingClientRect().width / 320;
      const info = q('.pv-v2-skjema .flow-info');
      const over = (info.getBoundingClientRect().bottom - (skjerm.getBoundingClientRect().bottom - 24 * sk)) / sk;
      b.style.setProperty('--pv-scroll', (over > 0 ? -Math.ceil(over) : 0) + 'px'); void b.offsetHeight;
      const s0 = skjerm.getBoundingClientRect(), inne = el => { const r = el.getBoundingClientRect(); return r.top >= s0.top - 1 && r.bottom <= s0.bottom + 1; };
      knapp = inne(q('.pv-send')) && inne(info) ? 'ja' : 'NEI';
    }
    // Alle id-er unike på hele sida.
    const ider = [...document.querySelectorAll('[id]')].map(e => e.id);
    const doble = ider.filter((x, i) => ider.indexOf(x) !== i);
    return { rot:'#pvBook ' + rot + ' > main', knapp, doble, overflow:document.documentElement.scrollWidth - innerWidth };
  }, { steg:t.fasit, navn:DEMO_NAVN, tlf:DEMO_TLF });
  const kMaal = await page.evaluate(`(${maal.toString()})(${JSON.stringify(klonInfo.rot)}, ${JSON.stringify(EGENSKAPER)})`);
  await page.waitForTimeout(300);
  const fil = `${OUT}/klon-tilstand-${t.n}-${t.navn}.png`;
  await page.locator('#scene .mock[data-i="2"] .iph-screen').screenshot({ path:fil });
  klonBilder[t.n] = fil;
  if (!klonPx) { const bb = fs.readFileSync(fil); klonPx = [bb.readUInt32BE(16), bb.readUInt32BE(20)]; }
  await page.close();

  // ── Fasiten ──
  const fp = await browser.newPage({ viewport:{ width:320, height:Math.round(klonPx[1] / (klonPx[0] / 320)) },
    deviceScaleFactor:klonPx[0] / 320 });
  const ferr = []; fp.on('pageerror', e => ferr.push(e.message));
  await gaaTil(fp, fasitSrv.base, t.fasit);
  if (t.fasit === 'skjema') await fp.evaluate(() => { const i = document.querySelector('.flow-info'); scrollTo(0, Math.max(0, i.getBoundingClientRect().bottom + scrollY - innerHeight + 24)); });
  // Flyt-JS-en fokuserer stegtittelen (tabindex=-1); :focus-visible-rammen er ikke en del av utseendet.
  await fp.evaluate(() => document.activeElement && document.activeElement.blur());
  const fMaal = await fp.evaluate(`(${maal.toString()})("main.frame", ${JSON.stringify(EGENSKAPER)})`);
  fasitBilder[t.n] = `${OUT}/fasit-tilstand-${t.n}-${t.navn}.png`;
  await fp.screenshot({ path:fasitBilder[t.n] });
  await fp.close();

  // ── Sammenlign i takt ──
  const avvik = [];
  const n = Math.max(kMaal.length, fMaal.length);
  for (let i = 0; i < n && avvik.length < 12; i++) {
    const k = kMaal[i], f = fMaal[i];
    if (!k || !f || k.id !== f.id) { avvik.push(`#${i}: klon ${k ? k.id : '—'} ≠ fasit ${f ? f.id : '—'}`); break; }
    for (const p of EGENSKAPER) {
      let a = k.st[p], b = f.st[p];
      if ((p === 'width' || p === 'height') && Math.abs(a - b) <= 1) continue;
      // KJENT AVVIK: Google Fonts' Inter (forsidens) mangler pilene ← →, så de tegnes i reservefonten
      // og blir ~2 px smalere enn med backendens Inter. Kun bredden, kun elementer med pil, maks 3 px.
      if (p === 'width' && k.pil && Math.abs(a - b) <= 3) continue;
      if (a !== b) avvik.push(`${k.id}${k.tekst ? ' «' + k.tekst + '»' : ''} ${p}: klon ${a} / fasit ${b}`);
    }
  }
  rapport.push({ tilstand:t.n, navn:t.navn, elementer:`${kMaal.length}/${fMaal.length}`, avvik:avvik.length,
    'knapp synlig':klonInfo.knapp, 'doble id':klonInfo.doble.length, overflow:klonInfo.overflow,
    jsfeil:errs.concat(ferr).length ? errs.concat(ferr).join(';').slice(0, 40) : 'ingen',
    'kall ut':ut.length });
  if (avvik.length) console.log(`\nTILSTAND ${t.n} ${t.navn} — avvik:\n  ` + avvik.join('\n  '));
}

// ── Montasje ──
{
  const b64 = f => fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : '';
  const rader = TILSTANDER.map(t => `<div class="rad"><div class="tit">${t.n}. ${t.navn.replace(/-/g, ' ')}</div><div class="par">
    <figure><img src="${b64(klonBilder[t.n])}"><figcaption>KLON — #produkt</figcaption></figure>
    <figure><img src="${b64(fasitBilder[t.n])}"><figcaption>FASIT — v2-malen, lokal render @320</figcaption></figure></div></div>`).join('');
  const page = await browser.newPage({ viewport:{ width:klonPx[0] * 2 + 90, height:1000 }, deviceScaleFactor:1 });
  await page.setContent(`<!DOCTYPE html><meta charset="utf-8"><style>body{background:#0a0a0a;color:#fff;font:14px system-ui;margin:0;padding:24px}
    .rad{margin-bottom:26px}.tit{font-weight:700;margin-bottom:10px}.par{display:flex;gap:18px}figure{margin:0}img{display:block;border-radius:8px}
    figcaption{color:#8a8a8a;font-size:11px;margin-top:6px}</style><h1 style="font-size:18px">Booking v2 — klon mot fasit</h1>${rader}`);
  await page.screenshot({ path:`${OUT}/likhet-booking-tilstander.png`, fullPage:true });
  await page.close();
  console.log('\nmontert → .render-ut/likhet-booking-tilstander.png');
}
console.table(rapport);
sjekk(rapport.every(r => r.avvik === 0), 'Computed style: klonen = v2-fasiten i alle seks tilstander');
sjekk(rapport.every(r => r.elementer.split('/')[0] === r.elementer.split('/')[1]), 'Samme synlige elementer som fasiten');
sjekk(rapport.every(r => r['knapp synlig'] !== 'NEI'), '«Bekreft time» + infolinjene står innenfor skjermen');
sjekk(rapport.every(r => r['doble id'] === 0), 'Ingen doble id-er på sida');
sjekk(rapport.every(r => r.overflow <= 0), 'Ingen horisontal overflow');
sjekk(rapport.every(r => r.jsfeil === 'ingen'), 'Ingen JS-feil (klon og fasit)');
await browser.close(); server.close(); fasitSrv.close();
ferdig();
