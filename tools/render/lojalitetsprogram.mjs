// tools/render/lojalitetsprogram.mjs — Lojalitetsprogram-trekkspillet i Vekst-fanen.
// To deler: DELTAKERLISTE (participants, klare først) + «LEGG TIL KUNDE» (kandidater = eligible fra
// /loyalty, med completed_count; ingen «legg til alle»). Stubber GET /loyalty i tilstander:
//   av        = { enabled:false }                         → én setning + «Slå på»-knapp, ingen «legg til»
//   paa_tom   = enabled, ingen deltakere                  → totaler 0/0/0 + «du velger selv» + kandidater
//   paa_liste = enabled, blandet deltakerliste            → totaler + deltakere (klare øverst) + kandidater
// Billing = vekst (IKKE basis) → ingen skjold her; Basis-skjoldet testes i skjold.mjs (steg 4).
// Rendrer @320 i BÅDE mørk og lys som VIEWPORT-SLICES (320×720), scroll hele veien ned i kortet,
// nummererte segmenter (loyal-<variant>-<tema>-01.png, -02, …). Måler oversiktstilstand + JS-feil.
//
//   node tools/render/lojalitetsprogram.mjs
//
// Skjermbilder → .render-ut/loyal-*.png (gitignorert). Åpne: powershell -File tools/render/vis.ps1 loyal-*

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Vekst (kontroll) — ikke basis, så INGEN skjold på Vekst-flatene.
const BILLING = { subscription_status:'trialing', page_status:'live',
  plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu',
  trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };

// eligible = kandidatkilden fra /loyalty (backend ekskluderer deltakerne). completed_count skiller
// stamkunde (Nina 15) fra engangskunde (Lars 1). last_visit gir ferskhet.
const daysAgo = n => new Date(Date.now()-n*86400000).toISOString();
const ELIGIBLE = [
  { customer_id:6,  name:'Sara Ali',      phone:'99001122', last_visit:daysAgo(2),  completed_count:8 },
  { customer_id:7,  name:'Petter Hansen', phone:'93344556', last_visit:daysAgo(9),  completed_count:3 },
  { customer_id:8,  name:'Nina Dahl',     phone:'47788990', last_visit:daysAgo(20), completed_count:15 },
  { customer_id:9,  name:'Lars Vik',      phone:'',         last_visit:daysAgo(1),  completed_count:1 },
  { customer_id:11, name:'Ola Berg',      phone:'40506070', last_visit:daysAgo(35), completed_count:6 },
];

