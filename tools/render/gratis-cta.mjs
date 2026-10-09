// Gratis-lansering (no/): CTA-tekster («Kom i gang gratis»), linja under CTA («Ingen kort · Ingen
// prøveperiode»), FAQ-svarene på priser.html, «Ingen overraskelser»-tabellen (tre rader) og
// index-avslutningen. Måler at nav-CTA-en holder én linje uten overflow på 320, at note-linjene
// holder én linje, at tabellens siste rad/høyre kolonne går helt ned til kanten, og at ingen
// overskrift ender med et enkeltord alene. Skjermbilder til .render-ut/gratis-cta/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/gratis-cta');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.mp4':'video/mp4'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const browser=await chromium.launch();
let feil=0, prodForsok=0, avskaaret=0;
const sjekk=(ok,tekst)=>{console.log((ok?'OK   ':'FEIL ')+tekst); if(!ok) feil++;};

async function aapne(side,bredde,hoyde=900){
  const page=await browser.newPage({viewport:{width:bredde,height:hoyde},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('request',q=>{ if(q.url().includes('api.trybarberhq.com')) prodForsok++; });
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  // Registrert sist = kjøres først: alt mot prod-API-et avbrytes i nettleseren (index sin session-GET).
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{avskaaret++; return r.abort();});
  await page.goto(`http://localhost:${PORT}/no/${side}.html`,{waitUntil:'load'});
  await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in','vis','visible')));
  await page.waitForTimeout(800);
  return {page,errs};
}

// Én linje = høyden er under 1,5 × line-height.
const enLinje=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s); if(!e) return {tekst:'(mangler)',en:false,h:0,lh:0};
  const cs=getComputedStyle(e); const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.2;
  const h=e.getBoundingClientRect().height; return {h, lh, en:h<lh*1.5, tekst:e.textContent.trim()};},sel);

// Linjene en overskrift faktisk brekkes i (Range-rects per ord).
const linjer=(page,sel)=>page.evaluate(s=>{const el=document.querySelector(s); const out=[]; let y=null;
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n;
  while((n=w.nextNode())){ const re=/\S+/g; let m; while((m=re.exec(n.data))){ const r=document.createRange(); r.setStart(n,m.index); r.setEnd(n,m.index+m[0].length);
    const top=Math.round(r.getBoundingClientRect().top); if(y===null||Math.abs(top-y)>4){out.push([]);y=top;} out.at(-1).push(m[0]); } }
  return out.map(l=>l.join(' '));},sel);

const navSkudd=async(page,fil)=>{ await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(200);
  const h=await page.evaluate(()=>{const n=document.querySelector('nav'); return n.getBoundingClientRect().height+(n.classList.contains('open')?(document.querySelector('.nav-panel')?.getBoundingClientRect().height||0):0);});
  await page.screenshot({path:path.join(OUT,fil),clip:{x:0,y:0,width:page.viewportSize().width,height:Math.max(70,h)}}); };
const elSkudd=async(page,sel,fil)=>{ const el=page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await el.screenshot({path:path.join(OUT,fil)}); };

// «Ingen overraskelser»: tre rader, siste rad og høyre kolonne går helt ned til tabellkanten.
async function tabell(page,b){
  const m=await page.evaluate(()=>{const t=document.querySelector('.ds-tab'); const tr=[...t.querySelectorAll('.ds-tr')];
    const tb=t.getBoundingClientRect(); const sist=tr.at(-1).getBoundingClientRect(); const us=tr.at(-1).querySelector('.ds-td-us').getBoundingClientRect();
    const cs=getComputedStyle(t);
    return {rader:tr.length, th:t.querySelector('.ds-th-them').textContent.trim(),
      radBunn:tb.bottom-sist.bottom, usBunn:tb.bottom-us.bottom, usHoyre:tb.right-us.right,
      radius:cs.borderBottomLeftRadius, overflow:cs.overflow};});
  sjekk(m.rader===3 && m.th==='Markedsplasser',`${b} tabell: ${m.rader} rader, venstre kolonne «${m.th}»`);
  const kant=v=>Math.abs(v-1)<0.6;   // 1px = tabellens egen border
  sjekk(kant(m.radBunn)&&kant(m.usBunn)&&kant(m.usHoyre)&&m.overflow==='hidden'&&m.radius==='16px',
    `${b} tabell: siste rad/høyre kolonne helt ned (bunn ${m.radBunn.toFixed(1)} / us-bunn ${m.usBunn.toFixed(1)} / us-høyre ${m.usHoyre.toFixed(1)}), radius ${m.radius}, overflow ${m.overflow}`);
  const l=await linjer(page,'.ds-h2');
  sjekk(l.every(x=>x.includes(' ')),`${b} tabell-h2: ${l.map(x=>`«${x}»`).join(' / ')}`);
  await elSkudd(page,'#din-side',`${b}-index-ingen-overraskelser.png`);
}

