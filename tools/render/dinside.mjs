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
// Sjekkliste-data: bilder(3)✓ · tjenester(pris)✓ · åpningstider✓ · profil(bio/spes/adr tomme)✗ ·
// publiser(forhandsvist)✗ → 3/5. Viser både fullførte (hake+gjennomstreking) og åpne rader.
const SERVICES = { hoved: [ { name: 'Herreklipp', price: 350, min: 30 }, { name: 'Skjeggtrim', price: 200, min: 20 } ], tillegg: [] };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday: wd, is_closed: false, open_time: '10:00', close_time: '18:00', breaks: [] }))
  .concat([6,0].map(wd => ({ weekday: wd, is_closed: true, open_time: '10:00', close_time: '18:00', breaks: [] })));
const NOW = new Date().toISOString();
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
    if (p === '/api/dashboard/services')        return json(SERVICES);
    if (p === '/api/dashboard/hours')           return json(HOURS);
    if (p === '/api/dashboard/billing/status')  return json(billing(variant));
    if (p === '/api/dashboard/page-status')      return json({ page_status: 'live', trial_start_at: NOW }); // PUT (publiser)
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

// Måler pill/popover-tilstand + fokus-flater.
function maalPill(page) {
  return page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
    return {
      pillSynlig:     vis(document.querySelector('#sjekkPillBtn')),
      ring:           (document.querySelector('#sjekkRingNum') || {}).textContent || '',
      popoverSkjult:  (document.querySelector('#sjekkPopover') || {}).hidden,
      inlineBorte:    document.querySelector('#dinsideSjekkliste') === null,
      fokus:          document.body.classList.contains('fokus'),
      navSynlig:      vis(document.querySelector('nav.nav')),
      ctaSynlig:      vis(document.querySelector('#dinsideCta')),
      fokusBar:       vis(document.querySelector('#fokusBar')),
    };
  });
}

