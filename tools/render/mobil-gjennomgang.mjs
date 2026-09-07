// tools/render/mobil-gjennomgang.mjs — (e) full mobilgjennomgang.
// Alle fem faner @320/375/390 i BEGGE billing-shapes (trial + basis). Måler dokument-overflow +
// elementer som stikker forbi viewporten (brukket), og fanger fullside-screenshot per fane/bredde/shape
// for visuell «stygt»-vurdering. RAPPORT-verktøy — fikser ingenting.
//
//   node tools/render/mobil-gjennomgang.mjs
//
// Skjermbilder → .render-ut/mob-<shape>-<panel>-<bredde>.png (gitignorert).

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

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true, name:'Henrik',
  shop:'Grand Barber', address:'Storgata 1, 0155 Oslo', tagline:'Fades & klassisk', bio:'Presisjon i hvert klipp. Skarpe fades, rene linjer, ingen stress.', booking_horizon_days:28 };
const DESIGN = { palette:'minimal', font:'fraunces', layout:'showcase', mode:'mork' };
const IMAGES = [
  { id:1, slot:'galleri', url:'/no/images/layout-showcase.webp', sort_order:0 },
  { id:2, slot:'galleri', url:'/no/images/layout-profil.webp',   sort_order:1 },
  { id:3, slot:'galleri', url:'/no/images/layout-hero.webp',     sort_order:2 },
];
const SERVICES = { hoved:[ { name:'Herreklipp', price:350, min:30 }, { name:'Skjeggtrim', price:0, min:20 }, { name:'Klipp & skjegg', price:500, min:45 } ], tillegg:[ { name:'Hårvask', price:80, min:10 } ] };
const HOURS = [1,2,3,4,5].map(wd => ({ weekday:wd, is_closed:false, open_time:'10:00', close_time:'18:00', breaks:[] }))
  .concat([6,0].map(wd => ({ weekday:wd, is_closed:true, open_time:'10:00', close_time:'18:00', breaks:[] })));
const dag=(d,kr)=>({d,kr,count:kr?1:0,new:0,returning:0});
const STATS = { daily:[dag('2026-09-01',900),dag('2026-09-03',450),dag('2026-09-05',1200)], months_with_data:['2026-06','2026-07','2026-08'],
  months:[{ym:'2026-06',customers:22},{ym:'2026-07',customers:31},{ym:'2026-08',customers:18}], record_customers_month:{ym:'2026-07',customers:31},
  completed_all_time:214, current_week_revenue:2550, best_week_revenue:13950, best_week_start:'2026-07-14', best_week_approximate:false,
  weekly_revenue:[{week_start:'2026-07-14',revenue:13950},{week_start:'2026-07-21',revenue:9000},{week_start:'2026-08-01',revenue:7200}] };
const ATTR = { period:'maaned', rebooking:{count:9,revenue:3150}, vervet:{count:3,revenue:1050}, recovery:{count:4,revenue:1600}, total:{count:16,revenue:5800} };
const SETTINGS = { sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35, referral_reward_recipient:'begge', referral_discount_pct:20, payment_methods:['Vipps','Kontant'] };
const WINBACK = { no_show:[{id:1,name:'Ola Nordmann',phone:'+4790000000',last_visit_at:'2026-08-01'}], lapsed:[{id:2,name:'Kari Nordmann',phone:'+4790000001',last_visit_at:'2026-05-01'}] };
const REFERRALS = [{id:1,name:'Per Hansen',phone:'+4790000002',referral_code:'abc123',last_service:'Herreklipp',days_since:5}];
const REBOOKING = { enabled:true, interval_days:35, customers:[{customer_id:1,name:'Nils Ås',phone:'+4790000003',last_visit_at:'2026-07-20',days_since:47,last_service:'Herreklipp'}] };
const PREVIEW_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0a0a0a;color:#fff;font-family:system-ui;padding:16px"><h1 style="font-family:Georgia,serif">Grand Barber</h1><p style="color:#9a9a9a">Fades &amp; klassisk</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div style="aspect-ratio:3/4;background:#1e1e1e;border-radius:8px"></div><div style="aspect-ratio:3/4;background:#1e1e1e;border-radius:8px"></div></div><div style="margin-top:16px;background:#7db3ff;color:#06121f;text-align:center;padding:13px;border-radius:10px;font-weight:600">Velg tjeneste</div></body></html>`;

