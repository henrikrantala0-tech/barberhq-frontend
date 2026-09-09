// tools/render/plakat-editor.mjs — Kampanjeplakat-editoren i dashbordet (lag 1 + lag 2 + lag 3a).
// Lag 3a: celle-trykkflater over iframen (/layout-mock), samme s som iframe-skalering (align < 2px),
//   tap treffer riktig celle, ett-bilde-maler har implisitt valgt celle. Se S3 + 2×2-blokken.
// Lag 1: to sekundærknapper i Vekst-trekkspillene → fullskjerm-overlay, skjerm 1 (velg plakat).
//   Skjerm 1 = fem maler; tilgjengelige kort får lat-lastet miniatyr (GET /render?bredde=400),
//   låste kort får INGEN <img> og henter aldri (verifiseres: renderKall == antall tilgjengelige).
// Lag 2: skjerm 2 = levende preview i <iframe src=…/plakat/preview> (skalert 1080-lerret) + kontroller
//   (format/bakgrunn/skjoldstyrke/QR/lenke/last ned/del), debounce, laster-indikator, 400/403-feilstate.
// Mocker /api/dashboard/* (inkl. plakat/preview + /render). Screenshots → .render-ut/plakat-*.png.
//   node tools/render/plakat-editor.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const svg = c => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${c}"/></svg>`);
const IMAGES = [
  { id:'11111111-1111-1111-1111-111111111111', url:svg('#c0392b'), slot:'galleri', sort_order:0 },
  { id:'22222222-2222-2222-2222-222222222222', url:svg('#2980b9'), slot:'galleri', sort_order:1 },
];
const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', address:'', tagline:'Fades', bio:'', booking_horizon_days:28 };
const DESIGN = { palette:'krem', font:'jakarta', layout:'profil', mode:'mork', customAccent:null, savedLayout:'profil' };
const LOY = { enabled:true, threshold:10, pct:100, count_history:false, participants:[], eligible:[], totals:{in_progress:0,ready:0,redeemed_month:0,participants:0,eligible:0} };
// Mock-poster: 1080×1350-lerret som iframen skalerer. Egen CSP-header (som backend).
const POSTER = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}.p{width:1080px;height:1350px;background:linear-gradient(160deg,#141414,#3a2f22);color:#e9d8b8;font:700 90px system-ui;display:flex;align-items:center;justify-content:center;text-align:center}</style></head><body><div class="p">Verv en venn<br>begge får 45%</div></body></html>';
const PNG1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQABsaG/AAAAAElFTkSuQmCC','base64');
const IMAGES4 = ['#c0392b','#2980b9','#27ae60','#8e44ad'].map((c,i)=>({ id:`${i+1}1111111-1111-1111-1111-111111111111`, url:svg(c), slot:'galleri', sort_order:i }));
// /layout-mock: celle-geometri i lerret-piksler per antall (2×2 for fire, én stor for ett-bilde).
function mockLayout(antall){
  const CV = { w:1080, h:1350 };
  if (antall <= 0) return { canvas:CV, celler:[] };
  if (antall === 1) return { canvas:CV, celler:[{ slot:'bilde-1', x:60, y:120, w:960, h:1110 }] };
  if (antall === 4) return { canvas:CV, celler:[
    { slot:'bilde-1', x:60, y:120, w:468, h:543 }, { slot:'bilde-2', x:552, y:120, w:468, h:543 },
    { slot:'bilde-3', x:60, y:687, w:468, h:543 }, { slot:'bilde-4', x:552, y:687, w:468, h:543 } ] };
  const w = Math.floor((960 - (antall-1)*24)/antall);
  return { canvas:CV, celler:Array.from({length:antall},(_,i)=>({ slot:'bilde-'+(i+1), x:60+i*(w+24), y:120, w, h:1110 })) };
}

function router(plan, previewStatus, ctr, images=IMAGES){ return route => {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
  const json = (o,s=200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
  if (p === '/api/dashboard/plakat/preview'){
    if (previewStatus === 403) return route.fulfill({ status:403, contentType:'application/json', body:JSON.stringify({error:'Plakater krever Vekst.'}) });
    if (previewStatus === 400) return route.fulfill({ status:400, contentType:'application/json', body:JSON.stringify({error:'Denne kombinasjonen finnes ikke.'}) });
    return route.fulfill({ status:200, contentType:'text/html', headers:{'content-security-policy':"style-src 'self' 'unsafe-inline'; img-src https: data:"}, body:POSTER });
  }
  if (p === '/api/dashboard/plakat/render') { if (ctr) ctr.n++; return route.fulfill({ status:200, contentType:'image/png', body:PNG1x1 }); }
  if (p === '/api/dashboard/plakat/layout') return json(mockLayout(Math.max(0, Math.min(4, parseInt(url.searchParams.get('antall'),10)||0))));
  if (p === '/api/dashboard/profile')        return json(PROFILE);
  if (p === '/api/dashboard/design')         return json(DESIGN);
  if (p === '/api/dashboard/images')         return json(images);
  if (p === '/api/dashboard/billing/status') return json({ subscription_status: plan==='basis'?'active':'trialing', page_status:'live', plan: plan==='basis'?'basis':null, effective_plan:plan, effective_plan_grunn: plan==='basis'?'subscription':'trial_vindu', trial_days_left:30, myk_periode:false, needs_attention:false });
  if (p === '/api/dashboard/loyalty')        return json(LOY);
  if (p === '/api/dashboard/settings')       return json({ referral_reward_recipient:'begge', referral_discount_pct:45, loyalty_enabled:true, loyalty_threshold:10, loyalty_pct:100 });
  return json(/images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg/.test(p) ? [] : {});
}; }

const shot = (page, n) => page.screenshot({ path:`${OUT}/plakat-l2b-${n}.png`, fullPage:false });
async function openAcc(page, sel){ await page.evaluate((s)=>{ const h=document.querySelector(s+' .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click(); }, sel); await page.waitForTimeout(300); }
const S1 = `() => ({ kort:document.querySelectorAll('.plakat-kort').length, laast:document.querySelectorAll('.plakat-kort.laast').length,
  thumbs:document.querySelectorAll('img.plakat-kort-thumb').length, lastet:document.querySelectorAll('.plakat-kort.har-miniatyr').length })`;
const S2 = `() => { const q=s=>document.querySelector(s); const frame=q('#plakatFrame');
  return { iframe: !!frame, srcErPreview: !!(frame && /\\/plakat\\/preview\\?/.test(frame.src)),
    segs: document.querySelectorAll('.pk-seg').length, slider: !!q('.pk-slider'), checks: document.querySelectorAll('.pk-check input').length,
    celler: document.querySelectorAll('.pk-celle').length, implisittValgt: !!q('.pk-celle.implisitt.valgt'),
    lasterVist: q('#plakatPrevLaster') ? getComputedStyle(q('#plakatPrevLaster')).display!=='none' : null,
    feilVist: q('#plakatPrevFeil') ? getComputedStyle(q('#plakatPrevFeil')).display!=='none' : null,
    feilTekst: q('#plakatPrevFeil') ? q('#plakatPrevFeil').textContent : '' }; }`;
// Lag 3a: måler hver celle-trykkflate mot forventet wrap.left + celle·s (samme s som iframe-skalering).
const S3 = `() => { const wrap=document.getElementById('plakatPrevWrap'); if(!wrap) return { celler:0 };
  const cv={w:1080,h:1350}, wr=wrap.getBoundingClientRect(), s=wrap.clientWidth/cv.w;
  const geo=[{x:60,y:120,w:468,h:543},{x:552,y:120,w:468,h:543},{x:60,y:687,w:468,h:543},{x:552,y:687,w:468,h:543}];
  const kn=[...document.querySelectorAll('.pk-celle')]; let maxAvvik=0;
  kn.forEach((b,i)=>{ const r=b.getBoundingClientRect(), c=geo[i]||{x:0,y:0,w:0,h:0};
    maxAvvik=Math.max(maxAvvik, Math.abs((r.left-wr.left)-c.x*s), Math.abs((r.top-wr.top)-c.y*s), Math.abs(r.width-c.w*s), Math.abs(r.height-c.h*s)); });
  const v=document.querySelector('.pk-celle.valgt');
  return { celler:kn.length, maxAvvikPx:Math.round(maxAvvik*100)/100, valgtSlot: v?v.dataset.slot:null }; }`;

const browser = await chromium.launch();
const rad = [];

for (const bredde of [320, 375]) {
  const ctr = { n:0 };
  const page = await browser.newPage({ viewport:{ width:bredde, height:820 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, ctr));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv');
  await page.click('#plakatOpenVerving'); await page.waitForTimeout(800);   // skjerm 1 (miniatyrer laster)
  // Skjerm 1: 2 galleri-bilder → mal1/mal2/mal3 tilgjengelige (3 miniatyrer), mal4/2×2 låst (2, ingen fetch).
  const s1 = await page.evaluate(eval(S1));
  await shot(page, `skjerm1-${bredde}`);
  rad.push({ skjerm:`1 · ${bredde}`, kort:s1.kort, laast:s1.laast, thumbs:s1.thumbs, lastet:s1.lastet, renderKall:ctr.n,
    'låst=ingen-fetch': ctr.n === (s1.kort - s1.laast) ? 'ok' : 'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  // Skjerm 2, mal 2 («Ett bilde», antall=1) → skjoldstyrke-slider + ÉN implisitt valgt celle
  await page.locator('.plakat-kort').nth(1).click(); await page.waitForTimeout(1000);
  const m = await page.evaluate(eval(S2));
  await shot(page, `skjerm2-${bredde}`);
  rad.push({ skjerm:`2 · ${bredde}`, iframe:m.iframe, 'src=preview':m.srcErPreview, 'segs(2 fmt)':m.segs, slider:m.slider, 'checks(2)':m.checks,
    'celle(1)':m.celler, 'implisitt':m.implisittValgt, 'laster':m.lasterVist, 'feil':m.feilVist, jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// mal 1 («Uten bilde») → INGEN skjoldstyrke-slider
{
  const page = await browser.newPage({ viewport:{ width:375, height:820 }, deviceScaleFactor:2 });
  await page.route('**/api/**', router('vekst', 200));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(400);
  await page.locator('.plakat-kort').nth(0).click(); await page.waitForTimeout(600);
  const m = await page.evaluate(eval(S2));
  rad.push({ bredde:'375 mal1', iframe:m.iframe, 'src=preview':m.srcErPreview, 'segs(2 fmt)':m.segs, slider:m.slider, 'checks(2)':m.checks, laster:'—', feil:'—', jsfeil:'—' });
  await page.close();
}

// 403 → forståelig feil i stedet for tom iframe
{
  const page = await browser.newPage({ viewport:{ width:375, height:820 }, deviceScaleFactor:2 });
  await page.route('**/api/**', router('vekst', 403));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(400);
  await page.locator('.plakat-kort').nth(1).click(); await page.waitForTimeout(700);
  const m = await page.evaluate(eval(S2));
  await shot(page, 'feil-403-375');
  rad.push({ bredde:'375 403', iframe:m.iframe, 'src=preview':'—', 'segs(2 fmt)':m.segs, slider:m.slider, 'checks(2)':m.checks, laster:m.lasterVist, feil:m.feilVist+' «'+m.feilTekst+'»', jsfeil:'—' });
  await page.close();
}

// Lag 3a — 2×2: fire trykkflater over iframen, samme s (align < 2px), tap treffer riktig celle (bilde-2).
{
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1000);
  await page.locator('.pk-celle').nth(1).click(); await page.waitForTimeout(300);   // øvre-høyre = bilde-2
  const m = await page.evaluate(eval(S3));
  await shot(page, 'lag3a-2x2-375');
  rad.push({ skjerm:'3a · 2×2', celler:m.celler, maxAvvikPx:m.maxAvvikPx, valgt:m.valgtSlot,
    treff: m.valgtSlot==='bilde-2'?'ok':'FEIL', 'align<2px': m.maxAvvikPx<2?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

console.table(rad);
console.log('JS-feil:', rad.filter(r=>r.jsfeil && r.jsfeil!=='ingen' && r.jsfeil!=='—').length);
await browser.close(); server.close();
