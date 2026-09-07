// tools/render/konto-plan-nedgang.mjs — plan-nedgang-kortet i Konto (renderKonto).
// Vises KUN på _billing.plan_faller (kort på Basis mens prøven løper → Vekst nå, faller til Basis).
// Rolig informasjon, ikke varsel: ingen rød, ingen ikon, ingen «handle nå». Dagene fra
// trial_days_left. «1 dag igjen», ikke «1 dager».
//
//   node tools/render/konto-plan-nedgang.mjs
//
// Tilstander: plan_faller:true @21/@3/@1 dager, + plan_faller:false (kortet SKAL ikke vises).
// 320 og 375, mørk og lys. Element-shot av .subcard + måling. Skjermbilder → .render-ut/ (gitignorert).

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

// plan_faller: kort lagt inn på Basis mens prøven løper → effective_plan=vekst (F-grenen,
// subscription+trialing), plan=basis, siden live. days_left settes BEVISST 2 døgn foran
// trial_days_left for å bekrefte at kortet leser trial_days_left, ikke days_left.
function billing(dager, faller, planOverstyr) {
  return {
    subscription_status:'trialing', page_status:'live',
    plan: planOverstyr || (faller ? 'basis' : 'vekst'),
    effective_plan:'vekst', effective_plan_grunn:'subscription',
    trial_days_left: dager, days_left: dager+2,   // days_left ligger foran — skal IKKE brukes
    plan_faller: faller,
    nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null,
  };
}

const VARIANTER = [
  { navn:'faller-21', b: billing(21, true) },
  { navn:'faller-3',  b: billing(3,  true) },
  { navn:'faller-1',  b: billing(1,  true) },   // «1 dag igjen», ikke «1 dager»
  { navn:'ingen',     b: billing(21, false) },  // kortet SKAL ikke vises
];

function router(b) {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const j = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')        return j(PROFILE);
    if (p === '/api/dashboard/billing/status') return j(b);
    return j(/images|bookings|services|hours|winback|referrals|rebooking|sms-logg|stats|attribution|momentum|loyalty/.test(p) ? [] : {});
  };
}

const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;
for (const f of fs.readdirSync(OUT)) { if (/^konto-nedgang-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const browser = await chromium.launch();
const rad = [];
for (const v of VARIANTER) {
  for (const tema of ['dark','light']) {
    for (const bredde of [320,375]) {
      const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch(e){} }, tema);
      await page.route('**/api/**', router(v.b));
      await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
      await page.addStyleTag({ content: SKJUL_BARER });
      await page.evaluate(() => switchPanel('abonnement'));
      await page.waitForTimeout(300);
      await page.evaluate(() => { const h=document.querySelector('#accAbonnement .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click(); });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const pf = document.querySelector('#planFall');
        const vis = pf ? (getComputedStyle(pf).display !== 'none') : false;
        return {
          vis,
          tekst: (document.querySelector('#planFallTekst')?.textContent || '').trim(),
          btn:   (document.querySelector('#planFallBtn')?.textContent || '').trim(),
          rod:   pf ? getComputedStyle(pf.querySelector('p')).color : '',
          kortStatus: (document.querySelector('#kontoStatus')?.textContent || '').trim(),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      const sub = page.locator('.subcard');
      await sub.scrollIntoViewIfNeeded();
      await sub.screenshot({ path:`${OUT}/konto-nedgang-${v.navn}-${tema}-${bredde}.png` });
      rad.push({ variant:v.navn, tema, bredde, vis:m.vis, btn:m.btn, tekst:m.tekst.slice(0,64),
        overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
      await page.close();
    }
  }
}
console.table(rad);

// Klikk «Bytt til Vekst» → plan-velgeren skal åpne seg med Vekst valgt + Fortsett-knapp synlig.
{
  const page = await browser.newPage({ viewport:{ width:375, height:1100 }, deviceScaleFactor:2 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{try{localStorage.setItem('bhq-theme','dark');}catch(e){}});
  await page.route('**/api/**', router(billing(21,true)));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.addStyleTag({ content: SKJUL_BARER });
  await page.evaluate(() => switchPanel('abonnement'));
  await page.evaluate(() => { const h=document.querySelector('#accAbonnement .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#planFallBtn').click());
  await page.waitForTimeout(400);
  const etter = await page.evaluate(() => ({
    velgerVis: getComputedStyle(document.querySelector('#planVelger')).display !== 'none',
    vekstValgt: document.querySelector('#planVelger .plan-opt[data-plan="vekst"]')?.getAttribute('aria-checked'),
    knapp: (document.querySelector('#kontoAksjon')?.textContent||'').trim(),
    knappVis: getComputedStyle(document.querySelector('#kontoAksjon')).display !== 'none',
  }));
  await page.locator('.subcard').screenshot({ path:`${OUT}/konto-nedgang-klikk-velger-dark.png` });
  console.log('\n«Bytt til Vekst»-klikk →', JSON.stringify(etter), '| JS-feil:', errs.length);
  await page.close();
}

console.log('\nKortet vist når plan_faller (skal være JA på faller-*, nei på ingen):');
console.table(rad.filter(r=>r.tema==='dark'&&r.bredde==320).map(r=>({variant:r.variant, vis:r.vis, btn:r.btn})));
console.log('\n@1 dag skal si «1 dag igjen» (ikke «1 dager»):');
console.log('  ', rad.find(r=>r.variant==='faller-1')?.tekst);
console.log('\nOverflow != 0 (skal være 0):', rad.filter(r=>r.overflow!==0).map(r=>`${r.variant}/${r.tema}/${r.bredde}=${r.overflow}`).join(' ') || 'ingen');
console.log('JS-feil (skal være 0):', rad.filter(r=>r.jsfeil!=='ingen').length);
console.log('\nBilder:', OUT);

await browser.close(); server.close();
