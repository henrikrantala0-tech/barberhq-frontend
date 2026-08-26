// Sveip over ALLE fem faner på 320 + 402 med realistiske mocks. Måler, konkluderer ikke.
//
// Dette er kartleggingen som «Full mobil-gjennomgang av dashbordet» i CLAUDE.md ber om:
// den skal produsere en liste å bli enig om, ikke fikse noe.
//
// Fire mål per fane, alle tall — ingen øyemål:
//   1. pageerror        én død JS-fil gir tomme lister som SER ut som manglende data
//   2. overflow         documentElement.scrollWidth > viewport
//   3. trykkflater      getBoundingClientRect på alle SYNLIGE knapper/lenker, flagg h < 40px
//   4. tomme lister     mocken gir data → 0 rader er en feil, ikke en tom tilstand
//   5. «Laster …»       står den igjen etter networkidle + 1500 ms, kom svaret aldri fram
//
// VIEWPORT-SKUDD, IKKE fullPage. Se README: fullPage på disse sidene gir både tomme flater
// (scroll-reveal fyrer aldri) og falsk overlapp (sticky header males på scroll-offsetet).
// Målingene er uavhengige av skuddet — getBoundingClientRect leser layout, ikke det synlige.
//
// Konto-tilstandene er en KOPI av lista i konto-lenke.mjs. Å eksportere derfra ville krevd
// at det scriptet ble delt i data og kjøring; det er en endring i en committet fil, og denne
// runden skal ikke endre noe. Holdes i synk manuelt — de er rene data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b); });
});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

// ── Mocks ────────────────────────────────────────────────────────────────────
// Datoene MÅ regnes fra nå. Bookinglista filtrerer på «i dag og bakover» og kommende-lista
// på «etter nå» — faste datoer i 2026 ville gitt tomme lister som så ut som en bug.
const D  = n => new Date(Date.now()+n*864e5);
const iso= n => D(n).toISOString();
const ymd= n => D(n).toISOString().slice(0,10);

const daily=[];
for(let i=89;i>=0;i--){
  const helg=[0,6].includes(D(-i).getUTCDay());
  const count=helg?0:2+((i*7)%4);
  daily.push({day:ymd(-i),count,revenue:count*380,new:count?1:0,returning:count?count-1:0});
}
const weekly=[];
for(let w=12;w>=1;w--) weekly.push({week_start:ymd(-w*7),revenue:8000+((w*911)%6000)});

const STATS={
  daily,
  months_with_data:[ymd(-40).slice(0,7), ymd(-70).slice(0,7)],
  current_week_revenue:10550, best_week_revenue:13950, best_week_start:ymd(-35),
  weekly_revenue:weekly,
};

const BOOKINGER=[
  {id:'b1',start:iso(-3),name:'Markus Lie',   service:'Skinnfade',     price:450,status:'fullfort'},
  {id:'b2',start:iso(-2),name:'Adam Sø',      service:'Klipp + skjegg',price:400,status:'fullfort'},
  {id:'b3',start:iso(-1),name:'Ukjent',       service:'Klipp',         price:300,status:'ikke_mott'},
  {id:'b4',start:iso(-0.2),name:'Jonas Berg', service:'Skinnfade',     price:450,status:'fullfort'},
  {id:'b5',start:iso(0.3),name:'Filip Aas',   service:'Klipp',         price:300,status:'booket'},
  {id:'b6',start:iso(1),  name:'Sander Vik',  service:'Klipp + skjegg',price:400,status:'booket'},
  {id:'b7',start:iso(2),  name:'Oliver Strand',service:'Skinnfade',    price:450,status:'booket'},
  {id:'b8',start:iso(4),  name:'Theo Haug',   service:'Klipp',         price:300,status:'booket'},
];

