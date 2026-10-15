// tools/render/hjemskjerm-innebygd.mjs — hjemskjerm-kortet i innebygde nettlesere (Oversikt)
//
// Innebygd nettleser (Instagram, Google-appen, Android-WebView …) får ÉN variant: kopier dashbord-lenka,
// lim inn i Chrome/Safari, logg inn med koden. Ingen menysteg per app. Snarveien «del-ikonet → Åpne i
// Safari» vises KUN i Google-appen på iPhone (GSA/). Vanlig Safari/Chrome er uendret.
//
// Sjekker per UA @320/375: riktig variant, snarvei av/på, tre steg, ingen menysteg (⋮/«ekstern nettleser»),
// kopier → utklippstavla får NØYAKTIG dashbord-adressen (uten query/hash), og avvist kopiering → reservefelt
// med adressen. Alle /api/** er mocket (catch-all) — ingen kall når prod.
//
//   node tools/render/hjemskjerm-innebygd.mjs
//
// Skjermbilder → .render-ut/hs-<ua>-<bredde>.png (gitignorert). Exit 1 ved feil.

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

const UA = {
  'ios-safari':    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'ios-google':    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/322.0.648915268 Mobile/15E148 Safari/604.1',
  'ios-instagram': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0 (iPhone14,5; iOS 17_5; nb_NO; nb; scale=3.00; 1170x2532)',
  'android-wv':    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 GSA/15.17.0',
};
const FORVENT = { // variant, snarvei
  'ios-safari':    ['ios', false],
  'ios-google':    ['innebygd', true],
  'ios-instagram': ['innebygd', false],
  'android-wv':    ['innebygd', false],
};

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true, name:'Henrik', shop:'Grand Barber',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const BILLING = { subscription_status:null, page_status:'live', trial_start_at:null, trial_days_left:null,
  needs_attention:false, attention_grunn:null, plan:null, effective_plan:'basis', effective_plan_grunn:'gratis',
  cancel_at_period_end:false, current_period_end:null, trial_ends_at:null };
function router(route) {
  const p = new URL(route.request().url()).pathname;
  const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/profile')        return json(PROFILE);
  if (p === '/api/dashboard/billing/status') return json(BILLING);
  // Første booking avgjort og ferdig → seksjonen skjult, hjemskjerm-kortet slipper fram.
  if (p === '/api/dashboard/aktivering')     return json({ har_booking:true, steg:{ svarmelding:true, bio:true, story:true } });
  if (p === '/api/dashboard/design')         return json({ palette:'minimal', font:'fraunces', layout:'showcase', mode:'mork' });
  const liste = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
  return json(liste ? [] : {});
}

const browser = await chromium.launch();
const rad = []; let prod = 0;
for (const bredde of [320, 375]) for (const [navn, ua] of Object.entries(UA)) for (const avvis of [false, true]) {
  if (avvis && FORVENT[navn][0] !== 'innebygd') continue;   // reservefeltet finnes bare i innebygd-varianten
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:780 }, deviceScaleFactor:2, userAgent:ua,
    isMobile:true, hasTouch:true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin:`http://localhost:${PORT}` });
  if (avvis) await ctx.addInitScript(() => {   // utklippstavla avvist i appens nettleser
    try { Object.defineProperty(navigator, 'clipboard', { value:{ writeText:() => Promise.reject(new Error('nei')) } }); } catch (e) {}
    document.execCommand = () => false;
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // Dashbordet kaller api.trybarberhq.com direkte; catch-all-ruta fanger alt under /api/. Teller det som SLIPPER unna.
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname.endsWith('trybarberhq.com') && !u.pathname.startsWith('/api/')) prod++; });
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html?velkommen=0#oversikt`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const k = document.querySelector('#hsKort');
    const v = [...k.querySelectorAll('[data-hs]')].find(e => !e.hidden);
    const snar = document.querySelector('#hsSnarvei');
    const tekst = v ? v.innerText : '';
    return { kort:!k.hidden, variant:v && v.getAttribute('data-hs'),
      snarvei: !!snar && !snar.hidden && !!snar.offsetParent,
      steg: v ? v.querySelectorAll('.hs-steg li').length : 0,
      menysteg: /⋮|ekstern nettleser|Åpne i Chrome/.test(tekst),
      kode: /koden vi sender deg på e-post/.test(tekst),
      overflow: document.documentElement.scrollWidth - innerWidth };
  });
  let utklipp = null, reserve = null, reserveVerdi = null;
  if (m.variant === 'innebygd') {
    await page.locator('#hsKort').scrollIntoViewIfNeeded();
    await page.click('#hsKopier'); await page.waitForTimeout(300);
    reserve = await page.evaluate(() => !document.querySelector('#hsLenkeReserve').hidden);
    reserveVerdi = await page.evaluate(() => document.querySelector('#hsLenke').value);
    if (!avvis) utklipp = await page.evaluate(() => navigator.clipboard.readText());
  }
  await page.locator('#hsKort').scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path:`${OUT}/hs-${navn}${avvis ? '-avvist' : ''}-${bredde}.png` });
  const forventUrl = `http://localhost:${PORT}/no/dashboard.html`;
  const [fv, fs_] = FORVENT[navn];
  const ok = m.kort && m.variant === fv && m.snarvei === fs_ && !m.menysteg && m.overflow <= 0 && !errs.length
    && (fv !== 'innebygd' || (m.steg === 3 && m.kode
      && (avvis ? (reserve && reserveVerdi === forventUrl) : (utklipp === forventUrl && !reserve))));
  rad.push({ ua:navn + (avvis ? ' (avvist)' : ''), bredde, variant:m.variant, snarvei:m.snarvei, steg:m.steg,
    menysteg:m.menysteg, utklipp, reserve, overflow:m.overflow, jsfeil:errs.join('; ') || 'ingen', ok });
  await ctx.close();
}
console.table(rad);
console.log('umockede requests mot trybarberhq.com:', prod);
const alleOk = rad.every(r => r.ok) && prod === 0;
console.log(alleOk ? '\nAlle OK' : '\nFEIL');
await browser.close(); server.close();
process.exit(alleOk ? 0 : 1);
