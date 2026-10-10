// SMS-pakker (Gratis): Konto-kortet «SMS-påminnelser», den felles påminnelse-bryteren,
// Stripe-retur etter pakkekjøp og SMS-tilbudet på Oversikt. Bygget mot backend-kontrakten (ikke live
// ennå) — alt under /api/** mockes, alt annet mot prod avbrytes og telles.
//
// Kontrakt (Henrik 09.10): billing har sms_saldo, sms_paaminnelser_sendes, sms_paaminnelse_eksempel,
// sms_pakker[{antall,pris_kr,per_sms_kr}], sms_pakke_kan_kjopes, sms_tilbud_avvist_at. Påminnelse-VALGET er
// sms_paaminnelse_enabled i /settings (én bryter, vist i både Vekst og Konto). sync-checkout svarer med
// billing-shape + kjop:'vekst'|'sms_pakke'. Pakke-retur har ?sms_pakke=1 i URL-en.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/sms-pakker');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

// per_sms_kr kan komme som 1 (ikke 1.00) — skal likevel vises «1,00».
const PAKKER=[{antall:100,pris_kr:129,per_sms_kr:1.29},{antall:250,pris_kr:279,per_sms_kr:1.12},{antall:500,pris_kr:499,per_sms_kr:1}];
const base=()=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis',
  effective_plan_grunn:'gratis', trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null,
  needs_attention:false, attention_grunn:null, plakater_doede:false, cancel_at_period_end:false, current_period_end:null,
  sms_saldo:0, sms_paaminnelser_sendes:false, sms_pakker:PAKKER, sms_pakke_kan_kjopes:true, sms_tilbud_avvist_at:null });
const gratis=(x={})=>({...base(),...x});
const vekst=(x={})=>({...base(), subscription_status:'active', plan:'vekst', effective_plan:'vekst',
  effective_plan_grunn:'subscription', sms_pakke_kan_kjopes:false, sms_paaminnelser_sendes:true, ...x});
const settings=(paa)=>({sms_paaminnelse_enabled:paa, sms_rebooking_enabled:false, rebooking_interval_days:35});

const osloDato=(plussDager)=>new Date(Date.now()+plussDager*864e5).toLocaleDateString('en-CA',{timeZone:'Europe/Oslo'});
const imorgen=osloDato(1);
const bk=(id,navn,dato=imorgen,status='booket')=>({id, start:`${dato}T12:00:00Z`, end:`${dato}T12:30:00Z`, name:navn, service:'Herreklipp', status});
const dagerSiden=n=>new Date(Date.now()-n*864e5).toISOString();

