// tools/render/lag-story.mjs — «Lag story»-generatoren (ledige timer), ÉN komponent, to innganger.
// Mocker /api/dashboard/story/ledige-timer/{data,preview,render} etter backend-kontrakten (aldri prod).
// Verifiserer: kort åpent på Basis+Vekst, editor med standardvalg (4 dager, ingen lenke), dager-knapper
// 4–7 (8/9/10 fjernet), INGEN tjeneste-velger, to gjensidig utelukkende lenke-bokser + hjelpetekst,
// «X av Y»-linja via postMessage, ingen JS-feil/overflow.
//
// ⚠ KONTRAKT: preview lastes ÉN gang (full-vindu-HTML). /data hentes ÉN gang → dag-velgeren kappes til
// min(7, tilgjengelige_dager) (NYE nøkler valgt_dager/tilgjengelige_dager). Dag-/lenkebytte via postMessage
// {type:'ledige-timer-set', dager, lenke} (backend-origin, ikke '*') → window.__applyStory, UTEN reload/
// nettverkskall. Begge innganger (#storyOpen i Vekst, #storyOpenOversikt i Oversikt) åpner SAMME generator.
// Asserterer: /preview + /data hentes NØYAKTIG 1× per åpning; velgeren kappes; 8–10 finnes aldri.
//   node tools/render/lag-story.mjs   → .render-ut/story-*.png
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const PNG1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

const billing = plan => JSON.stringify({subscription_status:'active',plan,effective_plan:plan,effective_plan_grunn:'subscription',needs_attention:false,page_status:'live',days_left:null,trial_start_at:null});
const services = JSON.stringify({hoved:[{id:'11111111-1111-1111-1111-111111111111',name:'Herreklipp',price:400,min:30,sort:0}],tillegg:[]});

