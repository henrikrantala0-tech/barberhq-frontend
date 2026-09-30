// tools/render/lag-story.mjs — «Lag story»-generator (ledige timer) i Vekst-fanen.
// Mocker /api/dashboard/story/ledige-timer/{preview,render} etter backend-kontrakten (aldri prod).
// Verifiserer: åpen øy på Basis (kort ikke låst), editor med standardvalg (4 dager, ingen lenke),
// dager-knapper 4–10, INGEN tjeneste-velger, to gjensidig utelukkende lenke-avkrysninger + hjelpetekst,
// «X av Y»-linja via postMessage, ingen JS-feil/overflow. 320/375/1200 × Basis/Vekst.
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
function previewHtml(dager,lenke){
  // STANDARD som ekte data: alle dagene får plass (shownDays === totalDays) → ingen «X av Y»-linje.
  const total=dager, rows=[];
  for(let i=0;i<total;i++) rows.push(`<div class="d"><span class="dh">Dag ${i+1}</span><span>10:00–17:30</span></div>`);
  const lk = lenke==='sticker' ? `<div class="lk">Book her ↓</div><div class="stk"></div>` : lenke==='bio' ? `<div class="lk">Book via lenken i bio</div>` : '';
  return `<!DOCTYPE html><html lang="no"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px}
    body{background:#111;color:#f0f0f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:250px 96px 340px}
    .t{font-size:104px;text-align:center;letter-spacing:-.02em}.n{font-size:52px;text-align:center;color:#b08c32;margin:14px 0 64px}
    .d{display:flex;justify-content:space-between;font-size:46px;padding:20px 0;border-bottom:2px solid rgba(255,255,255,.22)}.dh{color:#b08c32;font-weight:600}
    .lk{text-align:center;font-size:58px;margin-top:34px}.stk{height:170px}
  </style></head><body>
    <div class="t">Ledige timer</div><div class="n">Demo Barber</div>
    ${rows.join('')}${lk}
    <script>window.parent.postMessage({type:'ledige-timer-story',shownDays:${total},totalDays:${total}},'*');<\/script>
  </body></html>`;
}
async function mock(page, plan){
  await page.route('**/api/**', route=>{ const u=new URL(route.request().url()); const p=u.pathname;
    if(p==='/api/dashboard/billing/status') return route.fulfill({status:200,contentType:'application/json',body:billing(plan)});
    if(p==='/api/dashboard/profile')        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({hasPassword:true,name:'Henrik',shop:'Demo Barber',email:'h@g.no',slug:'demo'})});
    if(p==='/api/dashboard/services')        return route.fulfill({status:200,contentType:'application/json',body:services});
    if(p.endsWith('/story/ledige-timer/preview')) return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:previewHtml(parseInt(u.searchParams.get('dager')||'4',10), u.searchParams.get('lenke')||'av')});
    if(p.endsWith('/story/ledige-timer/render'))  return route.fulfill({status:200,contentType:'image/png',body:PNG1});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|loyalty/.test(p)?[]:{})});});
}
const klikkDager = async (page,n)=>{ await page.locator('.story-dager-row .pk-seg',{hasText:new RegExp('^'+n+'$')}).click(); await page.waitForTimeout(500); };
const kryssLenke = async (page,txt)=>{ await page.locator('.story-lenke .pk-check',{hasText:txt}).click(); await page.waitForTimeout(400); };
const shot = (page,navn)=>page.screenshot({path:`${OUT}/story-${navn}.png`});

