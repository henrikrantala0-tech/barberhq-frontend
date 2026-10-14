// tools/render/publiser-feil.mjs — publiseringsfeil vises der knappen ble trykket (14.10.2026).
// Før skrev både fokusmodusens «Publiser siden» og sjekklistens rad feilen til #pubErr i Konto-fanen:
// en 400 («Sett en pris …») ved FØRSTE publisering etter onboarding ga ingen synlig beskjed.
//   1. Fokusmodus (?velkommen=1, forhandsvist): 400 → #fokusPubErr over knappene med teksten + «Gå til
//      Tjenester & tider»; lenka avslutter fokus og åpner Tjenester. Nettverksfeil → kontaktteksten.
//   2. Sjekklista (pill → popover): 400 → popoveren står åpen, #sjekkPubErr i panelet med teksten.
//   3. Ingen av dem skriver til den skjulte #pubErr.
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/publiser-feil');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const billing={subscription_status:null,page_status:'forhandsvist',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',needs_attention:false,
  cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null,sms_saldo:0,sms_pakker:[],sms_pakke_kan_kjopes:false};
const FEIL='Sett en pris på alle tjenestene før du publiserer';

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(bredde,{svar=400,url='/no/dashboard.html'}={}){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[], dialoger=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>{ dialoger.push(d.message()); d.dismiss(); });
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname, m=req.method();
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/page-status'&&m==='PUT'){ if(svar==='nett') return route.abort('failed'); return json({error:FEIL},svar); }
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts'});
    if(p==='/api/dashboard/services') return json({hoved:[{id:'a',name:'Herreklipp',price:0,min:30,sort:0}],tillegg:[]});
    if(p==='/api/dashboard/hours') return json([{weekday:1,is_closed:false,open_time:'09:00',close_time:'17:00'}]);
    if(p==='/api/dashboard/aktivering') return json({har_booking:false,steg:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}${url}`,{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  return {page,errs,dialoger};
}
const synligTekst=(page,sel)=>page.$eval(sel,e=>(e.offsetParent!==null&&getComputedStyle(e).display!=='none')?e.innerText.trim().replace(/\s*\n\s*/g,' | '):'—').catch(()=>'—');
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const bilde=async(page,navn)=>{ const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };

for(const w of [320,375]){
  // 1. Fokusmodus
  {
    const {page,errs,dialoger}=await nySide(w,{url:'/no/dashboard.html?velkommen=1#dinside'});
    const f=[];
    if(!(await page.evaluate(()=>document.body.classList.contains('fokus')))) f.push('ikke i fokusmodus');
    await page.$eval('#fokusPubliser',b=>b.click()); await page.waitForTimeout(700);
    const t=await synligTekst(page,'#fokusPubErr');
    if(t!==FEIL+' | Gå til Tjenester & tider') f.push(`#fokusPubErr «${t}»`);
    if(await synligTekst(page,'#pubErr')!=='—') f.push('skrev også til #pubErr');
    if(dialoger.length) f.push('alert');
    await page.$eval('#fokusPubErr',e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
    await bilde(page,`fokus-${w}`);
    await page.$eval('#fokusPubErr [data-pub-act]',b=>b.click()); await page.waitForTimeout(400);
    if(await page.evaluate(()=>document.body.classList.contains('fokus'))) f.push('fokus ikke avsluttet');
    if(!(await page.$eval('#tjenester',e=>e.offsetParent!==null))) f.push('Tjenester ikke åpnet');
    push(`${w} fokusmodus 400`,f,errs); await page.close();
  }
  // 2. Sjekklista
  {
    const {page,errs,dialoger}=await nySide(w);
    const f=[];
    if(!(await page.$eval('#sjekkPill',e=>!e.hidden))) f.push('pill ikke synlig');
    await page.$eval('#sjekkPillBtn',b=>b.click()); await page.waitForTimeout(250);
    await page.$eval('#sjekkPopover .sjekk-rad[data-act="publiser"]',b=>b.click()); await page.waitForTimeout(700);
    if(await page.$eval('#sjekkPopover',e=>e.hidden)) f.push('popoveren lukket');
    const t=await synligTekst(page,'#sjekkPubErr');
    if(!t.startsWith(FEIL)) f.push(`#sjekkPubErr «${t}»`);
    if(await synligTekst(page,'#pubErr')!=='—') f.push('skrev også til #pubErr');
    if(dialoger.length) f.push('alert');
    await bilde(page,`sjekkliste-${w}`);
    push(`${w} sjekkliste 400`,f,errs); await page.close();
  }
}
// 3. Nettverksfeil i fokusmodus
{
  const {page,errs}=await nySide(375,{svar:'nett',url:'/no/dashboard.html?velkommen=1#dinside'});
  await page.$eval('#fokusPubliser',b=>b.click()); await page.waitForTimeout(700);
  const f=[]; const t=await synligTekst(page,'#fokusPubErr');
  if(t!=='Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.') f.push(`#fokusPubErr «${t}»`);
  if(await page.$eval('#fokusPubliser',b=>b.disabled||b.textContent.trim()!=='Publiser siden')) f.push('knappen ikke tilbake');
  push('fokusmodus nettverksfeil',f,errs.filter(e=>!/Failed to fetch/.test(e))); await page.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
