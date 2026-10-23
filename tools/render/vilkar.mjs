// site/no/vilkar.html — ren tekstside. Oppdatert 22.10.2026 til dagens struktur:
//  · Bare de to felles nav-skriptene (burger-menyen + «Mitt dashbord»-knappen, samme på alle markedssider) er lov.
//    Innholdet skal være fullt synlig MED JS slått av (ingen .reveal som venter på IntersectionObserver).
//  · Ekte org.nr (9 siffer) og ingen [PLASSHOLDERE] — [ORG.NR] er byttet ut og skal ikke komme tilbake.
//  · Alle h2-ene er der.
//  · Bunnteksten på markedssidene lenker hit (Vilkår, Personvern for barbere, Cookies). kom-i-gang har ingen
//    bunntekst; der er vilkårslenka i samtykketeksten.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

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

const H2=['Hvem du handler med','Hva BarberHQ er','Pris','SMS-pakker','Betaling','Oppsigelse',
          'Hvis en betaling feiler','Angrerett','Innholdet ditt','Kundene dine','SMS','Data om deg',
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
      orgnr: /org\.?\s?nr\.?\s*\d{3}\s?\d{3}\s?\d{3}/i.test(t),
      plassholdere: (t.match(/\[[A-ZÆØÅ_.]+\]/g)||[]).join(' ')||'—',
      // Hvert skript må være et av de to felles nav-skriptene (kjent på hva det rører).
      fremmedeSkript: [...document.querySelectorAll('script')].filter(sc=>!/nav-burger|navCta/.test(sc.textContent)).length,
      tittel: document.title,
    };
  },{h2liste:H2});

  rapport.push({bredde, tittel:m.tittel.slice(0,34), h1:m.h1.slice(0,26),
    'script-tagger':m.script, 'h2 funnet':`${m.h2}/${H2.length}`, 'mangler h2':m.manglerH2,
    'fremmede skript':m.fremmedeSkript, 'usynlige blokker':m.usynlig, 'org.nr':m.orgnr?'ja':'NEI ✗',
    plassholdere:m.plassholdere,
    overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

// Uten JS: innholdet skal stå der likevel (h2-ene synlige, ingen blokk på opacity 0).
let utenJs;
{
  const ctx=await browser.newContext({viewport:{width:402,height:900},javaScriptEnabled:false});
  const page=await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/no/vilkar.html`,{waitUntil:'load'});
  utenJs=await page.evaluate(()=>({h2:[...document.querySelectorAll('main.legal h2')].filter(e=>e.offsetParent!==null).length,
    usynlig:[...document.querySelectorAll('main.legal > *')].filter(el=>parseFloat(getComputedStyle(el).opacity)<0.9).length}));
  await ctx.close();
}

// Fotlenka fra de andre sidene — en juridisk side ingen finner er ikke publisert.
const lenker=[];
for(const side of ['index','priser','funksjoner','support']){
  const page=await browser.newPage({viewport:{width:402,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/${side}.html`,{waitUntil:'networkidle'});
  const r=await page.evaluate(()=>{
    const a=[...document.querySelectorAll('a')];
    const finn=t=>{const el=a.find(x=>x.textContent.trim()===t);return el?(el.getAttribute('href')||''):'FINNES IKKE';};
    return {vilkar:finn('Vilkår'), personvern:finn('Personvern for barbere'), cookies:finn('Cookies')};
  });
  lenker.push({side, Vilkår:r.vilkar, Personvern:r.personvern, Cookies:r.cookies,
               jsfeil:errs.length?errs.join('; ').slice(0,30):'ingen'});
  await page.close();
}

// kom-i-gang: ingen bunntekst, men samtykketeksten lenker til vilkårene.
const kigVilkar=await (async()=>{const page=await browser.newPage({viewport:{width:402,height:900}});
  await page.goto(`http://localhost:${PORT}/no/kom-i-gang.html`,{waitUntil:'networkidle'});
  const n=await page.evaluate(()=>[...document.querySelectorAll('a[href]')].filter(a=>/vilkar\.html(#|$)/.test(a.getAttribute('href'))).length);
  await page.close(); return n;})();

console.table(rapport);
console.log('\nFOTLENKER (402):'); console.table(lenker);
console.log('Uten JS:', utenJs, '· kom-i-gang lenker til vilkår:', kigVilkar);
sjekk(!(rapport.concat(lenker).some(r=>r.jsfeil!=='ingen')), '\ningen JS-feil');
sjekk(!(rapport.some(r=>r.overflow!=='nei')), 'ingen horisontal overflow');
sjekk(rapport.every(r=>r['fremmede skript']===0), 'bare de felles nav-skriptene');
sjekk(utenJs.h2===H2.length && utenJs.usynlig===0, 'innholdet er synlig uten JS', JSON.stringify(utenJs));
sjekk(rapport.every(r=>r['org.nr']==='ja'), 'ekte org.nr står på siden');
sjekk(rapport.every(r=>r.plassholdere==='—'), 'ingen [PLASSHOLDERE] igjen', rapport[0].plassholdere);
sjekk(lenker.every(l=>l.Vilkår==='vilkar.html' && l.Personvern==='vilkar.html#personvern' && l.Cookies==='vilkar.html#cookies'), 'bunnteksten lenker til Vilkår, Personvern for barbere og Cookies');
sjekk(kigVilkar>0, 'kom-i-gang lenker til vilkårene (samtykketeksten)');
sjekk(rapport.every(r=>r['mangler h2']==='—'), 'alle h2');
sjekk(!(rapport.some(r=>r['usynlige blokker']>0)), 'ingen usynlig innhold');
await browser.close(); server.close();
ferdig();   // minst én NEI -> exit 1 (fixtures/sjekk.mjs)