const PROFIL={hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'};
let prodForsok=0, prodAvbrutt=0;
async function nySide(bredde,{billing,bookings=[],story=false,paa=false,settingsPut,avvis,kjop,sync}={},url='/no/dashboard.html',vent='networkidle'){
  const page=await browser.newPage({viewport:{width:bredde,height:1000},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const logg={put:[],avvis:0,kjop:null,sync:0,billing:0};
  let lagretPaa=paa;   // GET /settings speiler det siste vellykkede PUT-et, som en ekte backend
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodAvbrutt++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), p=new URL(req.url()).pathname;
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodAvbrutt++;
    const json=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status'){ logg.billing++; return json(billing()); }
    if(p==='/api/dashboard/settings'&&req.method()==='GET') return json(settings(lagretPaa));
    if(p==='/api/dashboard/settings'&&req.method()==='PUT'){ logg.put.push(req.postData()); if(!settingsPut) return json({},500);
      const body=JSON.parse(req.postData()); if('sms_paaminnelse_enabled' in body) lagretPaa=body.sms_paaminnelse_enabled; return json(settingsPut(body)); }
    if(p==='/api/dashboard/bookings') return json(bookings);
    if(p==='/api/dashboard/ledige') return json(story?{antall:3,vis_banner:true}:{antall:0,vis_banner:false});
    if(p==='/api/dashboard/sms-tilbud/avvis'){ logg.avvis++; return json(avvis?avvis():{},avvis?200:500); }
    if(p==='/api/billing/sms-pakke'){ logg.kjop=req.postData(); return json(kjop||{url:`http://localhost:${PORT}/__stripe-sms`}); }
    if(p==='/api/billing/sync-checkout'){ logg.sync++; if(!sync) return json({},500);
      const s=sync(); if(s.delay) await new Promise(r=>setTimeout(r,s.delay)); return json(s.body); }
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}${url}`,{waitUntil:vent});
  if(vent==='networkidle') await page.waitForTimeout(500);
  return {page,errs,logg};
}
const tekstAv=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null?e.innerText.replace(/ /g,' ').replace(/\s*\n\s*/g,' | ').trim():'—').catch(()=>'—');
const synlig=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null).catch(()=>false);
async function aapneSms(page){
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  await page.waitForTimeout(300);
  // Konto er en innstillingsside: SMS-kortet står alltid åpent (når det vises) — ingenting å folde ut.
  await page.evaluate(()=>{ const s=document.getElementById('kontoSms'); if(s&&!s.hidden)s.scrollIntoView({block:'start'}); });
  await page.waitForTimeout(400);
}
const browser=await chromium.launch();
const rapport=[]; const push=(navn,f,errs)=>rapport.push({sjekk:navn,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs&&errs.length?errs.join('; '):'ingen'});
const like=(navn,verdi,forvent,f)=>{ if(forvent instanceof RegExp?!forvent.test(verdi):verdi!==forvent) f.push(`${navn} «${verdi}»`); };

// ── 1. Konto: SMS-trekkspillet ──
const EKS='Hei! Minner om timen din hos Grand Barber i morgen kl. 14:00. Svar STOPP for å avmelde.';
const KONTO=[
  { id:'saldo0-uten-eks', b:gratis({sms_saldo:0}), paa:true,
    vent:{rad:'0 | SMS igjen', bryter:false, chip:false, hjelp:'Ingen påminnelser sendes før du kjøper en SMS-pakke.', eks:'—'} },
  { id:'saldo0-med-eks', b:gratis({sms_saldo:0,sms_paaminnelse_eksempel:EKS}), paa:true,
    vent:{rad:'0 | SMS igjen', bryter:false, chip:false, hjelp:'Ingen påminnelser sendes før du kjøper en SMS-pakke.', eks:EKS} },
  { id:'saldo7-lav-med-eks', b:gratis({sms_saldo:7,sms_paaminnelser_sendes:true,sms_paaminnelse_eksempel:EKS}), paa:true,
    vent:{rad:'7 | SMS igjen | Lav saldo', bryter:true, paa:true, chip:true, hjelp:'Påminnelsene stopper automatisk når saldoen er tom.', eks:EKS} },
  { id:'saldo7-lav-uten-eks', b:gratis({sms_saldo:7,sms_paaminnelser_sendes:true}), paa:true,
    vent:{rad:'7 | SMS igjen | Lav saldo', bryter:true, paa:true, chip:true, hjelp:'Påminnelsene stopper automatisk når saldoen er tom.', eks:'—'} },
  { id:'saldo1250-med-eks', b:gratis({sms_saldo:1250,sms_paaminnelser_sendes:true,sms_paaminnelse_eksempel:EKS}), paa:true,
    vent:{rad:'1 250 | SMS igjen', bryter:true, paa:true, chip:false, hjelp:'—', eks:EKS} },
  { id:'saldo1250-uten-eks', b:gratis({sms_saldo:1250}), paa:false,
    vent:{rad:'1 250 | SMS igjen', bryter:true, paa:false, chip:false, hjelp:'—', eks:'—'}, fliser:true },
];
const KNAPP={100:'Kjøp 100 SMS · 129 kr',250:'Kjøp 250 SMS · 279 kr',500:'Kjøp 500 SMS · 499 kr'};
async function maalFliser(page){
  return page.evaluate(()=>{
    const fl=[...document.querySelectorAll('#smsFliser .sms-flis')];
    const kol=getComputedStyle(document.getElementById('smsFliser')).gridTemplateColumns.split(' ').length;
    const knapp=document.getElementById('smsKjop');
    const rg=document.createRange(); rg.selectNodeContents(knapp);
    const knappLinjer=new Set([...rg.getClientRects()].map(x=>Math.round(x.top))).size;
    const smaa=[]; fl.forEach(t=>t.querySelectorAll('.sms-flis-antall,.sms-flis-enhet,.sms-flis-pris,.sms-flis-per').forEach(e=>{
      const fs=parseFloat(getComputedStyle(e).fontSize); if(fs<13) smaa.push(e.className+'='+fs); }));
    // Avkutting: innholdet i hver flis må ligge innenfor flisens kant
    const kuttet=fl.filter(t=>{ const r=t.getBoundingClientRect(); return [...t.querySelectorAll('.sms-flis-a,.sms-flis-b')].some(e=>{
      const q=e.getBoundingClientRect(); return q.left<r.left+1||q.right>r.right-1; }); }).length;
    const status=document.getElementById('smsStatus');
    return { kol, valgt:fl.filter(t=>t.getAttribute('aria-checked')==='true').map(t=>+t.dataset.smsAntall),
      tabbare:fl.filter(t=>t.tabIndex===0).map(t=>+t.dataset.smsAntall),
      spar:fl.map(t=>(t.querySelector('.sms-flis-spar')||{}).textContent||''),
      tekst:fl.map(t=>t.querySelector('.sms-flis-a').innerText.replace(/\s+/g,' ')+' | '+t.querySelector('.sms-flis-b').innerText.replace(/ /g,' ').replace(/\s*\n\s*/g,' | ')),
      gruppe:document.getElementById('smsFliser').getAttribute('role'),
      knapp:knapp.textContent, knappLinjer, knappKuttet:knapp.scrollWidth>knapp.clientWidth+1, smaa, kuttet,
      statusFarge:getComputedStyle(status).color,
      glod:getComputedStyle(fl.find(t=>t.getAttribute('aria-checked')==='true')).boxShadow,
      valgtBg:getComputedStyle(fl.find(t=>t.getAttribute('aria-checked')==='true')).backgroundColor,
      flatBg:getComputedStyle(fl.find(t=>t.getAttribute('aria-checked')!=='true')).backgroundColor,
      warn:getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() };
  });
}
const hexRgb=h=>`rgb(${parseInt(h.slice(1,3),16)}, ${parseInt(h.slice(3,5),16)}, ${parseInt(h.slice(5,7),16)})`;
for(const c of KONTO){
  for(const b of [320,375,1280]){
    const {page,errs}=await nySide(b,{billing:()=>c.b, paa:c.paa});
    await aapneSms(page);
    const f=[];
    // Nivå 1: tittel + bryter i headeren, undertekst under — ingen av delene ved saldo 0
    like('overskrift',await page.$eval('#kontoSms .kt-h',e=>e.textContent.trim()).catch(()=>'—'),'SMS-påminnelser',f);   // textContent: CSS gjør den versal
    like('tittel',await tekstAv(page,'#smsBryterTekst'),c.vent.bryter?'Påminnelse dagen før':'—',f);
    const bryterVist=await synlig(page,'#smsBryterRad'), subVist=await synlig(page,'#smsSub');
    if(bryterVist!==c.vent.bryter) f.push(`bryter vist=${bryterVist}`);
    if(subVist!==c.vent.bryter) f.push(`undertekst vist=${subVist}`);
    if(c.vent.bryter){
      like('undertekst',await tekstAv(page,'#smsSub'),'Sendes automatisk dagen før timen',f);
      const paa=await page.$eval('#tog-smsPaam',e=>e.checked); if(paa!==c.vent.paa) f.push(`bryter på=${paa}`);
      const samme=await page.evaluate(()=>{ const t=document.getElementById('smsBryterTekst').getBoundingClientRect(), b=document.getElementById('smsBryterRad').getBoundingClientRect();
        return Math.abs((t.top+t.bottom)/2-(b.top+b.bottom)/2)<14 && b.left>t.right; });
      if(!samme) f.push('tittel og bryter står ikke på samme linje');
    }
    // Nivå 2: saldo (tusenskille med mellomrom), nøytral chip ved 1–10, hjelpetekst
    like('saldo-rad',await tekstAv(page,'#smsSaldoRad'),c.vent.rad,f);
    if((await synlig(page,'#smsChip'))!==c.vent.chip) f.push(`chip vist=${!c.vent.chip}`);
    like('hjelp',await tekstAv(page,'#smsStatus'),c.vent.hjelp,f);
    like('forhåndsvisning',await tekstAv(page,'#smsBoble'),c.vent.eks,f);
    if(c.vent.eks!=='—') like('etikett',await tekstAv(page,'.sms-eksempel-etikett'),'Dette får kunden dagen før',f);
    like('kjøp-overskrift',await tekstAv(page,'.sms-niva-h'),'Kjøp SMS',f);
    like('no-show',await tekstAv(page,'#smsNoshow'),'Én no-show koster mer enn 100 SMS.',f);
    if(await page.$('.sms-noshow')) f.push('den gamle no-show-boksen finnes fortsatt');
    // No-show-linja = brødtekst (13px, --ink-2, lysere enn dempet); finskriften under = liten og dempet; luft mellom.
    const lin=await page.evaluate(()=>{ const n=document.getElementById('smsNoshow'), t=document.getElementById('smsFot'), cs=getComputedStyle(n), ct=getComputedStyle(t),
      rot=getComputedStyle(document.documentElement), tmp=document.createElement('span'); document.body.appendChild(tmp);
      const farge=v=>{ tmp.style.color='var('+v+')'; return getComputedStyle(tmp).color; };
      const r={ nFs:cs.fontSize, nC:cs.color, tFs:ct.fontSize, tC:ct.color, ink2:farge('--ink-2'), mut:farge('--mut'),
        gap:Math.round(t.getBoundingClientRect().top-n.getBoundingClientRect().bottom) }; tmp.remove(); return r; });
    if(lin.nFs!=='13px'||lin.nC!==lin.ink2) f.push(`no-show-linja ${lin.nFs} ${lin.nC} (ventet 13px ${lin.ink2})`);
    if(lin.tFs!=='12px'||lin.tC!==lin.mut) f.push(`finskrift ${lin.tFs} ${lin.tC} (ventet 12px ${lin.mut})`);
    if(lin.gap<8) f.push(`luft mellom linjene ${lin.gap}px`);
    like('fot',await tekstAv(page,'#smsFot'),'Engangskjøp, eks. mva. Kjøpte SMS utløper aldri.',f);
    const m=await maalFliser(page);
    if(m.gruppe!=='radiogroup') f.push('flisene er ikke radiogroup');
    if(JSON.stringify(m.valgt)!=='[250]'||JSON.stringify(m.tabbare)!=='[250]') f.push(`standardvalg ${JSON.stringify(m.valgt)} tab ${JSON.stringify(m.tabbare)}`);
    if(JSON.stringify(m.spar)!==JSON.stringify(['','Spar 13 %','Spar 22 %'])) f.push(`spar ${JSON.stringify(m.spar)}`);
    if(JSON.stringify(m.tekst)!==JSON.stringify(['100 SMS | 129 kr | 1,29 kr/SMS','250 SMS | 279 kr | 1,12 kr/SMS','500 SMS | 499 kr | 1,00 kr/SMS'])) f.push(`flistekst ${JSON.stringify(m.tekst)}`);
    if(m.knapp!==KNAPP[250]) f.push(`knapp «${m.knapp}»`);
    if(m.knappLinjer!==1||m.knappKuttet) f.push(`knapp brekker/kuttes (linjer ${m.knappLinjer}, kuttet ${m.knappKuttet})`);
    if(m.smaa.length) f.push(`tekst under 13px: ${m.smaa.join(', ')}`);
    if(m.kuttet) f.push(`${m.kuttet} flis(er) med avkuttet innhold`);
    // Stabling: tre fliser trenger ~322px innhold → 320 og 375 stables, desktop har én rad med tre
    if(b<=375&&m.kol!==1) f.push(`${b}: ${m.kol} kolonner (ventet stablet)`);
    if(b===1280&&m.kol!==3) f.push(`1280: ${m.kol} kolonner (ventet 3)`);
    if(c.vent.hjelp!=='—'&&m.statusFarge===hexRgb(m.warn)) f.push('hjelpeteksten er gul (--warn)');
    if(m.glod!=='none') f.push(`valgt flis har glød (${m.glod})`);
    if(m.valgtBg===m.flatBg) f.push('valgt flis mangler blå bakgrunnstone');
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth); if(over>0) f.push(`overflow ${over}`);
    push(`Konto SMS ${c.id} @${b}`,f,errs);
    await page.locator('#kontoSms').screenshot({path:path.join(OUT,`${b}-konto-sms-${c.id}.png`)});
    if(c.fliser){
      for(const n of [100,250,500]){
        await page.click(`#smsFliser [data-sms-antall="${n}"]`); await page.waitForTimeout(150);
        const k=await maalFliser(page);
        const g=[]; if(JSON.stringify(k.valgt)!==`[${n}]`) g.push(`valgt ${JSON.stringify(k.valgt)}`);
        if(k.knapp!==KNAPP[n]) g.push(`knapp «${k.knapp}»`); if(k.knappLinjer!==1||k.knappKuttet) g.push('knapp brekker/kuttes');
        push(`flis ${n} valgt @${b}`,g,errs);
        await page.locator('#kontoSms').screenshot({path:path.join(OUT,`${b}-konto-sms-flis-${n}-valgt.png`)});
      }
    }
    await page.close();
  }
}
{ // Tastatur: piltaster flytter og velger (med omløp), fokus følger
  const {page,errs}=await nySide(375,{billing:()=>gratis({sms_saldo:1250})});
  await aapneSms(page);
  await page.focus('#smsFliser [data-sms-antall="250"]');
  const steg=[]; for(const tast of ['ArrowRight','ArrowRight','ArrowLeft','ArrowDown','Home','End']){
    await page.keyboard.press(tast); await page.waitForTimeout(80);
    steg.push(await page.evaluate(()=>({valgt:+document.querySelector('#smsFliser [aria-checked="true"]').dataset.smsAntall,
      fokus:+(document.activeElement.dataset.smsAntall||0), knapp:document.getElementById('smsKjop').textContent})));
  }
  const ventet=[500,100,500,100,100,500];
  const f=steg.map((x,i)=>x.valgt===ventet[i]&&x.fokus===ventet[i]&&x.knapp===KNAPP[ventet[i]]?null:`steg ${i+1}: ${JSON.stringify(x)}`).filter(Boolean);
  push('fliser: piltaster (radiogruppe)',f,errs); await page.close();
}
// Vekst/prøve: ingen pakker; «N kjøpte SMS» kun når saldo > 0
for(const [id,bill,forvent] of [['vekst-saldo40',vekst({sms_saldo:40}),'40 kjøpte SMS ligger på kontoen.'],
                                ['vekst-saldo1',vekst({sms_saldo:1}),'1 kjøpt SMS ligger på kontoen.'],
                                ['vekst-saldo0',vekst({sms_saldo:0}),'—'],
                                ['prove-saldo12',vekst({subscription_status:null,plan:null,effective_plan_grunn:'trial_vindu',trial_days_left:9,sms_saldo:12}),'12 kjøpte SMS ligger på kontoen.']]){
  const {page,errs}=await nySide(375,{billing:()=>bill});
  await page.$eval('button[data-panel="abonnement"]',x=>x.click());
  await page.waitForTimeout(400);
  const f=[];
  if(await page.$eval('#kontoSms',e=>!e.hidden)) f.push('SMS-kortet vises (skal ikke)');
  like('kjøpte-linje',await tekstAv(page,'#kontoSmsRest'),forvent,f);
  push(`Konto ${id}`,f,errs);
  await page.close();
}