// Tre tilstander per bredde: fokus (UTEN pill, fokus-bar) · vanlig m/pill · popover åpen (vanlig).
// Pill KUN i vanlig. forhandsvist mock-barber (3/5: bilder+tjenester+tider ✓, profil+publiser ✗).
const rad = [];
for (const bredde of [320, 402, 1280]) {
  // ── Tilstand 1: FOKUS uten pill — fokus-baren fra C eier CTA-en ──────────────────
  {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter('forhandsvist'));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html?velkommen=1#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const m = await maalPill(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/sjekk-fokus-${bredde}.png`, fullPage: false });
    rad.push({ tilstand: 'fokus', bredde, fokus: m.fokus, navSkjult: !m.navSynlig,
      pillSkjult: !m.pillSynlig, fokusBar: m.fokusBar, inlineBorte: m.inlineBorte,
      jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
  // ── Tilstand 2+3: VANLIG med pill → klikk → popover åpen ──────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter('forhandsvist'));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const m = await maalPill(page);
    await page.screenshot({ path: `${OUT}/sjekk-vanlig-${bredde}.png`, fullPage: false });
    await page.click('#sjekkPillBtn'); await page.waitForTimeout(350);
    const panel = await page.evaluate(() => {
      const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
        return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
      const rows = document.querySelectorAll('#sjekkPopover .sjekk-rad');
      return { popoverSynlig: vis(document.querySelector('#sjekkPopover')), pRader: rows.length,
        pDone: [...rows].filter(r => r.classList.contains('done')).length,
        pTeller: (document.querySelector('#sjekkPopover .sjekk-panel-teller') || {}).textContent || '' };
    });
    await page.screenshot({ path: `${OUT}/sjekk-popover-${bredde}.png`, fullPage: false });
    // Radklikk lukker popover FØR navigasjon (rad 4 = profil)
    await page.click('#sjekkPopover .sjekk-rad[data-act="profil"]'); await page.waitForTimeout(300);
    const etterRad = await page.evaluate(() => (document.querySelector('#sjekkPopover') || {}).hidden);
    rad.push({ tilstand: 'vanlig', bredde, fokus: m.fokus, nav: m.navSynlig, cta: m.ctaSynlig,
      pill: m.pillSynlig, ring: m.ring, popFør: m.popoverSkjult, popEtter: panel.popoverSynlig,
      pRader: panel.pRader, pDone: panel.pDone, pTeller: panel.pTeller, radLukker: etterRad === true,
      jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);
const fk = rad.filter(r => r.tilstand === 'fokus');
const vn = rad.filter(r => r.tilstand === 'vanlig');
const okFokus = fk.every(r => r.fokus && r.navSkjult && r.pillSkjult && r.fokusBar
  && r.inlineBorte && r.jsfeil === 'ingen');
const okVanlig = vn.every(r => !r.fokus && r.nav && r.cta && r.pill && r.ring === '3/5'
  && r.popFør === true && r.popEtter === true && r.pRader === 5 && r.pDone === 3 && r.pTeller === '3 av 5'
  && r.radLukker === true && r.jsfeil === 'ingen');
console.log('\nFokus OK (INGEN pill, fokus-bar synlig, nav skjult, inline-container borte):', okFokus ? 'JA' : 'NEI');
console.log('Vanlig OK (pill 3/5 + nav+CTA synlig, klikk → popover 3/5, radklikk lukker):', okVanlig ? 'JA' : 'NEI');

// ── COMMIT F: suksesskort etter publisering · live-tilstand med header-lenke ─────────
const radF = [];
for (const bredde of [320, 402, 1280]) {
  // Tilstand 1: publiser (forhandsvist → klikk #dinsidePubliser → PUT → suksesskort)
  {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter('forhandsvist'));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    await page.click('#dinsidePubliser'); await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
        return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
      const ov = document.querySelector('#suksessOverlay');
      return { kort: vis(ov) && !ov.hidden, tittel: (document.querySelector('#suksessTittel') || {}).textContent || '',
        lenke: !!document.querySelector('#suksessLenke .pub-url'),
        linjer: [...document.querySelectorAll('.suksess-linje')].map(e => e.textContent).join(' | ') };
    });
    await page.screenshot({ path: `${OUT}/f-suksess-${bredde}.png`, fullPage: false });
    radF.push({ tilstand: 'suksesskort', bredde, kort: m.kort, tittel: m.tittel, lenke: m.lenke,
      linjer: m.linjer, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
  // Tilstand 2: live-tilstand med header-lenke (kort lukket) + kollisjonssjekk i headeren
  {
    const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', makeRouter('live'));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const m = await page.evaluate(() => {
      const vis = el => { if (!el) return false; const r = el.getBoundingClientRect();
        return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
      const logo = document.querySelector('.topband .logo'), who = document.querySelector('.who');
      const klaring = (logo && who) ? Math.round(who.getBoundingClientRect().left - logo.getBoundingClientRect().right) : null;
      return { headerLenke: vis(document.querySelector('#headerLenke .pub-url')),
        kortSkjult: (document.querySelector('#suksessOverlay') || {}).hidden,
        headerKlaring: klaring, bodyOverflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    await page.screenshot({ path: `${OUT}/f-live-${bredde}.png`, fullPage: false, clip: { x: 0, y: 0, width: bredde, height: 220 } });
    radF.push({ tilstand: 'live-header', bredde, headerLenke: m.headerLenke, kortSkjult: m.kortSkjult,
      headerKlaring: m.headerKlaring, bodyOverflow: m.bodyOverflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(radF);
const s1 = radF.filter(r => r.tilstand === 'suksesskort');
const s2 = radF.filter(r => r.tilstand === 'live-header');
const okKort = s1.every(r => r.kort && r.tittel === 'Siden din er live!' && r.lenke
  && /Instagram/.test(r.linjer) && /30 dager gratis/.test(r.linjer) && r.jsfeil === 'ingen');
const okLive = s2.every(r => r.headerLenke && r.kortSkjult === true && r.headerKlaring > 4
  && r.bodyOverflow <= 0 && r.jsfeil === 'ingen');
console.log('\nSuksesskort OK (synlig, «Siden din er live!», lenke, Instagram+30 dager):', okKort ? 'JA' : 'NEI');
console.log('Live-header OK (lenke synlig, kort skjult, ingen kollisjon/overflow):', okLive ? 'JA' : 'NEI');
await browser.close(); server.close();
