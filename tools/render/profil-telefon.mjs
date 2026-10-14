// Profil-lagring med telefon — /settings FØRST, /profile bare hvis den gikk gjennom.
//
// Verifiserer i Microsoft Edge (channel 'msedge'), API mocket, ingen request mot prod:
//   • ugyldig telefon (400 fra /settings) → INGEN PUT /profile, serverens tekst inline under Telefon
//     (rød .fld-err, aria-invalid, fokus i feltet), ingen «Lagret», ingen alert; feilen forsvinner når man skriver
//   • gyldig telefon → PUT /settings, så PUT /profile (rekkefølge), «Lagret» vises
//   • /settings 500 → ingen PUT /profile, alert med feilen
//   • /settings OK + /profile 500 eller nettverksfeil → alert «Telefon og lenker er lagret, men navn og bio …»
//   • Konto → «Lagre navn»: bare /profile (ingen /settings) — ugyldig telefon stopper den ikke;
//     gyldig → begge kall
// Skjermbilder av feilen under Telefon: 320 og 375, lys og mørk.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = process.env.OUT || path.resolve(import.meta.dirname, '../../.render-ut/profil-telefon');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const UGYLDIG='Telefonnummeret er ikke gyldig. Sjekk at du har skrevet alle sifrene.';   // backend src/lib/phone.js
const DELVIS='Telefon og lenker er lagret, men navn og bio ble ikke lagret. Prøv igjen.';
const billing={ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis', effective_plan_grunn:'gratis',
  trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null, needs_attention:false, attention_grunn:null,
  cancel_at_period_end:false, current_period_end:null };

