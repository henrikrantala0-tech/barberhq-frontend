// Booking-klonens fire tilstander, hver montert ved siden av tilsvarende utsnitt av den
// EKTE publiserte sida, så hver skjerm kan dømmes for seg.
//
// ⚠ SIKRING: skriptet klikker ALDRI noe som matcher /bekreft/i på den ekte sida. Den er
// i produksjon, og et klikk på «Bekreft booking» ville opprettet en ekte booking hos
// barbereren. Tilstand 4 har derfor ingen live-fasit — den sammenlignes mot markupen i
// backendens successHtml() i stedet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const LIVE = 'https://trybarberhq.com/henrik-fades';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const TILSTANDER=[
  {n:1, navn:'forside',      klasser:[],            live:1},
  {n:2, navn:'tjenestevalg', klasser:['vis-sheet'], live:2},
  {n:3, navn:'velg-dato',    klasser:['vis-sheet'], live:3, steg:'dato'},
  {n:4, navn:'velg-tid',     klasser:['vis-sheet'], live:4, steg:'tid'},
  {n:5, navn:'bekreftelse',  klasser:['vis-sheet','vis-success'], live:null},
];

const browser=await chromium.launch();
const rapport=[];

// ── Klonens tilstander ────────────────────────────────────────────────────────
const klonBilder={};
for(const t of TILSTANDER){
  const page=await browser.newPage({viewport:{width:420,height:1000},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.evaluate(({kl,steg})=>{
    const b=document.getElementById('pvBook');
    b.className='pv-book '+kl.join(' ');
    // Scenens bookingLoop kjører mens bildene tas: kvitteringsoverlegget tennes hvert
    // 10. sekund og la seg oppå ALLE fem tilstandene, så det eneste som var synlig var
    // «Booking bekreftet». Tilstandsbildene skal vise tilstanden, ikke animasjonen.
    const ok=document.getElementById('pvOk');
    if(ok){ ok.classList.remove('vis'); ok.style.display='none'; }
    b.querySelectorAll('.pv-on,.pv-press').forEach(e=>e.classList.remove('pv-on','pv-press'));
    // Utgangstilstand i steg 2: datostripe + hint, ingen tider.
    const hdr=b.querySelector('.pv-slotshdr'), grid=b.querySelector('.slots-grid'),
          hint=b.querySelector('.pv-slothint'), knapp=b.querySelector('.pv-next2');
    if(steg){
      const secs=b.querySelectorAll('.acc-section');
      secs[0].classList.add('done');
      secs[0].querySelector('.acc-bd').classList.remove('open');
      secs[1].classList.remove('locked');
      secs[1].querySelector('.acc-bd').classList.add('open');
    }
    if(steg==='dato'){
      if(hdr)hdr.style.display='none'; if(grid)grid.style.display='none';
      if(knapp)knapp.textContent='Til bekreftelse';
    } else if(steg==='tid'){
      if(hint)hint.style.display='none';
      const dag=b.querySelector('.pv-dag'); if(dag)dag.classList.add('sel');
      const slot=b.querySelector('.pv-slot'); if(slot)slot.classList.add('sel');
    } else {
      if(hdr)hdr.style.display='none'; if(grid)grid.style.display='none'; if(hint)hint.style.display='none';
    }
    document.querySelectorAll('#scene .mock').forEach(m=>m.classList.toggle('on', m.dataset.i==='2'));
  },{kl:t.klasser,steg:t.steg||null});
  await page.waitForTimeout(500);
  const fil=`${OUT}/klon-tilstand-${t.n}-${t.navn}.png`;
  // Skjermflaten, ikke telefonrammen: fasiten er et rent 320×693-utsnitt, og en ramme
  // rundt det ene bildet gjør at de to skaleres ulikt i montasjen.
  await page.locator('#scene .mock[data-i="2"] .iph-screen').screenshot({path:fil});
  klonBilder[t.n]=fil;
  rapport.push({tilstand:t.n, navn:t.navn, kilde:'klon',
    jsfeil:errs.length?errs.join(';').slice(0,30):'ingen'});
  await page.close();
}

// ── Den ekte sida, tilstand 1–3. Ingen skriveoperasjoner. ────────────────────
const liveBilder={};
{
  // 320×693 = telefonens skjermflate i designpiksler (9:19,5). Fasiten må vise SAMME
  // rektangel som klonen, ellers sammenlignes to ulike utsnitt og alt ser feil ut.
  const page=await browser.newPage({viewport:{width:320,height:693},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  // Hard sikring: blokkér enhver POST/PATCH/PUT mot API-et.
  await page.route('**/*',route=>{
    const m=route.request().method();
    if(m!=='GET'&&m!=='HEAD'){ console.log('  ⚠ blokkerte '+m+' '+route.request().url().slice(0,60)); return route.abort(); }
    route.continue();
  });
  await page.goto(LIVE,{waitUntil:'networkidle'});
  await page.waitForTimeout(900);
  liveBilder[1]=`${OUT}/live-tilstand-1.png`;
  await page.screenshot({path:liveBilder[1]});

  const se=await page.$('#seeServices');
  if(se){ await se.click(); await page.waitForTimeout(900);
    liveBilder[2]=`${OUT}/live-tilstand-2.png`;
    await page.screenshot({path:liveBilder[2]});
    // Velg tjenesten, gå til steg 2. Ingen «Bekreft».
    const svc=await page.$('.svc-card'); if(svc){ await svc.click(); await page.waitForTimeout(400); }
    const n1=await page.$('#next1'); if(n1 && await n1.isEnabled()){ await n1.click(); await page.waitForTimeout(1400); }
    liveBilder[3]=`${OUT}/live-tilstand-3.png`;      // datovelger, ingen dato valgt
    await page.screenshot({path:liveBilder[3]});
    // Velg en ledig dato → tidene hentes. Kun GET; «Bekreft» røres aldri.
    const dag=await page.$('.date-chip:not(.closed):not([disabled])');
    if(dag){ await dag.click(); await page.waitForTimeout(1800);
      const slot=await page.$('.slot-btn'); if(slot){ await slot.click(); await page.waitForTimeout(500); }
      liveBilder[4]=`${OUT}/live-tilstand-4.png`;
      await page.screenshot({path:liveBilder[4]});
    }
  }
  rapport.push({tilstand:'1–4', navn:'ekte side', kilde:'live',
    jsfeil:errs.length?errs.join(';').slice(0,30):'ingen'});
  await page.close();
}

// ── Monter side om side ──────────────────────────────────────────────────────
{
  const b64=f=>fs.existsSync(f)?'data:image/png;base64,'+fs.readFileSync(f).toString('base64'):'';
  const rader=TILSTANDER.map(t=>`
    <div class="rad">
      <div class="tit">${t.n}. ${t.navn.replace(/-/g,' ')}</div>
      <div class="par">
        <figure><img src="${b64(klonBilder[t.n])}"><figcaption>KLON — #produkt (skjermflate)</figcaption></figure>
        <figure>${liveBilder[t.n]?`<img src="${b64(liveBilder[t.n])}">`:'<div class="ingen">ingen live-fasit<br><small>ville krevd en ekte booking</small></div>'}<figcaption>EKTE — /henrik-fades @320×693</figcaption></figure>
      </div>
    </div>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{background:#0a0a0a;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;margin:0;padding:24px}
    h1{font-size:18px;margin:0 0 20px}
    .rad{margin-bottom:26px}
    .tit{font-size:15px;font-weight:700;margin-bottom:10px;text-transform:capitalize}
    .par{display:flex;gap:18px;align-items:flex-start}
    figure{margin:0}
    img{height:620px;width:auto;display:block;border-radius:8px}
    figcaption{color:#8a8a8a;font-size:11px;margin-top:6px}
    .ingen{height:620px;width:300px;display:grid;place-items:center;text-align:center;
      color:#7a7a7a;border:1px dashed #333;border-radius:8px}
  </style></head><body><h1>Booking — klon mot ekte side, tilstand for tilstand</h1>${rader}</body></html>`;
  const page=await browser.newPage({viewport:{width:820,height:1000},deviceScaleFactor:2});
  await page.setContent(html,{waitUntil:'networkidle'});
  await page.screenshot({path:`${OUT}/likhet-booking-tilstander.png`,fullPage:true});
  await page.close();
  console.log('montert → .render-ut/likhet-booking-tilstander.png');
}

console.table(rapport);
await browser.close(); server.close();
