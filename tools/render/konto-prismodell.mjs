// Konto «Abonnement og publisering» — prismodell 09.10.2026 (Gratis / prøveperiode / Vekst).
//
// Erstatter konto-billing-grunn / konto-checkout-knapp / konto-pris-utledning / konto-myk-periode /
// konto-plan-nedgang (alle testet den gamle modellen: plan-velger, myk periode, nedtaking, 402, Basis).
//
// Verifiserer (måler tekst og synlighet, ikke bare bilde):
//   • kontoTilstand: tilstand 0–5 + reserven, inkl. A-varianten (prøve/abonnement + avpublisert →
//     «Siden din er ikke publisert.» + «Publiser bookingsiden» over lenkeblokka) og B-varianten
//     ('trialing' + vekst → tilstand 3 + «Første trekk [dato].», linja utelatt når trial_ends_at er null)
//   • tilstand 4 uten current_period_end → reserven (ingen gjettet dato); gammel Basis-sub → reserven
//   • ingen gammel modell-tekst i kortet («Alt inkludert», «Ingen binding — du kan si opp», «30 dager»,
//     «prøv gratis», «Basis»)
//   • publiser fra tilstand 0 → full PUT-shape → tilstand 1 uten reload; DELVIS PUT-shape overskriver ikke
//   • «Oppgrader til Vekst» → POST /billing/checkout med {plan:'vekst'} → navigerer til url
//   • Stripe-retur: session_id → ÉN synk, «Aktiverer Vekst …» mens den går, suksess-/ventebanner;
//     live=1 uten session_id → ventebanner, INGEN synk; avbrutt → «Du kan oppgradere når som helst.»
//   • trial-nudgen og info-ikonet ved «Send etter» er FJERNET; «Drevet av»-prislinja, «Din side»-CTA,
//     suksesskortet etter publisering og lås-flatene (Gratis) har ny tekst
//   • INGEN request når prod (api.trybarberhq.com): alt under /api/** mockes, resten avbrytes
//
// page.on('pageerror') er syntaks-vakten: en parse-feil i dashboard-JS-en tar ned ALT stille.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/konto-prismodell');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const FIN='Etter 100 SMS: 1,21 kr per SMS på neste faktura. Maks 400 kr i måneden med mindre du endrer det.';
const NOV14='2026-11-14T10:00:00Z';

// Full billing-shape (backend buildBillingShape + steg 1-feltene cancel_at_period_end/current_period_end).
const base=()=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis',
  effective_plan_grunn:'gratis', trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null,
  needs_attention:false, attention_grunn:null, plakater_doede:false,
  cancel_at_period_end:false, current_period_end:null });
const gratis   = (x={})=>({...base(), ...x});
const prove    = (x={})=>({...base(), effective_plan:'vekst', effective_plan_grunn:'trial_vindu', trial_days_left:12,
                          trial_start_at:new Date(Date.now()-18*864e5).toISOString(), ...x});
const vekstSub = (x={})=>({...base(), subscription_status:'active', plan:'vekst', effective_plan:'vekst',
                          effective_plan_grunn:'subscription', ...x});

