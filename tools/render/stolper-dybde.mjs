// tools/render/stolper-dybde.mjs — «myk 3D»-stolpen + entré-animasjonen i den FELLES stolpen (Henrik 27.11.2026, valgt G).
//
// Begge diagrammene (Oversikt #chartBars og Vekst #trend) tegnes av stolpeHtml/.stolpe og animeres av stolpeEntre.
// Vakter (LÅSER variant G — ingen andre stiler, ingen variantbryter):
//   • gradient: vannrett, kant–midte–kant, fra stolpens EGEN grunnfarge med color-mix — kant 75 % + svart, midte 75 % +
//     hvitt, regnet mot grunnfargen per stolpe; samme på begge diagrammene
//   • skygger: inset 3px 0 6px rgba(255,255,255,.18), inset -4px 0 8px rgba(0,0,0,.35), 0 8px 12px -6px rgba(0,0,0,.6);
//     radius 4 i toppen; 0-stolper uten gradient og skygge
//   • gull bare på Vekst-rekordmåneden, med gradient, skygger OG glød; Oversikt ingen gullstolpe
//   • ingen rester av variantene (data-stolpe, --stolpe-mix, --dybde, .mspor, stolpeFra/stolpeTil) i dashbordet
//   • hakking: Chrome-sporing under entréen — alle overganger composited (bare transform/opacity, skyggene statiske),
//     ingen layout midt i animasjonen, jevne bildeintervaller
//   • animasjon: venter under bretten (IntersectionObserver), starter når diagrammet kommer til syne; scaleY 0→1,
//     700 ms, cubic-bezier(.2,.8,.2,1), 60 ms mellom stolpene; tallene (.mval) toner inn når stolpen er oppe; bare
//     transform/opacity; kjører igjen ved periodebytte og når man går tilbake til fanen; reduced motion → ferdige stolper
//   • ingen pageerror, ingen request forbi mocken
// Skjermbilder (mørk): per bredde 320/375/1280 ett ark med Oversikt og Vekst → .render-ut/stolper-dybde/stolper-<bredde>.png
//   (exit 1 ved avvik)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/stolper-dybde');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// Fast «nå»: torsdag 31.12.2026 10:00 Oslo. Siste uke = 25.–31. des, alle fargetrinn.
const NAA = new Date('2026-12-31T09:00:00Z');
const DES = { 18:3200, 19:0, 20:800, 21:1600, 22:2400, 23:0, 24:2800, 25:600, 26:1400, 27:0, 28:2000, 29:3000, 30:3600, 31:4000, 10:1200, 12:2600, 14:1800 };
const daily = Object.entries(DES).filter(([,kr]) => kr>0).map(([d,kr]) => ({ day:'2026-12-'+String(d).padStart(2,'0'), revenue:kr, count:Math.round(kr/400), new:1, returning:Math.max(0,Math.round(kr/400)-1) }));
const STATS = { daily, months_with_data:['2026-11','2026-12'], current_week_revenue:9000, best_week_revenue:12000, best_week_start:'2026-11-09', weekly_revenue:[],
  months:[{ym:'2026-07',customers:14},{ym:'2026-08',customers:22},{ym:'2026-09',customers:18},{ym:'2026-10',customers:31},{ym:'2026-11',customers:40},{ym:'2026-12',customers:27}],
  record_customers_month:{ym:'2026-11',customers:40}, completed_all_time:152 };
const BOOKINGER = [
  { id:1, name:'Jonas Berg', service:'Fade', start:'2026-12-31T13:00:00Z', end:'2026-12-31T13:40:00Z', status:'bekreftet', kilde:'bookingside' },
  { id:2, name:'Emre Yilmaz', service:'Skin fade', start:'2027-01-02T10:00:00Z', end:'2027-01-02T10:45:00Z', status:'bekreftet', kilde:'bookingside' },
];

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
let forbi = 0;

