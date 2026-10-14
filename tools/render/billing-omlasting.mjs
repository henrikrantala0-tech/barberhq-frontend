// tools/render/billing-omlasting.mjs — settBilling laster skjoldede flater og Vekst-lister på nytt KUN når
// planen endres (eller forrige billing-lasting feilet). Ikke-visuell: teller kall.
//   1. Klikk på påminnelse-bryteren (Vekst-fanen åpen, Vekst-plan): billing hentes på nytt (1 kall), men
//      ingen /attribution, /momentum, /winback, /referrals, /loyalty.
//   2. Planskifte (Gratis → Vekst ved neste loadBilling): listene lastes.
//   3. Feilet billing → «Prøv igjen» med samme plan: listene lastes (står ellers på «Laster …»).
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const PAKKER=[{antall:100,pris_kr:129,per_sms_kr:1.29},{antall:250,pris_kr:279,per_sms_kr:1.12},{antall:500,pris_kr:495,per_sms_kr:0.99}];
const base=()=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis', effective_plan_grunn:'gratis',
  trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null, needs_attention:false, attention_grunn:null,
  plakater_doede:false, cancel_at_period_end:false, current_period_end:null, sms_saldo:7, sms_paaminnelser_sendes:true,
  sms_pakker:PAKKER, sms_pakke_kan_kjopes:true, sms_tilbud_avvist_at:null });
const gratis=()=>base();
const vekst=()=>({...base(), subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription', sms_pakke_kan_kjopes:false});
const LISTER=['/api/dashboard/attribution','/api/dashboard/momentum','/api/dashboard/winback','/api/dashboard/referrals','/api/dashboard/loyalty'];

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(st){
  const page=await browser.newPage({viewport:{width:375,height:900}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const teller={}; let paa=true;
  page.on('request',q=>{ const u=new URL(q.url()); if(u.hostname==='api.trybarberhq.com'){ prodForsok++; teller[u.pathname]=(teller[u.pathname]||0)+1; } });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), p=new URL(req.url()).pathname;
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status') return st.billingFeil ? json({},500) : json(st.billing());
    if(p==='/api/dashboard/settings'&&req.method()==='GET') return json({sms_paaminnelse_enabled:paa,sms_rebooking_enabled:false,rebooking_interval_days:35});
    if(p==='/api/dashboard/settings'&&req.method()==='PUT'){ const b=JSON.parse(req.postData()); if('sms_paaminnelse_enabled' in b) paa=b.sms_paaminnelse_enabled; return json({ok:true}); }
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    if(p==='/api/dashboard/attribution') return json({paaVei:{},hentetInn:{},total:{count:0,revenue:0}});
    if(p==='/api/dashboard/loyalty') return json({enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    return json(/images|recent|services|hours|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="vekst"]',b=>b.click());
  await page.waitForTimeout(800);
  const snap=()=>Object.fromEntries([...LISTER,'/api/dashboard/billing/status'].map(k=>[k,teller[k]||0]));
  return {page,errs,snap};
}
const diff=(a,b)=>Object.fromEntries(Object.keys(b).map(k=>[k,b[k]-a[k]]));
const rapport=[]; const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const lister=d=>LISTER.reduce((s,k)=>s+d[k],0);

// 1. Bryter-klikk, samme plan
{
  const st={billing:vekst}; const {page,errs,snap}=await nySide(st);
  const før=snap();
  await page.click('#accPaam .sw .sl'); await page.waitForTimeout(1000);
  const d=diff(før,snap()); const f=[];
  if(d['/api/dashboard/billing/status']!==1) f.push(`billing ${d['/api/dashboard/billing/status']}`);
  if(lister(d)!==0) f.push('lister lastet: '+JSON.stringify(Object.fromEntries(LISTER.filter(k=>d[k]).map(k=>[k.split('/').pop(),d[k]]))));
  if(await page.$eval('#tog-paam',e=>e.checked)) f.push('bryteren står fortsatt på');
  push('bryter-klikk: ingen listeomlasting',f,errs); await page.close();
}
// 2. Planskifte
{
  const st={billing:gratis}; const {page,errs,snap}=await nySide(st);
  const før=snap();
  st.billing=vekst;
  await page.evaluate(()=>loadBilling()); await page.waitForTimeout(1000);
  const d=diff(før,snap()); const f=[];
  for(const k of ['/api/dashboard/attribution','/api/dashboard/winback','/api/dashboard/referrals','/api/dashboard/loyalty']) if(!d[k]) f.push(`${k.split('/').pop()} ikke lastet`);
  push('planskifte Gratis→Vekst: lister lastes',f,errs); await page.close();
}
// 3. Feil → «Prøv igjen», samme plan
{
  const st={billing:vekst}; const {page,errs,snap}=await nySide(st);
  st.billingFeil=true; await page.evaluate(()=>loadBilling()); await page.waitForTimeout(500);
  const før=snap();
  st.billingFeil=false; await page.evaluate(()=>loadBilling()); await page.waitForTimeout(1000);
  const d=diff(før,snap()); const f=[];
  if(!d['/api/dashboard/winback']) f.push('winback ikke lastet etter feil');
  push('feil → ny lasting, samme plan: lister lastes',f,errs); await page.close();
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
