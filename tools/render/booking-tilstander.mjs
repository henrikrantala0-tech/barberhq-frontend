// Booking-klonens seks tilstander, hver montert ved siden av tilsvarende utsnitt av den
// EKTE publiserte sida, så hver skjerm kan dømmes for seg.
//
// ⚠ SIKRING, tre lag. Sida er i produksjon, og ett klikk på «Bekreft booking» ville
// opprettet en ekte booking hos barbereren:
//   1. Alt annet enn GET/HEAD blokkeres på nettverksnivå (route-avskjæring).
//   2. klikk() nekter å klikke innsendingsknappen: matcher elementet .sub-btn/#sub-btn/
//      [type=submit], eller har teksten «Bekreft booking», kaster den i stedet for å
//      klikke. Vakta er en faktisk sjekk, ikke bare en kommentar som lover det.
//      Den kan IKKE være en bred /bekreft/i-test: «Til bekreftelse · 30 min · 300 kr»
//      åpner bare trinn 3 og sender ingenting — en bred vakt gjorde trinn 3 uhentbart.
// Trinn 3 («Dine opplysninger») ER trygt å hente fra ekte side: å åpne skjemaet og fylle
// felter sender ingenting. Bare TILSTAND 6 (kvitteringen) mangler fasit, fordi den ikke
// finnes uten en fullført booking — den sammenlignes mot successHtml() i backend.
//
// ⚠ TILSTANDENE SETTES FRA EN NULLSTILT BASIS, ikke oppå det markupen tilfeldigvis
// leveres med. Klon-markupen ligger frosset i dato-steget (steg 1 «done», steg 2 «open»),
// fordi det er der scenens animasjon spiller. Første versjon rørte bare den grenen som
// hørte til tilstanden som ble satt, og da arvet «tjenestevalg» dato-steget: tilstand 2
// og 3 ble nesten samme bilde, og forskjellen mot fasiten så ut som en feil i klonen.
// nullstill() fjerner done/locked/open/sel overalt FØR hver tilstand bygges.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const LIVE = 'https://trybarberhq.com/henrik-fades';
const DESIGN_W = 320, DESIGN_H = Math.round(DESIGN_W*19.5/9);   // 693

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

// Seks tilstander: hele reisen, ikke fire skjermer og en kvittering. Trinn 3
// («Dine opplysninger») manglet helt i første runde — den ble aldri montert, og
// dermed heller aldri sammenlignet med fasiten.
const TILSTANDER=[
  {n:1, navn:'forside',           steg:'cover'},
  {n:2, navn:'tjenestevalg',      steg:'tjeneste'},
  {n:3, navn:'velg-dato',         steg:'dato'},
  {n:4, navn:'velg-tid',          steg:'tid'},
  {n:5, navn:'dine-opplysninger', steg:'skjema'},
  {n:6, navn:'bekreftelse',       steg:'kvittering'},
];
// Demokunden. Marcus er samme navn som står i kalendermockupen (kort 0), så den
// samme kunden går igjen gjennom scenen. Nummeret er 900 00 000 — innenfor norsk
// mobilformat, men åpenbart en plassholder, aldri et nummer som kan tilhøre noen.
const DEMO_NAVN='Marcus', DEMO_TLF='900 00 000';

const browser=await chromium.launch();
const rapport=[]; const maal=[]; let skjema=null;