// vent: status / tekst / tall / sub / knapp (regex eller '—' = skjult), opp/fin/manage/av/avpub (bool)
const TILSTANDER=[
  { id:'0-ikke-publisert', b:gratis({page_status:'forhandsvist'}),
    vent:{status:'—', tekst:/^Siden din er ikke publisert ennå\.$/, tall:'—', knapp:/^Publiser bookingsiden$/,
          mikro:/^Gratis\. Ingen kort\.$/, opp:false, fin:false, manage:false, av:false, avpub:false} },
  { id:'1-gratis', desktop:true, b:gratis(),
    vent:{status:/^● Gratis$/, tekst:/^Bookingsiden, kalenderen og dashbordet er gratis, uten tidsfrist\.$/,
          tall:/^0 kr\/ mnd$/, knapp:'—', opp:true, fin:false, manage:false, av:true, avpub:false} },
  { id:'2-prove', b:prove(),
    vent:{status:/^● Vekst, prøveperiode$/,
          tekst:/^12 dager igjen\. Deretter går du over til Gratis, og siden blir stående\.Vil du beholde rebooking, verving og SMS-påminnelser\?$/,
          tall:'—', knapp:/^Oppgrader til Vekst$/, opp:false, fin:true, manage:false, av:true, avpub:false} },
  { id:'2-prove-A-avpublisert', b:prove({page_status:'forhandsvist'}),
    vent:{status:/^● Vekst, prøveperiode$/, knapp:/^Oppgrader til Vekst$/, fin:true, av:false, avpub:true} },
  { id:'3-vekst', desktop:true, b:vekstSub(),
    vent:{status:/^● Vekst er aktivt$/, tekst:/^100 SMS inkludert hver måned\.$/, tall:/^179 kr\/ mnd eks\. mva$/,
          sub:'—', knapp:'—', opp:false, fin:true, manage:true, av:true, avpub:false} },
  { id:'3-vekst-A-avpublisert', b:vekstSub({page_status:'forhandsvist'}),
    vent:{status:/^● Vekst er aktivt$/, manage:true, av:false, avpub:true} },
  { id:'3-vekst-B-trialing', b:vekstSub({subscription_status:'trialing', effective_plan_grunn:'trial_vindu', trial_days_left:9,
                                          trial_ends_at:NOV14}),
    vent:{status:/^● Vekst er aktivt$/, tall:/^179 kr\/ mnd eks\. mva$/, sub:/^Første trekk 14\. november\.$/,
          knapp:'—', fin:true, manage:true} },
  { id:'4-oppsagt', b:vekstSub({cancel_at_period_end:true, current_period_end:NOV14}),
    vent:{status:/^● Vekst til 14\. november$/, tekst:/^Deretter går du over til Gratis, og siden blir stående\.$/,
          tall:'—', knapp:'—', opp:false, fin:false, manage:true, av:true} },
  { id:'5-betaling-feilet', b:vekstSub({subscription_status:'past_due', needs_attention:true, attention_grunn:'past_due'}),
    vent:{status:/^● Betalingen feilet$/, statusRod:true,
          tekst:/^Oppdater kortet for å beholde Vekst\. SMS er satt på pause til betalingen går gjennom\.$/,
          tall:'—', knapp:/^Oppdater betaling$/, opp:false, fin:false, manage:false, av:true} },
  { id:'reserve-anomali', b:gratis({subscription_status:'active', effective_plan_grunn:'anomali_status_uten_plan'}),
    vent:{status:/^● Abonnementsstatus utilgjengelig$/, tekst:/Tilgangen din er upåvirket/, knapp:'—', opp:false} },
];
// Kun tekst-sjekk (ingen skjermbilder) — kantene i kontoTilstand.
const KANTER=[
  { id:'2-prove-1-dag', b:prove({trial_days_left:1}), vent:{tekst:/^1 dag igjen\. Deretter/} },
  { id:'3-B-uten-trial_ends_at', b:vekstSub({subscription_status:'trialing', trial_ends_at:null}), vent:{status:/^● Vekst er aktivt$/, sub:'—'} },
  { id:'4-uten-dato→reserve', b:vekstSub({cancel_at_period_end:true, current_period_end:null}), vent:{status:/^● Abonnementsstatus utilgjengelig$/} },
  { id:'gammel-basis-sub→reserve', b:gratis({subscription_status:'active', plan:'basis', effective_plan_grunn:'subscription'}), vent:{status:/^● Abonnementsstatus utilgjengelig$/, knapp:'—'} },
  { id:'canceled→gratis', b:gratis({subscription_status:'canceled', plan:'vekst'}), vent:{status:/^● Gratis$/, opp:true, av:true} },
  { id:'prove-utlopt→gratis', b:gratis({trial_days_left:0, trial_start_at:new Date(Date.now()-40*864e5).toISOString()}), vent:{status:/^● Gratis$/} },
];

