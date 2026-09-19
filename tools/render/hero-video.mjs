// site/no/index.html — hero-videoen skal ALDRI vise eller reagere på iOS' native play-knapp.
//
// In-app-browsere (Google-appen, TikTok) og iOS Lavstrømmodus blokkerer autoplay og tegner en
// native play-knapp oppå videoen. Mekanikk (19.09, snudd — se f7608fa + de to foregående rundene):
// videoen er SKJULT som standard (.hero-video{opacity:0}) og vises KUN ved bevist avspilling
// (.hero-video--on{opacity:1}, satt på 'playing'). Blokkeres autoplay, fyrer 'playing' aldri →
// videoen blir usynlig og poster + .hero-background er heroen; iOS tegner aldri knappen på et synlig
// element. 'playing' er ENESTE trigger — ingen timeout, canplay, touch/click/visibilitychange, og
// kun ÉTT play()-kall (avvist autoplay svelges i .catch). Fiksen verifiseres på to nivåer:
//   MARKUP/CSS/ATFERD (per bredde, i nettleseren):
//     1. attributter: autoplay muted loop playsinline webkit-playsinline disablepictureinpicture
//        preload="metadata" poster; INGEN controls
//     2. pointer-events:none på .hero-video → hele videoen er utrykkbar (native knapp kan ikke aktiveres)
//     3. poster satt til et ekte frame (images/hero-poster.jpg finnes og lastes 200)
//     4. ::-webkit-media-controls-start-playback-button + ::-webkit-media-controls skjult
//     5. opacity: videoen er 0 UTEN --on, 1 MED --on; på god linje autoplayer den → --on satt, fade inn
//   KILDE (én gang, mot HTML-en): 'playing' er eneste --on-trigger + tap-play fraværende.
// Headless Chromium autoplayer muted video, så 'playing' fyrer og --on settes her — det bekrefter at
// markupen faktisk lar videoen spille. Selve fraværet av den native knappen kan BARE bekreftes på
// en ekte iOS-enhet (Chromium har aldri hatt knappen); denne testen fanger regresjoner i markup/CSS/JS.
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

