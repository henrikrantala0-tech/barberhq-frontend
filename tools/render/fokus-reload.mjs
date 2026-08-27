// tools/render/fokus-reload.mjs — verifiserer at fokusmodus OVERLEVER reload (COMMIT 4).
//   node tools/render/fokus-reload.mjs
// Full syklus i ÉN context (sessionStorage + mock-state overlever page.reload()):
//   param → fokus → reload → fortsatt fokus → X → reload → vanlig → publiser → reload → vanlig
// Stateful mock: PUT /page-status flipper barberen til live, så reload etter publisering gir vanlig.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.mp4':'video/mp4' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;
const NOW = new Date().toISOString();
const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
const DESIGN  = { palette:'minimal', font:'fraunces', layout:'showcase', mode:'mork' };
const PREVIEW = '<!DOCTYPE html><html><body style="background:#0a0a0a"></body></html>';

// Stateful router per context: forhandsvist til PUT /page-status, deretter live.
function makeStatefulRouter() {
  const state = { live:false };
  return route => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const json = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')       return json(PROFILE);
    if (p === '/api/dashboard/design')          return json(DESIGN);
    if (p === '/api/dashboard/preview')         return route.fulfill({ status:200, contentType:'text/html', body:PREVIEW });
    if (p === '/api/dashboard/page-status') { if (req.method()==='PUT') state.live = true; return json({ page_status:'live', trial_start_at:NOW }); }
    if (p === '/api/dashboard/billing/status')  return json({ subscription_status: state.live?'trialing':null, page_status: state.live?'live':'forhandsvist', trial_start_at: state.live?NOW:null, trial_days_left: state.live?30:null, needs_attention:false, attention_grunn:null });
    return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p) ? [] : {});
  };
}
function maal(page) {
  return page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).display!=='none' && r.width>0 && r.height>0; };
    let flag=null; try { flag = sessionStorage.getItem('fokusAktiv'); } catch(e){}
    return { fokus: document.body.classList.contains('fokus'), flag, nav: vis(document.querySelector('nav.nav')), url: location.search+location.hash };
  });
}
const U = `http://localhost:${PORT}/no/dashboard.html`;
const browser = await chromium.launch();
const rad = [];
for (const bredde of [320, 402, 1280]) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2 });
  await ctx.route('**/api/**', makeStatefulRouter());
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  await page.goto(`${U}?velkommen=1#dinside`, { waitUntil:'networkidle' }); await page.waitForTimeout(1500);
  const a = await maal(page);                                  // param → fokus
  await page.screenshot({ path:`${OUT}/fokusrl-fokus-${bredde}.png`, fullPage:false });
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1500);
  const b = await maal(page);                                  // reload → fortsatt fokus?
  await page.screenshot({ path:`${OUT}/fokusrl-reload-${bredde}.png`, fullPage:false });
  await page.click('#fokusX'); await page.waitForTimeout(400);
  const c = await maal(page);                                  // X → vanlig
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1500);
  const d = await maal(page);                                  // reload → fortsatt vanlig
  await page.screenshot({ path:`${OUT}/fokusrl-vanlig-${bredde}.png`, fullPage:false });
  // Re-inn i fokus, publiser fra fokus-baren → flagg skal ryddes, reload → vanlig
  await page.goto(`${U}?velkommen=1#dinside`, { waitUntil:'networkidle' }); await page.waitForTimeout(1200);
  await page.click('#fokusPubliser'); await page.waitForTimeout(800);
  const e = await maal(page);                                  // publiser → fokus av + flagg ryddet
  await page.reload({ waitUntil:'networkidle' }); await page.waitForTimeout(1500);
  const f = await maal(page);                                  // reload → vanlig (live)
  await page.screenshot({ path:`${OUT}/fokusrl-publisert-${bredde}.png`, fullPage:false });

  rad.push({ bredde,
    A_paramFokus:      a.fokus && a.flag==='1' && !a.nav && a.url==='#dinside',
    B_reloadFokus:     b.fokus && b.flag==='1' && !b.nav && b.url==='#dinside',   // ← selve bugfixen
    C_XVanlig:         !c.fokus && c.flag===null && c.nav,
    D_reloadVanlig:    !d.fokus && d.flag===null && d.nav,
    E_publiserFokusAv: !e.fokus && e.flag===null,
    F_reloadVanlig:    !f.fokus && f.flag===null && f.nav,
    jsfeil: errs.length ? errs.join('; ') : 'ingen' });
  await ctx.close();
}
console.table(rad);
const ok = rad.every(r => r.A_paramFokus && r.B_reloadFokus && r.C_XVanlig && r.D_reloadVanlig && r.E_publiserFokusAv && r.F_reloadVanlig && r.jsfeil==='ingen');
console.log('\nFokus overlever reload · X/publiser rydder · reload→vanlig · ingen JS-feil:', ok ? 'JA' : 'NEI');
await browser.close(); server.close();
