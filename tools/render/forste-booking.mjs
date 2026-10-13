// «Få din første booking» (Oversikt) — GET /api/dashboard/aktivering + POST /aktivering/steg (backend 1647f62).
//
// Verifiserer (måler tekst og synlighet, ikke bare bilde) i Microsoft Edge (channel 'msedge'):
//   • synlig KUN når page_status==='live' og har_booking===false; skjult ved har_booking true,
//     upublisert side, 500 fra /aktivering og svar uten har_booking
//   • låst copy (tittel, undertekst, steg 1–3, knappetekster) + svarmeldingen med barberens EGEN slug
//   • ingen priser / Vekst-salg i seksjonen
//   • kryss: lokalt med en gang → POST {steg,ferdig}; 200 → står; 403 (demo) → rulles tilbake, ingen melding
//   • «Kopier svarmelding» → utklippstavla har meldingen + steget krysses; «Kopier lenke» → full lenke
//   • «Lag story» → story-generatoren åpner + steget krysses
//   • kryss overlever reload (lagret på serveren — mocken holder tilstanden, ikke nettleseren)
//   • INGEN request mot prod: alt under /api/** mockes, resten avbrytes
// Skjermbilder: 320 og 375, lys og mørk.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = process.env.OUT || path.resolve(import.meta.dirname, '../../.render-ut/forste-booking');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const SLUG='saxe-cuts';
const KRYMPET='Lenka er delt. Første booking kommer når en kunde bruker den.';
const MELDING=`Yes 👌 Se ledige tider og book her: trybarberhq.com/${SLUG}`;
const PROFIL={hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@s.no',slug:SLUG};
const billing=(x={})=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis',
  effective_plan_grunn:'gratis', trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null,
  needs_attention:false, attention_grunn:null, cancel_at_period_end:false, current_period_end:null, ...x });
const steg=(x={})=>({svarmelding:false,bio:false,story:false,...x});

let prodSluppet=0, prodAvbrutt=0;
// state.aktivering: objekt som GET svarer med (eller {status}); state.post: 'ok' | 403 | 500. Mocken
// holder kryssene (som serveren), så reload viser det som ble lagret.
async function stubApi(page,state){
  state.poster=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodSluppet++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodAvbrutt++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(); const p=new URL(req.url()).pathname;
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodAvbrutt++;
    const json=(o,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/aktivering/steg'&&req.method()==='POST'){
      const b=JSON.parse(req.postData()||'{}'); state.poster.push(b);
      if(state.post!=='ok') return json({error:'Ikke tilgjengelig i forhåndsvisning'},state.post);
      state.aktivering.steg={...state.aktivering.steg,[b.steg]:b.ferdig};
      return json({steg:state.aktivering.steg});
    }
    if(req.method()!=='GET') return json({},500);   // ingen andre skrivende kall
    if(p==='/api/dashboard/aktivering') return state.aktivering.status ? json({},state.aktivering.status) : json(state.aktivering);
    if(p==='/api/dashboard/billing/status') return json(state.billing);
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/loyalty') return json({enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
}