// ── Én felles bryter: Konto ↔ Vekst ──
{ // Konto på → PUT /settings {sms_paaminnelse_enabled:true} → Vekst-bryteren speiler uten reload → billing hentes på nytt
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis({sms_saldo:30}), paa:false,
    settingsPut:(p)=>settings(p.sms_paaminnelse_enabled)});
  await aapneSms(page);
  const billingFoer=logg.billing;
  await page.click('#smsBryterRad .sl'); await page.waitForTimeout(700);
  const f=[];
  if(JSON.stringify(logg.put)!=='["{\\"sms_paaminnelse_enabled\\":true}"]') f.push(`PUT ${JSON.stringify(logg.put)}`);
  const s=await page.evaluate(()=>({konto:document.getElementById('tog-smsPaam').checked, vekst:document.getElementById('tog-paam').checked}));
  if(!s.konto||!s.vekst) f.push(`speiling ${JSON.stringify(s)}`);
  if(logg.billing<=billingFoer) f.push('billing ikke hentet på nytt (sms_paaminnelser_sendes)');
  push('bryter: Konto på → Vekst speiler',f,errs);
  // Andre vei: Vekst-fanen av → Konto speiler
  await page.$eval('button[data-panel="vekst"]',x=>x.click()); await page.waitForTimeout(700);
  await page.click('#accPaam .sw .sl'); await page.waitForTimeout(700);
  const t=await page.evaluate(()=>({konto:document.getElementById('tog-smsPaam').checked, vekst:document.getElementById('tog-paam').checked}));
  push('bryter: Vekst av → Konto speiler', (t.konto===false&&t.vekst===false)?[]:[`speiling ${JSON.stringify(t)}`], errs);
  await page.close();
}
{ // Feil → begge rulles tilbake + feiltekst ved Konto-bryteren
  const {page,errs}=await nySide(375,{billing:()=>gratis({sms_saldo:30}), paa:false});
  await aapneSms(page);
  await page.click('#smsBryterRad .sl'); await page.waitForTimeout(600);
  const f=[];
  const s=await page.evaluate(()=>({konto:document.getElementById('tog-smsPaam').checked, vekst:document.getElementById('tog-paam').checked}));
  if(s.konto||s.vekst) f.push(`ikke rullet tilbake ${JSON.stringify(s)}`);
  like('feil',await tekstAv(page,'#smsInnstErr'),'Kunne ikke lagre. Prøv igjen.',f);
  push('bryter: feil → begge rullet tilbake',f,errs);
  await page.locator('#kontoSms').screenshot({path:path.join(OUT,'375-konto-sms-bryter-feil.png')});
  await page.close();
}
{ // Vekst-fanens tekst: «dagen før»
  const {page,errs}=await nySide(375,{billing:()=>gratis()});
  const t=await page.$eval('#accPaam .acc-sub',e=>e.textContent);
  push('Vekst-fanen: «dagen før»', /dagen før/.test(t)&&!/kvelden/.test(t)?[]:[`«${t}»`], errs); await page.close();
}
{ // kjøp: velg 500-flisen → kjøpsknappen → POST {antall:500} → url
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis()});
  await aapneSms(page);
  await page.click('#smsFliser [data-sms-antall="500"]');
  await Promise.all([page.waitForURL('**/__stripe-sms',{timeout:5000}).catch(()=>{}), page.click('#smsKjop')]);
  const f=[];
  if(logg.kjop!=='{"antall":500}') f.push(`body ${logg.kjop}`);
  if(!page.url().endsWith('/__stripe-sms')) f.push(`url ${page.url()}`);
  push('kjøp: POST {antall} → Stripe-url',f,errs); await page.close();
}

