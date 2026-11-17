// tools/render/header-lenke.mjs — dashbord-headeren med bookinglenka (Henrik 17.11.2026).
//
// Mobil (<720px), alle faner: ÉN rad, NAVNET HAR FORRANG. Navnet helt i 20px/700; lenka tar resten som «/<slug>»
// 12.5px/500 i --info + kopi-ikon 15px 6px etter, ende-ellipse, trykkflate ≥44px. Under ~72px til lenketeksten → bare
// kopi-ikonet (44×44). Navnet krympes (gulv 16px) bare når det ikke får plass ved siden av ikonet, og «…» først på 16px.
// Trykk på tekst OG ikon kopierer HELE URL-en (https://…/<slug>) med «Lenke kopiert», uten navigasjon.
// Ikke live: høyre side tom, raden har samme høyde. Ingen layout-hopp når lenka lastes (første seksjon måles før/etter).
// Datoen står i I DAG-etiketten («I DAG · TIRSDAG 17. NOV»), ikke i headeren.
// Desktop (≥720): navn 26px til venstre, full lenke + ikon til høyre, teksten åpner siden.
//
// Skjermbilder (header-utsnitt) → .render-ut/header-lenke/: 320/375/1280 × mørk/lys × Oversikt/Vekst, + lang slug @320.
// Alt /api/** mockes; navigator.clipboard stubbes (ingen ekte utklippstavle, ingen navigasjon).
//   node tools/render/header-lenke.mjs   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/header-lenke');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const NAA = new Date('2026-11-17T09:10:00Z');   // tirsdag 17.11.2026 10:10 Oslo

const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];
const browser = await chromium.launch();

