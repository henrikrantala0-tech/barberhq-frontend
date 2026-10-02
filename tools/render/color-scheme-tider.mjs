// tools/render/color-scheme-tider.mjs — verifiserer color-scheme-fiksen i Tjenester & tider.
//
// Rot-årsak: dashboard.html manglet color-scheme, så native UA-kontroller (klokkeikonet i
// input[type=time]) ble rendret i lys modus → svart ikon på mørk flate. Fiks: color-scheme bundet
// til data-theme (light på :root, dark på html[data-theme="dark"]). Default-tema er dark.
//
//   Chromium 1280: klokkeikonet vises (desktop) og skal være HVITT. Logger computed color-scheme.
//   WebKit   375 : picker-ikonet skjules av @media(max-width:480px) → mobil uendret.
//
// Skriver skjermbilder til Skrivebordet (color-scheme-*.png) + .render-ut/ (gitignorert).
//
//   node tools/render/color-scheme-tider.mjs
//
// Mocker ALLE /api/** (catch-all) — treffer ALDRI prod. profile.hasPassword:true (ellers redirect).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os';
import { chromium, webkit } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
const DESK = path.join(os.homedir(), 'Desktop');
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

const PROFILE = { slug: 'grand-barber', email: 'g@b.no', hasPassword: true, name: 'Henrik',
  shop: 'Grand Barber', address: '', tagline: '', bio: '', booking_horizon_days: 28 };
const DESIGN  = { palette: 'minimal', font: 'fraunces', layout: 'showcase', mode: 'mork' };
const SERVICES = { hoved: [{ name: 'Herreklipp', price: 350, min: 30 }, { name: 'Skjeggtrim', price: 200, min: 20 }],
  tillegg: [{ name: 'Hårvask', price: 80, min: 0 }] };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday: wd, is_closed: false, open_time: '10:00', close_time: '18:00', breaks: [] }))
  .concat([6,0].map(wd => ({ weekday: wd, is_closed: true, open_time: '10:00', close_time: '18:00', breaks: [] })));
const BILLING = { subscription_status: null, page_status: 'forhandsvist', trial_start_at: null,
  trial_days_left: null, nedtaking_dager_igjen: null, myk_periode: false, needs_attention: false,
  attention_grunn: null, plan: null, effective_plan: null };
const GOOGLE = { connected: false, scope_ok: true };

const router = route => {
  const p = new URL(route.request().url()).pathname;
  const json = obj => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
  if (p === '/api/dashboard/profile')         return json(PROFILE);
  if (p === '/api/dashboard/design')          return json(DESIGN);
  if (p === '/api/dashboard/services')        return json(SERVICES);
  if (p === '/api/dashboard/hours')           return json(HOURS);
  if (p === '/api/dashboard/billing/status')  return json(BILLING);
  if (p === '/api/dashboard/google/status')   return json(GOOGLE);
  if (p === '/api/dashboard/preview')         return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><body></body>' });
  const listeAktig = /images|bookings|recent|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
  return json(listeAktig ? [] : {});
};

async function aapneTider(page) {
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#tjenester`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    ['loadTjenester','loadArbeidstider','loadHours'].forEach(fn => { try { if (typeof window[fn]==='function') window[fn](); } catch(e){} });
  });
  // vent til minst ett time-felt er bygget
  await page.waitForSelector('#hoursList input[type=time]', { timeout: 5000 }).catch(()=>{});
  await page.waitForTimeout(600);
}

const rapport = [];

// ── Chromium 1280 — klokkeikonet synlig, skal være hvitt ──────────────────────────
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await aapneTider(page);

  const info = await page.evaluate(() => ({
    rootScheme: getComputedStyle(document.documentElement).colorScheme,
    dataTheme : document.documentElement.getAttribute('data-theme'),
    pickerVises: (() => { const inp=document.querySelector('#hoursList input[type=time]'); if(!inp) return 'ingen input'; return 'ja'; })(),
    antallTid : document.querySelectorAll('#hoursList input[type=time]').length,
  }));
  await page.locator('#hoursList').scrollIntoViewIfNeeded();
  await page.locator('#hoursList').screenshot({ path: `${OUT}/color-scheme-chromium-1280.png` });
  fs.copyFileSync(`${OUT}/color-scheme-chromium-1280.png`, path.join(DESK, 'color-scheme-chromium-1280.png'));
  rapport.push(`Chromium@1280: color-scheme=${info.rootScheme} data-theme=${info.dataTheme} time-felt=${info.antallTid} jsfeil=${errs.length?errs.join('; '):'ingen'}`);
  await browser.close();
}

// ── WebKit 375 — picker skjult av media-query, mobil uendret ───────────────────────
{
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 820 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await aapneTider(page);

  const info = await page.evaluate(() => {
    const inp = document.querySelector('#hoursList input[type=time]');
    const picker = inp ? getComputedStyle(inp, '::-webkit-calendar-picker-indicator').display : 'n/a';
    return { rootScheme: getComputedStyle(document.documentElement).colorScheme, pickerDisplay: picker };
  });
  await page.locator('#hoursList').scrollIntoViewIfNeeded();
  await page.locator('#hoursList').screenshot({ path: `${OUT}/color-scheme-webkit-375.png` });
  fs.copyFileSync(`${OUT}/color-scheme-webkit-375.png`, path.join(DESK, 'color-scheme-webkit-375.png'));
  rapport.push(`WebKit@375  : color-scheme=${info.rootScheme} picker-display=${info.pickerDisplay} jsfeil=${errs.length?errs.join('; '):'ingen'}`);
  await browser.close();
}

server.close();
console.log('\n' + rapport.join('\n'));
console.log(`\nSkjermbilder:\n  ${path.join(DESK,'color-scheme-chromium-1280.png')}\n  ${path.join(DESK,'color-scheme-webkit-375.png')}`);