// ── 2. Stripe-retur ──
{ // pakke (?sms_pakke=1): «Legger til SMS …» mens synken går, så banner fra kjop + SMS-seksjonen åpen
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis(), sync:()=>({delay:1500, body:{...gratis({sms_saldo:250,sms_paaminnelser_sendes:true}),kjop:'sms_pakke'}})},
    '/no/dashboard.html?live=1&sms_pakke=1&session_id=cs_sms_1','domcontentloaded');
  await page.waitForFunction(()=>{ const k=document.getElementById('smsKjop'); return k&&k.offsetParent!==null&&k.textContent==='Legger til SMS …'; },null,{timeout:1400}).catch(()=>{});
  const under=await tekstAv(page,'#smsKjop'), underDis=await page.$eval('#smsKjop',e=>e.disabled);
  const vekstKnapp=await page.$eval('#kontoOppBtn',e=>e.textContent);
  await page.locator('#kontoSms').screenshot({path:path.join(OUT,'375-retur-sms-legger-til.png')});
  await page.waitForTimeout(1800);
  const f=[];
  if(!(under==='Legger til SMS …'&&underDis)) f.push(`mens synk: «${under}» disabled=${underDis}`);
  if(/Aktiverer/.test(vekstKnapp)) f.push(`Vekst-knappen sa «${vekstKnapp}»`);
  like('banner',await tekstAv(page,'#subReturn'),'SMS-pakken er lagt til. Påminnelsene er slått på.',f);
  if(logg.sync!==1) f.push(`synk ${logg.sync}`);
  if(page.url().includes('session_id')||page.url().includes('sms_pakke')) f.push('parametre står igjen i URL');
  like('saldo',await tekstAv(page,'#smsSaldoTall'),'250',f);
  push('retur: SMS-pakke (påminnelser sendes)',f,errs);
  await page.locator('#abonnement').screenshot({path:path.join(OUT,'375-retur-sms-pakke.png')});
  await page.reload({waitUntil:'networkidle'});
  push('retur: refresh → ingen ny synk',logg.sync===1?[]:[`synk ${logg.sync}`],errs);
  await page.close();
}
{ // pakke, men påminnelser sendes ikke → banneret påstår ikke at de er slått på
  const {page,errs}=await nySide(375,{billing:()=>gratis(), sync:()=>({body:{...gratis({sms_saldo:100,sms_paaminnelser_sendes:false}),kjop:'sms_pakke'}})},
    '/no/dashboard.html?live=1&sms_pakke=1&session_id=cs_sms_2');
  await page.waitForTimeout(800);
  const f=[]; like('banner',await tekstAv(page,'#subReturn'),'SMS-pakken er lagt til.',f);
  push('retur: SMS-pakke (påminnelser sendes ikke)',f,errs); await page.close();
}
{ // Vekst-retur: kjop 'vekst' → Vekst-banneret
  const {page,errs}=await nySide(375,{billing:()=>gratis(), sync:()=>({body:{...vekst(),kjop:'vekst'}})},'/no/dashboard.html?live=1&session_id=cs_vekst_1');
  await page.waitForTimeout(800);
  const f=[]; like('banner',await tekstAv(page,'#subReturn'),'Vekst er aktivt. Vekstverktøyene ligger i Vekst-fanen.',f);
  push('retur: Vekst (kjop:vekst)',f,errs); await page.close();
}
{ // svar uten kjop → ventebanner (ingen gjetting ut fra saldo)
  const {page,errs}=await nySide(375,{billing:()=>gratis(), sync:()=>({body:gratis({sms_saldo:100,sms_paaminnelser_sendes:true})})},'/no/dashboard.html?live=1&session_id=cs_x');
  await page.waitForTimeout(800);
  const f=[]; like('banner',await tekstAv(page,'#subReturn'),'Det kan ta et minutt før Vekst vises. Last inn siden på nytt.',f);
  push('retur: uten kjop → ventebanner',f,errs); await page.close();
}

