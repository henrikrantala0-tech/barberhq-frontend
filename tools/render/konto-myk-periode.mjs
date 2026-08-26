// Tilstand C (myk periode): nedtellingen kommer fra backend, ikke fra frontend-konstanter.
//
// Dekker begge null-konvensjonene, som er ULIKE med vilje:
//   trial_days_left = 0        → «0 dager igjen av prøveperioden» er en EKTE tilstand
//   nedtaking_dager_igjen null → ingen nedtelling å vise (fristen passert / ikke startet)
//                                → teksten skal falle til «snart», ALDRI «om 0 dager»
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

const basis={ subscription_status:null, page_status:'live', days_left:null, trial_ends_at:null,
  trial_start_at:new Date(Date.now()-33*864e5).toISOString(), trial_days_left:0,
  myk_periode:true, needs_attention:true, attention_grunn:'trial_utlopt' };

const CASE=[
  { navn:'C-4-dager',  b:{...basis, nedtaking_dager_igjen:4},    vent:'om 4 dager' },
  { navn:'C-1-dag',    b:{...basis, nedtaking_dager_igjen:1},    vent:'om 1 dag' },
  // Fristen passert: feltet er null. Skal IKKE bli «om 0 dager».
  { navn:'C-null',     b:{...basis, nedtaking_dager_igjen:null}, vent:'snart' },
  // Eldre backend uten feltet i det hele tatt — samme fallback.
  { navn:'C-mangler',  b:{...basis},                              vent:'snart' },
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
    const tekst=await page.$eval('#kontoTekst',e=>e.textContent.trim());
    rapport.push({bredde, scenario:c.navn, felt:String(c.b.nedtaking_dager_igjen), tekst,
      'inneholder': tekst.includes(c.vent)?'OK ✓':'✗ ventet «'+c.vent+'»',
      'sier 0 dager': /om 0 dag/.test(tekst)?'JA ✗':'nei',
      jsfeil: errs.length?errs.join('; '):'ingen'});
    await page.close();
  }
}
console.table(rapport);
console.log('alle tekster som ventet:', rapport.every(r=>r.inneholder==='OK ✓')?'JA ✓':'NEI ✗');
console.log('«om 0 dager» noe sted:',   rapport.some(r=>r['sier 0 dager']!=='nei')?'JA ✗':'nei');
console.log('jsfeil:',                  rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
await browser.close(); server.close();
