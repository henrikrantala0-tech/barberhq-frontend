// tools/render/skjold.mjs — Vekst-gating (Basis-visning) i dashbordet. NY MODELL (13.09):
//   MÅLING (#drivenBy/#attrKort/#momentumCard) = SKJOLD (overlay + eksempel, teaser, ikke lesbar).
//   HANDLING (#accRebook/#accWinback/#accVerv/#accLoyal) = LESBAR + «Vekst»-låsindikator (.laas-badge),
//     INGEN overlay, kontroller disabled (ALDRI .acc-head → seksjonen kan åpnes/leses).
// Billing-varianter:
//   basis = effective_plan:'basis'  → skjold på måling, handlings-lås på funksjon
//   vekst = effective_plan:'vekst' (betalt) → alt ulåst (kontroll)
//   trial = effective_plan:'vekst', grunn:'trial_vindu' → alt ulåst (regresjon: plan=null ≠ lås)
// Beviser i tillegg at bryter+piller FAKTISK toggler og lagrer på Vekst (PUT ut, ok, holder etter
// re-render, ingen rollback/403), og at 403 (backend-gate) viser lås-lenke, ikke generisk feil.
//
//   node tools/render/skjold.mjs
// Skjermbilder → .render-ut/skjold-*.png (gitignorert). Tett beskåret per funksjons-seksjon.

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
const ATTR = { period:'maaned', rebooking:{count:9,revenue:3150}, vervet:{count:3,revenue:1050},
  recovery:{count:4,revenue:1600}, total:{count:16, revenue:5800} };
const LOYAL = { enabled:true, threshold:10, pct:100, count_history:false,
  participants:[{customer_id:1,name:'Amir Haddad',phone:'99887766',stamps:10,reward_ready:true},
                {customer_id:2,name:'Kari Nordmann',phone:'91234567',stamps:7,reward_ready:false}],
  eligible:[{customer_id:6,name:'Sara Ali',phone:'99001122',last_visit:'2026-09-05T10:00:00Z',completed_count:8}],
  totals:{in_progress:12,ready:1,redeemed_month:3,participants:2,eligible:1} };