// ── KILDE-SJEKK (én gang): isoler hero-video-scriptet og bekreft at 'playing' er ENESTE --on-trigger
//    og at tap-play er borte. Atferdstesten under kan ikke skille disse — Chromium autoplayer, så
//    'playing' fyrer uansett. Kun kildeinspeksjon fanger at scriptet faktisk står i fila og er riktig. ──
const HTML = fs.readFileSync(path.join(ROOT,'no/index.html'),'utf8');
// KUN script-KROPPEN som følger «<!-- Hero-video:»-kommentaren (gruppe 1) — ikke kommentaren, som
// selv nevner «touch/click/visibilitychange» i prosa og ellers gir falsk tap-play-treff. Uten
// scriptet finnes verken kommentar eller script → tom streng.
const heroScript = (HTML.match(/<!-- Hero-video:[\s\S]*?<script>([\s\S]*?)<\/script>/)||['',''])[1];
// 'playing' er ENESTE --on-trigger: en 'playing'-lytter som legger 'hero-video--on', og INGEN andre
// signaler (ingen setTimeout, canplay, touchstart/click/visibilitychange).
const harPlayingTrigger = /addEventListener\(\s*['"]playing['"]/.test(heroScript)
  && /hero-video--on/.test(heroScript);
const andreSignaler = /setTimeout|canplay|touchstart|visibilitychange/.test(heroScript)
  || /addEventListener\(\s*['"]click/.test(heroScript);
const playingEneste = harPlayingTrigger && !andreSignaler;
// TAP-PLAY fraværende: kun ÉTT play()-kall (det ved last), ingen gest-lyttere (dekket av andreSignaler).
const antallPlay = (heroScript.match(/\.play\(/g)||[]).length;
const tapPlayFravaer = !andreSignaler && antallPlay<=1;
const playingOk = playingEneste ? '✓' : `✗ (playing-trigger:${harPlayingTrigger} andre-signaler:${andreSignaler})`;
const tapOk = tapPlayFravaer ? '✓' : `✗ tap-play til stede (andre-signaler:${andreSignaler} play-kall:${antallPlay})`;

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
    // OPACITY-mekanikk: mål 0 UTEN --on og 1 MED --on (toggler klassen, gjenoppretter etterpå).
    // MÅ slå av transition mens vi måler — ellers returnerer getComputedStyle den interpolerte
    // mid-transition-verdien (opacity .4s), ikke målverdien, og gir falskt 1/1.
    const prevTrans = v.style.transition;
    v.style.transition = 'none';
    const onNaa = v.classList.contains('hero-video--on');
    v.classList.remove('hero-video--on'); void v.offsetWidth;
    const opacityUtenOn = getComputedStyle(v).opacity;
    v.classList.add('hero-video--on'); void v.offsetWidth;
    const opacityMedOn = getComputedStyle(v).opacity;
    if(!onNaa) v.classList.remove('hero-video--on'); // gjenopprett den faktiske tilstanden
    v.style.transition = prevTrans;
    return {
      autoplay:har('autoplay'), muted_attr:har('muted'), loop:har('loop'),
      playsinline:har('playsinline'), webkit:har('webkit-playsinline'),
      disablepip:har('disablepictureinpicture'),
      preload:v.getAttribute('preload'), controls:har('controls'),
      poster:v.getAttribute('poster'),
      muted_prop:v.muted, paused:v.paused,
      onNaa, opacityUtenOn, opacityMedOn,
      videoTarKlikk, punktGyldig, truffet: truffet ? (truffet.className||truffet.tagName) : 'ingen',
      currentSrc:(v.currentSrc||'').split('/').pop(),
    };
  });
  // Mobil (≤768) skal velge hero-mobil.mp4; desktop hero.mp4 (første matchende <source>).
  const ventet = bredde<=768 ? 'hero-mobil.mp4' : 'hero.mp4';

  await page.locator('.hero').screenshot({path:`${OUT}/${bredde}-hero-video.png`});

  const attrOk = m.autoplay&&m.muted_attr&&m.loop&&m.playsinline&&m.webkit&&m.disablepip&&m.preload==='metadata'&&!m.controls&&!!m.poster;
  const opacityOk = m.opacityUtenOn==='0' && m.opacityMedOn==='1';
  rapport.push({bredde,
    'attr komplett': attrOk?'✓':`✗ (preload=${m.preload})`,
    'webkit-playsinline': m.webkit?'✓':'✗ MANGLER',
    'disablepictureinpicture': m.disablepip?'✓':'✗ MANGLER',
    'valgt kilde': m.currentSrc===ventet?`${m.currentSrc} ✓`:`${m.currentSrc} ✗ (ventet ${ventet})`,
    'poster': m.poster||'✗ MANGLER',
    'poster HTTP': posterStatus.code===200?'200 ✓':`${posterStatus.code} ✗`,
    'muted (prop)': m.muted_prop?'✓':'✗',
    'klikk gaar gjennom (hjorne)': !m.punktGyldig?`✗ ugyldig probe (video ikke eksponert)`:(m.videoTarKlikk?`✗ videoen fanger klikk`:`✓ (traff ${m.truffet})`),
    'spiller (paused=false)': m.paused?'✗ pauset':'✓',
    'opacity 0-uten / 1-med --on': opacityOk?`✓ (${m.opacityUtenOn}/${m.opacityMedOn})`:`✗ (${m.opacityUtenOn}/${m.opacityMedOn})`,
    '--on satt (god linje)': m.onNaa?'✓':'✗ IKKE satt',
    'controls': m.controls?'✗ har':'ingen ✓',
    'playing eneste trigger (kilde)': playingOk,
    'tap-play fravaer (kilde)': tapOk,
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const feil = rapport.some(r=>Object.values(r).some(v=>String(v).includes('✗')));
console.log('\nalt grønt:', feil?'NEI ✗':'ja ✓');
await browser.close(); server.close();
