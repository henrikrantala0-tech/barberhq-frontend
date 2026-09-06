// tools/render/skjold.mjs — Vekst-skjoldet (Basis-visning) i dashbordet.
// Stubber /billing/status i to varianter:
//   basis = { effective_plan:'basis' }              → skjold + eksempeltall
//   trial = { effective_plan:'vekst', grunn:'trial_vindu' } → KONTROLL = dagens dashbord
// Måler per flate: erBasis, om .skjold finnes, «Eksempel»-merke, inputs disabled, overflow, JS-feil.
// Screenshotter alle skjoldede flater @320/375 i basis-varianten.
//
//   node tools/render/skjold.mjs
//
// Skjermbilder → .render-ut/skjold-*.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

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

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Ekte-aktig attribusjon for TRIAL (kontroll). Basis skal IKKE bruke dette — den viser eksempeltall.
const ATTR = { period:'maaned', rebooking:{count:9,revenue:3150}, vervet:{count:3,revenue:1050},
  recovery:{count:4,revenue:1600}, total:{count:16, revenue:5800} };
function billing(variant) {
  if (variant === 'basis') return { subscription_status:'active', page_status:'live',
    plan:'basis', effective_plan:'basis', effective_plan_grunn:'subscription',
    trial_days_left:null, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
  return { subscription_status:'trialing', page_status:'live', // trial = kontroll
    plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu',
    trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };
}
// forbudt403: PUT /settings → 403 (test at lås-teksten vises i stedet for generisk feil).
function router(variant, forbudt403) {
  return route => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const json = (obj, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/settings' && req.method() === 'PUT' && forbudt403) return json({ error:'plan' }, 403);
    if (p === '/api/dashboard/profile')        return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json(billing(variant));
    if (p === '/api/dashboard/attribution')    return json(ATTR);
    if (p === '/api/dashboard/momentum')       return json({ show:true, overdue:1, returning:20 });
    const listeAktig = /images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

// Flatene skjoldet skal treffe. host = kortet; seeAllUtenfor markerer at #drivenBySeeAll IKKE er skjoldet.
const FLATER = [
  { navn:'Oversikt drivenBy', panel:'oversikt', host:'#drivenBy' },
  { navn:'Vekst attribusjon', panel:'vekst', host:'#attrKort' },
  { navn:'Vekst momentum',    panel:'vekst', host:'#momentumCard' },
  { navn:'Vekst rebooking',   panel:'vekst', host:'#accRebook' },
  { navn:'Vekst vinn tilbake',panel:'vekst', host:'#accWinback' },
  { navn:'Vekst verving',     panel:'vekst', host:'#accVerv' },
];

const MAAL = `(sel) => {
  const host = document.querySelector(sel);
  if (!host) return { finnes:false };
  const skjold = host.querySelector(':scope > .skjold') || host.querySelector('.skjold');
  const skjoldVis = skjold && getComputedStyle(skjold).display !== 'none';
  const merke = !!host.querySelector('.eksempel-merke');
  const inputs = [...host.querySelectorAll('input,select,button')].filter(b => !b.closest('.skjold'));
  const alleDisabled = inputs.length ? inputs.every(b => b.disabled) : null;
  return { finnes:true, skjold:!!skjoldVis, merke, inputs:inputs.length, alleDisabled };
}`;

const browser = await chromium.launch();
const rad = [];
for (const variant of ['basis', 'trial']) {
  for (const bredde of [320, 375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(variant, false));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1500);
    const eb = await page.evaluate(() => (typeof erBasis === 'function' ? erBasis() : 'MANGLER'));
    // Oversikt (standardpanel) → mål drivenBy + skjermbilde
    for (const f of FLATER.filter(f => f.panel === 'oversikt')) {
      const m = await page.evaluate(eval(MAAL), f.host);
      await page.evaluate((s)=>{const e=document.querySelector(s);if(e)e.scrollIntoView({block:'center'});}, f.host);
      await page.waitForTimeout(120); await page.screenshot({ path:`${OUT}/skjold-oversikt-${variant}-${bredde}.png`, fullPage:false });
      rad.push({ variant, bredde, flate:f.navn, erBasis:eb, ...m, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    }
    // Vekst
    await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1200);
    for (const f of FLATER.filter(f => f.panel === 'vekst')) {
      const m = await page.evaluate(eval(MAAL), f.host);
      if (m.finnes) { await page.evaluate((s)=>{const e=document.querySelector(s);if(e)e.scrollIntoView({block:'center'});}, f.host);
        await page.waitForTimeout(120); await page.screenshot({ path:`${OUT}/skjold-${f.host.replace('#','')}-${variant}-${bredde}.png`, fullPage:false }); }
      rad.push({ variant, bredde, flate:f.navn, erBasis:eb, ...m, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    }
    await page.close();
  }
}
console.table(rad);

// Dommer per stadium:
const b = rad.filter(r => r.variant === 'basis');
const t = rad.filter(r => r.variant === 'trial');
console.log('\nerBasis: basis =', [...new Set(b.map(r=>r.erBasis))], ' trial =', [...new Set(t.map(r=>r.erBasis))]);
console.log('Skjold i basis (per flate som finnes):', b.filter(r=>r.finnes).map(r=>r.flate+':'+(r.skjold?'JA':'nei')).join(' · '));
console.log('Skjold i trial (skal være 0):', t.filter(r=>r.skjold).length);
console.log('JS-feil totalt:', rad.filter(r=>r.jsfeil!=='ingen').length);
await browser.close(); server.close();