function billing(variant) {
  if (variant === 'basis') return { subscription_status:'active', page_status:'live',
    plan:'basis', effective_plan:'basis', effective_plan_grunn:'subscription',
    trial_days_left:null, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
  if (variant === 'trial') return { subscription_status:'trialing', page_status:'live',
    plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu',
    trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };
  return { subscription_status:'active', page_status:'live', // vekst (betalt) = kontroll
    plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription',
    trial_days_left:null, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
}
// Stateful settings så «holder etter re-render» kan bevises: PUT oppdaterer, GET returnerer oppdatert.
function nyState(){ return { sms_paaminnelse_enabled:true, sms_rebooking_enabled:false, rebooking_interval_days:35,
  referral_discount_pct:20, referral_reward_recipient:'begge', loyalty_enabled:false, loyalty_threshold:10, loyalty_pct:100, loyalty_count_history:false }; }
// forbudt403: PUT /settings → 403. putLog: samler PUT-kall for bevis.
function router(variant, forbudt403, state, putLog) {
  return async route => {
    const req = route.request(); const p = new URL(req.url()).pathname; const m = req.method();
    const json = (obj, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/settings' && m === 'PUT') {
      let body={}; try{ body=JSON.parse(req.postData()||'{}'); }catch(_){}
      if (putLog) putLog.push(body);
      if (forbudt403) return json({ error:'plan' }, 403);
      Object.assign(state, body);
      return json({ ...state, utseendeVersjon:2 }, 200);
    }
    if (p === '/api/dashboard/settings')        return json(state);
    if (p === '/api/dashboard/profile')        return json(PROFILE);
    if (p === '/api/dashboard/billing/status') return json(billing(variant));
    if (p === '/api/dashboard/attribution')    return json(ATTR);
    if (p === '/api/dashboard/momentum')       return json({ show:true, overdue:1, returning:20 });
    if (p === '/api/dashboard/loyalty')        return json(LOYAL);
    if (p === '/api/dashboard/sms-preview') {
      const kind = new URL(req.url()).searchParams.get('kind');
      // EKTE maler (bekreftet mot backend buildPaaminnelseBody / buildRebookingBody, 13.09):
      //   Påminnelse (transaksjonell): «Hei {fornavn}! Minner om timen din hos {shop} i morgen kl {tid}.» — INGEN avmelding.
      //   Rebooking: «Hei {fornavn}! Klar for ny time hos {shop}? {bookUrl}» + blank linje + «Avmeld: trybarberhq.com/a/{token}».
      // Ingen «Svar STOPP» finnes i systemet. Mocken MÅ speile fasit — ellers er screenshots ubrukelige.
      const body = kind === 'rebooking'
        ? 'Hei Markus! Klar for ny time hos Grand Barber? trybarberhq.com/grand-barber\n\nAvmeld: trybarberhq.com/a/x7k2p9'
        : 'Hei Markus! Minner om timen din hos Grand Barber i morgen kl 14:00.';
      return json({ kind, body, tegn: body.length, segmenter: 1, gsm7: true, transaksjonell: kind !== 'rebooking' });
    }
    if (p === '/api/dashboard/winback')        return json({ no_show:[], lapsed:[] });
    const listeAktig = /images|bookings|recent|services|hours|referrals|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

// type: 'maaling' → forvent overlay (skjold). 'funksjon' → forvent badge + INGEN overlay + kontroller disabled.
const FLATER = [
  { navn:'drivenBy',     type:'maaling',  panel:'oversikt', host:'#drivenBy' },
  { navn:'attribusjon',  type:'maaling',  panel:'vekst', host:'#attrKort' },
  { navn:'momentum',     type:'maaling',  panel:'vekst', host:'#momentumCard' },
  { navn:'rebooking',    type:'funksjon', panel:'vekst', host:'#accRebook' },
  { navn:'vinn-tilbake', type:'funksjon', panel:'vekst', host:'#accWinback' },
  { navn:'verving',      type:'funksjon', panel:'vekst', host:'#accVerv' },
  { navn:'lojalitet',    type:'funksjon', panel:'vekst', host:'#accLoyal' },
];

const MAAL = `(sel) => {
  const host = document.querySelector(sel);
  if (!host) return { finnes:false };
  const overlay = !!(host.querySelector(':scope > .skjold'));
  const badge = !!host.querySelector('.laas-badge');
  const merke = !!host.querySelector('.eksempel-merke');
  const accHead = host.querySelector('.acc-head');
  const accHeadDisabled = accHead ? accHead.disabled : null;
  // Handlings-kontroller: input/select/button UTENOM .acc-head og .skjold.
  const ctrls = [...host.querySelectorAll('input,select,button')].filter(b => !b.closest('.skjold') && !b.classList.contains('acc-head'));
  const alleDisabled = ctrls.length ? ctrls.every(b => b.disabled) : null;
  return { finnes:true, overlay, badge, merke, accHeadDisabled, ctrls:ctrls.length, alleDisabled };
}`;

async function aapneAcc(page, host){ await page.evaluate((s)=>{ const a=document.querySelector(s); const h=a&&a.querySelector('.acc-head'); if(h&&h.getAttribute('aria-expanded')!=='true')h.click(); }, host); }
async function kryssKlipp(page, host, fil){
  const box = await page.evaluate((s)=>{ const e=document.querySelector(s); if(!e)return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:Math.max(0,r.left-6),y:Math.max(0,r.top-6),width:Math.min(window.innerWidth,r.width+12),height:r.height+12}; }, host);
  await page.waitForTimeout(150);
  await page.screenshot({ path:fil, clip: box||undefined });
}

const browser = await chromium.launch();
const rad = [];
for (const variant of ['basis', 'vekst', 'trial']) {
  for (const bredde of [320, 375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/api/**', router(variant, false, nyState(), null));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(1500);
    const eb = await page.evaluate(() => (typeof erBasis === 'function' ? erBasis() : 'MANGLER'));
    // Oversikt (standardpanel): drivenBy
    for (const f of FLATER.filter(f => f.panel === 'oversikt')) {
      const mm = await page.evaluate(eval(MAAL), f.host);
      await page.evaluate((s)=>{const e=document.querySelector(s);if(e)e.scrollIntoView({block:'center'});}, f.host);
      await page.waitForTimeout(120); await page.screenshot({ path:`${OUT}/skjold-drivenBy-${variant}-${bredde}.png`, fullPage:false });
      rad.push({ variant, bredde, flate:f.navn, type:f.type, erBasis:eb, ...mm, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    }
    // Vekst
    await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1200);
    for (const f of FLATER.filter(f => f.panel === 'vekst')) {
      if (f.type === 'funksjon') await aapneAcc(page, f.host);
    }
    await page.waitForTimeout(300);
    for (const f of FLATER.filter(f => f.panel === 'vekst')) {
      const mm = await page.evaluate(eval(MAAL), f.host);
      // Tett beskåret per funksjons-seksjon (basis+vekst). Måling: viewport-shot.
      if (f.type === 'funksjon' && (variant==='basis' || variant==='vekst')) {
        await kryssKlipp(page, f.host, `${OUT}/sek-${f.navn}-${variant}-${bredde}.png`);
      } else if (f.type === 'maaling' && variant==='basis') {
        await page.evaluate((s)=>{const e=document.querySelector(s);if(e)e.scrollIntoView({block:'center'});}, f.host);
        await page.waitForTimeout(120); await page.screenshot({ path:`${OUT}/skjold-${f.host.replace('#','')}-basis-${bredde}.png`, fullPage:false });
      }
      rad.push({ variant, bredde, flate:f.navn, type:f.type, erBasis:eb, ...mm, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    }
    await page.close();
  }
}

// ── DOMMER ────────────────────────────────────────────────────────────────────
console.log('\n=== Per seksjon per plan (finnes ⇒ lesbar hvis ingen overlay) ===');
for (const r of rad) {
  if (!r.finnes) { console.log(`  ${r.flate}/${r.variant}/${r.bredde}: MANGLER`); continue; }
  if (r.type === 'funksjon') {
    const lesbar = !r.overlay;                 // ingen overlay ⇒ innhold lesbart
    const laast  = (r.alleDisabled===true) || (r.ctrls===0); // kontroller disabled (eller ingen skrive-kontroll = ren oversikt)
    console.log(`  [funksjon] ${r.flate.padEnd(13)} ${r.variant.padEnd(5)} ${r.bredde}: lesbar=${lesbar} handling_låst=${r.variant==='basis'?laast:!laast?'—(ulåst)':false===false?'ulåst':''} indikator=${r.badge}`);
  } else {
    console.log(`  [måling]   ${r.flate.padEnd(13)} ${r.variant.padEnd(5)} ${r.bredde}: overlay=${r.overlay} eksempelmerke=${r.merke}`);
  }
}
const funk = rad.filter(r=>r.type==='funksjon' && r.finnes);
const mal  = rad.filter(r=>r.type==='maaling'  && r.finnes);
const okBasisFunk = funk.filter(r=>r.variant==='basis').every(r => !r.overlay && r.badge && (r.alleDisabled===true||r.ctrls===0) && r.accHeadDisabled!==true);
const okVekstFunk = funk.filter(r=>r.variant!=='basis').every(r => !r.overlay && !r.badge && (r.alleDisabled===false||r.ctrls===0));
const okBasisMal  = mal.filter(r=>r.variant==='basis').every(r => r.overlay);
const okVekstMal  = mal.filter(r=>r.variant!=='basis').every(r => !r.overlay);
console.log('\nFunksjons-seksjoner Basis (badge + ingen overlay + kontroller disabled + acc-head åpnbar):', okBasisFunk?'JA':'NEI');
console.log('Funksjons-seksjoner Vekst/Trial (ingen badge, ingen overlay, kontroller enabled):', okVekstFunk?'JA':'NEI');
console.log('Måling Basis (overlay beholdt):', okBasisMal?'JA':'NEI', '| Måling Vekst/Trial (ingen overlay):', okVekstMal?'JA':'NEI');
console.log('JS-feil totalt:', rad.filter(r=>r.jsfeil!=='ingen').length);

// ── TOGGLE-BEVIS (Vekst): rebooking-bryter + intervall-piller lagrer FAKTISK ────
console.log('\n=== Toggle-bevis (Vekst, betalt) ===');
{
  const state = nyState(); const putLog = [];
  const page = await browser.newPage({ viewport:{ width:375, height:1100 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', false, state, putLog));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1300);
  await aapneAcc(page, '#accRebook');
  await page.waitForTimeout(200);
  // Bryter AV→PÅ
  const førPut = putLog.length;
  await page.evaluate(() => { const t=document.querySelector('#tog-rebook'); t.checked=true; t.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(500);
  const etterToggle = await page.evaluate(() => ({ checked:document.querySelector('#tog-rebook').checked,
    errSkjult:(document.querySelector('#rebookErr')||{}).hidden!==false, badge:!!document.querySelector('#accRebook .laas-badge') }));
  const putBryter = putLog.slice(førPut).find(b => 'sms_rebooking_enabled' in b);
  // Re-render (ny loadSmsInnstillinger → GET returnerer oppdatert state) → holder?
  await page.evaluate(() => loadSmsInnstillinger());
  await page.waitForTimeout(400);
  const holderBryter = await page.evaluate(() => document.querySelector('#tog-rebook').checked);
  // Intervall-pille 35→45
  const førPille = putLog.length;
  await page.evaluate(() => { const b=[...document.querySelectorAll('#rebookPills button')].find(x=>x.dataset.days==='45'); b.click(); });
  await page.waitForTimeout(500);
  const putPille = putLog.slice(førPille).find(b => 'rebooking_interval_days' in b);
  const pilleValgt = await page.evaluate(() => (document.querySelector('#rebookPills button[data-days="45"]')||{}).getAttribute('aria-selected'));
  await page.evaluate(() => loadSmsInnstillinger());
  await page.waitForTimeout(400);
  const holderPille = await page.evaluate(() => (document.querySelector('#rebookPills button[data-days="45"]')||{}).getAttribute('aria-selected'));
  console.log('  Bryter: PUT sendt=', !!putBryter, JSON.stringify(putBryter||null), '| checked etter=', etterToggle.checked, '| feil skjult=', etterToggle.errSkjult, '| badge=', etterToggle.badge, '| holder etter re-render=', holderBryter);
  console.log('  Pille : PUT sendt=', !!putPille, JSON.stringify(putPille||null), '| aria-selected etter=', pilleValgt, '| holder etter re-render=', holderPille);
  const okToggle = putBryter && putBryter.sms_rebooking_enabled===true && etterToggle.checked===true && etterToggle.errSkjult===true && !etterToggle.badge && holderBryter===true
    && putPille && putPille.rebooking_interval_days===45 && pilleValgt==='true' && holderPille==='true' && errs.length===0;
  console.log('  TOGGLE-BEVIS OK (PUT ut + ok + holder + ingen rollback/403/badge):', okToggle?'JA':'NEI');
  await page.close();
}

// ── 403-test: PUT /settings → 403 skal vise lås-lenke, ikke «Kunne ikke lagre» (rebooking-bryter) ──
console.log('\n=== 403-test (backend-gate, rebooking-bryter på Vekst-UI) ===');
{
  const page = await browser.newPage({ viewport:{ width:375, height:1100 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', true, nyState(), null)); // forbudt403 = true
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1300);
  await aapneAcc(page, '#accRebook');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const t=document.querySelector('#tog-rebook'); t.checked=true; t.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => { const err=document.querySelector('#rebookErr');
    return { synlig: err?!err.hidden:false, tekst: err?err.textContent.replace(/\s+/g,' ').trim():'',
      harLenke: err?!!err.querySelector('a.skjold-lenke'):false, erGenerisk: err?/Kunne ikke lagre/.test(err.textContent):false,
      rullTilbake: document.querySelector('#tog-rebook').checked===false }; });
  await kryssKlipp(page, '#accRebook', `${OUT}/skjold-403-rebook-375.png`);
  console.log('  feilfelt synlig:', m.synlig, '| tekst:', JSON.stringify(m.tekst));
  console.log('  har lås-lenke:', m.harLenke, '| generisk:', m.erGenerisk, '| bryter rullet tilbake:', m.rullTilbake);
  console.log('  403-OK (lås-lenke + ikke generisk + rollback + 0 JS-feil):', (m.harLenke && !m.erGenerisk && m.rullTilbake && errs.length===0)?'JA':'NEI');
  await page.close();
}

// ── SMS-forhåndsvisninger: full tekst, tett beskåret (påminnelse + rebooking) @320/375 ──────────
console.log('\n=== SMS-forhåndsvisninger (full body) ===');
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', false, nyState(), null));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1300);
  await aapneAcc(page, '#accPaam'); await aapneAcc(page, '#accRebook');
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => ({ paam:(document.querySelector('#paamPreview .sms-bubble')||{}).textContent||'',
    rebook:(document.querySelector('#rebookPreview .sms-bubble')||{}).textContent||'' }));
  await kryssKlipp(page, '#accPaam',   `${OUT}/sms-prev-paaminnelse-${bredde}.png`);
  await kryssKlipp(page, '#accRebook', `${OUT}/sms-prev-rebooking-${bredde}.png`);
  console.log(`  [${bredde}] påminnelse="${b.paam}"`);
  console.log(`  [${bredde}] rebooking ="${b.rebook}"  (linjeskift bevart: ${/\n/.test(b.rebook)})  jsfeil=${errs.length?errs.join(';'):'ingen'}`);
  await page.close();
}

// ── RACE-ASSERT: deep-link #vekst på Basis skal ALDRI vise kundenavn/telefon i noe tidsvindu ────
// /billing/status forsinkes bevisst 800ms for å VIDE race-vinduet (vekst-loaderne fyrer i anvendHash
// før billing). Kundekildene returnerer EKTE data; vises noe av det er det en lekkasje. Poll tett.
console.log('\n=== RACE-ASSERT (deep-link #vekst, Basis, treg billing) ===');
{
  const NAVN='LEKKASJE-Kunde', TLF='99887766';
  const raceRouter = async route => {
    const req=route.request(); const p=new URL(req.url()).pathname;
    const json=(o)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status'){ await new Promise(r=>setTimeout(r,800)); return json(billing('basis')); }
    if(p==='/api/dashboard/profile') return json(PROFILE);
    if(p==='/api/dashboard/design') return json({palette:'minimal',font:'fraunces',layout:'showcase',mode:'mork'});
    if(p==='/api/dashboard/settings') return json(nyState());
    if(p==='/api/dashboard/sms-preview') return json({kind:new URL(req.url()).searchParams.get('kind'),body:'Hei',tegn:3,segmenter:1,gsm7:true,transaksjonell:true});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><body></body>'});
    if(p==='/api/dashboard/google/status') return json({connected:false,scope_ok:true});
    if(p==='/api/dashboard/winback') return json({no_show:[{customer_id:1,name:NAVN,phone:TLF,last_service:'Fade',days_since:2}],lapsed:[]});
    if(p==='/api/dashboard/referrals') return json([]);
    if(/customers\/recent/.test(p)) return json([{customer_id:9,name:NAVN,phone:TLF,referral_code:'ABC',last_service:'Klipp'}]);
    if(p==='/api/dashboard/loyalty') return json({enabled:true,threshold:10,pct:100,count_history:false,participants:[{customer_id:1,name:NAVN,phone:TLF,stamps:7,reward_ready:false}],eligible:[],totals:{in_progress:1,ready:0,redeemed_month:0,participants:1,eligible:0}});
    const liste=/images|bookings|stats|attribution|momentum|sms-logg|hours|services/.test(p);
    return json(liste?[]:{});
  };
  const page = await browser.newPage({ viewport:{width:375,height:1100}, deviceScaleFactor:2 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**', raceRouter);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#vekst`, { waitUntil:'domcontentloaded' });
  let treff=null, samples=0;
  for(let i=0;i<45;i++){ // ~45×50ms = 2.25s, dekker 800ms billing-forsinkelse + etter
    const leak = await page.evaluate(({n,t})=>{ const d=(document.querySelector('#vekst')||document.body).textContent||''; return d.includes(n)||d.includes(t); }, {n:NAVN,t:TLF});
    samples++; if(leak){ treff=i; break; } await page.waitForTimeout(50);
  }
  await page.waitForTimeout(400);
  const slutt = await page.evaluate(({n,t})=>{ const d=(document.querySelector('#vekst')||document.body).textContent||''; return { leak:d.includes(n)||d.includes(t), wb:(document.querySelector('#wbList')||{}).textContent||'' }; }, {n:NAVN,t:TLF});
  const ok = treff===null && !slutt.leak && errs.length===0;
  console.log(`  samples=${samples} · lekkasje i race-vinduet=${treff===null?'NEI':('JA @ sample '+treff)} · lekkasje etter billing=${slutt.leak}`);
  console.log(`  #wbList til slutt="${slutt.wb.replace(/\\s+/g,' ').trim().slice(0,55)}"`);
  console.log('  RACE-ASSERT OK (0 kundenavn/tlf i DOM i noe vindu):', ok?'JA':'NEI');
  await page.close();
}

// ── BILLING-FEIL-ASSERT: en fetch-feil skal ALDRI gi permanent «Laster …» ────────────
// Vekst deep-link, /billing/status = 500 → gatede seksjoner viser synlig feil + «Prøv igjen»
// (ikke «Laster», ingen kundedata). Retry med billing 200 → data laster. Biter hvis fiksen mangler.
console.log('\n=== BILLING-FEIL-ASSERT (Vekst deep-link, billing 500 → retry) ===');
{
  let billingOk=false;
  const router = async route => {
    const req=route.request(); const p=new URL(req.url()).pathname;
    const json=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status'){ if(!billingOk) return route.fulfill({status:500,contentType:'application/json',body:'{"error":"x"}'}); return json(billing('vekst')); }
    if(p==='/api/dashboard/profile') return json(PROFILE);
    if(p==='/api/dashboard/design') return json({palette:'minimal',font:'fraunces',layout:'showcase',mode:'mork'});
    if(p==='/api/dashboard/settings') return json({sms_paaminnelse_enabled:true,sms_rebooking_enabled:true,rebooking_interval_days:35,referral_discount_pct:20,referral_reward_recipient:'begge',loyalty_enabled:true,loyalty_threshold:10,loyalty_pct:100,loyalty_count_history:false});
    if(p==='/api/dashboard/attribution') return json(ATTR);
    if(p==='/api/dashboard/momentum') return json({show:true,overdue:1,returning:20});
    if(p==='/api/dashboard/loyalty') return json(LOYAL);
    if(p==='/api/dashboard/sms-preview') return json({kind:new URL(req.url()).searchParams.get('kind'),body:'Hei',tegn:3,segmenter:1,gsm7:true,transaksjonell:true});
    if(p==='/api/dashboard/winback') return json({no_show:[{customer_id:1,name:'Ola Nordmann',phone:'99887766',last_service:'Fade',days_since:2}],lapsed:[]});
    if(p==='/api/dashboard/referrals') return json([]);
    if(/customers\/recent/.test(p)) return json([]);
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><body></body>'});
    if(p==='/api/dashboard/google/status') return json({connected:false,scope_ok:true});
    const liste=/images|bookings|stats|hours|services|sms-logg/.test(p);
    return json(liste?[]:{});
  };
  const page=await browser.newPage({viewport:{width:375,height:1100},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#vekst`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1600);
  const feil = await page.evaluate(()=>{
    const g=s=>(document.querySelector(s)||{}).textContent||'';
    const wb=g('#wbList'),vv=g('#vervSendList'),lo=g('#loyalOversikt'); const alle=wb+vv+lo;
    return { visFeil: /Kunne ikke laste/.test(wb)&&/Kunne ikke laste/.test(vv)&&/Kunne ikke laste/.test(lo),
      retryKnapper: document.querySelectorAll('[data-billing-retry]').length,
      laster: /Laster/.test(alle), kundedata: /Ola Nordmann|99887766/.test(alle) };
  });
  await kryssKlipp(page,'#accWinback',`${OUT}/billingfeil-375.png`);
  console.log(`  Fase1 (billing 500): feil+retry=${feil.visFeil} retry-knapper=${feil.retryKnapper}(skal 3) · «Laster»=${feil.laster}(skal false) · kundedata=${feil.kundedata}(skal false)`);
  billingOk=true;
  await page.evaluate(()=>{ var b=document.querySelector('[data-billing-retry]'); if(b)b.click(); }); // delegert handler; knappen kan ligge i kollapset accordion
  await page.waitForTimeout(1300);
  const etter = await page.evaluate(()=>{ const wb=(document.querySelector('#wbList')||{}).textContent||'';
    return { wb, feilStår:/Kunne ikke laste/.test(wb), lasterStår:/Laster …/.test(wb), harData:/Ola Nordmann/.test(wb) }; });
  const ok = feil.visFeil && feil.retryKnapper===3 && !feil.laster && !feil.kundedata
    && etter.harData && !etter.feilStår && !etter.lasterStår && errs.length===0;
  console.log(`  Fase2 (retry, billing 200): #wbList="${etter.wb.replace(/\s+/g,' ').trim().slice(0,45)}" (data=${etter.harData}, feil borte=${!etter.feilStår})`);
  console.log('  BILLING-FEIL-ASSERT OK (feil+retry ved feil, INGEN «Laster»/kundedata; retry laster data):', ok?'JA':'NEI');
  await page.close();
}

await browser.close(); server.close();
