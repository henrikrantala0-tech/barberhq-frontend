// tools/render/nav-prikk.mjs — varselprikk på Konto-fanen ved needs_attention.
//
// ⚠ OPPDATERT 21.09: den gamle mobil-navigasjonen (topp-nav med «Mer»-dropdown + #merDot som
// speilet Konto-prikken) er ERSTATTET av en bunn-nav (.bunn-nav). På ≤719px står HELE topp-navet
// på display:none (se dashboard.html: `@media(max-width:719px){.nav{display:none}}`), så
// .nav-mer-toggle / .nav-mer-meny / #merDot er CSS-døde på alle bredder (skjult på desktop av
// .nav-mer-wrap{display:none}, skjult på mobil av .nav{display:none}). Markupen ligger igjen i
// DOM-en, men er ikke lenger navigasjonen. Testen ble derfor omskrevet:
//   - Desktop (1280): topp-nav er synlig → Konto-knappen bærer #kontoDot ved needs_attention.
//   - Mobil (≤719): topp-nav er skjult, .bunn-nav er navigasjonen (fem faner, ingen dropdown).
//
// ⚠ DOKUMENTERT PRODUKT-GAP (ikke skjult av testen): bunn-navens Konto-fane har INGEN
// varselprikk. På mobil finnes det altså ingen synlig «se her»-indikator ved needs_attention.
// Testen rapporterer dette eksplisitt uten å feile på en produktfunksjon som ikke er bygget —
// se «mobil-varsel»-linja i utskriften. Bygges prikken inn i bunn-navet senere, styrk denne
// linja til en assertion.
//
//   node tools/render/nav-prikk.mjs
// Skjermbilder → .render-ut/<bredde>-navrad.png (gitignorert).

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
for(const bredde of [320,402,1280]){
  const mobil = bredde<720;
  const page=await browser.newPage({viewport:{width:bredde,height:800},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('**/api/**',route=>{const u=new URL(route.request().url());
    if(u.pathname==='/api/dashboard/billing/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(VARSEL)});
    if(u.pathname==='/api/dashboard/profile')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'})});
    if(u.pathname==='/api/dashboard/preview')return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals/.test(u.pathname)?[]:{})});});
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1800);
  const m=await page.evaluate(()=>{const v=s=>{const e=document.querySelector(s);return e?e.offsetParent!==null:false;};
    const topNav=document.querySelector('nav.nav');
    return {
      topNavSynlig: topNav?getComputedStyle(topNav).display!=='none':false,
      bunnNavSynlig: v('.bunn-nav'),
      // Desktop-varsel: prikken på Konto-knappen i topp-navet.
      kontoDotSynlig: v('#kontoDot'),
      kontoDotStr: (()=>{const d=document.querySelector('#kontoDot');if(!d)return '0x0';const r=d.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height);})(),
      // Bunn-navens fem faner + ev. varselprikk (finnes ikke i dag → dokumentert gap).
      bunnFaner: [...document.querySelectorAll('.bunn-nav .tab[data-panel]')].map(b=>(b.querySelector('.tab-lbl')||b).textContent.trim()),
      bunnKontoFinnes: !!document.querySelector('.bunn-nav .tab[data-panel="abonnement"]'),
      bunnVarselSynlig: !!document.querySelector('.bunn-nav .nav-dot:not([hidden])'),
    };});
  rad.push({bredde,mobil,...m,jsfeil:errs.length?errs.join('; '):'ingen'});
  await page.screenshot({path:`${OUT}/${bredde}-navrad.png`,clip:{x:0,y:0,width:bredde,height:150}});
  console.log(`  @${bredde} ${mobil?'MOBIL (bunn-nav)':'DESKTOP (topp-nav)'} → `+
    (mobil
      ? `bunn-nav synlig:${m.bunnNavSynlig} · faner:${m.bunnFaner.length} · mobil-varsel:${m.bunnVarselSynlig?'prikk':'INGEN (dokumentert gap)'}`
      : `topp-nav synlig:${m.topNavSynlig} · #kontoDot:${m.kontoDotSynlig} (${m.kontoDotStr})`));
  await page.close();
}
console.table(rad.map(r=>({bredde:r.bredde,nav:r.mobil?'bunn':'topp',
  kontoDot:r.mobil?'(n/a mobil)':r.kontoDotSynlig,
  bunnFaner:r.mobil?r.bunnFaner.length:'(n/a desktop)',
  mobilVarsel:r.mobil?(r.bunnVarselSynlig?'prikk':'ingen'):'(n/a)',
  jsfeil:r.jsfeil})));

// Assertions som holder mot dagens markup:
const desktop = rad.filter(r=>!r.mobil);
const mobilRader = rad.filter(r=>r.mobil);
const desktopDotOK = desktop.every(r=>r.topNavSynlig && r.kontoDotSynlig);         // topp-nav + prikk på desktop
const mobilNavOK   = mobilRader.every(r=>r.bunnNavSynlig && !r.topNavSynlig && r.bunnKontoFinnes && r.bunnFaner.length===5);
const ingenFeil    = rad.every(r=>r.jsfeil==='ingen');

console.log('\ndesktop: topp-nav + #kontoDot ved needs_attention:', desktopDotOK?'JA ✓':'NEI ✗');
console.log('mobil: bunn-nav er navigasjonen (topp-nav skjult, 5 faner, Konto finnes):', mobilNavOK?'JA ✓':'NEI ✗');
console.log('ingen JS-feil:', ingenFeil?'JA ✓':'NEI ✗');
// Rent informativ — IKKE en assertion. Dagens bunn-nav bærer ingen varselprikk.
console.log('mobil-varsel (dokumentert gap, bygges senere):',
  mobilRader.every(r=>!r.bunnVarselSynlig)?'ingen prikk i bunn-nav':'PRIKK FINNES → styrk til assertion');

const ok = desktopDotOK && mobilNavOK && ingenFeil;
console.log('\nRESULTAT:', ok?'BESTÅTT ✓':'FEILET ✗');
process.exitCode = ok?0:1;
await browser.close(); server.close();
