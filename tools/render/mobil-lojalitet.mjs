// tools/render/mobil-lojalitet.mjs — mobil-gjennomgang av KUN lojalitetsprogram-kortet (#accLoyal).
// @320/375/390, trial + basis, alle tilstander: av / på-tom / på-liste / fjern-bekreftelse /
// endrings-bekreftelse / av-advarsel / basis (skjoldet). Måler dokument-overflow, elementer som
// stikker forbi viewporten, for små trykkflater (<44px min-dim), og klippet tekst. RAPPORT-verktøy —
// fikser ingenting. Skriver funn til stdout (matet inn i docs/mobil-lojalitet.md manuelt).
//
//   node tools/render/mobil-lojalitet.mjs
//
// Skjermbilder → .render-ut/mloy-*.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) { if (/^mloy-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
const BILLING_TRIAL = { subscription_status:'trialing', page_status:'live', plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu', trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };
const BILLING_BASIS = { subscription_status:'active', page_status:'live', plan:'basis', effective_plan:'basis', effective_plan_grunn:'subscription', trial_days_left:null, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
const daysAgo = n => new Date(Date.now()-n*86400000).toISOString();
const ELIGIBLE = [
  { customer_id:6, name:'Sara Ali', phone:'99001122', last_visit:daysAgo(2), completed_count:8 },
  { customer_id:7, name:'Petter Hansen', phone:'93344556', last_visit:daysAgo(9), completed_count:3 },
  { customer_id:8, name:'Nina Dahl', phone:'47788990', last_visit:daysAgo(20), completed_count:15 },
  { customer_id:9, name:'Lars Vik', phone:'', last_visit:daysAgo(1), completed_count:1 },
  { customer_id:11, name:'Ola Berg', phone:'40506070', last_visit:daysAgo(35), completed_count:6 },
];
const LOYAL = {
  av:        { enabled:false, threshold:10, pct:100, count_history:false, participants:[], eligible:[], totals:{ in_progress:0, ready:2, redeemed_month:0, participants:2, eligible:0 } },
  paa_tom:   { enabled:true, threshold:10, pct:100, count_history:false, participants:[], eligible:ELIGIBLE, totals:{ in_progress:0, ready:0, redeemed_month:0, participants:0, eligible:5 } },
  paa_liste: { enabled:true, threshold:10, pct:100, count_history:false, participants:[
                 { customer_id:1, name:'Amir Haddad', phone:'99887766', opt_in_at:'2026-08-02', stamps:10, reward_ready:true },
                 { customer_id:2, name:'Kari Nordmann', phone:'91234567', opt_in_at:'2026-08-03', stamps:8, reward_ready:false },
                 { customer_id:3, name:'Ola Nordmann', phone:'40011223', opt_in_at:'2026-08-05', stamps:7, reward_ready:false },
                 { customer_id:4, name:'Emily Johnson', phone:'46655443', opt_in_at:'2026-08-06', stamps:4, reward_ready:false },
                 { customer_id:5, name:'Jonas Berg', phone:'', opt_in_at:'2026-08-07', stamps:2, reward_ready:false },
               ], eligible:ELIGIBLE.slice(0,4), totals:{ in_progress:12, ready:1, redeemed_month:3, participants:5, eligible:4 } },
};
function router(variant, billing) {
  return route => { const p=new URL(route.request().url()).pathname; const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/profile')return j(PROFILE);
    if(p==='/api/dashboard/billing/status')return j(billing);
    if(p==='/api/dashboard/loyalty')return j(LOYAL[variant]||LOYAL.paa_liste);
    if(/^\/api\/dashboard\/customers\/\d+\/loyalty$/.test(p)&&route.request().method()==='PUT')return j({customer_id:0,opt_in:true,opt_in_at:'2026-09-07',has_unused_reward:false});
    return j(/images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg|stats|attribution|momentum/.test(p)?[]:{});
  };
}
const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;

// Tilstander (trial). Basis er egen (skjoldet). setup kjøres etter at kortet er åpnet.
const STATES = [
  { navn:'av',            variant:'av',        setup:null },
  { navn:'paa_tom',       variant:'paa_tom',   setup:null },
  { navn:'paa_liste',     variant:'paa_liste', setup:null },
  { navn:'fjern-bekreft', variant:'paa_liste', setup:async p=>{ await p.evaluate(()=>document.querySelector('#loyalOversikt .kl-drow .kl-remove')?.click()); } },
  { navn:'endring-bekreft',variant:'paa_liste',setup:async p=>{ await p.evaluate(()=>{const s=document.querySelector('#loyalPct'); s.value='50'; s.dispatchEvent(new Event('change',{bubbles:true}));}); } },
  { navn:'av-advarsel',   variant:'paa_liste', setup:async p=>{ await p.evaluate(()=>{const t=document.querySelector('#tog-loyal'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true}));}); } },
];

