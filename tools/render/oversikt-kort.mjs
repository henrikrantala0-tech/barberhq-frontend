// tools/render/oversikt-kort.mjs — de midlertidige kortene på Oversikt i ny stil (Henrik 17.11.2026).
//
// Kortene: hjemskjerm-kortet (.hs-kort), «Fullfør siden» (.dv2-fullfor) og SMS-tilbudet (.sms-tilbud). «Få din første
// booking» er ikke kort lenger (rammefri seksjon 27.11.2026 — vaktes av forste-booking.mjs), men står i K1-bildet. Funksjon og synlighetsregler er uendret — bare stilen:
//   boks: --surface, 1px --ov-seg-line, radius 12, padding 18, ingen skygge · tittel 15/600/-0.01em ·
//   brødtekst 13.5/400 --mut/1.5 · knapper 46px/r8 (primær = ink-fyll) · hjemskjerm: ÉN tekstlinje (ingen dobbeltekst).
// Kortene utelukker hverandre delvis (hjemskjerm venter på «første booking», «Fullfør siden» krever upublisert side),
// så de tegnes i fire tilstander:
//   K1 første booking + SMS-tilbud (live, Gratis) · K2 hjemskjerm iPhone · K3 hjemskjerm Android (Installer) · K4 Fullfør siden
// Skriver også en VEKT-KARTLEGGING av Oversikt (header + panel + bunnmeny): hver font-weight med eksempler. Den feiler
// ikke testen — avvik fra regelen (800 tall, 700 navn, 600 titler/etiketter/radnavn, 500/400 resten) listes for Henrik.
// Alt /api/** mockes. Skjermbilder → .render-ut/oversikt-kort/ (320/375 × mørk/lys).
//   node tools/render/oversikt-kort.mjs   (exit 1 ved avvik i kort-stilen)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/oversikt-kort');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const NAA = new Date('2026-11-17T09:10:00Z');
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const bk = (id,name,service,z,min) => { const s=new Date(z); return { id,name,service,start:s.toISOString(),end:new Date(s.getTime()+min*60000).toISOString(),status:'bekreftet' }; };
const BOOK = [ bk(1,'Jonas Berg','Fade','2026-11-17T10:30:00Z',40), bk(2,'Karim Haddad','Fade','2026-11-18T09:00:00Z',40) ];

const TILSTANDER = {
  'K1-forste-booking-og-sms': { plan:'basis', status:'live', aktivering:{ har_booking:false, steg:{} }, ekstra:{ sms_pakke_kan_kjopes:true, sms_paaminnelser_sendes:false, sms_saldo:0 }, kort:['#smsTilbud'] },
  'K2-hjemskjerm-iphone':     { plan:'vekst', status:'live', aktivering:{ har_booking:true }, ua:UA_IPHONE, kort:['#hsKort'] },
  'K3-hjemskjerm-android':    { plan:'vekst', status:'live', aktivering:{ har_booking:true }, ua:UA_ANDROID, installPrompt:true, kort:['#hsKort'] },
  'K4-fullfor-siden':         { plan:'basis', status:'forhandsvist', aktivering:{ har_booking:false }, ekstra:{ sidemal:'v2' }, kort:['#dv2Fullfor'] },
};

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = []; const vekter = new Map();   // vekt → Map(beskrivelse → eksempeltekst)

