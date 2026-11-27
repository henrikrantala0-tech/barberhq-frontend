// tools/render/vekst-liste.mjs — Vekst-fanen fra bokser til liste (Henrik 17.11.2026).
//
// Kilde: vekst-liste-aktiv / vekst-liste-gratis (.dc.html). Vakter:
//   - Ingen bokser utenom KPI-boksene (#vekstStats): rader har ingen bakgrunn/ramme, bare hårlinje under.
//   - Etiketter DEL / AUTOMATIKK / PERSONLIG (11.5/600/.08em/versaler/dempet), 32px mellom seksjonene. DEL («Lag story»)
//     står rett under diagrammet siden 27.11.2026 (Henrik) — rekkefølgen vaktes også av forste-booking.mjs.
//   - Rader: navn 15/600, beskrivelse 13/400 dempet/1.45, 16px vertikal padding.
//   - Høyre side: bryter 46×28 (Automatikk), chevron (Personlig, antall foran på Vinn tilbake), «Lag story» (Del).
//   - Gratis: lås + «Vekst» (ingen blå pille), «Kjøp SMS for å sende påminnelser» + pil-ikon som blå lenke.
//   - ingen «Hentet inn» (fjernet 27.11.2026 — tallene står på Konto), ingen gammel velger (#attrPeriod), ingen doble id-er.
//   - Nye tekster: Vinn tilbake / Lojalitet / Ledige timer.
// Skjermbilder → .render-ut/vekst-liste/: hele fanen (Gratis/Vekst × 320/375 × mørk/lys) + hver utfoldet rad @375 mørk
// (Vekst) og Vinn tilbake utfoldet på Gratis. Alt /api/** mockes.
//   node tools/render/vekst-liste.mjs   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/vekst-liste');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const NAA = new Date('2026-11-17T09:10:00Z');

const MONTHS = [ { ym:'2026-06', customers:18 }, { ym:'2026-07', customers:24 }, { ym:'2026-08', customers:31 }, { ym:'2026-09', customers:27 }, { ym:'2026-10', customers:35 }, { ym:'2026-11', customers:22 } ];
const STATS = { daily:[], months_with_data:[], months:MONTHS, record_customers_month:{ ym:'2026-10', customers:35 }, completed_all_time:412 };
const HENTET = { total:{count:14,revenue:4850}, rebooking:{count:8,revenue:2300,aktivert:true}, vinnTilbake:{count:4,revenue:1550}, vervet:{count:2,revenue:1000} };
const PAAVEI = { rebooking:{naar_vindu_30d:2,med_samtykke:1}, winback:{ foerste_passerer_60:'2026-12-03', passerer_innen_30d:5, borte:3, no_show:2 } };
const kunde = (id, name, extra) => ({ customer_id:id, name, phone:'4790000'+String(id).padStart(3,'0'), ...extra });
const WINBACK = { lapsed_threshold:60, group:'alle',
  no_show:[ kunde(1,'Jonas Berg',{ reason:'no_show', days_since:2, last_booking_at:'2026-11-15T10:00:00Z', last_service:'Fade', completed_count:6 }),
            kunde(2,'Emre Yilmaz',{ reason:'no_show', days_since:9, last_booking_at:'2026-11-08T10:00:00Z', last_service:'Skin fade', completed_count:3 }) ],
  lapsed:[ kunde(3,'Theo Nilsen',{ reason:'lapsed', days_since:74, last_booking_at:'2026-09-04T10:00:00Z', last_service:'Klipp', completed_count:9 }),
           kunde(4,'Karim Haddad',{ reason:'lapsed', days_since:96, last_booking_at:'2026-08-13T10:00:00Z', last_service:'Fade', completed_count:4 }),
           kunde(5,'Sindre Holm',{ reason:'lapsed', days_since:121, last_booking_at:'2026-07-19T10:00:00Z', last_service:'Klipp + skjegg', completed_count:2 }) ] };
