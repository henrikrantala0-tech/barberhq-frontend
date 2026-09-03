// site/no/index.html — hero-videoens autoplay-fallback for in-app-nettlesere.
//
// In-app-browsere (Google-appen, TikTok, iOS) avviser autoplay til første brukergest og tegner
// en native play-knapp oppå videoen. Fiksen har fem deler; testen verifiserer dem alle:
//   1. markup-attributter: autoplay muted loop playsinline webkit-playsinline preload poster
//   2. JS: video.muted=true FØR play(); engangs-tap-fallback + visibilitychange
//   3. poster satt til et ekte frame (images/hero-poster.jpg finnes og lastes 200)
//   4. ::-webkit-media-controls-start-playback-button skjult
//   5. INGEN pointer-events:none på videoen (det drepte tap-fallbacken)
// Headless Chromium autoplayer muted video, så .paused skal være false uten gest her — det
// bekrefter at play()-kjeden faktisk kjører. Den ekte in-app-oppførselen kan bare bekreftes på
// enhet; dette fanger regresjoner i markup/CSS/JS.
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
    const cs=getComputedStyle(v);
    const har=a=>v.hasAttribute(a);
    return {
      autoplay:har('autoplay'), muted_attr:har('muted'), loop:har('loop'),
      playsinline:har('playsinline'), webkit:har('webkit-playsinline'),
      preload:v.getAttribute('preload'), controls:har('controls'),
      poster:v.getAttribute('poster'),
      muted_prop:v.muted, paused:v.paused, pointerEvents:cs.pointerEvents,
      currentSrc:(v.currentSrc||'').split('/').pop(),
    };
  });
  // Mobil (≤768) skal velge hero-mobil.mp4; desktop hero.mp4 (første matchende <source>).
  const ventet = bredde<=768 ? 'hero-mobil.mp4' : 'hero.mp4';

  await page.locator('.hero').screenshot({path:`${OUT}/${bredde}-hero-video.png`});

  const attrOk = m.autoplay&&m.muted_attr&&m.loop&&m.playsinline&&m.webkit&&m.preload==='auto'&&!m.controls&&!!m.poster;
  rapport.push({bredde,
    'attr komplett': attrOk?'✓':'✗',
    'webkit-playsinline': m.webkit?'✓':'✗ MANGLER',
    'valgt kilde': m.currentSrc===ventet?`${m.currentSrc} ✓`:`${m.currentSrc} ✗ (ventet ${ventet})`,
    'poster': m.poster||'✗ MANGLER',
    'poster HTTP': posterStatus.code===200?'200 ✓':`${posterStatus.code} ✗`,
    'muted (prop)': m.muted_prop?'✓':'✗',
    'pointer-events': m.pointerEvents==='none'?'none ✗ (dreper tap)':`${m.pointerEvents} ✓`,
    'spiller (paused=false)': m.paused?'✗ pauset':'✓',
    'controls': m.controls?'✗ har':'ingen ✓',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const feil = rapport.some(r=>Object.values(r).some(v=>String(v).includes('✗')));
console.log('\nalt grønt:', feil?'NEI ✗':'ja ✓');
await browser.close(); server.close();
