// tools/render/hentefeil-lagring.mjs — feilet henting skal aldri kunne overskrive ekte data (14.10.2026).
//   • GET /services feiler (500 / nettverksfeil): «Klarte ikke å laste tjenestene.» + «Prøv igjen», «Lagre
//     tjenester» og «+ Legg til» av, INGEN PUT /services selv ved tvunget klikk, ingen demotjenester
//     (Skinnfade/Klipp/Skjegg/Hårvask) noe sted. «Prøv igjen» → ekte tjenester, lagring sender dem.
//   • GET /settings feiler: «Klarte ikke å laste betalingsmetodene.», «Lagre betaling» av, INGEN PUT
//     /payment-methods (før: {methods:[]} slettet Vipps/Kort). «Prøv igjen» → Vipps/Kort, lagring sender dem.
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/hentefeil-lagring');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const billing={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',needs_attention:false,
  cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null,sms_saldo:0,sms_pakker:[],sms_pakke_kan_kjopes:false};
const EKTE_SVC={hoved:[{id:'a',name:'Herreklipp',price:420,min:30,sort:0}],tillegg:[{id:'b',name:'Skjeggtrim',price:150,min:0,sort:1}]};

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
// st: {svc:'ok'|500|'nett', settings:'ok'|500}
async function nySide(bredde,st){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const put=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname, m=req.method();
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(m==='PUT'){ put.push({p,body:req.postData()}); return json({ok:true}); }
    if(p==='/api/dashboard/services'){ if(st.svc==='nett') return route.abort('failed'); return st.svc==='ok'?json(EKTE_SVC):json({error:'x'},500); }
    if(p==='/api/dashboard/settings') return st.settings==='ok'?json({payment_methods:['Vipps','Kort'],sms_paaminnelse_enabled:false,sms_rebooking_enabled:false,rebooking_interval_days:35}):json({error:'x'},500);
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts'});
    if(p==='/api/dashboard/hours') return json([{day:1,open:'09:00',close:'17:00'}]);
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="tjenester"]',b=>b.click()); await page.waitForTimeout(600);
  return {page,errs,put};
}
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const bilde=async(page,navn,sel)=>{ await page.$eval(sel,e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(250);
  const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };
const demo=page=>page.evaluate(()=>/Skinnfade|Hårvask/.test(document.body.innerText)||[...document.querySelectorAll('input')].some(i=>/Skinnfade|Hårvask/.test(i.value)));

for(const w of [320,375]){
  for(const feil of [500,'nett']){
    if(w===320&&feil==='nett') continue;
    const st={svc:feil,settings:'ok'};
    const {page,errs,put}=await nySide(w,st);
    const f=[];
    const t=await page.$eval('#hovedList',e=>e.innerText.trim()); if(!t.startsWith('Klarte ikke å laste tjenestene.')) f.push(`liste «${t.slice(0,60)}»`);
    for(const id of ['saveSvc','addHoved','addTillegg']) if(!(await page.$eval('#'+id,b=>b.disabled))) f.push(`#${id} ikke av`);
    if(await demo(page)) f.push('demotjenester synlige');
    await page.$eval('#saveSvc',b=>b.dispatchEvent(new MouseEvent('click',{bubbles:true}))); await page.waitForTimeout(400);
    if(put.some(x=>x.p==='/api/dashboard/services')) f.push('PUT /services sendt');
    if(feil===500) await bilde(page,`tjenester-feil-${w}`,'#hovedList');
    // Prøv igjen → ekte tjenester, lagring sender dem
    st.svc='ok'; await page.$eval('#hovedList .retry-lenke',b=>b.click()); await page.waitForTimeout(500);
    if(await page.$eval('#saveSvc',b=>b.disabled)) f.push('lagre fortsatt av etter vellykket henting');
    await page.$eval('#saveSvc',b=>b.click()); await page.waitForTimeout(500);
    const sendt=put.find(x=>x.p==='/api/dashboard/services');
    if(!sendt||!/Herreklipp/.test(sendt.body)||/Skinnfade/.test(sendt.body)) f.push(`lagret ${sendt?sendt.body.slice(0,80):'ingenting'}`);
    push(`${w} /services ${feil}`,f,errs.filter(e=>!/Failed to fetch/.test(e))); await page.close();
  }
  // Betalingsmetoder
  {
    const st={svc:'ok',settings:500};
    const {page,errs,put}=await nySide(w,st);
    const f=[];
    const t=await page.$eval('#payList',e=>e.innerText.trim()); if(!t.startsWith('Klarte ikke å laste betalingsmetodene.')) f.push(`liste «${t.slice(0,60)}»`);
    for(const id of ['savePay','addPay']) if(!(await page.$eval('#'+id,b=>b.disabled))) f.push(`#${id} ikke av`);
    await page.$eval('#savePay',b=>b.dispatchEvent(new MouseEvent('click',{bubbles:true}))); await page.waitForTimeout(400);
    if(put.some(x=>x.p==='/api/dashboard/payment-methods')) f.push('PUT /payment-methods sendt (ville slettet Vipps/Kort)');
    await bilde(page,`betaling-feil-${w}`,'#payList');
    st.settings='ok'; await page.$eval('#payList .retry-lenke',b=>b.click()); await page.waitForTimeout(500);
    const verdier=await page.$$eval('#payList input',i=>i.map(x=>x.value)); if(verdier.join()!=='Vipps,Kort') f.push(`etter retry ${verdier.join()}`);
    await page.$eval('#savePay',b=>b.click()); await page.waitForTimeout(500);
    const sendt=put.find(x=>x.p==='/api/dashboard/payment-methods');
    if(!sendt||sendt.body!=='{"methods":["Vipps","Kort"]}') f.push(`lagret ${sendt?sendt.body:'ingenting'}`);
    push(`${w} /settings 500 → betaling`,f,errs); await page.close();
  }
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