// hold: { profil:Promise, billing:Promise } — svarene holdes til løftet løses (for hopp-målingen).
async function aapne({ bredde, tema, slug='grand-barber', shop='Grand Barber', fane='oversikt', live=true, hold=null }) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(NAA);
  await page.addInitScript((tm) => {
    try { localStorage.setItem('bhq-theme', tm); } catch(e){}
    window.__kopiert = [];
    try { Object.defineProperty(navigator, 'clipboard', { value:{ writeText: t => { window.__kopiert.push(t); return Promise.resolve(); } }, configurable:true }); } catch(e){}
  }, tema);
  await page.route('**/api/**', async route => { const p = new URL(route.request().url()).pathname;
    const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (route.request().method() !== 'GET') return J({ ok:true });
    if (p === '/api/dashboard/billing/status') { if (hold) await hold.billing;
      return J({ effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status: live ? 'live' : 'forhandsvist', needs_attention:false }); }
    if (p === '/api/dashboard/profile') { if (hold) await hold.profil; return J({ hasPassword:true, name:'Henrik', shop, email:'test@example.no', slug }); }
    if (p === '/api/dashboard/stats') return J({ daily:[], months_with_data:[] });
    if (p === '/api/dashboard/attribution') return J({ paaVei:{ rebooking:{naar_vindu_30d:0,med_samtykke:0}, winback:{} }, hentetInn:{ total:{count:0,revenue:0} } });
    if (p === '/api/dashboard/aktivering') return J({ har_booking:true });
    return J(/images|bookings|recent|services|hours|winback|referrals|customers/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil: hold ? 'domcontentloaded' : 'networkidle' });
  if (!hold) {
    if (live) await page.waitForSelector('#headerLenke:not([hidden]) .pub-copy', { timeout:10000 });   // .pub-copy: teksten er skjult i bare-ikon-tilstanden
    if (fane !== 'oversikt') { await page.evaluate(f => switchPanel(f), fane); await page.waitForTimeout(300); }
    await page.evaluate(() => window.scrollTo(0, 0));   // fanebytte kan scrolle — headeren skal stå i utsnittet
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(300);
  }
  return { ctx, page, errs };
}
const MAAL = () => {
  const a = document.querySelector('#headerLenke .pub-url'), k = document.querySelector('#headerLenke .pub-copy'),
        f = document.querySelector('#headerLenke .pub-field'), n = document.getElementById('barberName'), top = document.querySelector('header.top');
  const ra = a.getBoundingClientRect(), rk = k.getBoundingClientRect(), rf = f.getBoundingClientRect(), rn = n.getBoundingClientRect(), rt = top.getBoundingClientRect();
  const cs = getComputedStyle(a), cn = getComputedStyle(n);
  return { tekst:a.textContent, font:cs.fontSize+' '+cs.fontWeight, farge:cs.color, ellipse:cs.textOverflow, kuttet:a.scrollWidth>a.clientWidth+1,
    hoyde:Math.round(ra.height), ikon: Math.round(k.querySelector('svg').getBoundingClientRect().width), gap: Math.round(rk.left - ra.right),
    trykk: Math.round(rf.height), lenkeAndel: Math.round(document.getElementById('headerLenke').getBoundingClientRect().width / rt.width * 100),
    // Synlig lenke-element: teksten, eller kopi-ikonet når teksten er skjult (bare-ikon).
    sammeRad: Math.abs(((a.offsetParent?ra:rk).top+(a.offsetParent?ra:rk).bottom)/2 - (rn.top+rn.bottom)/2) < 4, tilHoyre: (a.offsetParent?ra:rk).left > rn.right,
    navnPx: parseFloat(cn.fontSize), navnKuttet: n.scrollWidth > n.clientWidth + 1, navnTekst: n.textContent,
    bareIkon: top.classList.contains('bare-ikon'), urlSynlig: !!a.offsetParent, kopiB: Math.round(rk.width), kopiH: Math.round(rk.height),
    navn: cn.fontSize+' '+cn.fontWeight+' '+cn.letterSpacing, navnLinjer: Math.round(rn.height) <= Math.ceil(parseFloat(cn.fontSize)*1.2),
    topPad: getComputedStyle(top).paddingTop+'/'+getComputedStyle(top).paddingBottom, headerH: Math.round(rt.height),
    datoIHeader: !!document.getElementById('dashDato'), idagEtikett: (document.getElementById('ovsIdagH')||{}).innerText||'',
    overflow: document.documentElement.scrollWidth - innerWidth, info: getComputedStyle(document.documentElement).getPropertyValue('--info').trim() };
};
const rgb = h => { const m = h.replace('#',''); return `rgb(${parseInt(m.slice(0,2),16)}, ${parseInt(m.slice(2,4),16)}, ${parseInt(m.slice(4,6),16)})`; };

