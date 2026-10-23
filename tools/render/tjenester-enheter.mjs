// tools/render/tjenester-enheter.mjs — Tjenester-fanen: fast enhet inni pris/min-feltene, plassholdere, overskriftsraden (22.10.2026).
//
//   node tools/render/tjenester-enheter.mjs
//
// Sjekker (320 / 375 / 1280, hovedtjenester + tillegg):
//   · «kr» / «min» står inni feltet når det har verdi (.svc-enhet-tekst) — og er ALDRI en del av value
//   · tomt felt: bare plassholderen, enheten skjult (:placeholder-shown) — og den kommer når man skriver
//   · tallet går aldri under enheten: 4-sifret pris (1200) og 3-sifret varighet (120) har luft til enheten, ingen klipp
//   · aria-label «Pris i kroner» / «Varighet i minutter» / «Navn på tjenesten»
//   · ny tom rad: value '' og plassholdere «Navn på tjenesten» / «Pris» / «Min», uten enhet
//   · overskriftsraden: skjult når en rad har brukket (mobil), synlig og rett over kolonnene når ingen har det (desktop)
//   · lagring sender rene tall (number, ingen «kr»/«min»), tom ny rad uten navn sendes ikke
//   · ingen horisontal overflow, ingen JS-feil, ingen request mot prod
// Skjermbilder → .render-ut/tjenester-enheter/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { installerDinSideMock } from './fixtures/dinside-v2.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT = path.resolve(import.meta.dirname, '../../.render-ut/tjenester-enheter');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/dashboard.html#tjenester`;
const browser = await chromium.launch();
const feil = [];
const sjekk = (ok, hva, detalj = '') => { if (!ok) feil.push({ hva, detalj }); return ok; };

const TJ = { hoved: [{ name: 'Skin fade', price: 1200, min: 120, description: 'Med vask og styling' }, { name: 'Klipp', price: 350, min: 30 }],
             tillegg: [{ name: 'Skjegg', price: 150, min: 15 }, { name: 'Hårvask', price: 1200, min: 120 }] };

// Måler hvert pris/min-felt: enhetens tekst, plass mellom tallets høyre kant og enhetens venstre kant, klipp.
const MAAL = () => [...document.querySelectorAll('#hovedList .svc-enhet, #tilleggList .svc-enhet')].map(w => {
  const inp = w.querySelector('input'), cs = getComputedStyle(inp), en = w.querySelector('.svc-enhet-tekst'), etter = getComputedStyle(en);
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const tekstB = c.measureText(inp.value || inp.placeholder).width;
  const enhetB = en.getBoundingClientRect().width;
  const ir = inp.getBoundingClientRect();
  const tekstHoyre = ir.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) + tekstB;
  const enhetVenstre = ir.right - parseFloat(etter.right) - enhetB;
  return { felt: inp.dataset.f, liste: inp.dataset.l, value: inp.value, enhet: etter.display !== 'none' ? en.textContent : null, aria: inp.getAttribute('aria-label'),
    luft: Math.round(enhetVenstre - tekstHoyre), klipp: inp.scrollWidth > inp.clientWidth + 1, b: Math.round(ir.width) };
});

