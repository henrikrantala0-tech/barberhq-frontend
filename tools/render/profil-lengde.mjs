// tools/render/profil-lengde.mjs — lengdetak + tegnteller på profilfeltene, og backendens 400 i feltet.
//   • maxlength = PROFIL_MAKS (navn 100, salongnavn 100, adresse 200, spesialitet 60, beskrivelse 2000).
//     Spesialitet er 60 (strammere enn backendens 150 — sperret overlinje på bookingsiden). Lim inn mer → kappes.
//   • Telleren «N / maks»: alltid under beskrivelsen; på de korte feltene fra 80 % av taket. Ved taket: .full.
//     Lasting av profilen (programmatisk verdi) oppdaterer tellerne.
//   • PUT /profile 400 → backendens melding ordrett under feltet KUN ut fra felt i svaret (aldri gjettet fra
//     ordlyden), ingen alert, Profil åpnet + fokus. Navnefeil fra Konto → under Navn i Konto. Uten/ukjent felt → alert.
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

const MAKS={'pf-name':100,'pf-shop':100,'pf-address':200,'pf-tagline':60,'pf-bio':2000};
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
async function aapneProfil(page){
  await page.$eval('button[data-panel="design"]',b=>b.click()); await page.waitForTimeout(200);
  await page.$eval('#accProfil .acc-head',h=>{ if(h.getAttribute('aria-expanded')!=='true') h.click(); }); await page.waitForTimeout(300);
}
const teller=(page,id)=>page.$eval('#'+id+'-teller',e=>({synlig:!e.hidden&&e.offsetParent!==null,t:e.textContent.replace(/ /g,' '),full:e.classList.contains('full')}));
const feil=(page,id)=>page.$eval('#'+id+'-feil',e=>(!e.hidden&&e.offsetParent!==null)?e.textContent:null).catch(()=>null);
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const bilde=async(page,navn,sel)=>{ await page.$eval(sel,e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
  const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };

for(const w of [320,375]){
  // 1. Tak + tellere etter lasting; spesialitet fylt til taket
  {
    const {page,errs}=await nySide(w);
    await aapneProfil(page);
    const f=[];
    for(const [id,max] of Object.entries(MAKS)){ const ml=await page.$eval('#'+id,e=>e.maxLength); if(ml!==max) f.push(`${id} maxlength=${ml}`); }
    let t=await teller(page,'pf-bio');
    if(!t.synlig||t.t!=='1 850 / 2 000') f.push(`bio-teller «${t.t}» synlig=${t.synlig}`);
    t=await teller(page,'pf-shop'); if(t.synlig) f.push('salongnavn-teller synlig ved 9 tegn');
    // Spesialitet (tak 60): telleren dukker opp fra 80 % = 48 tegn.
    t=await teller(page,'pf-tagline'); if(t.synlig) f.push('spesialitet-teller synlig ved 24 tegn');
    const T47='Skarpe fades og klassiske herreklipp i sentrum.', T48='Fades og klassiske herreklipp i hjertet av Oslo.',
          T60='Fades og klassiske herreklipp. Drop-in hvis stolen er ledig.';
    if(T47.length!==47||T48.length!==48||T60.length!==60) f.push('testtekstene har feil lengde');
    await page.fill('#pf-tagline',T47); t=await teller(page,'pf-tagline'); if(t.synlig) f.push('teller synlig ved 47');
    await page.fill('#pf-tagline',T48); t=await teller(page,'pf-tagline');
    if(!t.synlig||t.t!=='48 / 60'||t.full) f.push(`ved 48: «${t.t}» synlig=${t.synlig} full=${t.full}`);
    await bilde(page,`spesialitet-48-${w}`,'#pf-tagline');
    // Ved taket: skriv mer → kappes til 60, «60 / 60» .full
    await page.fill('#pf-tagline',T60+' Velkommen!');
    const len=await page.$eval('#pf-tagline',e=>e.value.length);
    if(len!==60) f.push(`spesialitet har ${len} tegn (ventet 60)`);
    t=await teller(page,'pf-tagline'); if(!t.synlig||t.t!=='60 / 60'||!t.full) f.push(`ved 60: «${t.t}» full=${t.full}`);
    await bilde(page,`spesialitet-60-${w}`,'#pf-tagline');
    push(`${w} tak + tellere`,f,errs); await page.close();
  }
  // 2. 400 med felt:'bio' → under Beskrivelse
  {
    const MELD='Beskrivelsen er for lang. Maks 2000 tegn.';
    const {page,errs,dialoger}=await nySide(w,{profil400:{status:400,body:{error:MELD,felt:'bio'}}});
    await aapneProfil(page);
    await page.click('#saveProfil'); await page.waitForTimeout(600);
    const f=[];
    const t=await feil(page,'pf-bio'); if(t!==MELD) f.push(`feil «${t}»`);
    if(dialoger.length) f.push(`alert ${JSON.stringify(dialoger)}`);
    if(await page.evaluate(()=>document.activeElement&&document.activeElement.id)!=='pf-bio') f.push('fokus ikke i Beskrivelse');
    const farge=await page.$eval('#pf-bio-feil',e=>getComputedStyle(e).color);
    const bad=await page.evaluate(()=>{ const d=document.createElement('span'); d.style.color='var(--bad)'; document.body.appendChild(d); const c=getComputedStyle(d).color; d.remove(); return c; });
    if(farge!==bad) f.push(`farge ${farge} ≠ --bad`);
    await bilde(page,`feil-bio-${w}`,'#pf-bio');
    await page.type('#pf-bio','x'); if(await feil(page,'pf-bio')) f.push('feilen står etter skriving');
    push(`${w} 400 felt:bio`,f,errs); await page.close();
  }
}
// 3. felt:"tagline" (backendens kontrakt) → under Spesialitet
{
  const MELD='Spesialiteten kan ikke være lengre enn 60 tegn.';
  const {page,errs,dialoger}=await nySide(375,{profil400:{status:400,body:{error:MELD,felt:'tagline'}}});
  await aapneProfil(page); await page.click('#saveProfil'); await page.waitForTimeout(600);
  const f=[]; const t=await feil(page,'pf-tagline'); if(t!==MELD) f.push(`feil «${t}»`); if(dialoger.length) f.push('alert');
  push('400 felt:tagline → Spesialitet',f,errs); await page.close();
}
// 4. Uten felt: ALDRI gjettet fra ordlyden — meldingen som nevner Spesialitet gir alert, ingen feltfeil
{
  const MELD='Spesialitet er for lang (maks 60 tegn).';
  const {page,errs,dialoger}=await nySide(375,{profil400:{status:400,body:{error:MELD}}});
  await aapneProfil(page); await page.click('#saveProfil'); await page.waitForTimeout(600);
  const f=[]; if(await feil(page,'pf-tagline')) f.push('gjettet felt fra ordlyden'); if(!dialoger.includes(MELD)) f.push(`alert ${JSON.stringify(dialoger)}`);
  push('400 uten felt → alert (ingen gjetting)',f,errs); await page.close();
}
// 5. Navnefeil fra Konto → under Navn i Konto-raden
{
  const MELD='Navnet er for langt (maks 100 tegn).';
  const {page,errs}=await nySide(375,{profil400:{status:400,body:{error:MELD,felt:'name'}}});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(200);
  await page.click('[data-endre="radNavn"]'); await page.waitForTimeout(200);
  await page.click('#saveNavn'); await page.waitForTimeout(600);
  const f=[]; if(await feil(page,'pf-name')!==MELD) f.push(`feil «${await feil(page,'pf-name')}»`);
  if(await page.$eval('#radNavnRed',e=>e.hidden)) f.push('Navn-raden lukket');
  push('400 felt:name fra Konto',f,errs); await page.close();
}
// 6. Ukjent felt → alert med meldingen
{
  const MELD='Noe er feil med profilen.';
  const {page,errs,dialoger}=await nySide(375,{profil400:{status:400,body:{error:MELD}}});
  await aapneProfil(page); await page.click('#saveProfil'); await page.waitForTimeout(600);
  const f=[]; if(!dialoger.includes(MELD)) f.push(`alert ${JSON.stringify(dialoger)}`);
  push('400 ukjent felt → alert',f,errs); await page.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
