// Prismodell-bugjakt 14.10.2026: rettelsene som ikke dekkes av sms-pakker.mjs / konto-prismodell.mjs.
//   1. Vekst-fanens påminnelse-bryter viser FAKTISK tilstand: Gratis med 0 SMS → av + deaktivert, samme låste
//      stil som Rebooking (.handlingslaas), dempet lenke «Kjøp SMS for å sende påminnelser», og ethvert trykk i
//      kortet (bryter, tittel) åpner Konto → SMS. Innstillingen (dataset.verdi) røres ikke. Saldo > 0: uendret.
//   1b. «eks. mva» brytes alltid samlet (NBSP) — Konto-boksen (#kontoOppH), målt på 320/375.
//   2. Avbrutt SMS-kjøp (?sms_pakke_avbrutt=1) → banner i SMS-seksjonen + URL ryddet.
//   3. Feilet synk etter SMS-kjøp → ventebanner om SMS, ikke Vekst (Vekst-kjøp beholder Vekst-teksten).
//   4. kontoTilstand: oppsagt under Stripe-prøve (trialing + cancel_at_period_end) → tilstand 4, ikke 3.
//   5. smsSpar runder NED (floor): 4,7 % skjules, 23,3 % → 23.
// Alt under /api/** mockes. API_BASE peker til prod, så kallene ADRESSERES dit — men hvert eneste skal
// fanges av en route (mock eller abort) før det går ut: forsøk === fanget.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/prismodell-bugjakt');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const PAKKER=[{antall:100,pris_kr:129,per_sms_kr:1.29},{antall:250,pris_kr:279,per_sms_kr:1.12},{antall:500,pris_kr:495,per_sms_kr:0.99}];
const base=()=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis',
  effective_plan_grunn:'gratis', trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null,
  needs_attention:false, attention_grunn:null, plakater_doede:false, cancel_at_period_end:false, current_period_end:null,
  sms_saldo:0, sms_paaminnelser_sendes:false, sms_pakker:PAKKER, sms_pakke_kan_kjopes:true, sms_tilbud_avvist_at:null });
const gratis=(x={})=>({...base(),...x});
const vekst=(x={})=>({...base(), subscription_status:'active', plan:'vekst', effective_plan:'vekst',
  effective_plan_grunn:'subscription', sms_pakke_kan_kjopes:false, sms_paaminnelser_sendes:true, ...x});
