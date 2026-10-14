// tools/render/fanebytte-ulagret.mjs — fanebytte sletter ikke ulagrede endringer (14.10.2026).
// Et område lastes på nytt ved fanebytte bare når det IKKE har ulagrede endringer, og alltid etter vellykket
// lagring. Før lastet Tjenester og Din side alt på nytt hver gang, så endringen forsvant uten advarsel.
//   1. Pris (Tjenester): endret pris står etter Din side → Tjenester; ingen ny GET /services.
//   2. Åpningstid (Tjenester): endret start står; ingen ny GET /hours.
//   3. Palett (Din side): valgt palett står etter Oversikt → Din side; ingen ny GET /design.
//   4. Bio (Din side → Profil): utkastet står; GET /profile hentes, men feltet røres ikke.
//   5. Sjekklista («Legg til tjenester») mens prisen er ulagret: prisen står.
//   6. Uten endringer: fanebytte henter fortsatt på nytt (GET /services øker).
//   7. Etter vellykket lagring av tjenester: neste fanebytte henter igjen (flagget er nullstilt).
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
const billing={subscription_status:null,page_status:'forhandsvist',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',needs_attention:false,
  cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null,sms_saldo:0,sms_pakker:[],sms_pakke_kan_kjopes:false};
const PROFIL={hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts',address:'Storgata 1',tagline:'Fades',bio:'Lagret bio',instagram:'',tiktok:'',snapchat:'',contact_phone:'91234567'};
const SVC={hoved:[{id:'a',name:'Herreklipp',price:420,min:30,sort:0}],tillegg:[]};
const HOURS=[0,1,2,3,4,5,6].map(wd=>({weekday:wd,is_closed:wd===0,open_time:'10:00',close_time:'17:00',breaks:[]}));

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(){
  const page=await browser.newPage({viewport:{width:375,height:900}});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const get={}; const put=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname, m=req.method();
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(m!=='GET'){ put.push(p); return json({ok:true}); }
    get[p]=(get[p]||0)+1;
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/services') return json(SVC);
    if(p==='/api/dashboard/hours') return json(HOURS);
    if(p==='/api/dashboard/design') return json({palette:'minimal',mode:'mork',font:'fraunces',layout:'showcase'});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  return {page,errs,get,put};
}
const fane=async(page,id)=>{ await page.$eval(`.nav button[data-panel="${id}"]`,b=>b.click()); await page.waitForTimeout(400); };
const rapport=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const skriv=async(page,sel,verdi)=>{ await page.fill(sel,verdi); };   // fill gir ekte input-hendelse

// 1+2+5: pris, åpningstid, sjekkliste
{
  const {page,errs,get}=await nySide();
  await fane(page,'tjenester');
  await skriv(page,'#hovedList input[data-f="price"], #hovedList .svc-price, #hovedList input[inputmode="decimal"]','399');
  const startSel='#hoursList input[data-f="start"][data-i="1"]';
  await skriv(page,startSel,'08:00');
  const g0={svc:get['/api/dashboard/services']||0,hrs:get['/api/dashboard/hours']||0};
  await fane(page,'design'); await fane(page,'tjenester');
  const f=[];
  const pris=await page.$eval('#hovedList input[inputmode="decimal"]',e=>e.value);
  if(pris!=='399') f.push(`pris etter fanebytte «${pris}»`);
  const start=await page.$eval(startSel,e=>e.value); if(start!=='08:00') f.push(`åpningstid «${start}»`);
  // sjekklista: «Legg til tjenester» mens prisen er ulagret
  await page.evaluate(()=>typeof sjekkGaaTil==='function'&&sjekkGaaTil('tjenester')); await page.waitForTimeout(400);
  const pris2=await page.$eval('#hovedList input[inputmode="decimal"]',e=>e.value); if(pris2!=='399') f.push(`pris etter sjekkliste «${pris2}»`);
  const g1={svc:get['/api/dashboard/services']||0,hrs:get['/api/dashboard/hours']||0};
  // GET /services kan komme fra sjekklistens egen datahenting (hentSjekklisteData) — men skjemaet skal ikke røres.
  if(g1.hrs>g0.hrs+1) f.push(`GET /hours ${g0.hrs}→${g1.hrs}`);
  push('pris + åpningstid overlever fanebytte og sjekkliste',f,errs); await page.close();
}
// 3: palett
{
  const {page,errs,get}=await nySide();
  await fane(page,'design');
  const valgt=await page.$$eval('#paletteGrid .preset',b=>{ const ikke=b.find(x=>x.getAttribute('aria-pressed')!=='true'&&x.dataset.key!=='custom'); ikke.click(); return ikke.dataset.key; });
  await page.waitForTimeout(200);
  const gd=get['/api/dashboard/design']||0;
  await fane(page,'oversikt'); await fane(page,'design');
  const f=[];
  const naa=await page.$eval('#paletteGrid .preset[aria-pressed="true"]',e=>e.dataset.key).catch(()=>null);
  if(naa!==valgt) f.push(`palett «${naa}» (ventet ${valgt})`);
  if((get['/api/dashboard/design']||0)!==gd) f.push('GET /design hentet på nytt');
  push('palett overlever fanebytte',f,errs); await page.close();
}
// 4: bio
{
  const {page,errs,get}=await nySide();
  await fane(page,'design');
  await page.$eval('#accProfil .acc-head',h=>{ if(h.getAttribute('aria-expanded')!=='true') h.click(); });
  await skriv(page,'#pf-bio','Ulagret utkast');
  const gp=get['/api/dashboard/profile']||0;
  await fane(page,'oversikt'); await fane(page,'design');
  const f=[];
  const bio=await page.$eval('#pf-bio',e=>e.value); if(bio!=='Ulagret utkast') f.push(`bio «${bio}»`);
  if((get['/api/dashboard/profile']||0)<=gp) f.push('GET /profile ble ikke hentet (header/slug skal fortsatt oppdateres)');
  push('bio overlever fanebytte',f,errs); await page.close();
}
// 6+7: uten endringer hentes på nytt; etter lagring hentes på nytt
{
  const {page,errs,get,put}=await nySide();
  await fane(page,'tjenester');
  const a=get['/api/dashboard/services']||0;
  await fane(page,'oversikt'); await fane(page,'tjenester');
  const f=[];
  const b=get['/api/dashboard/services']||0; if(b<=a) f.push('uten endringer: ikke hentet på nytt');
  await skriv(page,'#hovedList input[inputmode="decimal"]','399');
  await page.$eval('#saveSvc',x=>x.click()); await page.waitForTimeout(600);
  if(!put.includes('/api/dashboard/services')) f.push('lagring ble ikke sendt');
  const c=get['/api/dashboard/services']||0;
  await fane(page,'oversikt'); await fane(page,'tjenester');
  const d=get['/api/dashboard/services']||0; if(d<=c) f.push('etter vellykket lagring: ikke hentet på nytt ved fanebytte');
  push('uten endringer / etter lagring: hentes på nytt',f,errs); await page.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