async function aapne({ bredde, hoyde=900, bevegelse=false }) {
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:hoyde }, deviceScaleFactor:2, reducedMotion: bevegelse ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.clock.setFixedTime(NAA);
  await page.addInitScript(() => { try { localStorage.setItem('bhq-theme','dark'); } catch(e){} });
  await page.route('https://api.trybarberhq.com/**', r => { if (new URL(r.request().url()).pathname.startsWith('/api/')) return r.fallback(); forbi++; return r.abort(); });
  await page.route('**/api/**', route => { const p = new URL(route.request().url()).pathname;
    const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (route.request().method() !== 'GET') return J({ ok:true });
    if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', slug:'grand-barber' });
    if (p === '/api/dashboard/billing/status') return J({ effective_plan:'vekst', effective_plan_grunn:'subscription', subscription_status:'active', plan:'vekst', page_status:'live', needs_attention:false });
    if (p === '/api/dashboard/stats') return J(STATS);
    if (p === '/api/dashboard/bookings') return J(BOOKINGER);
    if (p === '/api/dashboard/aktivering') return J({ har_bookingside_booking:true, har_booking:true });
    if (p === '/api/dashboard/ledige') return J({ antall:0, vis_banner:false });
    return J(/images|recent|services|hours|referrals|customers|winback|loyalty|date-overrides/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('#chartBars .cbar-col');
  await page.evaluate(() => document.fonts && document.fonts.ready); await page.waitForTimeout(300);
  return { ctx, page, errs };
}

// Gradientens stopp, grunnfargen og skyggene per stolpe (farger i 0–255).
const MAAL = sel => [...document.querySelectorAll(sel+' .stolpe')].map(e => {
  const c = getComputedStyle(e);
  const tall = s => { const m = s.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/); if (m) return [m[1],m[2],m[3]].map(v=>+v*255);
    const r = s.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)/); return r ? [+r[1],+r[2],+r[3]] : null; };
  const stopp = (c.backgroundImage.match(/(color\(srgb[^)]*\)|rgba?\([^)]*\))/g) || []).map(tall);
  return { null:e.classList.contains('null'), rekord:e.classList.contains('rekord'), bilde:c.backgroundImage, retning:/linear-gradient\(90deg/.test(c.backgroundImage) || /to right/.test(c.backgroundImage),
    grunn:tall(c.backgroundColor), stopp, filter:c.filter, skygge:c.boxShadow, rTopp:c.borderTopLeftRadius, rBunn:c.borderBottomLeftRadius };
});
const naer = (a, b) => a && b && a.every((v,i) => Math.abs(v-b[i]) <= 1.5);
const SKYGGE = 'rgba(255, 255, 255, 0.18) 3px 0px 6px 0px inset, rgba(0, 0, 0, 0.35) -4px 0px 8px 0px inset, rgba(0, 0, 0, 0.6) 0px 8px 12px -6px';
function sjekkStolper(tag, liste) {
  const med = liste.filter(b => !b.null);
  const feil = med.filter(b => !(b.retning && b.stopp.length===3 && naer(b.stopp[0], b.grunn.map(v=>v*.75)) && naer(b.stopp[2], b.stopp[0])
    && naer(b.stopp[1], b.grunn.map(v=>v*.75+255*.25))));
  sjekk(`${tag}: vannrett gradient kant 75 % + svart / midte 75 % + hvitt, fra stolpens egen farge`, med.length>0 && feil.length===0,
    feil.slice(0,2).map(b => JSON.stringify({grunn:b.grunn, stopp:b.stopp})).join(' | '));
  sjekk(`${tag}: myk 3D — indre skygger + bunnskygge, radius 4 / 0`, med.every(b => b.skygge===SKYGGE && b.rTopp==='4px' && b.rBunn==='0px'), med[0] && (med[0].skygge+' '+med[0].rTopp));
  sjekk(`${tag}: 0-stolper uten gradient og skygge`, liste.filter(b=>b.null).every(b => b.bilde==='none' && b.skygge==='none'));
}