const SVAR={
  '/api/dashboard/profile':{hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber',
    email:'henrik@grandbarber.no',slug:'grand-barber',address:'Storgata 12, 0155 Oslo',
    tagline:'Fades & klassiske klipp',bio:'Presisjon i hvert klipp. Skarpe fades, rene linjer.'},
  '/api/dashboard/stats':STATS,
  '/api/dashboard/bookings':BOOKINGER,
  '/api/dashboard/images':[],
  '/api/dashboard/services':{hoved:[{name:'Herreklipp',price:450,min:30},{name:'Skinnfade',price:550,min:45},
                                    {name:'Studentklipp',price:350,min:30}],
                             tillegg:[{name:'Skjeggtrim',price:200},{name:'Vask',price:100}]},
  '/api/dashboard/hours':[0,1,2,3,4,5,6].map(wd=>({weekday:wd,is_closed:wd===0,
                             open_time:'10:00',close_time:wd===6?'16:00':'18:00'})),
  // payment_methods bor på /settings, IKKE på /payment-methods — den siste er kun PUT.
  // Uten dem her seeder loadPayment én tom rad, og #payList=1 leses som en tom liste.
  '/api/dashboard/settings':{sms_paaminnelse_enabled:true,sms_rebooking_enabled:true,
    rebooking_interval_days:35,referral_reward_recipient:'begge',referral_discount_pct:20,
    payment_methods:['Vipps','Kort','Kontant']},
  '/api/dashboard/design':{palette:'mint',font:'fraunces',layout:'profil',mode:'mork'},
  '/api/dashboard/google/status':{connected:true,scope_ok:true,google_email:'henrik@grandbarber.no'},
  '/api/dashboard/referrals':[{id:'r1',verver:'Markus Lie',ny:'Adam Sø',created_at:iso(-9),
                               recipient:'begge',discount_pct:20,status:'utlost'}],
  '/api/dashboard/customers/recent':{customers:[
    {customer_id:'c1',name:'Markus Lie',phone:'+4790000001',last_visit_at:iso(-3),days_since:3,last_service:'Skinnfade'},
    {customer_id:'c2',name:'Adam Sø',   phone:'+4790000002',last_visit_at:iso(-2),days_since:2,last_service:'Klipp'}]},
  '/api/dashboard/rebooking':{enabled:true,interval_days:35,customers:[
    {customer_id:'c3',name:'Petter Ås',phone:'+4790000003',last_visit_at:iso(-40),days_since:40,last_service:'Klipp'}]},
  '/api/dashboard/winback':{
    no_show:[{customer_id:'c9',name:'Ukjent',phone:'+4790000009',last_booking_at:iso(-1),days_since:1}],
    lapsed :[{customer_id:'c8',name:'Lars Moe',phone:'+4790000008',last_booking_at:iso(-74),days_since:74}]},
};
const ATTRIBUSJON={period:'uke',rebooking:{count:6,revenue:2700},
                   recovery:{count:2,revenue:900},vervet:{count:1,revenue:450}};
const SMS_PREVIEW={body:'Hei Markus! Minner om timen din i morgen kl 14:00 hos Grand Barber.',
                   transaksjonell:true};

// Konto-tilstandene — kopi fra konto-lenke.mjs, se filhodet.
const dagerSiden=n=>iso(-n);
const KONTO=[
  ['B-live-trial',   {subscription_status:null,page_status:'live',trial_start_at:dagerSiden(18),
                      trial_days_left:12,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:false,attention_grunn:null,days_left:null,trial_ends_at:null}],
  ['C-live-myk',     {subscription_status:null,page_status:'live',trial_start_at:dagerSiden(33),
                      trial_days_left:0,myk_periode:true,nedtaking_dager_igjen:4,
                      needs_attention:true,attention_grunn:'trial_utlopt',days_left:null,trial_ends_at:null}],
  ['F-active-live',  {subscription_status:'active',page_status:'live',trial_start_at:dagerSiden(40),
                      trial_days_left:0,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:false,attention_grunn:null,days_left:null,trial_ends_at:null}],
  ['E-past-due',     {subscription_status:'past_due',page_status:'live',trial_start_at:dagerSiden(60),
                      trial_days_left:0,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:true,attention_grunn:'past_due',days_left:null,trial_ends_at:null}],
  ['A-forhandsvist', {subscription_status:null,page_status:'forhandsvist',trial_start_at:null,
                      trial_days_left:null,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:false,attention_grunn:null,days_left:null,trial_ends_at:null}],
  ['D-nedtatt',      {subscription_status:null,page_status:'forhandsvist',trial_start_at:dagerSiden(40),
                      trial_days_left:0,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:true,attention_grunn:'trial_utlopt_nedtatt',days_left:null,trial_ends_at:null}],
  ['draft',          {subscription_status:null,page_status:'draft',trial_start_at:null,
                      trial_days_left:null,myk_periode:false,nedtaking_dager_igjen:null,
                      needs_attention:false,attention_grunn:null,days_left:null,trial_ends_at:null}],
];
const STANDARD_BILLING=KONTO.find(k=>k[0]==='F-active-live')[1];