async function aapne(id, { bredde, tema }) {
  const T = TILSTANDER[id];
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2, reducedMotion:'reduce', userAgent:T.ua, isMobile:!!T.ua, hasTouch:!!T.ua });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(NAA);
  await page.addInitScript((tm) => { try { localStorage.setItem('bhq-theme', tm); localStorage.removeItem('bhq-hjemskjerm-skjult'); } catch(e){} }, tema);
  await page.route('https://api.trybarberhq.com/**', r => new URL(r.request().url()).pathname.startsWith('/api/') ? r.fallback() : r.abort());
  await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname;
    const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (route.request().method() !== 'GET') return J({ ok:true });
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'test@example.no', slug:'grand-barber' });
    if (p === '/api/dashboard/billing/status') return J({ effective_plan:T.plan, effective_plan_grunn:T.plan==='vekst'?'subscription':'gratis', subscription_status:T.plan==='vekst'?'active':null,
      plan:T.plan==='vekst'?'vekst':null, page_status:T.status, needs_attention:false, ...(T.ekstra||{}) });
    if (p === '/api/dashboard/aktivering') return J(T.aktivering);
    if (p === '/api/dashboard/bookings') return J(BOOK);
    if (p === '/api/dashboard/stats') return J({ daily:[], months_with_data:[] });
    if (p === '/api/dashboard/attribution') return J({ paaVei:{ rebooking:{naar_vindu_30d:0,med_samtykke:0}, winback:{} }, hentetInn:{ total:{count:0,revenue:0} } });
    if (p === '/api/dashboard/ledige') return J({ antall:0, vis_banner:false });
    if (p === '/api/dashboard/story/ledige-timer/data') return J({ tjenester:1, har_ledige:true, apne_dager:4, dager:[] });
    return J(/images|recent|services|hours|referrals|customers|winback/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  // Upublisert v2-side åpner i fokusmodus (Din side-oppsettet). «Fullfør siden»-kortet står på Oversikt, som barberen
  // når ved å lukke fokus (×) — gjør det samme her.
  if (T.status!=='live') { await page.click('#fokusX').catch(()=>{}); await page.evaluate(() => switchPanel('oversikt')); await page.waitForTimeout(300); await page.evaluate(() => window.scrollTo(0,0)); }
  if (T.installPrompt) await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome:'dismissed' }); window.dispatchEvent(e); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  return { ctx, page, errs, T };
}
const MAAL_KORT = (sel) => {
  const k = document.querySelector(sel); if (!k || k.hidden || !k.offsetParent) return { synlig:false };
  const c = getComputedStyle(k), rot = getComputedStyle(document.documentElement);
  const tittel = k.querySelector('.fb-h, .hs-kort-h, strong'), brod = [...k.querySelectorAll('.fb-s, .hs-kort-tekst, .under, .ovs-story-linje, .fb-tekst')].find(e => e.offsetParent);
  const knapper = [...k.querySelectorAll('button')].filter(b => b.offsetParent && !b.classList.contains('hs-kort-x') && !b.classList.contains('fb-kryss') && !b.classList.contains('lnk-quiet') && !b.classList.contains('fb-vis') && b.id!=='dv2Fullfor');
  const ct = tittel && getComputedStyle(tittel), cb = brod && getComputedStyle(brod);
  return { synlig:true, bg:c.backgroundColor, surface:rot.getPropertyValue('--surface').trim(), ramme:c.borderTopWidth+' '+c.borderTopColor, rammeV:c.borderLeftWidth+' '+c.borderLeftColor,
    linje:rot.getPropertyValue('--ov-seg-line').trim(), radius:c.borderTopLeftRadius, padding:c.paddingTop+' '+c.paddingLeft, skygge:c.boxShadow,
    tittel: ct ? ct.fontSize+' '+ct.fontWeight+' '+ct.letterSpacing : null,
    brod: cb ? cb.fontSize+' '+cb.fontWeight+' '+cb.lineHeight+' '+cb.color : null, mut: rot.getPropertyValue('--mut').trim(),
    knapper: knapper.map(b => { const r = b.getBoundingClientRect(), s = getComputedStyle(b); return Math.round(r.height)+'/'+s.borderTopLeftRadius+'/'+s.backgroundColor; }),
    ink: rot.getPropertyValue('--ink').trim(), tekstHs: [...k.querySelectorAll('p:not(.hs-kort-h)')].filter(p => p.offsetParent).map(p => p.textContent.trim()) };
};
const rgb = h => { let m=h.replace('#',''); if (m.length===3) m=m.split('').map(c=>c+c).join(''); return `rgb(${parseInt(m.slice(0,2),16)}, ${parseInt(m.slice(2,4),16)}, ${parseInt(m.slice(4,6),16)})`; };
// Vekt-kartlegging: alle synlige elementer med EGEN tekst i header + Oversikt + bunnmeny.
const KARTLEGG = () => {
  const ut = [];
  for (const rot of [document.querySelector('header.top'), document.getElementById('oversikt'), document.querySelector('.bunn-nav')]) {
    if (!rot) continue;
    for (const el of rot.querySelectorAll('*')) {
      if (!el.offsetParent && getComputedStyle(el).position!=='fixed') continue;
      const egen = [...el.childNodes].filter(n => n.nodeType===3).map(n => n.textContent).join('').replace(/\s+/g,' ').trim();
      if (!egen) continue;
      const c = getComputedStyle(el);
      const navn = el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\s+/).join('.'):'');
      ut.push({ vekt:c.fontWeight, str:c.fontSize, navn, tekst:egen.slice(0,40) });
    }
  }
  return ut;
};