const PROFIL={hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'};
let prodSluppet=0, prodAvbrutt=0;
async function stubApi(page,{billing,put,sync,checkout,settings}={}){
  const logg={sync:0, checkoutBody:null, put:0};
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodSluppet++; });
  // Registrert FØRST = kjøres sist: alt mot prod som ikke er /api/** avbrytes.
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodAvbrutt++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(); const u=new URL(req.url()); const p=u.pathname;
    if(new URL(req.url()).hostname==='api.trybarberhq.com') prodAvbrutt++;
    const json=(o,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status') return json(billing());
    if(p==='/api/dashboard/page-status'&&req.method()==='PUT'){ logg.put++; return put?json(put(req)):json({},500); }
    if(p==='/api/billing/sync-checkout'){ logg.sync++; if(!sync) return json({},500);
      const s=sync(); if(s.delay) await new Promise(r=>setTimeout(r,s.delay)); return json(s.body,s.status||200); }
    if(p==='/api/dashboard/billing/checkout'){ logg.checkoutBody=req.postData(); return json(checkout||{url:`http://localhost:${PORT}/__stripe-mock`}); }
    if(p==='/api/dashboard/profile') return json(PROFIL);
    if(p==='/api/dashboard/settings'&&req.method()==='GET'&&settings) return json(settings);
    if(p==='/api/dashboard/loyalty') return json({enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{});
  });
  // Ingen ekte prod-trafikk: speil telleren i rapporten.
  return logg;
}
// Prod-teller: request-eventet fyrer også for avbrutte; «sluppet» = forsøk minus avbrutt.

// Hardt mellomrom (&nbsp;, binder siste ord mot enkeltord alene) normaliseres til vanlig mellomrom.
const tekstAv=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null?e.innerText.replace(/ /g,' ').replace(/\s*\n\s*/g,'').trim():'—').catch(()=>'—');
const synlig=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null).catch(()=>false);
async function maalKort(page){
  return {
    status: await tekstAv(page,'#kontoStatus'),
    statusRod: await page.$eval('#kontoStatus',e=>e.classList.contains('bad')).catch(()=>false),
    tekst:  await tekstAv(page,'#kontoTekst'),
    tall:   await tekstAv(page,'#kontoTall'),
    sub:    await tekstAv(page,'#kontoTallSub'),
    knapp:  await tekstAv(page,'#kontoAksjon'),
    knappBtn: await page.$eval('#kontoAksjon',e=>e.className==='btn').catch(()=>false),
    mikro:  await tekstAv(page,'#kontoMikro'),
    opp:    await synlig(page,'#kontoOpp'),
    oppTekst: await tekstAv(page,'#kontoOpp'),
    fin:    await synlig(page,'#kontoFin'),
    finTekst: await tekstAv(page,'#kontoFin'),
    manage: await synlig(page,'#manageSub'),
    av:     await synlig(page,'#unpublish'),
    avpub:  await synlig(page,'#kontoAvpub'),
    avpubTekst: await tekstAv(page,'#kontoAvpub'),
    lenke:  await synlig(page,'#pubLink'),
    lenkeOverAvpub: await page.evaluate(()=>{const a=document.getElementById('kontoAvpub'),l=document.getElementById('pubLink');
                      return !!(a&&l&&(a.compareDocumentPosition(l)&Node.DOCUMENT_POSITION_FOLLOWING));}),
    kortTekst: await page.$eval('#accAbonnement .subcard',e=>e.innerText).catch(()=>''),
  };
}
function sjekkVent(m,v){
  const f=[];
  const t=(navn,verdi,forvent)=>{ if(forvent===undefined)return;
    if(forvent==='—'){ if(verdi!=='—') f.push(`${navn} skulle vært skjult, var «${verdi}»`); }
    else if(forvent instanceof RegExp){ if(!forvent.test(verdi)) f.push(`${navn} «${verdi}» ≠ ${forvent}`); }
    else if(verdi!==forvent) f.push(`${navn}=${verdi} (ventet ${forvent})`); };
  for(const k of ['status','tekst','tall','sub','knapp','mikro','opp','fin','manage','av','avpub']) t(k,m[k],v[k]);
  if(v.statusRod && !m.statusRod) f.push('merket er ikke rødt (.bad)');
  // Hovedhandlingen er ALLTID primærknappen (.btn), aldri en dempet .lnk-quiet (arv fra konto-checkout-knapp).
  if(v.knapp instanceof RegExp && !m.knappBtn) f.push('hovedknappen er ikke .btn');
  if(v.fin && m.finTekst!==FIN) f.push(`finskrift «${m.finTekst}»`);
  if(v.opp && !(m.oppTekst.includes('Vekst · 179 kr / mnd eks. mva') && m.oppTekst.includes('Rebooking, vinn tilbake, verving, lojalitet og attribusjon. 100 SMS inkludert hver måned.')
               && m.oppTekst.includes('Oppgrader til Vekst') && m.oppTekst.includes(FIN))) f.push(`oppgraderingsboks «${m.oppTekst}»`);
  if(v.avpub && !(m.avpubTekst==='Siden din er ikke publisert.Publiser bookingsiden' && m.lenkeOverAvpub)) f.push(`A-blokk «${m.avpubTekst}» / over lenkeblokka: ${m.lenkeOverAvpub}`);
  const gammel=m.kortTekst.match(/Alt inkludert|Ingen binding — du kan si opp|30 dager|prøv gratis|Basis|Legg inn kort|Fortsett med|—/i);
  if(gammel) f.push(`gammel tekst/tankestrek i kortet: «${gammel[0]}»`);
  return f;
}