function billing(shape){
  if (shape==='basis') return { subscription_status:'active', page_status:'live', plan:'basis', effective_plan:'basis', effective_plan_grunn:'subscription', trial_days_left:null, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
  return { subscription_status:'trialing', page_status:'live', plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu', trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };
}
function router(shape){
  return route => {
    const u=new URL(route.request().url()); const p=u.pathname;
    const json=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/profile')        return json(PROFILE);
    if(p==='/api/dashboard/design')          return json(DESIGN);
    if(p==='/api/dashboard/images')          return json(IMAGES);
    if(p==='/api/dashboard/services')        return json(SERVICES);
    if(p==='/api/dashboard/hours')           return json(HOURS);
    if(p==='/api/dashboard/billing/status')  return json(billing(shape));
    if(p==='/api/dashboard/stats')           return json(STATS);
    if(p.startsWith('/api/dashboard/stats/month')) return json({days:[],month_total:{count:0,revenue:0}});
    if(p==='/api/dashboard/attribution')     return json(ATTR);
    if(p==='/api/dashboard/momentum')        return json({show:true,overdue:1,returning:20});
    if(p==='/api/dashboard/settings')        return json(SETTINGS);
    if(p==='/api/dashboard/winback')         return json(WINBACK);
    if(p==='/api/dashboard/referrals')       return json(REFERRALS);
    if(p==='/api/dashboard/rebooking')       return json(REBOOKING);
    if(p==='/api/dashboard/preview')         return route.fulfill({status:200,contentType:'text/html',body:PREVIEW_HTML});
    if(p.includes('/google/status'))         return json({connected:false,scope_ok:true});
    const listeAktig=/images|bookings|recent|sms-logg|referrals/.test(p);
    return json(listeAktig?[]:{});
  };
}

// Finn elementer som stikker forbi viewportens høyrekant (brukket layout) + intern tekst-klipp.
const MAAL = `(vw) => {
  const off = [];
  const alle = document.querySelectorAll('#'+aktivtPanel()+' *');
  for (const el of alle) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (r.right > vw + 1.5) {
      const id = el.id ? '#'+el.id : (el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\\s+/).slice(0,2).join('.') : el.tagName.toLowerCase());
      off.push({ el:id, right:Math.round(r.right), tag:el.tagName.toLowerCase() });
    }
  }
  // dedup på selektor, behold størst right
  const map = {};
  for (const o of off) { if (!map[o.el] || o.right > map[o.el].right) map[o.el] = o; }
  const liste = Object.values(map).sort((a,b)=>b.right-a.right).slice(0,6);
  return { docOverflow: document.documentElement.scrollWidth - window.innerWidth, offenders: liste };
}`;

const PANELS = [ ['oversikt','Oversikt'], ['vekst','Vekst'], ['tjenester','Tjenester & tider'], ['design','Din side'], ['abonnement','Konto'] ];
const browser = await chromium.launch();
const rad = [];
for (const shape of ['trial','basis']) {
  for (const bredde of [320,375,390]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/api/**', router(shape));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1500);
    for (const [pid,navn] of PANELS) {
      await page.evaluate((p)=>switchPanel(p), pid);
      await page.waitForTimeout(1100);
      const m = await page.evaluate(eval(MAAL), bredde);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({ path:`${OUT}/mob-${shape}-${pid}-${bredde}.png`, fullPage:true });
      rad.push({ shape, bredde, fane:navn, docOverflow:m.docOverflow,
        offenders: m.offenders.length ? m.offenders.map(o=>o.el+'→'+o.right).join(' ') : '—',
        jsfeil: errs.length ? errs.join('; ').slice(0,60) : 'ingen' });
    }
    await page.close();
  }
}
console.table(rad);
const brukket = rad.filter(r => r.docOverflow>0 || r.offenders!=='—' || r.jsfeil!=='ingen');
console.log('\n=== FLAGGEDE (overflow / offenders / JS-feil) ===');
if (brukket.length) console.table(brukket); else console.log('Ingen objektive brudd målt — «stygt» vurderes visuelt på screenshotene.');
console.log('\nScreenshots: .render-ut/mob-<shape>-<panel>-<bredde>.png ('+rad.length+' stk)');

// ── Ekspandert runde: accordion-innhold (Din side / Konto / Vekst) + custom-velger @320 ──────────
// Kollapsede kort skjuler de tetteste flatene (palett-grid, HSV-velger, slot-bokser, profilfelt,
// SMS-knotter, billing). Åpne alt og mål/screenshot på nytt.
const radX = [];
async function ekspander(page, panelSel){
  await page.evaluate((sel)=>{ document.querySelectorAll(sel+' .acc-head').forEach(h=>{ if(h.getAttribute('aria-expanded')!=='true') h.click(); }); }, panelSel);
  await page.waitForTimeout(600);
}
async function maalPanel(page, bredde){ return page.evaluate(eval(MAAL), bredde); }
for (const shape of ['trial','basis']) {
  const page = await browser.newPage({ viewport:{ width:320, height:900 }, deviceScaleFactor:2 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**', router(shape));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);
  for (const [pid,navn] of [['design','Din side'],['abonnement','Konto'],['vekst','Vekst']]) {
    await page.evaluate((p)=>switchPanel(p), pid);
    await page.waitForTimeout(1000);
    await ekspander(page, '#'+pid);
    const m = await maalPanel(page, 320);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({ path:`${OUT}/mobx-${shape}-${pid}-320.png`, fullPage:true });
    radX.push({ shape, fane:navn+' (åpen)', docOverflow:m.docOverflow,
      offenders:m.offenders.length?m.offenders.map(o=>o.el+'→'+o.right).join(' '):'—', jsfeil:errs.length?errs.join(';').slice(0,50):'ingen' });
  }
  // Din side → åpne KUN Design-accordionen (data-single) → velg «Din egen» → HSV-velger @320
  await page.evaluate(()=>switchPanel('design'));
  await page.waitForTimeout(800);
  const harCustom = await page.evaluate(()=>{
    var grid=document.querySelector('#paletteGrid'); if(!grid)return false;
    var acc=grid.closest('.acc'); if(acc){ var h=acc.querySelector('.acc-head'); if(h && h.getAttribute('aria-expanded')!=='true')h.click(); }
    return true;
  });
  await page.waitForTimeout(500);
  await page.evaluate(()=>{ var b=document.querySelector('.preset[data-key="custom"]'); if(b)b.click(); });
  await page.waitForTimeout(500);
  if (harCustom) {
    const m = await maalPanel(page, 320);
    await page.evaluate(()=>{const e=document.querySelector('#customPanel')||document.querySelector('#paletteGrid');if(e)e.scrollIntoView({block:'center'});});
    await page.waitForTimeout(150);
    await page.screenshot({ path:`${OUT}/mobx-${shape}-custom-320.png`, fullPage:false });
    radX.push({ shape, fane:'Din egen (HSV-velger)', docOverflow:m.docOverflow,
      offenders:m.offenders.length?m.offenders.map(o=>o.el+'→'+o.right).join(' '):'—', jsfeil:errs.length?errs.join(';').slice(0,50):'ingen' });
  }
  // Konto → åpne Abonnement-accordionen (billing/plan-velger) @320
  await page.evaluate(()=>switchPanel('abonnement'));
  await page.waitForTimeout(800);
  await page.evaluate(()=>{ var acc=document.querySelector('#accAbonnement'); if(acc){ var h=acc.querySelector('.acc-head'); if(h && h.getAttribute('aria-expanded')!=='true')h.click(); } });
  await page.waitForTimeout(600);
  {
    const m = await maalPanel(page, 320);
    await page.evaluate(()=>{const e=document.querySelector('#accAbonnement');if(e)e.scrollIntoView({block:'start'});});
    await page.waitForTimeout(150);
    await page.screenshot({ path:`${OUT}/mobx-${shape}-billing-320.png`, fullPage:true });
    radX.push({ shape, fane:'Konto › Abonnement (åpen)', docOverflow:m.docOverflow,
      offenders:m.offenders.length?m.offenders.map(o=>o.el+'→'+o.right).join(' '):'—', jsfeil:errs.length?errs.join(';').slice(0,50):'ingen' });
  }
  await page.close();
}
console.log('\n=== EKSPANDERT (accordions åpne + HSV-velger) @320 ===');
console.table(radX);
const xBrukket = radX.filter(r=>r.docOverflow>0||r.offenders!=='—'||r.jsfeil!=='ingen');
console.log(xBrukket.length ? 'FLAGGET åpen:' : 'Ingen objektive brudd i åpen tilstand.');
if(xBrukket.length) console.table(xBrukket);

await browser.close(); server.close();
