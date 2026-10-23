// Likhetssjekk: den EKTE v2-bookingsida (forsiden) mot klonen i produktvisningen, side om side på 320.
// Poenget er å se om klonen faktisk ser ut som produktet — ikke om den ser pen ut.
//
// Fasiten rendres LOKALT fra backendens v2-mal (fixtures/v2-fasit.mjs) for samme demobarber — ingen
// nettverk, ingen prod. Den fulle, element-for-element-sammenligningen av alle seks tilstander ligger i
// booking-tilstander.mjs; denne gir det raske bildet + noen nøkkeltall (sjappenavn-font, aksent, rader).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';
import { startV2Server, gaaTil } from './fixtures/v2-fasit.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type':MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const LOKAL = `http://localhost:${server.address().port}`;
const fasit = await startV2Server();
const browser = await chromium.launch();

// Kjøres i nettleseren mot en rot.
function nokkeltall(rotSel){
  const rot = document.querySelector(rotSel), cs = el => el ? getComputedStyle(el) : null;
  const navn = rot.querySelector('.v2-navn'), rad = rot.querySelector('.v2-tj-navn'), knapp = rot.querySelector('.primary');
  const fam = s => s.replace(/["'\s]/g, '').toLowerCase();
  // Rendret font, ikke deklarert: document.fonts.check svarer om en LASTET face dekker teksten.
  return {
    navnFont: fam(cs(navn).fontFamily).split(',')[0] + ' ' + cs(navn).fontWeight + ' ' + cs(navn).fontSize,
    // fonts.check() svarer true også når familien ikke finnes i det hele tatt — derfor: en LASTET face
    // med sjappenavnets første familie.
    navnLastet: [...document.fonts].some(f => fam(f.family) === fam(cs(navn).fontFamily).split(',')[0] && f.status === 'loaded'),
    radPx: cs(rad).fontSize + ' ' + cs(rad).fontWeight,
    rader: rot.querySelectorAll('.service').length,
    knappFarge: cs(knapp).backgroundColor,
    bakgrunn: cs(rot.closest('.pv-book') || document.body).backgroundColor,
  };
}

const rapport = [];
{ // Fasit
  const page = await browser.newPage({ viewport:{ width:320, height:693 }, deviceScaleFactor:2 });
  await gaaTil(page, fasit.base, 'forside');
  await page.screenshot({ path:`${OUT}/likhet-ekte.png` });
  rapport.push({ kilde:'EKTE v2 (lokal render)', ...(await page.evaluate(`(${nokkeltall})("main.frame")`)) });
  await page.close();
}
let jsfeil = [];
{ // Klon
  const page = await browser.newPage({ viewport:{ width:320, height:820 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  page.on('pageerror', e => jsfeil.push(e.message));
  await page.route(u => !u.href.startsWith(LOKAL) && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), r => r.abort());
  await page.goto(`${LOKAL}/no/index.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  // Kortet må være AKTIVT i skuddet (inaktive kort er nedtonet).
  await page.evaluate(() => document.querySelectorAll('#scene .mock').forEach(k => k.classList.toggle('on', k.dataset.i === '2')));
  await page.waitForTimeout(900);
  await page.locator('#produkt .mock[data-i="2"] .iph-screen').screenshot({ path:`${OUT}/likhet-klon.png` });
  rapport.push({ kilde:'KLON #produkt', ...(await page.evaluate(`(${nokkeltall})("#pvBook .pv-v2-forside > main")`)) });
  await page.close();
}
{ // Montasje
  const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const page = await browser.newPage({ viewport:{ width:900, height:1000 }, deviceScaleFactor:2 });
  await page.setContent(`<!DOCTYPE html><meta charset="utf-8"><style>body{margin:0;background:#0a0a0a;color:#fff;font:13px system-ui;padding:22px}
    .rad{display:flex;gap:26px;align-items:flex-start}figure{margin:0}img{display:block;border:1px solid #2a2a2a;border-radius:8px;width:320px}
    figcaption{margin-top:9px;color:#8a8a8a}</style><h1 style="font-size:15px">Likhetssjekk — v2-forside: ekte vs. klon @320</h1>
    <div class="rad"><figure><img src="${b64(`${OUT}/likhet-ekte.png`)}"><figcaption>EKTE — v2-malen, lokal render</figcaption></figure>
    <figure><img src="${b64(`${OUT}/likhet-klon.png`)}"><figcaption>KLON — #produkt</figcaption></figure></div>`);
  await page.screenshot({ path:`${OUT}/likhet-booking-320.png`, fullPage:true });
  await page.close();
}
console.table(rapport);
const [e, k] = rapport;
for (const f of ['navnFont', 'radPx', 'rader', 'knappFarge', 'bakgrunn'])
  sjekk(e[f] === k[f], `${f}: klon = ekte`, `klon ${k[f]} / ekte ${e[f]}`);
sjekk(k.navnLastet, 'Sjappenavnets font er faktisk lastet i klonen (ikke reservefont)');
sjekk(!jsfeil.length, 'Ingen JS-feil i klonen', jsfeil.join('; '));
console.log('\nmontasje: .render-ut/likhet-booking-320.png');
await browser.close(); server.close(); fasit.close();
ferdig();