const RECENT = { limit:100, customers:[ kunde(10,'Magnus Lie',{ referral_code:'MAGNUS1', last_visit_at:'2026-11-14T10:00:00Z', last_service:'Klipp' }), kunde(11,'Ola Nordmann',{ referral_code:'OLA22', last_visit_at:'2026-11-10T10:00:00Z', last_service:'Fade' }) ] };
const LOYAL = { enabled:true, threshold:10, pct:100, count_history:false, activated_at:'2026-09-01T00:00:00Z',
  participants:[ kunde(20,'Jonas Berg',{ opt_in_at:'2026-09-02', stamps:7, reward_ready:false }), kunde(21,'Theo Nilsen',{ opt_in_at:'2026-09-03', stamps:10, reward_ready:true }) ],
  eligible:[ kunde(22,'Emre Yilmaz',{ last_visit:'2026-11-08', completed_count:3 }) ], totals:{ in_progress:1, ready:1, redeemed_month:2, participants:2, eligible:1 } };
const SETTINGS = { sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35, effektivt_interval_days:35, referral_reward_recipient:'begge', referral_discount_pct:15, payment_methods:[] };

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];

async function aapne({ plan, bredde, tema }) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(NAA);
  await page.addInitScript(tm => { try { localStorage.setItem('bhq-theme', tm); } catch(e){} }, tema);
  await page.route('https://api.trybarberhq.com/**', r => new URL(r.request().url()).pathname.startsWith('/api/') ? r.fallback() : r.abort());
  await page.route('**/api/**', route => { const u = new URL(route.request().url()), p = u.pathname;
    const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (route.request().method() !== 'GET') return J({ ok:true });
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', slug:'grand-barber' });
    if (p === '/api/dashboard/billing/status') return J(plan==='vekst'
      ? { effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status:'live', needs_attention:false }
      : { effective_plan:'basis', effective_plan_grunn:'gratis', page_status:'live', needs_attention:false, sms_pakke_kan_kjopes:true, sms_saldo:0, sms_paaminnelser_sendes:false });
    if (p === '/api/dashboard/stats') return J(STATS);
    if (p === '/api/dashboard/settings') return J(plan==='vekst' ? SETTINGS : { ...SETTINGS, sms_paaminnelse_enabled:false, sms_rebooking_enabled:false });
    if (p === '/api/dashboard/attribution') return J({ paaVei:PAAVEI, hentetInn: plan==='vekst' ? HENTET : undefined });
    if (p === '/api/dashboard/winback') return J(WINBACK);
    if (p === '/api/dashboard/customers/recent') return J(RECENT);
    if (p === '/api/dashboard/referrals') return J([]);
    if (p === '/api/dashboard/loyalty') return J(LOYAL);
    if (p === '/api/dashboard/momentum') return J({ show:false });
    // Ulik tekst per type, samme form som prod-svaret (buildPaaminnelseBody / buildRebookingBody i backend).
    // Før ga mocken påminnelsesteksten for begge, så Rebooking-forhåndsvisningen så feil ut i testen.
    if (p === '/api/dashboard/sms-preview') { const k = u.searchParams.get('kind');
      return k==='rebooking'
        ? J({ kind:k, body:'Hei Jonas! Klar for ny time hos Grand Barber? trybarberhq.com/grand-barber\n\nAvmeld: trybarberhq.com/a/EKSEMPEL01', tegn:112, segmenter:1, gsm7:true, transaksjonell:false })
        : J({ kind:k, body:'Hei Jonas! Minner om timen din hos Grand Barber i morgen kl 14:00.', tegn:66, segmenter:1, gsm7:true, transaksjonell:true }); }
    if (p === '/api/dashboard/aktivering') return J({ har_booking:true });
    return J(/images|bookings|services|hours|customers/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForSelector('#accRebook .acc-head', { timeout:10000 });
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.scrollTo(0,0); return document.fonts && document.fonts.ready; });
  return { ctx, page, errs };
}
const MAAL = () => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const cs = (e, p) => e ? getComputedStyle(e)[p] : null;
  const rader = qa('#vekst .acc');
  const boksRader = rader.filter(a => { const c = getComputedStyle(a); return c.backgroundColor!=='rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth)>0 || parseFloat(c.borderLeftWidth)>0; }).map(a=>a.id);
  const etiketter = qa('#vekst .vk-etikett').map(e => e.innerText);
  const sek = qa('#vekst .vk-sek').map(e => Math.round(parseFloat(getComputedStyle(e).marginTop)));
  const tittel = q('#accVerv .acc-title'), sub = q('#accVerv .acc-sub');
  const sw = q('#accRebook .acc-sw'); const swR = sw && sw.getBoundingClientRect();
  const dobbeltId = (() => { const ids = qa('[id]').map(e => e.id); return ids.filter((x,i) => ids.indexOf(x)!==i); })();
  return { boksRader, etiketter, sek, idag: null,
    tittel: cs(tittel,'fontSize')+' '+cs(tittel,'fontWeight'), sub: cs(sub,'fontSize')+' '+cs(sub,'fontWeight')+' '+cs(sub,'lineHeight'),
    radPad: cs(q('#accVerv .acc-head'),'paddingTop'), hairline: cs(q('#accVerv'),'borderBottomWidth'),
    bryter: swR && getComputedStyle(sw).display!=='none' ? Math.round(swR.width)+'×'+Math.round(swR.height) : 'skjult',
    laas: qa('#vekst .laas-merke').map(m => m.closest('.acc').id), blaaPille: qa('#vekst .laas-badge').length,
    teller: (q('#wbBadge')||{}).hidden===false ? q('#wbBadge').textContent : null,
    kjop: q('#paamKjop') && !q('#paamKjop').hidden ? q('#paamKjop').innerText.trim() : null,
    kjopIkon: q('#paamKjop use') ? q('#paamKjop use').getAttribute('href') : null,
    kjopFarge: cs(q('#paamKjopLenke'),'color'), kjopDekor: cs(q('#paamKjopLenke'),'textDecorationLine'),
    tekster: { vinn: q('#accWinback .acc-sub').textContent, loyal: q('#accLoyal .acc-sub').textContent, story: q('#accStory').innerText.replace(/\s+/g,' ') },
    storyKnapp: (() => { const b = q('#storyOpen'); return b ? Math.round(b.getBoundingClientRect().height)+'/'+cs(b,'borderTopLeftRadius') : null; })(),
    hentet: !!q('#vekstHentet, #vkHentetH, #vkAttrPeriod') || /Hentet inn av BarberHQ/.test(q('#vekst').innerText),
    gammelVelger: !!q('#attrPeriod'), dobbeltId, kpiBoks: !!q('#vekstStats .stat') && cs(q('#vekstStats'),'borderTopWidth')!=='0px',
    overflow: document.documentElement.scrollWidth - innerWidth, info: getComputedStyle(document.documentElement).getPropertyValue('--info').trim() };
};
const rgb = h => { let m=h.replace('#',''); if (m.length===3) m=m.split('').map(c=>c+c).join(''); return `rgb(${parseInt(m.slice(0,2),16)}, ${parseInt(m.slice(2,4),16)}, ${parseInt(m.slice(4,6),16)})`; };

for (const plan of ['vekst','basis']) for (const tema of ['dark','light']) for (const bredde of [320, 375]) {
  const { ctx, page, errs } = await aapne({ plan, bredde, tema });
  const m = await page.evaluate(MAAL);
  const tag = `${plan==='vekst'?'Vekst':'Gratis'} ${tema} ${bredde}`;
  sjekk(`${tag}: ingen pageerror / overflow`, errs.length===0 && m.overflow<=0, errs.join('|').slice(0,120)+' of='+m.overflow);
  sjekk(`${tag}: ingen bokser rundt radene (KPI-boksene står)`, m.boksRader.length===0 && m.kpiBoks, JSON.stringify(m.boksRader));
  sjekk(`${tag}: etiketter DEL / AUTOMATIKK / PERSONLIG, 32px mellom seksjonene`, JSON.stringify(m.etiketter)==='["DEL","AUTOMATIKK","PERSONLIG"]' && m.sek.every(x=>x===32), JSON.stringify(m.etiketter)+' '+m.sek);
  sjekk(`${tag}: rad — navn 15/600, beskrivelse 13/400/1.45, 16px padding, hårlinje`, m.tittel==='15px 600' && m.sub==='13px 400 18.85px' && m.radPad==='16px' && m.hairline==='1px', JSON.stringify({ t:m.tittel, s:m.sub, p:m.radPad, h:m.hairline }));
  sjekk(`${tag}: ingen «Hentet inn» (fjernet 27.11.2026), ingen gammel velger, ingen doble id-er`, !m.hentet && !m.gammelVelger && m.dobbeltId.length===0, JSON.stringify(m.dobbeltId));
  sjekk(`${tag}: tekster (Vinn tilbake / Lojalitet / Ledige timer)`, m.tekster.vinn==='Kunder som ikke møtte opp, eller har vært borte lenge. En personlig melding fra deg.'
    && m.tekster.loyal==='Ett stempel per klipp. Gratis eller rabattert klipp når kortet er fullt.' && /^Ledige timer Story til Instagram eller TikTok med de neste ledige timene\. Lag story$/.test(m.tekster.story), JSON.stringify(m.tekster));
  sjekk(`${tag}: «Lag story» 40px / radius 8`, m.storyKnapp==='40/8px', m.storyKnapp);
  sjekk(`${tag}: ingen blå «Vekst»-pille`, m.blaaPille===0, m.blaaPille);
  if (plan==='vekst') {
    sjekk(`${tag}: Rebooking-bryter 46×28, ingen lås`, m.bryter==='46×28' && m.laas.length===0, m.bryter+' '+JSON.stringify(m.laas));
    sjekk(`${tag}: Vinn tilbake viser antallet (5 = borte 3 + no_show 2)`, m.teller==='5', m.teller);
  } else {
    sjekk(`${tag}: lås + «Vekst» på Rebooking, Vinn tilbake, Verving, Lojalitet (bryteren skjult)`, JSON.stringify(m.laas.sort())==='["accLoyal","accRebook","accVerv","accWinback"]' && m.bryter==='skjult', JSON.stringify(m.laas)+' '+m.bryter);
    sjekk(`${tag}: «Kjøp SMS for å sende påminnelser» (+ pil-ikon) blå, ikke understreket`, m.kjop==='Kjøp SMS for å sende påminnelser' && m.kjopIkon==='ikoner.svg#pil-h' && m.kjopFarge===rgb(m.info) && m.kjopDekor==='none', m.kjop+' '+m.kjopFarge+' '+m.kjopDekor);
  }
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width:bredde, height:h }); await page.waitForTimeout(150);
  const fil = path.join(OUT, `hel-${plan==='vekst'?'vekst':'gratis'}-${tema}-${bredde}.png`);
  await page.screenshot({ path:fil, fullPage:true }); bilder.push(fil);
  await ctx.close();
}
// Utfoldede rader @375 mørk: Vekst — Vinn tilbake, Verving, Lojalitet, SMS-påminnelse, Rebooking; Gratis — Vinn tilbake.
for (const [plan, id] of [['vekst','accWinback'],['vekst','accVerv'],['vekst','accLoyal'],['vekst','accPaam'],['vekst','accRebook'],['basis','accWinback']]) {
  const { ctx, page, errs } = await aapne({ plan, bredde:375, tema:'dark' });
  await page.click(`#${id} .acc-head`); await page.waitForTimeout(700);
  const d = await page.evaluate((id) => { const a = document.getElementById(id), h = a.querySelector('.acc-head'), b = a.querySelector('.acc-body'), chev = a.querySelector('.acc-chev');
    const bokser = [...b.querySelectorAll('*')].filter(e => { if (!e.offsetParent) return false; if (e.matches('input,select,textarea,button,.wb-phone,.rpill,.sw,.sl,.bubble,.sms-bubble,[class*="preview"],[class*="boble"],.kl-tel')) return false; const c = getComputedStyle(e);
      return (parseFloat(c.borderTopWidth)>0 && parseFloat(c.borderLeftWidth)>0 && parseFloat(c.borderRightWidth)>0) || (c.backgroundColor!=='rgba(0, 0, 0, 0)' && e.getBoundingClientRect().height>30 && !e.closest('button')); })
      .map(e => e.tagName.toLowerCase()+'.'+(typeof e.className==='string'?e.className.split(' ').join('.'):''));
    return { aapen:h.getAttribute('aria-expanded')==='true' && !b.hidden, rotert:getComputedStyle(chev).transform!=='none', bokser, bunn:getComputedStyle(b).paddingBottom };
  }, id);
  const tag = `utfoldet ${plan==='vekst'?'Vekst':'Gratis'} ${id}`;
  sjekk(`${tag}: åpen, chevron rotert, 16px bunn`, d.aapen && d.rotert && d.bunn==='16px', JSON.stringify(d));
  sjekk(`${tag}: ingen bokser/rammer inni (bortsett fra felt/knapper/forhåndsvisning)`, d.bokser.length===0, d.bokser.slice(0,8).join(', '));
  sjekk(`${tag}: ingen pageerror`, errs.length===0, errs.join('|').slice(0,120));
  const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top + scrollY, id);
  const bunn = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().bottom + scrollY, id);
  await page.setViewportSize({ width:375, height:Math.ceil(bunn)+40 }); await page.waitForTimeout(150);
  const fil = path.join(OUT, `utfoldet-${plan==='vekst'?'vekst':'gratis'}-${id}-dark-375.png`);
  await page.screenshot({ path:fil, fullPage:true, clip:{ x:0, y:Math.max(0,top-56), width:375, height:(bunn-top)+80 } }); bilder.push(fil);   // fullPage: clip i side-koordinater (klikket kan ha scrollet)
  await ctx.close();
}

