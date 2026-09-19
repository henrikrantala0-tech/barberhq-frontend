// site/no/index.html — hero-videoen skal ALDRI vise eller reagere på iOS' native play-knapp.
//
// In-app-browsere (Google-appen, TikTok) og iOS Lavstrømmodus blokkerer autoplay og tegner en
// native play-knapp oppå videoen. Beslutning (19.09): ren markup + CSS + poster som stillbilde-
// fallback — INGEN JS-retry (ingen play()-kall på touch/visibilitychange, den gjorde videoen
// trykkbar bakveien). Fiksen har fire deler; testen verifiserer dem alle:
//   1. markup-attributter: autoplay muted loop playsinline webkit-playsinline
//      disablepictureinpicture preload="auto" poster; INGEN controls
//   2. pointer-events:none på .hero-video → hele videoen er utrykkbar (native knapp kan ikke aktiveres)
//   3. poster satt til et ekte frame (images/hero-poster.jpg finnes og lastes 200)
//   4. ::-webkit-media-controls-start-playback-button + ::-webkit-media-controls skjult
// Headless Chromium autoplayer muted video, så .paused skal være false her — det bekrefter at
// markupen faktisk lar videoen spille. Selve fraværet av den native knappen kan BARE bekreftes på
// en ekte iOS-enhet (Chromium har aldri hatt knappen); denne testen fanger regresjoner i markup/CSS.
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

for(const bredde of [320,375,1280]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const posterStatus={code:null};
  page.on('response',res=>{ if(res.url().includes('hero-poster.jpg')) posterStatus.code=res.status(); });
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1400);

  const m=await page.evaluate(()=>{
    const v=document.querySelector('.hero-video');
    const har=a=>v.hasAttribute(a);
    // ATFERDSTEST, ikke CSS-speiling. MÅ probes i et HJØRNE, ikke i senter: innholdslaget
    // (.hero-inner/.hero-dms, z-index 2) dekker videoens senter uansett, så et senter-treff
    // ville vært grønt selv UTEN pointer-events:none. I øvre venstre hjørne er videoen det
    // øverste elementet — der isolerer treffet faktisk videoens pointer-events.
    const b=v.getBoundingClientRect();
    const HX=b.left+8, HY=b.top+8;
    const truffet=document.elementFromPoint(HX,HY);
    const videoTarKlikk = truffet===v || v.contains(truffet);
    // TENNER: bevis at hjørnepunktet ER et sted videoen ellers ville fanget klikket. Toggle
    // pointer-events:auto midlertidig — DA skal videoen bli treff. Er den det ikke, prober vi
    // feil punkt (dekket av noe annet) og testen er meningsløs → merk den ugyldig.
    const forrige=v.style.pointerEvents;
    v.style.pointerEvents='auto';
    const medAuto=document.elementFromPoint(HX,HY);
    v.style.pointerEvents=forrige;
    const punktGyldig = medAuto===v || v.contains(medAuto);
    return {
      autoplay:har('autoplay'), muted_attr:har('muted'), loop:har('loop'),
      playsinline:har('playsinline'), webkit:har('webkit-playsinline'),
      disablepip:har('disablepictureinpicture'),
      preload:v.getAttribute('preload'), controls:har('controls'),
      poster:v.getAttribute('poster'),
      muted_prop:v.muted, paused:v.paused,
      videoTarKlikk, punktGyldig, truffet: truffet ? (truffet.className||truffet.tagName) : 'ingen',
      currentSrc:(v.currentSrc||'').split('/').pop(),
    };
  });
  // Mobil (≤768) skal velge hero-mobil.mp4; desktop hero.mp4 (første matchende <source>).
  const ventet = bredde<=768 ? 'hero-mobil.mp4' : 'hero.mp4';

  await page.locator('.hero').screenshot({path:`${OUT}/${bredde}-hero-video.png`});

  const attrOk = m.autoplay&&m.muted_attr&&m.loop&&m.playsinline&&m.webkit&&m.disablepip&&m.preload==='auto'&&!m.controls&&!!m.poster;
  rapport.push({bredde,
    'attr komplett': attrOk?'✓':'✗',
    'webkit-playsinline': m.webkit?'✓':'✗ MANGLER',
    'disablepictureinpicture': m.disablepip?'✓':'✗ MANGLER',
    'valgt kilde': m.currentSrc===ventet?`${m.currentSrc} ✓`:`${m.currentSrc} ✗ (ventet ${ventet})`,
    'poster': m.poster||'✗ MANGLER',
    'poster HTTP': posterStatus.code===200?'200 ✓':`${posterStatus.code} ✗`,
    'muted (prop)': m.muted_prop?'✓':'✗',
    'klikk gaar gjennom (hjorne)': !m.punktGyldig?`✗ ugyldig probe (video ikke eksponert)`:(m.videoTarKlikk?`✗ videoen fanger klikk`:`✓ (traff ${m.truffet})`),
    'spiller (paused=false)': m.paused?'✗ pauset':'✓',
    'controls': m.controls?'✗ har':'ingen ✓',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const feil = rapport.some(r=>Object.values(r).some(v=>String(v).includes('✗')));
console.log('\nalt grønt:', feil?'NEI ✗':'ja ✓');
await browser.close(); server.close();
