// Konto som fire trekkspill + Tjenester etter flyttingen. Verifiserer også DOM-struktur.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b); });
});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

// needs_attention TRUE så begge prikkene skal vises
const BILLING={ subscription_status:null, page_status:'live',
  trial_start_at:new Date(Date.now()-33*864e5).toISOString(), trial_days_left:0,
  myk_periode:true, needs_attention:true, attention_grunn:'trial_utlopt',
  days_left:null, trial_ends_at:null };

function ruter(page){
  return page.route('**/api/**',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/dashboard/billing/status')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(BILLING)});
    if(u.pathname==='/api/dashboard/profile')
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber',
                             email:'henrik@grandbarber.no',slug:'grand-barber'})});
    if(u.pathname==='/api/dashboard/google/status')
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({connected:true,scope_ok:true,google_email:'henrik@grandbarber.no'})});
    if(u.pathname==='/api/dashboard/preview')
      return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(/images|bookings|recent|services|hours/.test(u.pathname)?[]:{})});
  });
}

const ACCS=[['1-abonnement','#accAbonnement'],['2-innlogging','#accInnlogging'],
            ['3-utseende','#accUtseende'],['4-hjelp','#accHjelp']];

const browser=await chromium.launch();
const rapport=[]; let struktur=null;

for(const bredde of [320,402]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await ruter(page);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  await page.waitForTimeout(1400);

  if(!struktur) struktur=await page.evaluate(()=>({
    accBarn: [...document.querySelectorAll('#kontoAccs > .acc')].map(a=>a.id),
    themeGridIAccUtseende: !!document.querySelector('#accUtseende #themeGrid'),
    subcardIAccAbonnement: !!document.querySelector('#accAbonnement .subcard'),
    boksefAccHjelp: document.querySelectorAll('#accHjelp textarea').length,
    pwIAccInnlogging: !!document.querySelector('#accInnlogging #pw-current'),
    aapneVedStart: [...document.querySelectorAll('#kontoAccs > .acc > .acc-head[aria-expanded="true"]')]
                     .map(h=>h.querySelector('.acc-title').textContent.trim()),
  }));

  for(const [navn,sel] of ACCS){
    const apen=await page.$eval(sel+' .acc-head',h=>h.getAttribute('aria-expanded')==='true');
    if(!apen){ await page.click(sel+' .acc-head'); await page.waitForTimeout(500); }
    await page.locator('#abonnement').screenshot({path:`${OUT}/${bredde}-${navn}.png`});
    const m=await page.evaluate(()=>({
      apne: [...document.querySelectorAll('#kontoAccs > .acc > .acc-head[aria-expanded="true"]')]
              .map(h=>h.querySelector('.acc-title').textContent.trim().replace(/\s+/g,' ')),
      navPrikk: !document.querySelector('#kontoDot').hidden,
      accPrikk: !document.querySelector('#kontoAccDot').hidden,
    }));
    rapport.push({bredde,skudd:navn,...m,antallApne:m.apne.length,
      overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
      jsfeil: errs.length?errs.join('; '):'ingen'});
  }

  // Tjenester & tider etter flyttingen
  await page.$eval('button[data-panel="tjenester"]',b=>b.click());
  await page.waitForTimeout(1400);
  await page.locator('#tjenester').screenshot({path:`${OUT}/${bredde}-tjenester.png`});
  const t=await page.evaluate(()=>{
    const g=document.querySelector('#gcal').getBoundingClientRect();
    const forste=document.querySelector('#tjenester .svc-group-h').getBoundingClientRect();
    const h=document.querySelector('#hoursList').getBoundingClientRect();
    return { gcalOverTjenester:g.bottom<=forste.top, gcalOverTider:g.bottom<=h.top };
  });
  rapport.push({bredde,skudd:'tjenester',...t,
    overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.log('STRUKTUR:',JSON.stringify(struktur,null,1));
console.table(rapport);
console.log('alltid nøyaktig ett åpent:',
  rapport.filter(r=>r.antallApne!==undefined).every(r=>r.antallApne===1)?'JA ✓':'NEI ✗');
console.log('begge prikker på ved needs_attention:',
  rapport.filter(r=>r.navPrikk!==undefined).every(r=>r.navPrikk&&r.accPrikk)?'JA ✓':'NEI ✗');
console.log('gcal øverst:', rapport.filter(r=>r.skudd==='tjenester').every(r=>r.gcalOverTjenester&&r.gcalOverTider)?'JA ✓':'NEI ✗');
console.log('overflow:', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('jsfeil:',   rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
await browser.close(); server.close();
