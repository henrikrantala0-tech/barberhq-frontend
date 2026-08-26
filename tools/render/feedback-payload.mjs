// Tre bokser, én handler: verifiser at hver sender RIKTIG payload til /api/feedback.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b); });
});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

async function kjor(profil){
  const fanget=[];
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:402,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/feedback'){
      fanget.push(JSON.parse(route.request().postData()||'{}'));
      return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});
    }
    if(u.pathname==='/api/dashboard/profile')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(profil)});
    if(u.pathname==='/api/dashboard/billing/status')
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({subscription_status:null,page_status:'forhandsvist',trial_start_at:null,
                             trial_days_left:null,myk_periode:false,needs_attention:false,attention_grunn:null})});
    if(u.pathname==='/api/dashboard/preview')
      return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(/images|bookings|recent|services|hours/.test(u.pathname)?[]:{})});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  await page.waitForTimeout(1200);
  await page.click('#accHjelp .acc-head');
  await page.waitForTimeout(500);

  await page.fill('#fbBox-konto-support','Knappen gjør ingenting');
  await page.click('#fbSend-konto-support'); await page.waitForTimeout(800);
  const supportFeil=await page.$eval('#fbErr-konto-support',
    e=>e.offsetParent!==null?e.textContent.trim():'(ingen)');

  await page.fill('#fbBox-konto-ide','Ønsker mørkere palett');
  await page.click('#fbSend-konto-ide'); await page.waitForTimeout(800);

  // Idé-boksen på «Din side»
  await page.$eval('button[data-panel="design"]',b=>b.click());
  await page.waitForTimeout(1200);
  await page.fill('#fbBox-side','Idé fra Din side');
  await page.click('#fbSend-side'); await page.waitForTimeout(800);

  await browser.close();
  return {fanget,supportFeil,jsfeil:errs.length?errs:'ingen'};
}

console.log('── MED e-post på profilen ──');
const a=await kjor({hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber',
                    email:'henrik@grandbarber.no',slug:'grand-barber'});
console.log(JSON.stringify(a.fanget,null,1));
console.log('support-feil:',a.supportFeil,'| jsfeil:',a.jsfeil);

console.log('\n── UTEN e-post (nullbar kolonne) ──');
const b=await kjor({hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber',email:null,slug:'grand-barber'});
console.log('POSTs:',JSON.stringify(b.fanget.map(x=>x.type)));
console.log('support-feil:',b.supportFeil,'| jsfeil:',b.jsfeil);

server.close();