function ruter(page,billing){
  return page.route('**/api/**',route=>{
    const u=new URL(route.request().url());
    const json=b=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(b)});
    if(u.pathname==='/api/dashboard/billing/status') return json(billing);
    if(u.pathname==='/api/dashboard/attribution')    return json(ATTRIBUSJON);
    if(u.pathname==='/api/dashboard/sms-preview')    return json(SMS_PREVIEW);
    if(u.pathname==='/api/dashboard/preview')
      return route.fulfill({status:200,contentType:'text/html',
        body:'<html><body style="background:#111;color:#fff;font:14px system-ui;padding:20px">forhåndsvisning</body></html>'});
    if(SVAR[u.pathname]!==undefined) return json(SVAR[u.pathname]);
    // Ufanget /api-sti: svar tomt, men LOGG det — en tom liste kan ellers se ut som et
    // frontend-problem når den egentlig er en mock vi glemte.
    ufanget.add(u.pathname);
    return json(/list|recent|bookings|images|referrals/.test(u.pathname)?[]:{});
  });
}
const ufanget=new Set();

// networkidle PER FANE kan aldri inntreffe: «Din side» holder preview-iframen i gang. Vi
// venter derfor med tak og RAPPORTERER om roen kom — å bare kaste (eller svelge) ville skjult
// forskjellen mellom «lastet ferdig» og «gir opp». 1500 ms legges på uansett, som avtalt.
async function roOgVent(page){
  let ro='ja';
  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{ro='NEI (8s)';});
  await page.waitForTimeout(1500);
  return ro;
}

// Containere som SKAL ha rader gitt mocken over. Tallet er minimum, ikke fasit.
const LISTER={
  oversikt:[['#stats',2],['#chartBars',7],['#drivenBy',1],['#upcomingList',1],['#bookingList',1]],
  vekst:   [['#wbList',1]],
  tjenester:[['#hovedList',3],['#tilleggList',2],['#hoursList',7],['#payList',2]],
  design:  [['#sideAccs',3]],
  abonnement:[['#kontoAccs',4]],
};

const FANER=[['oversikt','Oversikt'],['vekst','Vekst'],['tjenester','Tjenester & tider'],
             ['design','Din side'],['abonnement','Konto']];

async function mal(page,panelId,lister){
  return page.evaluate(({id,lister})=>{
    const panel=document.getElementById(id);
    const synlig=el=>{const r=el.getBoundingClientRect();
      return !!el.offsetParent && r.width>0 && r.height>0;};

    const flater=[...panel.querySelectorAll('button,a,select,input[type="checkbox"],input[type="text"],textarea')]
      .filter(synlig)
      .map(el=>{const r=el.getBoundingClientRect();
        return {t:((el.textContent||'').trim()||el.id||el.getAttribute('aria-label')||el.tagName)
                   .replace(/\s+/g,' ').slice(0,30),
                h:Math.round(r.height), w:Math.round(r.width)};});
    const smaa=flater.filter(f=>f.h<40).sort((a,b)=>a.h-b.h);

    // Kun bladnoder: ellers teller vi foreldre som ARVER teksten «Laster …».
    const laster=[...panel.querySelectorAll('*')]
      .filter(el=>!el.children.length && synlig(el) && /^Laster\s*…?$/.test((el.textContent||'').trim()))
      .map(el=>'#'+(el.parentElement?.id||el.parentElement?.className||'?'));

    const tomme=lister.map(([sel,min])=>{
      const el=panel.querySelector(sel);
      if(!el) return {sel,n:-1,min};                       // -1 = fantes ikke
      return {sel,n:el.querySelectorAll(':scope > *').length,min};
    }).filter(x=>x.n<x.min);

    return {flater:flater.length, smaa:smaa.length,
            minste:smaa.slice(0,4).map(f=>`${f.t} ${f.h}px`),
            laster, tomme};
  },{id:panelId,lister});
}

