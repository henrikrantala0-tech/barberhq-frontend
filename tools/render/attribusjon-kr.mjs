// tools/render/attribusjon-kr.mjs — «Hentet inn av BarberHQ» med kroner på de to flatene:
//   Oversikt (renderDrivenBy, alltid «siste 30 dager») + Vekst-fanen (renderAttribusjon, #attrRows).
//
// Skrevet om 22.10.2026 til dagens backend-form: GET /attribution → { hentetInn:{ vervet, vinnTilbake, rebooking,
// total }, paaVei:{ rebooking, winback } }, der hver arm er {count,revenue}. (Den gamle flate formen med
// <kat>/total på toppnivå finnes ikke lenger, og testen målte tomme flater uten å si fra.) Billing mockes som Vekst
// — uten billing er planen ukjent, dashbordet regner den som Gratis (fail-closed) og henter aldri attribusjon.
//
// Fire tilfeller × 320/375:
//   A  Vekst, full hentetInn       → total «25 klipp · 9 050 kr» + tre arm-rader med kroner på begge flater
//   B  Vekst, hentetInn uten total → «Ingen bookinger her ennå» (0), ALDRI en klient-sum (9 050) av radene
//   C  Vekst, hentetInn mangler    → Vekst: «Kunne ikke hente tallene akkurat nå.»; Oversikt: bare «På vei», ingen kroner
//   D  Gratis (backend sender likevel hentetInn) → ingen ekte tall noe sted (frontend-vakta erBasis)
//
//   node tools/render/attribusjon-kr.mjs
//
// Skjermbilder → .render-ut/attr-*.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';
import { vekst, gratis } from './fixtures/billing.mjs';

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

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };

// «Sum er sann»: sum(armer) == total. Totalen er backendens autoritative tall — frontend summerer aldri selv.
const HENTET = { vervet:{count:5,revenue:1750}, vinnTilbake:{count:6,revenue:2400}, rebooking:{count:14,revenue:4900},
                 total:{count:25,revenue:9050} };
const PAA_VEI = { rebooking:{ naar_vindu_30d:3, med_samtykke:2 }, winback:{ foerste_passerer_60:null, passerer_innen_30d:0 } };

function svar(variant) {
  if (variant === 'utenTotal') { const { total, ...rest } = HENTET; return { hentetInn: rest, paaVei: PAA_VEI }; }
  if (variant === 'utenHentet') return { paaVei: PAA_VEI };
  return { hentetInn: HENTET, paaVei: PAA_VEI };
}
function router(variant, plan) {
  return route => {
    const url = new URL(route.request().url()), p = url.pathname;
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile') return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json(plan === 'gratis' ? gratis({ page_status:'live' }) : vekst());
    if (p === '/api/dashboard/attribution') return json(svar(variant));
    const listeAktig = /images|bookings|recent|services|hours|stats|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

// innerText (ikke textContent, som limer «Verving»+«5 klipp» sammen) med vanlige mellomrom (toLocaleString bruker hardt mellomrom).
const tekst = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
const browser = await chromium.launch();
const rad = [];

async function maal(bredde, variant, plan) {
  const ut = {};
  for (const flate of ['oversikt', 'vekst']) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(variant, plan));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    if (flate === 'vekst') await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1600);
    const sel = flate === 'oversikt' ? '#drivenBy' : '#attrRows';
    await page.evaluate(s => { const w = document.querySelector(s); if (w) w.scrollIntoView({ block:'center' }); }, sel);
    await page.waitForTimeout(200);
    await page.screenshot({ path:`${OUT}/attr-${flate}-${variant}-${plan}-${bredde}.png`, fullPage:false });
    ut[flate] = { txt: await tekst(page, sel), errs: errs.length,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) };
    await page.close();
  }
  return ut;
}

for (const bredde of [320, 375]) {
  for (const [variant, plan] of [['full', 'vekst'], ['utenTotal', 'vekst'], ['utenHentet', 'vekst'], ['full', 'gratis']]) {
    const m = await maal(bredde, variant, plan);
    rad.push({ bredde, variant, plan, oversikt: m.oversikt.txt.slice(0, 70), vekst: m.vekst.txt.slice(0, 70),
      overflow: Math.max(m.oversikt.overflow, m.vekst.overflow), jsfeil: m.oversikt.errs + m.vekst.errs, m });
  }
}
console.table(rad.map(({ m, ...r }) => r));

const finn = (v, p) => rad.filter(r => r.variant === v && r.plan === p);
const ARMER = ['Verving 5 klipp · 1 750 kr', 'Vinn tilbake 6 klipp · 2 400 kr', 'Rebooking 14 klipp · 4 900 kr'];
const harAlt = t => t.includes('25 klipp') && t.includes('9 050 kr') && ARMER.every(a => t.includes(a));
sjekk(finn('full', 'vekst').every(r => harAlt(r.m.oversikt.txt) && harAlt(r.m.vekst.txt)),
  'A: Vekst viser total 25 klipp · 9 050 kr og tre arm-rader med kroner (begge flater)',
  finn('full', 'vekst').map(r => r.m.oversikt.txt.slice(0, 160)).join(' || '));
sjekk(finn('utenTotal', 'vekst').every(r => [r.m.oversikt.txt, r.m.vekst.txt].every(t => /Ingen bookinger her ennå/.test(t) && !t.includes('9 050'))),
  'B: uten total → 0-tilstand, aldri klient-sum (9 050) av radene');
sjekk(finn('utenHentet', 'vekst').every(r => /Kunne ikke hente tallene akkurat nå/.test(r.m.vekst.txt) && /PÅ VEI/.test(r.m.oversikt.txt) && !/ kr\b/.test(r.m.oversikt.txt)),
  'C: hentetInn mangler → Vekst-fanen sier fra, Oversikt viser bare «På vei» uten kroner');
sjekk(finn('full', 'gratis').every(r => [r.m.oversikt.txt, r.m.vekst.txt].every(t => !/9 050|1 750|2 400|4 900/.test(t))),
  'D: Gratis viser aldri ekte tall, selv om backend sender hentetInn');
sjekk(rad.every(r => r.overflow <= 0), 'ingen horisontal overflow');
sjekk(rad.every(r => r.jsfeil === 0), 'ingen JS-feil');

await browser.close(); server.close();
ferdig();   // minst én NEI -> exit 1 (fixtures/sjekk.mjs)
