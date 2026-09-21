// tools/render/palett-modus.mjs — palett-velger + lys-only modus-gating.
//
// ⚠ OMSKREVET 21.09: palett-VELGEREN ble re-kuratert 14.09 (se site/no/palett.js): purple/oransje/
// minimal FJERNET fra velgeren, og «sand» er INTERN (kun plakatgenerering) og står IKKE i velgeren.
// PALETTES_DISPLAY = krem («Gull») · mint («Lime») · klassisk («BarberHQ»), + «Din egen» (custom).
// Alle fire velger-palettene støtter BÅDE lys og mørk. Den gamle testen klikket
// .preset[data-key="sand"] for å utløse «snap-til-lys + Mørk disabled + hint» — men sand kan ikke
// lenger velges i velgeren, så det klikket time-outet. Testen dekker nå:
//   1. Velger-innhold: «BarberHQ» finnes · «Klassisk BarberHQ» (gammelt navn) finnes IKKE.
//   2. Dual-mode: å velge en velger-palett (mint) mens Mørk er aktiv beholder Mørk (ikke disabled,
//      ingen hint) — alle velger-palettene støtter mørk.
//   3. Lys-only modus-gating LEVER fortsatt: lastes design med palette='sand' (fortsatt en gyldig
//      DB-/backend-verdi, bare ikke i velgeren) → Mørk disabled + Lys pressed + #modeHint synlig.
//      Dette verifiserer maskineriet (modeneFor/PALETTE_MODES → renderDesign) uten en velger-klikk.
//
//   node tools/render/palett-modus.mjs
// Skjermbilder → .render-ut/palett-*.png.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
function router(design) {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')       return json(PROFILE);
    if (p === '/api/dashboard/design')         return json(design);
    if (p === '/api/dashboard/billing/status') return json({ subscription_status:null, page_status:'forhandsvist', trial_start_at:null, trial_days_left:null, needs_attention:false });
    if (p === '/api/dashboard/preview')        return route.fulfill({ status:200, contentType:'text/html', body:'<html><body style="background:#efe7d8"></body></html>' });
    return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p) ? [] : {});
  };
}

function maal(page) {
  return page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
    const grid = document.querySelector('#paletteGrid');
    const mork = document.querySelector('#modePick .modebtn[data-mode="mork"]');
    const lys  = document.querySelector('#modePick .modebtn[data-mode="lys"]');
    const titler = [...(grid ? grid.querySelectorAll('.pt') : [])].map(e => e.textContent.trim());
    return {
      titler,
      barberHQ: titler.includes('BarberHQ'),
      ingenKlassiskBarberHQ: !titler.includes('Klassisk BarberHQ'),
      morkDisabled: !!mork && mork.disabled,
      lysPressed:   !!lys && lys.getAttribute('aria-pressed') === 'true',
      hintSynlig:   vis(document.querySelector('#modeHint')),
    };
  });
}

async function apneDesign(page) {
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = document.querySelector('#accDesign .acc-head');
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
  await page.waitForSelector('#paletteGrid .preset', { timeout:5000 });
  await page.waitForTimeout(200);
}

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 402, 1280]) {
  // ── Del A: dual-mode velger-palett. Start minimal/mork (minimal støtter begge). ──
  const pageA = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errsA = []; pageA.on('pageerror', e => errsA.push(e.message));
  await pageA.route('**/api/**', router({ palette:'minimal', font:'fraunces', layout:'showcase', mode:'mork' }));
  await apneDesign(pageA);
  const førA = await maal(pageA); // minimal + mork → Mørk IKKE disabled
  // Velg mint (velger-palett, dual-mode) mens Mørk er aktiv → Mørk skal FORBLI valgbar, ingen hint.
  await pageA.click('#paletteGrid .preset[data-key="mint"]');
  await pageA.waitForTimeout(300);
  const etterA = await maal(pageA);
  await pageA.locator('#accDesign').screenshot({ path: `${OUT}/palett-mint-${bredde}.png` });
  await pageA.close();

  // ── Del B: lys-only gating. Last design med palette='sand' → Mørk disabled + hint ved load. ──
  const pageB = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errsB = []; pageB.on('pageerror', e => errsB.push(e.message));
  await pageB.route('**/api/**', router({ palette:'sand', font:'fraunces', layout:'showcase', mode:'lys' }));
  await apneDesign(pageB);
  const sand = await maal(pageB);
  await pageB.locator('#accDesign').screenshot({ path: `${OUT}/palett-sand-gating-${bredde}.png` });
  await pageB.close();

  rad.push({ bredde,
    barberHQ: etterA.barberHQ,
    ingenKlassisk: etterA.ingenKlassiskBarberHQ,
    minimalMorkOK: førA.morkDisabled === false,
    mintDualMode: etterA.morkDisabled === false && etterA.hintSynlig === false,   // dual-mode: Mørk beholdt
    sandGatingMorkDisabled: sand.morkDisabled,
    sandGatingLysPressed:   sand.lysPressed,
    sandGatingHint:         sand.hintSynlig,
    jsfeil: (errsA.concat(errsB)).length ? errsA.concat(errsB).join('; ') : 'ingen' });
}
console.table(rad);
const ok = rad.every(r => r.barberHQ && r.ingenKlassisk && r.minimalMorkOK && r.mintDualMode
  && r.sandGatingMorkDisabled && r.sandGatingLysPressed && r.sandGatingHint && r.jsfeil === 'ingen');
console.log('\nPalett-modus OK (BarberHQ-navn · dual-mode-velger beholder Mørk · lys-only gating (sand@load) → Mørk disabled + Lys + hint):', ok ? 'JA ✓' : 'NEI ✗');
process.exitCode = ok ? 0 : 1;
await browser.close(); server.close();
