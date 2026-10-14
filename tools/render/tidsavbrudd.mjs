// tools/render/tidsavbrudd.mjs — felles tidsavbrudd i apiFetch (15 s) + feil i story-forhåndsvisningen.
// Et kall som HENGER (route som aldri svarer) spoles fram med page.clock, uten å vente i sanntid.
// Verifiserer at knappen går tilbake til normal tilstand og at «Fikk ikke kontakt. Prøv igjen.» vises:
//   1. Vekst: påminnelse-bryteren (lagreSmsInnstilling via api.saveSettings) — rulles tilbake, feiltekst.
//   2. Konto: «Publiser bookingsiden» (PUT /page-status) — knappen tilbake, feiltekst i #pubErr.
//   3. Tjenester: «Lagre betaling» (medLagreKnapp) — knappen tilbake, alert med kontaktteksten.
//   4. Lojalitet: «Legg til» (api.loyaltyOptIn) — knappen tilbake, toast med kontaktteksten.
//   5. «Lag story»: preview som henger / svarer 500 / svarer 403 → #storyFeil; ekte story-HTML → ingen feil.
//   6. Før 15 s: knappen står fortsatt i «… pågår» (tidsavbruddet slår ikke inn for tidlig).
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
//   node tools/render/tidsavbrudd.mjs   → .render-ut/tidsavbrudd/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/tidsavbrudd');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const KONTAKT='Fikk ikke kontakt. Prøv igjen.';

const PAKKER=[{antall:100,pris_kr:129,per_sms_kr:1.29},{antall:250,pris_kr:279,per_sms_kr:1.12},{antall:500,pris_kr:495,per_sms_kr:0.99}];
const base=(x={})=>({ subscription_status:null, page_status:'live', plan:null, effective_plan:'basis', effective_plan_grunn:'gratis',
  trial_start_at:null, trial_days_left:null, trial_ends_at:null, days_left:null, needs_attention:false, attention_grunn:null,
  plakater_doede:false, cancel_at_period_end:false, current_period_end:null, sms_saldo:0, sms_paaminnelser_sendes:false,
  sms_pakker:PAKKER, sms_pakke_kan_kjopes:true, sms_tilbud_avvist_at:null, ...x });
const vekst=(x={})=>base({subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription',
  sms_pakke_kan_kjopes:false, sms_paaminnelser_sendes:true, ...x});
