// «Få din første booking» (Oversikt) + «Lag story» på Vekst-fanen — ombygd 27.11.2026 (Henrik).
//
// Kontrakt: GET /api/dashboard/aktivering → { har_bookingside_booking, har_booking }. Bare bookinger fra bookingsiden
// teller («Legg til booking» = kilde 'manuell' gjør ikke). Mangler har_bookingside_booking, brukes har_booking.
// Verifiserer (måler tekst, rekkefølge og synlighet med checkVisibility, ikke bare bilde):
//   • ny barber (live, ingen bookingside-booking): seksjonen RETT under I DAG, rammefri (ingen kant/bakgrunn/radius),
//     låste tekster, tre steg, ingen kryss, ingen pris/Vekst; Kommende skjult uten kommende bookinger og synlig med en
//     manuell booking; Nøkkeltall skjult til minst én fullført booking; story-inngangen i I DAG skjult OG ikke meldt
//     til backend (POST /ledige/vist); hjemskjerm-kortet (iPhone) venter
//   • kopier → utklippstavla + melding nederst («Svar kopiert» / «Lenke kopiert»), knappeteksten står; «Lag story» åpner
//     generatoren; INGEN skrivende kall fra seksjonen (POST /aktivering/steg finnes ikke lenger)
//   • reserve: bare har_booking → som før; 500 / upublisert / mangler felt → ingenting
//   • rett etter første booking: stegene borte, «Første booking er inne.» (grønn, hake) ÉN gang — reload → borte;
//     aldri for en barber som ikke har sett stegene i denne nettleseren; hjemskjerm-kortet kommer
//   • Vekst-fanen: «Lag story» (DEL) rett under «Kunder per måned», før Automatikk; uten data er tallene, diagrammet og
//     tom-teksten borte, og fanen starter med «Lag story» → Automatikk → Personlig
//   • INGEN request mot prod: alt under /api/** mockes, resten avbrytes og telles
// Skjermbilder (mørk, 320/375/1280): oversikt-ny, oversikt-etter, vekst-uten, vekst-med → .render-ut/forste-booking/
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

// Fast «nå»: fredag 27.11.2026 10:10 Oslo (UTC+1).
const NAA=new Date('2026-11-27T09:10:00Z');
const SLUG='saxe-cuts';
const MELDING=`Yes 👌 Se ledige tider og book her: trybarberhq.com/${SLUG}`;
const PROFIL={hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@example.no',slug:SLUG};
const billing=(x={})=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis',
  effective_plan_grunn:'gratis', trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null,
  needs_attention:false, attention_grunn:null, cancel_at_period_end:false, current_period_end:null, sms_pakke_kan_kjopes:false, ...x });
const VEKST=billing({subscription_status:'active',plan:'vekst',effective_plan:'vekst',effective_plan_grunn:'subscription',current_period_end:'2026-12-27T00:00:00Z'});
const bk=(id,name,service,startZ,min,x={})=>{const s=new Date(startZ);return {id,name,service,start:s.toISOString(),end:new Date(s.getTime()+min*60000).toISOString(),status:'bekreftet',kilde:'bookingside',...x};};
const MANUELL=[bk(31,'Ola Nordmann','Klipp','2026-11-28T11:00:00Z',30,{kilde:'manuell'})];      // lørdag 12:00, «Legg til booking»
const FORSTE=[bk(41,'Jonas Berg','Fade','2026-11-28T13:30:00Z',40)];                             // lørdag 14:30, via bookingsiden
const STATS_TOM={daily:[],months:[],months_with_data:[],completed_all_time:0,record_customers_month:null,weekly_revenue:[]};
const dag=(d,revenue,count)=>({day:d,revenue,count,new:1,returning:count-1});
const STATS_MED={daily:[dag('2026-11-20',1400,3),dag('2026-11-24',2100,5),dag('2026-11-26',900,2)],
  months:[{ym:'2026-06',customers:18},{ym:'2026-07',customers:24},{ym:'2026-08',customers:21},{ym:'2026-09',customers:30},{ym:'2026-10',customers:27},{ym:'2026-11',customers:22}],
  months_with_data:['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11'], completed_all_time:142,
  record_customers_month:{ym:'2026-09',customers:30}, current_week_revenue:3000, best_week_revenue:6000, best_week_start:'2026-09-07', weekly_revenue:[]};