const browser=await chromium.launch();
const rapport=[]; const detaljer=[];

for(const bredde of [320,402]){
  // ── De fire første fanene, ett sideoppslag ──
  const ctx=await browser.newContext({viewport:{width:bredde,height:800},deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await ruter(page,STANDARD_BILLING);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});

  for(const [id,navn] of FANER){
    await page.$eval(`button[data-panel="${id}"]`,b=>b.click());
    const ro=await roOgVent(page);                // «Laster …» skal være borte HER
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`${OUT}/${bredde}-sveip-${id}.png`});   // viewport, IKKE fullPage
    const m=await mal(page,id,LISTER[id]||[]);
    rapport.push({bredde,fane:navn,'nett-ro':ro,
      jsfeil: errs.length?errs.join('; ').slice(0,40):'ingen',
      overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
      flater:m.flater, 'under 40px':m.smaa,
      'tomme lister':m.tomme.length?m.tomme.map(t=>`${t.sel}=${t.n}`).join(' '):'—',
      'Laster igjen':m.laster.length?String(m.laster.length):'—'});
    if(m.smaa) detaljer.push({bredde,fane:navn,minste:m.minste.join(' · ')});
  }
  await ctx.close();

  // ── Konto: alle tilstandene, eget sideoppslag per tilstand ──
  for(const [navn,billing] of KONTO){
    const c=await browser.newContext({viewport:{width:bredde,height:800},deviceScaleFactor:2});
    const p=await c.newPage();
    const e2=[]; p.on('pageerror',e=>e2.push(e.message));
    await ruter(p,billing);
    await p.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
    await p.$eval('button[data-panel="abonnement"]',b=>b.click());
    const ro=await roOgVent(p);
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.screenshot({path:`${OUT}/${bredde}-sveip-konto-${navn}.png`});
    const m=await mal(p,'abonnement',LISTER.abonnement);
    rapport.push({bredde,fane:'Konto · '+navn,'nett-ro':ro,
      jsfeil: e2.length?e2.join('; ').slice(0,40):'ingen',
      overflow: await p.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
      flater:m.flater,'under 40px':m.smaa,
      'tomme lister':m.tomme.length?m.tomme.map(t=>`${t.sel}=${t.n}`).join(' '):'—',
      'Laster igjen':m.laster.length?String(m.laster.length):'—'});
    if(m.smaa) detaljer.push({bredde,fane:'Konto · '+navn,minste:m.minste.join(' · ')});
    await c.close();
  }
}

console.table(rapport);
console.log('\nMINSTE TRYKKFLATER PER FANE (høyde i px):');
console.table(detaljer);
if(ufanget.size) console.log('\n⚠ ufangede /api-stier (svarte tomt):', [...ufanget].join(', '));
console.log('\njsfeil:      ', rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('overflow:    ', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('tomme lister:', rapport.some(r=>r['tomme lister']!=='—')?'JA ✗':'nei');
console.log('«Laster …»:  ', rapport.some(r=>r['Laster igjen']!=='—')?'JA ✗':'nei');
console.log('trykkflater under 40px:', rapport.reduce((a,r)=>a+r['under 40px'],0), 'av',
                                       rapport.reduce((a,r)=>a+r.flater,0));
await browser.close(); server.close();