for (const bredde of [320, 375, 1280]) {
  for (const sm of ['v2', 'v1']) {
    if (sm === 'v1' && bredde === 1280) continue;
    const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('bhq-theme', 'dark'); } catch (_) {} });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const m = await installerDinSideMock(page, { sidemal: sm, tjenester: TJ });
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('.nav button[data-panel="tjenester"]').click()); await page.waitForTimeout(1000);
    const k = `${bredde} ${sm}`;

    // Enhet + luft + aria på utfylte felt
    const f = await page.evaluate(MAAL);
    sjekk(f.length === 8, `${k}: 8 pris/min-felt med enhet`, String(f.length));
    sjekk(f.every(x => x.enhet === (x.felt === 'price' ? 'kr' : 'min')), `${k}: enheten «kr»/«min» står inni feltet med verdi`, JSON.stringify(f.map(x => x.enhet)));
    sjekk(f.every(x => /^\d+$/.test(x.value)), `${k}: value er bare tallet (ingen enhet i verdien)`, JSON.stringify(f.map(x => x.value)));
    sjekk(f.every(x => x.luft >= 4 && !x.klipp), `${k}: tallet går aldri under enheten, ingen klipp (1200 kr / 120 min)`, JSON.stringify(f.filter(x => x.luft < 4 || x.klipp)));
    sjekk(f.every(x => x.aria === (x.felt === 'price' ? 'Pris i kroner' : 'Varighet i minutter')), `${k}: aria-label på pris/min`);
    const navnAria = await page.$$eval('#hovedList .svc-navn, #tilleggList .svc-navn', es => es.every(e => e.getAttribute('aria-label') === 'Navn på tjenesten'));
    sjekk(navnAria, `${k}: aria-label på navnefeltet`);

    // Overskriftsraden: står bare over kolonnene (≤ 2 px: overskriften har 2 px innrykk for teksten)
    const hode = await page.evaluate(() => [['#svcHodeH', '#hovedList'], ['#svcHodeT', '#tilleggList']].map(([h, l]) => {
      const hd = document.querySelector(h), rader = [...document.querySelector(l).children];
      const brukket = rader.some(r => r.querySelector('.svc-tall').offsetTop > r.querySelector('.svc-navn').offsetTop + 2);
      const synlig = hd.offsetParent !== null;
      const hp = hd.querySelector('.svc-pris').getBoundingClientRect(), rp = rader[0].querySelector('.svc-enhet-pris').getBoundingClientRect();
      const hm = hd.querySelector('.svc-min').getBoundingClientRect(), rm = rader[0].querySelector('.svc-enhet-min').getBoundingClientRect();
      return { h, brukket, synlig, avvikPris: Math.round(Math.abs(hp.left - rp.left)), avvikMin: Math.round(Math.abs(hm.left - rm.left)) };
    }));
    sjekk(hode.every(x => x.synlig === !x.brukket), `${k}: overskriftsraden skjult når rader brekker, ellers synlig`, JSON.stringify(hode));
    sjekk(hode.every(x => !x.synlig || (x.avvikPris <= 2 && x.avvikMin <= 2)), `${k}: synlig overskrift står rett over kolonnene`, JSON.stringify(hode));
    if (bredde <= 375) sjekk(hode.every(x => !x.synlig), `${k}: overskriftsraden er borte på mobil`, JSON.stringify(hode));
    else sjekk(hode.every(x => x.synlig), `${k}: overskriftsraden står på desktop`, JSON.stringify(hode));

    // Beskrivelse (v2-kun) og v1 uten
    const besk = await page.$$eval('.svc-description', es => es.map(e => ({ aria: e.getAttribute('aria-label'), fs: parseFloat(getComputedStyle(e).fontSize), navnFs: parseFloat(getComputedStyle(e.closest('.svc-row-h').querySelector('.svc-navn')).fontSize) })));
    if (sm === 'v2') sjekk(besk.length === 2 && besk.every(x => x.fs < x.navnFs) && besk[0].aria === 'Kort beskrivelse av Skin fade', `${k}: beskrivelse mindre enn navnet, aria-label med tjenestenavn`, JSON.stringify(besk));
    else sjekk(besk.length === 0, `${k}: v1 uten beskrivelsesfelt`);

    // Ny tom rad i begge lister: tomme verdier + plassholdere, enheten står
    await page.click('#addHoved'); await page.click('#addTillegg'); await page.waitForTimeout(200);
    const tom = await page.evaluate(() => ['#hovedList', '#tilleggList'].map(l => { const r = document.querySelector(l).lastElementChild;
      const v = s => { const e = r.querySelector(s); return [e.value, e.placeholder]; };
      return { navn: v('.svc-navn'), pris: v('.svc-pris'), min: v('.svc-min'), enheterSynlige: [...r.querySelectorAll('.svc-enhet-tekst')].filter(e => getComputedStyle(e).display !== 'none').length }; }));
    sjekk(tom.every(t => t.navn.join() === ',Navn på tjenesten' && t.pris.join() === ',Pris' && t.min.join() === ',Min' && t.enheterSynlige === 0),
      `${k}: ny tom rad viser bare plassholdere (ingen enhet)`, JSON.stringify(tom));
    // Enheten kommer når feltet får verdi, og forsvinner igjen når det tømmes
    const sisteTill = '#tilleggList .svc-row-t:last-child';
    await page.fill(`${sisteTill} .svc-pris`, '90');
    const medVerdi = await page.$eval(`${sisteTill} .svc-enhet-pris .svc-enhet-tekst`, e => getComputedStyle(e).display !== 'none');
    await page.fill(`${sisteTill} .svc-pris`, '');
    const tomIgjen = await page.$eval(`${sisteTill} .svc-enhet-pris .svc-enhet-tekst`, e => getComputedStyle(e).display === 'none');
    sjekk(medVerdi && tomIgjen, `${k}: «kr» kommer ved verdi og forsvinner når feltet tømmes`, `medVerdi=${medVerdi} tomIgjen=${tomIgjen}`);
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    sjekk(ov <= 0, `${k}: ingen horisontal overflow`, ov + ' px');
    await page.evaluate(() => document.querySelector('#hovedList').scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -140));
    await page.screenshot({ path: `${OUT}/${bredde}-${sm}-hoved.png` });
    await page.evaluate(() => document.querySelector('#tilleggList').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${OUT}/${bredde}-${sm}-tillegg.png` });

    // Lagring: fyll den nye hovedraden, la den nye tilleggsraden stå uten navn → rene tall, tom rad sendes ikke
    if (bredde === 375) {
      await page.fill('#hovedList .svc-row-h:last-child .svc-navn', 'Ny tjeneste');
      await page.fill('#hovedList .svc-row-h:last-child .svc-pris', '1 200');
      await page.fill('#hovedList .svc-row-h:last-child .svc-min', '45');
      await page.click('#saveSvc'); await page.waitForTimeout(700);
      const put = m.kall.filter(x => x.sti === '/api/dashboard/services' && x.metode === 'PUT').pop();
      const alle = put ? [...put.body.hoved, ...put.body.tillegg] : [];
      sjekk(put && alle.every(x => typeof x.price === 'number' && typeof x.min === 'number'), `${k}: lagring sender tall (number) for pris og min`, JSON.stringify(alle));
      sjekk(put && !/kr|min"\s*:\s*"/.test(JSON.stringify(alle.map(x => [x.price, x.min]))), `${k}: ingen enhet i verdiene`);
      const ny = put && put.body.hoved.find(x => x.name === 'Ny tjeneste');
      sjekk(ny && ny.price === 1200 && ny.min === 45, `${k}: ny rad «1 200» → 1200, 45 → 45`, JSON.stringify(ny));
      sjekk(put && put.body.tillegg.length === 2, `${k}: tom tilleggsrad uten navn sendes ikke`, put && JSON.stringify(put.body.tillegg));
    }
    sjekk(m.prod === 0, `${k}: ingen request mot prod`); sjekk(!errs.length, `${k}: pageerror`, errs.join('; '));
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(feil.length ? `\n${feil.length} AVVIK:` : '\nOK ✓ — alle sjekker grønne');
for (const f of feil) console.log(' ✗', f.hva, f.detalj ? `— ${f.detalj}` : '');
console.log('Skjermbilder:', OUT);
if (feil.length) process.exitCode = 1;