// ── Klonens tilstander ────────────────────────────────────────────────────────
const klonBilder={}; let klonPx=null;
for(const t of TILSTANDER){
  const page=await browser.newPage({viewport:{width:420,height:1000},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const m=await page.evaluate(({steg,demo})=>{
    const b=document.getElementById('pvBook');
    // (Kvitteringsoverlegget #pvOk er fjernet — bekreftelsen er vis-success, tilstand 6.
    //  Det pleide å legge seg oppå alle tilstandsbildene og måtte skjules her.)
    // ALL bevegelse av mens tilstanden bygges og måles. Uten dette leses hver geometri
    // MIDT i en overgang: .acc-bd åpner med grid-template-rows 0fr→1fr over 250ms, så
    // trinn 3 hadde fortsatt null høyde da vi regnet ut hvor mye arket flyter over —
    // svaret ble «ingen overflyt», arket ble ikke flyttet, og «Bekreft booking» sto
    // klippet. Stilen fjernes igjen før skjermbildet tas.
    if(!document.getElementById('pv-ingen-bevegelse')){
      const st=document.createElement('style'); st.id='pv-ingen-bevegelse';
      st.textContent='#produkt .pv-book, #produkt .pv-book *{transition:none !important;animation:none !important}';
      document.head.appendChild(st);
    }

    // ── NULLSTILLING ────────────────────────────────────────────────────────
    b.className='pv-book';
    b.querySelectorAll('.pv-on,.pv-press').forEach(e=>e.classList.remove('pv-on','pv-press'));
    b.querySelectorAll('.sel').forEach(e=>e.classList.remove('sel'));
    b.querySelectorAll('.acc-section').forEach(e=>e.classList.remove('done','locked'));
    b.querySelectorAll('.acc-bd').forEach(e=>e.classList.remove('open'));
    const hdr=b.querySelector('.pv-slotshdr'), grid=b.querySelector('.slots-grid'),
          hint=b.querySelector('.pv-slothint'), next2=b.querySelector('.pv-next2'),
          secs=[...b.querySelectorAll('.acc-section')];
    // Hver tilstand setter display EKSPLISITT på alle tre, så ingen tilstand arver
    // en antakelse fra en annen.
    const vis=(el,på)=>{ if(el) el.style.display = på ? '' : 'none'; };

    // ── OPPBYGGING ──────────────────────────────────────────────────────────
    if(steg==='cover'){
      secs[1].classList.add('locked'); secs[2].classList.add('locked');
      vis(hdr,false); vis(grid,false); vis(hint,false);
    }
    if(steg==='tjeneste'){
      b.classList.add('vis-sheet');
      secs[0].querySelector('.acc-bd').classList.add('open');
      secs[1].classList.add('locked'); secs[2].classList.add('locked');
      vis(hdr,false); vis(grid,false); vis(hint,false);
    }
    if(steg==='dato'||steg==='tid'){
      b.classList.add('vis-sheet');
      secs[0].classList.add('done');
      secs[1].querySelector('.acc-bd').classList.add('open');
      secs[2].classList.add('locked');
    }
    if(steg==='dato'){
      // Fasiten: ingen dato valgt ⇒ hint synlig, ingen tider, og knappen DISABLED.
      // Teksten røres ikke — «Til bekreftelse · 30 min · 300 kr» kommer fra klonen og
      // er noe av det som skal måles. Forrige versjon overskrev den med «Til
      // bekreftelse», og da manglet sammendraget i bildet uten at klonen manglet det.
      vis(hint,true); vis(hdr,false); vis(grid,false);
      if(next2) next2.disabled=true;
    }
    if(steg==='tid'){
      vis(hint,false); vis(hdr,true); vis(grid,true);
      const dag=b.querySelector('.pv-dag'); if(dag)dag.classList.add('sel');
      const slot=b.querySelector('.pv-slot'); if(slot)slot.classList.add('sel');
      if(next2) next2.disabled=false;
    }
    if(steg==='skjema'){
      // Trinn 1 OG 2 kollapset med sine sammendrag, trinn 3 åpent. Sammendragene
      // ligger i markupen («Klipp · 300 kr» / «tor 13. aug · 11:00») i modulens eget
      // format — de settes ikke her, så et format-avvik ville blitt synlig i bildet.
      b.classList.add('vis-sheet');
      secs[0].classList.add('done');
      secs[1].classList.add('done');
      secs[2].querySelector('.acc-bd').classList.add('open');
      vis(hdr,false); vis(grid,false); vis(hint,false);
      // Feltene fylles her, ikke i markupen: animasjonen skal eie utfyllingen som et
      // eget steg, og et value= i markupen ville vist et ferdig utfylt skjema før
      // animasjonen hadde spilt det.
      const navn=b.querySelector('input[autocomplete="name"]'),
            tlf =b.querySelector('input[autocomplete="tel"]');
      if(navn) navn.value=demo.navn;
      if(tlf)  tlf.value =demo.tlf;
      // Ekte side scroller arket når trinn 3 åpnes, ellers havner «Bekreft booking»
      // under skjermkanten. Klonen kan ikke scrolle, så vi flytter arket like langt
      // som det faktisk flyter over — regnet ut, ikke gjettet.
      b.classList.add('vis-scroll');
      const ark=b.querySelector('.sheet');
      const skjerm0=b.closest('.iph-screen').getBoundingClientRect();
      const bunn=b.querySelector('.pay-note').getBoundingClientRect().bottom;
      const sk=(function(){let x=1,e=b;while(e&&e!==document.body){const tr=getComputedStyle(e).transform;
        if(tr&&tr!=='none')x*=parseFloat(tr.split(/[(,]/)[1])||1;e=e.parentElement;}return x;})();
      // 24px klaring, ikke 10: med 10 havnet betalingsnotatens ANDRE linje under kanten.
      // Knappen var innenfor, så en vakt som bare så på knappen sa «ja ✓» på et bilde
      // der teksten under var klippet. Nå måles begge.
      const overflyt=(bunn-(skjerm0.bottom-24))/sk;    // i designpiksler
      b.style.setProperty('--pv-scroll', (overflyt>0?-Math.ceil(overflyt):0)+'px');
      void ark.offsetHeight;                 // tving omflyt så målingen under er etter flyttingen
    }
    if(steg==='kvittering'){
      b.classList.add('vis-sheet','vis-success');
      vis(hdr,false); vis(grid,false); vis(hint,false);
    }
    document.querySelectorAll('#scene .mock').forEach(x=>x.classList.toggle('on', x.dataset.i==='2'));

    // ── MÅLINGER ────────────────────────────────────────────────────────────
    const skjerm=b.closest('.iph-screen');
    const rs=skjerm.getBoundingClientRect();
    const cs=next2?getComputedStyle(next2):null;
    return {
      skjermCss:[Math.round(rs.width*100)/100, Math.round(rs.height*100)/100],
      accApen:secs.map((x,i)=>(x.classList.contains('done')?'done':x.classList.contains('locked')?'locked':'')
        +(x.querySelector('.acc-bd').classList.contains('open')?'+open':'')||'lukket').join(' | '),
      valgt:[...b.querySelectorAll('.sel')].map(e=>e.className.split(' ')[0]).join(',')||'ingen',
      next2:next2?{tekst:next2.textContent.trim(), disabled:next2.disabled,
        bg:cs.backgroundColor, cursor:cs.cursor}:null,
      hintSynlig:hint?getComputedStyle(hint).display!=='none':null,
      antallSlots:b.querySelectorAll('.slot-btn').length,
      slotsSynlig:grid?getComputedStyle(grid).display!=='none':null,
      // Trinn 3 måles på det som faktisk står i DOM-en: etikett + verdi per felt,
      // om samtykkeboksen er synlig, og knappens tekst/disabled. Da blir det synlig
      // hvis modulen får et felt til uten at klonen følger etter.
      felter:[...b.querySelectorAll('.fld')].map(f=>{
          const l=f.querySelector('label'), i=f.querySelector('input');
          return (l?l.textContent:'?')+'='+((i&&i.value)?i.value:'(tom)');
        }).join(' · ')||'—',
      samtykke:(function(){const c=b.querySelector('.consent-slot');
        return c?(getComputedStyle(c).display==='none'?'skjult':'SYNLIG'):'MANGLER';})(),
      knapp3:(function(){const x=b.querySelector('.sub-btn');
        return x?x.textContent.trim()+(x.disabled?' [disabled]':''):'MANGLER';})(),
      // Er hele skjemaet innenfor skjermen etter flyttingen?
      knappSynlig:(function(){const sc=b.closest('.iph-screen'); if(!sc)return '—';
        const s0=sc.getBoundingClientRect();
        const inne=el=>{ if(!el) return false; const r=el.getBoundingClientRect();
          return r.top>=s0.top-1 && r.bottom<=s0.bottom+1; };
        const knapp=inne(b.querySelector('.sub-btn')), notat=inne(b.querySelector('.pay-note'));
        return (knapp&&notat)?'ja ✓':(knapp?'knapp ja, NOTAT KLIPPET ✗':'NEI ✗ (klippet)');})(),
      chipSignal:[...b.querySelectorAll('.date-chip')].map(c=>{
        const full=c.querySelector('.dc-full'), dot=c.querySelector('.dc-dot');
        return (c.querySelector('.dc-d').textContent)
          +(full&&getComputedStyle(full).display!=='none'?':FULLT':'')
          +(dot&&getComputedStyle(dot).visibility==='visible'?':prikk':'')
          +(c.disabled?':stengt':'');
      }).join(' '),
    };
  },{steg:t.steg,demo:{navn:DEMO_NAVN,tlf:DEMO_TLF}});
  await page.evaluate(()=>{const st=document.getElementById('pv-ingen-bevegelse'); if(st) st.remove();});
  await page.waitForTimeout(400);
  const fil=`${OUT}/klon-tilstand-${t.n}-${t.navn}.png`;
  // Skjermflaten, ikke telefonrammen: fasiten er et rent 320×693-utsnitt, og en ramme
  // rundt det ene bildet gjør at de to skaleres ulikt i montasjen.
  await page.locator('#scene .mock[data-i="2"] .iph-screen').screenshot({path:fil});
  klonBilder[t.n]=fil;
  // Størrelsen leses av den FAKTISKE PNG-en, ikke av det målte CSS-rektangelet.
  // getBoundingClientRect ga 472×1023 der filen ble 472×1026 (avrunding i
  // skjermbilde-klippet), og fasiten ble da 4px kortere enn klonen — nok til at
  // pikselvakta slo ut på noe som ikke var en feil i klonen.
  if(!klonPx){ const b=fs.readFileSync(fil); klonPx=[b.readUInt32BE(16), b.readUInt32BE(20)]; }
  rapport.push({tilstand:t.n, navn:t.navn, 'acc (1|2|3)':m.accApen, valgt:m.valgt,
    knapp:m.next2?(m.next2.disabled?'DISABLED ':'aktiv ')+'«'+m.next2.tekst+'»':'—',
    hint:m.hintSynlig===null?'—':(m.hintSynlig?'synlig':'skjult'),
    luker:m.slotsSynlig?m.antallSlots:'skjult',
    skjema:t.steg==='skjema'?m.felter:'—',
    'knapp synlig':t.steg==='skjema'?m.knappSynlig:'—',
    jsfeil:errs.length?errs.join(';').slice(0,30):'ingen'});
  maal.push({tilstand:t.n, chipSignal:m.chipSignal, knappBg:m.next2&&m.next2.bg,
    knappCursor:m.next2&&m.next2.cursor});
  if(t.steg==='skjema') skjema={felter:m.felter, samtykke:m.samtykke, 'knapp':m.knapp3};
  await page.close();
}

// ── Den ekte sida, tilstand 1–4. Ingen skriveoperasjoner. ────────────────────
// Fasiten rendres i KLONENS pikselstørrelse: klonens skjermflate er 320 designpiksler
// skalert ned i telefonrammen, så den har færre piksler enn en 320×693-fasit på DSF 2.
// Forrige montasje strakk klonen opp til fasitens høyde, og resultatet så gråere og
// mykere ut enn klonen faktisk er — det ble rapportert som en fargeforskjell og var
// ren oppskalering. Nå velges DSF slik at begge sider får identisk pikselstørrelse.
const FASIT_DSF = Math.round(klonPx[0]/DESIGN_W*10000)/10000;
// Høyden regnes ut av klonens faktiske piksler, ikke av designhøyden: klonens
// skjermflate er 1026px der 693×DSF gir 1022. Fire piksler, men vakta under krever
// eksakt likhet, og et fast 693 ville meldt avvik ved hver eneste kjøring.
const FASIT_H = Math.round(klonPx[1]/FASIT_DSF);
console.log(`klonens skjermflate: ${klonPx[0]}×${klonPx[1]} px  ⇒  fasit rendres ${DESIGN_W}×${FASIT_H} @ DSF ${FASIT_DSF}`
  + (FASIT_H!==DESIGN_H?`  (designhøyde er ${DESIGN_H})`:''));
const liveBilder={}; let liveSlots=null, liveFelter=null, liveSamtykke=null;
{
  const page=await browser.newPage({viewport:{width:DESIGN_W,height:FASIT_H},deviceScaleFactor:FASIT_DSF});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const blokkert=[];
  await page.route('**/*',route=>{
    const m=route.request().method();
    if(m!=='GET'&&m!=='HEAD'){ blokkert.push(m+' '+route.request().url().slice(0,60)); return route.abort(); }
    route.continue();
  });
  await page.goto(LIVE,{waitUntil:'networkidle'});
  await page.waitForTimeout(900);
  liveBilder[1]=`${OUT}/live-tilstand-1.png`;
  await page.screenshot({path:liveBilder[1]});

  // Klikk-vakt: nekter alt som ser ut som en innsending. Kaster heller enn å klikke.
  const klikk=async(sel,hva)=>{
    const el=await page.$(sel); if(!el) return false;
    const tekst=((await el.textContent())||'').trim();
    // Vakta må treffe INNSENDINGEN, ikke ordet «bekreft». «Til bekreftelse · 30 min ·
    // 300 kr» er knappen som ÅPNER trinn 3 og sender ingenting; en /bekreft/i-vakt
    // stoppet den og gjorde trinn 3 uhentbart. Innsendingen er .sub-btn, og bare den:
    // teksten er «Bekreft booking» (eller «Ikke publisert ennå» når sida er låst).
    if(await el.evaluate(e=>e.matches('.sub-btn,#sub-btn,[type=submit]')))
      throw new Error('SIKRING: nektet å klikke innsendingsknappen ('+hva+')');
    if(/bekreft\s+booking/i.test(tekst))
      throw new Error('SIKRING: nektet å klikke «'+tekst+'» ('+hva+')');
    if(!(await el.isEnabled())) return false;
    await el.click(); return true;
  };
  if(await klikk('#seeServices','se tjenester')){
    await page.waitForTimeout(900);
    liveBilder[2]=`${OUT}/live-tilstand-2.png`;
    await page.screenshot({path:liveBilder[2]});
    await klikk('.svc-card','velg tjeneste'); await page.waitForTimeout(400);
    await klikk('#next1','til dato og tid'); await page.waitForTimeout(1400);
    liveBilder[3]=`${OUT}/live-tilstand-3.png`;      // datovelger, ingen dato valgt
    await page.screenshot({path:liveBilder[3]});
    // Velg en dato som ikke er full eller stengt → tidene hentes. Kun GET.
    if(await klikk('.date-chip:not(.closed):not(.full):not([disabled])','velg dato')){
      await page.waitForTimeout(1800);
      liveSlots=await page.$$eval('.slot-btn',e=>e.length).catch(()=>null);
      await klikk('.slot-btn','velg tid'); await page.waitForTimeout(500);
      liveBilder[4]=`${OUT}/live-tilstand-4.png`;
      await page.screenshot({path:liveBilder[4]});
      // ── Trinn 3 på ekte side. «Til bekreftelse» ÅPNER skjemaet, den sender ikke.
      if(await klikk('#next2-btn','til dine opplysninger')){
        await page.waitForTimeout(1000);
        // Samme demodata som klonen, så de to bildene kan legges oppå hverandre.
        await page.fill('#cname',DEMO_NAVN).catch(()=>{});
        await page.fill('#cphone',DEMO_TLF).catch(()=>{});
        await page.locator('#cphone').blur().catch(()=>{});
        await page.waitForTimeout(1200);       // samtykke-oppslaget skjer på blur
        liveFelter=await page.$$eval('.fld',f=>f.map(x=>{
          const l=x.querySelector('label'), i=x.querySelector('input');
          return (l?l.textContent:'?')+'='+((i&&i.value)?i.value:'(tom)');}).join(' · ')).catch(()=>null);
        liveSamtykke=await page.$eval('#consent-slot',c=>
          getComputedStyle(c).display==='none'?'skjult':'SYNLIG').catch(()=>'MANGLER');
        liveBilder[5]=`${OUT}/live-tilstand-5.png`;
        await page.screenshot({path:liveBilder[5]});
      }
    }
  }
  rapport.push({tilstand:'1–5', navn:'EKTE SIDE', 'acc (1|2|3)':'—', valgt:'—', knapp:'—',
    hint:'—', luker:liveSlots===null?'ukjent':liveSlots, skjema:liveFelter||'—',
    jsfeil:errs.length?errs.join(';').slice(0,30):'ingen'});
  if(blokkert.length) console.log('blokkerte skrivekall: '+blokkert.join(', '));
  await page.close();
}

// ── Monter side om side, begge i naturlig størrelse ──────────────────────────
{
  const dim=f=>{ // PNG-header: bredde/høyde i byte 16–24
    const b=fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  const b64=f=>fs.existsSync(f)?'data:image/png;base64,'+fs.readFileSync(f).toString('base64'):'';
  const avvik=[];
  for(const t of TILSTANDER){
    if(!liveBilder[t.n]||!klonBilder[t.n]) continue;
    const a=dim(klonBilder[t.n]), b=dim(liveBilder[t.n]);
    if(Math.abs(a[0]-b[0])>2||Math.abs(a[1]-b[1])>2) avvik.push(`tilstand ${t.n}: klon ${a} vs fasit ${b}`);
  }
  console.log(avvik.length?('⚠ ULIK PIKSELSTØRRELSE:\n  '+avvik.join('\n  ')):'pikselstørrelse: klon = fasit ✓');
  const rader=TILSTANDER.map(t=>`
    <div class="rad">
      <div class="tit">${t.n}. ${t.navn.replace(/-/g,' ')}</div>
      <div class="par">
        <figure><img src="${b64(klonBilder[t.n])}"><figcaption>KLON — #produkt (skjermflate, naturlig størrelse)</figcaption></figure>
        <figure>${liveBilder[t.n]?`<img src="${b64(liveBilder[t.n])}">`:'<div class="ingen">ingen live-fasit<br><small>ville krevd en ekte booking</small></div>'}<figcaption>EKTE — /henrik-fades ${DESIGN_W}&times;${FASIT_H} @ DSF ${FASIT_DSF}</figcaption></figure>
      </div>
    </div>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{background:#0a0a0a;color:#fff;font:14px/1.4 -apple-system,system-ui,sans-serif;margin:0;padding:24px}
    h1{font-size:18px;margin:0 0 6px} .sub{color:#8a8a8a;font-size:12px;margin:0 0 20px}
    .rad{margin-bottom:26px}
    .tit{font-size:15px;font-weight:700;margin-bottom:10px;text-transform:capitalize}
    .par{display:flex;gap:18px;align-items:flex-start}
    figure{margin:0}
    /* Ingen height/width: begge PNG-ene har samme pikselstørrelse og vises 1:1. */
    img{display:block;border-radius:8px}
    figcaption{color:#8a8a8a;font-size:11px;margin-top:6px}
    .ingen{width:${klonPx[0]}px;height:${klonPx[1]}px;display:grid;place-items:center;text-align:center;
      color:#7a7a7a;border:1px dashed #333;border-radius:8px}
  </style></head><body><h1>Booking — klon mot ekte side, tilstand for tilstand</h1>
  <p class="sub">Begge sider ${klonPx[0]}&times;${klonPx[1]} px, vist 1:1. Ingen oppskalering.</p>${rader}</body></html>`;
  const page=await browser.newPage({viewport:{width:klonPx[0]*2+90,height:1000},deviceScaleFactor:1});
  await page.setContent(html,{waitUntil:'networkidle'});
  await page.screenshot({path:`${OUT}/likhet-booking-tilstander.png`,fullPage:true});
  await page.close();
  console.log('montert → .render-ut/likhet-booking-tilstander.png');
}

console.log('\nTRINN 3 — felter og samtykke:');
console.table([
  {kilde:'KLON',      felter:skjema?skjema.felter:'—',   samtykke:skjema?skjema.samtykke:'—',   knapp:skjema?skjema.knapp:'—'},
  {kilde:'EKTE SIDE', felter:liveFelter||'—',            samtykke:liveSamtykke||'—',            knapp:'Bekreft booking (aldri klikket)'},
]);
console.table(rapport);
console.log('\nMÅLT (dagsignaler + disabled-knapp):');
console.table(maal);
await browser.close(); server.close();
