// tools/render/stolper-felles.mjs — FELLES stolpe for Oversikt (#chartBars) og Vekst-fanens månedsdiagram (#trend)
// (Henrik 17.11.2026).
//
// Begge diagrammene tegner stolpen med SAMME renderer (stolpeHtml) og SAMME klasse (.stolpe):
//   ett fyll fra colorForRatio (via stolpeFarge — ingen gradient) · gull (STOLPE_GULL) bare på Vekst-rekordmåneden,
//   med dempet glød · radius 4 i toppen / 0 i bunnen · 0-verdi = 3px strek i --ov-null · Oversikt 110px stolpeområde.
// Vakter: kildekoden (begge render-funksjonene kaller stolpeHtml, ingen egen farge/gradient), DOM (alle stolper har
// .stolpe, ingen gradient, riktig radius), og at SAMME ratio gir SAMME farge på begge faner (0,25 / 0,5 / 0,75 / 0,9).
// Testdata = sammenligningsdataene (des. 2026, maks 4000 kr, alle fargetrinn + 0-dager + rekorduke) + Vekst-måneder
// med samme ratioer, rekordmåned og en tom måned. Klokka låst til 31.12.2026 → «Denne måneden» = 31 stolper.
// «kr» etter de store tallene ARVER tallets farge (grønn / gull, også Hentet inn-totalen og Vekst-totalen), og Oversikt har
// INGEN kort/ramme/bakgrunn bak nøkkeltallene og stolpene (står rett på sidens bakgrunn).
// Skjermbilder → .render-ut/stolper-felles/ på sidens EGEN bakgrunn (#0a0a0a / #fafafa) helt ut i kanten:
//   A rekord (gull) | uten rekord (grønn) | Vekst, og B/C 2 uker og måned | Vekst — 375, mørk + lys.
//   node tools/render/stolper-felles.mjs   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/stolper-felles');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const NAA = new Date('2026-12-31T09:00:00Z');

const DES = {  1:1200, 2:0, 3:3400, 4:600, 5:2200, 6:0, 7:1800, 8:3800, 9:200, 10:0, 11:2600, 12:1400, 13:3000, 14:0, 15:1000, 16:2000, 17:3600,
              18:3200, 19:0, 20:800, 21:1600, 22:2400, 23:0, 24:2800, 25:0, 26:400, 27:1000, 28:2000, 29:3000, 30:3600, 31:4000 };
const daily = Object.entries(DES).filter(([,kr]) => kr > 0).map(([d,kr]) => ({ day:'2026-12-'+String(d).padStart(2,'0'), revenue:kr, count:Math.round(kr/400), new:1, returning:Math.max(0,Math.round(kr/400)-1) }));
// Vekst: siste 6 kalendermåneder (jul–des). maks 40 → ratioer 0,25 / 0,5 / 0 (tom) / 0,75 / 1 (rekord, gull) / 0,9.
const MONTHS = [ { ym:'2026-07', customers:10 }, { ym:'2026-08', customers:20 }, { ym:'2026-10', customers:30 }, { ym:'2026-11', customers:40 }, { ym:'2026-12', customers:36 } ];
const STATS = { daily, months_with_data:['2026-11','2026-12'], current_week_revenue:14000, best_week_revenue:12000, best_week_start:'2026-11-09',
  weekly_revenue:[9000,12000,8000,10500,11000,7600,9800,10200].map((r,i)=>({ week_start:'2026-1'+(i<4?'0':'1')+'-0'+(i%4+1), revenue:r })),
  months:MONTHS, record_customers_month:{ ym:'2026-11', customers:40 }, completed_all_time:136 };
const STATS_UTEN = { ...STATS, current_week_revenue:9000 };   // under beste uke (12 000) → ingen gull, grønt tall
const HENTET = { total:{count:14,revenue:4850}, rebooking:{count:8,revenue:2300,aktivert:true}, vinnTilbake:{count:4,revenue:1550}, vervet:{count:2,revenue:1000} };
const PERIODER = [
  { id:'1-siste-uke', navn:'Siste uke (7) — rekord', n:7, klikk: async p => {} },
  { id:'1b-siste-uke-uten-rekord', navn:'Siste uke (7) — uten rekord', n:7, stats:STATS_UTEN, klikk: async p => {} },
  { id:'2-siste-2-uker', navn:'Siste 2 uker (14)', n:14, klikk: async p => { await p.click('#segs [data-p="2uker"]'); } },
  { id:'3-denne-maaneden', navn:'Denne måneden (31)', n:31, klikk: async p => { await p.click('#maanedBtn'); await p.click('#maanedMeny [data-ym=""]'); } },
];

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];
const MAAL = (sel) => [...document.querySelectorAll(sel+' .stolpe, '+sel+' .cbar-bar, '+sel+' .mbar')].filter((e,i,a)=>a.indexOf(e)===i).map(e => {
  const c = getComputedStyle(e);
  return { stolpe:e.classList.contains('stolpe'), null:e.classList.contains('null'), rekord:e.classList.contains('rekord'), h:Math.round(e.getBoundingClientRect().height),
    farge:c.backgroundColor, gradient:c.backgroundImage!=='none', rTopp:c.borderTopLeftRadius, rBunn:c.borderBottomLeftRadius, filter:c.filter };
});

