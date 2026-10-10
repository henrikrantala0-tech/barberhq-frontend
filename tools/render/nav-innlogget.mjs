// tools/render/nav-innlogget.mjs — «Mitt dashbord» i nav-en på alle no/-markedssider (10.10).
//
// Innlogget barber som havner på en markedsside (f.eks. Vilkår/Personvern/Support fra Konto i
// hjemskjerm-appen) skal ha ett trykk tilbake: nav-knappen viser «Mitt dashbord» → dashboard.html.
// Utlogget: «Kom i gang gratis» → kom-i-gang.html som før. Sjekken (GET /api/dashboard/session) holdes
// igjen av testen, så knappen måles FØR og ETTER svaret: samme bredde og plassering (ingen hopp).
// Dekker også minnet (localStorage 'bhq-innlogget'): innlogget barber ser riktig knapp med en gang, og et
// gammelt «innlogget»-minne rettes når sjekken sier utlogget. Alt mot api.trybarberhq.com mockes.
//
//   node tools/render/nav-innlogget.mjs
//
// Skjermbilder → .render-ut/nav-innlogget/ (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/nav-innlogget');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const SIDER = ['index', 'funksjoner', 'priser', 'support', 'vanlige-sporsmal', 'vilkar', 'databehandleravtale'];
const browser = await chromium.launch();
let feil = 0, ute = 0, skriv = 0;
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };

async function side(navn, bredde, { innlogget, minne = null }) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 800 }, deviceScaleFactor: 2 });
  if (minne !== null) await ctx.addInitScript(m => { try { localStorage.setItem('bhq-innlogget', m); } catch (e) {} }, minne);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let slipp; const holdt = new Promise(r => { slipp = r; });
  await page.route('**/*', async r => { const req = r.request(); const u = new URL(req.url());
    if (req.method() !== 'GET') { skriv++; return r.abort(); }
    if (u.hostname === 'localhost') return r.continue();
    if (u.hostname === 'api.trybarberhq.com' && u.pathname === '/api/dashboard/session') { await holdt;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ loggedIn: innlogget, isDemo: false }) }); }
    if (u.hostname === 'api.trybarberhq.com') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$|unpkg\.com$/.test(u.hostname)) return r.continue();
    ute++; return r.abort(); });
  await page.goto(`http://localhost:${PORT}/no/${navn}.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, slipp };
}
const knapp = page => page.evaluate(() => { const a = document.getElementById('navCta'); if (!a) return null; const r = a.getBoundingClientRect();
  return { tekst: a.textContent.trim(), href: a.getAttribute('href'), x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10,
    bg: getComputedStyle(a).backgroundColor, farge: getComputedStyle(a).color,
    w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, synlig: r.width > 0 && getComputedStyle(a).visibility !== 'hidden',
    linjer: (() => { const g = document.createRange(); g.selectNodeContents(a.firstElementChild); return new Set([...g.getClientRects()].map(x => Math.round(x.top))).size; })() }; });
const navBilde = (page, fil) => page.screenshot({ path: path.join(OUT, fil + '.png'), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 90 } });

for (const navn of SIDER) for (const bredde of [320, 375]) {
  for (const innlogget of [false, true]) {
    const id = `${bredde} ${navn} ${innlogget ? 'innlogget' : 'utlogget'}`;
    const { ctx, page, errs, slipp } = await side(navn, bredde, { innlogget });
    const foer = await knapp(page);
    slipp(); await page.waitForTimeout(500);
    const etter = await knapp(page);
    if (!foer) { sjekk(false, `${id}: fant ikke #navCta`); await ctx.close(); continue; }
    sjekk(foer.tekst === 'Kom i gang gratis' && foer.href === 'kom-i-gang.html', `${id}: før sjekken «${foer.tekst}» → ${foer.href}`);
    const vent = innlogget ? ['Mitt dashbord', 'dashboard.html'] : ['Kom i gang gratis', 'kom-i-gang.html'];
    sjekk(etter.tekst === vent[0] && etter.href === vent[1] && etter.synlig && etter.linjer === 1, `${id}: etter sjekken «${etter.tekst}» → ${etter.href} (én linje)`);
    // Farge følger tilstanden: innlogget = hvit knapp med mørk tekst, utlogget = blå med hvit tekst.
    const fargeVent = innlogget ? ['rgb(255, 255, 255)', 'rgb(0, 0, 0)'] : ['rgb(37, 99, 235)', 'rgb(255, 255, 255)'];
    sjekk(foer.bg === 'rgb(37, 99, 235)' && etter.bg === fargeVent[0] && etter.farge === fargeVent[1], `${id}: farge før ${foer.bg}, etter ${etter.bg} / tekst ${etter.farge}`);
    sjekk(etter.x === foer.x && etter.y === foer.y && etter.w === foer.w && etter.h === foer.h,
      `${id}: knappen står stille (${foer.w}×${foer.h} @ ${foer.x},${foer.y} → ${etter.w}×${etter.h} @ ${etter.x},${etter.y})`);
    if (navn === 'vilkar') await navBilde(page, `vilkar-${innlogget ? 'innlogget' : 'utlogget'}-${bredde}`);
    sjekk(errs.length === 0, `${id}: JS-feil ${errs.join(' | ')}`);
    await ctx.close();
  }
}
// Minnet: innlogget barber ser «Mitt dashbord» FØR sjekken svarer; gammelt minne rettes ved utlogget.
for (const bredde of [320, 375]) {
  { const { ctx, page, errs, slipp } = await side('vilkar', bredde, { innlogget: true, minne: '1' });
    const foer = await knapp(page); slipp(); await page.waitForTimeout(500); const etter = await knapp(page);
    sjekk(foer.tekst === 'Mitt dashbord' && etter.tekst === 'Mitt dashbord' && foer.w === etter.w && foer.x === etter.x,
      `${bredde} minne=1, innlogget: «Mitt dashbord» med en gang og etter sjekken, står stille`);
    sjekk(errs.length === 0, `${bredde} minne innlogget: JS-feil ${errs.join(' | ')}`); await ctx.close(); }
  { const { ctx, page, errs, slipp } = await side('vilkar', bredde, { innlogget: false, minne: '1' });
    const foer = await knapp(page); slipp(); await page.waitForTimeout(500); const etter = await knapp(page);
    const lagret = await page.evaluate(() => localStorage.getItem('bhq-innlogget'));
    sjekk(foer.tekst === 'Mitt dashbord' && etter.tekst === 'Kom i gang gratis' && lagret === '0' && foer.w === etter.w,
      `${bredde} minne=1, men utlogget: rettes til «Kom i gang gratis», minnet → 0, samme bredde`);
    sjekk(errs.length === 0, `${bredde} minne utlogget: JS-feil ${errs.join(' | ')}`); await ctx.close(); }
}
sjekk(ute === 0 && skriv === 0, `ingen uventede eksterne kall (${ute}) og ingen skrivekall (${skriv})`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
