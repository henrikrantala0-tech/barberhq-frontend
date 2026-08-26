// site/no/vilkar.html — ren tekstside, ingen JS.
// Verifiserer at den faktisk er JS-fri (ingen <script>, ingen .reveal-elementer som ville
// stått usynlige uten IntersectionObserver), at alle h2-ene er der, at ingen plassholder
// utenom [ORG.NR] står igjen, og at Vilkår-lenka i foten peker hit fra de andre sidene.
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

const H2=['Hvem du handler med','Hva BarberHQ er','Pris','Prøveperiode','Betaling','Oppsigelse',
          'Hvis du ikke betaler','Angrerett','Innholdet ditt','Kundene dine','SMS','Data om deg',
          'Cookies','Underleverandører','Ansvar','Endringer'];

const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,402,1280]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/vilkar.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(600);
  await page.screenshot({path:`${OUT}/${bredde}-vilkar.png`,fullPage:true});

  const m=await page.evaluate(({h2liste})=>{
    const t=document.body.innerText;
    // Usynlig innhold er den ekte faren på en JS-fri side: .reveal er opacity:0 til JS
    // legger på .in. Vi måler faktisk beregnet opacity, ikke bare fravær av klassen.
    const usynlig=[...document.querySelectorAll('main.legal > *')]
      .filter(el=>parseFloat(getComputedStyle(el).opacity)<0.9).length;
    return {
      script: document.querySelectorAll('script').length,
      h1: (document.querySelector('h1')||{}).innerText||'—',
      h2: document.querySelectorAll('main.legal h2').length,
      manglerH2: h2liste.filter(h=>![...document.querySelectorAll('main.legal h2')]
                                     .some(e=>e.innerText.trim()===h)).join(', ')||'—',
      usynlig,
      orgnr: t.includes('[ORG.NR]'),
      andrePlassholdere: (t.match(/\[[A-ZÆØÅ_.]+\]/g)||[]).filter(x=>x!=='[ORG.NR]').join(' ')||'—',
      tittel: document.title,
    };
  },{h2liste:H2});

  rapport.push({bredde, tittel:m.tittel.slice(0,34), h1:m.h1.slice(0,26),
    'script-tagger':m.script, 'h2 funnet':`${m.h2}/${H2.length}`, 'mangler h2':m.manglerH2,
    'usynlige blokker':m.usynlig, '[ORG.NR]':m.orgnr?'ja':'NEI ✗',
    'andre plassh.':m.andrePlassholdere,
    overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

// Fotlenka fra de andre sidene — en juridisk side ingen finner er ikke publisert.
const lenker=[];
for(const side of ['index','priser','funksjoner','support','kom-i-gang']){
  const page=await browser.newPage({viewport:{width:402,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/${side}.html`,{waitUntil:'networkidle'});
  const r=await page.evaluate(()=>{
    const a=[...document.querySelectorAll('a')];
    const finn=t=>{const el=a.find(x=>x.textContent.trim()===t);return el?(el.getAttribute('href')||''):'FINNES IKKE';};
    return {vilkar:finn('Vilkår'), personvern:finn('Personvern'), cookies:finn('Cookies')};
  });
  lenker.push({side, Vilkår:r.vilkar, Personvern:r.personvern, Cookies:r.cookies,
               jsfeil:errs.length?errs.join('; ').slice(0,30):'ingen'});
  await page.close();
}

console.table(rapport);
console.log('\nFOTLENKER (402):'); console.table(lenker);
console.log('\njsfeil:   ', rapport.concat(lenker).some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('overflow: ', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('JS-fri:   ', rapport.every(r=>r['script-tagger']===0)?'ja ✓':'NEI ✗');
console.log('alle h2:  ', rapport.every(r=>r['mangler h2']==='—')?'ja ✓':'NEI ✗');
console.log('usynlig innhold:', rapport.some(r=>r['usynlige blokker']>0)?'JA ✗':'nei');
await browser.close(); server.close();