// preview = SUPERSETT (alle åpne dager opp til 7 + alle lenke-varianter i DOM), med window.__applyStory
// ({dager,lenke}) som viser utsnittet (kapp 4–7) og melder {shownDays,totalDays} tilbake.
function previewHtml(initDager,initLenke){
  const AVAIL=7;                          // mock: 7 åpne dager tilgjengelig (backend henter maks 7)
  const rows=[];
  for(let i=0;i<AVAIL;i++) rows.push(`<div class="d" data-i="${i}"><span class="dh">Dag ${i+1}</span><span>10:00–17:30</span></div>`);
  return `<!DOCTYPE html><html lang="no"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px}
    body{background:#111;color:#f0f0f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:250px 96px 340px}
    .t{font-size:104px;text-align:center;letter-spacing:-.02em}.n{font-size:52px;text-align:center;color:#b08c32;margin:14px 0 64px}
    .d{display:flex;justify-content:space-between;font-size:46px;padding:20px 0;border-bottom:2px solid rgba(255,255,255,.22)}.dh{color:#b08c32;font-weight:600}
    .lk{text-align:center;font-size:58px;margin-top:34px}.stk{height:170px}
  </style></head><body>
    <div class="t">Ledige timer</div><div class="n">Demo Barber</div>
    <div id="days">${rows.join('')}</div>
    <div class="lk lk-sticker">Book her ↓</div><div class="stk"></div>
    <div class="lk lk-bio">Book via lenken i bio</div>
    <script>
      var rows=document.querySelectorAll('#days .d'); var AVAIL=rows.length;
      function post(s,t){ try{ window.parent.postMessage({type:'ledige-timer-story',shownDays:s,totalDays:t},'*'); }catch(e){} }
      window.__applyStory=function(o){
        var n=Math.max(4,Math.min(7,(o&&o.dager)||4)); var total=Math.min(n,AVAIL);
        for(var i=0;i<rows.length;i++) rows[i].style.display = i<total ? '' : 'none';
        var lk=(o&&o.lenke)||'av';
        document.querySelector('.lk-sticker').style.display = lk==='sticker'?'':'none';
        document.querySelector('.stk').style.display        = lk==='sticker'?'':'none';
        document.querySelector('.lk-bio').style.display     = lk==='bio'?'':'none';
        window.__shownDays=total; post(total,total);   // mock: alle valgte får plass → ingen «X av Y»
      };
      window.addEventListener('message',function(ev){ var d=ev.data; if(d&&d.type==='ledige-timer-set') window.__applyStory(d); });
      window.__applyStory({dager:${initDager},lenke:'${initLenke}'});
    <\/script>
  </body></html>`;
}
// tilgjengelige = antall åpne dager /data melder (kapper dag-velgeren til min(7, tilgjengelige)).
async function mock(page, plan, tilgjengelige=7){
  await page.route('**/api/**', route=>{ const u=new URL(route.request().url()); const p=u.pathname;
    if(p==='/api/dashboard/billing/status') return route.fulfill({status:200,contentType:'application/json',body:billing(plan)});
    if(p==='/api/dashboard/profile')        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Demo Barber',email:'h@g.no',slug:'demo'})});
    if(p==='/api/dashboard/services')        return route.fulfill({status:200,contentType:'application/json',body:services});
    if(p.endsWith('/story/ledige-timer/data'))    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tjenester:1,valgt_dager:parseInt(u.searchParams.get('dager')||'4',10),tilgjengelige_dager:tilgjengelige,undertekst:'denne uka',oppdatert:'Oppdatert tor 14:30',dager:[]})});
    if(p.endsWith('/story/ledige-timer/preview')) return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:previewHtml(parseInt(u.searchParams.get('dager')||'4',10), u.searchParams.get('lenke')||'av')});
    if(p.endsWith('/story/ledige-timer/render'))  return route.fulfill({status:200,contentType:'image/png',body:PNG1});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|loyalty/.test(p)?[]:{})});});
}
const klikkDager = async (page,n)=>{ await page.locator('.story-dager-row .pk-seg',{hasText:new RegExp('^'+n+'$')}).click(); await page.waitForTimeout(180); };
const kryssLenke = async (page,txt)=>{ await page.locator('.story-lenke .pk-check',{hasText:txt}).click(); await page.waitForTimeout(180); };
const shot = (page,navn)=>page.screenshot({path:`${OUT}/story-${navn}.png`});
const aapneVia = async (page,sel)=>{ await page.locator(sel).click(); await page.waitForSelector('#storyOverlay.vis',{timeout:4000}); await page.waitForSelector('.story-dager-row .pk-seg',{timeout:4000}); await page.waitForTimeout(500); };

