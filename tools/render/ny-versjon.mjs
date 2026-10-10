// tools/render/ny-versjon.mjs — dashbordet laster seg inn på nytt etter en deploy (no/dashboard.html, 10.10).
//
// Simulerer en ny deploy ved å bytte ETag-en som HEAD /no/dashboard.html svarer med, og lar dashbordet
// komme i forgrunnen (visibilitychange → visible, eller pageshow fra bfcache). Dekker:
//   A  ny ETag, ingenting ulagret          → siden lastes inn på nytt
//   B  ny ETag, ulagret tekst i et felt     → stripe «Ny versjon. Last inn på nytt.», ingen ny lasting;
//                                             knappen laster inn på nytt
//   C  maks én sjekk per minutt             → to forgrunns-hendelser innen et minutt = ett HEAD-kall
//   D  feilet sjekk (500)                   → ingenting skjer
//   E  feltet er lagret (PUT ok)            → regnes ikke som ulagret → ny lasting
//   F  pageshow fra bfcache                 → sjekker også
//   G  bare ETag-endelsen endret (-ssl/-df) → ikke ny versjon (kun innholdshashen sammenlignes)
// Tiden styres med page.clock (install + resume, fastForward over minuttet). Alt /api/** mockes.
//
//   node tools/render/ny-versjon.mjs
//
// Skjermbilder → .render-ut/ny-versjon/ (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/ny-versjon');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const browser = await chromium.launch();
let feil = 0, apiForsok = 0, apiMocket = 0;
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };

async function side(bredde = 375) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 800 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const st = { etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ssl"', headStatus: 200, head: 0, lastinger: 0, profilPut: 0 };
  page.on('request', q => { const u = new URL(q.url());
    if (u.hostname === 'api.trybarberhq.com') apiForsok++;
    if (u.pathname === '/no/dashboard.html' && q.method() === 'GET' && q.resourceType() === 'document') st.lastinger++; });
  await page.route('**/*', route => { const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    if (u.hostname === 'api.trybarberhq.com') apiMocket++;
    if (u.hostname === 'localhost' && p === '/no/dashboard.html' && req.method() === 'HEAD') {
      st.head++; return route.fulfill({ status: st.headStatus, headers: st.headStatus === 200 ? { ETag: st.etag } : {}, body: '' }); }
    if (u.hostname === 'localhost' && !p.startsWith('/api/')) return route.continue();
    if (!p.startsWith('/api/')) { if (u.hostname === 'api.trybarberhq.com') return route.fulfill({ path: path.join(ROOT, decodeURIComponent(p)) });
      if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$/.test(u.hostname)) return route.continue(); return route.abort(); }
    const json = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/dashboard/billing/status') return json({ subscription_status: 'active', page_status: 'live', plan: 'vekst', effective_plan: 'vekst',
      effective_plan_grunn: 'subscription', needs_attention: false, cancel_at_period_end: false, current_period_end: null, sms_saldo: 0, sms_pakke_kan_kjopes: false });
    if (p === '/api/dashboard/profile' && req.method() === 'GET') return json({ hasPassword: true, name: 'Henrik Rantala', shop: 'Grand Barber', email: 'h@g.no', slug: 'grand-barber' });
    if (p === '/api/dashboard/profile' && req.method() === 'PUT') { st.profilPut++; return json({ ok: true }); }
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p) ? [] : {}); });
  await page.clock.install(); await page.clock.resume();
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#konto`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  return { page, errs, st };
}
const forgrunn = page => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});
const etMinutt = page => page.clock.fastForward(61 * 1000);
const stripe = page => page.$eval('#nyVersjon', e => !e.hidden && e.getBoundingClientRect().height > 0);
async function ventLasting(st, foer) { for (let i = 0; i < 30 && st.lastinger === foer; i++) await new Promise(r => setTimeout(r, 100)); }