const LOYAL = {
  // Av MED uthentede belønninger (2 kan hente): viser advarsels-linja over «Slå på». En helt fersk,
  // aldri-påslått konto ville hatt ready:0 og ingen linje. totals er populert også når enabled:false.
  av:        { enabled:false, threshold:10, pct:100, count_history:false, participants:[], eligible:[],
               totals:{ in_progress:0, ready:2, redeemed_month:0, participants:2, eligible:0 } },
  paa_tom:   { enabled:true, threshold:10, pct:100, count_history:false, activated_at:'2026-09-01T10:00:00Z',
               participants:[], eligible:ELIGIBLE,
               totals:{ in_progress:0, ready:0, redeemed_month:0, participants:0, eligible:ELIGIBLE.length } },
  // Ren liste: KUN Amir er kan-hente (10/10, ved terskel). reward_ready uavhengig av stamps.
  paa_liste: { enabled:true, threshold:10, pct:100, count_history:false, activated_at:'2026-08-01T10:00:00Z',
               participants:[
                 { customer_id:1, name:'Amir Haddad',   phone:'99887766', opt_in_at:'2026-08-02', stamps:10, reward_ready:true },
                 { customer_id:2, name:'Kari Nordmann',  phone:'91234567', opt_in_at:'2026-08-03', stamps:8,  reward_ready:false },
                 { customer_id:3, name:'Ola Nordmann',   phone:'40011223', opt_in_at:'2026-08-05', stamps:7,  reward_ready:false },
                 { customer_id:4, name:'Emily Johnson',  phone:'46655443', opt_in_at:'2026-08-06', stamps:4,  reward_ready:false },
                 { customer_id:5, name:'Jonas Berg',     phone:'',         opt_in_at:'2026-08-07', stamps:2,  reward_ready:false },
               ], eligible:ELIGIBLE.slice(0,4),
               totals:{ in_progress:12, ready:1, redeemed_month:3, participants:5, eligible:4 } },
  // Post-innløsning + ubrukt-belønning-fra-forrige-runde. Demonstrerer BÅDE sortering (kan-hente
  // alltid øverst, selv med færre klipp) OG notat-linja: Mikkel 3/10 har ubrukt belønning → Kan
  // hente + linje, og sorteres OVER Ola 6/10. Kari 0/10 = nettopp innløst, ny runde. pct:50.
  paa_innlost:{ enabled:true, threshold:10, pct:50, count_history:true, activated_at:'2026-07-01T10:00:00Z',
               participants:[
                 { customer_id:1,  name:'Amir Haddad',   phone:'99887766', opt_in_at:'2026-07-02', stamps:10, reward_ready:true },
                 { customer_id:10, name:'Mikkel Olsen',   phone:'92223344', opt_in_at:'2026-07-03', stamps:3,  reward_ready:true },
                 { customer_id:3,  name:'Ola Nordmann',   phone:'40011223', opt_in_at:'2026-07-04', stamps:6,  reward_ready:false },
                 { customer_id:2,  name:'Kari Nordmann',  phone:'91234567', opt_in_at:'2026-07-05', stamps:0,  reward_ready:false },
               ], eligible:ELIGIBLE.slice(0,4),
               totals:{ in_progress:9, ready:2, redeemed_month:4, participants:4, eligible:4 } },
};
function router(variant) {
  return route => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const json = (obj, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')          return json(PROFILE);
    if (p === '/api/dashboard/billing/status')   return json(BILLING);
    if (p === '/api/dashboard/loyalty')          return json(LOYAL[variant]);
    if (/^\/api\/dashboard\/customers\/\d+\/loyalty$/.test(p) && req.method()==='PUT')
      return json({ customer_id:0, opt_in:true, opt_in_at:'2026-09-07T10:00:00Z', has_unused_reward:false });
    if (p === '/api/dashboard/attribution')      return json({ period:'maaned', rebooking:{count:0,revenue:0}, vervet:{count:0,revenue:0}, recovery:{count:0,revenue:0}, total:{count:0,revenue:0} });
    if (p === '/api/dashboard/momentum')         return json({ show:false });
    // /customers/recent brukes ikke lenger av lojalitet (kandidater = eligible fra /loyalty).
    // Verving kaller den fortsatt ved Vekst-last → tom liste holder den feilfri.
    const listeAktig = /images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg/.test(p);
    return json(listeAktig ? [] : {});
  };
}

const MAAL = `() => {
  const el = document.querySelector('#loyalOversikt');
  const totals = [...document.querySelectorAll('#loyalOversikt .kl-tot')].map(t =>
    (t.querySelector('.v')?.textContent||'') + ' ' + (t.querySelector('.l')?.textContent||''));
  const rows = [...document.querySelectorAll('#loyalOversikt .kl-drow')].map(r =>
    (r.querySelector('.wb-name')?.textContent||'') + ' | ' +
    (r.querySelector('.kl-count')?.textContent||'') +
    (r.querySelector('.rpill.ok') ? ' | KLAR' : ''));
  const leggWrap = document.querySelector('#loyalLeggTilWrap');
  const leggRader = [...document.querySelectorAll('#loyalLeggTil .wb-row .wb-name')].map(n => n.textContent);
  const leggMeta = [...document.querySelectorAll('#loyalLeggTil .wb-row .wb-meta')].map(n => n.textContent.trim());
  const sett = document.querySelector('#loyalSett');
  const pctSel = document.querySelector('#loyalPct');
  return {
    empty: el?.querySelector('.wb-empty')?.textContent || '',
    slaaPaa: !!document.querySelector('#loyalSlaaPaa'),
    fjernN: document.querySelectorAll('#loyalOversikt .kl-remove').length,
    totals, rows,
    settVis: sett ? !sett.hidden : false,
    terskel: document.querySelector('#loyalThreshold')?.value || '',
    pctTekst: (pctSel && pctSel.selectedIndex>=0) ? pctSel.options[pctSel.selectedIndex].textContent : '',
    leggVis: leggWrap ? !leggWrap.hidden : false,
    leggRader, leggMeta,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
}`;