// Rebooking utfoldet @320/375 (Vekst, mørk): forhåndsvisningen skal vise REBOOKING-teksten, ikke påminnelsen,
// og forklaringslinja for ikke-transaksjonell SMS. SMS-påminnelsen sjekkes motsatt vei.
for (const bredde of [320, 375]) {
  const { ctx, page, errs } = await aapne({ plan:'vekst', bredde, tema:'dark' });
  await page.click('#accRebook .acc-head'); await page.click('#accPaam .acc-head'); await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ rb: document.querySelector('#rebookPreview').innerText.replace(/\s+/g,' '),
    pm: document.querySelector('#paamPreview').innerText.replace(/\s+/g,' '), of: document.documentElement.scrollWidth - innerWidth }));
  sjekk(`Rebooking utfoldet ${bredde}: rebooking-tekst + samtykke-linje, ikke påminnelsen`,
    /Klar for ny time hos Grand Barber\?/.test(t.rb) && /Avmeld:/.test(t.rb) && /samtykket/.test(t.rb) && !/Minner om timen/.test(t.rb), t.rb);
  sjekk(`SMS-påminnelse utfoldet ${bredde}: påminnelse-tekst, ikke rebooking`, /Minner om timen/.test(t.pm) && !/Klar for ny time/.test(t.pm) && /krever ikke samtykke/.test(t.pm), t.pm);
  sjekk(`Rebooking utfoldet ${bredde}: ingen pageerror / overflow`, errs.length===0 && t.of<=0, errs.join('|').slice(0,120)+' of='+t.of);
  const r = await page.evaluate(() => { const a = document.getElementById('accRebook').getBoundingClientRect(); return { top:a.top+scrollY, bunn:a.bottom+scrollY }; });
  await page.setViewportSize({ width:bredde, height:Math.ceil(r.bunn)+40 }); await page.waitForTimeout(150);
  const fil = path.join(OUT, `rebooking-preview-vekst-dark-${bredde}.png`);
  await page.screenshot({ path:fil, fullPage:true, clip:{ x:0, y:Math.max(0,r.top-56), width:bredde, height:(r.bunn-r.top)+80 } }); bilder.push(fil);
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) if (!s.ok) console.log('✗ '+s.navn+'  — '+s.detalj);
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