const rad=[]; const browser=await chromium.launch();
for(const plan of ['basis','vekst']){
 for(const bredde of [320,375,1200]){
  const page=await browser.newPage({viewport:{width:bredde,height:840},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await mock(page, plan);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(600);
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(700);
  const kortSynlig = await page.locator('#storyOpen').isVisible();
  const kortLaast  = await page.locator('#storyOpen').isDisabled();
  await page.locator('#accStory').screenshot({path:`${OUT}/story-kort-${plan}-${bredde}.png`}).catch(()=>{});
  await page.locator('#storyOpen').click();
  await page.waitForSelector('#storyOverlay.vis',{timeout:4000});
  await page.waitForTimeout(700);
  const m0=await page.evaluate(()=>({
    editorApen: document.getElementById('storyOverlay').classList.contains('vis'),
    frame: !!document.getElementById('storyFrame'),
    ingenSlider: !document.querySelector('.story-kontroller input[type=range]'),
    ingenSelect: !document.querySelector('.story-kontroller select'),
    dagerKnapper: document.querySelectorAll('.story-dager-row .pk-seg').length,
    dagerValgt: (document.querySelector('.story-dager-row .pk-seg.on')||{}).textContent||'',
    lenkeBokser: document.querySelectorAll('.story-lenke .pk-check').length,
    hjelpSkjultVedAv: (document.querySelector('.story-hjelp')||{}).hidden,
    scrollW: document.documentElement.scrollWidth,
  }));
  await shot(page,`${plan}-${bredde}-default`);
  // kryss «Book her ↓» → hjelp vises
  await kryssLenke(page,'Book her');
  const hjelpBookher=await page.evaluate(()=>!document.querySelector('.story-hjelp').hidden);
  await shot(page,`${plan}-${bredde}-bookher`);
  // kryss «Book via lenken i bio» → Book her fjernes (gjensidig utelukkende), hjelp skjult
  await kryssLenke(page,'Book via lenken i bio');
  const eks=await page.evaluate(()=>{const c=document.querySelectorAll('.story-lenke .pk-check input');return {hjelp:document.querySelector('.story-hjelp').hidden, bookherAv:!c[0].checked, bioPa:c[1].checked};});
  await shot(page,`${plan}-${bredde}-bio`);
  // uncheck bio → ingen lenke (av)
  await kryssLenke(page,'Book via lenken i bio');
  // 10 dager → STANDARD: alle får plass (mock 10/10) → INGEN «X av Y»-linje (som ekte data)
  await klikkDager(page,10); await page.waitForTimeout(600);
  const status10=await page.evaluate(()=>{const s=document.querySelector('.story-status');return s&&!s.hidden?s.textContent:'';});
  await shot(page,`${plan}-${bredde}-10dager`);
  // TESTTILFELLE (ikke standardvisning): simuler at iframen melder 7 av 10 → linja SKAL vises
  const fr=page.frames().find(f=>/story\/ledige-timer\/preview/.test(f.url()));
  if(fr) await fr.evaluate(()=>window.parent.postMessage({type:'ledige-timer-story',shownDays:7,totalDays:10},'*'));
  await page.waitForTimeout(250);
  const statusCut=await page.evaluate(()=>{const s=document.querySelector('.story-status');return s&&!s.hidden?s.textContent:'';});
  await shot(page,`${plan}-${bredde}-xavy-test`);
  await klikkDager(page,4);
  rad.push({plan,bredde,kortSynlig,kortLaast,...m0,hjelpBookher,bioHjelp:eks.hjelp,bookherAvVedBio:eks.bookherAv,bioPa:eks.bioPa,status10,statusCut,overflow:m0.scrollW-bredde,jsfeil:errs.length?errs.join('|'):'ingen'});
  await page.close();
 }
}
console.table(rad.map(r=>({plan:r.plan,b:r.bredde,kort:r.kortSynlig&&!r.kortLaast?'åpen':'LÅST/skjult',ed:r.editorApen,dKn:r.dagerKnapper,dValgt:r.dagerValgt,slider:r.ingenSlider?'nei':'JA(!)',select:r.ingenSelect?'nei':'JA(!)',bokser:r.lenkeBokser,bookher:r.hjelpBookher,bioEks:r.bookherAvVedBio,std10:r.status10===''?'tom ✓':r.status10,testCut:r.statusCut||'—',ovf:r.overflow,js:r.jsfeil})));
const feil=[];
for(const r of rad){
  if(!r.kortSynlig||r.kortLaast) feil.push(`${r.plan}/${r.bredde}: story-kort ikke åpen`);
  if(!r.editorApen||!r.frame) feil.push(`${r.plan}/${r.bredde}: editor mangler`);
  if(!r.ingenSlider) feil.push(`${r.plan}/${r.bredde}: skyveknapp finnes fortsatt`);
  if(!r.ingenSelect) feil.push(`${r.plan}/${r.bredde}: tjeneste-velger finnes fortsatt`);
  if(r.dagerKnapper!==7) feil.push(`${r.plan}/${r.bredde}: dager-knapper=${r.dagerKnapper} (skal være 7: 4–10)`);
  if(r.dagerValgt!=='4') feil.push(`${r.plan}/${r.bredde}: standard dager=${r.dagerValgt} (skal være 4)`);
  if(r.lenkeBokser!==2) feil.push(`${r.plan}/${r.bredde}: lenke-bokser=${r.lenkeBokser} (skal være 2)`);
  if(r.hjelpSkjultVedAv!==true) feil.push(`${r.plan}/${r.bredde}: hjelp synlig uten lenke`);
  if(r.hjelpBookher!==true) feil.push(`${r.plan}/${r.bredde}: hjelp ikke synlig ved «Book her ↓»`);
  if(r.bioHjelp!==true) feil.push(`${r.plan}/${r.bredde}: hjelp synlig ved bio`);
  if(r.bookherAvVedBio!==true) feil.push(`${r.plan}/${r.bredde}: «Book her» fortsatt krysset ved bio (ikke gjensidig utelukkende)`);
  if(r.bioPa!==true) feil.push(`${r.plan}/${r.bredde}: bio ikke krysset etter klikk`);
  if(r.status10!=='') feil.push(`${r.plan}/${r.bredde}: standard 10 dager viser «X av Y» («${r.status10}») — skal være tom`);
  if(r.statusCut!=='7 av 10 dager fikk plass') feil.push(`${r.plan}/${r.bredde}: testtilfelle «X av Y» = «${r.statusCut}» (ventet «7 av 10 dager fikk plass»)`);
  if(r.overflow>0) feil.push(`${r.plan}/${r.bredde}: overflow=${r.overflow}`);
  if(r.jsfeil!=='ingen') feil.push(`${r.plan}/${r.bredde}: JS-feil ${r.jsfeil}`);
}
console.log('\nRESULTAT:', feil.length?('FEILET ✗\n  '+feil.join('\n  ')):'BESTÅTT ✓ — dager-knapper 4–10 (std 4), ingen tjeneste-velger, to gjensidig utelukkende lenke-bokser + hjelp, «X av Y» via postMessage, åpen på Basis+Vekst, ingen overflow/JS-feil');
process.exitCode=feil.length?1:0;
await browser.close(); server.close();
