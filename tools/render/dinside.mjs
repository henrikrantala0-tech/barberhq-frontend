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

function maal(page) {
  return page.evaluate(() => {
    // position:fixed/display:none → offsetParent===null (se README). Mål computed display
    // + geometri i stedet, ellers rapporteres skjulte/faste elementer falskt.
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
    const top = el => el ? Math.round(el.getBoundingClientRect().top) : null;
    const fr = document.querySelector('#pvScreen');
    let previewLen = 0;
    try { previewLen = (fr && fr.contentDocument && fr.contentDocument.body) ? fr.contentDocument.body.innerText.length : 0; } catch(e){}
    const bar = document.querySelector('#fokusBar');
    const pos = bar ? getComputedStyle(bar).position : null;
    return {
      fokus:       document.body.classList.contains('fokus'),
      navSynlig:   vis(document.querySelector('nav.nav')),
      barSynlig:   vis(bar),
      barStatisk:  pos ? (pos !== 'fixed' && pos !== 'sticky') : null,
      xSynlig:     vis(document.querySelector('#fokusX')),
      ctaSynlig:   vis(document.querySelector('#dinsideCta')),
      ideaSynlig:  vis(document.querySelector('.ideacard')),
      publiser:    (document.querySelector('#fokusPubliser') || {}).textContent || '',
      utforsk:     (document.querySelector('#fokusUtforsk') || {}).textContent || '',
      previewTegn: previewLen,
      accsTop:     top(document.querySelector('.side-accs')),
      previewTop:  top(document.querySelector('.design-preview')),
      barTop:      top(bar),
      url:         location.search + location.hash,
    };
  });
}

// Begge moduser, forhandsvist billing. Fokus = ?velkommen=1; vanlig = uten param.
const rad = [];
for (const modus of ['fokus', 'vanlig']) {
  for (const bredde of [320, 402, 1280]) {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter('forhandsvist'));
    const q = modus === 'fokus' ? '?velkommen=1' : '';
    await page.goto(`http://localhost:${PORT}/no/dashboard.html${q}#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const m = await maal(page);
    await page.screenshot({ path: `${OUT}/dinside-${modus}-${bredde}.png`, fullPage: true });

    // Rekkefølge (kun fokus): mobil → accs < preview < bar; desktop → bar under begge kolonner
    let ordreOK = 'n/a';
    if (modus === 'fokus') ordreOK = bredde < 720
      ? (m.accsTop < m.previewTop && m.previewTop < m.barTop)
      : (m.barTop > m.accsTop && m.barTop > m.previewTop);

    // X → avslutt fokus → fullt dashbord (kun fokus)
    let xOK = 'n/a';
    if (modus === 'fokus') { await page.click('#fokusX'); await page.waitForTimeout(300);
      const e2 = await maal(page);
      xOK = e2.fokus === false && e2.navSynlig === true && e2.barSynlig === false && e2.ctaSynlig === true; }

    rad.push({ modus, bredde, fokus: m.fokus, nav: m.navSynlig, bar: m.barSynlig, barStat: m.barStatisk,
      cta: m.ctaSynlig, idea: m.ideaSynlig, ordreOK, 'X→av': xOK, url: m.url,
      knapper: modus === 'fokus' ? `${m.publiser} / ${m.utforsk}` : 'n/a',
      preview: m.previewTegn, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);
const fokusRad = rad.filter(r => r.modus === 'fokus');
const vanligRad = rad.filter(r => r.modus === 'vanlig');
const okFokus = fokusRad.every(r => r.fokus && !r.nav && r.bar && r.barStat && !r.cta && !r.idea
  && r.ordreOK === true && r['X→av'] === true && r.url === '#dinside'
  && r.knapper === 'Publiser siden / Utforsk dashbordet' && r.preview > 0 && r.jsfeil === 'ingen');
const okVanlig = vanligRad.every(r => !r.fokus && r.nav && !r.bar && r.cta && r.idea && r.jsfeil === 'ingen');
console.log('\nFokus OK (?velkommen→fokus, param strippet, bar statisk nederst, CTA+Ideer skjult, X→fullt):', okFokus ? 'JA' : 'NEI');
console.log('Vanlig OK (ingen param → fokus av, nav+CTA+Ideer synlig):', okVanlig ? 'JA' : 'NEI');
await browser.close(); server.close();
