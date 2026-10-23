// tools/render/dashboard-glemt-passord.mjs — Konto → Passord → «Glemt passordet? Få en lenke på e-post» (17.10.2026).
// POST /api/send-magic-link {email, formaal:'reset'} for en innlogget barber. Meldingen står i #pwForgotOk under knappen.
//   1. 200 → «Sjekk e-posten din. Vi har sendt en lenke til <e-post>.» (ingen feilfarge)
//   2. 429 code for_mange → serverens melding, feilfarge
//   3. 429 uten code / 500 → vår faste tekst, feilfarge
//   4. Ingen request_id lagres (dashbordet har ikke noe kodefelt; logg-inn.html skal ikke åpne i steg 2 etterpå)
// Alt under /api/** mockes; ingen request når api.trybarberhq.com. Skjermbilder 320/375 av 429-tilstanden.
//
//   node tools/render/dashboard-glemt-passord.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/dashboard-glemt-passord');
fs.mkdirSync(OUT, { recursive: true });
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const billing={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',needs_attention:false,
  cancel_at_period_end:false,current_period_end:null,trial_days_left:null,trial_ends_at:null,sms_saldo:0,sms_pakker:[],sms_pakke_kan_kjopes:false};
const PROFIL={hasPassword:true,name:'Sander',shop:'Saxe Cuts',email:'sander@saxe.no',slug:'saxe-cuts',address:'Storgata 1',tagline:'Fades',bio:'Bio',instagram:'',tiktok:'',snapchat:'',contact_phone:'91234567'};
const FOR_MANGE='For mange forsøk. Vent 15 minutter og prøv igjen.';
const FAST='Vi fikk ikke sendt lenken. Prøv igjen om litt.';

let prodForsok=0, fanget=0;
const browser=await chromium.launch();
async function nySide(bredde, svar){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const sendt=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com'&&!u.pathname.startsWith('/api/'),r=>{ fanget++; return r.abort(); });
  await page.route('**/api/**',route=>{
    fanget++;
    const req=route.request(), p=new URL(req.url()).pathname, m=req.method();
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/send-magic-link'){ sendt.push(JSON.parse(req.postData()||'{}')); return json(svar[1],svar[0]); }
    if(m!=='GET') return json({ok:true});
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/services') return json({hoved:[],tillegg:[]});
    if(p==='/api/dashboard/hours') return json([]);
    if(p==='/api/dashboard/design') return json({ mode: 'mork', font: 'jakarta' });
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(300);
  await page.$eval('.nav button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(300);
  await page.click('[data-endre="radPassord"]'); await page.waitForTimeout(100);
  return {page,errs,sendt};
}
const rapport=[], bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});

const CASES=[
  {id:'ok',        svar:[200,{ok:true,request_id:'rid-1'}],            tekst:'Sjekk e-posten din. Vi har sendt en lenke til sander@saxe.no.', feil:false},
  {id:'for_mange', svar:[429,{error:FOR_MANGE,code:'for_mange'}],     tekst:FOR_MANGE, feil:true, bilde:true},
  {id:'429-uten-code', svar:[429,{error:'Too many'}],                 tekst:FAST, feil:true},
  {id:'500',       svar:[500,{error:'x'}],                            tekst:FAST, feil:true},
];
for(const w of [320,375]) for(const c of CASES){
  if(w===320&&!c.bilde) continue;
  const {page,errs,sendt}=await nySide(w,c.svar);
  const f=[];
  await page.click('#pwForgot'); await page.waitForTimeout(400);
  if(sendt.length!==1||sendt[0].email!=='sander@saxe.no'||sendt[0].formaal!=='reset') f.push('kall '+JSON.stringify(sendt));
  const m=await page.$eval('#pwForgotOk',e=>({vis:e.offsetParent!==null,t:e.textContent.trim(),feil:e.classList.contains('pw-forgot-feil')}));
  if(!m.vis||m.t!==c.tekst) f.push(`melding «${m.t}» vis=${m.vis}`);
  if(m.feil!==c.feil) f.push('feilfarge '+m.feil);
  if(await page.$eval('#pwForgot',b=>b.disabled)) f.push('knappen står deaktivert');
  if(await page.evaluate(()=>localStorage.getItem('bhq-innlogging-kode'))) f.push('request_id lagret');
  if(c.bilde){
    await page.$eval('#radPassord',e=>e.scrollIntoView({block:'center'}));
    const fil=path.join(OUT,`glemt-${c.id}-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil);
  }
  push(`${w} ${c.id}`,f,errs); await page.close();
}
await browser.close(); server.close();
rapport.push({sjekk:'alle API-forsøk fanget av mocken',resultat:fanget>=prodForsok?'OK ✓':`✗ ${prodForsok} forsøk, ${fanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