let prodSluppet=0, prodAvbrutt=0;
// svar: { settings: 'ok'|'ugyldig'|500, profile: 'ok'|500|'nett' }, telefon: forhåndsutfylt contact_phone
async function stubApi(page,svar,telefon){
  const logg=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodSluppet++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodAvbrutt++; return r.abort(); });
  await page.route('**/api/**',route=>{
    const req=route.request(); const p=new URL(req.url()).pathname; const m=req.method();
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodAvbrutt++;
    const json=(o,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
    if(m==='PUT'&&p==='/api/dashboard/settings'){ logg.push({kall:'settings',body:JSON.parse(req.postData()||'{}')});
      if(svar.settings==='ugyldig') return json({error:UGYLDIG},400);
      if(svar.settings===500) return json({error:'Kunne ikke lagre innstillingene.'},500);
      return json({ok:true}); }
    if(m==='PUT'&&p==='/api/dashboard/profile'){ logg.push({kall:'profile'});
      if(svar.profile===500) return json({error:'kunne ikke lagre profil'},500);
      if(svar.profile==='nett') return route.abort();
      return json({ok:true}); }
    if(m!=='GET') return json({},500);
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/aktivering') return json({har_booking:true,steg:{}});
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts',
      address:'Storgata 1',tagline:'',bio:'Bio',instagram:'saxecuts',tiktok:'',snapchat:'',contact_phone:telefon});
    if(p==='/api/dashboard/loyalty') return json({enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
  return logg;
}

const browser=await chromium.launch({channel:'msedge'});
async function nySide({bredde=375,tema='light',svar,telefon='91234567'}){
  const ctx=await browser.newContext({viewport:{width:bredde,height:900},deviceScaleFactor:2,colorScheme:tema});
  const page=await ctx.newPage();
  await page.addInitScript(t=>{ try{ localStorage.setItem('bhq-theme',t); }catch(e){} },tema);
  const errs=[], dialoger=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog',d=>{ dialoger.push(d.message()); d.dismiss(); });
  const logg=await stubApi(page,svar,telefon);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  return {ctx,page,errs,dialoger,logg};
}
async function aapneProfil(page){
  await page.$eval('button[data-panel="design"]',b=>b.click());
  await page.waitForTimeout(200);
  await page.$eval('#accProfil .acc-head',h=>{ if(h.getAttribute('aria-expanded')!=='true') h.click(); });
  await page.waitForTimeout(300);
}
const feilTekst=page=>page.$eval('#phoneErr',e=>(!e.hidden&&e.offsetParent!==null)?e.textContent:null).catch(()=>null);
const lagretSynlig=sel=>page=>page.$eval(sel,e=>e.offsetParent!==null&&getComputedStyle(e).opacity!=='0'&&!e.hidden).catch(()=>false);
const rapport=[]; const push=(n,f,errs=[])=>rapport.push({sjekk:n,resultat:(f.length||errs.length)?'✗ '+[...f,...errs.map(e=>'JS: '+e)].join(' | '):'OK ✓'});

// ── Ugyldig telefon (Profil) + skjermbilder ───────────────────────────────────────────────
for(const bredde of [320,375]) for(const tema of ['light','dark']){
  const {ctx,page,errs,dialoger,logg}=await nySide({bredde,tema,svar:{settings:'ugyldig',profile:'ok'}});
  const f=[];
  await aapneProfil(page);
  await page.fill('#pf-phone','4545');
  await page.click('#saveProfil'); await page.waitForTimeout(500);
  if(logg.map(x=>x.kall).join()!=='settings') f.push(`kall: ${logg.map(x=>x.kall).join()||'ingen'}`);
  const sl=logg.find(x=>x.kall==='settings'); if(!sl||sl.body.contact_phone!=='4545') f.push(`contact_phone sendt: ${sl&&sl.body.contact_phone}`);
  const t=await feilTekst(page); if(t!==UGYLDIG) f.push(`feiltekst «${t}»`);
  const farge=await page.$eval('#phoneErr',e=>getComputedStyle(e).color);
  const bad=await page.evaluate(()=>{ const d=document.createElement('span'); d.style.color='var(--bad)'; document.body.appendChild(d); const c=getComputedStyle(d).color; d.remove(); return c; });
  if(farge!==bad) f.push(`farge ${farge} ≠ --bad ${bad}`);
  if(await page.evaluate(()=>document.activeElement&&document.activeElement.id)!=='pf-phone') f.push('fokus ikke i Telefon');
  if(await page.$eval('#pf-phone',e=>e.getAttribute('aria-invalid'))!=='true') f.push('aria-invalid mangler');
  if(dialoger.length) f.push(`alert: ${dialoger.join(' / ')}`);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) f.push('horisontal scroll');
  const fld=page.locator('#pf-phone').locator('xpath=..');
  await fld.scrollIntoViewIfNeeded();
  await fld.screenshot({path:path.join(OUT,`telefon-feil-${bredde}-${tema}.png`)});
  await page.locator('#accProfil').screenshot({path:path.join(OUT,`profil-${bredde}-${tema}.png`)});
  await page.type('#pf-phone','9'); await page.waitForTimeout(100);
  if(await feilTekst(page)!==null) f.push('feilen forsvant ikke ved skriving');
  if(await page.$eval('#pf-phone',e=>e.hasAttribute('aria-invalid'))) f.push('aria-invalid ble stående');
  push(`ugyldig telefon ${bredde} ${tema}`,f,errs); await ctx.close();
}

// ── Gyldig telefon → settings, så profile ────────────────────────────────────────────────
{ const {ctx,page,errs,dialoger,logg}=await nySide({svar:{settings:'ok',profile:'ok'}}); const f=[];
  await aapneProfil(page); await page.fill('#pf-phone','98765432');
  await page.click('#saveProfil'); await page.waitForTimeout(500);
  if(logg.map(x=>x.kall).join()!=='settings,profile') f.push(`kall: ${logg.map(x=>x.kall).join()}`);
  if(!(await lagretSynlig('#profilSaved')(page))) f.push('«Lagret» vises ikke');
  if(await feilTekst(page)!==null) f.push('feil synlig');
  if(dialoger.length) f.push(`alert: ${dialoger.join(' / ')}`);
  push('gyldig telefon → settings, så profile',f,errs); await ctx.close(); }

// ── /settings 500 → ingen /profile, alert ────────────────────────────────────────────────
{ const {ctx,page,errs,dialoger,logg}=await nySide({svar:{settings:500,profile:'ok'}}); const f=[];
  await aapneProfil(page); await page.click('#saveProfil'); await page.waitForTimeout(500);
  if(logg.map(x=>x.kall).join()!=='settings') f.push(`kall: ${logg.map(x=>x.kall).join()}`);
  if(dialoger.length!==1) f.push(`alerts: ${JSON.stringify(dialoger)}`);
  if(await feilTekst(page)!==null) f.push('500 vist som telefonfeil');
  if(await lagretSynlig('#profilSaved')(page)) f.push('«Lagret» vist');
  push('/settings 500 → ingen /profile, alert',f,errs); await ctx.close(); }

// ── /settings OK, /profile feiler → delvis-melding ───────────────────────────────────────
for(const pf of [500,'nett']){
  const {ctx,page,errs,dialoger,logg}=await nySide({svar:{settings:'ok',profile:pf}}); const f=[];
  await aapneProfil(page); await page.click('#saveProfil'); await page.waitForTimeout(500);
  if(logg.map(x=>x.kall).join()!=='settings,profile') f.push(`kall: ${logg.map(x=>x.kall).join()}`);
  if(JSON.stringify(dialoger)!==JSON.stringify([DELVIS])) f.push(`alerts: ${JSON.stringify(dialoger)}`);
  if(await lagretSynlig('#profilSaved')(page)) f.push('«Lagret» vist');
  if(await page.$eval('#saveProfil',b=>b.disabled||b.textContent!=='Lagre profil').catch(()=>true)) f.push('knappen hang');
  push(`/profile ${pf} etter /settings OK → delvis-melding`,f,errs); await ctx.close();
}

// ── Konto → «Lagre navn» (14.10): sender KUN /profile — ingen /settings, så et gammelt ugyldig telefonnummer
// kan ikke stoppe navnelagringen, og ingen feil havner i den skjulte Din side-fanen. Se konto-navn.mjs.
{ const {ctx,page,errs,dialoger,logg}=await nySide({svar:{settings:'ugyldig',profile:'ok'},telefon:'4545'}); const f=[];
  await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(200);
  await page.$eval('#saveNavn',b=>b.click()); await page.waitForTimeout(500);
  if(logg.map(x=>x.kall).join()!=='profile') f.push(`kall: ${logg.map(x=>x.kall).join()}`);
  if(!(await page.$eval('#phoneErr',e=>e.hidden))) f.push('telefonfeil satt (skal ikke røres)');
  if(await page.$eval('#accProfil .acc-head',h=>h.getAttribute('aria-expanded'))==='true') f.push('Profil-trekkspillet ble åpnet');
  if(dialoger.length) f.push(`alert: ${dialoger.join(' / ')}`);
  push('Lagre navn (Konto) + ugyldig telefon → bare /profile',f,errs); await ctx.close(); }

await browser.close(); server.close();
rapport.push({sjekk:'prod-trafikk', resultat:(prodSluppet-prodAvbrutt)>0?`✗ ${prodSluppet-prodAvbrutt} sluppet`:'OK ✓ (0 sluppet)'});
console.table(rapport);
if(rapport.some(r=>r.resultat.startsWith('✗'))) process.exitCode=1;
