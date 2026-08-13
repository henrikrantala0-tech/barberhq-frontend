// site/no/index.html — målt kontrast for teksten i .final-cta mot bakgrunnsbildet, på mobil.
//
// Bakgrunnen er et FOTO under en maske, ikke en flat farge, så «ser mørkt ut» er ikke en
// måling. Kommentaren i CSS-en UTLEDET en alpha-verdi fra det forrige oppsettet (60 %/30 %,
// P=340 ⇒ 9,87:1) og antok at samme alpha gjelder for 55 %/72 %/620. Denne testen måler det
// i stedet: teksten skjules, bakgrunnen fotograferes, og den LYSESTE piksel i hvert
// tekstområde brukes — worst case, ikke gjennomsnitt, siden ett lyst parti bak en bokstav
// er nok til å bryte lesbarheten.
//
// Sjekker samtidig det CSS-kommentaren advarer om: at `@media(max-width:760px){.section
// {padding:64px 20px}}` lenger nede i fila ikke vinner på kildeorden over
// `.section.final-cta{padding:620px 22px 72px}`. De har SAMME spesifisitet, så rekkefølgen
// i fila avgjør — og en «stille» overstyring her ga 1,00:1 forrige gang.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

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

// WCAG relativ luminans + kontrastforhold.
const kanal=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
const lum=(r,g,b)=>0.2126*kanal(r)+0.7152*kanal(g)+0.0722*kanal(b);
const kontrast=(l1,l2)=>{const a=Math.max(l1,l2),b=Math.min(l1,l2);return (a+0.05)/(b+0.05);};
const parseRgb=s=>s.match(/\d+(\.\d+)?/g).slice(0,3).map(Number);

// Lyseste piksel i et utsnitt — worst case for lys tekst på foto.
async function lysestePiksel(png, boks, dsf){
  const {data,info}=await sharp(png).extract({
    left:Math.max(0,Math.round(boks.x*dsf)), top:Math.max(0,Math.round(boks.y*dsf)),
    width:Math.max(1,Math.round(boks.width*dsf)), height:Math.max(1,Math.round(boks.height*dsf)),
  }).raw().toBuffer({resolveWithObject:true});
  const kan=info.channels;
  let best=-1, px=null;
  for(let i=0;i<data.length;i+=kan){
    const L=lum(data[i],data[i+1],data[i+2]);
    if(L>best){best=L;px=[data[i],data[i+1],data[i+2]];}
  }
  return {L:best, rgb:px};
}

const browser=await chromium.launch();
const rapport=[], padRapport=[];
const DSF=2;

for(const bredde of [320,375]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:DSF});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    document.documentElement.style.scrollBehavior='auto';
    const h=document.body.scrollHeight;
    for(let y=0;y<h;y+=400){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}
  });
  await page.waitForTimeout(900);

  // Kaskade-sjekken: hvilken regel vinner faktisk på padding-top?
  const pad=await page.evaluate(()=>{
    const sec=document.querySelector('.final-cta');
    const s=getComputedStyle(sec);
    return {padTop:s.paddingTop, padBunn:s.paddingBottom, padVenstre:s.paddingLeft,
            hoyde:Math.round(sec.getBoundingClientRect().height),
            maske:getComputedStyle(document.querySelector('.cta-bg')).maskImage
                  ||getComputedStyle(document.querySelector('.cta-bg')).webkitMaskImage};
  });
  padRapport.push({bredde, 'padding-top':pad.padTop, 'padding bunn/venstre':`${pad.padBunn}/${pad.padVenstre}`,
    'seksjonshøyde':`${pad.hoyde}px`,
    'vinner .section.final-cta?': pad.padTop==='620px'?'ja ✓':`NEI ✗ (fikk ${pad.padTop} — .section overstyrer)`});

  // Bokser FØR teksten skjules, i sidekoordinater.
  const bokser=await page.evaluate(()=>{
    const sec=document.querySelector('.final-cta');
    const h2=sec.querySelector('h2'), p=sec.querySelector('p');
    const abs=el=>{const r=el.getBoundingClientRect();
      return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height};};
    return {h2:abs(h2), p:abs(p), sec:abs(sec),
            h2farge:getComputedStyle(h2).color, pfarge:getComputedStyle(p).color};
  });

  // Referansebilde MED tekst, til godkjenning.
  await page.screenshot({path:`${OUT}/${bredde}-cta-med-tekst.png`,clip:bokser.sec,fullPage:true});

  // Skjul teksten — visibility beholder layouten, så boksene over er fortsatt gyldige.
  await page.addStyleTag({content:'.final-cta .cta-body{visibility:hidden!important}'});
  await page.waitForTimeout(150);
  const bakgrunn=`${OUT}/${bredde}-cta-bakgrunn.png`;
  await page.screenshot({path:bakgrunn,clip:bokser.sec,fullPage:true});

  // Boksene er relative til utsnittet vi nettopp tok.
  const rel=b=>({x:b.x-bokser.sec.x, y:b.y-bokser.sec.y, width:b.width, height:b.height});
  const bh2=await lysestePiksel(bakgrunn, rel(bokser.h2), DSF);
  const bp =await lysestePiksel(bakgrunn, rel(bokser.p),  DSF);

  const [r1,g1,b1]=parseRgb(bokser.h2farge), [r2,g2,b2]=parseRgb(bokser.pfarge);
  const kh2=kontrast(lum(r1,g1,b1), bh2.L);
  const kp =kontrast(lum(r2,g2,b2), bp.L);

  rapport.push({bredde,
    'h2-farge':bokser.h2farge, 'lyseste bak h2':`rgb(${bh2.rgb.join(',')})`,
    'h2 kontrast':`${kh2.toFixed(2)}:1 ${kh2>=4.5?'✓':'✗'}`,
    'p-farge':bokser.pfarge, 'lyseste bak p':`rgb(${bp.rgb.join(',')})`,
    'p kontrast':`${kp.toFixed(2)}:1 ${kp>=4.5?'✓':'✗'}`,
    jsfeil:errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(padRapport);
console.log('\nMÅLT KONTRAST (lyseste piksel i tekstområdet — worst case):');
console.table(rapport);
const darlig=rapport.filter(r=>r['h2 kontrast'].includes('✗')||r['p kontrast'].includes('✗'));
console.log('\nalle over 4,5:1:', darlig.length?`NEI ✗ (${darlig.map(r=>r.bredde).join(', ')})`:'ja ✓');
console.log('kaskade:        ', padRapport.every(r=>r['vinner .section.final-cta?']==='ja ✓')?'.section.final-cta vinner ✓':'NEI ✗');
console.log('jsfeil:         ', rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
await browser.close(); server.close();