// Viewport-slices: fast 320×720, scroll HELE veien ned i kortet, nummererte segmenter (01,02,…).
// Faste barer (topp-nav sticky, bunn-nav, hjelpe-pill) nøytraliseres så de ikke dekker hver slice.
const VIEW_H = 720, STEP = 680;   // 40px overlapp mellom slices så ingenting faller mellom to bilder
const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;
// Rydd gamle loyal-*.png (både gamle element-shots og forrige slice-runde) så bare denne runden ligger igjen.
for (const f of fs.readdirSync(OUT)) { if (/^loyal-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const browser = await chromium.launch();
const rad = [];
for (const variant of ['av','paa_tom','paa_liste','paa_innlost']) {
  for (const tema of ['dark','light']) {
    const page = await browser.newPage({ viewport:{ width:320, height:VIEW_H }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch(e){} }, tema);
    await page.route('**/api/**', router(variant));
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.addStyleTag({ content: SKJUL_BARER });
    await page.evaluate(() => switchPanel('vekst'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const h=document.querySelector('#accLoyal .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click(); });
    await page.waitForTimeout(350);
    const m = await page.evaluate(eval(MAAL));
    const box = await page.evaluate(() => {
      const el=document.querySelector('#accLoyal'); const r=el.getBoundingClientRect();
      return { top:r.top+window.scrollY, height:r.height, pageH:document.documentElement.scrollHeight };
    });
    const segs = Math.max(1, Math.ceil(box.height / STEP));
    for (let i=0;i<segs;i++){
      let y = box.top + i*STEP;
      y = Math.min(y, Math.max(0, box.pageH - VIEW_H));   // aldri scroll forbi sidebunn
      await page.evaluate(sy => window.scrollTo(0, sy), y);
      await page.waitForTimeout(140);
      const nn = String(i+1).padStart(2,'0');
      await page.screenshot({ path:`${OUT}/loyal-${variant}-${tema}-${nn}.png`, fullPage:false });
    }
    rad.push({ variant, tema, segs, sett:m.settVis, terskel:m.terskel, belonn:m.pctTekst,
      delt:m.rows.length, fjern:m.fjernN, leggVis:m.leggVis, kand:m.leggRader.length, leggMeta:m.leggMeta,
      slaaPaa:m.slaaPaa, overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
    await page.close();
  }
}
console.table(rad);
console.log('\nJS-feil totalt:', rad.filter(r=>r.jsfeil!=='ingen').length);
console.log('Overflow != 0 (skal være 0):', rad.filter(r=>r.overflow!==0).map(r=>`${r.variant}/${r.tema}/${r.bredde}=${r.overflow}`).join(' ') || 'ingen');
// Kandidater = eligible fra /loyalty (backend-filtrert). paa_liste: 4 vist (av 4), paa_tom: 4 vist (av 5, «Vis flere»).
{
  console.log('paa_liste kandidater vist (eligible=4):', rad.find(r=>r.variant==='paa_liste')?.kand);
  console.log('paa_tom kandidater vist (eligible=5, 4 + «Vis flere»):', rad.find(r=>r.variant==='paa_tom')?.kand);
  console.log('av «legg til» skjult (skal være false):', rad.find(r=>r.variant==='av')?.leggVis);
  console.log('kandidat-meta (completed_count + ferskhet):', JSON.stringify(rad.find(r=>r.variant==='paa_liste' && r.tema==='dark')?.leggMeta));
}

console.log('paa_innlost belønning (skal være «50 % rabatt»):', rad.find(r=>r.variant==='paa_innlost')?.belonn);
console.log('paa_liste belønning (skal være «Gratis klipp»):', rad.find(r=>r.variant==='paa_liste')?.belonn);

// Rekkefølge-sjekk: kan-hente øverst, så flest stamps. paa_innlost viser 10/10 (Kan hente) øverst
// og 0/10 (fersk runde etter innløsning) nederst i samme liste.
for (const variant of ['paa_liste','paa_innlost']) {
  const page = await browser.newPage({ viewport:{ width:375, height:1200 }, deviceScaleFactor:2 });
  await page.route('**/api/**', router(variant));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(900);
  await page.evaluate(() => { const h=document.querySelector('#accLoyal .acc-head'); if(h) h.click(); });
  await page.waitForTimeout(300);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#loyalOversikt .kl-drow')].map(r => ({
    navn:r.querySelector('.wb-name')?.textContent, teller:r.querySelector('.kl-count')?.textContent,
    klar:!!r.querySelector('.rpill.ok'), note:r.querySelector('.kl-note')?.textContent||'' })));
  console.log(`\n=== Rekkefølge (${variant}) — kan-hente først, så flest klipp ===`);
  rows.forEach((r,i)=>console.log(`  ${i+1}. ${r.navn}  ${r.teller}  ${r.klar?'[Kan hente]':''} ${r.note?('· '+r.note):''}`));
  await page.close();
}

// ── Innstillinger med selectene «åpne» ──────────────────────────────────────────────────────────
// Native <select>-dropdown kan ikke screenshotes åpen i Playwright (OS-tegnet). size=antall
// alternativer gjør den til en listbox der ALLE alternativene vises inline. 320, mørk.
{
  const page = await browser.newPage({ viewport:{ width:320, height:1400 }, deviceScaleFactor:2 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await apnAccLoyal(page,'paa_liste','dark');
  const antT = await page.evaluate(()=>document.querySelector('#loyalThreshold').options.length);
  const pctInfo = await page.evaluate(()=>{ const s=document.querySelector('#loyalPct');
    return { labels:[...s.options].map(o=>o.textContent), valgt:s.options[s.selectedIndex]?.textContent }; });
  // LUKKET tilstand FØRST — slik barbereren faktisk ser den (vanlig <select>, ingen size satt).
  // De åpne listbox-variantene under er KUN render-triks for å vise alle alternativene i ett bilde.
  await page.locator('#loyalSett').screenshot({ path:`${OUT}/loyal-innst-lukket-dark.png` });
  await page.evaluate(()=>{ const s=document.querySelector('#loyalThreshold'); s.size=s.options.length; });
  await page.waitForTimeout(150);
  await page.locator('#loyalSett').screenshot({ path:`${OUT}/loyal-terskelvalg-dark.png` });
  await page.evaluate(()=>{ document.querySelector('#loyalThreshold').size=0; const s=document.querySelector('#loyalPct'); s.size=s.options.length; });
  await page.waitForTimeout(150);
  await page.locator('#loyalSett').screenshot({ path:`${OUT}/loyal-belonningvalg-dark.png` });
  console.log(`\n=== Select-alternativer (åpne) ===`);
  console.log(`  terskel=${antT} (5–20 ⇒ 16)`);
  console.log(`  belønning (skal være 4: 25/50/75/Gratis klipp): ${JSON.stringify(pctInfo.labels)} · default valgt="${pctInfo.valgt}"`);
  console.log(`  LUKKET (som barbereren ser den): ${OUT}\\loyal-innst-lukket-dark.png`);
  console.log(`  ${OUT}\\loyal-terskelvalg-dark.png`);
  console.log(`  ${OUT}\\loyal-belonningvalg-dark.png`);
  await page.close();
}
// Lagret verdi UTENFOR de fire (pct:30) → skal vises som EGET alternativ, ikke snappet til nærmeste.
{
  const page = await browser.newPage({ viewport:{ width:320, height:900 }, deviceScaleFactor:2 });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.addInitScript(()=>{ try{localStorage.setItem('bhq-theme','dark');}catch(e){} });
  await page.route('**/api/**', route=>{
    const p=new URL(route.request().url()).pathname;
    const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/profile')return j(PROFILE);
    if(p==='/api/dashboard/billing/status')return j(BILLING);
    if(p==='/api/dashboard/loyalty')return j({enabled:true,threshold:10,pct:30,count_history:false,participants:[],eligible:[],totals:{in_progress:0,ready:0,redeemed_month:0,participants:0,eligible:0}});
    return j(/images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg|stats|attribution|momentum/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.evaluate(()=>switchPanel('vekst')); await page.waitForTimeout(900);
  await page.evaluate(()=>{const h=document.querySelector('#accLoyal .acc-head'); if(h)h.click();}); await page.waitForTimeout(250);
  const info = await page.evaluate(()=>{ const s=document.querySelector('#loyalPct');
    return { labels:[...s.options].map(o=>o.textContent), valgt:s.options[s.selectedIndex]?.textContent }; });
  console.log(`  lagret utenfor settet (pct:30): ${JSON.stringify(info.labels)} · valgt="${info.valgt}" (skal ha «30 % rabatt» som eget, valgt) | JS-feil:${errs.length}`);
  await page.close();
}

// ── Interaktive tilstander: Fjern-bekreftelse + av-bryter-advarsel (320, begge temaer) ──────────
async function apnAccLoyal(page, variant, tema){
  await page.addInitScript(t=>{try{localStorage.setItem('bhq-theme',t);}catch(e){}},tema);
  await page.route('**/api/**', router(variant));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, {waitUntil:'networkidle'});
  await page.addStyleTag({content:SKJUL_BARER});
  await page.evaluate(()=>switchPanel('vekst'));
  await page.waitForTimeout(900);
  await page.evaluate(()=>{const h=document.querySelector('#accLoyal .acc-head'); if(h)h.click();});
  await page.waitForTimeout(300);
}
console.log('\n=== Interaktive tilstander ===');
for (const tema of ['dark','light']) {
  // Fjern-bekreftelse: skal SI hva som skjer, ikke bare «Bekreft».
  {
    const page = await browser.newPage({ viewport:{width:320,height:720}, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await apnAccLoyal(page,'paa_liste',tema);
    // Klikk fjern-ikonet på FØRSTE rad (Amir, Kan hente) → pillen skal fortsatt stå.
    await page.evaluate(()=>{ document.querySelector('#loyalOversikt .kl-drow .kl-remove')?.click(); });
    await page.waitForTimeout(200);
    const info = await page.evaluate(()=>{ const row=document.querySelector('#loyalOversikt .kl-drow');
      return { txt: row?.querySelector('.kl-confirm-txt')?.textContent||'', pill: !!row?.querySelector('.rpill.ok') }; });
    await page.evaluate(()=>{ const c=document.querySelector('#loyalOversikt .wb-card'); if(c)c.scrollIntoView({block:'center'}); });
    await page.waitForTimeout(150);
    await page.screenshot({path:`${OUT}/loyal-zfjern-${tema}-01.png`, fullPage:false});
    console.log(`  Fjern-bekreftelse (${tema}): ${JSON.stringify(info.txt)} | pill står: ${info.pill} | JS-feil:${errs.length}`);
    await page.close();
  }
  // Av-bryter-advarsel: forsøk å slå av med uthentede belønninger → advarsel, bryter blir PÅ.
  {
    const page = await browser.newPage({ viewport:{width:320,height:720}, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await apnAccLoyal(page,'paa_liste',tema);
    await page.evaluate(()=>{ const t=document.querySelector('#tog-loyal'); t.checked=false; t.dispatchEvent(new Event('change',{bubbles:true})); });
    await page.waitForTimeout(200);
    const w = await page.evaluate(()=>({ vis: !document.querySelector('#loyalOffWarn')?.hidden,
      txt: document.querySelector('#loyalOffWarn .kl-warn-txt')?.textContent||'',
      paa: !!document.querySelector('#tog-loyal')?.checked }));
    await page.evaluate(()=>{ const s=document.querySelector('#loyalSett'); if(s)s.scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({path:`${OUT}/loyal-zavvarsel-${tema}-01.png`, fullPage:false});
    console.log(`  Av-advarsel (${tema}): synlig=${w.vis} bryterPå=${w.paa} ${JSON.stringify(w.txt)} | JS-feil:${errs.length}`);
    await page.close();
  }
  // Endrings-bekreftelse: endre belønning MENS kunder samler → linje før lagring, må bekreftes.
  {
    const page = await browser.newPage({ viewport:{width:320,height:720}, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await apnAccLoyal(page,'paa_liste',tema);
    await page.evaluate(()=>{ const s=document.querySelector('#loyalPct'); s.value='50'; s.dispatchEvent(new Event('change',{bubbles:true})); });
    await page.waitForTimeout(200);
    const w = await page.evaluate(()=>({ vis: !document.querySelector('#loyalSaveWarn')?.hidden,
      txt: document.querySelector('#loyalSaveWarn .kl-warn-txt')?.textContent||'',
      pct: document.querySelector('#loyalPct')?.value }));
    await page.evaluate(()=>{ const s=document.querySelector('#loyalSett'); if(s)s.scrollIntoView({block:'start'}); });
    await page.waitForTimeout(150);
    await page.screenshot({path:`${OUT}/loyal-zendring-${tema}-01.png`, fullPage:false});
    console.log(`  Endrings-bekreftelse (${tema}): synlig=${w.vis} pct=${w.pct} ${JSON.stringify(w.txt)} | JS-feil:${errs.length}`);
    await page.close();
  }
}

// ── Innstillings-seksjonen (rydding): etikett-kontrast, rad-avstand, stabling <400, hjelpetekst ──
// Screenshotter #loyalSett @320 og 375, mørk og lys. Måler at etiketten = overskriftsfargen (--ink).
console.log('\n=== Innstillinger (rydding) ===');
for (const tema of ['dark','light']) {
  for (const bredde of [320,375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await apnAccLoyal(page,'paa_liste',tema);
    const alle = await page.evaluate(()=> [...document.querySelectorAll('#loyalSett .seg-lead')].map(el=>({
      t: el.textContent.trim().slice(0,22), farge: getComputedStyle(el).color, tag: el.tagName })));
    console.log(`  [${tema}/${bredde}] etiketter:`, alle.map(a=>`${a.tag}"${a.t}"=${a.farge}`).join('  '));
    const c = await page.evaluate(()=>{
      const leads=[...document.querySelectorAll('#loyalSett .seg-line')];
      // Vertikal avstand mellom radene: topp-til-topp for de fire seg-line-radene.
      const tops=leads.map(el=>el.getBoundingClientRect().top);
      const gaps=tops.slice(1).map((t,i)=>Math.round(t-tops[i]));
      return {
        label:   getComputedStyle(document.querySelector('#loyalSett .seg-lead')).color,
        heading: getComputedStyle(document.querySelector('#loyalOversikt .block-h')).color,
        gaps,
        note:    document.querySelector('#loyalHistoryNote')?.textContent||'',
        selW:    [...document.querySelectorAll('#loyalSett .kl-select')].map(s=>Math.round(s.getBoundingClientRect().width)),
      };
    });
    await page.locator('#loyalSett').screenshot({ path:`${OUT}/loyal-innstillinger-${tema}-${bredde}.png` });
    console.log(`  ${tema}/${bredde}: etikett==overskrift:${c.label===c.heading} · radavstand(topp-topp):${JSON.stringify(c.gaps)} · selectbredder:${JSON.stringify(c.selW)} | JS-feil:${errs.length}`);
    console.log(`     ${OUT}\\loyal-innstillinger-${tema}-${bredde}.png`);
    await page.close();
  }
}
console.log('  hjelpetekst (av): "Slås den på, …" — betinget, beskriver ikke en tilstand som ikke gjelder.');

// ── STEG 3: pill på booking-rader (Oversikt › Kommende bookinger) ────────────────────────────────
// «Lojalitet · Gratis klipp» (pct 100) / «Lojalitet · X %» (ellers). Verving-pill til sammenligning.
console.log('\n=== STEG 3: booking-pill ===');
{
  const iso = h => new Date(Date.now()+h*3600000).toISOString();
  const BOOKINGS = [
    { id:1, name:'Ola Nordmann',  service:'Herreklipp', start:iso(3), status:'booket', referral_discount:{ rolle:'lojalitet', pct:100 } },
    { id:2, name:'Kari Nordmann', service:'Skin fade',  start:iso(5), status:'booket', referral_discount:{ rolle:'lojalitet', pct:50 } },
    { id:3, name:'Petter Hansen', service:'Klipp',      start:iso(7), status:'booket', referral_discount:{ rolle:'verver',   pct:20 } },
  ];
  for (const tema of ['dark','light']) {
    const page = await browser.newPage({ viewport:{ width:320, height:900 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    await page.addInitScript(t=>{try{localStorage.setItem('bhq-theme',t);}catch(e){}},tema);
    await page.route('**/api/**', route=>{
      const p=new URL(route.request().url()).pathname;
      const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
      if(p==='/api/dashboard/profile')return j(PROFILE);
      if(p==='/api/dashboard/billing/status')return j(BILLING);
      if(p==='/api/dashboard/bookings')return j(BOOKINGS);
      return j(/images|recent|services|hours|winback|referrals|rebooking|sms-logg|stats|attribution|momentum|loyalty/.test(p)?[]:{});
    });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
    await page.addStyleTag({content:SKJUL_BARER});
    await page.waitForTimeout(900);   // Oversikt er standardpanel → Kommende laster ved init
    const pills = await page.evaluate(()=>[...document.querySelectorAll('#upcomingList .rpill')].map(p=>p.textContent.trim()));
    await page.evaluate(()=>{const e=document.querySelector('#upcomingList'); if(e)e.scrollIntoView({block:'start'});});
    await page.waitForTimeout(150);
    await page.screenshot({path:`${OUT}/loyal-pill-${tema}-01.png`, fullPage:false});
    console.log(`  Kommende-pills (${tema}): ${JSON.stringify(pills)} | JS-feil:${errs.length}`);
    await page.close();
  }
}

// ── STEG 4: Basis — LETT skjold på ALLE skjoldede kort, INGEN datahenting (guard-verifisering) ────
// Fullside-screenshot av Vekst (basis): attribusjon + rebooking + vinn tilbake + verving + lojalitet,
// alle med det lettere skjoldet. Verifiserer at kundedata-loaderne IKKE henter i basis, at lojalitet
// er skjoldet UTEN «Eksempel»-merke, og at «Drevet av»/attribusjon beholder sitt eksempel-merke.
console.log('\n=== STEG 4: Basis — lett skjold, ingen datahenting ===');
{
  const BILLING_BASIS = { subscription_status:'active', page_status:'live', plan:'basis',
    effective_plan:'basis', effective_plan_grunn:'subscription', trial_days_left:null,
    nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null };
  for (const tema of ['dark','light']) {
    const page = await browser.newPage({ viewport:{ width:320, height:900 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    const fetched={loyalty:false,winback:false,referrals:false,recent:false,settings:false};
    await page.addInitScript(t=>{try{localStorage.setItem('bhq-theme',t);}catch(e){}},tema);
    await page.route('**/api/**', route=>{
      const p=new URL(route.request().url()).pathname;
      const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
      if(p==='/api/dashboard/profile')return j(PROFILE);
      if(p==='/api/dashboard/billing/status')return j(BILLING_BASIS);
      if(p==='/api/dashboard/loyalty'){fetched.loyalty=true;return j({});}       // skal ALDRI treffes i basis
      if(p==='/api/dashboard/winback'){fetched.winback=true;return j({no_show:[],lapsed:[]});}
      if(p==='/api/dashboard/referrals'){fetched.referrals=true;return j([]);}
      if(p==='/api/dashboard/customers/recent'){fetched.recent=true;return j({customers:[]});}
      if(p==='/api/dashboard/settings'){fetched.settings=true;return j({});}      // påminnelse (IKKE låst) → forventet TRUE
      return j(/images|bookings|services|hours|sms-logg|stats|attribution|momentum/.test(p)?[]:{});
    });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
    await page.addStyleTag({content:SKJUL_BARER});
    await page.evaluate(()=>switchPanel('vekst'));
    await page.waitForTimeout(1400);
    const m = await page.evaluate(()=>({
      skjoldede: document.querySelectorAll('#vekst .skjold-vert').length,
      loyalSkjold: !!document.querySelector('#accLoyal > .skjold'),
      loyalMerke: document.querySelector('#accLoyal > .eksempel-merke')?.textContent || '(ingen)',
      attrMerke: document.querySelector('#attrKort > .eksempel-merke')?.textContent || '(ingen)',
      seLenker: document.querySelectorAll('#vekst .skjold .skjold-lenke').length,
    }));
    await page.screenshot({path:`${OUT}/loyal-skjold-basis-${tema}.png`, fullPage:true});
    console.log(`  Basis (${tema}): skjoldede=${m.skjoldede} loyalSkjold=${m.loyalSkjold} loyalMerke=${m.loyalMerke} attrMerke=${m.attrMerke} seLenker=${m.seLenker}`);
    console.log(`     datahenting: loyalty=${fetched.loyalty} winback=${fetched.winback} referrals=${fetched.referrals} recent=${fetched.recent} settings=${fetched.settings}(påminnelse, forventet) | JS-feil:${errs.length}`);
    console.log(`     ${OUT}\\loyal-skjold-basis-${tema}.png`);
    await page.close();
  }
}

await browser.close(); server.close();