const PROFIL={hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'};

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(bredde,{billing,paa=true,sync=null},url='/no/dashboard.html'){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), p=new URL(req.url()).pathname;
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,st=200)=>route.fulfill({status:st,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/settings'&&req.method()==='GET') return json({sms_paaminnelse_enabled:paa,sms_rebooking_enabled:false,rebooking_interval_days:35});
    if(p==='/api/dashboard/settings') return json({},500);   // ingen skriv i denne testen
    if(p==='/api/billing/sync-checkout') return sync?json(sync):json({},500);
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|services|hours|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}${url}`,{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  return {page,errs};
}
const rapport=[]; const push=(navn,f,errs)=>rapport.push({sjekk:navn,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs&&errs.length?errs.join('; '):'ingen'});
const synlig=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null).catch(()=>false);
const bilder=[];

for(const w of [320,375]){
  // ── 1. Vekst-fanens påminnelse-bryter ──
  const VEKST_CASES=[
    {id:'gratis-saldo0', billing:gratis({sms_saldo:0}), paa:true,  vent:{checked:false,disabled:true, linje:true,  verdi:'1'}, bilde:true},
    {id:'gratis-saldo7', billing:gratis({sms_saldo:7,sms_paaminnelser_sendes:true}), paa:true, vent:{checked:true,disabled:false,linje:false,verdi:'1'}, bilde:true},
    {id:'vekst',         billing:vekst(), paa:true, vent:{checked:true,disabled:false,linje:false,verdi:'1'}},
  ];
  for(const c of VEKST_CASES){
    const {page,errs}=await nySide(w,c);
    await page.$eval('button[data-panel="vekst"]',b=>b.click());
    await page.waitForTimeout(300);
    const m=await page.$eval('#tog-paam',el=>({checked:el.checked,disabled:el.disabled,verdi:el.dataset.verdi}));
    const linje=await synlig(page,'#paamKjop');
    const f=[];
    if(m.checked!==c.vent.checked) f.push(`checked=${m.checked}`);
    if(m.disabled!==c.vent.disabled) f.push(`disabled=${m.disabled}`);
    if(m.verdi!==c.vent.verdi) f.push(`lagret verdi endret: ${m.verdi}`);
    if(linje!==c.vent.linje) f.push(`linje synlig=${linje}`);
    if(c.vent.linje){
      const t=await page.$eval('#paamKjop',e=>e.innerText.trim());
      if(t!=='Kjøp SMS for å sende påminnelser') f.push(`linjetekst «${t}»`);
      // Ingen aksentfarge: lenka arver den dempede fargen fra linja.
      const farger=await page.$eval('#paamKjopLenke',a=>[getComputedStyle(a).color,getComputedStyle(a.parentElement).color]);
      if(farger[0]!==farger[1]) f.push(`lenkefarge ${farger[0]} ≠ ${farger[1]}`);
    }
    if(c.bilde){
      await page.$eval('#accPaam',e=>e.scrollIntoView({block:'center'}));
      await page.waitForTimeout(200);
      const fil=path.join(OUT,`vekst-paam-${c.id}-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil);
    }
    // Låst stil = samme mekanisme som Rebooking: .handlingslaas på kortet → bryterens opacity lik.
    const laas=await page.evaluate(()=>{
      const k=document.getElementById('accPaam'), op=s=>getComputedStyle(document.querySelector(s)).opacity;
      return {klasse:k.classList.contains('handlingslaas'), paam:op('#accPaam .sw'), rebook:op('#accRebook .sw')};
    });
    if(laas.klasse!==c.vent.linje) f.push(`handlingslaas=${laas.klasse}`);
    if(c.vent.linje && laas.paam!==laas.rebook) f.push(`opacity ${laas.paam} ≠ rebooking ${laas.rebook}`);
    const tilKonto=async(sel,navn)=>{
      await page.$eval('button[data-panel="vekst"]',b=>b.click()); await page.waitForTimeout(200);
      // force: bryterens input er disabled, så Playwright vil ikke klikke etiketten — men et ekte trykk på
      // sporet (.sl) gir likevel et klikk. force = ekte musetrykk på koordinatene, uten actionability-sjekk.
      await page.click(sel,{force:true}); await page.waitForTimeout(400);
      const konto=await page.$eval('#abonnement',e=>e.offsetParent!==null).catch(()=>false);
      return konto;
    };
    if(c.vent.linje){
      for(const [sel,navn] of [['#paamKjopLenke','lenka'],['#accPaam .sw .sl','bryteren'],['#accPaam .acc-head','kortet']]){
        if(!(await tilKonto(sel,navn))) f.push(`${navn} åpnet ikke Konto`);
        else if(!(await synlig(page,'#kontoSms'))) f.push(`${navn}: Konto → SMS ikke synlig`);
      }
      const v=await page.$eval('#tog-paam',el=>el.dataset.verdi);
      if(v!=='1') f.push(`trykk endret lagret verdi: ${v}`);
    }else{
      // Uendret: tittel-trykk folder ut trekkspillet, ingen navigering.
      const konto=await tilKonto('#accPaam .acc-head','kortet');
      if(konto) f.push('tittel-trykk navigerte til Konto');
      const aapen=await page.$eval('#accPaam .acc-head',e=>e.getAttribute('aria-expanded'));
      if(aapen!=='true') f.push(`trekkspill ikke åpnet (${aapen})`);
    }
    push(`${w} Vekst-bryter ${c.id}`,f,errs); await page.close();
  }

  // ── 1b. «eks. mva» samlet ──
  {
    const {page,errs}=await nySide(w,{billing:gratis()});
    await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(300);
    const delt=await page.evaluate(()=>{
      // Topp-posisjonen til «eks.» og «mva» i elementets tekstnode — ulik topp = delt over to linjer.
      const sjekk=el=>{ if(!el||el.offsetParent===null) return 'skjult';
        const tn=[...el.childNodes].find(n=>n.nodeType===3&&/eks\.\s?mva/.test(n.textContent)); if(!tn) return 'ingen tekst';
        if(!/eks\. mva/.test(tn.textContent)) return 'vanlig mellomrom';
        const i=tn.textContent.search(/eks\./), r=document.createRange();
        const rect=(a,b)=>{ r.setStart(tn,a); r.setEnd(tn,b); return r.getClientRects()[0].top; };
        return Math.abs(rect(i,i+4)-rect(i+5,i+8))<2 ? 'samlet' : 'DELT'; };
      return {oppH:sjekk(document.getElementById('kontoOppH'))};
    });
    const f=[]; if(delt.oppH!=='samlet') f.push(`#kontoOppH ${delt.oppH}`);
    await page.$eval('#kontoOpp',e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
    const fil=path.join(OUT,`konto-vekstboks-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil);
    push(`${w} «eks. mva» samlet`,f,errs); await page.close();
  }

  // ── 2–3. Stripe-retur ──
  const RETUR=[
    {id:'sms-avbrutt', url:'?sms_pakke_avbrutt=1', billing:gratis(), tekst:'Kjøpet ble avbrutt. Ingenting er trukket.', sek:'kontoSms', bilde:true},
    {id:'sms-synkfeil', url:'?sms_pakke=1&session_id=cs_test', billing:gratis(), tekst:'Det kan ta et minutt før SMS-ene vises. Last inn siden på nytt.', sek:'kontoSms', bilde:true},
    {id:'vekst-synkfeil', url:'?live=1&session_id=cs_test', billing:gratis(), tekst:'Det kan ta et minutt før Vekst vises. Last inn siden på nytt.', sek:'kontoAbonnement'},
    {id:'sms-ok', url:'?sms_pakke=1&session_id=cs_test', billing:gratis(), sync:{...gratis({sms_saldo:250,sms_paaminnelser_sendes:true}),kjop:'sms_pakke'}, tekst:'SMS-pakken er lagt til. Påminnelsene er slått på.', sek:'kontoSms'},
  ];
  for(const c of RETUR){
    const {page,errs}=await nySide(w,c,'/no/dashboard.html'+c.url);
    const f=[];
    const t=await page.$eval('#subReturn',e=>e.offsetParent!==null?e.textContent.trim():'—').catch(()=>'—');
    if(t!==c.tekst) f.push(`banner «${t}»`);
    const q=await page.evaluate(()=>location.search);
    if(q) f.push(`URL ikke ryddet: ${q}`);
    if(!(await synlig(page,'#'+c.sek))) f.push(`${c.sek} ikke synlig`);
    if(c.bilde){
      await page.$eval('#subReturn',e=>e.scrollIntoView({block:'start'})); await page.evaluate(()=>window.scrollBy(0,-80));
      await page.waitForTimeout(200);
      const fil=path.join(OUT,`retur-${c.id}-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil);
    }
    push(`${w} retur ${c.id}`,f,errs); await page.close();
  }
}