async function aapneKonto(page){
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  const lukket=await page.$eval('#accAbonnement .acc-head',h=>h.getAttribute('aria-expanded')!=='true');
  if(lukket) await page.$eval('#accAbonnement .acc-head',b=>b.click());
  await page.waitForTimeout(500);
}
async function nySide(bredde,stub,url='/no/dashboard.html',vent='networkidle'){
  const page=await browser.newPage({viewport:{width:bredde,height:1000},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('dialog',d=>d.dismiss());
  const logg=await stubApi(page,stub);
  await page.goto(`http://localhost:${PORT}${url}`,{waitUntil:vent});
  return {page,errs,logg};
}
const kortSkudd=(page,fil)=>page.locator('#accAbonnement').screenshot({path:path.join(OUT,fil)});

const browser=await chromium.launch();
const rapport=[]; const push=(navn,feil,errs)=>rapport.push({sjekk:navn, resultat:feil.length?'✗ '+feil.join(' | '):'OK ✓', jsfeil:errs&&errs.length?errs.join('; '):'ingen'});

// ── 1. Tilstandene: tekst + bilder (320/375, desktop for 1 og 3) ──
for(const c of TILSTANDER){
  for(const b of [320,375,...(c.desktop?[1280]:[])]){
    const {page,errs}=await nySide(b,{billing:()=>c.b});
    await aapneKonto(page);
    const m=await maalKort(page);
    if(b===375) push(`tilstand ${c.id}`, sjekkVent(m,c.vent), errs);
    // Knappene i kortet skal holde ÉN linje og ligge innenfor kortet/boksen (320 er trangest: boksen er nestet).
    const knappMaal=await page.$$eval('#kontoOppBtn,#kontoAksjon,#kontoPubliser',l=>l.filter(e=>e.offsetParent!==null).map(e=>{
      const r=e.getBoundingClientRect(), p=e.parentElement.getBoundingClientRect();
      const rg=document.createRange(); rg.selectNodeContents(e);
      const linjer=new Set([...rg.getClientRects()].map(x=>Math.round(x.top))).size;   // antall tekstlinjer
      return {id:e.id, en:linjer===1, inni:r.right<=p.right+0.5&&r.left>=p.left-0.5, h:linjer};}));
    const knappFeil=knappMaal.filter(k=>!k.en||!k.inni).map(k=>`${k.id} h=${k.h} inni=${k.inni}`);
    if(knappFeil.length) push(`${c.id} @${b} knapp`,knappFeil,errs);
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(over>0) push(`${c.id} @${b} overflow`,[`${over}px`],errs);
    await kortSkudd(page,`${b}-konto-${c.id}.png`);
    await page.close();
  }
}
for(const c of KANTER){
  const {page,errs}=await nySide(375,{billing:()=>c.b});
  await aapneKonto(page);
  push(`kant ${c.id}`, sjekkVent(await maalKort(page),c.vent), errs);
  await page.close();
}

// ── 2. Publiser fra tilstand 0: full shape → tilstand 1; delvis shape → urørt ──
{
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis({page_status:'forhandsvist'}), put:()=>({ok:true,...gratis()})});
  await aapneKonto(page);
  await page.click('#kontoAksjon'); await page.waitForTimeout(700);
  const m=await maalKort(page);
  push('publiser: tilstand 0 → 1 uten reload', [...(logg.put===1?[]:[`PUT-kall ${logg.put}`]), ...sjekkVent(m,{status:/^● Gratis$/, opp:true, av:true})], errs);
  await page.close();
}
{
  const {page,errs}=await nySide(375,{billing:()=>prove({page_status:'forhandsvist'}), put:()=>({ok:true,page_status:'live'})});
  await aapneKonto(page);
  await page.click('#kontoPubliser'); await page.waitForTimeout(700);
  const m=await maalKort(page);
  const billing=await page.evaluate(()=>_billing&&_billing.effective_plan_grunn);
  push('delvis PUT-shape overskriver ikke _billing', [...(billing==='trial_vindu'?[]:[`_billing.grunn=${billing}`]),
       ...sjekkVent(m,{status:/^● Vekst, prøveperiode$/, avpub:true})], errs);
  await page.close();
}

