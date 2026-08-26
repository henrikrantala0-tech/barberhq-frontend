// #kontoAksjon skal være designsystemets primærknapp (.btn) i ALLE checkout-tilstander,
// aldri den dempede .lnk-quiet. Rendrer tilstand B (trial løper, >7 dager) + canceled på
// 320 + 402, og verifiserer klassen + teksten.
//   B:        «Legg inn kort — fortsett med Vekst», class .btn
//   canceled: «Fortsett med Vekst»,                 class .btn
// Sjekker også at primærknappen (ink/hvit) ikke smelter sammen med plan-velgerens blå
// Vekst-kort — måler bakgrunnsfargen på knappen mot --info.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const CASE=[
  // B: typeof igjen==='number' && igjen>0, klart over 7-dagersgrensa
  { navn:'B-trial-18d', ventTekst:'Legg inn kort — fortsett med Vekst',
    b:{ subscription_status:null, page_status:'live', days_left:null, trial_ends_at:null,
        trial_start_at:new Date(Date.now()-12*864e5).toISOString(), trial_days_left:18,
        nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false,
        attention_grunn:null, plan:null } },
  // canceled: webhooken setter page_status='forhandsvist'; plan beholdes (siste kjente)
  { navn:'canceled', ventTekst:'Fortsett med Vekst',
    b:{ subscription_status:'canceled', page_status:'forhandsvist', days_left:null,
        trial_ends_at:null, trial_start_at:null, trial_days_left:null,
        nedtaking_dager_igjen:null, myk_periode:false, needs_attention:true,
        attention_grunn:null, plan:'vekst' } },
];

const browser=await chromium.launch();
const rapport=[];
for(const bredde of [320,402]){
  for(const c of CASE){
    const page=await browser.newPage({viewport:{width:bredde,height:1000},deviceScaleFactor:2});
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/api/**',route=>{
      const u=new URL(route.request().url());
      if(u.pathname==='/api/dashboard/billing/status')
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(c.b)});
      if(u.pathname==='/api/dashboard/profile')
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Grand Barber',
                               email:'h@g.no',slug:'grand-barber'})});
      if(u.pathname==='/api/dashboard/preview')
        return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
      route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals/.test(u.pathname)?[]:{})});
    });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
    await page.$eval('button[data-panel="abonnement"]',b=>b.click());
    await page.waitForTimeout(1300);
    await page.locator('#abonnement').screenshot({path:`${OUT}/${bredde}-knapp-${c.navn}.png`});
    const info=await page.$eval('#kontoAksjon',e=>({
      klasse:e.className, tekst:e.textContent.trim(),
      bg:getComputedStyle(e).backgroundColor }));
    rapport.push({bredde, scenario:c.navn, klasse:info.klasse, tekst:info.tekst, knapp_bg:info.bg,
      'er .btn': info.klasse==='btn'?'OK ✓':'✗ '+info.klasse,
      'tekst ok': info.tekst===c.ventTekst?'OK ✓':'✗ «'+info.tekst+'»',
      jsfeil: errs.length?errs.join('; '):'ingen'});
    await page.close();
  }
}
console.table(rapport);
console.log('alle primærknapp (.btn):', rapport.every(r=>r['er .btn']==='OK ✓')?'JA ✓':'NEI ✗');
console.log('alle tekster som ventet:', rapport.every(r=>r['tekst ok']==='OK ✓')?'JA ✓':'NEI ✗');
console.log('jsfeil:',                  rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('knapp-bakgrunn (skal IKKE være blå/--info):', [...new Set(rapport.map(r=>r.knapp_bg))].join(' | '));
console.log('screenshots i', OUT);
await browser.close(); server.close();