const rad=[]; const browser=await chromium.launch();
for(const plan of ['basis','vekst']){
 for(const bredde of [320,375,1200]){
  const page=await browser.newPage({viewport:{width:bredde,height:840},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  let previewReqs=0, dataReqs=0;
  page.on('request',r=>{ if(/\/story\/ledige-timer\/preview/.test(r.url())) previewReqs++; if(/\/story\/ledige-timer\/data/.test(r.url())) dataReqs++; });
  await mock(page, plan);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(600);
  // Oversikt-inngangen (default-panel): kort-screenshot + skal være synlig (Basis+Vekst)
  const oversiktKnapp = await page.locator('#storyOpenOversikt').isVisible();
  await page.locator('#storyOpenOversikt').screenshot({path:`${OUT}/story-ovs-entry-${plan}-${bredde}.png`}).catch(()=>{});
  // Vekst-kortet
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(700);
  const kortSynlig = await page.locator('#storyOpen').isVisible();
  const kortLaast  = await page.locator('#storyOpen').isDisabled();
  await page.locator('#accStory').screenshot({path:`${OUT}/story-kort-${plan}-${bredde}.png`}).catch(()=>{});
  await aapneVia(page,'#storyOpen');
  const previewEtterAapning = previewReqs, dataEtterAapning = dataReqs;   // begge skal være 1
  const m0=await page.evaluate(()=>({
    editorApen: document.getElementById('storyOverlay').classList.contains('vis'),
    frame: !!document.getElementById('storyFrame'),
    ingenSlider: !document.querySelector('.story-kontroller input[type=range]'),
    ingenSelect: !document.querySelector('.story-kontroller select'),
    dagerKnapper: document.querySelectorAll('.story-dager-row .pk-seg').length,
    maksKnapp: (function(){var b=document.querySelectorAll('.story-dager-row .pk-seg');return b.length?b[b.length-1].textContent:'';})(),
    dagerValgt: (document.querySelector('.story-dager-row .pk-seg.on')||{}).textContent||'',
    lenkeBokser: document.querySelectorAll('.story-lenke .pk-check').length,
    hjelpSkjultVedAv: (document.querySelector('.story-hjelp')||{}).hidden,
    scrollW: document.documentElement.scrollWidth,
  }));
  await shot(page,`${plan}-${bredde}-default`);   // åpen modal m/velger 4–7
  await kryssLenke(page,'Book her');
  const hjelpBookher=await page.evaluate(()=>!document.querySelector('.story-hjelp').hidden);
  await shot(page,`${plan}-${bredde}-bookher`);
  await kryssLenke(page,'Book via lenken i bio');
  const eks=await page.evaluate(()=>{const c=document.querySelectorAll('.story-lenke .pk-check input');return {hjelp:document.querySelector('.story-hjelp').hidden, bookherAv:!c[0].checked, bioPa:c[1].checked};});
  await shot(page,`${plan}-${bredde}-bio`);
  await kryssLenke(page,'Book via lenken i bio');
  // Flere dagbytter (7 → 5 → 6 → 7) — INGEN skal utløse nytt /preview- eller /data-kall.
  await klikkDager(page,7); await klikkDager(page,5); await klikkDager(page,6); await klikkDager(page,7);
  const previewEtterBytter = previewReqs, dataEtterBytter = dataReqs;   // skal fremdeles være 1 hver
  const status7=await page.evaluate(()=>{const s=document.querySelector('.story-status');return s&&!s.hidden?s.textContent:'';});
  await shot(page,`${plan}-${bredde}-7dager`);
  // TESTTILFELLE: simuler at iframen melder 5 av 7 → linja SKAL vises
  const fr=page.frames().find(f=>/story\/ledige-timer\/preview/.test(f.url()));
  if(fr) await fr.evaluate(()=>window.parent.postMessage({type:'ledige-timer-story',shownDays:5,totalDays:7},'*'));
  await page.waitForTimeout(250);
  const statusCut=await page.evaluate(()=>{const s=document.querySelector('.story-status');return s&&!s.hidden?s.textContent:'';});
  await shot(page,`${plan}-${bredde}-xavy-test`);
  await klikkDager(page,4);
  rad.push({plan,bredde,oversiktKnapp,kortSynlig,kortLaast,...m0,hjelpBookher,bioHjelp:eks.hjelp,bookherAvVedBio:eks.bookherAv,bioPa:eks.bioPa,status7,statusCut,previewEtterAapning,previewEtterBytter,dataEtterAapning,dataEtterBytter,overflow:m0.scrollW-bredde,jsfeil:errs.length?errs.join('|'):'ingen'});
  await page.close();
 }
}

// Kapping: tilgjengelige=5 → 4,5 (2 knapper, maks 5). Over-cap: tilgjengelige=10 → fortsatt 4–7 (4 knapper, maks 7).
async function knappeTest(tilgjengelige){
  const page=await browser.newPage({viewport:{width:375,height:840},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await mock(page,'vekst',tilgjengelige);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(500);
  await aapneVia(page,'#storyOpen');
  const r=await page.evaluate(()=>{const b=document.querySelectorAll('.story-dager-row .pk-seg');return {n:b.length,maks:b.length?b[b.length-1].textContent:'',min:b.length?b[0].textContent:''};});
  r.jsfeil=errs.length?errs.join('|'):'ingen'; await page.close(); return r;
}
const kapp = await knappeTest(5);     // forvent 2 knapper (4,5)
const overcap = await knappeTest(10); // forvent 4 knapper (4–7), maks 7 (8/9/10 finnes aldri)

// Begge innganger åpner SAMME generator, i posisjon (ingen fane-bytte); lukking returnerer dit man var.
let bk={ovsKnappSynlig:false,ovsAapner:false,panelEtterOvs:'',vekstAapner:false,jsfeil:'ingen'};
{
  const page=await browser.newPage({viewport:{width:375,height:840},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await mock(page,'basis');   // åpen øy: skal virke også på Basis
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(600);
  bk.ovsKnappSynlig = await page.locator('#storyOpenOversikt').isVisible();  // Oversikt er default-panel
  await aapneVia(page,'#storyOpenOversikt');
  bk.ovsAapner = await page.evaluate(()=>document.getElementById('storyOverlay').classList.contains('vis'));
  bk.panelEtterOvs = await page.evaluate(()=>{const p=document.querySelector('.panel.active');return p?p.id:'';});  // skal forbli 'oversikt'
  await page.locator('#storyX').click(); await page.waitForTimeout(300);
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(400);
  await aapneVia(page,'#storyOpen');
  bk.vekstAapner = await page.evaluate(()=>document.getElementById('storyOverlay').classList.contains('vis'));
  bk.jsfeil=errs.length?errs.join('|'):'ingen';
  await page.close();
}

await browser.close(); server.close();

console.table(rad.map(r=>({plan:r.plan,b:r.bredde,ovsKnapp:r.oversiktKnapp?'ja':'NEI',kort:r.kortSynlig&&!r.kortLaast?'åpen':'LÅST/skjult',dKn:r.dagerKnapper,maks:r.maksKnapp,dValgt:r.dagerValgt,slider:r.ingenSlider?'nei':'JA(!)',select:r.ingenSelect?'nei':'JA(!)',bokser:r.lenkeBokser,std7:r.status7===''?'tom ✓':r.status7,testCut:r.statusCut||'—',prev:r.previewEtterBytter,data:r.dataEtterBytter,ovf:r.overflow,js:r.jsfeil})));
console.log(`Kapping (tilgjengelige=5): knapper=${kapp.n} (venter 2), maks=${kapp.maks} (venter 5), js=${kapp.jsfeil}`);
console.log(`Over-cap (tilgjengelige=10): knapper=${overcap.n} (venter 4), maks=${overcap.maks} (venter 7 — 8/9/10 finnes aldri), js=${overcap.jsfeil}`);
console.log(`Begge innganger: Oversikt-knapp synlig=${bk.ovsKnappSynlig}, åpner=${bk.ovsAapner}, panel etter=${bk.panelEtterOvs} (venter 'oversikt'), Vekst-kort åpner=${bk.vekstAapner}, js=${bk.jsfeil}`);
const feil=[];
for(const r of rad){
  if(!r.oversiktKnapp) feil.push(`${r.plan}/${r.bredde}: Oversikt-inngang (#storyOpenOversikt) ikke synlig`);
  if(!r.kortSynlig||r.kortLaast) feil.push(`${r.plan}/${r.bredde}: Vekst-kort ikke åpent`);
  if(!r.editorApen||!r.frame) feil.push(`${r.plan}/${r.bredde}: editor mangler`);
  if(!r.ingenSlider) feil.push(`${r.plan}/${r.bredde}: skyveknapp finnes fortsatt`);
  if(!r.ingenSelect) feil.push(`${r.plan}/${r.bredde}: tjeneste-velger finnes fortsatt`);
  if(r.dagerKnapper!==4) feil.push(`${r.plan}/${r.bredde}: dager-knapper=${r.dagerKnapper} (skal være 4: 4–7 ved tilgjengelige=7)`);
  if(r.maksKnapp!=='7') feil.push(`${r.plan}/${r.bredde}: største dag-knapp=${r.maksKnapp} (skal være 7 — 8/9/10 fjernet)`);
  if(r.dagerValgt!=='4') feil.push(`${r.plan}/${r.bredde}: standard dager=${r.dagerValgt} (skal være 4)`);
  if(r.lenkeBokser!==2) feil.push(`${r.plan}/${r.bredde}: lenke-bokser=${r.lenkeBokser} (skal være 2)`);
  if(r.hjelpSkjultVedAv!==true) feil.push(`${r.plan}/${r.bredde}: hjelp synlig uten lenke`);
  if(r.hjelpBookher!==true) feil.push(`${r.plan}/${r.bredde}: hjelp ikke synlig ved «Book her ↓»`);
  if(r.bioHjelp!==true) feil.push(`${r.plan}/${r.bredde}: hjelp synlig ved bio`);
  if(r.bookherAvVedBio!==true) feil.push(`${r.plan}/${r.bredde}: «Book her» fortsatt krysset ved bio`);
  if(r.bioPa!==true) feil.push(`${r.plan}/${r.bredde}: bio ikke krysset etter klikk`);
  if(r.status7!=='') feil.push(`${r.plan}/${r.bredde}: standard 7 dager viser «X av Y» («${r.status7}») — skal være tom`);
  if(r.statusCut!=='5 av 7 dager fikk plass') feil.push(`${r.plan}/${r.bredde}: testtilfelle «X av Y» = «${r.statusCut}» (ventet «5 av 7 dager fikk plass»)`);
  if(r.previewEtterAapning!==1) feil.push(`${r.plan}/${r.bredde}: /preview hentet ${r.previewEtterAapning}× ved åpning (skal være 1)`);
  if(r.previewEtterBytter!==1) feil.push(`${r.plan}/${r.bredde}: /preview hentet ${r.previewEtterBytter}× etter dagbytter (skal fremdeles være 1)`);
  if(r.dataEtterAapning!==1) feil.push(`${r.plan}/${r.bredde}: /data hentet ${r.dataEtterAapning}× ved åpning (skal være 1)`);
  if(r.dataEtterBytter!==1) feil.push(`${r.plan}/${r.bredde}: /data hentet ${r.dataEtterBytter}× etter dagbytter (skal fremdeles være 1)`);
  if(r.overflow>0) feil.push(`${r.plan}/${r.bredde}: overflow=${r.overflow}`);
  if(r.jsfeil!=='ingen') feil.push(`${r.plan}/${r.bredde}: JS-feil ${r.jsfeil}`);
}
if(kapp.n!==2||kapp.maks!=='5') feil.push(`kapping tilgjengelige=5: knapper=${kapp.n}/maks=${kapp.maks} (skal være 2 / 5)`);
if(overcap.n!==4||overcap.maks!=='7') feil.push(`over-cap tilgjengelige=10: knapper=${overcap.n}/maks=${overcap.maks} (skal være 4 / 7 — 8/9/10 fjernet)`);
if(!bk.ovsKnappSynlig||!bk.ovsAapner) feil.push(`Oversikt-inngang åpner ikke generatoren (synlig=${bk.ovsKnappSynlig}, åpner=${bk.ovsAapner})`);
if(bk.panelEtterOvs!=='oversikt') feil.push(`Oversikt-åpning byttet fane (aktivt panel='${bk.panelEtterOvs}', skal være 'oversikt')`);
if(!bk.vekstAapner) feil.push(`Vekst-kort åpner ikke generatoren`);
if(bk.jsfeil!=='ingen') feil.push(`begge-innganger: JS-feil ${bk.jsfeil}`);
console.log('\nRESULTAT:', feil.length?('FEILET ✗\n  '+feil.join('\n  ')):'BESTÅTT ✓ — dag-velger 4–7 (8/9/10 fjernet, over-cap holder), /preview + /data 1× per åpning (NYE nøkler, dagbytte klientside uten refetch), postMessage ledige-timer-set, begge innganger åpner SAMME generator i posisjon (ingen fane-bytte), «X av Y» via postMessage, ingen tjeneste-velger/slider, ingen overflow/JS-feil');
process.exitCode=feil.length?1:0;