// ── 3. SMS-tilbud på Oversikt ──
const TILBUD=[
  { id:'en-booking', vis:true, linje:'Ola har time i morgen. Vil du at BarberHQ sender en påminnelse?',
    o:{billing:()=>gratis(), bookings:[bk(1,'Ola Nordmann')]} },
  { id:'flere-bookinger', vis:true, linje:'3 kunder har time i morgen. Vil du at BarberHQ sender dem en påminnelse?',
    o:{billing:()=>gratis({sms_saldo:50}), bookings:[bk(1,'Ola N'),bk(2,'Kari N'),bk(3,'Per N'),bk(4,'Avlyst A',imorgen,'avlyst'),bk(5,'I dag',osloDato(0))]} },
  { id:'uten-navn', vis:true, linje:'En kunde har time i morgen. Vil du at BarberHQ sender en påminnelse?',
    o:{billing:()=>gratis(), bookings:[bk(1,'')]} },
  { id:'story-vinner', vis:false, o:{billing:()=>gratis(), bookings:[bk(1,'Ola N')], story:true} },
  { id:'avvist-5d', vis:false, o:{billing:()=>gratis({sms_tilbud_avvist_at:dagerSiden(5)}), bookings:[bk(1,'Ola N')]} },
  { id:'avvist-15d', vis:true, linje:/^Ola har time i morgen/, o:{billing:()=>gratis({sms_tilbud_avvist_at:dagerSiden(15)}), bookings:[bk(1,'Ola N')]} },
  { id:'paaminnelser-sendes', vis:false, o:{billing:()=>gratis({sms_saldo:40,sms_paaminnelser_sendes:true}), bookings:[bk(1,'Ola N')]} },
  { id:'ingen-i-morgen', vis:false, o:{billing:()=>gratis(), bookings:[bk(1,'Ola N',osloDato(2))]} },
  { id:'vekst', vis:false, o:{billing:()=>vekst(), bookings:[bk(1,'Ola N')]} },
];
for(const c of TILBUD){
  for(const b of (c.vis?[320,375]:[375])){
    const {page,errs}=await nySide(b,c.o);
    await page.waitForTimeout(500);
    const f=[]; const vist=await synlig(page,'#smsTilbud');
    if(vist!==c.vis) f.push(`vist=${vist}`);
    if(c.linje) like('linje',await tekstAv(page,'#smsTilbudLinje'),c.linje,f);
    if(c.id==='story-vinner'&&!(await synlig(page,'#storyOpenOversikt'))) f.push('«Lag story» ikke synlig i testen');
    if(b===375) push(`tilbud ${c.id}`,f,errs);
    if(c.vis||c.id==='story-vinner'){
      const top=await page.$eval('#upcomingList',e=>e.getBoundingClientRect().top+scrollY-60);
      await page.screenshot({path:path.join(OUT,`${b}-oversikt-tilbud-${c.id}.png`),clip:{x:0,y:Math.max(0,top),width:b,height:420},fullPage:true});
    }
    await page.close();
  }
}
{ // «Ikke nå» → POST avvis, skjult straks, ny shape tatt inn
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis(), bookings:[bk(1,'Ola N')], avvis:()=>gratis({sms_tilbud_avvist_at:new Date().toISOString()})});
  await page.click('#smsTilbudIkkeNaa'); await page.waitForTimeout(500);
  const f=[];
  if(logg.avvis!==1) f.push(`avvis-kall ${logg.avvis}`);
  if(await synlig(page,'#smsTilbud')) f.push('fortsatt synlig');
  if(!(await page.evaluate(()=>!!_billing.sms_tilbud_avvist_at))) f.push('_billing ikke oppdatert');
  push('tilbud: «Ikke nå»',f,errs); await page.close();
}
{ // «Se SMS-pakker» → Konto, SMS-trekkspillet åpent
  const {page,errs}=await nySide(375,{billing:()=>gratis(), bookings:[bk(1,'Ola N')]});
  await page.click('#smsTilbudSe'); await page.waitForTimeout(600);
  const f=[];
  if(!(await page.$eval('#abonnement',e=>e.classList.contains('active')))) f.push('Konto-fanen ikke aktiv');
  if(!(await synlig(page,'#smsFliser'))) f.push('SMS-pakkene ikke synlige');
  push('tilbud: «Se SMS-pakker» → Konto',f,errs); await page.close();
}

push('ingen request til prod', prodForsok===prodAvbrutt?[]:[`${prodForsok} forsøk, ${prodAvbrutt} avbrutt`]);
console.table(rapport);
const feilet=rapport.filter(r=>r.resultat!=='OK ✓'||r.jsfeil!=='ingen');
console.log(feilet.length?`\n${feilet.length} FEIL`:'\nAlt grønt','— bilder i',OUT);
await browser.close(); server.close();
process.exit(feilet.length?1:0);