async function indexAvslutning(page,b){
  const cn=await enLinje(page,'.final-cta .cta-note');
  sjekk(cn.tekst==='Ingen kort · Ingen prøveperiode' && cn.en,`${b} index-avslutning note «${cn.tekst}» én linje (h=${cn.h.toFixed(1)})`);
  const l=await linjer(page,'.final-cta h2');
  sjekk(l.length>0 && l.at(-1).includes(' '),`${b} index-avslutning h2: ${l.map(x=>`«${x}»`).join(' / ')}`);
  await elSkudd(page,'section.final-cta',`${b}-index-avslutning.png`);
}

// Prisseksjonen (priser.html): Gratis først på mobil, like høye kort på desktop, Vekst-kortets
// bunntekst innenfor kortet (ikke avkuttet), ingen overflow. Skudd fra «PRISER» til chipsene.
async function prisseksjon(page,b){
  const m=await page.evaluate(()=>{
    const k=[...document.querySelectorAll('.pr-card')].map(c=>({navn:c.querySelector('.pr-name').textContent.trim(),
      top:c.offsetTop, left:c.offsetLeft, h:c.offsetHeight, r:c.getBoundingClientRect()}));
    const v=document.querySelector('.pr-vekst'); const vr=v.getBoundingClientRect(); const fine=v.querySelector('.pr-fine').getBoundingClientRect();
    const note=document.querySelector('.pr-basis .pr-note'); const nr=note.getBoundingClientRect(); const nlh=parseFloat(getComputedStyle(note).fontSize)*1.6;
    return {kort:k, pill:v.querySelector('.pr-pill').textContent.trim(), h1:document.querySelector('.ph-hero h1').innerText.replace(/\n/g,' / '),
      fineInni:vr.bottom-fine.bottom, noteEn:nr.height<nlh, over:document.documentElement.scrollWidth-innerWidth,
      chips:[...document.querySelectorAll('.pp-item')].map(x=>x.textContent.trim()), trial:!!document.querySelector('.pr-trial.reveal')};});
  const [g,v]=m.kort;
  sjekk(g.navn==='GRATIS'&&v.navn==='VEKST'&&m.pill==='MEST VERDI'&&m.h1==='Gratis booking. / Betal for vekst.',`${b} pris: «${m.h1}», kort ${g.navn}/${v.navn}, pill «${m.pill}»`);
  const hl=await linjer(page,'.ph-hero h1'), pl=await linjer(page,'.ph-hero p');
  const blaa=await page.evaluate(()=>getComputedStyle(document.querySelector('.ph-hero .hl-blue')).color+' / '+getComputedStyle(document.querySelector('.ph-hero h1')).color);
  sjekk(hl.every(x=>x.includes(' '))&&pl.at(-1).includes(' ')&&hl[0].endsWith('booking.'),`${b} pris-h1: ${hl.map(x=>'«'+x+'»').join(' / ')} (farge ${blaa}) · undertekst: ${pl.map(x=>'«'+x+'»').join(' / ')}`);
  if(b<760) sjekk(g.top<v.top,`${b} pris: Gratis over Vekst (top ${g.top} < ${v.top})`);
  else sjekk(g.h===v.h&&g.left<v.left,`${b} pris: like høye kort side om side (${g.h} / ${v.h})`);
  sjekk(m.fineInni>=20,`${b} pris: Vekst-finskrift innenfor kortet (${m.fineInni.toFixed(1)}px luft til bunn)`);
  sjekk(m.noteEn,`${b} pris: «Ingen kort · Ingen prøveperiode» under knappen holder én linje`);
  sjekk(m.over<=0 && !m.trial && m.chips[0]==='Ingen kort for å starte',`${b} pris: overflow ${m.over}, prøve-linja borte, chips ${m.chips.join(' | ')}`);
  // Hele seksjonen: fra .ph-hero til chipsene. Animasjonen (planFloat) stoppes for et stabilt skudd.
  // Gratis-kortet: rgba(255,255,255,.14)-ramme, ingen skygge, og hover endrer ingenting. Vekst uendret.
  const stil=()=>page.evaluate(()=>{const g=getComputedStyle(document.querySelector('.pr-basis')), v=getComputedStyle(document.querySelector('.pr-vekst'));
    return {gB:g.borderTopColor+' '+g.borderTopWidth+' '+g.borderTopStyle, gS:g.boxShadow, gScale:g.scale, gTr:g.transform,
            vB:v.borderTopColor, vS:v.boxShadow!=='none', vScale:v.scale};});
  const for_=await stil(); await page.hover('.pr-basis'); await page.waitForTimeout(400); const etter=await stil();
  sjekk(for_.gB==='rgba(255, 255, 255, 0.14) 1px solid' && for_.gS==='none',`${b} Gratis-ramme: ${for_.gB}, skygge ${for_.gS}`);
  sjekk(etter.gB===for_.gB && etter.gS===for_.gS && etter.gScale===for_.gScale && etter.gTr===for_.gTr,`${b} Gratis-hover: ingen endring (ramme/skygge/scale/transform)`);
  sjekk(for_.vB==='rgb(77, 139, 255)' && for_.vS && for_.vScale==='1.035',`${b} Vekst uendret: ramme ${for_.vB}, glød ${for_.vS}, scale ${for_.vScale}`);
  await page.mouse.move(0,0);
  await page.addStyleTag({content:'.pr-vekst{animation:none!important;translate:0 0!important}'});
  {const r=await page.evaluate(()=>{const r=document.querySelector('.pr-grid').getBoundingClientRect(); return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height};});
   const x=Math.max(0,r.x-20); await page.screenshot({fullPage:true,path:path.join(OUT,`${b}-priser-kortene.png`),
     clip:{x,y:r.y-30,width:Math.min(r.w+40,page.viewportSize().width-x),height:r.h+60}});}
  // Chipsene: hake + tekst som én enhet. Haken på første ords linje med fast avstand, og
  // hele enheten (hake + bredeste linje) sentrert horisontalt og vertikalt i chipen.
  const chips=await page.evaluate(()=>[...document.querySelectorAll('.pp-item')].map(c=>{
    const i=c.querySelector('i').getBoundingClientRect(), cr=c.getBoundingClientRect(), cs=getComputedStyle(c);
    const tn=[...c.querySelector('.pp-txt').childNodes].find(n=>n.nodeType===3);
    const r=document.createRange(); r.selectNodeContents(tn); const rects=[...r.getClientRects()];
    const f=document.createRange(); f.setStart(tn,0); f.setEnd(tn,tn.data.indexOf(' ')); const fw=f.getBoundingClientRect();
    const lines=[]; for(const x of [i,...rects]){ const l=lines.find(l=>Math.abs(l.mid-(x.top+x.bottom)/2)<6); if(l){l.left=Math.min(l.left,x.left);l.right=Math.max(l.right,x.right);} else lines.push({mid:(x.top+x.bottom)/2,left:x.left,right:x.right}); }
    const inL=cr.left+parseFloat(cs.paddingLeft)+1, inR=cr.right-parseFloat(cs.paddingRight)-1;
    const skjevH=Math.max(...lines.map(l=>Math.abs((l.left-inL)-(inR-l.right))));
    const top=Math.min(i.top,...rects.map(x=>x.top)), bunn=Math.max(i.bottom,...rects.map(x=>x.bottom));
    return {tekst:c.textContent.trim(), linjer:lines.length, gap:fw.left-i.right, sammeLinje:Math.abs((i.top+i.bottom)/2-(fw.top+fw.bottom)/2)<4,
      skjevH, skjevV:Math.abs((top-cr.top)-(cr.bottom-bunn))};}));
  for(const c of chips) sjekk(c.sammeLinje && c.gap>5 && c.gap<11 && c.skjevH<2 && c.skjevV<3,
    `${b} chip «${c.tekst}»: ${c.linjer} linje(r), hake→tekst ${c.gap.toFixed(1)}px, sentrering H-skjevhet ${c.skjevH.toFixed(1)} / V ${c.skjevV.toFixed(1)}`);
  await page.locator('.pp-grid').screenshot({path:path.join(OUT,`${b}-priser-chips.png`)});
  const fine=await page.evaluate(()=>document.querySelector('.pr-vekst .pr-fine').textContent.trim());
  sjekk(fine==='Etter 100 SMS: 1,21 kr per SMS på neste faktura.',`${b} pris: finskrift «${fine}»`);
  // Vekst-kortet alene, med luft rundt så pill og glød kommer med.
  const vk=await page.evaluate(()=>{const r=document.querySelector('.pr-vekst').getBoundingClientRect(); return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height};});
  await page.screenshot({fullPage:true,path:path.join(OUT,`${b}-priser-vekst-kort.png`),
    clip:{x:Math.max(0,vk.x-16),y:vk.y-24,width:Math.min(vk.w+32,page.viewportSize().width-Math.max(0,vk.x-16)),height:vk.h+40}});
  await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(300);
  const clip=await page.evaluate(()=>{const a=document.querySelector('.ph-hero').getBoundingClientRect(), z=document.querySelector('.pp-sec').getBoundingClientRect();
    return {x:0,y:a.top+scrollY,width:innerWidth,height:z.bottom-a.top+24};});
  // Sticky nav dekker toppen i fullPage-skudd — skjul den for dette bildet.
  await page.addStyleTag({content:'nav{visibility:hidden!important}'});
  await page.screenshot({path:path.join(OUT,`${b}-priser-prisseksjon.png`),clip,fullPage:true});
}

