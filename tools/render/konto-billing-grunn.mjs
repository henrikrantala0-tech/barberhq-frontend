// Konto: den nye tre-lags-dispatchen i renderKonto (attention-overlay → effective_plan_grunn →
// fail-closed) + FIX 2 (settSideStatus erstatter hele _billing med PUT-svaret).
//
// Verifiserer:
//   • hver gren gir riktig status/tekst/knapp (måler tekst, ikke bare bilde)
//   • oppsagt (canceled/unpaid) ligger ØVERST — slår past_due (prioritet)
//   • HULLET: canceled/unpaid/nedtatt + forhandsvist viser ALDRI en publiser-knapp,
//     verken i Konto (#kontoAksjon) eller på «Din side» (#dinsideCta)
//   • FIX 2: A (laast+forhandsvist) → klikk «Publiser» → mock PUT returnerer full trial_vindu-shape
//     → Konto viser «Prøveperiode» UMIDDELBART, uten reload
//   • fail-closed sier «Abonnementsstatus utilgjengelig», ALDRI «Ingen aktivt abonnement»
//
// page.on('pageerror') er syntaks-vakten: en parse-feil i dashboard-JS-en tar ned ALT stille.
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

// Full billing-shape med fornuftige nuller; hver case overstyrer det den trenger.
const base=()=>({ subscription_status:null, page_status:'live', effective_plan_grunn:'trial_vindu',
  trial_days_left:20, trial_start_at:new Date(Date.now()-10*864e5).toISOString(),
  nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null,
  days_left:null, trial_ends_at:null, plan:null });

const CASE=[
  { navn:'oppsagt-canceled', shot:true, b:{...base(), subscription_status:'canceled', page_status:'forhandsvist',
      effective_plan_grunn:'laast', plan:'vekst', trial_days_left:0, needs_attention:true },
    vent:{status:/Abonnementet er avsluttet/, knapp:/Fortsett med Vekst/}, ingenPubliser:true, dinsideSkjult:true },
  { navn:'oppsagt-unpaid-slaar-pastdue', b:{...base(), subscription_status:'unpaid', page_status:'live',
      effective_plan_grunn:'subscription', attention_grunn:'past_due', plan:'vekst', needs_attention:true },
    vent:{status:/Abonnementet er avsluttet/}, ingenPubliser:true },      // oppsagt vinner over past_due
  { navn:'past_due', b:{...base(), subscription_status:'past_due', page_status:'live',
      effective_plan_grunn:'subscription', attention_grunn:'past_due', plan:'vekst', needs_attention:true },
    vent:{status:/Betalingen gikk ikke gjennom/, knapp:/Oppdater kort/} },
  { navn:'nedtatt', shot:true, b:{...base(), page_status:'forhandsvist', effective_plan_grunn:'laast',
      attention_grunn:'trial_utlopt_nedtatt', plan:'vekst', trial_days_left:0, needs_attention:true },
    vent:{status:/Siden din er ikke synlig/, knapp:/Fortsett med Vekst/}, ingenPubliser:true, dinsideSkjult:true },
  { navn:'myk-periode', b:{...base(), page_status:'live', effective_plan_grunn:'laast',
      attention_grunn:'trial_utlopt', myk_periode:true, nedtaking_dager_igjen:5, plan:'vekst', needs_attention:true },
    vent:{status:/Prøveperioden er over/, tekst:/tas ned om 5 dager/} },
  { navn:'trial_slutter', shot:true, b:{...base(), page_status:'live', effective_plan_grunn:'trial_vindu',
      attention_grunn:'trial_slutter', trial_days_left:5, needs_attention:true },
    vent:{status:/Prøveperioden slutter snart/, tekst:/5 dager igjen\. Legg inn kort for å fortsette uten avbrudd\./} },
  { navn:'sub-active-vekst', b:{...base(), subscription_status:'active', page_status:'live',
      effective_plan_grunn:'subscription', plan:'vekst' },
    vent:{status:/Vekst-abonnementet er aktivt/, tekst:/Alt inkludert/} },
  { navn:'sub-trialing', b:{...base(), subscription_status:'trialing', page_status:'live',
      effective_plan_grunn:'subscription', plan:'vekst' },
    vent:{status:/Vekst-abonnementet er aktivt/, tekst:/Første trekk skjer når prøveperioden er over/} },
  { navn:'sub-active-basis-oppgrader', b:{...base(), subscription_status:'active', page_status:'live',
      effective_plan_grunn:'subscription', plan:'basis' },
    vent:{status:/Basis-abonnementet er aktivt/, knapp:/Oppgrader til Vekst/} },
  { navn:'trial_vindu-B', b:{...base(), page_status:'live', effective_plan_grunn:'trial_vindu', trial_days_left:18 },
    vent:{status:/Prøveperiode/, tekst:/Legg inn kort før prøveperioden er slutt/} },
  { navn:'A-ikke-publisert', shot:true, b:{...base(), page_status:'forhandsvist', effective_plan_grunn:'laast',
      trial_days_left:null, trial_start_at:null },
    vent:{status:/Ikke publisert/, knapp:/Publiser og start gratis prøveperiode/}, dinsideSynlig:true },
  { navn:'fail-anomali', shot:true, b:{...base(), page_status:'live', effective_plan_grunn:'anomali_status_uten_plan' },
    vent:{status:/Abonnementsstatus utilgjengelig/, tekst:/Tilgangen din er upåvirket/}, ingenPubliser:true, ingenGammelCopy:true },
  { navn:'fail-laast-live', b:{...base(), page_status:'live', effective_plan_grunn:'laast', attention_grunn:null },
    vent:{status:/Abonnementsstatus utilgjengelig/}, ingenPubliser:true, ingenGammelCopy:true },
];

