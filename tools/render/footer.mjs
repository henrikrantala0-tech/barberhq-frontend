// Footeren på alle fem no/-salgssidene etter at nyhetsbrev-blokka ble fjernet.
//
// Nyhetsbrevet var ikke koblet til noe: subscribe() skrev e-posten til console.log og viste
// «Takk! Du er påmeldt.» Ingen rute, ingen tabell i backend. Blokka er borte, CSS-en står.
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

const SIDER=['index','priser','funksjoner','support','vilkar'];
const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,402,1280]){
  for(const side of SIDER){
    const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    await page.goto(`http://localhost:${PORT}/no/${side}.html`,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
    await page.waitForTimeout(700);

    const m=await page.evaluate(()=>{
      const top=document.querySelector('.foot-top');
      const brand=document.querySelector('.foot-brand');
      if(!top||!brand) return {mangler:true};
      const rt=top.getBoundingClientRect(), rb=brand.getBoundingClientRect();
      // NØSTING: .foot-cols og .foot-bottom skal være SØSKEN av .foot-top, ikke barn.
      // En manglende </div> gjør dem til barn uten at parseren klager og uten at sida
      // ser tydelig feil ut — det skjedde i vilkar.html 09.08 og ga 482px tomrom på 1200.
      const cols=document.querySelector('.foot-cols');
      const bottom=document.querySelector('.foot-bottom');
      const nøsting = (cols && top.contains(cols)) || (bottom && top.contains(bottom))
        ? 'NØSTET ✗' : 'søsken';
      return {
        mangler:false,
        nøsting,
        // Tom plass til høyre for merkevare-blokka INNI .foot-top. Er den stor, står det
        // en tom rutenettkolonne igjen der nyhetsbrevet var.
        tomHoyre: Math.round(rt.right-rb.right),
        kolonner: getComputedStyle(top).gridTemplateColumns.split(' ').length,
        barn: top.children.length,
        footCols: document.querySelectorAll('.foot-cols .foot-col').length,
        rester: ['#subEmail','.sub-row','.foot-sub','#subOk']
                  .filter(s=>document.querySelector(s)).join(' ')||'—',
        meldKnapp: [...document.querySelectorAll('button')]
                     .some(b=>b.textContent.trim()==='Meld meg på')?'JA ✗':'nei',
      };
    });

    if(bredde!==402) { /* skudd kun på 320 og 1280 — 402 måles, men gir ikke nytt bilde */ }
    await page.locator('.foot').screenshot({path:`${OUT}/${bredde}-foot-${side}.png`});

    rapport.push({bredde,side,
      'foot-top barn':m.mangler?'MANGLER ✗':m.barn,
      nøsting:m.mangler?'—':m.nøsting,
      kolonner:m.mangler?'—':m.kolonner,
      'tom plass høyre':m.mangler?'—':m.tomHoyre+'px',
      'foot-col':m.mangler?'—':m.footCols,
      rester:m.mangler?'—':m.rester,
      'Meld meg på':m.mangler?'—':m.meldKnapp,
      overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
      jsfeil: errs.length?errs.join('; ').slice(0,40):'ingen'});
    await page.close();
  }
}

console.table(rapport);
console.log('\njsfeil:            ', rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('overflow:          ', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('nyhetsbrev-rester: ', rapport.some(r=>r.rester!=='—')?'JA ✗':'ingen');
console.log('«Meld meg på»:     ', rapport.some(r=>r['Meld meg på']==='JA ✗')?'JA ✗':'borte');
console.log('tomt hull i .foot-top:', rapport.some(r=>parseInt(r['tom plass høyre'])>40)?'JA ✗':'nei');
console.log('feil nøsting:      ', rapport.some(r=>r.nøsting!=='søsken')?'JA ✗':'nei');
console.log('ett barn i foot-top:', rapport.every(r=>r['foot-top barn']===1)?'ja ✓':'NEI ✗');
await browser.close(); server.close();