{ // A — ny ETag, ingenting ulagret → ny lasting
  const { page, errs, st } = await side();
  sjekk(st.head === 1 && st.lastinger === 1, `A: oppstart henter ETag én gang (HEAD ${st.head}), én lasting`);
  await etMinutt(page); st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"'; await forgrunn(page); await ventLasting(st, 1);
  sjekk(st.lastinger === 2, `A: ny ETag + ingenting ulagret → lastet inn på nytt (lastinger ${st.lastinger})`);
  sjekk(errs.length === 0, `A: JS-feil ${errs.join(' | ')}`); await page.close();
}
for (const bredde of [320, 375]) { // B — ny ETag + ulagret tekst → stripe, ingen ny lasting; knappen laster inn på nytt
  const { page, errs, st } = await side(bredde);
  await page.click('#radNavn [data-endre]'); await page.fill('#pf-name', 'Henrik R.'); await page.type('#pf-name', 'x');
  await etMinutt(page); st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"'; await forgrunn(page); await page.waitForTimeout(600);
  sjekk(await stripe(page) && st.lastinger === 1, `B ${bredde}: ulagret navn → stripe vises, ingen ny lasting`);
  sjekk(await page.$eval('#nyVersjon', e => e.textContent.replace(/\s+/g, ' ').trim()) === 'Ny versjon.Last inn på nytt'
    || await page.$eval('#nyVersjon', e => e.innerText.replace(/\s+/g, ' ').trim()) === 'Ny versjon. Last inn på nytt', `B ${bredde}: tekst «Ny versjon. Last inn på nytt»`);
  sjekk(await page.$eval('#pf-name', e => e.value) === 'Henrik R.x', `B ${bredde}: det barbereren skrev står fortsatt`);
  sjekk(!(await page.$eval('#hsNudge', e => e.classList.contains('show'))), `B ${bredde}: aldri to topplinjer (hjemskjerm-stripa skjult mens «Ny versjon» vises)`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, `stripe-${bredde}.png`), clip: { x: 0, y: 0, width: bredde, height: 260 } });
  await page.click('#nyVersjonLast'); await ventLasting(st, 1);
  sjekk(st.lastinger === 2, `B ${bredde}: «Last inn på nytt» laster inn på nytt`);
  sjekk(errs.length === 0, `B ${bredde}: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // C — maks én sjekk per minutt
  const { page, errs, st } = await side();
  await forgrunn(page); await page.waitForTimeout(300);
  sjekk(st.head === 1, `C: forgrunn innen første minutt → ingen ny sjekk (HEAD ${st.head})`);
  await etMinutt(page); await forgrunn(page); await page.waitForTimeout(300); await forgrunn(page); await page.waitForTimeout(300);
  sjekk(st.head === 2 && st.lastinger === 1, `C: to forgrunns-hendelser etter et minutt → ett HEAD-kall (HEAD ${st.head}), uendret ETag → ingen lasting`);
  sjekk(errs.length === 0, `C: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // D — feilet sjekk → ingenting
  const { page, errs, st } = await side();
  await etMinutt(page); st.headStatus = 500; st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"'; await forgrunn(page); await page.waitForTimeout(600);
  sjekk(st.head === 2 && st.lastinger === 1 && !(await stripe(page)), `D: HEAD 500 → ingen lasting, ingen stripe`);
  sjekk(errs.length === 0, `D: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // E — lagret felt teller ikke som ulagret
  const { page, errs, st } = await side();
  await page.click('#radNavn [data-endre]'); await page.fill('#pf-name', ''); await page.type('#pf-name', 'Henrik R.');
  await page.click('#saveNavn'); await page.waitForTimeout(600);
  sjekk(st.profilPut === 1, `E: navnet lagret (PUT /profile)`);
  await etMinutt(page); st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"'; await forgrunn(page); await ventLasting(st, 1);
  sjekk(st.lastinger === 2, `E: lagret felt → ny lasting, ikke stripe (lastinger ${st.lastinger})`);
  sjekk(errs.length === 0, `E: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // F — pageshow fra bfcache
  const { page, errs, st } = await side();
  await etMinutt(page); st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"';
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await ventLasting(st, 1);
  sjekk(st.lastinger === 2, `F: pageshow (persisted) med ny ETag → lastet inn på nytt`);
  sjekk(errs.length === 0, `F: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // G — samme innhold, annen komprimering (Netlify: -ssl ↔ -ssl-df) → IKKE ny versjon
  const { page, errs, st } = await side();
  await etMinutt(page); st.etag = '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ssl-df"'; await forgrunn(page); await page.waitForTimeout(600);
  sjekk(st.head === 2 && st.lastinger === 1 && !(await stripe(page)), `G: bare ETag-endelsen endret → ingen lasting, ingen stripe`);
  sjekk(errs.length === 0, `G: JS-feil ${errs.join(' | ')}`); await page.close();
}
sjekk(apiForsok === apiMocket,`alle ${apiForsok} kall mot api.trybarberhq.com besvart av mocken — ingen nådde prod`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
