// tools/render/profil-lengde.mjs — lengdetak + tegnteller på navnet (Konto → Navn), og backendens 400 for navnet.
//   • maxlength = PROFIL_MAKS (navn 100). Telleren «N / maks» fra 80 % av taket; ved taket: .full.
//   • PUT /profile 400 fra Konto → meldingen i #navnErr i samme rad.
//   (Profilfeltene i den gamle «Din side» er borte — Din side-flyten testes i dinside-v2.mjs.)
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
//   node tools/render/profil-lengde.mjs   → .render-ut/profil-lengde/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/profil-lengde');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const MAKS={'pf-name':100};
const billing={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',
  needs_attention:false,cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null};
const BIO=('Klassiske klipp og skarpe fades. Jeg har klippet i Oslo i tolv år og tar meg tid til hver kunde. ').repeat(20).slice(0,1850);

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
// profil400: null | {status, body} for PUT /profile
async function nySide(bredde,{profil400=null}={}){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[], dialoger=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>{ dialoger.push(d.message()); d.dismiss(); });
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname, m=req.method();
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(m==='PUT'&&p==='/api/dashboard/settings') return json({ok:true});
    if(m==='PUT'&&p==='/api/dashboard/profile') return profil400?json(profil400.body,profil400.status):json({ok:true});
    if(m!=='GET') return json({},500);
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/aktivering') return json({har_booking:true,steg:{}});
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Sander Saxe',shop:'Saxe Cuts',email:'s@s.no',slug:'saxe-cuts',
      address:'Storgata 1, 0155 Oslo',tagline:'Fades og klassiske klipp',bio:BIO,instagram:'',tiktok:'',snapchat:'',contact_phone:'91234567'});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(400);
  return {page,errs,dialoger};
}
const teller=(page,id)=>page.$eval('#'+id+'-teller',e=>({synlig:!e.hidden&&e.offsetParent!==null,t:e.textContent.replace(/ /g,' '),full:e.classList.contains('full')}));
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const bilde=async(page,navn,sel)=>{ await page.$eval(sel,e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
  const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };

for(const w of [320,375]){
  // 1. Navnet (Konto → Navn): maxlength 100, telleren fra 80 % av taket, .full ved taket.
  {
    const {page,errs}=await nySide(w);
    await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(200);
    await page.click('[data-endre="radNavn"]'); await page.waitForTimeout(200);
    const f=[];
    const ml=await page.$eval('#pf-name',e=>e.maxLength); if(ml!==MAKS['pf-name']) f.push(`pf-name maxlength=${ml}`);
    let t=await teller(page,'pf-name'); if(t.synlig) f.push('navne-teller synlig ved 11 tegn');
    await page.fill('#pf-name','N'.repeat(79)); t=await teller(page,'pf-name'); if(t.synlig) f.push('teller synlig ved 79');
    await page.fill('#pf-name','N'.repeat(80)); t=await teller(page,'pf-name');
    if(!t.synlig||t.t!=='80 / 100'||t.full) f.push(`ved 80: «${t.t}» synlig=${t.synlig} full=${t.full}`);
    await page.fill('#pf-name','N'.repeat(130));
    const len=await page.$eval('#pf-name',e=>e.value.length); if(len!==100) f.push(`navnet har ${len} tegn (ventet 100)`);
    t=await teller(page,'pf-name'); if(!t.synlig||t.t!=='100 / 100'||!t.full) f.push(`ved 100: «${t.t}» full=${t.full}`);
    await bilde(page,`navn-100-${w}`,'#pf-name');
    push(`${w} navn: tak + teller`,f,errs); await page.close();
  }
}
// 5. Navnefeil fra Konto → #navnErr i Konto-raden
{
  const MELD='Navnet er for langt (maks 100 tegn).';
  const {page,errs}=await nySide(375,{profil400:{status:400,body:{error:MELD,felt:'name'}}});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(200);
  await page.click('[data-endre="radNavn"]'); await page.waitForTimeout(200);
  await page.click('#saveNavn'); await page.waitForTimeout(600);
  // Feilen står i Konto-raden (#navnErr), ikke i en skjult fane.
  const nf=await page.$eval('#navnErr',e=>(!e.hidden&&e.offsetParent!==null)?e.textContent:null);
  const f=[]; if(nf!==MELD) f.push(`#navnErr «${nf}»`);
  if(await page.$eval('#radNavnRed',e=>e.hidden)) f.push('Navn-raden lukket');
  push('400 felt:name fra Konto',f,errs); await page.close();
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
