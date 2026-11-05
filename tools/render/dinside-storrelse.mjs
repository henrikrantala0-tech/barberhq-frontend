// tools/render/dinside-storrelse.mjs — «Din side» (v2) skal ha samme størrelser som de andre fanene.
//
//   node tools/render/dinside-storrelse.mjs [navn]     # navn = prefiks på bildene (f.eks. foer / etter), standard «na»
//
// Måler mot de felles stilene i dashboard.html, ikke mot tall skrevet her:
//   • fanetittel  #dv2Tittel  ↔ .panel-h i Tjenester & tider (font-size, font-weight)
//   • felt        Profil-feltene (input + textarea-skrift) og @-feltene ↔ tjenestefeltene (.svc-row-h input): høyde, skrift
//   • knapp       «Forhåndsvis» ↔ #gcalBtn (.btn-outline, dashbordets sekundærknapp): høyde, skrift, padding; ingen <svg>
// Bilder (.render-ut/dinside-storrelse/): Din side Profil, Utseende, Bilder, Kontakt og Tjenester & tider @320/375, mørk.
// Alle API-kall mockes (fixtures/dinside-v2.mjs); exit 1 ved avvik eller request mot prod.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { installerDinSideMock } from './fixtures/dinside-v2.mjs';

const NAVN = process.argv[2] || 'na';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/dinside-storrelse');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.webp':'image/webp',
               '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.mp4':'video/mp4' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/no/dashboard.html`;
const TJENESTER = { hoved: [{ id:1, name:'Herreklipp', price:450, min:30 }, { id:2, name:'Skin fade', price:550, min:45 }],
                    tillegg: [{ id:3, name:'Skjeggtrim', price:200, min:15 }] };

let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ok  ' : '  FEIL ') + msg); if (!c) fails++; };
const browser = await chromium.launch();

async function ny(bredde, hash) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 760 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bhq-theme', 'dark'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const m = await installerDinSideMock(page, { tjenester: TJENESTER });
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  return { ctx, page, m, errs };
}
// Hele steget i ett bilde: høyt vindu i stedet for fullPage — fullPage tegner den faste bunn-navigasjonen midt i bildet.
async function helSide(page, fil) {
  const w = page.viewportSize().width, h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(200);
  await page.screenshot({ path: fil });
  await page.setViewportSize({ width: w, height: 760 }); await page.waitForTimeout(100);
}
const stil = (page, sel) => page.$eval(sel, e => { const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return { h: Math.round(r.height * 10) / 10, fs: s.fontSize, fw: s.fontWeight, pad: s.paddingLeft + ' ' + s.paddingRight, rad: s.borderTopLeftRadius }; });

for (const w of [320, 375]) {
  console.log(`\n@${w}`);
  // Tjenester & tider: referansen.
  let { ctx, page, m, errs } = await ny(w, '#tjenester');
  await page.$eval('button[data-panel="tjenester"]', b => b.click());
  await page.waitForTimeout(700);
  const refTittel = await stil(page, '#tjenester .panel-h');
  const refFelt   = await stil(page, '#hovedList .svc-row-h input');
  const refKnapp  = await stil(page, '#gcalBtn');
  await page.screenshot({ path: `${OUT}/${NAVN}-tjenester-${w}.png` });
  ok(errs.length === 0, `Tjenester: ingen pageerror (${errs.join(' | ')})`);
  ok(m.prod === 0, `Tjenester: ingen request mot prod`);
  await ctx.close();

  // Din side: Profil-steget (tittel, knapp, felt) og Kontakt-steget (@-felt + telefon).
  ({ ctx, page, m, errs } = await ny(w, '#dinside'));
  await page.waitForSelector('#dv2Grid:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const tittel = await stil(page, '#dv2Tittel');
  const knapp  = await stil(page, '#dv2SeSiden');
  const svg    = await page.$$eval('#dv2SeSiden svg', a => a.length);
  const knTekst = await page.$eval('#dv2SeSiden', e => e.innerText.trim());
  const felt   = await stil(page, '#dv2Tagline');
  const tekst  = await stil(page, '#dv2Bio');
  await page.screenshot({ path: `${OUT}/${NAVN}-dinside-profil-${w}.png` });
  // Utseende (Bakgrunn / Aksentfarge / Skrift-velgeren) og Bilder: hele steget, fullPage så Skrift kommer med.
  await page.click('#dv2Steg [data-steg="1"]'); await page.waitForTimeout(400);
  const skrift = await stil(page, '#dv2Fonter');
  await helSide(page, `${OUT}/${NAVN}-dinside-utseende-${w}.png`);
  await page.click('#dv2Steg [data-steg="2"]'); await page.waitForTimeout(600);
  await helSide(page, `${OUT}/${NAVN}-dinside-bilder-${w}.png`);
  console.log(`  skrift   ${skrift.h}px ${skrift.fs} r${skrift.rad} pad ${skrift.pad}`);
  await page.click('#dv2Steg [data-steg="3"]'); await page.waitForTimeout(300);
  const handle = await stil(page, '#dv2Instagram');
  const handleRamme = await page.$eval('#dv2Instagram', e => { const p = e.parentElement; const s = getComputedStyle(p); return s.borderTopWidth !== '0px' ? 'innpakning har ramme' : 'feltet har rammen'; });
  const tlf    = await stil(page, '#dv2Telefon');
  await page.screenshot({ path: `${OUT}/${NAVN}-dinside-kontakt-${w}.png` });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  console.log(`  tittel   Din side ${tittel.fs}/${tittel.fw}   Tjenester ${refTittel.fs}/${refTittel.fw}`);
  console.log(`  felt     Din side ${felt.h}px ${felt.fs} r${felt.rad} · @ ${handle.h}px · tlf ${tlf.h}px   Tjenester ${refFelt.h}px ${refFelt.fs} r${refFelt.rad}`);
  console.log(`  knapp    Forhåndsvis ${knapp.h}px ${knapp.fs}/${knapp.fw} pad ${knapp.pad} r${knapp.rad} svg=${svg} «${knTekst}»   .btn-outline ${refKnapp.h}px ${refKnapp.fs}/${refKnapp.fw} pad ${refKnapp.pad} r${refKnapp.rad}`);

  ok(tittel.fs === refTittel.fs && tittel.fw === refTittel.fw, 'fanetittel = .panel-h');
  ok(Math.abs(felt.h - refFelt.h) <= 1.5 && felt.fs === refFelt.fs, 'tekstfelt: høyde og skrift = tjenestefeltene');
  ok(Math.abs(handle.h - refFelt.h) <= 1.5 && Math.abs(tlf.h - refFelt.h) <= 1.5, '@-felt og telefon: høyde = tjenestefeltene');
  ok(tekst.fs === refFelt.fs, 'tekstområde: skrift = tjenestefeltene');
  ok(Math.abs(knapp.h - refKnapp.h) <= 0.5 && knapp.fs === refKnapp.fs && knapp.fw === refKnapp.fw && knapp.pad === refKnapp.pad && knapp.rad === refKnapp.rad, '«Forhåndsvis» = .btn-outline');
  ok(svg === 0 && knTekst === 'Forhåndsvis', '«Forhåndsvis» uten øye-ikon, teksten synlig');
  ok(ov === 0, `ingen horisontal overflow (${ov})`);
  ok(errs.length === 0, `Din side: ingen pageerror (${errs.join(' | ')})`);
  ok(m.prod === 0, 'Din side: ingen request mot prod');
  console.log(`  (@-felt: ${handleRamme})`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(fails ? `\n${fails} FEIL` : '\nalt ok');
process.exit(fails ? 1 : 0);
