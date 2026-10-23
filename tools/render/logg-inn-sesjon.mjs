// tools/render/logg-inn-sesjon.mjs — «en aktiv sesjon betyr at ingen innlogging venter» (19.10.2026).
//
// logg-inn.html lagrer kodeforespørselen (localStorage 'bhq-innlogging-kode', 10 min) og gjenoppretter steg 2
// («Vi har sendt en kode …» + kodefelt) ved hver innlasting. Dashbordet sletter nøkkelen når det starter med
// gyldig sesjon og ved utlogging (glemInnloggingKode), så logg-inn viser steg 1 etter utlogging og etter 401 —
// også når barberen logget inn via lenka i e-posten, som aldri rører nøkkelen.
//
//   A. forespørsel lagret → dashbord med gyldig sesjon → nøkkelen er borte → «Logg ut» → logg-inn viser steg 1.
//   B. dashbord med gyldig sesjon → et kall svarer 401 senere i økta → logg-inn viser steg 1.
//   C. forespørsel lagret → dashbord UTEN sesjon (401 på /profile) → nøkkelen BEHOLDES (hjemskjerm-appen
//      ble drept mens koden hentes i Mail) → logg-inn viser steg 2.
//
// Skjermbilder 320/375 av logg-inn etter utlogging (A) i .render-ut/logg-inn-sesjon/. Alt mot /api/** mockes;
// alt annet mot trybarberhq.com avbrytes og telles (skal være 0).
//
//   node tools/render/logg-inn-sesjon.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { gratis } from './fixtures/billing.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/logg-inn-sesjon');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
               '.png':'image/png', '.webp':'image/webp', '.json':'application/json', '.mp4':'video/mp4' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const U = `http://localhost:${PORT}/no`;

const KEY = 'bhq-innlogging-kode';
const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber',
                  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const DESIGN  = { mode: 'mork', font: 'jakarta' };

// Mock-ruter. sesjon=false → alt svarer 401 (ingen sesjon). sperr401 settes i case B: /services svarer 401.
function ruter(opts) {
  const st = { prod: 0, sesjon: opts.sesjon, sperr401: false };
  const handler = route => {
    const req = route.request(); const u = new URL(req.url());
    const json = (o, status = 200) => route.fulfill({ status, contentType:'application/json', body: JSON.stringify(o) });
    const p = u.pathname;
    if (p === '/api/logout') return json({ ok:true });
    if (!st.sesjon) return json({ error:'Ikke innlogget' }, 401);
    if (st.sperr401 && p === '/api/dashboard/services') return json({ error:'Sesjonen er utløpt' }, 401);
    if (p === '/api/dashboard/profile') return json(PROFILE);
    if (p === '/api/dashboard/design')  return json(DESIGN);
    if (p === '/api/dashboard/billing/status') return json(gratis({ page_status:'live' }));
    if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><html><body></body></html>' });
    return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|sms-logg/.test(p) ? [] : {});
  };
  return { st, handler };
}

// Catch-all: ALT under /api/ mockes uansett vert (dashbordet kaller api.trybarberhq.com også fra localhost).
// Alt annet mot trybarberhq.com ville vært ekte nett → avbrytes og telles (skal være 0).
function rute(r, st, handler) {
  const u = new URL(r.request().url());
  if (u.pathname.startsWith('/api/')) return handler(r);
  if (/trybarberhq\.com$/.test(u.hostname)) { st.prod++; return r.abort(); }
  return r.continue();
}
const synlig = (page, sel) => page.$eval(sel, el => el.offsetParent !== null).catch(() => false);
const lagret = page => page.evaluate(k => { try { return localStorage.getItem(k); } catch (_) { return 'FEIL'; } }, KEY);
const leggInn = page => page.evaluate(k => localStorage.setItem(k, JSON.stringify({
  request_id:'rid-1', email:'g@b.no', formaal:null, utloper: Date.now() + 9 * 60e3 })), KEY);

