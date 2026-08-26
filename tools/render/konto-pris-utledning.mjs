// Pris utledes ALLTID fra PLAN_INFO — ingen hardkodet 249 utenfor den konstanten.
// Rendrer Konto-fanen i tilstand A (ikke publisert) og B (prøveperiode) på 320 + 402.
//   A: den nye mikroteksten skal referere Vekst-prisen (PLAN_INFO.vekst.pris = 399 kr),
//      og INGEN «249» skal finnes i panelet.
//   B: plan-velger + dager — regresjonssjekk (min endring rører ikke B, men skal ikke knekke den).
// page.on('pageerror') er syntaks-vakten: en parse-feil i dashboard-JS-en tar ned ALT stille.
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
  // A: igjen===null && page_status==='forhandsvist'
  { navn:'A-ikke-publisert', b:{ subscription_status:null, page_status:'forhandsvist',
      days_left:null, trial_ends_at:null, trial_start_at:null, trial_days_left:null,
      nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false,
      attention_grunn:null, plan:null } },
  // B: typeof igjen==='number' && igjen>0 (ingen subscription ennå, sida publisert)
  { navn:'B-proveperiode', b:{ subscription_status:null, page_status:'live',
      days_left:null, trial_ends_at:null,
      trial_start_at:new Date(Date.now()-12*864e5).toISOString(), trial_days_left:18,
      nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false,
      attention_grunn:null, plan:null } },
];

const browser=await chromium.launch();
const rapport=[];
for(const bredde of [320,402]){
  for(const c of CASE){
    const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
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
    await page.locator('#abonnement').screenshot({path:`${OUT}/${bredde}-${c.navn}.png`});
    const mikro=await page.$eval('#kontoMikro',e=>e.textContent.trim()).catch(()=>'(skjult)');
    const tekst=await page.$eval('#kontoTekst',e=>e.textContent.trim()).catch(()=>'(skjult)');
    const panelTxt=await page.$eval('#abonnement',e=>e.innerText);
    rapport.push({bredde, scenario:c.navn,
      mikro,
      'har 249': /\b249\b/.test(panelTxt)?'JA ✗':'nei',
      'A→399':  c.navn.startsWith('A') ? (/\b399 kr\b/.test(mikro)?'OK ✓':'✗ mangler') : '—',
      jsfeil: errs.length?errs.join('; '):'ingen'});
    await page.close();
  }
}
console.table(rapport);
console.log('«249» noe sted i panelet:', rapport.some(r=>r['har 249']!=='nei')?'JA ✗':'nei');
console.log('A refererer 399 kr:',       rapport.filter(r=>r.scenario.startsWith('A')).every(r=>r['A→399']==='OK ✓')?'JA ✓':'NEI ✗');
console.log('jsfeil:',                    rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('screenshots i', OUT);
await browser.close(); server.close();