const MAAL = `() => {
  const vw = window.innerWidth;
  const card = document.querySelector('#accLoyal');
  if(!card) return { mangler:true };
  const all = [...card.querySelectorAll('*')];
  const overflow = document.documentElement.scrollWidth - vw;
  const stikkerUt = all.filter(el=>{const r=el.getBoundingClientRect(); return r.width>0 && r.right > vw+1;})
    .map(el=>({sel:(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:el.tagName), right:Math.round(el.getBoundingClientRect().right)}));
  // Trykkflater: knapper/select/toggle-label i kortet. EFFEKTIV størrelse (inkl. ::after-hitboks,
  // som toggelen bruker for 44px uten å strekke selve pillen). <44px min-dimensjon flagges.
  const tap = [...card.querySelectorAll('button, select, label.sw')].filter(el=>el.offsetParent!==null);
  const smaa = tap.map(el=>{
    const r=el.getBoundingClientRect();
    const cs=getComputedStyle(el,'::after');
    const ah=(cs.content && cs.content!=='none') ? (parseFloat(cs.height)||0) : 0;
    const extraW = ah>0 ? (Math.abs(parseFloat(cs.left)||0)+Math.abs(parseFloat(cs.right)||0)) : 0;
    const effH=Math.max(r.height, ah), effW=r.width+extraW;
    return {t:(el.textContent||el.tagName).trim().slice(0,18)||el.tagName, w:Math.round(effW), h:Math.round(effH), min:Math.round(Math.min(effW,effH))};
  }).filter(x=>x.h>0 && x.h<44);   // kriterium: minst 44px HØYDE (bredde følger tekst/innhold)
  // Klippet tekst (blad-noder der scrollWidth > clientWidth).
  const klippet = all.filter(el=>el.children.length===0 && el.clientWidth>0 && el.scrollWidth>el.clientWidth+1)
    .map(el=>({sel:(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:el.tagName), txt:(el.textContent||'').trim().slice(0,22)}));
  return { overflow, stikkerUt, smaa, klippet };
}`;

async function apneKort(page){
  await page.addStyleTag({content:SKJUL_BARER});
  await page.evaluate(()=>switchPanel('vekst'));
  await page.waitForTimeout(1000);
  await page.evaluate(()=>{const h=document.querySelector('#accLoyal .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click();});
  await page.waitForTimeout(350);
}

const browser = await chromium.launch();
const rader = [];
for (const bredde of [320,375,390]) {
  // Trial-tilstandene
  for (const st of STATES) {
    const page = await browser.newPage({ viewport:{width:bredde,height:900}, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/api/**', router(st.variant, BILLING_TRIAL));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, {waitUntil:'networkidle'});
    await apneKort(page);
    if(st.setup){ await st.setup(page); await page.waitForTimeout(250); }
    const m = await page.evaluate(eval(MAAL));
    if(bredde===320){ try{ await page.locator('#accLoyal').screenshot({path:`${OUT}/mloy-${st.navn}-320.png`}); }catch(e){} }
    rader.push({ tilstand:st.navn, plan:'trial', bredde, ...m, jsfeil:errs.length?errs.join('; '):'' });
    await page.close();
  }
  // Basis (skjoldet) — kortet kollapset, skjold på
  {
    const page = await browser.newPage({ viewport:{width:bredde,height:900}, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/api/**', router('paa_liste', BILLING_BASIS));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, {waitUntil:'networkidle'});
    await page.addStyleTag({content:SKJUL_BARER});
    await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(1100);
    const m = await page.evaluate(eval(MAAL));
    if(bredde===320){ try{ await page.locator('#accLoyal').screenshot({path:`${OUT}/mloy-basis-320.png`}); }catch(e){} }
    rader.push({ tilstand:'basis-skjold', plan:'basis', bredde, ...m, jsfeil:errs.length?errs.join('; '):'' });
    await page.close();
  }
}
await browser.close(); server.close();

// ── Utskrift: strukturert for rapport ────────────────────────────────────────────────────────────
console.log('\n===== MOBIL-GJENNOMGANG LOJALITETSPROGRAM =====\n');
for (const r of rader) {
  const flagg = [];
  if (r.mangler) flagg.push('KORT MANGLER');
  if (r.overflow>0) flagg.push(`dok-overflow ${r.overflow}px`);
  if (r.stikkerUt?.length) flagg.push(`stikker ut: ${r.stikkerUt.map(x=>x.sel+'@'+x.right).join(', ')}`);
  if (r.smaa?.length) flagg.push(`små trykkflater: ${r.smaa.map(x=>`${x.t}(${x.w}×${x.h})`).join(', ')}`);
  if (r.klippet?.length) flagg.push(`klippet: ${r.klippet.map(x=>x.sel+' "'+x.txt+'"').join(', ')}`);
  if (r.jsfeil) flagg.push(`JS-FEIL: ${r.jsfeil}`);
  console.log(`[${r.plan}/${r.bredde}] ${r.tilstand}: ${flagg.length?flagg.join(' | '):'greit'}`);
}
// ── Regresjonsdom: fast test, ikke bare rapport ─────────────────────────────────────────────────
const jsfeil = rader.filter(r=>r.jsfeil).length;
const overflow = rader.filter(r=>r.overflow>0).length;
const smaaTot = rader.reduce((n,r)=>n+(r.smaa?.length||0),0);
console.log('\n=== DOM ===');
console.log('  JS-feil:', jsfeil, '| dok-overflow:', overflow, '| trykkflater <44px:', smaaTot);
if (smaaTot) console.log('  <44 høyde gjenstår:', [...new Set(rader.filter(r=>r.smaa?.length).flatMap(r=>r.smaa.map(x=>`${x.t}(h${x.h})`)))].join(', '));
const ok = jsfeil===0 && overflow===0 && smaaTot===0;
console.log('\nRESULTAT:', ok ? 'BESTÅTT — 0 JS-feil, 0 overflow, alle trykkflater ≥44px høyde' : 'FEILET');
process.exitCode = ok ? 0 : 1;
