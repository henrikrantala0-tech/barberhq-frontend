// tools/render/sjekkliste-layout.mjs — «Fullfør siden din»: bildepunktet følger LAGRET layout
//
// Bildepunktet leses av backendens bildekrav (GET /design → bildekrav[layout].felt):
//   direkte  (ingen felt)        → punktet utelates, telleren «X av 4»
//   showcase (galleri)           → minst 2 i galleriet
//   profil   (portrett+galleri)  → portrett + minst 2 i galleriet
//   hero     (hero)              → ferdig når forsidebildet finnes
//   ukjent / ingen bildekrav     → dagens regel (minst 2 i galleriet)
// Siden lastes på OVERSIKT (ikke Din side), så testen fanger også at pillen er riktig før loadDesign
// har kjørt. Alle /api/** er mocket (catch-all) — ingen kall når prod.
//
//   node tools/render/sjekkliste-layout.mjs
//
// Skjermbilder → .render-ut/sjekk-layout-<case>-<bredde>.png (gitignorert). Exit 1 ved feil.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// Speiler backend src/lib/layoutBilder.cjs (LAYOUT_BILDER).
const BILDEKRAV = {
  profil:   { felt:['portrett','galleri'], baerer:'portrett', reserve:null,      maks:{ portrett:1, galleri:10 } },
  showcase: { felt:['galleri'],            baerer:'galleri',  reserve:null,      maks:{ galleri:10 } },
  hero:     { felt:['hero'],               baerer:'hero',     reserve:'galleri', maks:{ hero:1 } },
  direkte:  { felt:[],                     baerer:null,       reserve:null,      maks:{} },
};
const bilde = (id, slot) => ({ id, slot, url:'/no/images/layout-showcase.webp', sort_order:id });
const G = n => Array.from({ length:n }, (_, i) => bilde(10 + i, 'galleri'));

// navn, layout, bilder, medKrav, forventet { rader, bilder: null (utelatt) | {done, sub} }
const CASES = [
  ['direkte',          'direkte',  [],                                   true,  { rader:4, bilder:null }],
  ['showcase',         'showcase', G(3),                                 true,  { rader:5, bilder:{ done:true,  sub:'Minst 2 i galleriet' } }],
  ['showcase-1',       'showcase', G(1),                                 true,  { rader:5, bilder:{ done:false, sub:'Minst 2 i galleriet' } }],
  ['hero',             'hero',     [bilde(1,'hero')],                    true,  { rader:5, bilder:{ done:true,  sub:'Ett forsidebilde' } }],
  ['hero-kun-galleri', 'hero',     G(3),                                 true,  { rader:5, bilder:{ done:false, sub:'Ett forsidebilde' } }],
  ['profil',           'profil',   [bilde(1,'portrett'), ...G(2)],       true,  { rader:5, bilder:{ done:true,  sub:'Portrett + minst 2 i galleriet' } }],
  ['profil-uten-portrett','profil',G(3),                                 true,  { rader:5, bilder:{ done:false, sub:'Portrett + minst 2 i galleriet' } }],
  ['ukjent',           'direkte',  G(2),                                 false, { rader:5, bilder:{ done:true,  sub:'Minst 2 i galleriet' } }],
];
const SKJERMBILDER = new Set(['direkte', 'showcase', 'hero', 'profil']);

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true, name:'Henrik', shop:'Grand Barber',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const BILLING = { subscription_status:null, page_status:'forhandsvist', trial_start_at:null, trial_days_left:null,
  needs_attention:false, attention_grunn:null, plan:null, effective_plan:'basis', effective_plan_grunn:'gratis',
  cancel_at_period_end:false, current_period_end:null, trial_ends_at:null };
const SERVICES = { hoved:[{ name:'Herreklipp', price:350, min:30 }], tillegg:[] };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday:wd, is_closed:false, open_time:'10:00', close_time:'18:00', breaks:[] }))
  .concat([6,0].map(wd => ({ weekday:wd, is_closed:true, open_time:'10:00', close_time:'18:00', breaks:[] })));

function router(layout, bilder, medKrav) {
  const design = { palette:'minimal', font:'fraunces', layout, mode:'mork' };
  if (medKrav) Object.assign(design, { bildekrav:BILDEKRAV, bilde_status:{} });
  return route => {
    const p = new URL(route.request().url()).pathname;
    const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')        return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json(BILLING);
    if (p === '/api/dashboard/design')         return json(design);
    if (p === '/api/dashboard/images')         return json(bilder);
    if (p === '/api/dashboard/services')       return json(SERVICES);
    if (p === '/api/dashboard/hours')          return json(HOURS);
    const liste = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
    return json(liste ? [] : {});
  };
}

const browser = await chromium.launch();
const rad = []; let prod = 0;
for (const bredde of [320, 375]) for (const [navn, layout, bilder, medKrav, f] of CASES) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:780 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // Dashbordet kaller api.trybarberhq.com direkte; catch-all-ruta fanger alt under /api/. Teller det som SLIPPER unna.
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname.endsWith('trybarberhq.com') && !u.pathname.startsWith('/api/')) prod++; });
  await page.route('**/api/**', router(layout, bilder, medKrav));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#oversikt`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('#sjekkPillBtn'); await page.waitForTimeout(350);
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#sjekkPopover .sjekk-rad')];
    const b = rows.find(r => r.dataset.act === 'bilder');
    const ferdig = rows.filter(r => r.classList.contains('done')).length;
    return { rader:rows.length, ferdig, ring:document.querySelector('#sjekkRingNum').textContent,
      teller:(document.querySelector('#sjekkPopover .sjekk-panel-teller') || {}).textContent,
      bilder: b ? { done:b.classList.contains('done'), sub:b.querySelector('.sjekk-rad-s').textContent } : null,
      overflow: document.documentElement.scrollWidth - innerWidth };
  });
  if (SKJERMBILDER.has(navn)) await page.screenshot({ path:`${OUT}/sjekk-layout-${navn}-${bredde}.png` });
  const bOk = f.bilder === null ? m.bilder === null
    : (m.bilder && m.bilder.done === f.bilder.done && m.bilder.sub === f.bilder.sub);
  const ok = m.rader === f.rader && bOk && m.ring === `${m.ferdig}/${f.rader}` && m.teller === `${m.ferdig} av ${f.rader}`
    && m.overflow <= 0 && !errs.length;
  rad.push({ case:navn, bredde, rader:m.rader, ring:m.ring, teller:m.teller,
    bilder: m.bilder ? `${m.bilder.done ? '✓' : '·'} ${m.bilder.sub}` : '(utelatt)', jsfeil:errs.join('; ') || 'ingen', ok });
  await page.close();
}
console.table(rad);
console.log('umockede requests mot trybarberhq.com:', prod);
const alleOk = rad.every(r => r.ok) && prod === 0;
console.log(alleOk ? '\nAlle OK' : '\nFEIL');
await browser.close(); server.close();
process.exit(alleOk ? 0 : 1);