for (const id of Object.keys(TILSTANDER)) for (const tema of ['dark','light']) for (const bredde of [320, 375]) {
  const { ctx, page, errs, T } = await aapne(id, { bredde, tema });
  const tag = `${id} ${tema} ${bredde}`;
  sjekk(`${tag}: ingen pageerror / overflow`, errs.length===0 && await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 0, errs.join('|').slice(0,100));
  for (const sel of T.kort) {
    const m = await page.evaluate(MAAL_KORT, sel);
    sjekk(`${tag} ${sel}: synlig`, m.synlig);
    if (!m.synlig) continue;
    sjekk(`${tag} ${sel}: boks = surface, 1px --ov-seg-line, r12, padding 18, ingen skygge, ingen aksentkant`,
      m.bg===rgb(m.surface) && m.ramme==='1px '+rgb(m.linje) && m.rammeV==='1px '+rgb(m.linje) && m.radius==='12px' && m.padding==='18px 18px' && m.skygge==='none',
      JSON.stringify({ bg:m.bg, ramme:m.ramme, venstre:m.rammeV, r:m.radius, p:m.padding, s:m.skygge }));
    if (m.tittel) sjekk(`${tag} ${sel}: tittel 15px/600/-0.01em`, m.tittel==='15px 600 -0.15px', m.tittel);
    if (m.brod) sjekk(`${tag} ${sel}: brødtekst 13.5px/400/1.5 i --mut`, m.brod==='13.5px 400 20.25px '+rgb(m.mut), m.brod);
    sjekk(`${tag} ${sel}: knapper 46px / r8`, m.knapper.every(k => /^46\/8px\//.test(k)), m.knapper.join(' '));
    if (sel==='#hsKort') sjekk(`${tag}: hjemskjerm uten dobbeltekst${id.includes('android')?' — «Ett trykk, så ligger dashbordet på hjemskjermen.»':''}`,
      !m.tekstHs.some(t => /Da åpner du dashbordet/.test(t)) && (!id.includes('android') || JSON.stringify(m.tekstHs)==='["Ett trykk, så ligger dashbordet på hjemskjermen."]'), JSON.stringify(m.tekstHs));
  }
  if (tema==='dark' && bredde===375) for (const r of await page.evaluate(KARTLEGG)) {
    if (!vekter.has(r.vekt)) vekter.set(r.vekt, new Map());
    const key = r.navn+' '+r.str; if (!vekter.get(r.vekt).has(key)) vekter.get(r.vekt).set(key, r.tekst);
  }
  const h = await page.evaluate(() => { const o = document.getElementById('ovsKommende'); const nav = document.querySelector('.bunn-nav'); return Math.ceil((o ? o.getBoundingClientRect().top : 700) + (nav && nav.offsetParent ? nav.getBoundingClientRect().height : 0)); });   // + bunnmenyen (sticky), så den ikke dekker siste kort
  await page.setViewportSize({ width:bredde, height:Math.max(h, 400) }); await page.waitForTimeout(150);
  const fil = path.join(OUT, `${id}-${tema}-${bredde}.png`); await page.screenshot({ path:fil }); bilder.push(fil);
  await ctx.close();
}
// Kartlegg også en full Vekst-Oversikt (I dag med neste booking, Hentet inn med tall) — kortene skjuler ikke noe der.
{
  const ctx = await browser.newContext({ viewport:{ width:375, height:900 } }); const page = await ctx.newPage();
  await page.clock.setFixedTime(NAA);
  await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname;
    const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile') return J({ shop:'Grand Barber', slug:'grand-barber', hasPassword:true });
    if (p === '/api/dashboard/billing/status') return J({ effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status:'live' });
    if (p === '/api/dashboard/aktivering') return J({ har_booking:true });
    if (p === '/api/dashboard/bookings') return J([...BOOK, bk(3,'Emre Yilmaz','Skin fade','2026-11-17T12:00:00Z',45)]);
    if (p === '/api/dashboard/stats') return J({ daily:[{day:'2026-11-16',revenue:900,count:3}], months_with_data:[], current_week_revenue:900, best_week_revenue:14768, best_week_start:'2026-08-10' });
    if (p === '/api/dashboard/attribution') return J({ paaVei:{ rebooking:{naar_vindu_30d:2,med_samtykke:1}, winback:{borte:3,no_show:1} }, hentetInn:{ total:{count:3,revenue:900}, rebooking:{count:3,revenue:900,aktivert:false}, vinnTilbake:{count:0,revenue:0}, vervet:{count:0,revenue:0} } });
    return J(/images|recent|services|hours|referrals|customers|winback/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' }); await page.waitForTimeout(500);
  for (const r of await page.evaluate(KARTLEGG)) { if (!vekter.has(r.vekt)) vekter.set(r.vekt, new Map()); const key = r.navn+' '+r.str; if (!vekter.get(r.vekt).has(key)) vekter.get(r.vekt).set(key, r.tekst); }
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) if (!s.ok) console.log('✗ '+s.navn+'  — '+s.detalj);
console.log('\nVEKT-KARTLEGGING (header + Oversikt + bunnmeny, synlige elementer med egen tekst):');
for (const v of [...vekter.keys()].sort()) { console.log(`\n  ${v}:`); for (const [k, t] of vekter.get(v)) console.log(`    ${k}  «${t}»`); }
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
