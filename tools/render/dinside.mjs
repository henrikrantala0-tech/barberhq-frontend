// tools/render/dinside.mjs — render-harness for «Din side» (#design) i no/dashboard.html
//
// Rendrer #dinside i Playwright UTEN prod: serverer site/ lokalt og stubber /api/**.
// Mock-barber: page_status='forhandsvist', 3 galleribilder, bio tom, tagline/spesialitet
// tom, hasPassword:true (kjent felle — uten den redirecter loadProfil-arven til
// opprett-passord og #dinside blir en tom chrome-error-flate; se
// memory/reference_dashboard_playwright_mock.md).
//
// To varianter: 'forhandsvist' (publiser-CTA synlig) og 'live' (grønn status + lenke).
// Bygg videre på denne for COMMIT C–G — den er MENT å gjenbrukes, ikke være en engangs.
//
//   node tools/render/dinside.mjs
//
// Skjermbilder → .render-ut/dinside-<variant>-<bredde>.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.mov':'video/quicktime' };
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

// ── Mock-barber ───────────────────────────────────────────────────────────────
// Profil: bio + tagline TOMME med vilje (det er onboarding-utgangspunktet — de to
// åpne sjekkliste-punktene i COMMIT D). hasPassword:true unngår redirect-fella.
const PROFILE = {
  slug: 'grand-barber', email: 'grand@barber.no', hasPassword: true,
  name: 'Henrik', shop: 'Grand Barber', address: '', tagline: '', bio: '',
  booking_horizon_days: 28,
};
// Showcase-layout = opptil 10 galleri. Tre fylte galleri-slots (bruker eksisterende
// webp som stand-in-foto — poenget er tre FYLTE plasser, ikke motivet).
const DESIGN = { palette: 'minimal', font: 'fraunces', layout: 'showcase', mode: 'mork' };
const IMAGES = [
  { id: 1, slot: 'galleri', url: '/no/images/layout-showcase.webp', sort_order: 0 },
  { id: 2, slot: 'galleri', url: '/no/images/layout-profil.webp',   sort_order: 1 },
  { id: 3, slot: 'galleri', url: '/no/images/layout-hero.webp',     sort_order: 2 },
];
function billing(variant) {
  if (variant === 'live') return {
    subscription_status: 'trialing', page_status: 'live',
    trial_start_at: new Date().toISOString(), trial_days_left: 30,
    nedtaking_dager_igjen: 37, myk_periode: false, needs_attention: false,
    attention_grunn: null, plan: 'vekst', effective_plan: 'vekst',
  };
  return { // forhandsvist — publiser-CTA synlig, ingen abonnement ennå
    subscription_status: null, page_status: 'forhandsvist',
    trial_start_at: null, trial_days_left: null, nedtaking_dager_igjen: null,
    myk_periode: false, needs_attention: false, attention_grunn: null,
    plan: null, effective_plan: null,
  };
}
// Representativ server-render-stand-in for kundesida (prod server-rendrer denne via
// byggSideFraBarber). Trenger bare å SE ut som en bookingside i telefonrammen.
const PREVIEW_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;
  background:#0a0a0a;color:#f4f4f4;padding:16px}
  h1{font-family:Georgia,serif;font-size:24px;margin-bottom:4px}
  .sub{color:#9a9a9a;font-size:12px;margin-bottom:14px}
  .gal{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px}
  .gal div{aspect-ratio:3/4;background:linear-gradient(135deg,#1e1e1e,#2c2c2c);border-radius:8px}
  .svc{border-top:1px solid #232323;padding:11px 0;display:flex;justify-content:space-between;font-size:14px}
  .svc span:last-child{color:#7db3ff}
  .cta{margin-top:16px;background:#7db3ff;color:#06121f;text-align:center;padding:13px;
  border-radius:10px;font-weight:600;font-size:14px}
</style></head><body>
  <h1>Grand Barber</h1><div class="sub">Se tjenester</div>
  <div class="gal"><div></div><div></div><div></div><div></div></div>
  <div class="svc"><span>Herreklipp</span><span>350 kr</span></div>
  <div class="svc"><span>Skjeggtrim</span><span>200 kr</span></div>
  <div class="svc"><span>Klipp &amp; skjegg</span><span>500 kr</span></div>
  <div class="cta">Velg tjeneste</div>
</body></html>`;

function makeRouter(variant) {
  return route => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')        return json(PROFILE);
    if (p === '/api/dashboard/design')          return json(DESIGN);
    if (p === '/api/dashboard/images')          return json(IMAGES);
    if (p === '/api/dashboard/billing/status')  return json(billing(variant));
    if (p === '/api/dashboard/preview')         return route.fulfill({ status: 200, contentType: 'text/html', body: PREVIEW_HTML });
    // Alt annet init rører (stats/bookings/winback/attribution/settings/google/…):
    // liste-formede endepunkt → [], resten → {}. Init må ikke krasje.
    const listeAktig = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

const browser = await chromium.launch();
const rad = [];
for (const variant of ['forhandsvist', 'live']) {
  for (const bredde of [320, 402, 1280]) {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter(variant));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const m = await page.evaluate(() => {
      const vis = el => !!el && el.offsetParent !== null;
      const cta  = document.querySelector('#dinsideCta');
      const live = document.querySelector('#dinsideLive');
      const fr   = document.querySelector('#pvScreen');
      let previewLen = 0;
      try { previewLen = (fr && fr.contentDocument && fr.contentDocument.body) ? fr.contentDocument.body.innerText.length : 0; } catch(e){}
      return {
        panelAktiv: (document.querySelector('#design') || {}).classList?.contains('active') || false,
        ctaSynlig: vis(cta), liveSynlig: vis(live),
        previewTegn: previewLen,
      };
    });

    // Bilder-trekkspill: åpne og tell slot-bokser (bekreft 3 galleribilder rendres)
    await page.evaluate(() => {
      const b = document.querySelector('#accBilder .acc-head');
      if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
    });
    await page.waitForTimeout(500);
    const slots = await page.evaluate(() =>
      document.querySelectorAll('#bilderMount .slot-thumb, #bilderMount .slot, #bilderMount img').length);

    rad.push({ variant, bredde, ...m, slots, jsfeil: errs.length ? errs.join('; ') : 'ingen' });

    // Skjermbilde av hele #design-panelet (Bilder nå åpen → slots synlige)
    await page.locator('#design').screenshot({ path: `${OUT}/dinside-${variant}-${bredde}.png` });
    await page.close();
  }
}
console.table(rad);
const ok = rad.every(r =>
  r.panelAktiv && r.previewTegn > 0 && r.jsfeil === 'ingen' &&
  (r.variant === 'forhandsvist' ? (r.ctaSynlig && !r.liveSynlig) : (r.liveSynlig && !r.ctaSynlig)));
console.log('\nHarness OK (panel aktiv · preview fylt · CTA/live riktig · ingen JS-feil):', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