// ── 1) Stilen (G) + skjermbilder: 320/375/1280 ───────────────────────────────────────────────────────
for (const bredde of [320,375,1280]) {
  const { ctx, page, errs } = await aapne({ bredde });
  await page.addStyleTag({ content:'.bunn-nav{display:none!important}' });   // sticky bunn-nav skal ikke ligge over utsnittet
  const tag = `${bredde}`;
  if (bredde===375) {
    const rester = await page.evaluate(async () => { const t = await (await fetch(location.pathname)).text();
      return (t.match(/data-stolpe|--stolpe-mix|--dybde|mspor|stolpeFra|stolpeTil/g) || []).join(','); });
    sjekk('ingen rester av variantene A–F eller variantbryteren i dashbordet', !rester, rester);
  }
  const ov = await page.evaluate(MAAL, '#chartBars');
  sjekkStolper(`${tag} Oversikt`, ov);
  sjekk(`${tag} Oversikt: ingen gullstolpe, ingen glød`, ov.every(b => !b.rekord && b.filter==='none'));
  const ovFil = path.join(OUT, `_ov-${bredde}.png`);
  const r0 = await page.evaluate(() => { const a=document.getElementById('segs').getBoundingClientRect(), b=document.querySelector('.chart-wrap').getBoundingClientRect(), p=document.getElementById('oversikt').getBoundingClientRect();
    return { x:p.left, w:p.width, y:a.top+scrollY, h:b.bottom-a.top }; });
  const w = Math.min(bredde, r0.w+32);
  await page.screenshot({ path:ovFil, fullPage:true, clip:{ x:Math.max(0,r0.x-16), y:r0.y-16, width:w, height:r0.h+32 } });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForSelector('#trend .mcol'); await page.waitForTimeout(400);
  const vk = await page.evaluate(MAAL, '#trend');
  sjekkStolper(`${tag} Vekst`, vk);
  const gull = vk.filter(b => b.rekord);
  sjekk(`${tag} Vekst: gull bare på rekordmåneden — med gradient, skygger og glød`, gull.length===1 && naer(gull[0].grunn,[240,194,75]) && /drop-shadow/.test(gull[0].filter)
    && gull[0].skygge===SKYGGE && vk.filter(b=>!b.rekord).every(b => b.filter==='none'), JSON.stringify(gull.map(b=>[b.grunn,b.filter])));
  const vkFil = path.join(OUT, `_vk-${bredde}.png`);
  const r1 = await page.evaluate(() => { const a=document.getElementById('vekstTrendH').getBoundingClientRect(), b=document.getElementById('trend').getBoundingClientRect(), p=document.getElementById('vekst').getBoundingClientRect();
    return { x:p.left, w:p.width, y:a.top+scrollY, h:b.bottom-a.top }; });
  await page.screenshot({ path:vkFil, fullPage:true, clip:{ x:Math.max(0,r1.x-16), y:r1.y-16, width:w, height:r1.h+32 } });
  sjekk(`${tag}: ingen pageerror`, errs.length===0, errs.join(' | ').slice(0,160));
  await ctx.close();
  // Ark: Oversikt | Vekst, på sidens egen bakgrunn.
  const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const c2 = await browser.newContext({ viewport:{ width:w*2+90, height:400 }, deviceScaleFactor:2 }); const pg = await c2.newPage();
  const celle = (t, f) => `<div><div style="font-size:12.5px;margin:0 0 8px;opacity:.65">${t}</div><img src="${b64(f)}" style="width:${w}px;display:block"></div>`;
  await pg.setContent(`<html><body style="margin:0;background:#0a0a0a;font-family:Inter,system-ui,sans-serif;color:#fff">
    <div style="padding:14px 30px 4px;font-size:15px;font-weight:600">Stolper ${bredde} px — myk 3D (G), mørk</div>
    <div style="display:grid;grid-template-columns:${w}px ${w}px;gap:24px 30px;padding:12px 30px 24px">
      ${celle('Oversikt (Siste uke)', ovFil)}${celle('Vekst (Kunder per måned)', vkFil)}
    </div></body></html>`);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path:path.join(OUT, `stolper-${bredde}.png`), fullPage:true }); await c2.close();
  fs.rmSync(ovFil, { force:true }); fs.rmSync(vkFil, { force:true });
}

