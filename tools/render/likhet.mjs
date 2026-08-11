// Likhetssjekk: den EKTE publiserte bookingsida mot klonen i produktvisningen, side om
// side i ett bilde på 320. Poenget er å se om klonen faktisk ser ut som produktet — ikke
// om den ser pen ut. Avvik i typografi, farge eller avstand skal være synlige umiddelbart.
//
// Den ekte sida hentes over nett (https://trybarberhq.com/henrik-fades). Uten nett faller
// scriptet tilbake til kun klon-bildet og sier fra — en halv sammenligning er verre enn
// en tydelig beskjed om at fasiten mangler.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{
  const rel=decodeURIComponent(q.url.split('?')[0]);
  const f = rel.startsWith('/ut/') ? path.join(OUT, rel.slice(4)) : path.join(ROOT, rel);
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const browser=await chromium.launch();
const rapport=[];
let ekteOk=false;

// ── 1. Fasit: den ekte sida, sheet åpnet ───────────────────────────────────────
try{
  const page=await browser.newPage({viewport:{width:320,height:820},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('https://trybarberhq.com/henrik-fades',{waitUntil:'networkidle',timeout:25000});
  await page.click('#seeServices',{timeout:8000});          // «Se tjenester» → sheet glir opp
  await page.waitForTimeout(1200);
  await page.locator('.sheet-inner').screenshot({path:`${OUT}/likhet-ekte.png`});
  const m=await page.evaluate(()=>{
    const cs=el=>el?getComputedStyle(el):null;
    const kort=document.querySelector('.svc-card'), nm=document.querySelector('.svc-nm'),
          meta=document.querySelector('.svc-meta'), t=document.querySelector('.acc-t');
    return {
      svcNmPx:nm?cs(nm).fontSize:'—', svcNmVekt:nm?cs(nm).fontWeight:'—',
      svcMetaPx:meta?cs(meta).fontSize:'—',
      accTPx:t?cs(t).fontSize:'—',
      kortKant:kort?cs(kort).borderTopWidth+' '+cs(kort).borderTopColor:'—',
      kortRadius:kort?cs(kort).borderTopLeftRadius:'—',
      bakgrunn:cs(document.body).backgroundColor,
    };
  });
  rapport.push({kilde:'EKTE /henrik-fades', ...m, jsfeil:errs.length?'JA':'ingen'});
  ekteOk=true;
  await page.close();
}catch(e){
  console.log('⚠ Fikk ikke hentet den ekte sida: ' + e.message.split('\n')[0]);
  console.log('  → likhetsbildet blir ensidig. Henrik må levere fasit-screenshot.');
}

// ── 2. Klonen, samme bredde ────────────────────────────────────────────────────
{
  const page=await browser.newPage({viewport:{width:320,height:820},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  // Booking-kortet må være AKTIVT i skuddet. Inaktive kort har opacity .5 +
  // brightness(.7), og en nedtonet klon kan ikke sammenlignes med en fasit i full farge —
  // den ville sett «feil» ut av en grunn som ikke har med klonen å gjøre.
  await page.evaluate(()=>{
    document.querySelectorAll('#scene .mock').forEach(k=>k.classList.toggle('on',k.dataset.i==='2'));
  });
  await page.waitForTimeout(900);
  // Klonen er skalert (0,744 på mobil). For en ÆRLIG sammenligning av typografi måles
  // px FØR skalering — getComputedStyle gir designverdien, rect gir den skalerte.
  await page.locator('#produkt .mock[data-i="2"] .iph-screen').screenshot({path:`${OUT}/likhet-klon.png`});
  const m=await page.evaluate(()=>{
    const cs=el=>el?getComputedStyle(el):null;
    const rot=document.querySelector('#produkt .pv-book');
    const kort=rot.querySelector('.svc-card'), nm=rot.querySelector('.svc-nm'),
          meta=rot.querySelector('.svc-meta'), t=rot.querySelector('.acc-t');
    return {
      svcNmPx:nm?cs(nm).fontSize:'—', svcNmVekt:nm?cs(nm).fontWeight:'—',
      svcMetaPx:meta?cs(meta).fontSize:'—',
      accTPx:t?cs(t).fontSize:'—',
      kortKant:kort?cs(kort).borderTopWidth+' '+cs(kort).borderTopColor:'—',
      kortRadius:kort?cs(kort).borderTopLeftRadius:'—',
      bakgrunn:cs(rot).backgroundColor,
    };
  });
  rapport.push({kilde:'KLON #produkt', ...m, jsfeil:errs.length?'JA':'ingen'});
  await page.close();
}

// ── 3. Monter side om side ─────────────────────────────────────────────────────
{
  const bilder = ekteOk
    ? `<figure><img src="${`http://localhost:${PORT}`}/ut/likhet-ekte.png"><figcaption>EKTE — /henrik-fades @320</figcaption></figure>
       <figure><img src="${`http://localhost:${PORT}`}/ut/likhet-klon.png"><figcaption>KLON — #produkt @320 (skalert 0,744)</figcaption></figure>`
    : `<figure><img src="${`http://localhost:${PORT}`}/ut/likhet-klon.png"><figcaption>KLON — #produkt @320. FASIT MANGLER (ikke nett).</figcaption></figure>`;
  const page=await browser.newPage({viewport:{width:900,height:1000},deviceScaleFactor:2});
  await page.setContent(`<!DOCTYPE html><meta charset="utf-8"><style>
    body{margin:0;background:#0a0a0a;color:#fff;font:13px/1.5 system-ui;padding:22px}
    .rad{display:flex;gap:26px;align-items:flex-start}
    figure{margin:0}
    img{display:block;border:1px solid #2a2a2a;border-radius:8px;max-height:820px;width:auto}
    figcaption{margin-top:9px;color:#8a8a8a;letter-spacing:.02em}
    h1{font-size:15px;font-weight:700;margin:0 0 18px;letter-spacing:.02em}
  </style><h1>Likhetssjekk — booking: ekte vs. klon @320</h1><div class="rad">${bilder}</div>`,
    {waitUntil:'networkidle'});
  await page.waitForTimeout(400);
  await page.screenshot({path:`${OUT}/likhet-booking-320.png`,fullPage:true});
  await page.close();
}

console.table(rapport);
if(rapport.length===2){
  const [e,k]=rapport;
  const felt=['svcNmPx','svcNmVekt','svcMetaPx','accTPx','kortKant','kortRadius'];
  const avvik=felt.filter(f=>e[f]!==k[f]);
  console.log('\navvik i målte verdier:', avvik.length?avvik.join(', '):'ingen ✓');
}
console.log('\nmontasje: .render-ut/likhet-booking-320.png');
await browser.close(); server.close();
