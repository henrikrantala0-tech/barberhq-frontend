// tools/render/crop-onerror.mjs — render-test for crop-modalens BLINDVEI-vakt (M3).
//
// Bekrefter at når #cropImg ikke laster (404/5xx/nettverk), fyrer imgEl.onerror:
// feiltekst i #cropErr + #cropSave disabled — i stedet for en tom modal med en
// aktiv «Lagre»-knapp som er en stille no-op.
//
// Serverer site/ lokalt, stubber /api/** (hasPassword:true unngår redirect-fella). Åpner crop-modalen via _openCropModal
// med en imgId som IKKE finnes i imgs → src faller til en 404-URL → onerror.
//
// Normal-tilstand: galleri beskjæres 1:1 (badge «Galleri 1:1», kvadratisk boks), og «Lagre» legger utsnittet i
// Din side-utkastet (DinSideV2.stageCrop) — ingen PUT /images før «Lagre endringer».
//
//   node tools/render/crop-onerror.mjs
//
// Skjermbilder → .render-ut/crop-onerror-<bredde>.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { gratis } from './fixtures/billing.mjs';
import { TESTBILDER, rutTestbilder } from './fixtures/testbilder.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug: 'grand-barber', email: 'grand@barber.no', hasPassword: true,
  name: 'Henrik', shop: 'Grand Barber', address: '', tagline: '', bio: '', booking_horizon_days: 28 };
const IMAGES  = [{ id: '1', slot: 'galleri', url: '/testbilder/bilde-1.webp', sort_order: 0 }];
const BILLING = gratis({ page_status: 'forhandsvist' });   // delt mock, se fixtures/billing.mjs

let bildePut = 0;
const router = route => {
  const p = new URL(route.request().url()).pathname;
  if (route.request().method() === 'PUT' && p.startsWith('/api/dashboard/images')) bildePut++;
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  if (p === '/api/dashboard/profile')       return json(PROFILE);
  if (p === '/api/dashboard/images')         return json(IMAGES);
  if (p === '/api/dashboard/billing/status') return json(BILLING);
  if (p === '/api/dashboard/preview')        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><body></body>' });
  const listeAktig = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
  return json(listeAktig ? [] : {});
};

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router); await rutTestbilder(page);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  // Åpne crop-modalen med en imgId som ikke finnes → src faller til fallback-URL som 404-er → onerror.
  await page.evaluate(() => window._openCropModal('999', 'galleri', '/no/images/DENNE-FINNES-IKKE.webp'));
  await page.waitForTimeout(700); // vent på at nettleseren gir opp bildet + onerror kjører
  const m = await page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
    const img = document.querySelector('#cropImg');
    const inner = document.querySelector('.crop-modal-inner');
    const err = document.querySelector('#cropErr');
    const errCs = err ? getComputedStyle(err) : {};
    const innerCs = inner ? getComputedStyle(inner) : {};
    return {
      modalÅpen:   document.querySelector('#cropModal').classList.contains('open'),
      modalSynlig: vis(document.querySelector('#cropModal')),
      imgSkjult:   img ? getComputedStyle(img).display === 'none' : null,
      feiltekst:   err ? err.textContent : '',
      errAlign:    errCs.textAlign || '',
      errFarge:    errCs.color || '',
      kortBg:      innerCs.backgroundColor || '',            // skal IKKE være transparent → kortet har bakgrunn
      saveLåst:    (document.querySelector('#cropSave') || {}).disabled === true,
    };
  });
  await page.screenshot({ path: `${OUT}/crop-onerror-${bredde}.png`, fullPage: false });
  const transparent = /rgba?\(0, 0, 0, 0\)|transparent/.test(m.kortBg);
  rad.push({ bredde, modalÅpen: m.modalÅpen, modalSynlig: m.modalSynlig, imgSkjult: m.imgSkjult,
    harFeiltekst: m.feiltekst.length > 0, venstre: m.errAlign === 'left', kortBg: !transparent,
    saveLåst: m.saveLåst, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  await page.close();
}
let normalOk = false;
// Normal-tilstand (gyldig bilde) på 375 — kortet er en global endring, bekreft at Cropper fortsatt
// initialiseres og layouten ikke brekker.
{
  const page = await browser.newPage({ viewport: { width: 375, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router); await rutTestbilder(page);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window._openCropModal('1', 'galleri', '/testbilder/bilde-1.webp'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/crop-normal-375.png`, fullPage: false });
  const n = await page.evaluate(() => {
    const boks = document.querySelector('.cropper-crop-box'), r = boks ? boks.getBoundingClientRect() : null;
    return {
      cropperOppe: !!document.querySelector('.cropper-container'),
      feiltom:     (document.querySelector('#cropErr') || {}).textContent === '',
      badge:       (document.getElementById('cropAspektBadge') || {}).textContent || '',
      aspekt:      r && r.height ? Math.round(r.width / r.height * 100) / 100 : null,
    };
  });
  await page.click('#cropSave'); await page.waitForTimeout(600);
  n.lukket = !(await page.evaluate(() => document.querySelector('#cropModal').classList.contains('open')));
  n.iUtkast = await page.evaluate(() => !!(window.DinSideV2 && DinSideV2._S.bilderDirty));
  n.bildePut = bildePut;
  console.log('\nNormal-tilstand @375:', JSON.stringify({ ...n, jsfeil: errs.length ? errs.join('; ') : 'ingen' }));
  normalOk = n.cropperOppe && n.feiltom && n.badge === 'Galleri 1:1' && n.aspekt === 1 && n.lukket && n.iUtkast && n.bildePut === 0 && !errs.length;
  await page.close();
}
console.table(rad);
const ok = rad.every(r => r.modalÅpen && r.modalSynlig && r.imgSkjult === true && r.harFeiltekst
  && r.venstre && r.kortBg && r.saveLåst && r.jsfeil === 'ingen');
console.log('\nCrop-onerror OK (modal åpen, IMG skjult, feiltekst venstre, kort-bg, Lagre låst, 0 JS-feil):', ok ? 'JA' : 'NEI');
console.log('Normal OK (1:1, Lagre → Din side-utkastet, ingen PUT /images):', normalOk ? 'JA' : 'NEI');
await browser.close(); server.close();
process.exit(ok && normalOk ? 0 : 1);