// ── 1c) Hakking — Chrome-sporing under entréen på Vekst ─────────────────────────────────────────────────
// Krav: alle overganger kjører på compositoren (compositeFailed 0 — bare transform/opacity, skyggene statiske), ingen
// layout midt i animasjonen, og jevne bildeintervaller (headless uten GPU: grensene er romslige).
{
  const { ctx, page, errs } = await aapne({ bredde:375, hoyde:900, bevegelse:true });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForSelector('#trend .mcol'); await page.evaluate(() => scrollTo(0,0));
  await page.waitForTimeout(2500);   // første entré ferdig
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Tracing.start', { categories:'devtools.timeline,blink.animations', transferMode:'ReturnAsStream' });
  await page.evaluate(() => { window.__rammer=[]; let sist=performance.now(); (function f(t){ window.__rammer.push(t-sist); sist=t; if(window.__rammer.length<200) requestAnimationFrame(f); })(performance.now());
    stolpeEntre(document.getElementById('trend')); });
  await page.waitForTimeout(1700);
  const ferdig = new Promise(r => cdp.once('Tracing.tracingComplete', r)); await cdp.send('Tracing.end'); const { stream } = await ferdig;
  let data='', c; do { c = await cdp.send('IO.read', { handle:stream }); data += c.data; } while (!c.eof);
  const ev = (j => Array.isArray(j) ? j : j.traceEvents)(JSON.parse(data));
  const t0 = Math.min(...ev.filter(e => e.name==='UpdateLayoutTree' || e.name==='Layout').map(e => e.ts));
  const iMidten = e => (e.ts - t0)/1000 > 150 && (e.ts - t0)/1000 < 1250;   // etter oppstart, gjennom stolpene og tallene, før ryddingen
  const layout = ev.filter(e => e.name==='Layout' && e.ph==='X' && iMidten(e)).length;
  const feilet = ev.filter(e => e.args && e.args.data && e.args.data.compositeFailed).map(e => e.args.data.compositeFailed);
  const rammer = await page.evaluate(() => window.__rammer.slice(3, 60));
  const sortert = [...rammer].sort((a,b)=>a-b), p95 = sortert[Math.floor(sortert.length*0.95)], maks = sortert[sortert.length-1];
  const tr = await page.evaluate(() => [...document.querySelectorAll('#trend .stolpe, #trend .mval')].every(e => !e.style.transition || /^(transform|opacity) /.test(e.style.transition)));
  console.log(`  hakking: p95 ${p95.toFixed(1)} ms, maks ${maks.toFixed(1)} ms, layout ${layout}, ikke-composited ${feilet.length}`);
  sjekk('hakking: alle overganger på compositoren, bare transform/opacity, ingen layout midt i animasjonen', feilet.length===0 && tr && layout===0, `feilet ${feilet.join(',')}, layout ${layout}`);
  sjekk(`hakking: jevne bildeintervaller (p95 ${p95.toFixed(1)} ms, maks ${maks.toFixed(1)} ms)`, p95 < 25 && maks < 50, `p95 ${p95.toFixed(1)} / maks ${maks.toFixed(1)}`);
  sjekk('hakking: ingen pageerror', errs.length===0, errs.join(' | '));
  await ctx.close();
}

