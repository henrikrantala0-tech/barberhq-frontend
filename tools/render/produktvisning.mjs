// Produktvisningen i site/no/index.html — den levende scenen (#produkt).
//
// Måler oppførsel, ikke bare utseende: at fokus faktisk roterer i riktig rekkefølge, at
// klikk nullstiller timeren, at hover pauser, at IntersectionObserver fryser alt utenfor
// viewport, og at prefers-reduced-motion slår av autoplay. Et grønt skjermbilde sier
// ingenting om noe av dette.
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

const aktiv = p => p.evaluate(()=>{
  const k=document.querySelector('#scene .mock.on');
  const c=document.querySelector('#sceneCap .cap.on');
  return {kort:k?+k.dataset.i:-1, cap:c?+c.dataset.i:-1};
});

const browser=await chromium.launch();
const rapport=[]; const oppforsel=[];

for(const bredde of [320,375,1280]){
  const ctx=await browser.newContext({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')));
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  // Dashbord-animasjonen varer 1400ms og starter når seksjonen kommer til syne. Måler vi
  // etter 900ms, leser vi et tall midt i opptellingen (9967 av 10550) og «gull ikke satt» —
  // begge deler ville sett ut som feil i klonen, ikke som feil i målingen.
  await page.waitForTimeout(2300);

  const m=await page.evaluate(w=>{
    const sec=document.getElementById('produkt');
    const mocks=[...sec.querySelectorAll('.mock')];
    const r=sec.getBoundingClientRect();
    const synlige=mocks.filter(k=>{const b=k.getBoundingClientRect();
      return b.right>0 && b.left<w && b.width>0;}).length;
    // PEEK: hvor mye av naboen til VENSTRE og til HØYRE for det aktive kortet som
    // faktisk er innenfor viewporten. Kravet er ≥20px på BEGGE sider — forrige forsøk
    // målte bare «en inaktiv» og bommet fordi scale trakk kanten innover.
    const aktivK=mocks.find(k=>k.classList.contains('on'))||mocks[1];
    const ra=aktivK.getBoundingClientRect();
    const synligBredde=k=>{const b=k.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(b.right,w)-Math.max(b.left,0)));};
    const venstre=mocks.filter(k=>k.getBoundingClientRect().right<=ra.left+1);
    const høyre  =mocks.filter(k=>k.getBoundingClientRect().left>=ra.right-1);
    const peekV=venstre.length?Math.max(...venstre.map(synligBredde)):null;
    const peekH=høyre.length?Math.max(...høyre.map(synligBredde)):null;
    return {
      // Vannrett på ALLE bredder nå. Måles på geometri, ikke på breakpointet — da
      // fanger vi også at CSS-en ikke slo inn.
      modus: mocks[1].getBoundingClientRect().top > mocks[0].getBoundingClientRect().bottom-2
             ? 'STABEL ✗' : 'vannrett',
      peekV, peekH,
      // Sporet skal scrolle, ikke sida. document.scrollWidth må være uendret.
      sporScroller: getComputedStyle(document.getElementById('scene')).overflowX,
      // Dashbordet finnes i TO rammer (browservindu på desktop, telefon på mobil) med
      // samme klon i begge. Alt under måles på den SYNLIGE kopien — ellers teller vi
      // dobbelt og leser verdier fra en skjult DOM.
      ...(function(){
        const synligDash=[...sec.querySelectorAll('.pv-dash')].find(d=>d.offsetParent!==null);
        const ramme = sec.querySelector('.pv-desk')?.offsetParent!==null ? 'browservindu'
                    : sec.querySelector('.pv-mob')?.offsetParent!==null ? 'telefon' : 'INGEN ✗';
        if(!synligDash) return {ramme,stolper:[],kpiFont:0};
        const kpi=synligDash.querySelector('.pv-rev-n');
        // Effektiv skriftstørrelse = px × akkumulert skala fra transform-kjeden.
        let sk=1, el=kpi;
        while(el && el!==sec){ const t=getComputedStyle(el).transform;
          if(t && t!=='none') sk*=parseFloat(t.split(/[(,]/)[1])||1; el=el.parentElement; }
        return {
          ramme,
          stolper:[...synligDash.querySelectorAll('.cbar-bar')].map(b=>Math.round(b.getBoundingClientRect().height)),
          kpiFont:Math.round(parseFloat(getComputedStyle(kpi).fontSize)*sk*10)/10,
          navFaner:[...synligDash.querySelectorAll('.nav button[data-panel]')].filter(b=>b.offsetParent!==null).length,
        };
      })(),
      // Assertions 09.08: KPI-en «Rebooking» var oppdiktet og skal ikke finnes.
      rebookingKPI:[...sec.querySelectorAll('.pv-dash .stat .l')].some(e=>/rebooking/i.test(e.textContent)),
      kpiOmsetning:(function(){const d=[...sec.querySelectorAll('.pv-dash')].find(x=>x.offsetParent!==null);
        return d?((d.querySelector('.pv-rev-n')||{}).textContent||'').replace(/\s/g,''):'';})(),
      kpiKunder:(function(){const d=[...sec.querySelectorAll('.pv-dash')].find(x=>x.offsetParent!==null);
        return d?((d.querySelector('.pv-count')||{}).textContent||'').trim():'';})(),
      urlFelt:((sec.querySelector('.brw-url')||{}).textContent||'').trim(),
      // Windows-rekkefølge: kontrollene i høyre halvdel, lukk ytterst til høyre.
      vinduKontroller:(function(){
        const bar=sec.querySelector('.brw-bar'), win=sec.querySelector('.brw-win'),
              lukk=sec.querySelector('.w-close');
        // På mobil finnes ikke browser-chrome i det hele tatt — det er meningen.
        if(bar && bar.offsetParent===null) return 'n/a (telefonramme)';
        if(!bar||!win||!lukk) return 'MANGLER ✗';
        const rb=bar.getBoundingClientRect(), rw=win.getBoundingClientRect(),
              rl=lukk.getBoundingClientRect();
        const andre=[...sec.querySelectorAll('.brw-win i')].filter(e=>e!==lukk);
        const ytterst=andre.every(e=>e.getBoundingClientRect().right<=rl.right+1);
        return (rw.left>rb.left+rb.width/2 && ytterst)?'høyre, lukk ytterst ✓':'FEIL ✗';
      })(),
      // Rekordtilstandene skal være produktets egne klassenavn.
      gullKPI:(sec.querySelector('.pv-dash .pv-rev')||{}).className||'—',
      barTekst:((sec.querySelector('.pv-dash .pv-witext')||{}).textContent||'').trim(),
      rekordNote:((sec.querySelector('.pv-dash .rekord-note')||{}).textContent||'').trim(),
      // Klon-sjekker: elementer som KUN finnes hvis den ekte markupen faktisk kom med.
      svcKort:sec.querySelectorAll('.pv-book .svc-card').length,
      tidsluker:sec.querySelectorAll('.pv-book .slot-btn').length,
      kpiKort:sec.querySelectorAll('.pv-dash .stat').length,
      accSeksjoner:sec.querySelectorAll('.pv-book .acc-section').length,
      antallMock:mocks.length,
      antallAktive:sec.querySelectorAll('.mock.on').length,
      antallCapAktive:sec.querySelectorAll('.cap.on').length,
      synligeKort:synlige,
      dødRest:['.tab','.slide','.dot','.arrow','.pv-section'].filter(s=>document.querySelector(s)).join(' ')||'—',
      seksjonshøyde:Math.round(r.height),
    };
  },bredde);

  await page.locator('#produkt').screenshot({path:`${OUT}/${bredde}-produkt.png`});

  rapport.push({bredde, modus:m.modus, mockups:m.antallMock, aktive:m.antallAktive,
    ramme:m.ramme, 'nav-faner':m.navFaner, 'KPI px':m.kpiFont,
    'KPI≥14':m.kpiFont>=14?'ja ✓':'NEI ✗',
    'stolper':m.stolper.length===7?'7 ✓':m.stolper.length+' ✗',
    'sum=KPI':m.kpiOmsetning==='10550'?'ja ✓':('KPI='+m.kpiOmsetning),
    'kunder':m.kpiKunder,
    'rebooking-KPI':m.rebookingKPI?'JA ✗':'nei ✓',
    'vinduskontroller':m.vinduKontroller,
    'URL-felt':m.urlFelt||'TOM ✗',
    'gull':/rekord-gull/.test(m.gullKPI)?'ja ✓':'nei ✗',
    'bar-tekst':m.barTekst||'TOM ✗',
    '#rekordNote':m.rekordNote===''?'tom ✓':('«'+m.rekordNote+'» ✗'),
    'svc-kort':m.svcKort, 'tidsluker':m.tidsluker, 'KPI-kort':m.kpiKort, 'acc':m.accSeksjoner,
    'peek V/H':(m.peekV===null?'—':m.peekV)+' / '+(m.peekH===null?'—':m.peekH),
    'peek ≥20': (m.peekV===null&&m.peekH===null)?'—'
      :((m.peekV===null||m.peekV>=20)&&(m.peekH===null||m.peekH>=20)?'ja ✓':'NEI ✗'),
    spor:m.sporScroller, 'synlige kort':m.synligeKort, 'død rest':m.dødRest,
    'seksjon h':m.seksjonshøyde+'px',
    overflow: await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde)?'JA ✗':'nei',
    jsfeil: errs.length?errs.join('; ').slice(0,44):'ingen'});
  await ctx.close();
}