// ── 4–5. Rene funksjoner ──
{
  const {page,errs}=await nySide(375,{billing:gratis()});
  const r=await page.evaluate(()=>{
    const v=(x)=>Object.assign({plan:'vekst',effective_plan:'vekst',effective_plan_grunn:'subscription',page_status:'live',
      current_period_end:'2026-11-08T10:00:00Z',trial_ends_at:'2026-11-08T10:00:00Z'},x);
    return {
      trialOppsagt:kontoTilstand(v({subscription_status:'trialing',cancel_at_period_end:true})),
      trialAktiv:kontoTilstand(v({subscription_status:'trialing',cancel_at_period_end:false})),
      activeOppsagt:kontoTilstand(v({subscription_status:'active',cancel_at_period_end:true})),
      spar47:smsSpar({per_sms_kr:1.229},1.29), spar233:smsSpar({per_sms_kr:0.99},1.29), spar13:smsSpar({per_sms_kr:1.12},1.29),
    };
  });
  const f=[];
  if(r.trialOppsagt.id!==4||r.trialOppsagt.merke!=='Vekst til 8. november') f.push(`trialing+oppsagt → ${r.trialOppsagt.id} «${r.trialOppsagt.merke}»`);
  if(r.trialAktiv.id!==3) f.push(`trialing aktiv → ${r.trialAktiv.id}`);
  if(r.activeOppsagt.id!==4) f.push(`active+oppsagt → ${r.activeOppsagt.id}`);
  if(r.spar47!==0) f.push(`spar 4,7 % → ${r.spar47}`);
  if(r.spar233!==23) f.push(`spar 23,3 % → ${r.spar233}`);
  if(r.spar13!==13) f.push(`spar 13,2 % → ${r.spar13}`);
  push('kontoTilstand + smsSpar',f,errs); await page.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||r.jsfeil!=='ingen'&&r.jsfeil!=='—')?1:0);
