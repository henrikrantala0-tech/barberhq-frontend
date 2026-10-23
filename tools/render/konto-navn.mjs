// tools/render/konto-navn.mjs — «Lagre navn» i Konto endrer KUN navnet (14.10.2026).
// PUT /profile skriver alle fem feltene (backend full erstatning), så hver lagring sender sine egne felt + de sist
// LAGREDE verdiene for resten — aldri ulagret tekst fra en annen fane.
//   1. «Lagre navn» → ÉN PUT /profile med nytt navn og de LAGREDE verdiene for resten (fra GET /profile); ingen /settings.
//      Raden lukkes, Navn-verdien viser det nye navnet.
//   2. PUT /profile 400 → backendens melding i #navnErr i Konto; raden står åpen; fanen er fortsatt Konto.
//   3. Nettverksfeil → «Fikk ikke kontakt med serveren …» i #navnErr; knappen tilbake.
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/konto-navn');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const billing={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',needs_attention:false,cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null};
const PROFIL={hasPassword:true,name:'Sander Saxe',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts',address:'Storgata 1',tagline:'Fades',bio:'Lagret bio',instagram:'',tiktok:'',snapchat:'',contact_phone:'4545'};

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(bredde,profilSvar='ok'){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[], dialoger=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>{ dialoger.push(d.message()); d.dismiss(); });
  const logg=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname, m=req.method();
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(m==='PUT'&&p==='/api/dashboard/settings'){ logg.push({kall:'settings'}); return json({ok:true}); }
    if(m==='PUT'&&p==='/api/dashboard/profile'){ logg.push({kall:'profile',body:JSON.parse(req.postData()||'{}')});
      if(profilSvar==='nett') return route.abort('failed');
      if(profilSvar===400) return json({error:'Navnet er for langt (maks 100 tegn).',felt:'name'},400);
      return json({ok:true}); }
    if(m!=='GET') return json({},500);
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/aktivering') return json({har_booking:true,steg:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  return {page,errs,dialoger,logg};
}
const aapneNavn=async page=>{ await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(200);
  await page.$eval('[data-endre="radNavn"]',b=>b.click()); await page.waitForTimeout(150); };
const navnErr=page=>page.$eval('#navnErr',e=>(!e.hidden&&e.offsetParent!==null)?e.textContent:null);
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});

// 1. «Lagre navn» sender bare navnet + lagrede verdier
{
  const {page,errs,dialoger,logg}=await nySide(375);
  await aapneNavn(page); await page.fill('#pf-name','Nytt Navn');
  await page.$eval('#saveNavn',b=>b.click()); await page.waitForTimeout(500);
  const f=[];
  if(logg.map(x=>x.kall).join()!=='profile') f.push(`kall: ${logg.map(x=>x.kall).join()}`);
  const b=(logg[0]||{}).body||{};
  if(b.name!=='Nytt Navn') f.push(`name ${b.name}`);
  if(b.bio!=='Lagret bio') f.push(`bio sendt «${b.bio}»`);
  if(b.shop!=='Saxe Cuts'||b.address!=='Storgata 1'||b.tagline!=='Fades') f.push(`andre felt ${JSON.stringify(b)}`);
  if(!(await page.$eval('#radNavnRed',e=>e.hidden))) f.push('raden ikke lukket');
  if(await page.$eval('#navnVerdi',e=>e.textContent.trim())!=='Nytt Navn') f.push('Navn-verdien ikke oppdatert');
  if(dialoger.length) f.push(`alert ${dialoger.join()}`);
  push('«Lagre navn»: nytt navn + lagrede verdier',f,errs); await page.close();
}
// 2–3. Feil vises i Konto
for(const w of [320,375]) for(const [id,svar,vent] of [['400',400,'Navnet er for langt (maks 100 tegn).'],['nett','nett','Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.']]){
  if(w===320&&id==='nett') continue;
  const {page,errs,dialoger}=await nySide(w,svar);
  await aapneNavn(page); await page.fill('#pf-name','Nytt Navn');
  await page.$eval('#saveNavn',b=>b.click()); await page.waitForTimeout(600);
  const f=[];
  const t=await navnErr(page); if(t!==vent) f.push(`#navnErr «${t}»`);
  if(await page.$eval('#radNavnRed',e=>e.hidden)) f.push('raden lukket');
  if(!(await page.$eval('#abonnement',e=>e.offsetParent!==null))) f.push('ikke lenger i Konto');
  if(await page.$eval('#saveNavn',b=>b.disabled||b.textContent.trim()!=='Lagre')) f.push('knappen ikke tilbake');
  if(dialoger.length) f.push(`alert ${dialoger.join()}`);
  if(id==='400'){ await page.$eval('#radNavnRed',e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
    const fil=path.join(OUT,`navn-feil-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil); }
  // Avbryt fjerner feilen
  await page.$eval('[data-avbryt="radNavn"]',b=>b.click()); await page.waitForTimeout(100);
  if(await page.$eval('#navnErr',e=>!e.hidden)) f.push('feilen står etter Avbryt');
  push(`${w} «Lagre navn» ${id} → feil i Konto`,f,errs.filter(e=>!/Failed to fetch/.test(e))); await page.close();
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