// ── 2) Animasjon ─────────────────────────────────────────────────────────────────────────────────────
const skala = (sel) => [...document.querySelectorAll(sel+' .stolpe')].map(e => { const t = getComputedStyle(e).transform; if (t==='none') return 1; const m = t.match(/matrix\(([^)]+)\)/); return m ? +m[1].split(',')[3] : 1; });
{
  const { ctx, page, errs } = await aapne({ bredde:375, hoyde:560, bevegelse:true });
  const under = await page.evaluate(() => document.getElementById('chartBars').getBoundingClientRect().top > innerHeight);
  sjekk('animasjon: Oversikt-diagrammet ligger under bretten ved lasting (forutsetning)', under);
  await page.waitForTimeout(1200);
  const foer = await page.evaluate(skala, '#chartBars');
  sjekk('animasjon: venter under bretten — stolpene står på 0 til diagrammet synes', foer.every(v => v===0), foer.join(','));
  await page.evaluate(() => document.getElementById('chartBars').scrollIntoView({ block:'center' }));
  await page.waitForTimeout(80);
  const tr = await page.evaluate(() => [...document.querySelectorAll('#chartBars .stolpe')].map(e => e.style.transition));
  sjekk('animasjon: 700 ms, cubic-bezier(.2,.8,.2,1), 60 ms mellom stolpene, bare transform',
    tr.every((t,i) => t===`transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)${i?' '+i*60+'ms':''}`), tr.slice(0,3).join(' | '));
  await page.waitForTimeout(250);
  const midt = await page.evaluate(skala, '#chartBars');
  sjekk('animasjon: én etter én (første er lenger oppe enn siste underveis)', midt[0] > midt[midt.length-1], midt.map(v=>v.toFixed(2)).join(','));
  await page.waitForTimeout(1400);
  const etter = await page.evaluate(skala, '#chartBars');
  const rydd = await page.evaluate(() => [...document.querySelectorAll('#chartBars .stolpe')].every(e => !e.style.transition && !e.style.transform));
  sjekk('animasjon: ferdig på skala 1, inline-stilene ryddet', etter.every(v => v===1) && rydd, etter.join(','));
  // Periodebytte → kjører igjen.
  await page.click('#segs [data-p="2uker"]'); await page.waitForTimeout(60);
  const p2 = await page.evaluate(skala, '#chartBars');
  sjekk('periodebytte (Siste 2 uker): animasjonen kjører igjen', p2.length===14 && p2[p2.length-1] < 1, p2.map(v=>v.toFixed(2)).join(','));
  await page.waitForTimeout(2000);
  // Vekst: tallene toner inn etter stolpen.
  await page.evaluate(() => switchPanel('vekst')); await page.waitForSelector('#trend .mcol');
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(80);
  const vt = await page.evaluate(() => [...document.querySelectorAll('#trend .mcol')].map(c => ({ bar:c.querySelector('.stolpe').style.transition, tall:c.querySelector('.mval')?.style.transition || '' })));
  sjekk('Vekst: samme entré (700 ms / 60 ms), tallene toner inn når stolpen er oppe (opacity, forsinkelse = stolpens + 700 ms)',
    vt.every((v,i) => v.bar===`transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)${i?' '+i*60+'ms':''}` && (!v.tall || v.tall===`opacity 250ms ${i*60+700}ms`)), JSON.stringify(vt.slice(0,2)));
  await page.waitForTimeout(150);
  const tallTidlig = await page.evaluate(() => [...document.querySelectorAll('#trend .mval')].map(e => +getComputedStyle(e).opacity));
  sjekk('Vekst: tallene er skjult mens stolpene vokser', tallTidlig.every(v => v < 0.05), tallTidlig.join(','));
  await page.waitForTimeout(1600);
  const tallSent = await page.evaluate(() => [...document.querySelectorAll('#trend .mval')].map(e => +getComputedStyle(e).opacity));
  const vkEtter = await page.evaluate(skala, '#trend');
  sjekk('Vekst: til slutt står stolpene og tallene ferdige', tallSent.every(v => v===1) && vkEtter.every(v => v===1), tallSent.join(',')+' / '+vkEtter.join(','));
  // Tilbake til Oversikt → kjører igjen.
  await page.evaluate(() => switchPanel('oversikt')); await page.waitForTimeout(80);
  await page.evaluate(() => document.getElementById('chartBars').scrollIntoView({ block:'center' })); await page.waitForTimeout(100);
  const tilbake = await page.evaluate(skala, '#chartBars');
  sjekk('tilbake til Oversikt: animasjonen kjører igjen', tilbake[tilbake.length-1] < 1, tilbake.map(v=>v.toFixed(2)).join(','));
  sjekk('animasjon: ingen pageerror', errs.length===0, errs.join(' | ').slice(0,160));
  await ctx.close();
}
{ // Reduced motion: ferdige stolper med en gang, tallene synlige, ingen inline-animasjon.
  const { ctx, page, errs } = await aapne({ bredde:375, hoyde:560 });
  const ov = await page.evaluate(skala, '#chartBars');
  await page.evaluate(() => switchPanel('vekst')); await page.waitForSelector('#trend .mcol'); await page.waitForTimeout(50);
  const vk = await page.evaluate(skala, '#trend'), tall = await page.evaluate(() => [...document.querySelectorAll('#trend .mval')].map(e => +getComputedStyle(e).opacity));
  sjekk('reduced motion: stolpene står ferdige uten animasjon, tallene synlige', ov.every(v=>v===1) && vk.every(v=>v===1) && tall.every(v=>v===1), ov.join(',')+' / '+vk.join(',')+' / '+tall.join(','));
  sjekk('reduced motion: ingen pageerror', errs.length===0, errs.join(' | '));
  await ctx.close();
}

await browser.close(); server.close();
sjekk('ingen request forbi mocken', forbi===0, forbi);
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) console.log((s.ok?'✓ ':'✗ ')+s.navn+(s.ok||!s.detalj?'':'  — '+s.detalj));
console.log(`\n${sjekker.length-feil.length}/${sjekker.length} sjekker grønne. Skjermbilder: ${OUT}`);
process.exit(feil.length ? 1 : 0);