let prodSluppet=0;
async function nySide(bredde,st,{iphone=false,init={},tema='dark'}={}){
  const ctx=await browser.newContext({viewport:{width:bredde,height:900},deviceScaleFactor:2,colorScheme:tema,reducedMotion:'reduce',
    ...(iphone?{userAgent:IPHONE,hasTouch:true}:{}), permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage();
  await page.clock.setFixedTime(NAA);
  await page.addInitScript(([t,init])=>{ try{ localStorage.setItem('bhq-theme',t); for(const k in init) localStorage.setItem(k,init[k]); }catch(e){} },[tema,init]);
  const s={errs:[],skriv:[],aktKall:0};
  page.on('pageerror',e=>s.errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  // Alt mot prod-verten som ikke er /api/** avbrytes og telles (skal være 0); /api/** besvares av mocken under.
  await page.route(u=>u.hostname==='api.trybarberhq.com'&&!u.pathname.startsWith('/api/'),r=>{ prodSluppet++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname;
    const J=(o,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
    if(req.method()!=='GET'){ s.skriv.push(req.method()+' '+p); return J({ok:true}); }   // besvares lokalt, aldri videre
    if(p==='/api/dashboard/aktivering'){ s.aktKall++; return st.akt.status ? J({},st.akt.status) : J(st.akt); }
    if(p==='/api/dashboard/billing/status') return J(st.billing||billing());
    if(p==='/api/dashboard/profile') return J(PROFIL);
    if(p==='/api/dashboard/stats') return J(st.stats||STATS_TOM);
    if(p==='/api/dashboard/bookings') return J(st.bookinger||[]);
    if(p==='/api/dashboard/ledige'){ const dato=u.searchParams.get('dato');
      return J(dato==='2026-11-27'?{dato,antall:5,vis_banner:true,stengt:false}:{dato,antall:0,vis_banner:false}); }
    if(p==='/api/dashboard/story/ledige-timer/data') return J({tjenester:2,har_ledige:true,apne_dager:4,tilgjengelige_dager:4,dager:[]});
    if(p==='/api/dashboard/loyalty') return J({enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    return J(/images|recent|services|hours|referrals|winback|customers|date-overrides/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#idagInnhold .idag-tom, #idagInnhold .idag-neste',{timeout:15000});
  await page.waitForFunction(()=>typeof _aktiveringKjent!=='undefined'&&_aktiveringKjent&&(_billingKjent||_billingFeilet),null,{timeout:15000});
  await page.evaluate(()=>document.fonts&&document.fonts.ready);
  await page.waitForTimeout(400);
  return {ctx,page,s};
}
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const browser=await chromium.launch();
const rapport=[]; let feil=0;
const sjekk=(ok,navn,detalj='')=>{ rapport.push({sjekk:navn,resultat:ok?'OK ✓':'✗ '+String(detalj).slice(0,160)}); if(!ok) feil++; };
const norm=t=>(t||'').replace(/[\s  ]+/g,' ').trim();

// Tilstanden på Oversikt: synlige barn av #oversikt i rekkefølge + seksjonsdetaljer.
const tilstand=page=>page.evaluate(()=>{
  const v=el=>!!el&&el.checkVisibility();
  const fb=document.getElementById('forsteBooking'), cs=getComputedStyle(fb);
  return {
    rekke:[...document.getElementById('oversikt').children].filter(v).map(e=>e.id||e.className),
    fb:v(fb), steg:v(document.getElementById('fbFull')), inne:v(document.getElementById('fbInne')),
    tekst:fb.innerText, kommende:v(document.getElementById('ovsKommende')), tall:v(document.getElementById('ovsTall')),
    story:v(document.getElementById('storyOpenOversikt'))||v(document.getElementById('storyLedigeLinje'))||v(document.getElementById('storyFullt')),
    hs:v(document.getElementById('hsKort')),
    ramme:[cs.borderTopWidth,cs.borderLeftWidth,cs.borderRightWidth,cs.backgroundColor,cs.borderTopLeftRadius].join(' '),
    kryss:document.querySelectorAll('#forsteBooking .fb-kryss, #forsteBooking [role=checkbox], #fbKrympet, #fbVis').length,
    sist:[...document.querySelectorAll('#oversikt > .ovs-sek')].filter(v).map(e=>e.classList.contains('ovs-sek-sist')),
    overflow:document.documentElement.scrollWidth-innerWidth,
  };
});
async function skudd(page,navn,bredde){
  const h=await page.evaluate(()=>document.documentElement.scrollHeight);
  await page.setViewportSize({width:bredde,height:h}); await page.waitForTimeout(150);
  await page.screenshot({path:path.join(OUT,`${navn}-${bredde}.png`),fullPage:true});
  await page.setViewportSize({width:bredde,height:900});
}
const TEKSTER=['Få din første booking','Siden din er klar. Tre ting som får kundene til å bruke den.',
  'Svar med lenka når noen spør om time',MELDING,'Kopier svar','Legg lenka i Instagram-bioen','Kopier lenke',
  'Del ledige timer på story','Lag story'];

// ── 1) Ny barber, 320/375/1280 (mobil med iPhone-UA, så hjemskjerm-kortet er en kandidat) ─────────────────
for(const bredde of [320,375,1280]){
  const {ctx,page,s}=await nySide(bredde,{akt:{har_bookingside_booking:false,har_booking:false}},{iphone:bredde<720});
  const t=await tilstand(page), k=`ny ${bredde}`;
  sjekk(t.fb&&t.steg&&!t.inne,`${k}: stegene vises`,JSON.stringify(t));
  sjekk(t.rekke.indexOf('forsteBooking')===t.rekke.indexOf('ovsIdag')+1,`${k}: rett under I DAG`,t.rekke.join(','));
  for(const x of TEKSTER) if(!norm(t.tekst).includes(x)) sjekk(false,`${k}: tekst «${x}»`,norm(t.tekst));
  sjekk(/1\s*Svar med lenka[\s\S]*2\s*Legg lenka[\s\S]*3\s*Del ledige/.test(t.tekst),`${k}: tre nummererte steg i rekkefølge`,norm(t.tekst));
  sjekk(!/\bkr\b|Vekst|Oppgrader|Ferdig|Vis stegene|Lenka er delt/.test(t.tekst),`${k}: ingen pris/Vekst/kryss-tekst`,norm(t.tekst));
  sjekk(t.kryss===0,`${k}: ingen kryss eller krympet visning`,t.kryss);
  sjekk(t.ramme==='0px 0px 0px rgba(0, 0, 0, 0) 0px',`${k}: rammefri (ingen kant/bakgrunn/radius)`,t.ramme);
  sjekk(!t.kommende,`${k}: Kommende skjult uten kommende bookinger`);
  sjekk(!t.tall,`${k}: Nøkkeltall skjult uten fullført booking`);
  sjekk(!t.story,`${k}: story-inngangen i I DAG skjult`);
  sjekk(!s.skriv.some(x=>/ledige\/vist/.test(x)),`${k}: skjult story-linje meldes ikke som vist`,s.skriv.join(','));
  sjekk(!t.hs,`${k}: hjemskjerm-kortet venter`);
  sjekk(t.sist.length&&t.sist.at(-1)&&t.sist.slice(0,-1).every(x=>!x),`${k}: bare siste synlige seksjon uten hårlinje`,JSON.stringify(t.sist));
  sjekk(t.overflow<=0,`${k}: ingen horisontal overflow`,t.overflow);
  sjekk(s.errs.length===0,`${k}: ingen pageerror`,s.errs.join(' | '));
  if(bredde===375){
    const m=await page.evaluate(()=>{const g=s=>getComputedStyle(document.querySelector(s));
      return {h:g('#forsteBooking .fb-h').fontSize+'/'+g('#forsteBooking .fb-h').fontWeight, t:g('.fb-tittel').fontSize+'/'+g('.fb-tittel').fontWeight,
        nr:g('.fb-nr').fontWeight, knapp:document.querySelector('.fb-knapp').getBoundingClientRect().height};});
    sjekk(m.h==='17px/600'&&m.t==='15px/600'&&m.nr==='600'&&m.knapp>=40,`${k}: tittel 17/600, steg 15/600, nr 600, knapp ≥ 40`,JSON.stringify(m));
  }
  await skudd(page,'oversikt-ny',bredde);
  await ctx.close();
}

// ── 2) Interaksjon: kopier + Lag story, ingen skriv ──────────────────────────────────────────────────
{ const {ctx,page,s}=await nySide(375,{akt:{har_bookingside_booking:false,har_booking:false}});
  const toast=()=>page.$eval('#toast',e=>e.textContent.trim());
  await page.click('[data-fb-handling="svarmelding"]'); await page.waitForTimeout(250);
  const c1=await page.evaluate(()=>navigator.clipboard.readText()), t1=await toast();
  sjekk(c1===MELDING&&t1==='Svar kopiert',`kopier svar → utklippstavla + «Svar kopiert»`,`${c1} | ${t1}`);
  sjekk(await page.$eval('[data-fb-handling="svarmelding"]',b=>b.textContent.trim())==='Kopier svar','knappeteksten står («Kopier svar»)');
  await page.click('[data-fb-handling="bio"]'); await page.waitForTimeout(250);
  const c2=await page.evaluate(()=>navigator.clipboard.readText()), t2=await toast();
  sjekk(c2===`https://trybarberhq.com/${SLUG}`&&t2==='Lenke kopiert',`kopier lenke → full lenke + «Lenke kopiert»`,`${c2} | ${t2}`);
  await page.click('[data-fb-handling="story"]'); await page.waitForTimeout(400);
  sjekk(await page.$eval('#storyOverlay',e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0),'«Lag story» åpner generatoren');
  sjekk(!s.skriv.some(x=>/aktivering/.test(x)),'ingen POST /aktivering/steg',s.skriv.join(','));
  sjekk(s.errs.length===0,'interaksjon: ingen pageerror',s.errs.join(' | '));
  await ctx.close();
}

// ── 3) Kildene: manuell booking, reserve, feil ──────────────────────────────────────────────────────
const KILDER=[
  {id:'manuell booking (bookingside=false, har_booking=true)', akt:{har_bookingside_booking:false,har_booking:true}, bookinger:MANUELL, fb:true, kommende:true},
  {id:'reserve: bare har_booking=false', akt:{har_booking:false,steg:{}}, fb:true},
  {id:'reserve: bare har_booking=true',  akt:{har_booking:true,steg:{}},  fb:false},
  {id:'bookingside=true',                akt:{har_bookingside_booking:true,har_booking:true}, fb:false},
  {id:'upublisert',  akt:{har_bookingside_booking:false,har_booking:false}, billing:billing({page_status:'forhandsvist'}), fb:false},
  {id:'500 fra /aktivering', akt:{status:500}, fb:false},
  {id:'mangler feltene', akt:{steg:{}}, fb:false},
];
for(const c of KILDER){
  const {ctx,page,s}=await nySide(375,{akt:c.akt,billing:c.billing,bookinger:c.bookinger});
  const t=await tilstand(page);
  sjekk(t.fb===c.fb&&(!c.fb||t.steg),`${c.id}: seksjonen ${c.fb?'vises':'skjult'}`,JSON.stringify({fb:t.fb,steg:t.steg,inne:t.inne}));
  sjekk(!t.inne,`${c.id}: ingen «Første booking er inne.» uten å ha sett stegene`);
  if(c.kommende!==undefined) sjekk(t.kommende===c.kommende,`${c.id}: Kommende ${c.kommende?'vises (alle kilder)':'skjult'}`);
  if(!c.fb) sjekk(t.story,`${c.id}: story-inngangen i I DAG står som før`);
  sjekk(s.errs.length===0,`${c.id}: ingen pageerror`,s.errs.join(' | '));
  await ctx.close();
}

// ── 4) Rett etter første booking ─────────────────────────────────────────────────────────────────────
for(const bredde of [320,375,1280]){
  const st={akt:{har_bookingside_booking:true,har_booking:true},bookinger:FORSTE};
  const {ctx,page,s}=await nySide(bredde,st,{iphone:bredde<720,init:{'bhq-fb-sett':'1'}});
  const t=await tilstand(page), k=`etter ${bredde}`;
  sjekk(t.fb&&t.inne&&!t.steg&&norm(t.tekst)==='Første booking er inne.',`${k}: stegene borte, «Første booking er inne.»`,JSON.stringify({fb:t.fb,inne:t.inne,steg:t.steg,tekst:t.tekst}));
  sjekk(t.rekke.indexOf('forsteBooking')===t.rekke.indexOf('ovsIdag')+1,`${k}: linja står der seksjonen sto`,t.rekke.join(','));
  const m=await page.evaluate(()=>{const p=document.getElementById('fbInne');return {farge:getComputedStyle(p).color,
    good:getComputedStyle(document.documentElement).getPropertyValue('--good').trim(),hake:!!p.querySelector('use[href$="#hake"]')};});
  sjekk(m.hake,`${k}: hake-ikon`);
  sjekk(t.kommende,`${k}: Kommende viser bookingen`);
  sjekk(!t.tall,`${k}: Nøkkeltall fortsatt skjult (ingen fullført booking)`);
  sjekk(t.story,`${k}: story-inngangen i I DAG er tilbake`);
  if(bredde<720) sjekk(t.hs,`${k}: hjemskjerm-kortet vises nå`);
  sjekk(t.overflow<=0&&s.errs.length===0,`${k}: ingen overflow / pageerror`,t.overflow+' '+s.errs.join(' | '));
  if(bredde===375) sjekk(/rgb\(62, 207, 126\)/.test(m.farge),`${k}: grønn linje (--good)`,m.farge+' '+m.good);
  await skudd(page,'oversikt-etter',bredde);
  if(bredde===375){
    const lagret=await page.evaluate(()=>localStorage.getItem('bhq-fb-inne-vist'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('#idagInnhold .idag-tom, #idagInnhold .idag-neste'); await page.waitForTimeout(500);
    const t2=await tilstand(page);
    sjekk(lagret==='1'&&!t2.fb,`${k}: reload → linja er borte (vist én gang)`,JSON.stringify({lagret,fb:t2.fb}));
  }
  await ctx.close();
}
{ // fullført booking → Nøkkeltall tilbake
  const {ctx,page}=await nySide(375,{akt:{har_bookingside_booking:true,har_booking:true},stats:STATS_MED,bookinger:FORSTE});
  const t=await tilstand(page);
  sjekk(t.tall&&t.sist.at(-1)===true,'fullført booking: Nøkkeltall vises (siste seksjon)',JSON.stringify(t.sist));
  await ctx.close();
}

// ── 5) Vekst-fanen ───────────────────────────────────────────────────────────────────────────────────
const vekst=page=>page.evaluate(()=>{
  const v=el=>!!el&&el.checkVisibility();
  const ids=['vekstStats','vekstTrendH','trendSub','trend','vkDelH','vkAutoH','vkPersH'];
  const y=id=>{const e=document.getElementById(id);return v(e)?Math.round(e.getBoundingClientRect().top+scrollY):null;};
  const synlige=ids.filter(id=>v(document.getElementById(id)));
  return {synlige, rekke:synlige.slice().sort((a,b)=>y(a)-y(b)), tekst:document.getElementById('vekst').innerText,
    delEtterTrend:(()=>{const t=document.getElementById('trend'),d=document.getElementById('vkDelH').closest('.vk-sek');
      let n=t.nextElementSibling; while(n&&!v(n)) n=n.nextElementSibling; return n===d;})(),
    overflow:document.documentElement.scrollWidth-innerWidth};
});
for(const [navn,stats,bill] of [['vekst-uten',STATS_TOM,billing()],['vekst-med',STATS_MED,VEKST]]) for(const bredde of [320,375,1280]){
  const {ctx,page,s}=await nySide(bredde,{akt:{har_bookingside_booking:false,har_booking:false},stats,billing:bill});
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(600);
  const t=await vekst(page), k=`${navn} ${bredde}`;
  if(navn==='vekst-uten'){
    sjekk(JSON.stringify(t.rekke)===JSON.stringify(['vkDelH','vkAutoH','vkPersH']),`${k}: Lag story → Automatikk → Personlig, ingen tall/diagram`,t.rekke.join(','));
    sjekk(!/Her ser du kundene dine/.test(t.tekst),`${k}: tom-teksten er borte`);
  }else{
    sjekk(JSON.stringify(t.rekke)===JSON.stringify(['vekstStats','vekstTrendH','trendSub','trend','vkDelH','vkAutoH','vkPersH']),`${k}: tall → diagram → Lag story → Automatikk`,t.rekke.join(','));
    sjekk(t.delEtterTrend,`${k}: «Lag story» rett under diagrammet`);
  }
  sjekk(t.overflow<=0&&s.errs.length===0,`${k}: ingen overflow / pageerror`,t.overflow+' '+s.errs.join(' | '));
  await skudd(page,navn,bredde);
  await ctx.close();
}

await browser.close(); server.close();
sjekk(prodSluppet===0,'ingen request forbi mocken (prod)',prodSluppet);
console.table(rapport);
console.log(feil?`✗ ${feil} avvik`:'OK ✓ — alle sjekker grønne'); console.log('Skjermbilder:',OUT);
if(feil) process.exitCode=1;
