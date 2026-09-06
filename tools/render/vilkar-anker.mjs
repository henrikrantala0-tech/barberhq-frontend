// tools/render/vilkar-anker.mjs — footer-ankrene til vilkar.html.
// Klikker «Personvern»/«Cookies» i footeren på index.html → navigerer til vilkar.html#…,
// og verifiserer at seksjons-overskriften lander UNDER den sticky navigasjonen (ikke bak den).
// scroll-padding-top:84px på html gir klaringen. Screenshotter topp-regionen @320/375.
//
//   node tools/render/vilkar-anker.mjs
//
// Skjermbilder → .render-ut/vilkar-*.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 375]) {
  for (const [label, frag, ventet] of [['Personvern','personvern','Data om deg'], ['Cookies','cookies','Cookies']]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:780 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    // Blokker eksterne fonter/ikoner (CDN) så vi ikke venter på nett; nav-høyden er CSS-fast (68px).
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes(`localhost:${PORT}`)) return route.continue();
      return route.abort();
    });
    await page.goto(`http://localhost:${PORT}/no/index.html`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(400);
    // Klikk footer-lenka (auto-scroll til footer skjer i click) → cross-page-navigasjon til vilkar.html#frag.
    await Promise.all([
      page.waitForNavigation({ waitUntil:'domcontentloaded' }),
      page.click(`.foot-col a[href="vilkar.html#${frag}"]`),
    ]);
    await page.waitForTimeout(700); // hash-scroll + ev. reveal-observer
    await page.screenshot({ path:`${OUT}/vilkar-${frag}-${bredde}.png`, fullPage:false, clip:{ x:0, y:0, width:bredde, height:260 } });
    const m = await page.evaluate((id) => {
      const nav = document.querySelector('.nav');
      const el = document.getElementById(id);
      const navB = nav ? Math.round(nav.getBoundingClientRect().bottom) : null;
      const hTop = el ? Math.round(el.getBoundingClientRect().top) : null;
      const cs = el ? getComputedStyle(el) : null;
      const synlig = el ? (cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5 && el.getBoundingClientRect().height > 0) : false;
      return { navBunn:navB, seksjonTopp:hTop, underNav: (hTop!=null && navB!=null && hTop >= navB), synlig,
        tekst: el ? el.textContent.slice(0,16) : null, url: location.hash };
    }, frag);
    rad.push({ bredde, lenke:label, seksjon:m.tekst, navBunn:m.navBunn, seksjonTopp:m.seksjonTopp,
      underNav:m.underNav, synlig:m.synlig, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);
// OK = seksjonstoppen ligger PÅ eller under nav-bunnen (ikke bak), seksjonen er synlig, 0 JS-feil.
const ok = rad.every(r => r.underNav && r.synlig && r.jsfeil === 'ingen');
console.log('\nAnker OK (seksjon under nav, synlig, 0 JS-feil):', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
