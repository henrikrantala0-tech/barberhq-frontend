// site/no/index.html — hero-underteksten og løftesetningen «Flere kunder, mer inntekt.»
//
// Setningen er hele poenget med underteksten, og et linjebrekk midt i den gjør den til to
// halve påstander. `white-space:nowrap` på `.hero-sub strong` holder den samlet — men nowrap
// kan ikke krympe, så på smale skjermer er alternativet at den stikker UT av sida.
// Testen måler begge sider av den avveiningen:
//   - brekker <strong> (Range → én rect per linjeboks)?
//   - stikker den, eller avsnittet, utenfor viewporten?
// MERK: index.html har IKKE `body{overflow-x:hidden}` (det har priser.html), så
// documentElement.scrollWidth er et gyldig signal her. Elementenes egne rect-er måles
// likevel, av to grunner: scrollWidth er en side-global sum der en hvilken som helst annen
// seksjon kan dominere, og legger noen på overflow-x:hidden senere, blir flagget blindt
// uten at testen sier fra. `bodyOverflowX` rapporteres derfor sammen med tallet.
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
    const st=p.querySelector('strong');
    const linjer=el=>{const r=document.createRange();r.selectNodeContents(el);
      return [...new Set([...r.getClientRects()].map(x=>Math.round(x.top)))].length;};
    const rp=p.getBoundingClientRect(), rs=st.getBoundingClientRect();
    return {
      strongLinjer: linjer(st),
      subLinjer: linjer(p),
      strongTekst: st.textContent.trim(),
      strongBredde: Math.round(rs.width),
      // Overflyt målt tre veier. p.scrollWidth>clientWidth fanger innhold som er bredere enn
      // avsnittet; rect-ene fanger et avsnitt som selv er dyttet utenfor skjermen.
      pOverflyt: Math.max(0, p.scrollWidth - p.clientWidth),
      strongUtenfor: Math.round(Math.max(0, rs.right - vw, -rs.left)),
      subUtenfor: Math.round(Math.max(0, rp.right - vw, -rp.left)),
      subBredde: Math.round(rp.width),
      nowrap: getComputedStyle(st).whiteSpace,
      // Sida skjuler overflyt vannrett; verdt å ha med for å vise at flagget er blindt her.
      docOverflyt: document.documentElement.scrollWidth - vw,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    };
  },bredde);

  await page.locator('.hero-sub').screenshot({path:`${OUT}/${bredde}-hero-sub.png`});

  rapport.push({bredde,
    'white-space': m.nowrap,
    'strong-linjer': m.strongLinjer===1?'1 ✓ (samlet)':`${m.strongLinjer} ✗ BREKKER`,
    'strong bredde': `${m.strongBredde}px`,
    'sub-linjer': m.subLinjer,
    'sub bredde': `${m.subBredde}px`,
    'overflyt i avsnitt': m.pOverflyt?`${m.pOverflyt}px ✗`:'0',
    'strong utenfor skjerm': m.strongUtenfor?`${m.strongUtenfor}px ✗`:'0',
    'sub utenfor skjerm': m.subUtenfor?`${m.subUtenfor}px ✗`:'0',
    'doc scrollWidth−vw': `${m.docOverflyt} (blind: overflow-x:${m.bodyOverflowX})`,
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const brekker=rapport.some(r=>r['strong-linjer'].includes('✗'));
const flyter=rapport.some(r=>r['overflyt i avsnitt']!=='0'||r['strong utenfor skjerm']!=='0'||r['sub utenfor skjerm']!=='0');
console.log('\nløftet samlet på alle bredder:', brekker?'NEI ✗':'ja ✓');
console.log('overflyt noe sted:            ', flyter?'JA ✗ — nowrap må vike for <br>':'nei ✓');
console.log('jsfeil:                       ', rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
await browser.close(); server.close();
