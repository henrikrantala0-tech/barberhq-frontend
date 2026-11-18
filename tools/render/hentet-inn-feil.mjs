// tools/render/hentet-inn-feil.mjs — «Hentet inn av BarberHQ» når /attribution feiler, på Oversikt (#drivenBy) og
// Vekst-fanen (#vekstHentet). Felles komponent (tegnHentetInn), så begge skal oppføre seg likt (Henrik 18.11.2026).
//
// Vakter:
//   1. /attribution 500 → overskrift + periodevelger (3/6/12 mnd) står, dempet «Kunne ikke hente tallene akkurat nå.»
//      der tallene skulle vært. Før ble verten tømt (høyde 0) — ingen tekst, ingen velger å prøve igjen med.
//   2. Bytte periode i feiltilstanden henter på nytt; lykkes kallet, kommer tallene.
//   3. «Se lista →» inne i Vekst-fanens Hentet inn åpner Vinn tilbake UTEN nye GET-er (ingen switchPanel → ingen
//      loadVekst/loadSmsInnstillinger/… på nytt). Fra Oversikt bytter lenka fortsatt fane og åpner Vinn tilbake.
// Skjermbilder → .render-ut/hentet-inn-feil/: feiltilstanden Oversikt/Vekst × 320/375 mørk + kontaktark.
// Alt /api/** mockes (catch-all), ingen kall når prod.
//   node tools/render/hentet-inn-feil.mjs   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/hentet-inn-feil');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const NAA = new Date('2026-11-18T09:10:00Z');
const FEILTEKST = 'Kunne ikke hente tallene akkurat nå.';

const HENTET = { total:{count:14,revenue:4850}, rebooking:{count:8,revenue:2300,aktivert:true}, vinnTilbake:{count:4,revenue:1550}, vervet:{count:2,revenue:1000} };
const PAAVEI = { rebooking:{naar_vindu_30d:2,med_samtykke:1}, winback:{ foerste_passerer_60:'2026-12-03', passerer_innen_30d:5, borte:3, no_show:2 } };
const SETTINGS = { sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35, referral_reward_recipient:'begge', referral_discount_pct:15, payment_methods:[] };

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];

