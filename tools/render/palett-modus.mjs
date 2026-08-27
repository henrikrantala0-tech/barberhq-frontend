// tools/render/palett-modus.mjs — verifiserer COMMIT H (palett-modus-speiling).
//   node tools/render/palett-modus.mjs
// Sjekker: «BarberHQ»-navn i palett-velgeren · sand → Mørk disabled + hint · snap-til-lys
// når sand velges mens Mørk er aktiv. Skjermbilder → .render-ut/palett-*.png.

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
const DESIGN  = { palette:'minimal', font:'fraunces', layout:'showcase', mode:'mork' }; // mork aktiv → test snap
const router = route => {
  const p = new URL(route.request().url()).pathname;
  const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/profile')       return json(PROFILE);
  if (p === '/api/dashboard/design')         return json(DESIGN);
  if (p === '/api/dashboard/billing/status') return json({ subscription_status:null, page_status:'forhandsvist', trial_start_at:null, trial_days_left:null, needs_attention:false });
  if (p === '/api/dashboard/preview')        return route.fulfill({ status:200, contentType:'text/html', body:'<html><body style="background:#efe7d8"></body></html>' });
  return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p) ? [] : {});
};

function maal(page) {
  return page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
    const grid = document.querySelector('#paletteGrid');
    const mork = document.querySelector('#modePick .modebtn[data-mode="mork"]');
    const lys  = document.querySelector('#modePick .modebtn[data-mode="lys"]');
    const sand = document.querySelector('#paletteGrid .preset[data-key="sand"]');
    return {
      barberHQ: [...(grid ? grid.querySelectorAll('.pt') : [])].map(e => e.textContent.trim()).includes('BarberHQ'),
      klassiskTekst: [...(grid ? grid.querySelectorAll('.pt') : [])].map(e => e.textContent.trim()),
      sandValgt: !!sand && sand.getAttribute('aria-pressed') === 'true',
      morkDisabled: !!mork && mork.disabled,
      lysPressed: !!lys && lys.getAttribute('aria-pressed') === 'true',
      hintSynlig: vis(document.querySelector('#modeHint')),
    };
  });
}

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 402, 1280]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1400);
  // Åpne Design-trekkspillet
  await page.evaluate(() => { const b = document.querySelector('#accDesign .acc-head');
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); });
  await page.waitForTimeout(300);
  const før = await maal(page); // minimal + mork: Mørk skal IKKE være disabled
  // Velg sand mens Mørk er aktiv → skal snappe til lys + disable Mørk + vise hint
  await page.click('#paletteGrid .preset[data-key="sand"]');
  await page.waitForTimeout(400);
  const etter = await maal(page);
  await page.locator('#accDesign').screenshot({ path: `${OUT}/palett-sand-${bredde}.png` });
  rad.push({ bredde, barberHQ: etter.barberHQ, ingenKlassisk: !etter.klassiskTekst.includes('Klassisk BarberHQ'),
    minimalMorkOK: før.morkDisabled === false, sandValgt: etter.sandValgt, snapTilLys: etter.lysPressed,
    morkDisabled: etter.morkDisabled, hint: etter.hintSynlig, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  await page.close();
}
console.table(rad);
const ok = rad.every(r => r.barberHQ && r.ingenKlassisk && r.minimalMorkOK && r.sandValgt
  && r.snapTilLys && r.morkDisabled && r.hint && r.jsfeil === 'ingen');
console.log('\nPalett-modus OK (BarberHQ-navn · minimal støtter mørk · sand → snap-lys + Mørk disabled + hint):', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