const NAVSIDER=['index','priser','funksjoner','support','vanlige-sporsmal','vilkar','databehandleravtale'];

for(const b of [320,375]){
  for(const side of NAVSIDER){
    const {page,errs}=await aapne(side,b);
    const m=await page.evaluate(()=>{const c=document.querySelector('.nav-cta'); const r=c.getBoundingClientRect();
      const lh=parseFloat(getComputedStyle(c).fontSize)*1.6;
      return {tekst:c.textContent.trim(), h:r.height, right:r.right, font:getComputedStyle(c).fontSize,
              over:document.documentElement.scrollWidth-innerWidth, enLinje:r.height<lh+20};});
    sjekk(m.tekst==='Kom i gang gratis',`${b} ${side}: nav-CTA «${m.tekst}» (${m.font})`);
    sjekk(m.enLinje && m.right<=b && m.over<=0,`${b} ${side}: nav-CTA én linje (h=${m.h.toFixed(1)}), høyre=${m.right.toFixed(1)}, overflow=${m.over}`);
    sjekk(errs.length===0,`${b} ${side}: ingen pageerror ${errs.join(' | ')}`);
    if(side==='index'||side==='priser') await navSkudd(page,`${b}-${side}-nav.png`);
    if(side==='index'){
      await page.click('#nav-burger'); await page.waitForTimeout(400);
      await navSkudd(page,`${b}-index-nav-meny-aapen.png`);
      await page.click('#nav-burger'); await page.waitForTimeout(300);
      const hn=await enLinje(page,'.hero-note');
      sjekk(hn.tekst==='Ingen kort · Ingen prøveperiode' && hn.en,`${b} hero-note «${hn.tekst}» én linje (h=${hn.h.toFixed(1)})`);
      await elSkudd(page,'header.hero',`${b}-index-hero.png`);
      await tabell(page,b);
      await indexAvslutning(page,b);
    }
    if(side==='priser'){
      const fn=await enLinje(page,'.final-cta .final-note');
      sjekk(fn.tekst==='Ingen kort · Ingen prøveperiode' && fn.en,`${b} priser final-note «${fn.tekst}» én linje (h=${fn.h.toFixed(1)})`);
      await elSkudd(page,'.faq',`${b}-priser-faq.png`);
      await elSkudd(page,'section.final-cta',`${b}-priser-avslutning.png`);
      await prisseksjon(page,b);
    }
    await page.close();
  }
}

for(const side of ['index','priser']){
  const {page}=await aapne(side,1280);
  await navSkudd(page,`1280-${side}-nav.png`);
  if(side==='index'){ await tabell(page,1280); await indexAvslutning(page,1280); }
  else { await elSkudd(page,'section.final-cta',`1280-priser-avslutning.png`); await prisseksjon(page,1280); }
  await page.close();
}

sjekk(prodForsok===avskaaret,`api.trybarberhq.com: ${prodForsok} forsøk, ${avskaaret} avbrutt i nettleseren, ${prodForsok-avskaaret} sluppet ut`);
await browser.close(); server.close();
console.log(feil?`\n${feil} FEIL`:'\nAlt grønt'); process.exit(feil?1:0);
