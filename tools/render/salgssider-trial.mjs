// Trial-copy på salgssidene etter omleggingen (publiser → 30 dager gratis, ingen kort).
// Rendrer priser.html og kom-i-gang.html på 320 + 375 og verifiserer at ingen side
// fortsatt påstår at man betaler når siden er klar.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

// Påstander som var sanne i den GAMLE modellen (kort ved signup) og er usanne nå.
const FORBUDT=[/betaler først/i, /før du betaler/i, /En måned gratis/i];

const SIDER=['priser.html','kom-i-gang.html','index.html','funksjoner.html'];
const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,375]){
  for(const side of SIDER){
    const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    // kom-i-gang POSTer til API-et; ingen kall skal gå ut under rendring.
    await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.goto(`http://localhost:${PORT}/no/${side}`,{waitUntil:'networkidle'});
    await page.waitForTimeout(700);
    // ⚠ TVING FRAM .reveal FØR SKUDDET. Salgssidene skjuler innhold med
    // `.reveal{opacity:0}` til en IntersectionObserver legger på `.in` ved scroll.
    // fullPage:true fanger hele sida UTEN å scrolle, så observeren fyrer aldri for det
    // under folden — 2746px av priser.html kom ut som tom mørk flate, og det så ut som
    // manglende innhold. Sida var i orden; skuddet løy.
    await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
    await page.waitForTimeout(800); // transition er .7s — vent den ut før vi skyter
    // Bare de to sidene du ba om skjermbilder av — de andre måles kun for tekst.
    if(side==='priser.html'||side==='kom-i-gang.html')
      await page.screenshot({path:`${OUT}/${bredde}-${side.replace('.html','')}.png`,fullPage:true});

    const t=await page.evaluate(()=>document.body.innerText);
    const treff=[];
    for(const re of FORBUDT){ const m=t.match(re); if(m)treff.push(m[0]); }
    rapport.push({bredde, side, 'gammel påstand': treff.length?treff.join(' · '):'ingen',
      overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
      jsfeil: errs.length?errs.join('; '):'ingen'});
    await page.close();
  }
}
console.table(rapport);
console.log('gammel trial-copy igjen:', rapport.some(r=>r['gammel påstand']!=='ingen')?'JA ✗':'nei');
console.log('overflow:', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('jsfeil:',   rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
await browser.close(); server.close();
