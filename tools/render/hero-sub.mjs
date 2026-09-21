// site/no/index.html — hero-underteksten (.hero-sub) skal ikke flyte utenfor skjermen.
//
// Historikk: testen målte tidligere en `<strong>`-løftesetning («Flere kunder, mer inntekt.»)
// med `white-space:nowrap` og sjekket at den ikke brakk / ikke stakk ut. Den setningen er FJERNET
// fra hero-copyen (underteksten er nå en vanlig, brytbar paragraf uten `<strong>`), så strong-/
// nowrap-sjekkene er utdaterte. Testen guarder nå det som fortsatt gjelder: at `.hero-sub`-avsnittet
// (og dermed hero-seksjonen) ikke skaper vannrett overflyt på noen bredde.
// MERK: index.html har IKKE `body{overflow-x:hidden}`, så documentElement.scrollWidth er et gyldig
// signal her. Avsnittets egne rect-er måles i tillegg — scrollWidth er en side-global sum der en
// hvilken som helst annen seksjon kan dominere. `bodyOverflowX` rapporteres for å avsløre om noen
// senere legger på overflow-x:hidden (som ville gjort scrollWidth-flagget blindt).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
            '.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,402,1280]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1400);  // hero-animasjonen er 1.2s

  const m=await page.evaluate(vw=>{
    const p=document.querySelector('.hero-sub');
    if(!p) return {mangler:true};
    const linjer=el=>{const r=document.createRange();r.selectNodeContents(el);
      return [...new Set([...r.getClientRects()].map(x=>Math.round(x.top)))].length;};
    const rp=p.getBoundingClientRect();
    return {
      subLinjer: linjer(p),
      subTekst: p.textContent.trim().slice(0,40),
      subBredde: Math.round(rp.width),
      // Overflyt målt to veier: p.scrollWidth>clientWidth fanger innhold bredere enn avsnittet;
      // rect-ene fanger et avsnitt som selv er dyttet utenfor skjermen.
      pOverflyt: Math.max(0, p.scrollWidth - p.clientWidth),
      subUtenfor: Math.round(Math.max(0, rp.right - vw, -rp.left)),
      docOverflyt: document.documentElement.scrollWidth - vw,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    };
  },bredde);

  if(m.mangler){ rapport.push({bredde, feil:'.hero-sub mangler ✗', jsfeil:errs.length?errs.join('; '):'ingen'}); await page.close(); continue; }
  await page.locator('.hero-sub').screenshot({path:`${OUT}/${bredde}-hero-sub.png`});

  rapport.push({bredde,
    'sub-linjer': m.subLinjer,
    'sub bredde': `${m.subBredde}px`,
    'overflyt i avsnitt': m.pOverflyt?`${m.pOverflyt}px ✗`:'0',
    'sub utenfor skjerm': m.subUtenfor?`${m.subUtenfor}px ✗`:'0',
    'doc scrollWidth−vw': `${m.docOverflyt} (overflow-x:${m.bodyOverflowX})`,
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const mangler=rapport.some(r=>r.feil);
const flyter=rapport.some(r=>r['overflyt i avsnitt']!=='0'||r['sub utenfor skjerm']!=='0');
const jsfeil=rapport.some(r=>r.jsfeil!=='ingen');
console.log('\n.hero-sub finnes på alle bredder:', mangler?'NEI ✗':'ja ✓');
console.log('ingen overflyt:                  ', flyter?'JA ✗':'nei ✓');
console.log('jsfeil:                          ', jsfeil?'JA ✗':'ingen');
await browser.close(); server.close();
process.exit((mangler||flyter||jsfeil)?1:0);
