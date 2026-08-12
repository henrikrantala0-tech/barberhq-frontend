// site/no/priser.html — to prisnivåer (Basis / Vekst), «Prisen er prisen» og prøvelinja.
//
// Fire ting kan gå galt uten at noe feiler, og alle fire måles her:
//  1. STABLINGSREKKEFØLGEN på mobil. Kravet er at VEKST står øverst; det løses med
//     CSS `order`, ikke DOM-rekkefølge, så en DOM-sjekk ville bekreftet feil svar.
//     Vi måler faktisk y-posisjon.
//  2. ANBEFALT-PILLEN er absolutt posisjonert 13px OVER kortkanten. Blir den klippet av
//     en forfar med overflow, ser kortet fortsatt helt normalt ut. Rect-en alene holder
//     ikke — vi spør elementFromPoint om pillen faktisk MALES i sine egne hjørner.
//  3. PRISLINJA «249 kr /mnd eks. mva» er en flex-boks med to bokser. Brekker den, gjør
//     den det stille. Vi teller linjer ved å måle tekstnodens rect mot spanens.
//  4. KNAPPENE. Begge skal treffe kom-i-gang.html — klikkes på ekte, ikke leses av href.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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
const URL_PRISER=`http://localhost:${PORT}/no/priser.html`;

// .reveal er opacity:0 til IntersectionObserver legger på .in. Playwrights fullPage-fangst
// scroller ikke på en måte som fyrer observatøren, så uten dette blir alt under folden
// fotografert usynlig — og «usynlig innhold»-målingen ville rapportert en feil som ikke finnes.
// MERK: sida har `html{scroll-behavior:smooth}`. Med den påslått ANIMERER hvert scrollTo-kall,
// så en løkke med korte pauser rekker aldri fram — løkka blir ferdig mens den myke rullingen
// fortsatt er underveis, og observatøren fyrer aldri. Den må slås av under målingen.
const rullGjennom=async page=>{
  await page.evaluate(async()=>{
    const forrige=document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior='auto';
    const h=document.body.scrollHeight;
    for(let y=0;y<h;y+=300){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}
    window.scrollTo(0,0);
    document.documentElement.style.scrollBehavior=forrige;
  });
};