const browser = await chromium.launch();
const rapport = [];
for (const bredde of [320, 375]) {
  // ── A: lagret forespørsel → dashbord (gyldig sesjon) → nøkkel borte → Logg ut → steg 1 ──
  {
    const ctx = await browser.newContext({ viewport:{ width:bredde, height:800 }, deviceScaleFactor:2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const { st, handler } = ruter({ sesjon:true }); await ctx.route('**/*', r => rute(r, st, handler));
    await page.goto(`${U}/logg-inn.html`, { waitUntil:'networkidle' });
    await leggInn(page); await page.reload({ waitUntil:'networkidle' });
    const forSteg2 = await synlig(page, '#steg2');                     // sanity: gjenoppretting virker
    await page.goto(`${U}/dashboard.html`, { waitUntil:'networkidle' }); await page.waitForTimeout(800);
    const etterStart = await lagret(page);
    await page.$eval('#loggUt', b => b.click());
    await page.waitForURL(/logg-inn\.html/, { timeout: 20000 }).catch(() => {}); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    const nav = /logg-inn\.html/.test(page.url()) ? null : 'ingen redirect til logg-inn (står på ' + page.url() + ')';
    const steg1 = await synlig(page, '#steg1'), steg2 = await synlig(page, '#steg2'), kode = await synlig(page, '#kode');
    await page.screenshot({ path: `${OUT}/${bredde}-etter-utlogging.png`, fullPage: true });
    const feil = []; if (nav) feil.push(nav);
    if (!forSteg2) feil.push('sanity: steg 2 ble ikke gjenopprettet før dashbordet');
    if (etterStart !== null) feil.push('nøkkelen står etter dashbord-start med gyldig sesjon');
    if (!steg1 || steg2 || kode) feil.push(`etter utlogging: steg1=${steg1} steg2=${steg2} kode=${kode}`);
    if (st.prod) feil.push(`${st.prod} kall mot prod`);
    rapport.push({ bredde, case:'A lenke→logg ut', steg1, steg2, nokkel: etterStart === null ? 'borte' : 'STÅR', prod: st.prod, jsfeil: errs.join('; ') || 'ingen', avvik: feil.join(' · ') || '—' });
    await ctx.close();
  }
  // ── B: gyldig sesjon → 401 senere i økta → logg-inn viser steg 1 ──
  {
    const ctx = await browser.newContext({ viewport:{ width:bredde, height:800 }, deviceScaleFactor:2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const { st, handler } = ruter({ sesjon:true }); await ctx.route('**/*', r => rute(r, st, handler));
    await page.goto(`${U}/logg-inn.html`, { waitUntil:'networkidle' }); await leggInn(page);
    await page.goto(`${U}/dashboard.html`, { waitUntil:'networkidle' }); await page.waitForTimeout(800);
    st.sperr401 = true;
    await page.$eval('button[data-panel="tjenester"]', b => b.click());
    await page.waitForURL(/logg-inn\.html/, { timeout: 20000 }).catch(() => {}); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    const nav = /logg-inn\.html/.test(page.url()) ? null : 'ingen redirect til logg-inn (står på ' + page.url() + ')';
    const steg1 = await synlig(page, '#steg1'), steg2 = await synlig(page, '#steg2');
    const feil = []; if (nav) feil.push(nav);
    if (!steg1 || steg2) feil.push(`etter 401: steg1=${steg1} steg2=${steg2}`);
    if (st.prod) feil.push(`${st.prod} kall mot prod`);
    rapport.push({ bredde, case:'B 401 i økta', steg1, steg2, nokkel: (await lagret(page)) === null ? 'borte' : 'STÅR', prod: st.prod, jsfeil: errs.join('; ') || 'ingen', avvik: feil.join(' · ') || '—' });
    await ctx.close();
  }
  // ── C: lagret forespørsel → dashbord UTEN sesjon → nøkkel beholdes → logg-inn viser steg 2 ──
  {
    const ctx = await browser.newContext({ viewport:{ width:bredde, height:800 }, deviceScaleFactor:2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const { st, handler } = ruter({ sesjon:false }); await ctx.route('**/*', r => rute(r, st, handler));
    await page.goto(`${U}/logg-inn.html`, { waitUntil:'networkidle' }); await leggInn(page);
    const t0 = Date.now(); await page.goto(`${U}/dashboard.html`, { waitUntil:'commit' });
    await page.waitForURL(/logg-inn\.html/, { timeout: 20000 }).catch(() => {}); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    const nav = /logg-inn\.html/.test(page.url()) ? null : 'ingen redirect til logg-inn (står på ' + page.url() + ')';
    const steg1 = await synlig(page, '#steg1'), steg2 = await synlig(page, '#steg2'), nokkel = await lagret(page);
    const feil = []; if (nav) feil.push(nav);
    if (nokkel === null) feil.push('nøkkelen ble slettet uten gyldig sesjon');
    if (steg1 || !steg2) feil.push(`uten sesjon: steg1=${steg1} steg2=${steg2}`);
    if (st.prod) feil.push(`${st.prod} kall mot prod`);
    rapport.push({ bredde, case:'C uten sesjon', ms: Date.now() - t0, steg1, steg2, nokkel: nokkel === null ? 'BORTE' : 'står', prod: st.prod, jsfeil: errs.join('; ') || 'ingen', avvik: feil.join(' · ') || '—' });
    await ctx.close();
  }
}
await browser.close(); server.close();
console.table(rapport);
const ok = rapport.every(r => r.avvik === '—' && r.jsfeil === 'ingen');
console.log('SAMLET:', ok ? 'OK ✓' : 'NOE FEILER ✗');
if (!ok) process.exitCode = 1;
