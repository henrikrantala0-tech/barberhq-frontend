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
// Klikk gir ikke lenger fokus i samme tick: ringen ROTERER dit, alltid mot venstre, og
// et kort to hakk unna får to hakk à 300ms pluss glidning. Alt som måler «fra det kortet
// fikk fokus» må vente på at det faktisk skjedde, ellers starter klokka for tidlig og
// hele tidslinja forskyves.
const fokuser=async(page,i)=>{
  await page.locator('#scene .mock[data-i="'+i+'"]').click();
  await page.waitForFunction(j=>{
    const on=document.querySelector('#scene .mock.on');
    return on && on.dataset.i===String(j);
  },i,{timeout:4000,polling:60});
};
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
  //
  // Et fast tall løser det ikke. 2300ms holdt for 375 og 1280, men 320 er FØRSTE kontekst
  // i løkken og betaler kaldstarten: opptellingen sto på 10 544 og rekordtilstanden var
  // ikke tent, så tre gull-felt og bar-teksten meldte rødt på en klon som er riktig.
  // Et større tall ville bare flyttet grensa. Vi venter på TILSTANDEN i stedet: gradienten
  // på .pv-fill og bar-teksten satt er det siste animasjonen gjør.
  await page.waitForFunction(()=>{
    const sec=document.getElementById('produkt');
    const d=[...sec.querySelectorAll('.pv-dash')].find(x=>x.offsetParent!==null);
    if(!d) return false;
    const fill=d.querySelector('.pv-fill'), txt=d.querySelector('.pv-witext');
    if(!fill||!txt) return false;
    return /240,\s*194,\s*75/.test(getComputedStyle(fill).backgroundImage)
        && txt.textContent.trim().length>0;
  },null,{timeout:8000,polling:100});

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
          // Fargekodingen ER diagrammet: colorForRatio gir hver stolpe sin egen farge
          // relativt til beste stolpe. Sju like stolper betyr at gradient-variablene
          // aldri kom med, og en ren telling ville ikke merket det.
          stolpefarger:[...new Set([...synligDash.querySelectorAll('.cbar-bar')]
            .map(b=>getComputedStyle(b).backgroundImage))].length,
          // Aktiv fane skal skille seg fra de inaktive på BÅDE farge og understrek.
          navAktiv:(function(){
            const alle=[...synligDash.querySelectorAll('.nav button[data-panel]')].filter(b=>b.offsetParent!==null);
            const akt=alle.find(b=>b.getAttribute('aria-selected')==='true');
            const inakt=alle.find(b=>b!==akt);
            if(!akt||!inakt) return 'MANGLER';
            const a=getComputedStyle(akt), i=getComputedStyle(inakt);
            const gjennomsiktig=/rgba\(0, 0, 0, 0\)|transparent/.test(a.borderBottomColor);
            if(a.color===i.color) return 'SAMME FARGE ('+a.color+')';
            if(gjennomsiktig) return 'INGEN UNDERSTREK';
            if(parseFloat(a.borderBottomWidth)<1) return 'UNDERSTREK 0px';
            return 'farge+understrek';
          })(),
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
        // Fargen målt, ikke antatt. Geometrien var grønn den gangen alle tre kontrollene
        // sto grå: color lå på ::before og låste currentColor, og #produkt .w-close (1,1,0)
        // tapte for #produkt .brw-win i (1,1,1). Ingenting i en geometritest fanger det.
        const rgb=getComputedStyle(lukk).backgroundColor.match(/\d+/g)||[0,0,0];
        const [r,g,b]=rgb.map(Number);
        const rød = r>=150 && r>g*1.8 && r>b*1.8;
        if(!rød) return 'LUKK IKKE RØD ('+getComputedStyle(lukk).backgroundColor+') ✗';
        return (rw.left>rb.left+rb.width/2 && ytterst)?'høyre, lukk ytterst ✓':'FEIL ✗';
      })(),
      // Rekordtilstanden måles på COMPUTED FARGE, ikke på klassenavn. Den gamle testen
      // sjekket at .rekord-gull sto i className og sa «gull ✓» mens KPI-en var grønn:
      // klassen var satt, men regelen fantes ikke i den klonede CSS-en, fordi den
      // maskinelle utvelgelsen bare ser klasser som står i markupen ved byggetid.
      // Signaturen er kildens egen (dashboard.html .rekord-gull / .wi-fill.rekord /
      // .wi-text.rekord) — endres den der, må den endres her. SYNKPUNKT.
      gull:(function(){
        const d=[...sec.querySelectorAll('.pv-dash')].find(x=>x.offsetParent!==null);
        if(!d) return {kpi:'—',bar:'—',tekst:'—',dom:'—'};
        const rev=d.querySelector('.pv-rev'), fill=d.querySelector('.pv-fill'),
              txt=d.querySelector('.pv-witext');
        const c=rev?getComputedStyle(rev):null;
        const GULL=/240,\s*194,\s*75/;                       // #F0C24B i rgb-form
        return {
          // Gradient-på-tekst: fyllfargen er gjennomsiktig og gradienten bærer fargen.
          kpi: !c?'MANGLER':
               (/rgba\(0, 0, 0, 0\)/.test(c.webkitTextFillColor) && GULL.test(c.backgroundImage)
                ? 'gull' : 'IKKE GULL ('+c.webkitTextFillColor+')'),
          glød: c && /drop-shadow/.test(c.filter) ? 'ja' : 'NEI',
          bar:  fill ? (GULL.test(getComputedStyle(fill).backgroundImage) ? 'gull'
                       : 'IKKE GULL ('+getComputedStyle(fill).backgroundColor+')') : 'MANGLER',
          tekst:txt ? (getComputedStyle(txt).color==='rgb(232, 184, 75)' ? 'gull'
                       : 'IKKE GULL ('+getComputedStyle(txt).color+')') : 'MANGLER',
          dom:  /rekord-gull/.test((rev||{}).className||'') ? 'klasse satt' : 'KLASSE MANGLER',
        };
      })(),
      barTekst:((sec.querySelector('.pv-dash .pv-witext')||{}).textContent||'').trim(),
      rekordNote:((sec.querySelector('.pv-dash .rekord-note')||{}).textContent||'').trim(),
      // Klon-sjekker: elementer som KUN finnes hvis den ekte markupen faktisk kom med.
      svcKort:sec.querySelectorAll('.pv-book .svc-card').length,
      tidsluker:sec.querySelectorAll('.pv-book .slot-btn').length,
      kpiKort:sec.querySelectorAll('.pv-dash .stat').length,
      accSeksjoner:sec.querySelectorAll('.pv-book .acc-section').length,
      // TILSTANDSPRØVE. En telling sier bare at markupen kom med. Den maskinelle
      // CSS-utvelgelsen ser ikke klasser som settes ved kjøring, så .svc-card.sel,
      // .slot-btn.sel og .acc-section.done kan mangle helt uten at antallet endrer seg —
      // 23 slike regler manglet i booking-klonen mens alle tellingene sto ✓.
      // Prøven er palett-uavhengig med vilje: den krever at klassen ENDRER computed stil,
      // ikke at fargen er en bestemt verdi. Da overlever den at paletten byttes.
      tilstand:(function(){
        const bok=sec.querySelector('.pv-book'), ut={};
        const dash=[...sec.querySelectorAll('.pv-dash')].find(x=>x.offsetParent!==null);
        const stat=dash&&dash.querySelector('.stat');
        ut.kpiKort = !stat ? 'MANGLER' : stat.offsetParent===null ? 'SKJULT'
          : /rgba\(0, 0, 0, 0\)/.test(getComputedStyle(stat).backgroundColor) ? 'GJENNOMSIKTIG'
          : getComputedStyle(stat).backgroundColor===getComputedStyle(dash).backgroundColor
            ? 'SAMME SOM BAKGRUNN' : 'flate ✓';
        if(!bok){ ut.svcKort=ut.tidsluker=ut.acc=ut.datochip='MANGLER'; return ut; }
        // Arket er skjult i utgangstilstand — vi åpner det for å måle, og lukker etterpå.
        const varApen=bok.classList.contains('vis-sheet');
        bok.classList.add('vis-sheet');
        // Kildens tilstandsregler ligger bak transitions (.svc-card har
        // «transition:border-color .12s»). Leser man computed style straks etter at
        // klassen er satt, får man verdien FØR overgangen, og prøven melder «ingen stil»
        // på en regel som finnes. Vi slår av bevegelse mens vi måler.
        const stopp=document.createElement('style');
        stopp.textContent='#produkt .pv-book, #produkt .pv-book *{transition:none !important;animation:none !important}';
        document.head.appendChild(stopp);
        // Prøven MÅ starte på et element som ikke allerede har klassen. Første
        // .acc-section står «done» i markupen, så add('done') endret ingenting og prøven
        // meldte «INGEN .done-STIL» på en regel som virker — selvbekreftelse, ikke funn.
        // Derfor :not(.klasse) i selektoren, og en egen melding hvis ALLE har den: da
        // finnes det ingen motprøve, og «✓» ville vært like tomt som «✗».
        const proev=(sel,kl,indre)=>{
          if(!bok.querySelector(sel)) return 'MANGLER';
          const el=bok.querySelector(sel+':not(.'+kl+')');
          if(!el) return 'ALLE HAR .'+kl+' — ingen motprøve ✗';
          if(el.offsetParent===null) return 'SKJULT';
          const les=()=>{const t=indre?el.querySelector(indre):el; if(!t) return null;
            const c=getComputedStyle(t);
            return [c.backgroundColor,c.backgroundImage,c.borderTopColor,c.borderTopWidth,
                    c.color,c.fontWeight,c.opacity,c.display].join('|');};
          const foer=les(); if(foer===null) return 'MANGLER '+indre;
          el.classList.add(kl);
          const etter=les();
          el.classList.remove(kl);
          return foer===etter ? ('INGEN .'+kl+'-STIL ✗') : ('.'+kl+' virker ✓');
        };
        ut.svcKort  =proev('.svc-card','sel');
        ut.tidsluker=proev('.slot-btn','sel');
        ut.acc      =proev('.acc-section','done','.acc-t');
        ut.datochip =proev('.date-chip','sel');
        stopp.remove();
        if(!varApen) bok.classList.remove('vis-sheet');
        return ut;
      })(),
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
    ramme:m.ramme, 'nav-faner':m.navFaner,
    'nav aktiv':m.navAktiv==='farge+understrek'?'farge+understrek ✓':m.navAktiv+' ✗',
    'KPI px':m.kpiFont,
    'KPI≥14':m.kpiFont>=14?'ja ✓':'NEI ✗',
    // «Høyde > 0» er IKKE falsifiserbart: kilden har .cbar-bar{min-height:4px}, så en
    // stolpe som aldri fikk høyde står likevel på 4px. Motprøven avslørte det — den
    // snudde ikke. Kravet er derfor at høydene VARIERER: sju ulike beløp gir sju ulike
    // høyder, og faller de sammen står stolpene på gulvet.
    'stolper':m.stolper.length!==7?(m.stolper.length+' ✗')
      :new Set(m.stolper).size<6?('flate: '+new Set(m.stolper).size+' ulike høyder ✗')
      :Math.max(...m.stolper)<Math.min(...m.stolper)*3?('for lik spredning ✗')
      :'7, '+new Set(m.stolper).size+' ulike ✓',
    'stolpefarger':m.stolpefarger===7?'7 ulike ✓':m.stolpefarger+' ulike ✗',
    'sum=KPI':m.kpiOmsetning==='10550'?'ja ✓':('KPI='+m.kpiOmsetning),
    'kunder':m.kpiKunder,
    'rebooking-KPI':m.rebookingKPI?'JA ✗':'nei ✓',
    'vinduskontroller':m.vinduKontroller,
    'URL-felt':m.urlFelt||'TOM ✗',
    'gull KPI':m.gull.kpi==='gull'?'gull ✓':m.gull.kpi+' ✗',
    'gull glød':m.gull.glød==='ja'?'ja ✓':'NEI ✗',
    'gull bar':m.gull.bar==='gull'?'gull ✓':m.gull.bar+' ✗',
    'gull tekst':m.gull.tekst==='gull'?'gull ✓':m.gull.tekst+' ✗',
    'gull-klasse':m.gull.dom==='klasse satt'?'✓':'✗',
    'bar-tekst':m.barTekst||'TOM ✗',
    '#rekordNote':m.rekordNote===''?'tom ✓':('«'+m.rekordNote+'» ✗'),
    'svc-kort':m.svcKort+' · '+m.tilstand.svcKort,
    'tidsluker':m.tidsluker+' · '+m.tilstand.tidsluker,
    'datochip':m.tilstand.datochip,
    'KPI-kort':m.kpiKort+' · '+m.tilstand.kpiKort,
    'acc':m.accSeksjoner+' · '+m.tilstand.acc,
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

  // Vent på SKIFTET, ikke på klokka. Dvellinga er ikke lik for alle kort lenger —
  // kalenderen står 8,4s og bookingen 18s — så et fast intervall mellom prøvene leste to
  // ganger innenfor samme dvelling og meldte «1 → 0 → 0» på en rotasjon som var riktig.
  const nesteSkifte=async(fra,tak)=>{
    const t=Date.now();
    while(Date.now()-t<tak){
      await page.waitForTimeout(200);
      const n=await aktiv(page);
      if(n.kort!==fra) return n;
    }
    return await aktiv(page);
  };
  const start=await aktiv(page);
  const etter1=await nesteSkifte(start.kort,20000);
  const etter2=await nesteSkifte(etter1.kort,20000);
  oppforsel.push({test:'autoplay-rekkefølge',
    resultat:`${start.kort} → ${etter1.kort} → ${etter2.kort}`,
    ventet:'1 → 0 → 2', ok:(start.kort===1&&etter1.kort===0&&etter2.kort===2)?'✓':'✗'});
  oppforsel.push({test:'caption følger kort', resultat:`kort ${etter2.kort} / cap ${etter2.cap}`,
    ventet:'like', ok:etter2.kort===etter2.cap?'✓':'✗'});

  // Klikk skal aktivere OG nullstille timeren: rett etter klikk + 3s skal den stå stille.
  //
  // «Rett etter» kan ikke være samme tick lenger. Klikk hopper ikke til kortet — ringen
  // ROTERER dit, alltid mot venstre, og et kort to hakk unna får to hakk à 300ms. Leser
  // man umiddelbart, fanger man mellomstasjonen. Vi venter til ringen har landet.
  await page.click('#scene .mock[data-i="0"]');
  await page.waitForFunction(()=>{
    const on=document.querySelector('#scene .mock.on');
    return on && on.dataset.i==='0';
  },null,{timeout:3000,polling:80}).catch(()=>{});
  const etterKlikk=await aktiv(page);
  await page.waitForTimeout(3000);
  const stodStille=await aktiv(page);
  oppforsel.push({test:'klikk aktiverer', resultat:'kort '+etterKlikk.kort, ventet:'0',
    ok:etterKlikk.kort===0?'✓':'✗'});
  oppforsel.push({test:'klikk nullstiller timer', resultat:'etter 3s: '+stodStille.kort,
    ventet:'0 (uendret)', ok:stodStille.kort===0?'✓':'✗'});

  // Hover pauser
  // Pekeren må UT før den går inn igjen. Etter klikket over ligger den allerede inne i
  // seksjonen, så mouseenter fyrer ikke på nytt — og et klikk overstyrer hover-pausen
  // med vilje (brukeren har sagt «videre»). Uten denne ut-og-inn-bevegelsen tester vi
  // ikke hover, men klikkets ettervirkning.
  await page.mouse.move(0,0);
  await page.waitForTimeout(150);
  await page.locator('#sceneVp').hover();
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
  // MERK: startsentreringen måles IKKE her — se egen blokk under. Testen kan ikke
  // både la autoplay rotere og samtidig lese «hvor scenen startet»: goto(networkidle)
  // bruker ~10s på denne sida (hero-videoen looper og holder nettverket vått), så når
  // vi kommer hit har sporet forlengst rotert videre. Den gamle «vent til sporet står
  // stille»-varianten traff da stillstanden til et ANNET kort — og med bookingkortets
  // 15s dvelding ble det som regel kort 2. Målingen ga 241px og så ut som en layout-bug;
  // scenen gjorde ingenting galt.

  // Autoplay skal rotere HELT TIL brukeren tar i sporet — da permanent av.
  // Ventetida kan ikke være et fast 5,6s lenger: dvellinga er ikke lik for alle kort.
  // Lander vi på bookingkortet (15s), er «uendret etter 5,6s» helt riktig oppførsel, og
  // en fast venting ville meldt feil på noe som virker. Vi poller til fokus FLYTTER seg,
  // med tak litt over den lengste dvellinga, og rapporterer hvor lang tid det tok.
  const a=await aktiv(page);
  const t0=Date.now(); let b=a;
  while(Date.now()-t0<17000){
    await page.waitForTimeout(250);
    b=await aktiv(page);
    if(b.kort!==a.kort) break;
  }
  const brukt=Math.round((Date.now()-t0)/100)/10;
  oppforsel.push({test:'mobil: autoplay går før touch',
    resultat:`${a.kort} → ${b.kort} etter ${brukt}s`, ventet:'endret innen 17s',
    ok:a.kort!==b.kort?'✓':'✗'});

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
  // Måles på .cal-pop, ikke på .crow: radene BLIR til av animasjonen, og med bevegelse av
  // kjører den aldri — så #calRows er tom og querySelector('.crow') ga null. Popup-kortet
  // står permanent i markupen og har samme transition-regel.
  const anim=await page.evaluate(()=>getComputedStyle(document.querySelector('#produkt .cal-pop')).transitionDuration);
  const kalTom=await page.evaluate(()=>document.querySelectorAll('#calRows .crow').length);
  await page.locator('#produkt').screenshot({path:`${OUT}/1280-produkt-redusert.png`});
  oppforsel.push({test:'redusert: ingen autoplay', resultat:`${a.kort} → ${b.kort}`, ventet:'uendret',
    ok:a.kort===b.kort?'✓':'✗'});
  oppforsel.push({test:'redusert: ingen transition', resultat:trans, ventet:'0s', ok:/^0s(,\s*0s)*$/.test(trans)?'✓':'✗'});
  oppforsel.push({test:'redusert: ingen kalender-transition', resultat:anim, ventet:'0s', ok:/^0s/.test(anim)?'✓':'✗'});
  oppforsel.push({test:'redusert: kalenderen står tom', resultat:kalTom+' rader', ventet:'0 rader',
    ok:kalTom===0?'✓':'✗'});
  oppforsel.push({test:'redusert: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Mobil: hvor scenen STARTER ──────────────────────────────────────────────────
// Egen kontekst med prefers-reduced-motion, fordi det er den eneste tilstanden der
// autoplay garantert ikke har flyttet sporet før vi rekker å måle: startAuto() returnerer
// på REDUSERT. senterKort(1,false) er IKKE guardet av REDUSERT og kjører som ellers, så
// det vi måler er samme kodevei som med bevegelse på — bare uten kappløpet.
{
  const ctx=await browser.newContext({viewport:{width:375,height:900},deviceScaleFactor:2,
    reducedMotion:'reduce'});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  // Sentreringen flytter scrollLeft bort fra 0. Uteblir den, feiler ventinga — testen
  // kan ikke passere på at ingenting skjedde.
  await page.waitForFunction(()=>document.getElementById('scene').scrollLeft>0,
    null,{timeout:4000,polling:60});
  const start=await page.evaluate(()=>{
    const sc=document.getElementById('scene');
    const k=[...sc.querySelectorAll('.mock')].find(x=>x.dataset.i==='1');
    const rs=sc.getBoundingClientRect(), rk=k.getBoundingClientRect();
    return Math.round(Math.abs((rk.left+rk.width/2)-(rs.left+rs.width/2)));
  });
  oppforsel.push({test:'start = dashbord sentrert', resultat:start+'px fra midten',
    ventet:'≤4px', ok:start<=4?'✓':'✗'});
  oppforsel.push({test:'start: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Dvelleklokka teller fra fokusskiftet, ikke fra mouseleave ───────────────────
// Hover pauser rotasjonen med vilje. Men ved gjenopptakelse ble en HEL ny dvelletid
// armet: kortet hadde stått ferdigspilt i 20 sekunder, og man ventet 14 til fordi klokka
// startet på nytt. Målt 34s på et kort med 14s dvelletid. Nå regnes resttiden fra
// fokusskiftet, med et lite gulv så fokus ikke rykker videre i samme øyeblikk som
// pekeren krysser kanten.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'domcontentloaded'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.mouse.move(5,5);
  await page.waitForTimeout(1000);
  const kortNaa=()=>page.evaluate(()=>{const k=document.querySelector('#scene .mock.on');return k?k.dataset.i:'-';});
  // Hover UTEN klikk: passiv lesing, rotasjonen skal fryse.
  await page.locator('#sceneVp').hover();
  const fryst1=await kortNaa();
  // Lenger enn den lengste dvelletiden (14s), så kortet er garantert ferdigspilt og
  // dvelletiden for lengst utløpt mens vi holdt igjen.
  await page.waitForTimeout(16000);
  const fryst2=await kortNaa();
  oppforsel.push({test:'hover: fryser mens pekeren ligger',
    resultat:`${fryst1} → ${fryst2} etter 16s`, ventet:'uendret',
    ok:fryst1===fryst2?'✓':'✗'});
  // Slipp: nå skal fokus flytte seg raskt, ikke etter en hel ny dvelletid.
  const t0=Date.now();
  await page.mouse.move(5,5);
  await page.waitForFunction(f=>{
    const k=document.querySelector('#scene .mock.on');
    return k && k.dataset.i!==f;
  },fryst2,{timeout:6000,polling:50}).catch(()=>{});
  const brukt=Date.now()-t0;
  oppforsel.push({test:'mouseleave på ferdigspilt kort: skifter innen 2,5s',
    resultat:Math.round(brukt/10)/100+'s', ventet:'≤2,5s', ok:brukt<=2500?'✓':'✗'});
  oppforsel.push({test:'hover: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Én sekvens per fokus, og sluttilstand når fokus forlater kortet ─────────────
// Sekvensene løp før videre usynlig, hver med sin egen rundetid, mens fokus flyttet seg
// etter en annen takt. Kalenderen kunne rekke tre runder under ett fokus og halvannen
// under det neste — samme kort så forskjellig ut hver gang. Denne testen ser på en hel
// rotasjon og krever nøyaktig én runde per fokusperiode, samt at kortet står stille i
// sluttilstanden sin idet fokus går videre (ellers er byttet vanskelig å lese).
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'domcontentloaded'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  const logg=await page.evaluate(()=>new Promise(ferdig=>{
    const b=document.getElementById('pvBook');
    const rader=[]; const t0=performance.now(); let sist='';
    const id=setInterval(()=>{
      const on=document.querySelector('#scene .mock.on');
      const r={
        i:on?+on.dataset.i:-1,
        teller:(document.getElementById('calCount')||{}).textContent||'-',
        kpi:(document.querySelector('#scene .pv-rev-n')||{}).textContent||'-',
        gull:/rekord-gull/.test((document.querySelector('#scene .pv-rev')||{}).className||''),
        bok: b.classList.contains('vis-success') ? '6'
           : !b.classList.contains('vis-sheet') ? '1' : 'underveis',
      };
      const n=JSON.stringify(r);
      if(n!==sist){ sist=n; rader.push({ms:Math.round(performance.now()-t0),...r}); }
      if(performance.now()-t0>32000){ clearInterval(id); ferdig(rader); }
    },40);
  }));
  const perioder=[];
  for(const r of logg){
    if(!perioder.length||perioder[perioder.length-1].kort!==r.i)
      perioder.push({kort:r.i, fra:r.ms, h:[]});
    perioder[perioder.length-1].h.push(r);
  }
  // Første og siste periode er avkortet av målevinduet — de teller ikke.
  const hele=perioder.slice(1,-1);
  const dom=hele.map(per=>{
    const h=per.h, siste=h[h.length-1];
    let runder=0, f=null;
    for(const x of h){
      const naa = per.kort===0 ? x.teller : per.kort===1 ? String(x.gull) : x.bok;
      const mål = per.kort===0 ? '5'      : per.kort===1 ? 'true'         : '6';
      if(naa===mål && f!==mål) runder++;
      f=naa;
    }
    const slutt = per.kort===0 ? siste.teller==='5'
                : per.kort===1 ? (siste.gull && siste.kpi==='10 550')
                : siste.bok==='6';
    return {kort:per.kort, runder, slutt};
  });
  const énRunde=dom.length>=2 && dom.every(d=>d.runder===1);
  const sluttOK=dom.length>=2 && dom.every(d=>d.slutt);
  oppforsel.push({test:'takt: én sekvens per fokusperiode',
    resultat:dom.map(d=>`kort ${d.kort}:${d.runder}`).join(' ')||'ingen perioder',
    ventet:'1 per periode', ok:énRunde?'✓':'✗'});
  oppforsel.push({test:'takt: sluttilstand ved fokus-tap',
    resultat:dom.map(d=>`kort ${d.kort}:${d.slutt?'ok':'MIDT I'}`).join(' ')||'ingen perioder',
    ventet:'alle i sluttilstand', ok:sluttOK?'✓':'✗'});
  oppforsel.push({test:'takt: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Tilstand 6: bekreftelsen ligger der produktet legger den ────────────────────
// Klonen brukte <div class="bk-success"> — men «bk-success» er kildens ID, ikke en
// klasse. Kildens container heter .success-wrap og bærer text-align:center og
// padding:40px 20px (booking-module.cjs:246). Uten klassen sto bekreftelsen
// venstrestilt og uten luft, med alt innholdet klemt mot toppen.
//
// FASIT-TALLENE er målt mot den publiserte sida ved å avsløre #bk-success i DOM-en
// (ingen booking opprettet): success-wrap starter 115px inn i .sheet-inner, og ✓-ikonet
// 155px inn. Endres kildens padding eller .back-sheet, skal disse tallene endres MED
// en ny måling — ikke justeres til det som får testen grønn.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const s6=await page.evaluate(()=>{
    const b=document.getElementById('pvBook');
    b.className='pv-book vis-sheet vis-success';
    const w=b.querySelector('.success-wrap');
    if(!w) return {mangler:true};
    const ico=w.querySelector('.success-ico');
    const skjerm=b.closest('.iph-screen'), ark=w.closest('.sheet-inner');
    // Skalaen gås oppover FRA elementet: .pv-scale ligger inni .pv-book, så en kjede
    // som starter høyere oppe bommer på den og gir tall i feil enhet.
    const sk=(function(){let x=1,e=w;while(e&&e!==document.body){const t=getComputedStyle(e).transform;
      if(t&&t!=='none')x*=parseFloat(t.split(/[(,]/)[1])||1;e=e.parentElement;}return x;})();
    const rS=skjerm.getBoundingClientRect(), rA=ark.getBoundingClientRect(),
          rW=w.getBoundingClientRect(), rI=ico.getBoundingClientRect();
    const cs=getComputedStyle(w);
    return {
      antall:b.querySelectorAll('.success-wrap').length,
      textAlign:cs.textAlign, padding:cs.padding,
      // Ikonet mot SKJERMENS midte, i skjermpiksler — det er slik øyet ser det.
      ikonBom:Math.round(Math.abs((rI.left+rI.width/2)-(rS.left+rS.width/2))),
      wrapTop:Math.round((rW.top-rA.top)/sk),
      ikonTop:Math.round((rI.top-rA.top)/sk),
    };
  });
  oppforsel.push({test:'tilstand 6: kildens container',
    resultat:`${s6.antall} × .success-wrap, ${s6.textAlign}, ${s6.padding}`,
    ventet:'1, center, 40px 20px',
    ok:(s6.antall===1&&s6.textAlign==='center'&&s6.padding==='40px 20px')?'✓':'✗'});
  oppforsel.push({test:'tilstand 6: ✓-ikon sentrert i skjermen',
    resultat:s6.ikonBom+'px fra midten', ventet:'≤2px', ok:s6.ikonBom<=2?'✓':'✗'});
  oppforsel.push({test:'tilstand 6: vertikal posisjon som fasiten',
    resultat:`wrap ${s6.wrapTop}px / ikon ${s6.ikonTop}px`, ventet:'115px / 155px (±4)',
    ok:(Math.abs(s6.wrapTop-115)<=4&&Math.abs(s6.ikonTop-155)<=4)?'✓':'✗'});
  oppforsel.push({test:'tilstand 6: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Telefonskalaen er riktig fra første målbare frame ───────────────────────────
// --ph-s skalerer 320 designpiksler ned i telefonens skjermflate. Den ble regnet av
// getBoundingClientRect(), som gir den TRANSFORMERTE bredden — og siden fokus-ringen
// skalerer kortene (.75 på siden, 1 i midten), avhang verdien av hvilket kort som
// tilfeldigvis hadde fokus da målingen skjedde. Bookingkortet lastet med 0,6328 i stedet
// for 0,84375 og sto for smalt med tomrom på hver side.
//
// Testen måler ved DOMContentLoaded, ved load og 2s senere og krever SAMME verdi. Da
// fanger den både en gal verdi og en verdi som «retter seg selv» etterpå — det siste er
// like galt, det betyr bare at feilen er kortvarig.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{
    window.__phs={};
    const les=m=>{
      const k=document.querySelector('#scene .pv-phone[data-i="2"]');
      if(k) window.__phs[m]=(getComputedStyle(k).getPropertyValue('--ph-s')||'').trim();
    };
    document.addEventListener('DOMContentLoaded',()=>les('dcl'));
    addEventListener('load',()=>les('load'));
  });
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'load'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);
  const phs=await page.evaluate(()=>{
    const k=document.querySelector('#scene .pv-phone[data-i="2"]');
    const skjerm=k.querySelector('.iph-screen');
    return {...window.__phs,
      etter2s:(getComputedStyle(k).getPropertyValue('--ph-s')||'').trim(),
      layoutbredde:skjerm.offsetWidth,
      fasit:Math.round(skjerm.offsetWidth/320*10000)/10000};
  });
  const verdier=[phs.dcl,phs.load,phs.etter2s];
  const like=verdier.every(v=>v===verdier[0]);
  oppforsel.push({test:'--ph-s: samme ved DCL, load og +2s',
    resultat:verdier.join(' / '), ventet:'tre like verdier', ok:like?'✓':'✗'});
  oppforsel.push({test:'--ph-s: riktig mot layoutbredden',
    resultat:`${phs.etter2s} (skjerm ${phs.layoutbredde}px)`, ventet:String(phs.fasit),
    ok:Math.abs(parseFloat(phs.etter2s)-phs.fasit)<0.0002?'✓':'✗'});
  // Kalenderkortet bruker samme mekanikk, men har ingen .pv-scale — .pv-cal er bygget i
  // designsystemet og fyller skjermen naturlig. Den skal IKKE få --ph-s.
  const kal=await page.evaluate(()=>{
    const k=document.querySelector('#scene .pv-phone[data-i="0"]');
    return {scale:!!k.querySelector('.pv-scale'),
      phS:(getComputedStyle(k).getPropertyValue('--ph-s')||'').trim()||'(ingen)'};
  });
  oppforsel.push({test:'--ph-s: kalenderkortet skaleres ikke',
    resultat:`.pv-scale=${kal.scale}, --ph-s=${kal.phS}`, ventet:'false / (ingen)',
    ok:(!kal.scale&&kal.phS==='(ingen)')?'✓':'✗'});
  oppforsel.push({test:'--ph-s: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Ring-karusellen (desktop) ───────────────────────────────────────────────────
// Det aktive kortet skal ROTERE inn i midten, ikke vokse der det står. Måles på
// geometri: sentrert i .scene, like mellomrom på hver side, og at retningen er den
// samme hakk etter hakk. En test som bare sjekker at .on flytter seg ville ikke sett
// forskjell på en ring og tre kort som står stille.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  await page.locator('#sceneVp').hover();          // frys rotasjonen mens vi måler
  await page.waitForTimeout(1200);

  const geo=()=>page.evaluate(()=>{
    const sc=document.getElementById('scene');
    const rs=sc.getBoundingClientRect();
    const kort=[...sc.querySelectorAll('.mock')].map(k=>{
      const r=k.getBoundingClientRect();
      return {i:+k.dataset.i, on:k.classList.contains('on'),
        venstre:r.left, hoyre:r.right, senter:r.left+r.width/2};
    });
    const aktiv=kort.find(k=>k.on);
    const sortert=[...kort].sort((a,b)=>a.senter-b.senter);
    const p=sortert.findIndex(k=>k.on);
    return {
      bom: aktiv ? Math.round(Math.abs(aktiv.senter-(rs.left+rs.width/2))) : -1,
      aktivI: aktiv?aktiv.i:-1,
      plassering: p,                                    // 0=venstre, 1=midten, 2=høyre
      // Mellomrom fra aktivt kort til naboen på hver side.
      venstreGap: p>0 ? Math.round(sortert[p].venstre-sortert[p-1].hoyre) : null,
      hoyreGap:   p<2 ? Math.round(sortert[p+1].venstre-sortert[p].hoyre) : null,
      rekkefolge: sortert.map(k=>k.i).join(','),
    };
  });

  const g1=await geo();
  oppforsel.push({test:'ring: aktivt kort sentrert', resultat:g1.bom+'px fra midten',
    ventet:'≤2px', ok:g1.bom<=2?'✓':'✗'});
  oppforsel.push({test:'ring: aktivt kort står i midten',
    resultat:'plass '+g1.plassering+' av 0–2', ventet:'1 (midten)',
    ok:g1.plassering===1?'✓':'✗'});
  oppforsel.push({test:'ring: like mellomrom',
    resultat:`venstre ${g1.venstreGap}px / høyre ${g1.hoyreGap}px`, ventet:'likt (±2px)',
    ok:(g1.venstreGap!==null&&g1.hoyreGap!==null&&Math.abs(g1.venstreGap-g1.hoyreGap)<=2)?'✓':'✗'});

  // Tre hakk: rekkefølgen i sporet skal forskyve seg samme vei hver gang. Vi leser hvilket
  // kort som lå til HØYRE før hakket og sjekker at nettopp det havnet i midten — det er
  // definisjonen på at ringen gikk mot venstre.
  const retninger=[];
  for(let n=0;n<3;n++){
    const foer=await geo();
    const foerSortert=await page.evaluate(()=>{
      const sc=document.getElementById('scene');
      return [...sc.querySelectorAll('.mock')]
        .map(k=>({i:+k.dataset.i, x:k.getBoundingClientRect().left}))
        .sort((a,b)=>a.x-b.x).map(k=>k.i);
    });
    const hoyreKort=foerSortert[2];
    await page.evaluate(()=>{                       // ett autoplay-hakk, uten å klikke
      const sc=document.getElementById('scene');
      const kort=[...sc.querySelectorAll('.mock')];
      const aktiv=+kort.find(k=>k.classList.contains('on')).dataset.i;
      kort.find(k=>+k.dataset.i===(aktiv+2)%3).click();
    });
    await page.waitForTimeout(1100);
    const etter=await geo();
    retninger.push(etter.aktivI===hoyreKort?'venstre':'annen');
  }
  oppforsel.push({test:'ring: samme retning tre hakk', resultat:retninger.join(' → '),
    ventet:'venstre × 3', ok:retninger.every(r=>r==='venstre')?'✓':'✗'});

  // Fem raske klikk på tvers. Rotasjonen tar inntil to hakk à 300ms, så 120ms mellom
  // klikkene treffer midt i — inkludert midt i ende-byttet, der kortet er usynlig.
  // Det var her ringen brakk: den usynlige fasen ble avlyst uten å bli avsluttet, og
  // kortene ble stående på inline opacity:0. Målt før fiks: alle tre usynlige, også det
  // sentrerte. Etter fem klikk skal nøyaktig ett kort være aktivt, sentrert og synlig.
  await page.mouse.move(0,0);
  for(const i of [0,2,1,0,2]){
    await page.locator(`#scene .mock[data-i="${i}"]`).click({force:true});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2500);          // la rotasjonen lande
  const kaos=await page.evaluate(()=>{
    const sc=document.getElementById('scene'), rs=sc.getBoundingClientRect();
    const kort=[...sc.querySelectorAll('.mock')];
    const på=kort.filter(k=>k.classList.contains('on'));
    const a=på[0];
    const ra=a?a.getBoundingClientRect():null;
    return {
      antallPa:på.length,
      bom:ra?Math.round(Math.abs((ra.left+ra.width/2)-(rs.left+rs.width/2))):-1,
      opacity:a?+(+getComputedStyle(a).opacity).toFixed(2):-1,
      usynlige:kort.filter(k=>+getComputedStyle(k).opacity<0.05).map(k=>k.dataset.i).join(',')||'ingen',
      utenfor:kort.filter(k=>{const r=k.getBoundingClientRect();
        return r.left<rs.left-1||r.right>rs.right+1;}).map(k=>k.dataset.i).join(',')||'ingen',
    };
  });
  oppforsel.push({test:'ring: fem raske klikk — ett aktivt kort',
    resultat:`${kaos.antallPa} med .on`, ventet:'1', ok:kaos.antallPa===1?'✓':'✗'});
  oppforsel.push({test:'ring: fem raske klikk — sentrert og synlig',
    resultat:`${kaos.bom}px fra midten, opacity ${kaos.opacity}`, ventet:'≤2px, opacity 1',
    ok:(kaos.bom<=2&&kaos.opacity>=0.99)?'✓':'✗'});
  oppforsel.push({test:'ring: fem raske klikk — ingen usynlige kort',
    resultat:'usynlige: '+kaos.usynlige, ventet:'ingen', ok:kaos.usynlige==='ingen'?'✓':'✗'});
  oppforsel.push({test:'ring: fem raske klikk — alle innenfor .scene',
    resultat:'utenfor: '+kaos.utenfor, ventet:'ingen', ok:kaos.utenfor==='ingen'?'✓':'✗'});

  // Mobil skal IKKE ha ringen — der eier scroll-snap plasseringen.
  const mctx=await browser.newContext({viewport:{width:375,height:900},deviceScaleFactor:1});
  const mpage=await mctx.newPage();
  await mpage.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await mpage.locator('#produkt').scrollIntoViewIfNeeded();
  await mpage.waitForTimeout(700);
  const mobilDx=await mpage.evaluate(()=>[...document.querySelectorAll('#scene .mock')]
    .map(k=>getComputedStyle(k).transform).join(' | '));
  oppforsel.push({test:'ring: av på mobil', resultat:mobilDx.replace(/\s+/g,''),
    ventet:'none på alle', ok:/^none(\|none)*$/.test(mobilDx.replace(/\s+/g,''))?'✓':'✗'});
  await mctx.close();

  // Bytte fra desktop til mobil MENS ringen har satt inline-stiler. Bookingkortet
  // forsvant her: --dx og et strandet opacity:0 ble stående, og inline-stil slår @media.
  // Vi klikker først, så resizer MIDT i ende-byttet — verste tidspunkt.
  const rctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const rpage=await rctx.newPage();
  await rpage.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await rpage.locator('#produkt').scrollIntoViewIfNeeded();
  await rpage.waitForTimeout(1200);
  await rpage.locator('#scene .mock[data-i="0"]').click({force:true});
  await rpage.waitForTimeout(200);                       // midt i ende-byttet
  await rpage.setViewportSize({width:375,height:900});
  await rpage.waitForTimeout(900);
  const etterResize=await rpage.evaluate(()=>{
    const sc=document.getElementById('scene');
    const kort=[...sc.querySelectorAll('.mock')];
    return {
      transform:kort.map(k=>getComputedStyle(k).transform).join('|'),
      dx:kort.map(k=>k.style.getPropertyValue('--dx')||'-').join('|'),
      usynlige:kort.filter(k=>+getComputedStyle(k).opacity<0.05).map(k=>k.dataset.i).join(',')||'ingen',
      // «Synlig i sporet» på mobil = ligger innenfor det scrollbare innholdet, ikke
      // innenfor viewporten: sporet SKAL kunne scrolles.
      utenforSporet:kort.filter(k=>k.offsetLeft<0||k.offsetLeft+k.offsetWidth>sc.scrollWidth+1)
        .map(k=>k.dataset.i).join(',')||'ingen',
    };
  });
  oppforsel.push({test:'resize 1280→375: ingen transform',
    resultat:etterResize.transform, ventet:'none|none|none',
    ok:etterResize.transform==='none|none|none'?'✓':'✗'});
  oppforsel.push({test:'resize 1280→375: --dx ryddet',
    resultat:etterResize.dx, ventet:'-|-|-', ok:etterResize.dx==='-|-|-'?'✓':'✗'});
  oppforsel.push({test:'resize 1280→375: alle tre synlige i sporet',
    resultat:`usynlige: ${etterResize.usynlige}, utenfor: ${etterResize.utenforSporet}`,
    ventet:'ingen / ingen',
    ok:(etterResize.usynlige==='ingen'&&etterResize.utenforSporet==='ingen')?'✓':'✗'});
  await rctx.close();

  oppforsel.push({test:'ring: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Kalenderen fylles fra tom ───────────────────────────────────────────────────
// Dagen skal starte HELT tom med telleren på 0 og fylles med fem fargekodede bookinger.
// Sto det rader i markupen, ville testen ikke merket at animasjonen var død — den ville
// bare sett rader som alltid har vært der. Derfor måles BÅDE utgangspunktet og fyllingen.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();

  const tom=await page.evaluate(()=>({
    rader:document.querySelectorAll('#calRows .crow').length,
    markup:document.getElementById('calRows').innerHTML.trim().length}));
  oppforsel.push({test:'kalender: tom i markupen',
    resultat:`${tom.markup} tegn i #calRows`, ventet:'0 (fylles av JS)',
    ok:tom.markup===0?'✓':'✗'});

  await fokuser(page,0);
  await page.locator('#sceneVp').hover();
  const kles=()=>page.evaluate(()=>{
    const rows=document.getElementById('calRows');
    const synlige=[...rows.querySelectorAll('.crow.inn')];
    return {teller:document.getElementById('calCount').textContent,
      synlige:synlige.length,
      farger:synlige.map(r=>(r.className.match(/k-[abc]/)||['-'])[0]).join(','),
      ufarget:synlige.filter(r=>!/k-[abc]/.test(r.className)).length};
  });
  const t0k=Date.now();
  await page.waitForTimeout(300);
  const kA=await kles();
  oppforsel.push({test:'kalender: starter på 0', resultat:`teller=${kA.teller} synlige=${kA.synlige}`,
    ventet:'0 / 0', ok:(kA.teller==='0'&&kA.synlige===0)?'✓':'✗'});

  // Alle fem skal være inne innen 6s — kravet er «~5–6s».
  await page.waitForFunction(()=>document.getElementById('calCount').textContent==='5',
    null,{timeout:6500,polling:80}).catch(()=>{});
  const brukt=Math.round((Date.now()-t0k)/100)/10;
  const kB=await kles();
  oppforsel.push({test:'kalender: fem bookinger inn',
    resultat:`teller=${kB.teller} synlige=${kB.synlige} etter ${brukt}s`, ventet:'5 / 5 innen 6s',
    ok:(kB.teller==='5'&&kB.synlige===5&&brukt<=6.5)?'✓':'✗'});
  oppforsel.push({test:'kalender: alle fargekodet',
    resultat:kB.farger||'ingen', ventet:'ingen ufargede',
    ok:(kB.synlige===5&&kB.ufarget===0)?'✓':'✗'});

  // Som bookingkortet: fokus skal ta dagen tilbake til tom.
  await page.mouse.move(0,0);
  await fokuser(page,1);
  await fokuser(page,0);
  await page.waitForTimeout(250);
  const kC=await kles();
  oppforsel.push({test:'kalender: starter forfra ved fokus',
    resultat:`teller=${kC.teller} synlige=${kC.synlige}`, ventet:'0 / 0',
    ok:(kC.teller==='0'&&kC.synlige===0)?'✓':'✗'});
  oppforsel.push({test:'kalender: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
    ventet:'ingen', ok:errs.length?'✗':'✓'});
  await ctx.close();
}

// ── Bookingdemoen spiller faktisk ───────────────────────────────────────────────
// Egen runde, fordi sekvensen tar 14 sekunder. Den fantes ikke før, og det kostet:
// da tidslukene ble bygget om, forsvant .pv-anim-slot fra markupen, bookingLoop()
// returnerte på «if(!slot||…)return» og HELE demoen var død — ingen JS-feil, ingen rød
// celle, alle andre tester grønne. En test som teller elementer ser ikke at ingenting
// beveger seg. Denne leser skjemafeltene mens sekvensen går.
{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/no/index.html`,{waitUntil:'networkidle'});
  await page.locator('#produkt').scrollIntoViewIfNeeded();
  // Tilstanden utledes av de SAMME klassene som skiller de seks godkjente skjermene, så
  // testen og tilstandsbildene snakker om det samme.
  const les=()=>page.evaluate(()=>{
    const b=document.getElementById('pvBook');
    const sek=b.querySelectorAll('.acc-section');
    const apen=i=>sek[i].querySelector('.acc-bd').classList.contains('open');
    const n=b.querySelector('input[autocomplete="name"]'), t=b.querySelector('input[autocomplete="tel"]');
    const svc=b.querySelector('.svc-card'), dag=b.querySelector('.pv-dag'),
          slot=b.querySelector('.pv-anim-slot');
    const tilstand =
      b.classList.contains('vis-success') ? '6 bekreftelse' :
      !b.classList.contains('vis-sheet')  ? '1 forside' :
      apen(2) ? '5 opplysninger' :
      apen(1) ? (slot.classList.contains('sel') ? '4 tid'
               : dag.classList.contains('sel') ? '3b dato valgt' : '3 velg dato') :
      (svc.classList.contains('sel') ? '2b tjeneste valgt' : '2 tjenestevalg');
    return {tilstand, navn:n?n.value:'?', tlf:t?t.value:'?'};
  });
  const markorer=await page.evaluate(()=>{
    const b=document.getElementById('pvBook');
    return {slot:!!b.querySelector('.pv-anim-slot'), neste2:!!b.querySelector('.pv-next2'),
      se:!!b.querySelector('.see-float'), neste1:!!b.querySelector('.acc-next'),
      svc:!!b.querySelector('.svc-card'), dag:!!b.querySelector('.pv-dag'),
      send:!!b.querySelector('.sub-btn')};
  });
  const alleMarkorer=Object.values(markorer).every(Boolean);
  oppforsel.push({test:'booking: animasjonsmarkører finnes',
    resultat:Object.entries(markorer).filter(([,v])=>!v).map(([k])=>k).join(',')||'alle',
    ventet:'alle', ok:alleMarkorer?'✓':'✗'});

  // Kortet må ha FOKUS før vi sporer: rotasjonen ville ellers nullstilt sekvensen midt i
  // målingen når den kom hit av seg selv. Hover pauser rotasjonen etterpå.
  await fokuser(page,2);
  await page.locator('#sceneVp').hover();
  const t0=Date.now();
  const punkter=[
    [ 1000,'1 forside',        null,   null],
    [ 3400,'2b tjeneste valgt',null,   null],
    [ 4700,'3 velg dato',      null,   null],
    [ 6400,'4 tid',            null,   null],
    [ 9000,'5 opplysninger',   'Marcus',''],
    [10800,'5 opplysninger',   'Marcus','900 00 000'],
    [12500,'6 bekreftelse',    'Marcus','900 00 000'],
  ];
  const sett=[];
  for(const [ms,ventetTilstand,ventetNavn,ventetTlf] of punkter){
    const igjen=ms-(Date.now()-t0);
    if(igjen>0) await page.waitForTimeout(igjen);
    const r=await les();
    sett.push({ms, ...r});
    const feil=[];
    if(r.tilstand!==ventetTilstand) feil.push('tilstand');
    if(ventetNavn!==null && r.navn!==ventetNavn) feil.push('navn');
    if(ventetTlf!==null && r.tlf!==ventetTlf) feil.push('tlf');
    oppforsel.push({test:`booking @${(ms/1000).toFixed(1)}s`,
      resultat:r.tilstand+(ventetNavn!==null?`  «${r.navn}» «${r.tlf}»`:''),
      ventet:ventetTilstand+(ventetNavn!==null?`  «${ventetNavn}» «${ventetTlf}»`:''),
      ok:feil.length?'✗':'✓'});
  }

  // Sekvensen løper uavhengig av fokus, og fokus kommer tilbake til kortet sjeldnere enn
  // runden varer — de driver fra hverandre. Uten omstart lander blikket midt i: skjemaet
  // står ferdig utfylt, og at kunden SKRIVER inn to felter — hele poenget med kortet —
  // rekker man aldri å se. Her er sekvensen garantert forbi skrivingen, så et fokusskifte
  // hit må ta den helt tilbake til forsiden.
  await page.mouse.move(0,0);
  await fokuser(page,0);
  await fokuser(page,2);
  await page.waitForTimeout(250);
  const e=await les();
  oppforsel.push({test:'booking: starter forfra ved fokus',
    resultat:`${e.tilstand}  navn=«${e.navn}» tlf=«${e.tlf}»`,
    ventet:'1 forside, tomme felt',
    ok:(e.tilstand==='1 forside'&&e.navn===''&&e.tlf==='')?'✓':'✗'});
  oppforsel.push({test:'booking: jsfeil', resultat:errs.length?errs.join('; ').slice(0,40):'ingen',
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