// ── Oppførsel: kun på 1280, den er ikke breddeavhengig ───────────────────────────
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);

  const start=await aktiv(page);
  await page.waitForTimeout(5400); const etter1=await aktiv(page);
  await page.waitForTimeout(5200); const etter2=await aktiv(page);
  oppforsel.push({test:'autoplay-rekkefølge',
    resultat:`${start.kort} → ${etter1.kort} → ${etter2.kort}`,
    ventet:'1 → 0 → 2', ok:(start.kort===1&&etter1.kort===0&&etter2.kort===2)?'✓':'✗'});
  oppforsel.push({test:'caption følger kort', resultat:`kort ${etter2.kort} / cap ${etter2.cap}`,
    ventet:'like', ok:etter2.kort===etter2.cap?'✓':'✗'});

  // Klikk skal aktivere OG nullstille timeren: rett etter klikk + 3s skal den stå stille.
  await page.click('#scene .mock[data-i="0"]');
  const etterKlikk=await aktiv(page);
  await page.waitForTimeout(3000);
  const stodStille=await aktiv(page);
  oppforsel.push({test:'klikk aktiverer', resultat:'kort '+etterKlikk.kort, ventet:'0',
    ok:etterKlikk.kort===0?'✓':'✗'});
  oppforsel.push({test:'klikk nullstiller timer', resultat:'etter 3s: '+stodStille.kort,
    ventet:'0 (uendret)', ok:stodStille.kort===0?'✓':'✗'});

  // Hover pauser
  await page.hover('#sceneVp');
  const førHover=await aktiv(page);
  await page.waitForTimeout(6000);
  const etterHover=await aktiv(page);
  oppforsel.push({test:'hover pauser', resultat:`${førHover.kort} → ${etterHover.kort}`,
    ventet:'uendret', ok:førHover.kort===etterHover.kort?'✓':'✗'});
  await page.mouse.move(0,0);

  // Ut av viewport → .paused og ingen rotasjon
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForTimeout(700);
  const pauset=await page.evaluate(()=>document.getElementById('sceneVp').classList.contains('paused'));
  const førUt=await aktiv(page);
  await page.waitForTimeout(6000);
  const etterUt=await aktiv(page);
  oppforsel.push({test:'ute av viewport', resultat:`.paused=${pauset}, ${førUt.kort}→${etterUt.kort}`,
    ventet:'true, uendret', ok:(pauset&&førUt.kort===etterUt.kort)?'✓':'✗'});
  oppforsel.push({test:'jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Mobil: stabelen skal IKKE rotere ─────────────────────────────────────────────
{
  const ctx=await browser.newContext({viewport:{width:375,height:900},deviceScaleFactor:2});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  // Start: dashbordet (data-i=1) sentrert i sporet, satt instant.
  const start=await page.evaluate(()=>{
    const sc=document.getElementById('scene');
    const k=[...sc.querySelectorAll('.mock')].find(x=>x.dataset.i==='1');
    const rs=sc.getBoundingClientRect(), rk=k.getBoundingClientRect();
    return Math.round(Math.abs((rk.left+rk.width/2)-(rs.left+rs.width/2)));
  });
  oppforsel.push({test:'start = dashbord sentrert', resultat:start+'px fra midten',
    ventet:'≤4px', ok:start<=4?'✓':'✗'});

  // Autoplay skal rotere HELT TIL brukeren tar i sporet — da permanent av.
  const a=await aktiv(page);
  await page.waitForTimeout(5600);
  const b=await aktiv(page);
  oppforsel.push({test:'mobil: autoplay går før touch', resultat:`${a.kort} → ${b.kort}`,
    ventet:'endret', ok:a.kort!==b.kort?'✓':'✗'});

  await page.dispatchEvent('#scene','touchstart');
  const c1=await aktiv(page);
  await page.waitForTimeout(6000);
  const c2=await aktiv(page);
  oppforsel.push({test:'autoplay stopper ved første touch', resultat:`${c1.kort} → ${c2.kort}`,
    ventet:'uendret', ok:c1.kort===c2.kort?'✓':'✗'});

  // Sporet skal eie den vannrette scrollen — ikke dokumentet.
  const sw=await page.evaluate(()=>document.documentElement.scrollWidth);
  oppforsel.push({test:'page scrollWidth uendret (375)', resultat:sw+'px', ventet:'377px',
    ok:sw===377?'✓':'✗'});
  oppforsel.push({test:'mobil: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── prefers-reduced-motion ───────────────────────────────────────────────────────
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:2,
                                      reducedMotion:'reduce'});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const a=await aktiv(page);
  await page.waitForTimeout(6000);
  const b=await aktiv(page);
  const trans=await page.evaluate(()=>getComputedStyle(document.querySelector('#scene .mock')).transitionDuration);
  const anim=await page.evaluate(()=>getComputedStyle(document.querySelector('#produkt .crow')).transitionDuration);
  await page.locator('#produkt').screenshot({path:`${OUT}/1280-produkt-redusert.png`});
  oppforsel.push({test:'redusert: ingen autoplay', resultat:`${a.kort} → ${b.kort}`, ventet:'uendret',
    ok:a.kort===b.kort?'✓':'✗'});
  oppforsel.push({test:'redusert: ingen transition', resultat:trans, ventet:'0s', ok:/^0s(,\s*0s)*$/.test(trans)?'✓':'✗'});
  oppforsel.push({test:'redusert: ingen kalender-transition', resultat:anim, ventet:'0s', ok:/^0s/.test(anim)?'✓':'✗'});
  oppforsel.push({test:'redusert: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

console.table(rapport);
console.log('\nOPPFØRSEL:'); console.table(oppforsel);
console.log('\noverflow:  ', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('jsfeil:    ', rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
console.log('døde rester:', rapport.some(r=>r['død rest']!=='—')?'JA ✗':'ingen');
console.log('oppførsel: ', oppforsel.every(o=>o.ok==='✓')?'alt ✓':'FEIL ✗');
await browser.close(); server.close();