const browser=await chromium.launch({channel:'msedge'});
async function nySide(bredde,tema,state){
  const ctx=await browser.newContext({viewport:{width:bredde,height:900},deviceScaleFactor:2,colorScheme:tema,
    permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage();
  await page.addInitScript(t=>{ try{ localStorage.setItem('bhq-theme',t); }catch(e){} },tema);
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  await stubApi(page,state);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  return {ctx,page,errs};
}
const synlig=page=>page.$eval('#forsteBooking',e=>!e.hidden&&e.offsetParent!==null).catch(()=>false);
const kryss=page=>page.$$eval('#forsteBooking .fb-kryss',bs=>bs.map(b=>b.getAttribute('aria-checked')==='true'));
const rapport=[]; const push=(n,f,errs=[])=>rapport.push({sjekk:n,resultat:(f.length||errs.length)?'✗ '+[...f,...errs.map(e=>'JS: '+e)].join(' | '):'OK ✓'});

// ── Synlighet + skjermbilder ──────────────────────────────────────────────────────────────
const VIS=[
  {id:'uten-kryss', b:billing(), a:{har_booking:false,steg:steg()}, vis:true},
  {id:'med-kryss',  b:billing(), a:{har_booking:false,steg:steg({svarmelding:true,bio:true})}, vis:true},
  {id:'krympet', b:billing(), a:{har_booking:false,steg:steg({svarmelding:true,bio:true,story:true})}, vis:true, krympet:true},
  {id:'krympet-har-booking', b:billing(), a:{har_booking:true,steg:steg({svarmelding:true,bio:true,story:true})}, vis:false},
  {id:'har-booking',b:billing(), a:{har_booking:true,steg:steg()}, vis:false},
  {id:'upublisert', b:billing({page_status:'forhandsvist'}), a:{har_booking:false,steg:steg()}, vis:false},
  {id:'api-feil',   b:billing(), a:{status:500}, vis:false},
  {id:'mangler-felt',b:billing(), a:{steg:steg()}, vis:false, ettSkudd:true},
];
for(const c of VIS){
  for(const bredde of [320,375]) for(const tema of ['light','dark']){
    if(c.ettSkudd && (bredde!==375||tema!=='light')) continue;
    const state={billing:c.b, aktivering:JSON.parse(JSON.stringify(c.a)), post:'ok'};
    const {ctx,page,errs}=await nySide(bredde,tema,state);
    const f=[];
    const v=await synlig(page);
    if(v!==c.vis) f.push(`synlig=${v}, ventet ${c.vis}`);
    if(c.krympet){
      const t=await page.$eval('#forsteBooking',e=>e.innerText.replace(/\s+/g,' ').trim());
      if(t!==KRYMPET+' Vis stegene') f.push(`krympet tekst «${t}»`);
      if(!(await page.$eval('#fbFull',e=>e.hidden))) f.push('stegene står åpne');
      const forst=await page.$eval('#oversikt',e=>{const k=[...e.children].find(x=>x.offsetParent!==null);return k&&k.id;});
      if(forst!=='forsteBooking') f.push(`ikke øverst på Oversikt (først: ${forst})`);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) f.push('horisontal scroll');
      await page.locator('#forsteBooking').screenshot({path:path.join(OUT,`${c.id}-${bredde}-${tema}.png`)});
      await page.screenshot({path:path.join(OUT,`${c.id}-kontekst-${bredde}-${tema}.png`),clip:{x:0,y:0,width:bredde,height:420}});
    }else if(c.vis){
      const t=await page.$eval('#forsteBooking',e=>e.innerText);
      for(const forvent of ['Få din første booking','Siden din er live. Nå gjelder det å få kundene dit.',
        'Svar kundene med lenka','Når noen spør om time på Snap eller Instagram: send dette i stedet for å avtale tiden selv.',
        MELDING,'Kopier svarmelding','Legg lenka i Instagram-bioen','Kopier lenke','Legg ut en story','Lag story'])
        if(!t.includes(forvent)) f.push(`mangler «${forvent}»`);
      if(/grand-barber|kr\b|Vekst|Oppgrader|\d+\s*\/\s*3|%/.test(t)) f.push(`forbudt innhold: «${t.match(/grand-barber|kr\b|Vekst|Oppgrader|\d+\s*\/\s*3|%/)[0]}»`);
      const k=await kryss(page), vent=['svarmelding','bio','story'].map(s=>c.a.steg[s]);
      if(JSON.stringify(k)!==JSON.stringify(vent)) f.push(`kryss ${JSON.stringify(k)} ≠ ${JSON.stringify(vent)}`);
      const forst=await page.$eval('#oversikt',e=>{const k=[...e.children].find(x=>x.offsetParent!==null);return k&&k.id;});
      if(forst!=='forsteBooking') f.push(`ikke øverst på Oversikt (først: ${forst})`);
      const bred=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      if(bred) f.push('horisontal scroll');
      await page.locator('#forsteBooking').screenshot({path:path.join(OUT,`${c.id}-${bredde}-${tema}.png`)});
    }else{
      await page.screenshot({path:path.join(OUT,`${c.id}-${bredde}-${tema}.png`)});
    }
    push(`${c.id} ${bredde} ${tema}`,f,errs);
    await ctx.close();
  }
}

// ── Interaksjon ────────────────────────────────────────────────────────────────────────
{ // kryss for hånd → POST, står; reload → fortsatt krysset (serveren holder det)
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg()}, post:'ok'};
  let {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  await page.click('li[data-steg="bio"] .fb-kryss');
  if((await kryss(page))[1]!==true) f.push('ikke krysset lokalt');
  await page.waitForTimeout(300);
  if(JSON.stringify(state.poster)!==JSON.stringify([{steg:'bio',ferdig:true}])) f.push(`POST ${JSON.stringify(state.poster)}`);
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(300);
  if((await kryss(page))[1]!==true) f.push('krysset forsvant ved reload');
  await page.click('li[data-steg="bio"] .fb-kryss'); await page.waitForTimeout(300);
  if((await kryss(page))[1]!==false) f.push('kunne ikke fjerne krysset');
  if(JSON.stringify(state.poster.at(-1))!==JSON.stringify({steg:'bio',ferdig:false})) f.push(`fjern-POST ${JSON.stringify(state.poster.at(-1))}`);
  push('kryss → POST → reload',f,errs); await ctx.close();
}
{ // 403 (demo) → rulles tilbake uten melding
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg()}, post:403};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  const foer=await page.$eval('body',e=>e.innerText);
  await page.click('li[data-steg="svarmelding"] .fb-kryss');
  const umiddelbart=(await kryss(page))[0];
  await page.waitForTimeout(400);
  if(umiddelbart!==true) f.push('ikke krysset lokalt før POST');
  if((await kryss(page))[0]!==false) f.push('ikke rullet tilbake etter 403');
  const toast=await page.$eval('#toast',e=>e.classList.contains('show')?e.textContent:'').catch(()=>'');
  if(toast) f.push(`toast «${toast}»`);
  const etter=await page.$eval('body',e=>e.innerText);
  if(/Ikke tilgjengelig|feil|Kunne ikke/i.test(etter.replace(foer,''))) f.push('feilmelding vist');
  push('403 → tilbakerulling, ingen melding',f,errs); await ctx.close();
}
{ // 500 på POST → rulles tilbake
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg({story:true})}, post:500};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  await page.click('li[data-steg="story"] .fb-kryss'); await page.waitForTimeout(400);
  if((await kryss(page))[2]!==true) f.push('fjernet kryss ble ikke rullet tilbake');
  push('500 → tilbakerulling',f,errs); await ctx.close();
}
{ // kopier svarmelding + kopier lenke → utklippstavla + kryss
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg()}, post:'ok'};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  await page.click('[data-fb-handling="svarmelding"]'); await page.waitForTimeout(300);
  const c1=await page.evaluate(()=>navigator.clipboard.readText());
  if(c1!==MELDING) f.push(`utklipp 1 «${c1}»`);
  await page.click('[data-fb-handling="bio"]'); await page.waitForTimeout(300);
  const c2=await page.evaluate(()=>navigator.clipboard.readText());
  if(c2!==`https://trybarberhq.com/${SLUG}`) f.push(`utklipp 2 «${c2}»`);
  const k=await kryss(page); if(!(k[0]&&k[1]&&!k[2])) f.push(`kryss ${JSON.stringify(k)}`);
  push('kopier → utklippstavle + kryss',f,errs); await ctx.close();
}
{ // krympet → «Vis stegene» åpner → fjern kryss (POST) → stegene står åpne → kryss igjen → krympes
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg({svarmelding:true,bio:true,story:true})}, post:'ok'};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  const full=()=>page.$eval('#fbFull',e=>!e.hidden), krymp=()=>page.$eval('#fbKrympet',e=>!e.hidden);
  await page.click('#fbVis'); await page.waitForTimeout(100);
  if(!(await full())||(await krymp())) f.push('«Vis stegene» åpnet ikke');
  await page.click('li[data-steg="bio"] .fb-kryss'); await page.waitForTimeout(300);
  if(JSON.stringify(state.poster.at(-1))!==JSON.stringify({steg:'bio',ferdig:false})) f.push(`POST ${JSON.stringify(state.poster.at(-1))}`);
  if(!(await full())) f.push('stegene lukket etter fjernet kryss');
  await page.click('li[data-steg="bio"] .fb-kryss'); await page.waitForTimeout(300);
  if(!(await krymp())) f.push('krympet ikke igjen når alle tre ble krysset');
  push('krympet → Vis stegene → fjern/sett kryss',f,errs); await ctx.close();
}
{ // krympet, så fjernes et kryss på serveren (annen enhet) → reload → stegene åpne automatisk
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg({svarmelding:true,bio:true,story:true})}, post:'ok'};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  if(!(await page.$eval('#fbKrympet',e=>!e.hidden))) f.push('ikke krympet ved start');
  state.aktivering.steg.story=false;
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(300);
  if(!(await page.$eval('#fbFull',e=>!e.hidden))) f.push('stegene åpnet ikke');
  push('krympet → kryss fjernet → åpent',f,errs); await ctx.close();
}
{ // 403 mens stegene er åpnet fra krympet: tilbakerulling holder dem åpne (ingen hopp)
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg({svarmelding:true,bio:true,story:true})}, post:403};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  await page.click('#fbVis'); await page.click('li[data-steg="story"] .fb-kryss'); await page.waitForTimeout(400);
  if((await kryss(page))[2]!==true) f.push('ikke rullet tilbake');
  if(!(await page.$eval('#fbFull',e=>!e.hidden))) f.push('stegene klappet sammen etter tilbakerulling');
  push('krympet + 403 → tilbakerullet',f,errs); await ctx.close();
}
{ // Lag story → generatoren åpner + kryss
  const state={billing:billing(), aktivering:{har_booking:false,steg:steg()}, post:'ok'};
  const {ctx,page,errs}=await nySide(375,'light',state); const f=[];
  await page.click('[data-fb-handling="story"]'); await page.waitForTimeout(500);
  const apen=await page.$eval('#storyOverlay',e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0);
  if(!apen) f.push('story-generatoren åpnet ikke');
  if((await kryss(page))[2]!==true) f.push('story ikke krysset');
  push('Lag story → generator + kryss',f,errs); await ctx.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'prod-trafikk', resultat:(prodSluppet-prodAvbrutt)>0?`✗ ${prodSluppet-prodAvbrutt} sluppet`:'OK ✓ (0 sluppet)'});
console.table(rapport);
if(rapport.some(r=>r.resultat.startsWith('✗'))) process.exitCode=1;