// ── 3. Oppgrader → checkout med {plan:'vekst'} → navigerer til Stripe-url ──
for(const [navn,b,sel] of [['fra Gratis-boksen',gratis(),'#kontoOppBtn'],['fra prøveperioden',prove(),'#kontoAksjon']]){
  const {page,errs,logg}=await nySide(375,{billing:()=>b});
  await aapneKonto(page);
  await Promise.all([page.waitForURL('**/__stripe-mock',{timeout:5000}).catch(()=>{}), page.click(sel)]);
  const f=[];
  if(logg.checkoutBody!=='{"plan":"vekst"}') f.push(`body ${logg.checkoutBody}`);
  if(!page.url().endsWith('/__stripe-mock')) f.push(`url ${page.url()}`);
  push(`oppgrader ${navn} → checkout {plan:'vekst'}`, f, errs);
  await page.close();
}

// ── 4. Stripe-retur ──
{ // suksess: «Aktiverer Vekst …» mens synken går, så tilstand 3 + suksessbanner
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis(), sync:()=>({delay:1500, body:vekstSub()})},
                                      '/no/dashboard.html?live=1&session_id=cs_test_123','domcontentloaded');
  // networkidle ville ventet til synken (1,5 s) var ferdig — les MENS den pågår.
  await page.waitForFunction(()=>{ const b=document.getElementById('kontoOppBtn'); return b&&b.offsetParent!==null&&b.textContent==='Aktiverer Vekst …'; },null,{timeout:1400}).catch(()=>{});
  const under=await tekstAv(page,'#kontoOppBtn');
  const underDisabled=await page.$eval('#kontoOppBtn',e=>e.disabled);
  await kortSkudd(page,'375-retur-aktiverer.png');
  await page.waitForTimeout(1800);
  const m=await maalKort(page);
  const banner=await tekstAv(page,'#subReturn');
  const urlRen=!page.url().includes('session_id');
  const f=[];
  if(!(under==='Aktiverer Vekst …'&&underDisabled)) f.push(`mens synk: «${under}» disabled=${underDisabled}`);
  if(logg.sync!==1) f.push(`synk-kall ${logg.sync}`);
  if(banner!=='Vekst er aktivt. Vekstverktøyene ligger i Vekst-fanen.') f.push(`banner «${banner}»`);
  if(!urlRen) f.push('session_id står igjen i URL');
  f.push(...sjekkVent(m,{status:/^● Vekst er aktivt$/}));
  const skjold=await page.evaluate(()=>erBasis());
  if(skjold) f.push('erBasis() fortsatt true etter synk (skjold ikke oppdatert)');
  push('retur: synk suksess', f, errs);
  await page.locator('#abonnement').screenshot({path:path.join(OUT,'375-retur-suksess.png')});
  // refresh → ingen ny synk
  await page.reload({waitUntil:'networkidle'});
  push('retur: refresh kaller ikke synk igjen', logg.sync===1?[]:[`synk-kall ${logg.sync}`], errs);
  await page.close();
}
{ // feil: siste kjente tilstand + ventebanner
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis()}, '/no/dashboard.html?live=1&session_id=cs_test_feil');
  await page.waitForTimeout(800);
  const m=await maalKort(page); const banner=await tekstAv(page,'#subReturn');
  push('retur: synk feiler → siste kjente + ventebanner', [
    ...(logg.sync===1?[]:[`synk-kall ${logg.sync}`]),
    ...(banner==='Det kan ta et minutt før Vekst vises. Last inn siden på nytt.'?[]:[`banner «${banner}»`]),
    ...sjekkVent(m,{status:/^● Gratis$/, opp:true}),
    ...(m.oppTekst.includes('Aktiverer')?['«Aktiverer» henger igjen']:[])], errs);
  await page.locator('#abonnement').screenshot({path:path.join(OUT,'375-retur-feil.png')});
  await page.close();
}
{ // live=1 uten session_id → ventebanner, ingen synk
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis(), sync:()=>({body:vekstSub()})}, '/no/dashboard.html?live=1');
  await page.waitForTimeout(600);
  const banner=await tekstAv(page,'#subReturn');
  push('retur: live=1 uten session_id → ingen synk', [
    ...(logg.sync===0?[]:[`synk-kall ${logg.sync}`]),
    ...(banner==='Det kan ta et minutt før Vekst vises. Last inn siden på nytt.'?[]:[`banner «${banner}»`])], errs);
  await page.close();
}
{ // avbrutt
  const {page,errs,logg}=await nySide(375,{billing:()=>gratis()}, '/no/dashboard.html?avbrutt=1');
  await page.waitForTimeout(600);
  const banner=await tekstAv(page,'#subReturn');
  push('retur: avbrutt', [...(logg.sync===0?[]:[`synk-kall ${logg.sync}`]),
    ...(banner==='Betalingen ble avbrutt. Du kan oppgradere når som helst.'?[]:[`banner «${banner}»`])], errs);
  await page.locator('#abonnement').screenshot({path:path.join(OUT,'375-retur-avbrutt.png')});
  await page.close();
}