for (const tema of ['dark','light']) for (const bredde of [320,375,1280]) for (const fane of ['oversikt','vekst']) {
  const { ctx, page, errs } = await aapne({ bredde, tema, fane });
  const m = await page.evaluate(MAAL);
  const tag = `${tema} ${bredde} ${fane}`;
  sjekk(`${tag}: ingen overflow / pageerror`, m.overflow <= 0 && errs.length===0, m.overflow+' '+errs.join('|').slice(0,80));
  sjekk(`${tag}: lenka på samme rad, til høyre for navnet`, m.sammeRad && m.tilHoyre, JSON.stringify({ sammeRad:m.sammeRad, tilHoyre:m.tilHoyre }));
  sjekk(`${tag}: ingen dato i headeren`, !m.datoIHeader);
  if (fane==='oversikt') sjekk(`${tag}: I DAG-etiketten «I DAG · TIRSDAG 17. NOV»`, m.idagEtikett==='I DAG · TIRSDAG 17. NOV', m.idagEtikett);
  if (bredde < 720) {
    sjekk(`${tag}: «/grand-barber» 12.5px/500 i --info`, m.tekst==='/grand-barber' && m.font==='12.5px 500' && m.farge===rgb(m.info), m.tekst+' '+m.font+' '+m.farge);
    sjekk(`${tag}: navn 20px/700/-0.025em, én linje`, m.navn==='20px 700 -0.5px' && m.navnLinjer, m.navn);
    sjekk(`${tag}: ikon 15px, 6px etter teksten`, m.ikon===15 && m.gap===6, m.ikon+'px / '+m.gap+'px');
    sjekk(`${tag}: trykkflate ≥44px, navn og lenke helt (kort navn + kort slug)`, m.trykk >= 44 && !m.navnKuttet && !m.kuttet && !m.bareIkon, m.trykk+'px kuttet='+m.navnKuttet+'/'+m.kuttet);
    sjekk(`${tag}: padding 14px/2px`, m.topPad==='14px/2px', m.topPad);
  } else {
    sjekk(`${tag}: desktop — full URL, navn 26px`, m.tekst==='trybarberhq.com/grand-barber' && /^26px 700/.test(m.navn), m.tekst+' '+m.navn);
  }
  const fil = path.join(OUT, `${tema}-${bredde}-${fane}.png`);
  await page.screenshot({ path:fil, clip:{ x:0, y:0, width:bredde, height: bredde<720 ? 170 : 210 } });
  bilder.push(fil);
  await ctx.close();
}
// Tre tilfeller (Henrik 17.11) @320 og @375, mørk — navnet har forrang:
//  A «Grand Barber» + lang slug  → navnet helt i 20px, lenketeksten kortet med «…»
//  B «Grand Barber» + kort slug  → begge helt
//  C langt navn + lang slug      → bare kopi-ikonet; navnet helt (evt. krympet ≥16px), «…» først på 16px
const LANG = 'mosjoen-barbershop-og-frisorsalong', LANGT_NAVN = 'Mosjøen Barbershop & Frisør';
const TILFELLER = [
  { id:'A-kort-navn-lang-slug', shop:'Grand Barber', slug:LANG },
  { id:'B-kort-navn-kort-slug', shop:'Grand Barber', slug:'grand-barber' },
  { id:'C-langt-navn-lang-slug', shop:LANGT_NAVN, slug:LANG },
];
for (const bredde of [320, 375]) for (const c of TILFELLER) {
  const { ctx, page, errs } = await aapne({ bredde, tema:'dark', slug:c.slug, shop:c.shop });
  const m = await page.evaluate(MAAL);
  const tag = `${c.id} @${bredde}`;
  sjekk(`${tag}: én rad, ingen overflow / pageerror`, m.sammeRad && m.overflow<=0 && errs.length===0, m.overflow+' '+errs.join('|').slice(0,80));
  if (c.id[0]==='A') {
    sjekk(`${tag}: navnet helt i 20px`, m.navnPx===20 && !m.navnKuttet && m.navnTekst===c.shop, m.navnPx+'px kuttet='+m.navnKuttet);
    sjekk(`${tag}: lenka «/${c.slug}» kortet med «…», tekst synlig`, m.urlSynlig && !m.bareIkon && m.tekst==='/'+c.slug && m.kuttet && m.ellipse==='ellipsis' && m.hoyde<24, 'kuttet='+m.kuttet+' bareIkon='+m.bareIkon);
  }
  if (c.id[0]==='B') sjekk(`${tag}: navn og «/grand-barber» begge helt`, m.navnPx===20 && !m.navnKuttet && m.urlSynlig && !m.kuttet && !m.bareIkon, m.navnPx+'px '+m.navnKuttet+'/'+m.kuttet+'/'+m.bareIkon);
  if (c.id[0]==='C') {
    sjekk(`${tag}: bare kopi-ikonet (44×44), ingen lenketekst`, m.bareIkon && !m.urlSynlig && m.kopiB>=44 && m.kopiH>=44, m.kopiB+'×'+m.kopiH+' bareIkon='+m.bareIkon);
    sjekk(`${tag}: navnet helt eller krympet ≥16px — «…» bare på 16px`, m.navnPx>=16 && (!m.navnKuttet || m.navnPx===16), m.navnPx+'px kuttet='+m.navnKuttet);
  }
  const fil = path.join(OUT, `${c.id}-${bredde}.png`);
  await page.screenshot({ path:fil, clip:{ x:0, y:0, width:bredde, height:170 } }); bilder.push(fil);
  if (bredde===320 && c.id[0]==='C') {
    // Kopi fra bare-ikon-tilstanden + fra teksten (tilfelle A gjøres under): HELE URL-en, «Lenke kopiert», ingen navigasjon.
    const url0 = page.url(); let nyFane = false; ctx.on('page', () => { nyFane = true; });
    await page.click('#headerLenke .pub-copy'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ kopiert: window.__kopiert.slice(), ok: document.querySelector('#headerLenke .pub-copy').classList.contains('ok') }));
    sjekk('bare ikon: kopierer HELE URL-en med «Lenke kopiert»', r.kopiert.length===1 && r.kopiert[0]==='https://trybarberhq.com/'+LANG && r.ok && page.url()===url0 && !nyFane, JSON.stringify(r));
  }
  if (bredde===320 && c.id[0]==='A') {
    const url0 = page.url(); let nyFane = false; ctx.on('page', () => { nyFane = true; });
    await page.click('#headerLenke .pub-url'); await page.waitForTimeout(200);
    await page.click('#headerLenke .pub-copy', { force:true }); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ kopiert: window.__kopiert.slice(), ok: document.querySelector('#headerLenke .pub-copy').classList.contains('ok') }));
    sjekk('mobil: trykk på tekst og ikon kopierer HELE URL-en', r.kopiert.length===2 && r.kopiert.every(t => t==='https://trybarberhq.com/'+LANG), JSON.stringify(r.kopiert));
    sjekk('mobil: samme kvittering («Lenke kopiert», .ok), ingen navigasjon', r.ok && page.url()===url0 && !nyFane);
  }
  await ctx.close();
}
// Ikke live: høyre side tom, samme radhøyde.
for (const bredde of [320, 375]) {
  const a = await aapne({ bredde, tema:'dark', live:false });
  await a.page.waitForTimeout(600);
  const tom = await a.page.evaluate(() => ({ skjult: document.getElementById('headerLenke').hidden, h: Math.round(document.querySelector('header.top').getBoundingClientRect().height) }));
  await a.ctx.close();
  const b = await aapne({ bredde, tema:'dark' });
  const hLive = await b.page.evaluate(() => Math.round(document.querySelector('header.top').getBoundingClientRect().height));
  await b.ctx.close();
  sjekk(`${bredde} ikke live: høyre side tom, samme radhøyde som live`, tom.skjult && tom.h===hLive, `skjult=${tom.skjult} ${tom.h}px vs ${hLive}px`);
}
// Ingen layout-hopp: første seksjon (#ovsIdag) måles FØR profil/billing har svart og ETTER at lenka er tegnet.
for (const bredde of [320, 375, 1280]) {
  let slippP, slippB; const hold = { profil:new Promise(r => slippP=r), billing:new Promise(r => slippB=r) };
  const { ctx, page, errs } = await aapne({ bredde, tema:'dark', hold });
  await page.waitForTimeout(500);
  const foer = await page.evaluate(() => Math.round(document.getElementById('ovsIdag').getBoundingClientRect().top*10)/10);
  slippB(); await page.waitForTimeout(250); slippP();
  await page.waitForSelector('#headerLenke:not([hidden]) .pub-url', { timeout:10000 });
  await page.waitForTimeout(400);
  const etter = await page.evaluate(() => Math.round(document.getElementById('ovsIdag').getBoundingClientRect().top*10)/10);
  sjekk(`${bredde}: ingen layout-hopp når lenka lastes (I DAG ${foer}px → ${etter}px)`, Math.abs(etter-foer) < 0.6 && errs.length===0, errs.join('|'));
  await ctx.close();
}
{
  const { ctx, page } = await aapne({ bredde:1280, tema:'dark' });
  const href = await page.$eval('#headerLenke .pub-url', a => a.getAttribute('href'));
  sjekk('desktop: teksten er fortsatt lenke til siden', /\/grand-barber$/.test(href||''), href);
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) console.log((s.ok?'✓ ':'✗ ')+s.navn+(s.ok||!s.detalj?'':'  — '+s.detalj));
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