const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,375,1280]){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(URL_PRISER,{waitUntil:'networkidle'});
  await rullGjennom(page);  // .reveal fyrer på IntersectionObserver — uten dette står alt
  await page.waitForTimeout(900);  // under folden på opacity 0 i skjermbildet (.7s overgang)
  await page.screenshot({path:`${OUT}/${bredde}-priser.png`,fullPage:true});

  const m=await page.evaluate(()=>{
    const q=s=>document.querySelector(s);
    const basis=q('.pr-basis'), vekst=q('.pr-vekst'), pill=q('.pr-pill');
    const rb=basis.getBoundingClientRect(), rv=vekst.getBoundingClientRect();
    const rp=pill.getBoundingClientRect();

    // Pillen: males den der den sier den er? Punktene ligger på kant-MIDTEN, ikke i hjørnene:
    // border-radius er 99px, så et hjørnepunkt faller utenfor den avrundede formen og gir
    // falskt negativt (kostet én runde). Topp/bunn fanger vertikal klipping — den ekte faren,
    // siden pillen stikker 13px opp over kortkanten.
    const inni=(x,y)=>{const el=document.elementFromPoint(x,y);return !!el&&(el===pill||pill.contains(el));};
    const cx=(rp.left+rp.right)/2, cy=(rp.top+rp.bottom)/2;
    const pillMalt=[[cx,rp.top+2],[cx,rp.bottom-2],[rp.left+2,cy],[rp.right-2,cy]]
      .filter(([x,y])=>inni(x,y)).length;

    // Prislinja: tekstnoden «249 kr » vs. <span>/mnd eks. mva</span>.
    const linjer=[...document.querySelectorAll('.pr-price')].map(p=>{
      const span=p.querySelector('span');
      const tn=[...p.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
      const r=document.createRange(); r.selectNode(tn);
      const rt=r.getBoundingClientRect(), rs=span.getBoundingClientRect();
      const brekker=rs.top>=rt.bottom-2;
      return `${p.textContent.trim().split(/\s{2,}|\n/)[0]}: ${brekker?'2 linjer':'1 linje'}`;
    }).join(' · ');

    // 2×2: antall DISTINKTE topp-posisjoner blant de fire punktene.
    const rader=new Set([...document.querySelectorAll('.pp-item')]
      .map(el=>Math.round(el.getBoundingClientRect().top))).size;

    // Innhold som stikker ut av sitt eget kort (horisontalt) — fanger for lange strenger.
    const utenfor=[...document.querySelectorAll('.pr-card')].filter(c=>c.scrollWidth>c.clientWidth+1).length;

    // .reveal må ha fått .in; ellers står kortene på opacity 0 og skjermbildet er tomt.
    const usynlig=[...document.querySelectorAll('.pr-card,.pp-sec,.pr-trial')]
      .filter(el=>parseFloat(getComputedStyle(el).opacity)<0.9).length;

    return {
      rekkefolge: rv.top<rb.top?'VEKST først':'BASIS først',
      sidestilt: Math.abs(rv.top-rb.top)<4,
      hoyder: `${Math.round(rb.height)}/${Math.round(rv.height)}`,
      // Range, ikke element.getClientRects(): et BLOKKelement gir alltid nøyaktig én rect
      // uansett hvor mange linjer teksten brekker til. Range-en gir én rect per linjeboks.
      h1linjer: (()=>{const r=document.createRange();r.selectNodeContents(q('.ph-hero h1'));
        return [...new Set([...r.getClientRects()].map(x=>Math.round(x.top)))].length;})(),
      pillMalt, pillTopp:Math.round(rp.top), pillBredde:Math.round(rp.width),
      pillInnenfor: rp.left>=0 && rp.right<=innerWidth && rp.top>=0,
      // Pillen ble lengre («ALLE STARTER HER»). Den skal fortsatt få plass INNI kortbredden;
      // stikker den ut til siden, er den formelt «innenfor viewporten» og likevel feil.
      pillTekst: pill.textContent.trim(),
      pillIKort: rp.left>=rv.left-1 && rp.right<=rv.right+1,
      // Basis har ingen knapp lenger — bare den dempede linja. Begge deler måles.
      basisKnapper: basis.querySelectorAll('.btn').length,
      basisLater: (basis.querySelector('.pr-later')||{}).textContent||'MANGLER',
      vekstKnapper: vekst.querySelectorAll('.btn').length,
      // Skillepunktet: delelinja skal faktisk være der, og teksten skal være hvit.
      incLinje: (()=>{const el=vekst.querySelector('.pr-inc');if(!el)return 'MANGLER';
        const s=getComputedStyle(el);return `${s.borderTopWidth} ${s.color}`;})(),
      linjer, rader, utenfor, usynlig,
      punkter: document.querySelectorAll('.pp-item').length,
      basisPunkter: basis.querySelectorAll('.pr-list li').length,
      vekstPunkter: vekst.querySelectorAll('.pr-list li').length,
      domeneord: /domene/i.test(document.body.innerText),
      gammelPris: !!q('.price-card,.price-extra,.pc-badge'),
      h1: q('.ph-hero h1').innerText.replace(/\s+/g,' '),
    };
  });

  const forventetRekkefolge = bredde<=760 ? 'VEKST først' : 'sidestilt';
  const faktisk = m.sidestilt ? 'sidestilt' : m.rekkefolge;

  rapport.push({bredde,
    'kort-oppsett': faktisk===forventetRekkefolge?`${faktisk} ✓`:`${faktisk} ✗ (ville ${forventetRekkefolge})`,
    'pill hel': m.pillMalt===4&&m.pillInnenfor&&m.pillIKort?'ja ✓'
      :`NEI ✗ (${m.pillMalt}/4 malt, viewport=${m.pillInnenfor}, i kort=${m.pillIKort})`,
    'pill tekst/bredde': `${m.pillTekst} · ${m.pillBredde}px`,
    'knapper B/V': `${m.basisKnapper}/${m.vekstKnapper}${m.basisKnapper===0&&m.vekstKnapper===1?' ✓':' ✗'}`,
    'basis-linje': m.basisLater,
    'skillepunkt': m.incLinje,
    'korthøyde B/V': m.hoyder, 'h1-linjer': m.h1linjer,
    prislinje: m.linjer,
    'prisen-er-prisen': `${m.punkter} pkt / ${m.rader} rad${m.rader===1?'':'er'}`,
    'kortpunkter B/V': `${m.basisPunkter}/${m.vekstPunkter}`,
    'innhold utenfor kort': m.utenfor?`${m.utenfor} ✗`:'nei',
    usynlig: m.usynlig?`${m.usynlig} ✗`:'nei',
    'domene nevnt': m.domeneord?'JA ✗':'nei',
    'gammel prisblokk': m.gammelPris?'JA ✗':'nei',
    overflow: await page.evaluate(w=>document.documentElement.scrollWidth-w,bredde),
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

// Klikk-test: begge knappene, ekte klikk, på både mobil- og desktopoppsett.
const klikk=[];
for(const bredde of [375,1280]){
  // Basis har ingen knapp lenger — Vekst er sidas eneste CTA, så den MÅ treffe.
  for(const [navn,sel] of [['Prøv gratis i 30 dager','.pr-vekst .btn']]){
    const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.goto(URL_PRISER,{waitUntil:'networkidle'});
    await rullGjennom(page);
    await page.waitForTimeout(900);
    const tekst=(await page.textContent(sel)).trim();
    await page.click(sel);
    await page.waitForLoadState('networkidle');
    const havnet=page.url().split('/').pop();
    klikk.push({bredde, knapp:navn, 'faktisk tekst':tekst,
      'havnet på':havnet, ok:havnet==='kom-i-gang.html'?'✓':'✗',
      jsfeil:errs.length?errs.join('; ').slice(0,40):'ingen'});
    await page.close();
  }
}

console.table(rapport);
console.log('\nKLIKK-TEST:'); console.table(klikk);
const alle=rapport.concat(klikk);
console.log('\njsfeil:       ', alle.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('overflow:     ', rapport.some(r=>r.overflow>0)?'JA ✗':'0 på alle bredder');
console.log('pill hel:     ', rapport.every(r=>r['pill hel'].startsWith('ja'))?'ja ✓':'NEI ✗');
console.log('kort-oppsett: ', rapport.every(r=>r['kort-oppsett'].endsWith('✓'))?'ja ✓':'NEI ✗');
console.log('knapper:      ', klikk.every(r=>r.ok==='✓')?`alle ${klikk.length} → kom-i-gang.html ✓`:'NEI ✗');
console.log('kort-CTA:     ', rapport.every(r=>r['knapper B/V'].endsWith('✓'))?'Basis 0 / Vekst 1 ✓':'NEI ✗');
await browser.close(); server.close();
