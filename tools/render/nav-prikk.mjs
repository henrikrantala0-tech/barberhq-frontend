// tools/render/nav-prikk.mjs — varselprikk på Konto-fanen ved needs_attention.
//
// Mobil-navigasjonen er en BUNN-NAV (.bunn-nav). På ≤719px står HELE topp-navet på display:none
// (dashboard.html: `@media(max-width:719px){.nav{display:none}}`). Den gamle «Mer»-dropdownen
// (#merDot/.nav-mer-toggle/.nav-mer-meny) er FJERNET (bunn-nav-prikk-branchen) — testen sjekker
// eksplisitt at den er borte.
//
//   - Desktop (1200): topp-nav synlig → Konto-knappen bærer #kontoDot ved needs_attention.
//   - Mobil (≤719): topp-nav skjult, .bunn-nav er navigasjonen; Konto-fanen bærer #kontoBunnDot
//     ved needs_attention. (Tidligere dokumentert som et produkt-gap — nå bygget og assertet.)
//
// Kjører BEGGE tilstander (needs_attention true/false) × 320/375/1200, og krever at prikken vises
// KUN når needs_attention er true, på riktig flate per bredde.
//
//   node tools/render/nav-prikk.mjs
// Skjermbilder → .render-ut/<bredde>-<med|uten>-prikk.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;

const billing = na => na
  ? {subscription_status:'past_due',page_status:'live',needs_attention:true,attention_grunn:'past_due',effective_plan:'vekst',effective_plan_grunn:'subscription',plan:'vekst',days_left:null,trial_start_at:null}
  : {subscription_status:'active', page_status:'live',needs_attention:false,effective_plan:'vekst',effective_plan_grunn:'subscription',plan:'vekst',days_left:null,trial_start_at:null};

const STATES=[{navn:'med',na:true},{navn:'uten',na:false}];
const browser=await chromium.launch(); const rad=[];
for(const st of STATES){
 for(const bredde of [320,375,1200]){
  const mobil = bredde<720;
  const page=await browser.newPage({viewport:{width:bredde,height:820},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());
    if(u.pathname==='/api/dashboard/billing/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(billing(st.na))});
    if(u.pathname==='/api/dashboard/profile')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'})});
    if(u.pathname==='/api/dashboard/preview')return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|loyalty/.test(u.pathname)?[]:{})});});
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1500);
  const m=await page.evaluate(()=>{const v=s=>{const e=document.querySelector(s);return e?e.offsetParent!==null:false;};
    const topNav=document.querySelector('nav.nav');
    return {
      topNavSynlig: topNav?getComputedStyle(topNav).display!=='none':false,
      bunnNavSynlig: v('.bunn-nav'),
      kontoDotSynlig: v('#kontoDot'),
      bunnDotSynlig: v('#kontoBunnDot'),
      bunnFaner: [...document.querySelectorAll('.bunn-nav .tab[data-panel]')].length,
      // opprydning: «Mer»-modulen skal være helt borte
      merRester: ['.nav-mer-toggle','.nav-mer-meny','.nav-mer-wrap','#merDot','#merLabel','.nav-mer']
                 .reduce((n,s)=>n+document.querySelectorAll(s).length,0),
      scrollW: document.documentElement.scrollWidth,
    };});
  const overflow = m.scrollW - bredde;
  rad.push({state:st.navn,bredde,mobil,...m,overflow,jsfeil:errs.length?errs.join('; '):'ingen'});
  // Skjermbilde av selve nav-flaten (bunn-nav på mobil, topp-nav på desktop)
  const sel = mobil ? '.bunn-nav' : 'nav.nav';
  try{ await page.locator(sel).screenshot({path:`${OUT}/${bredde}-${st.navn}-prikk.png`}); }catch(e){}
  console.log(`  @${bredde} ${mobil?'MOBIL':'DESKTOP'} · needs_attention=${st.na} → `+
    (mobil?`bunn-nav:${m.bunnNavSynlig} faner:${m.bunnFaner} #kontoBunnDot:${m.bunnDotSynlig}`
          :`topp-nav:${m.topNavSynlig} #kontoDot:${m.kontoDotSynlig}`)+
    ` · mer-rester:${m.merRester} · overflow:${overflow} · js:${errs.length?errs.join('|'):'ingen'}`);
  await page.close();
 }
}
console.table(rad.map(r=>({state:r.state,bredde:r.bredde,flate:r.mobil?'bunn':'topp',
  prikkSynlig:r.mobil?r.bunnDotSynlig:r.kontoDotSynlig, merRester:r.merRester, overflow:r.overflow, js:r.jsfeil})));

// Assertions
const feil=[];
for(const r of rad){
  const prikk = r.mobil ? r.bunnDotSynlig : r.kontoDotSynlig;
  const forventet = (r.state==='med');            // prikk KUN når needs_attention=true
  if(prikk!==forventet) feil.push(`${r.bredde}/${r.state}: prikk=${prikk}, forventet=${forventet}`);
  if(r.mobil && !(r.bunnNavSynlig && !r.topNavSynlig && r.bunnFaner===5)) feil.push(`${r.bredde}/${r.state}: bunn-nav feil`);
  if(!r.mobil && !r.topNavSynlig) feil.push(`${r.bredde}/${r.state}: topp-nav skjult på desktop`);
  if(r.merRester!==0) feil.push(`${r.bredde}/${r.state}: «Mer»-rester=${r.merRester} (skal være 0)`);
  if(r.overflow>0) feil.push(`${r.bredde}/${r.state}: overflow=${r.overflow}`);
  if(r.jsfeil!=='ingen') feil.push(`${r.bredde}/${r.state}: JS-feil ${r.jsfeil}`);
}
console.log('\nRESULTAT:', feil.length?('FEILET ✗\n  '+feil.join('\n  ')):'BESTÅTT ✓ — prikk kun ved needs_attention, «Mer» borte, ingen overflow/JS-feil');
process.exitCode = feil.length?1:0;
await browser.close(); server.close();