// Realistisk stand-in for backendens story-HTML (samme form som lag-story.mjs): 1080×1920, mørk flate,
// tittel, navn og dager med tider i #days. En tom side ga en hvit flate som ikke beviste noe.
const STORY_OK=`<!DOCTYPE html><html lang="no"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px}
  body{background:#111;color:#f0f0f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:250px 96px 340px}
  .t{font-size:104px;text-align:center;letter-spacing:-.02em}.n{font-size:52px;text-align:center;color:#b08c32;margin:14px 0 64px}
  .d{display:flex;justify-content:space-between;font-size:46px;padding:20px 0;border-bottom:2px solid rgba(255,255,255,.22)}.dh{color:#b08c32;font-weight:600}
</style></head><body>
  <div class="t">Ledige timer</div><div class="n">Grand Barber</div>
  <div id="days">${['Man 19.','Tir 20.','Ons 21.','Tor 22.'].map(d=>`<div class="d"><span class="dh">${d}</span><span>10:00–17:30</span></div>`).join('')}</div>
</body></html>`;

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
// heng: liste av [metode, sti-slutt] som aldri får svar. story: 'ok' | 'heng' | 500 | 403.
async function nySide(bredde,{billing,heng=[],story='ok',loyalty=null}){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const dialoger=[]; page.on('dialog',d=>{ dialoger.push(d.message()); d.dismiss(); });
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.clock.install();
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname;
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    if(heng.some(([m,s])=>req.method()===m&&p.endsWith(s))) return;   // svarer aldri → henger til apiFetch avbryter
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/settings'&&req.method()==='GET') return json({sms_paaminnelse_enabled:true,sms_rebooking_enabled:false,rebooking_interval_days:35,payment_methods:['Vipps']});
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'});
    if(p==='/api/dashboard/services') return json({hoved:[{id:'11111111-1111-1111-1111-111111111111',name:'Herreklipp',price:400,min:30,sort:0}],tillegg:[]});
    if(p==='/api/dashboard/hours') return json([{day:1,open:'09:00',close:'17:00'}]);
    if(p==='/api/dashboard/loyalty') return json(loyalty||{enabled:false,threshold:10,pct:100,participants:[],eligible:[],totals:{}});
    if(p.endsWith('/story/ledige-timer/data')) return json({tjenester:1,valgt_dager:4,tilgjengelige_dager:7,dager:[]});
    if(p.endsWith('/story/ledige-timer/preview')){
      if(story==='heng') return;
      if(story==='ok') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:STORY_OK});
      return json({error:'Ikke tilgang'},story);
    }
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'domcontentloaded'});
  await page.clock.runFor(2000); await page.waitForTimeout(600);
  return {page,errs,dialoger};
}
const spol=async(page,ms)=>{ await page.clock.runFor(ms); await page.waitForTimeout(300); };
const synligTekst=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null?e.textContent.trim():'—').catch(()=>'—');
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
// page.clock fryser også tegningen (requestAnimationFrame): uten resume() viser skjermbildet siste tegnede
// bilde («Lagrer …», spinner) selv om DOM-en er oppdatert. Sjekkene er tatt FØR dette, så resume er trygt.
const bilde=async(page,navn,sel)=>{ await page.clock.resume(); if(sel) await page.$eval(sel,e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(400);
  const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };

for(const w of [320,375]){
  // 1. Påminnelse-bryteren (Vekst-plan)
  {
    const {page,errs}=await nySide(w,{billing:vekst(),heng:[['PUT','/api/dashboard/settings']]});
    await page.$eval('button[data-panel="vekst"]',b=>b.click()); await page.waitForTimeout(300);
    await page.click('#accPaam .sw .sl'); await spol(page,5000);
    const f=[];
    if(!(await page.$eval('#tog-paam',e=>e.disabled))) f.push('bryteren ikke låst mens kallet går (5 s)');
    await spol(page,11000);
    const m=await page.$eval('#tog-paam',e=>({checked:e.checked,disabled:e.disabled}));
    if(m.disabled) f.push('bryteren henger (disabled)');
    if(!m.checked) f.push('ikke rullet tilbake til PÅ');
    const t=await synligTekst(page,'#paamErr'); if(t!==KONTAKT) f.push(`feiltekst «${t}»`);
    await bilde(page,`paam-${w}`,'#accPaam');
    push(`${w} påminnelse-bryter`,f,errs); await page.close();
  }
  // 2. Publiser bookingsiden (Konto)
  {
    const {page,errs}=await nySide(w,{billing:base({page_status:'forhandsvist'}),heng:[['PUT','/api/dashboard/page-status']]});
    await page.$eval('button[data-panel="abonnement"]',b=>b.click()); await page.waitForTimeout(300);
    const orig=await page.$eval('#kontoAksjon',b=>b.textContent.trim());
    await page.click('#kontoAksjon'); await spol(page,5000);
    const f=[];
    const under=await page.$eval('#kontoAksjon',b=>b.textContent.trim());
    if(under!=='Lagrer …') f.push(`før 15 s: «${under}»`);
    await spol(page,11000);
    const b=await page.$eval('#kontoAksjon',b=>({t:b.textContent.trim(),d:b.disabled}));
    if(b.d||b.t!==orig) f.push(`knapp «${b.t}» disabled=${b.d}`);
    const t=await synligTekst(page,'#pubErr'); if(t!==KONTAKT) f.push(`feiltekst «${t}»`);
    // Rød som #paamErr (.sett-err) — .subcard p gjorde den grå før.
    const farger=await page.evaluate(()=>{ const p=document.createElement('p'); p.className='sett-err'; document.body.appendChild(p);
      const c=[getComputedStyle(document.getElementById('pubErr')).color, getComputedStyle(p).color]; p.remove(); return c; });
    if(farger[0]!==farger[1]) f.push(`farge ${farger[0]} ≠ #paamErr ${farger[1]}`);
    await bilde(page,`publiser-${w}`,'#kontoAbonnement');
    push(`${w} publiser`,f,errs); await page.close();
  }
}
// 3. Lagre betaling (medLagreKnapp → alert)
{
  const {page,errs,dialoger}=await nySide(375,{billing:vekst(),heng:[['PUT','/api/dashboard/payment-methods']]});
  await page.$eval('button[data-panel="tjenester"]',b=>b.click()); await page.waitForTimeout(300);
  await page.click('#savePay'); await spol(page,16000);
  const f=[];
  const b=await page.$eval('#savePay',b=>({t:b.textContent.trim(),d:b.disabled}));
  if(b.d||b.t!=='Lagre betaling') f.push(`knapp «${b.t}» disabled=${b.d}`);
  if(!dialoger.includes(KONTAKT)) f.push(`alert ${JSON.stringify(dialoger)}`);
  push('lagre betaling (medLagreKnapp)',f,errs); await page.close();
}
// 4. Lojalitet «Legg til» (api.loyaltyOptIn → kontaktSvar)
{
  const loyalty={enabled:true,threshold:10,pct:100,count_history:false,participants:[],
    eligible:[{customer_id:'c1',name:'Ola Nordmann',phone:'91234567',last_visit:'2026-10-01',completed_count:3}],
    totals:{in_progress:0,ready:0,redeemed_month:0,participants:0,eligible:1}};
  const {page,errs}=await nySide(375,{billing:vekst(),loyalty,heng:[['PUT','/loyalty']]});
  await page.$eval('button[data-panel="vekst"]',b=>b.click()); await page.waitForTimeout(500);
  await page.evaluate(()=>{ const h=document.querySelector('#accLoyal .acc-head'); if(h&&h.getAttribute('aria-expanded')!=='true') h.click(); });
  await page.waitForTimeout(400);
  const f=[];
  const knapp=await page.$('#loyalLeggTil .verv-btn');
  if(!knapp){ f.push('fant ikke «Legg til»'); }
  else{
    await knapp.click(); await spol(page,16000);
    const b=await page.$eval('#loyalLeggTil .verv-btn',b=>({t:b.textContent.trim(),d:b.disabled}));
    if(b.d||b.t!=='Legg til') f.push(`knapp «${b.t}» disabled=${b.d}`);
    const toast=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&e.textContent.trim()==='Fikk ikke kontakt. Prøv igjen.').length);
    if(!toast) f.push('ingen toast med kontaktteksten');
  }
  push('lojalitet «Legg til» (loyaltyOptIn)',f,errs); await page.close();
}
// 5. Story-forhåndsvisningen
for(const [id,story,bredder] of [['heng','heng',[320,375]],['500',500,[320,375]],['403',403,[375]],['ok','ok',[320,375]]]){
  for(const w of bredder){
    const {page,errs}=await nySide(w,{billing:base(),story});
    await page.evaluate(()=>window.aapneStory&&window.aapneStory());
    // Editoren henter /data FØR previewen startes. Spoles klokka før iframen har fått src, starter
    // 15 s-vakta etter spolingen og fyrer aldri (ustabil test, ikke produktfeil). Vent på src først.
    // Poll fra Node (waitForFunction bruker sidens timere/rAF, som page.clock har frosset).
    for(let i=0;i<50;i++){ if(await page.evaluate(()=>!!document.getElementById('storyFrame').getAttribute('src'))) break; await page.clock.runFor(50); await page.waitForTimeout(100); }
    await spol(page, story==='heng'?16000:1500);
    const f=[];
    const t=await page.$eval('#storyFeil',e=>getComputedStyle(e).display!=='none'?e.textContent.trim():'—');
    const forvent= story==='ok' ? '—' : 'Kunne ikke lage forhåndsvisningen. Lukk og prøv igjen om litt.';
    if(t!==forvent) f.push(`storyFeil «${t}»`);
    const laster=await page.$eval('#storyLaster',e=>getComputedStyle(e).display);
    if(laster!=='none') f.push('spinneren står fortsatt');
    const fr=await page.evaluate(()=>{ const f=document.getElementById('storyFrame'); let rader=0;
      try{ rader=f.contentDocument.querySelectorAll('#days .d').length; }catch(_){}
      return {synlig:getComputedStyle(f).visibility!=='hidden', rader}; });
    if(story==='ok'){
      if(!fr.synlig) f.push('iframen er skjult');
      if(fr.rader!==4) f.push(`plakaten viser ${fr.rader} dager (ventet 4)`);
    }else if(fr.synlig) f.push('iframen (rått serversvar) synes bak feilen');
    await bilde(page,`story-${id}-${w}`,null);
    push(`${w} story ${id}`,f,errs); await page.close();
  }
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