const PROFIL={hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'};
function stubApi(page,billing,onPut){
  return page.route('**/api/**',route=>{
    const req=route.request(); const u=new URL(req.url());
    if(u.pathname==='/api/dashboard/billing/status')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(billing())});
    if(u.pathname==='/api/dashboard/page-status'&&req.method()==='PUT'&&onPut)
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(onPut(req))});
    if(u.pathname==='/api/dashboard/profile')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(PROFIL)});
    if(u.pathname==='/api/dashboard/preview')
      return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals/.test(u.pathname)?[]:{})});
  });
}
const T=async(loc)=>{ try{ return (await loc).trim(); }catch(e){ return '(skjult)'; } };

const browser=await chromium.launch();
const rapport=[];

for(const c of CASE){
  const page=await browser.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await stubApi(page,()=>c.b);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  await page.waitForTimeout(900);

  const status = await T(page.$eval('#kontoStatus',e=>e.textContent));
  const tekst  = await T(page.$eval('#kontoTekst',e=>e.offsetParent!==null?e.textContent:'(skjult)'));
  const knapp  = await T(page.$eval('#kontoAksjon',e=>e.offsetParent!==null?e.textContent:'(skjult)'));
  const panelTxt = await page.$eval('#abonnement',e=>e.innerText);
  const dinsideHidden = await page.$eval('#dinsideCta',e=>e.hidden);

  const feil=[];
  if(c.vent.status && !c.vent.status.test(status)) feil.push(`status «${status}» ≠ ${c.vent.status}`);
  if(c.vent.tekst  && !c.vent.tekst.test(tekst))   feil.push(`tekst «${tekst}» ≠ ${c.vent.tekst}`);
  if(c.vent.knapp  && !c.vent.knapp.test(knapp))   feil.push(`knapp «${knapp}» ≠ ${c.vent.knapp}`);
  if(c.ingenPubliser && /[Pp]ubliser/.test(knapp)) feil.push(`PUBLISER-knapp i Konto: «${knapp}»`);
  if(c.ingenPubliser && !dinsideHidden)            feil.push('Din side-publiser-CTA SYNLIG (skulle vært skjult)');
  if(c.dinsideSkjult && !dinsideHidden)            feil.push('#dinsideCta synlig (canceled/nedtatt → skal skjules)');
  if(c.dinsideSynlig && dinsideHidden)             feil.push('#dinsideCta skjult (A → skulle vært synlig)');
  if(c.ingenGammelCopy && /Ingen aktivt abonnement/.test(panelTxt)) feil.push('gammel «Ingen aktivt abonnement»-copy');

  if(c.shot) await page.locator('#abonnement').screenshot({path:`${OUT}/konto-${c.navn}.png`});
  rapport.push({scenario:c.navn, status:status.replace(/^●\s*/,''),
    knapp:knapp==='(skjult)'?'—':knapp, dinsideCTA:dinsideHidden?'skjult':'SYNLIG',
    resultat: feil.length?('✗ '+feil.join(' | ')):'OK ✓', jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

// ── FIX 2: publiser-flyten — A → klikk → full trial_vindu-PUT → «Prøveperiode» uten reload ──
{
  const page=await browser.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  // Start i A. billing/status leses ved init; PUT svarer full shape (som ekte backend nå gjør).
  const startA={...base(), page_status:'forhandsvist', effective_plan_grunn:'laast',
    trial_days_left:null, trial_start_at:null};
  const putSvar={...base(), page_status:'live', effective_plan_grunn:'trial_vindu',
    trial_days_left:30, trial_start_at:new Date().toISOString(), needs_attention:false, attention_grunn:null};
  await stubApi(page,()=>startA,()=>putSvar);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.$eval('button[data-panel="abonnement"]',b=>b.click());
  await page.waitForTimeout(800);
  const foer = await T(page.$eval('#kontoStatus',e=>e.textContent));
  await page.$eval('#kontoAksjon',b=>b.click());   // publiser → settSideStatus('live')
  await page.waitForTimeout(700);                   // ingen reload — kun renderKonto fra PUT-svaret
  const etter = await T(page.$eval('#kontoStatus',e=>e.textContent));
  const dager = await T(page.$eval('#kontoTallStor',e=>e.offsetParent!==null?e.textContent:'(skjult)'));
  const feil=[];
  if(!/Ikke publisert/.test(foer)) feil.push(`start var ikke A: «${foer}»`);
  if(!/Prøveperiode/.test(etter))  feil.push(`etter publisering: «${etter}» (ventet Prøveperiode)`);
  if(!/30 dager/.test(dager))      feil.push(`dager-tall: «${dager}» (ventet 30 dager)`);
  await page.locator('#abonnement').screenshot({path:`${OUT}/konto-FIX2-etter-publisering.png`});
  rapport.push({scenario:'FIX2-publiser-flyt', status:`${foer.replace(/^●\s*/,'')} → ${etter.replace(/^●\s*/,'')}`,
    knapp:dager, dinsideCTA:'—', resultat: feil.length?('✗ '+feil.join(' | ')):'OK ✓',
    jsfeil: errs.length?errs.join('; '):'ingen'});
  await page.close();
}

console.table(rapport);
const feilet=rapport.filter(r=>r.resultat!=='OK ✓');
const jsfeil=rapport.filter(r=>r.jsfeil!=='ingen');
console.log('\nAlle grener OK:', feilet.length?('NEI ✗ — '+feilet.map(r=>r.scenario).join(', ')):'JA ✓');
console.log('JS-feil (syntaks-vakt):', jsfeil.length?('JA ✗ — '+jsfeil.map(r=>r.scenario+': '+r.jsfeil).join(' | ')):'ingen ✓');
console.log('screenshots i', OUT);
await browser.close(); server.close();
process.exit(feilet.length||jsfeil.length?1:0);
