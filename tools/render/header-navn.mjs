// tools/render/header-navn.mjs — dashbordets header-navn (#barberName, no/dashboard.html, 10.10).
//
// Før: «Grand Barber» var hardkodet i markupen og blinket for ALLE barbere til /profile svarte.
// Nå: tomt felt med en nøytral skjelett-linje i samme høyde til barberens ekte navn er lastet.
// Dekker: ingen demonavn i markupen, skjelett før data, ekte navn etter, headeren hopper ikke
// (samme høyde før/etter), og /profile som feiler → tomt felt, ikke skjelett for alltid. 320/375.
// /profile holdes igjen til testen slipper den, så «før» faktisk er før. Alt /api/** mockes.
//
//   node tools/render/header-navn.mjs
//
// Skjermbilder → .render-ut/header-navn/ (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/header-navn');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const browser = await chromium.launch();
let feil = 0, apiForsok = 0, apiMocket = 0;
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };
const NAVN = 'Klipp & Co Bislett';   // ekte barbernavn i mocken — ikke et demonavn fra markupen

// Markupen selv: ingen demonavn i #barberName.
const kilde = fs.readFileSync(path.join(ROOT, 'no/dashboard.html'), 'utf8');
const markup = (kilde.match(/<b class="shopnavn[^"]*" id="barberName"[^>]*>([^<]*)<\/b>/) || [])[1];
sjekk(markup === '', `markup: #barberName er tomt i HTML-en («${markup}»)`);

async function side(bredde, { profilStatus = 200 } = {}) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 700 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let slipp; const holdt = new Promise(r => { slipp = r; });
  page.on('request', q => { if (new URL(q.url()).hostname === 'api.trybarberhq.com') apiForsok++; });
  await page.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    if (u.hostname === 'api.trybarberhq.com') apiMocket++;
    if (u.hostname === 'localhost' && !p.startsWith('/api/')) return route.continue();
    if (!p.startsWith('/api/')) { if (u.hostname === 'api.trybarberhq.com') return route.fulfill({ path: path.join(ROOT, decodeURIComponent(p)) });
      if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$/.test(u.hostname)) return route.continue(); return route.abort(); }
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/dashboard/profile') { await holdt;
      return profilStatus === 200 ? json({ hasPassword: true, name: 'Ola', shop: NAVN, email: 'ola@klipp.no', slug: 'klipp-co' }) : json({ error: 'feil' }, profilStatus); }
    if (p === '/api/dashboard/billing/status') return json({ subscription_status: 'active', page_status: 'live', plan: 'vekst', effective_plan: 'vekst', effective_plan_grunn: 'subscription',
      needs_attention: false, cancel_at_period_end: false, current_period_end: null, sms_saldo: 0, sms_pakke_kan_kjopes: false });
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  return { page, errs, slipp };
}
const maal = page => page.evaluate(() => {
  const el = document.getElementById('barberName'), top = document.querySelector('header.top');
  const r = el.getBoundingClientRect();
  return { tekst: el.textContent, laster: el.classList.contains('laster'), bredde: Math.round(r.width), hoyde: Math.round(r.height * 10) / 10,
    header: Math.round(top.getBoundingClientRect().height * 10) / 10,
    bg: getComputedStyle(el).backgroundColor,
    harDemo: /Grand Barber/.test(document.querySelector('header.top').textContent),
    lenke: (()=>{ const l=document.getElementById('headerLenke'); return l&&!l.hidden ? Math.round(l.getBoundingClientRect().height*10)/10 : 0; })() };
});
const topp = (page, navn) => page.screenshot({ path: path.join(OUT, navn + '.png'), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 120 } });

for (const bredde of [320, 375]) {
  { const { page, errs, slipp } = await side(bredde);
    const foer = await maal(page);
    sjekk(foer.tekst === '' && foer.laster && !foer.harDemo && foer.bredde > 40 && foer.bg !== 'rgba(0, 0, 0, 0)',
      `${bredde} før data: tomt felt med skjelett (${foer.bredde}×${foer.hoyde}px), ingen demonavn`);
    await topp(page, `for-data-${bredde}`);
    slipp(); await page.waitForTimeout(700);
    const etter = await maal(page);
    sjekk(etter.tekst === NAVN && !etter.laster && !etter.harDemo, `${bredde} etter data: «${etter.tekst}», skjelettet borte`);
    // Navnet skal aldri bli HØYERE enn skjelettet (da ville det skyve). Lavere er lov: fitShopnavn krymper
    // fonten på smale skjermer for å få plass ved siden av bookinglenka.
    sjekk(etter.hoyde <= foer.hoyde + 0.5, `${bredde} navnet skyver ikke: skjelett ${foer.hoyde}px → navn ${etter.hoyde}px høyt`);
    console.log(`INFO ${bredde} bookinglenka (#headerLenke, ${etter.lenke}px) vises når siden er live: header ${foer.header}px → ${etter.header}px — eget hopp, eldre enn denne endringen`);
    await topp(page, `etter-data-${bredde}`);
    sjekk(errs.length === 0, `${bredde}: JS-feil ${errs.join(' | ')}`); await page.close(); }
  { const { page, errs, slipp } = await side(bredde, { profilStatus: 500 });
    slipp(); await page.waitForTimeout(700);
    const m = await maal(page);
    sjekk(m.tekst === '' && !m.laster, `${bredde} /profile feiler: tomt felt, ikke skjelett for alltid`);
    sjekk(m.hoyde >= 16, `${bredde} /profile feiler: navnefeltet holder én linjes høyde (${m.hoyde}px), innholdet under hopper ikke`);
    await topp(page, `profil-feiler-${bredde}`);
    sjekk(errs.length === 0, `${bredde} feil-tilfellet: JS-feil ${errs.join(' | ')}`); await page.close(); }
}
sjekk(apiForsok === apiMocket, `alle ${apiForsok} kall mot api.trybarberhq.com besvart av mocken — ingen nådde prod`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