// ── 5. Flatene 2.1 / 2.2 / 2.4 ──
for(const b of [320,375]){
  { // 2.1 trial-nudgen er FJERNET: ingen node, selv i prøveperioden der den før viste seg (dag 20+)
    const {page,errs,logg}=await nySide(b,{billing:()=>prove({trial_days_left:8})});
    await page.waitForTimeout(600);
    const finnes=await page.evaluate(()=>!!document.getElementById('trialNudge')||!!document.querySelector('.trial-nudge'));
    if(b===375) push('2.1 trial-nudge fjernet', finnes?['#trialNudge finnes fortsatt']:[], errs);
    await page.screenshot({path:path.join(OUT,`${b}-oversikt-uten-nudge.png`),clip:{x:0,y:0,width:b,height:760}});
    await page.close();
    // «Hentet inn av BarberHQ» (attribusjonskortet i Vekst-fanen) på Gratis: prislinja under
    // «Oppgrader til Vekst». diBasisCtaPris rendres KUN der (Oversikt har ingen CTA).
    const g=await nySide(b,{billing:()=>gratis()});
    // «Drevet av» (Oversikt) → «På vei»: Gratis-noten under rebooking-tallet
    await g.page.waitForTimeout(600);
    const pvNote=await tekstAv(g.page,'#drivenBy .di-basis-note');
    if(b===375) push('Drevet av → På vei: Gratis-note', pvNote==='På Gratis får ingen av dem rebooking-SMS.'?[]:[`«${pvNote}»`], g.errs);
    await g.page.locator('#drivenBy').screenshot({path:path.join(OUT,`${b}-drevet-av-paa-vei.png`)});
    await g.page.$eval('button[data-panel="vekst"]',x=>x.click()); await g.page.waitForTimeout(900);
    const pris=await tekstAv(g.page,'#attrRows .di-cta-price');
    if(b===375) push('Hentet inn: prislinje', pris==='179 kr/mnd eks. mva. Ingen binding.'?[]:[`«${pris}»`], g.errs);
    await g.page.locator('#attrKort').screenshot({path:path.join(OUT,`${b}-hentet-inn-gratis.png`)});
    await g.page.close();
  }
  { // «Din side»-CTA (forhandsvist) + suksesskortet etter publisering
    const {page,errs}=await nySide(b,{billing:()=>gratis({page_status:'forhandsvist'}), put:()=>({ok:true,...gratis()})},'/no/dashboard.html#dinside');
    await page.waitForTimeout(900);
    const note=await tekstAv(page,'.dinside-cta-note');
    if(b===375) push('Din side-CTA: note', note==='Publiser når du er fornøyd. Det er gratis, uten kort.'?[]:[`«${note}»`], errs);
    await page.locator('#dinsideCta').screenshot({path:path.join(OUT,`${b}-dinside-cta.png`)});
    await page.click('#dinsidePubliser'); await page.waitForTimeout(700);
    const kort=await page.$eval('#suksessOverlay .suksess-kort',e=>e.innerText.replace(/\s*\n+\s*/g,' | ').trim()).catch(()=>'—');
    const tittel=await tekstAv(page,'#suksessTittel'), sub=await tekstAv(page,'#suksessOverlay .suksess-linje.sub');
    if(b===375){
      push('suksesskort: tekst', [...(tittel==='Siden din er klar.'?[]:[`tittel «${tittel}»`]),
        ...(sub==='Nå får vi første booking gjennom den.'?[]:[`undertekst «${sub}»`]),
        ...(/30 dager|prøve/i.test(kort)?[`gammel tekst i kortet «${kort}»`]:[])], errs);
      console.log('SUKSESSKORT (hele teksten):', kort);
    }
    // Uthevet linje + linjebrekk: ingen enkeltord alene på siste linje i noen av kortets tekster (320 og 375).
    const brekk=await page.$$eval('#suksessTittel, #suksessOverlay .suksess-linje',l=>l.map(e=>{
      const out=[]; let y=null; const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let n;
      while((n=w.nextNode())){ const re=/\S+/g; let m; while((m=re.exec(n.data))){ const r=document.createRange(); r.setStart(n,m.index); r.setEnd(n,m.index+m[0].length);
        const top=Math.round(r.getBoundingClientRect().top); if(y===null||Math.abs(top-y)>4){out.push([]);y=top;} out.at(-1).push(m[0]); } }
      return out.map(x=>x.join(' '));}));
    const linja=await tekstAv(page,'#suksessOverlay .suksess-linje:not(.sub)');
    push(`suksesskort @${b}: linjer`, [...(linja==='Legg lenka i bioen og del den på story'?[]:[`uthevet linje «${linja}»`]),
      ...brekk.filter(l=>l.length>1&&!l.at(-1).includes(' ')).map(l=>`enkeltord alene: ${l.map(x=>'«'+x+'»').join(' / ')}`)], errs);
    console.log(`SUKSESSKORT @${b} linjebrekk:`, JSON.stringify(brekk));
    await page.locator('#suksessOverlay .suksess-kort').screenshot({path:path.join(OUT,`${b}-suksesskort.png`)});
    await page.close();
  }
  { // 2.2 info-ikonet ved «Send etter» er FJERNET: Rebooking-kortet i prøveperioden, rebooking på
    const {page,errs}=await nySide(b,{billing:()=>prove(), settings:{sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35}});
    await page.$eval('button[data-panel="vekst"]',x=>x.click()); await page.waitForTimeout(500);
    await page.evaluate(()=>{ const h=document.querySelector('#accRebook .acc-head'); if(h&&h.getAttribute('aria-expanded')!=='true')h.click(); });
    await page.waitForTimeout(400);
    const m=await page.evaluate(()=>({ ikon:!!document.querySelector('#rebookInfoWrap,#rebookInfo,#rebookInfoTip,.info-i,.info-tip'),
      rad:(document.querySelector('#rebookIntervallRad .seg-lead')||{}).textContent||'',
      synlig:!!(document.getElementById('rebookIntervallRad')||{}).offsetParent }));
    if(b===375) push('2.2 info-ikon fjernet', [...(m.ikon?['ikon/boble finnes fortsatt']:[]),
      ...(m.rad.trim()==='Send etter'?[]:[`«Send etter»-raden: «${m.rad}»`]), ...(m.synlig?[]:['«Send etter»-raden er ikke synlig'])], errs);
    await page.locator('#accRebook').screenshot({path:path.join(OUT,`${b}-rebooking-uten-ikon.png`)});
    await page.close();
  }
  { // 2.4 lås-flatene (Gratis): skjold på attribusjon, handlingslås + lås-liste på verving, 403-lås
    const {page,errs}=await nySide(b,{billing:()=>gratis()});
    await page.$eval('button[data-panel="vekst"]',x=>x.click()); await page.waitForTimeout(900);
    // settSkjold har i dag ÉN kaller (momentum-kortet), og det kortet er skjult på Gratis — skjoldet
    // vises altså ingen steder naturlig. Tving det fram på momentum-kortet for å måle teksten.
    await page.evaluate(()=>{ const c=document.getElementById('momentumCard'); if(c){ c.hidden=false; settSkjold(c); } });
    await page.waitForTimeout(200);
    const skjold=await page.$$eval('.skjold',l=>l.map(s=>s.getAttribute('aria-label')+'|'+s.innerText.trim()));
    const badge=await page.$$eval('.laas-badge',l=>l.map(x=>x.title));
    await page.evaluate(()=>{ const h=document.querySelector('#accVerv .acc-head'); if(h&&h.getAttribute('aria-expanded')!=='true')h.click(); });
    await page.waitForTimeout(400);
    const liste=await tekstAv(page,'#vervSendList');
    // 403-låsen (visSettingsLaas) vises bare etter et avvist lagre-kall; kontrollene er disablet på
    // Gratis, så den rendres direkte på rebooking-feltet for bildet.
    await page.evaluate(()=>{ const h=document.querySelector('#accRebook .acc-head'); if(h&&h.getAttribute('aria-expanded')!=='true')h.click();
      visSettingsLaas(document.getElementById('rebookErr'),'Rebooking er med i Vekst.'); });
    await page.waitForTimeout(300);
    const lock403=await tekstAv(page,'#rebookErr');
    if(b===375){
      const f=[];
      if(!skjold.length||!skjold.every(x=>x==='Oppgrader til Vekst|Oppgrader til Vekst')) f.push(`skjold ${JSON.stringify(skjold)}`);
      if(!badge.length||!badge.every(x=>x==='Med i Vekst')) f.push(`lås-merke ${JSON.stringify(badge)}`);
      if(liste!=='Med i Vekst. Oppgrader for å bruke dette.') f.push(`lås-liste «${liste}»`);
      if(lock403!=='Rebooking er med i Vekst. Oppgrader') f.push(`403-lås «${lock403}»`);
      push('2.4 lås-flatene (Gratis)', f, errs);
    }
    await page.locator('#momentumCard').screenshot({path:path.join(OUT,`${b}-2.4-skjold-momentum.png`)}).catch(()=>{});
    await page.locator('#accVerv').screenshot({path:path.join(OUT,`${b}-2.4-laas-verving.png`)});
    await page.locator('#accRebook').screenshot({path:path.join(OUT,`${b}-2.4-laas-rebooking-403.png`)});
    await page.close();
  }
}

push('ingen request til prod', prodSluppet===prodAvbrutt?[]:[`${prodSluppet} forsøk, ${prodAvbrutt} avbrutt`]);
console.table(rapport);
const feilet=rapport.filter(r=>r.resultat!=='OK ✓'||r.jsfeil!=='ingen');
console.log(feilet.length?`\n${feilet.length} FEIL`:'\nAlt grønt', '— bilder i', OUT);
await browser.close(); server.close();
process.exit(feilet.length?1:0);
