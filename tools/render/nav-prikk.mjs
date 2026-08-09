import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const VARSEL={subscription_status:null,page_status:'live',days_left:null,trial_ends_at:null,
  trial_start_at:new Date(Date.now()-33*864e5).toISOString(),trial_days_left:0,
  myk_periode:true,needs_attention:true,attention_grunn:'trial_utlopt'};
const browser=await chromium.launch(); const rad=[];
for(const bredde of [320,375,1200]){
  const page=await browser.newPage({viewport:{width:bredde,height:800},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());
    if(u.pathname==='/api/dashboard/billing/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(VARSEL)});
    if(u.pathname==='/api/dashboard/profile')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'})});
    if(u.pathname==='/api/dashboard/preview')return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals/.test(u.pathname)?[]:{})});});
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1800);
  const m=await page.evaluate(()=>{const nav=document.querySelector('nav.nav');const d=document.querySelector('#kontoDot');
    return { synlige:[...document.querySelectorAll('.nav > button[data-panel]')].filter(b=>b.offsetParent!==null).map(b=>b.textContent.trim()),
      iMeny:[...document.querySelectorAll('.nav-mer-meny button[data-panel]')].map(b=>b.textContent.trim()),
      merSynlig:(document.querySelector('.nav-mer-toggle')||{}).offsetParent!==null,
      prikkSynlig:d?d.offsetParent!==null:false,
      prikkStr:d?(()=>{const r=d.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})():'0x0',
      navScroll:nav.scrollWidth, navKlient:nav.clientWidth, klaring:nav.clientWidth-nav.scrollWidth,
      merDotSynlig:(()=>{const m=document.querySelector('#merDot');return m?m.offsetParent!==null:false;})(),
      merDotStr:(()=>{const m=document.querySelector('#merDot');if(!m)return '0x0';const r=m.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})() };});
  rad.push({bredde,...m,jsfeil:errs.length?errs.join('; '):'ingen'});
  await page.screenshot({path:`${OUT}/${bredde}-navrad.png`,clip:{x:0,y:0,width:bredde,height:150}});
  if(bredde<720){ await page.click('.nav-mer-toggle'); await page.waitForTimeout(400);
    const etterAapning=await page.evaluate(()=>{const v=s=>{const e=document.querySelector(s);return e?e.offsetParent!==null:false;};
      return {merPrikk:v('#merDot'),kontoPrikk:v('#kontoDot')};});
    console.log('  @'+bredde+' MENY ÅPEN → merDot:'+etterAapning.merPrikk+', kontoDot:'+etterAapning.kontoPrikk,
      (etterAapning.merPrikk&&etterAapning.kontoPrikk)?'✓ begge synlige':'✗');
    await page.screenshot({path:`${OUT}/${bredde}-navrad-meny-apen.png`,clip:{x:0,y:0,width:bredde,height:300}}); }
  await page.close();
}
console.table(rad);
console.log('prikk synlig paa alle bredder:',rad.every(r=>r.prikkSynlig)?'JA':'NEI');
console.log('ingen scroll i .nav:',rad.every(r=>r.klaring>=0)?'JA':'NEI');
console.log('varsel synlig (knapp ELLER toggel):',rad.every(r=>r.prikkSynlig||r.merDotSynlig)?'JA':'NEI');
await browser.close(); server.close();