// attrFeil(period) → true = svar 500. Kan byttes underveis via state.attrFeil.
async function aapne({ bredde, panel, attrFeil }) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2, reducedMotion:'reduce' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const state = { attrFeil, gets:[], attr:[], lekk:[] };
  await page.clock.setFixedTime(NAA);
  await page.addInitScript(() => { try { localStorage.setItem('bhq-theme', 'dark'); } catch(e){} });
  await page.route('https://api.trybarberhq.com/**', r => new URL(r.request().url()).pathname.startsWith('/api/') ? r.fallback() : r.abort());
  await page.route('**/api/**', route => { const q = route.request(), u = new URL(q.url()), p = u.pathname;
    const J = (o, s=200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
    if (q.method() !== 'GET') return J({ ok:true });
    state.gets.push(p + u.search);
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', slug:'grand-barber' });
    if (p === '/api/dashboard/billing/status') return J({ effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status:'live', needs_attention:false });
    if (p === '/api/dashboard/stats') return J({ daily:[], months_with_data:[], months:[], weekly_revenue:[], completed_all_time:0 });
    if (p === '/api/dashboard/settings') return J(SETTINGS);
    if (p === '/api/dashboard/attribution') { const per = u.searchParams.get('period'); state.attr.push(per);
      return state.attrFeil(per) ? J({ error:'intern feil' }, 500) : J({ paaVei:PAAVEI, hentetInn:HENTET }); }
    if (p === '/api/dashboard/winback') return J({ lapsed_threshold:60, group:'alle', no_show:[], lapsed:[] });
    if (p === '/api/dashboard/loyalty') return J({ enabled:false, threshold:10, pct:100, participants:[], eligible:[], totals:{} });
    if (p === '/api/dashboard/momentum') return J({ show:false });
    if (p === '/api/dashboard/sms-preview') return J({ kind:u.searchParams.get('kind'), body:'x', transaksjonell:u.searchParams.get('kind')==='paaminnelse' });
    if (p === '/api/dashboard/aktivering') return J({ har_booking:true });
    return J(/images|bookings|services|hours|customers|referrals/.test(p) ? [] : {}); });
  // Lekkasjevakt: en request som faktisk går ut på nettet (ikke fulfilled av mocken) har en serveradresse.
  page.on('requestfinished', async q => { if (!q.url().includes('api.trybarberhq.com')) return;
    const r = await q.response(); const addr = r && await r.serverAddr().catch(() => null); if (addr) state.lekk.push(q.method()+' '+q.url()); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  if (panel === 'vekst') await page.evaluate(() => switchPanel('vekst'));
  // Tolerant: med den gamle feilen ble verten tømt (ingen h2) — da skal SJEKKENE bli røde, ikke skriptet krasje.
  await page.waitForSelector(panel === 'vekst' ? '#vekstHentet h2' : '#drivenBy h2', { timeout:5000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, errs, state };
}
const VERT = { oversikt:{ wrap:'#drivenBy', seksjon:'#drivenByWrap', velger:'#ovsAttrPeriod', h:'#ovsHentetH' },
               vekst:   { wrap:'#vekstHentet', seksjon:'#vekstHentetWrap', velger:'#vkAttrPeriod', h:'#vkHentetH' } };
const maal = (v) => (v => { const w = document.querySelector(v.wrap), sek = document.querySelector(v.seksjon);
  const feil = w.querySelector('.hi-feil'); const velger = w.querySelector(v.velger);
  return { h: (w.querySelector(v.h)||{}).textContent || null, velger: velger ? [...velger.querySelectorAll('button')].map(b => b.textContent).join('|') : null,
    pressed: velger ? (velger.querySelector('[aria-pressed="true"]')||{}).textContent : null,
    feil: feil ? feil.textContent : null, feilFarge: feil ? getComputedStyle(feil).color : null, mut: getComputedStyle(document.documentElement).getPropertyValue('--mut').trim(),
    total: (w.querySelector('.hi-total')||{}).innerText || null, hoyde: Math.round(sek.getBoundingClientRect().height),
    of: document.documentElement.scrollWidth - innerWidth }; })(v);
const rgb = h => { let m=h.replace('#',''); if (m.length===3) m=m.split('').map(c=>c+c).join(''); return `rgb(${parseInt(m.slice(0,2),16)}, ${parseInt(m.slice(2,4),16)}, ${parseInt(m.slice(4,6),16)})`; };

// 1 + 2: feiltilstand og nytt forsøk ved periodebytte, begge verter, 320/375 mørk
for (const panel of ['oversikt','vekst']) for (const bredde of [320, 375]) {
  const { ctx, page, errs, state } = await aapne({ bredde, panel, attrFeil: () => true });
  const v = VERT[panel], tag = `${panel} ${bredde}`;
  const m = await page.evaluate(maal, v);
  sjekk(`${tag}: feil → overskrift + velger står`, m.h==='Hentet inn av BarberHQ' && m.velger==='3 mnd|6 mnd|12 mnd' && m.pressed==='3 mnd', JSON.stringify({ h:m.h, v:m.velger, p:m.pressed }));
  sjekk(`${tag}: feil → «${FEILTEKST}» dempet, ingen tall`, m.feil===FEILTEKST && m.feilFarge===rgb(m.mut) && !m.total, JSON.stringify({ f:m.feil, c:m.feilFarge, mut:m.mut, t:m.total }));
  sjekk(`${tag}: seksjonen har høyde (ikke tømt), ingen overflow`, m.hoyde>60 && m.of<=0, 'høyde='+m.hoyde+' of='+m.of);
  // Skjermbilde av feiltilstanden (før nytt forsøk)
  const r = await page.evaluate(s => { const e = document.querySelector(s); e.scrollIntoView({ block:'center' }); const b = e.getBoundingClientRect(); return { x:b.x, y:b.y, w:b.width, h:b.height }; }, v.seksjon);
  const fil = path.join(OUT, `feil-${panel}-dark-${bredde}.png`);
  await page.screenshot({ path:fil, clip:{ x:0, y:Math.max(0, r.y-24), width:bredde, height:Math.min(900, r.h+48) } }); bilder.push(fil);
  // Nytt forsøk: bytt periode → kallet lykkes → tallene kommer
  state.attrFeil = () => false;
  const foer = state.attr.length;
  await page.click(`${v.velger} [data-ovs-attr="siste_6mnd"]`, { timeout:3000 }).catch(() => {}); await page.waitForTimeout(500);
  const m2 = await page.evaluate(maal, v);
  sjekk(`${tag}: periodebytte i feiltilstand henter på nytt og viser tallene`, state.attr.slice(foer).includes('siste_6mnd') && m2.pressed==='6 mnd' && !m2.feil && /4\s?850/.test(m2.total||''), JSON.stringify({ kall:state.attr.slice(foer), p:m2.pressed, f:m2.feil, t:m2.total }));
  // Og tilbake til feil: nytt periodebytte som feiler → feillinja igjen, velgeren står på det nye valget
  state.attrFeil = () => true;
  await page.click(`${v.velger} [data-ovs-attr="siste_12mnd"]`, { timeout:3000 }).catch(() => {}); await page.waitForTimeout(500);
  const m3 = await page.evaluate(maal, v);
  sjekk(`${tag}: ny feil etter periodebytte → feillinje, velger på 12 mnd`, m3.feil===FEILTEKST && m3.pressed==='12 mnd' && !m3.total, JSON.stringify({ f:m3.feil, p:m3.pressed }));
  sjekk(`${tag}: ingen pageerror, ingen kall til prod`, errs.length===0 && state.lekk.length===0, errs.join('|').slice(0,120)+' '+state.lekk.join(','));
  await ctx.close();
}

// 3a: «Se lista →» inne på Vekst → åpner Vinn tilbake, ingen nye GET-er
{ const { ctx, page, errs, state } = await aapne({ bredde:375, panel:'vekst', attrFeil: () => false });
  await page.waitForSelector('#vekstHentet [data-di-winback]');
  const foer = state.gets.length;
  await page.click('#vekstHentet [data-di-winback]'); await page.waitForTimeout(900);
  const nye = state.gets.slice(foer);
  const d = await page.evaluate(() => ({ panel: document.querySelector('.panel.active').id, aapen: document.querySelector('#accWinback .acc-head').getAttribute('aria-expanded')==='true' && !document.querySelector('#accWinback .acc-body').hidden,
    top: Math.round(document.querySelector('#accWinback').getBoundingClientRect().top) }));
  sjekk('Vekst «Se lista →»: Vinn tilbake åpnet, står på Vekst', d.panel==='vekst' && d.aapen, JSON.stringify(d));
  sjekk('Vekst «Se lista →»: ingen nye GET-er', nye.length===0, JSON.stringify(nye));
  sjekk('Vekst «Se lista →»: scrollet til Vinn tilbake', d.top>=-2 && d.top<300, 'top='+d.top);
  sjekk('Vekst «Se lista →»: ingen pageerror / prod-kall', errs.length===0 && state.lekk.length===0, errs.join('|'));
  await ctx.close(); }

// 3b: «Se lista →» fra Oversikt → bytter til Vekst og åpner Vinn tilbake (som før)
{ const { ctx, page, errs, state } = await aapne({ bredde:375, panel:'oversikt', attrFeil: () => false });
  await page.waitForSelector('#drivenBy [data-di-winback]');
  const foer = state.gets.length;
  await page.click('#drivenBy [data-di-winback]'); await page.waitForTimeout(900);
  const nye = state.gets.slice(foer);
  const d = await page.evaluate(() => ({ panel: document.querySelector('.panel.active').id, aapen: document.querySelector('#accWinback .acc-head').getAttribute('aria-expanded')==='true' && !document.querySelector('#accWinback .acc-body').hidden }));
  sjekk('Oversikt «Se lista →»: bytter til Vekst og åpner Vinn tilbake', d.panel==='vekst' && d.aapen, JSON.stringify(d));
  sjekk('Oversikt «Se lista →»: Vekst lastes (som før)', nye.some(g => g.startsWith('/api/dashboard/winback')), JSON.stringify(nye));
  sjekk('Oversikt «Se lista →»: ingen pageerror / prod-kall', errs.length===0 && state.lekk.length===0, errs.join('|'));
  await ctx.close(); }

// Kontaktark: de fire feiltilstand-bildene side om side
{ const ctx = await browser.newContext({ viewport:{ width:1500, height:600 }, deviceScaleFactor:1 }); const page = await ctx.newPage();
  const celler = bilder.map(b => `<figure><figcaption>${path.basename(b, '.png')}</figcaption><img src="data:image/png;base64,${fs.readFileSync(b).toString('base64')}"></figure>`).join('');
  await page.setContent(`<html><body style="margin:0;padding:24px;background:#1b1b1b;color:#ddd;font:13px system-ui">
    <h1 style="font-size:16px;margin:0 0 16px">Hentet inn — /attribution feiler (mørk) · Oversikt + Vekst · 320 / 375</h1>
    <div style="display:flex;gap:24px;align-items:flex-start">${celler}</div>
    <style>figure{margin:0}figcaption{margin:0 0 8px;color:#aaa}img{display:block;border:1px solid #333}
    img{width:auto;height:auto;max-width:none} figure:nth-child(odd) img{width:320px} figure:nth-child(even) img{width:375px}</style></body></html>`);
  await page.waitForTimeout(200);
  const ark = path.join(OUT, 'kontaktark.png'); await page.screenshot({ path:ark, fullPage:true }); bilder.push(ark);
  await ctx.close(); }

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) if (!s.ok) console.log('✗ '+s.navn+'  — '+s.detalj);
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