const lagret = {};
for (const tema of ['dark','light']) {
  for (const P of PERIODER) {
    const ctx = await browser.newContext({ viewport:{ width:375, height:1800 }, deviceScaleFactor:2, reducedMotion:'reduce' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.clock.setFixedTime(NAA);
    await page.addInitScript(tm => { try { localStorage.setItem('bhq-theme', tm); } catch(e){} }, tema);
    await page.route('https://api.trybarberhq.com/**', r => new URL(r.request().url()).pathname.startsWith('/api/') ? r.fallback() : r.abort());
    await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname;
      const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
      if (route.request().method() !== 'GET') return J({ ok:true });
      if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', slug:'grand-barber' });
      if (p === '/api/dashboard/billing/status') return J({ effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status:'live', needs_attention:false });
      if (p === '/api/dashboard/stats') return J(P.stats || STATS);
      if (p === '/api/dashboard/aktivering') return J({ har_booking:true });
      if (p === '/api/dashboard/attribution') return J({ paaVei:{ rebooking:{naar_vindu_30d:0,med_samtykke:0}, winback:{} }, hentetInn:HENTET });
      return J(/images|bookings|recent|services|hours|referrals|customers|winback|loyalty/.test(p) ? [] : {}); });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForSelector('#chartBars .cbar-col');
    await P.klikk(page); await page.waitForTimeout(600);
    await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(200);
    const tag = `${tema} ${P.id}`;
    const ov = await page.evaluate(MAAL, '#chartBars');
    const spor = await page.evaluate(() => Math.round(document.querySelector('#chartBars .cbar-spor').getBoundingClientRect().height));
    const nullFarge = await page.evaluate(() => { const d=document.createElement('div'); d.style.background='var(--ov-null)'; document.body.appendChild(d); const c=getComputedStyle(d).backgroundColor; d.remove(); return c; });
    sjekk(`${tag}: Oversikt ${P.n} stolper, alle .stolpe, ingen gradient`, ov.length===P.n && ov.every(b => b.stolpe && !b.gradient), ov.length+' '+ov.filter(b=>!b.stolpe||b.gradient).length);
    sjekk(`${tag}: Oversikt radius 4 topp / 0 bunn`, ov.filter(b=>!b.null).every(b => b.rTopp==='4px' && b.rBunn==='0px'), ov[ov.length-1].rTopp+'/'+ov[ov.length-1].rBunn);
    sjekk(`${tag}: Oversikt 110px område, høyeste stolpe 110px`, spor===110 && Math.max(...ov.map(b=>b.h))===110, spor+' / '+Math.max(...ov.map(b=>b.h)));
    sjekk(`${tag}: Oversikt 0-dager = 3px i --ov-null`, ov.filter(b=>b.null).length>0 && ov.filter(b=>b.null).every(b => b.h===3 && b.farge===nullFarge), ov.filter(b=>b.null).map(b=>b.h+' '+b.farge).join(','));
    sjekk(`${tag}: Oversikt ingen glød (ingen rekordstolpe)`, ov.every(b => b.filter==='none' && !b.rekord));
    const kr = await page.evaluate(() => {
      const v = document.getElementById('estRevValue').closest('.ovs-kpi-v'), u = v.querySelector('.u'), n = document.getElementById('estRevValue');
      const cv = getComputedStyle(v), cu = getComputedStyle(u), cn = getComputedStyle(n);
      const ht = document.querySelector('.hi-total'), hu = ht && ht.querySelector('.u');
      const boks = ['#ovsTall','#stats','.chart-wrap','#chartBars'].map(sel => { const c = getComputedStyle(document.querySelector(sel));
        return sel+':'+c.backgroundColor+'/'+c.borderTopWidth+'/'+c.borderLeftWidth+'/'+c.boxShadow; });
      return { gull:v.classList.contains('rekord-gull'), uFarge:cu.color, vFarge:cv.color, nFarge:cn.color, uFyll:cu.webkitTextFillColor, nFyll:cn.webkitTextFillColor, uVekt:cu.fontWeight,
        htFarge: ht && getComputedStyle(ht).color, huFarge: hu && getComputedStyle(hu).color, boks };
    });
    if (P.id.startsWith('1')) {
      const gullForvent = P.id==='1-siste-uke';
      sjekk(`${tag}: ${gullForvent?'gull':'grønt'} tall — «kr» arver (samme farge/fyll som tallet), vekt 300`, kr.gull===gullForvent && kr.uFarge===kr.vFarge && kr.uFyll===kr.nFyll && kr.uVekt==='300'
        && (gullForvent ? kr.uFyll==='rgba(0, 0, 0, 0)' : kr.uFarge==='rgb(53, 208, 122)'), JSON.stringify(kr));
      sjekk(`${tag}: Hentet inn-totalen — «kr» samme farge som tallet`, kr.htFarge && kr.huFarge===kr.htFarge, kr.htFarge+' / '+kr.huFarge);
    }
    sjekk(`${tag}: Oversikt — ingen kort/ramme/bakgrunn bak nøkkeltall og stolper`, kr.boks.every(b => /:rgba\(0, 0, 0, 0\)\/0px\/0px\/none$/.test(b)), kr.boks.join(' | '));
    const s0 = await page.evaluate(() => document.getElementById('segs').getBoundingClientRect().top + scrollY), s1 = await page.evaluate(() => document.querySelector('.chart-wrap').getBoundingClientRect().bottom + scrollY);
    const ovFil = path.join(OUT, `_ov-${tema}-${P.id}.png`);
    await page.screenshot({ path:ovFil, clip:{ x:0, y:Math.max(0,s0-16), width:375, height:s1-s0+32 } });
    // Vekst-fanen
    await page.evaluate(() => switchPanel('vekst')); await page.waitForSelector('#trend .mcol'); await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0,0));
    const vk = await page.evaluate(MAAL, '#trend');
    if (P.id==='1-siste-uke') { await page.waitForSelector('#attrRows .di-total-kr', { timeout:8000 }).catch(()=>{});
      const dk = await page.evaluate(() => { const t = document.querySelector('#attrRows .di-total-kr'), k = t && t.querySelector('.di-kr'); return t ? [getComputedStyle(t).color, getComputedStyle(k).color] : null; });
      sjekk(`${tag}: Vekst-totalen — «kr» samme farge som tallet`, dk && dk[0]===dk[1], JSON.stringify(dk)); }
    sjekk(`${tag}: Vekst 6 måneder, alle .stolpe, ingen gradient`, vk.length===6 && vk.every(b => b.stolpe && !b.gradient), vk.length+'');
    sjekk(`${tag}: Vekst radius 4 topp / 0 bunn`, vk.filter(b=>!b.null).every(b => b.rTopp==='4px' && b.rBunn==='0px'));
    sjekk(`${tag}: Vekst tom måned = 3px i --ov-null`, vk.filter(b=>b.null).length===1 && vk.filter(b=>b.null).every(b => b.h===3 && b.farge===nullFarge), vk.filter(b=>b.null).map(b=>b.h+' '+b.farge).join(','));
    const rek = vk.filter(b => b.rekord);
    sjekk(`${tag}: Vekst rekord = gull rgb(240, 194, 75) med dempet glød, bare den`, rek.length===1 && rek[0].farge==='rgb(240, 194, 75)' && /drop-shadow/.test(rek[0].filter)
      && vk.filter(b=>!b.rekord).every(b => b.filter==='none'), rek.map(b=>b.farge+' '+b.filter).join(' | '));
    // Samme ratio → samme farge (bare der begge faner har ratioen: Siste uke har 0,25 / 0,5 / 0,75 / 0,9).
    if (P.id==='1-siste-uke') {
      const ovR = { 0.25:ov[2].farge, 0.5:ov[3].farge, 0.75:ov[4].farge, 0.9:ov[5].farge };            // 1000/2000/3000/3600 av 4000
      const vkR = { 0.25:vk[0].farge, 0.5:vk[1].farge, 0.75:vk[3].farge, 0.9:vk[5].farge };            // jul 10 / aug 20 / okt 30 / des 36 av 40
      const fasit = await page.evaluate(() => [0.25,0.5,0.75,0.9].map(r => { const d=document.createElement('div'); d.style.background=stolpeFyll(r,false); document.body.appendChild(d); const c=getComputedStyle(d).backgroundColor; d.remove(); return c; }));
      for (const [i, r] of [0.25,0.5,0.75,0.9].entries())
        sjekk(`${tag}: ratio ${r} gir samme farge på Oversikt og Vekst (= stolpeFyll)`, ovR[r]===vkR[r] && ovR[r]===fasit[i], `Oversikt ${ovR[r]} / Vekst ${vkR[r]} / stolpeFyll ${fasit[i]}`);
      const kilde = await page.evaluate(() => ({ ov:renderBarChart.toString(), vk:renderMonthChart.toString() }));
      sjekk(`${tag}: begge render-funksjonene kaller stolpeHtml, ingen egen gradient/farge`,
        /stolpeHtml\(/.test(kilde.ov) && /stolpeHtml\(/.test(kilde.vk) && !/--bar-top|--bar-bot|linear-gradient|colorForRatio\(/.test(kilde.ov+kilde.vk), '');
    }
    sjekk(`${tag}: ingen pageerror`, errs.length===0, errs.join('|').slice(0,120));
    const v0 = await page.evaluate(() => document.getElementById('vekstTrendH').getBoundingClientRect().top + scrollY), v1 = await page.evaluate(() => document.getElementById('trend').getBoundingClientRect().bottom + scrollY);
    const vkFil = path.join(OUT, `_vk-${tema}-${P.id}.png`);
    await page.screenshot({ path:vkFil, clip:{ x:0, y:Math.max(0,v0-16), width:375, height:v1-v0+32 } });
    await ctx.close();
    // Side om side
    const c2 = await browser.newContext({ viewport:{ width:810, height:400 }, deviceScaleFactor:2 }); const pg = await c2.newPage();
    const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const bg = tema==='dark' ? '#0a0a0a' : '#fafafa', fg = tema==='dark' ? '#fff' : '#0a0a0a';   // sidens EGEN bakgrunn — ingen ramme rundt utsnittene
    await pg.setContent(`<html><body style="margin:0;background:${bg};font-family:Inter,system-ui,sans-serif;color:${fg}">
      <div style="padding:14px 24px 4px;font-size:15px;font-weight:600">${P.navn} — Oversikt | Vekst, felles stolpe, 375 px, ${tema==='dark'?'mørk':'lys'}</div>
      <div style="display:flex;gap:30px;padding:10px 0 20px;align-items:flex-start">
        <div><div style="font-size:12.5px;margin:0 0 8px;opacity:.6">Oversikt</div><img src="${b64(ovFil)}" style="width:375px;display:block"></div>
        <div><div style="font-size:12.5px;margin:0 0 8px;opacity:.6">Vekst (månedsdiagram)</div><img src="${b64(vkFil)}" style="width:375px;display:block"></div>
      </div></body></html>`);
    await pg.waitForTimeout(150);
    const fil = path.join(OUT, `${P.id}-${tema}-oversikt-og-vekst-375.png`); await pg.screenshot({ path:fil, fullPage:true }); bilder.push(fil);
    lagret[tema+P.id] = { ov:ovFil, vk:vkFil }; await c2.close();
  }
}
for (const tema of ['dark','light']) {
  const c3 = await browser.newContext({ viewport:{ width:1230, height:400 }, deviceScaleFactor:2 }); const pg = await c3.newPage();
  const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const bg = tema==='dark' ? '#0a0a0a' : '#fafafa', fg = tema==='dark' ? '#fff' : '#0a0a0a';
  const kol = (tittel, fil) => `<div><div style="font-size:12.5px;margin:0 0 8px 24px;opacity:.6">${tittel}</div><img src="${b64(fil)}" style="width:375px;display:block"></div>`;
  await pg.setContent(`<html><body style="margin:0;background:${bg};font-family:Inter,system-ui,sans-serif;color:${fg}">
    <div style="padding:14px 24px 4px;font-size:15px;font-weight:600">Siste uke — rekord (gull) | uten rekord (grønn) | Vekst, 375 px, ${tema==='dark'?'mørk':'lys'}</div>
    <div style="display:flex;gap:30px;padding:10px 0 20px;align-items:flex-start">
      ${kol('Oversikt — rekord', lagret[tema+'1-siste-uke'].ov)}${kol('Oversikt — uten rekord', lagret[tema+'1b-siste-uke-uten-rekord'].ov)}${kol('Vekst (månedsdiagram)', lagret[tema+'1-siste-uke'].vk)}
    </div></body></html>`);
  await pg.waitForTimeout(150);
  const fil = path.join(OUT, `A-rekord-og-uten-rekord-${tema}-375.png`); await pg.screenshot({ path:fil, fullPage:true }); bilder.unshift(fil); await c3.close();
}
for (const v of Object.values(lagret)) { fs.rmSync(v.ov, { force:true }); fs.rmSync(v.vk, { force:true }); }
await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) console.log((s.ok?'✓ ':'✗ ')+s.navn+(s.ok||!s.detalj?'':'  — '+s.detalj));
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
