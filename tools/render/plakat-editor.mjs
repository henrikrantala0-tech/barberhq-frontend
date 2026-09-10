// tools/render/plakat-editor.mjs — Kampanjeplakat-editoren i dashbordet (lag 1 + lag 2 + lag 3a + 3b).
// Lag 3a: celle-trykkflater over iframen (/layout-mock), samme s som iframe-skalering (align < 2px),
//   tap treffer riktig celle, ett-bilde-maler har implisitt valgt celle. Se S3 + 2×2-blokken.
// Lag 3b: dra tekstblokken — vertikal + horisontal hjelpelinje ved midtstilling, lokal flytting (ingen
//   fetch per piksel), én reload ved slipp, gjennomsiktig håndtak. Se S3B + dra-blokken.
// Lag 3c: beskjæring — hjørne-ikon → Cropper-view låst til cellens aspect, rect i bilde-piksler innenfor
//   bildets grenser. Se crop-blokken (ekte webp for naturlige dimensjoner).
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
// Kryss-origin bilde-server UTEN Access-Control-Allow-Origin — simulerer R2 (som ikke sender CORS).
// Regresjonsvern for crossOrigin-fella: et slikt bilde MÅ fortsatt gi cropperInit=true (crop rect-only).
const IMG_WEBP = fs.readFileSync(path.join(ROOT, 'no/images/layout-profil.webp'));
const noCorsServer = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type':'image/webp' }); r.end(IMG_WEBP); });
await new Promise(r => noCorsServer.listen(0, r));
const NOCORS_PORT = noCorsServer.address().port;

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
// Miniatyrene er <img src=/render?…> → /render MÅ svare med ekte bilde-bytes, ikke 1×1 (som blir en
// svart flate strukket over kortet). Vi pre-rendrer POSTER_BG(bg) til en PNG per bakgrunn (bygges etter
// browser-launch) og serverer den etter background-param, så miniatyrene viser faktisk plakat-innhold.
let POSTER_PNG = {};
// POST-preview (Form B): ekko base64-bildene inn i posteren så srcdoc viser at kamerarull-bildet fløt gjennom.
const POSTER_KAM = datas => '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}.p{width:1080px;height:1350px;background:#141414;display:flex;align-items:center;justify-content:center;gap:20px}</style></head><body><div class="p">'+datas.map(d=>'<img src="'+d+'" style="width:420px;height:520px;object-fit:cover;border-radius:14px;border:4px solid #2f6df6">').join('')+'</div></body></html>';
// SELV-KONSISTENT mock: offer-teksten tegnes PÅ /layout.tekst-recten (samme TEKST_RECT), så dra-boksen
// (som leser /layout.tekst) faktisk omslutter teksten. Ellers bommer boksen i renderen uten at noe feiler.
const TEKST_RECT = { x:90, y:760, w:900, h:340 };  // lerret-px; delt av mockLayout OG POSTER_BG
// Bakgrunns-reflekterende poster: mocken tegner mørk/lys/beige etter background-parameteren + skriver den
// synlig, så et screenshot BEVISER hvilken bakgrunn editoren faktisk sendte (mørk = lys ble tvunget).
// B4-synk: bakgrunnsverdien heter 'beige' (backend døpte om 'sand' → 'beige'); palett-navnet er fortsatt 'sand'.
const BG_FARGE = { mork:['#141414','#e9d8b8'], lys:['#f3efe6','#3a2f22'], beige:['#efe6d6','#5a4a2f'] };
// tekstOffset (dx,dy) MÅ honoreres — ellers følger ikke mock-teksten dra-boksen, og post-drag ser det ut
// som om boksen bommer (ekte backend flytter offer-blokka via fillPoster, jf. plakat-tekstoffset.test.mjs).
const POSTER_BG = (bg, dx=0, dy=0) => { const f = BG_FARGE[bg] || BG_FARGE.mork; const t = TEKST_RECT;
  return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}'
    +'.p{position:relative;width:1080px;height:1350px;background:'+f[0]+';color:'+f[1]+';font-family:system-ui}'
    +'.tekst{position:absolute;left:'+(t.x+dx)+'px;top:'+(t.y+dy)+'px;width:'+t.w+'px;height:'+t.h+'px;box-sizing:border-box;'
    +'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font:700 90px system-ui}'
    +'.b{position:absolute;left:0;right:0;top:48px;text-align:center;font-size:52px;opacity:.7}'
    +'</style></head><body><div class="p"><div class="b">background='+bg+'</div>'
    +'<div class="tekst">Verv en venn<br>begge får 45%</div></div></body></html>'; };
// Ekte /regler-form (byggRegler for en KREM-barber, verifisert 10.09 mot backend): mal2/mal4/2×2 mangler
// lys → lys-barber på dem må tvinges mørk. utseendeVersjon = epoch-ms (cache-buster på miniatyr-URL).
const UTSEENDE_V = 1789041600000;
const MALER_KREM = {
  tekst:        { bilder:0, formater:{ '4:5':{ bakgrunner:['mork','beige','lys'], qr:true }, '9:16':{ bakgrunner:['mork','beige','lys'], qr:false } } },
  mal2:         { bilder:1, formater:{ '4:5':{ bakgrunner:['mork','beige'], qr:true }, '9:16':{ bakgrunner:['mork','beige'], qr:false } } },
  mal3:         { bilder:2, formater:{ '4:5':{ bakgrunner:['mork','beige','lys'], qr:true } } },
  mal4:         { bilder:3, formater:{ '4:5':{ bakgrunner:['mork','beige'], qr:true } } },
  'fire-bilder':{ bilder:4, formater:{ '4:5':{ bakgrunner:['mork','beige'], qr:true } } },
};
const OPPLAST = path.resolve(ROOT, 'no/images/layout-profil.webp'); // ekte fil å «velge fra kamerarull»
// Ekte webp → Cropper får naturlige pikseldimensjoner i lag-3c-beskjæringen (data-URI ville gitt 0 el. feil).
const IMAGES4 = ['bilde-1','bilde-2','bilde-3','bilde-4'].map((_,i)=>({ id:`${i+1}1111111-1111-1111-1111-111111111111`, url:'/no/images/layout-profil.webp', slot:'galleri', sort_order:i }));
// /layout-mock: celle-geometri i lerret-piksler per antall (2×2 for fire, én stor for ett-bilde) + aspect.
function mockLayout(antall){
  const CV = { w:1080, h:1350 };
  const asp = c => ({ ...c, aspect: Math.round((c.w/c.h)*10000)/10000 });
  if (antall <= 0) return { canvas:CV, celler:[] };
  let celler;
  if (antall === 1) celler = [{ slot:'bilde-1', x:60, y:120, w:960, h:1110 }];
  else if (antall === 4) celler = [
    { slot:'bilde-1', x:60, y:120, w:468, h:543 }, { slot:'bilde-2', x:552, y:120, w:468, h:543 },
    { slot:'bilde-3', x:60, y:687, w:468, h:543 }, { slot:'bilde-4', x:552, y:687, w:468, h:543 } ];
  else { const w = Math.floor((960 - (antall-1)*24)/antall); celler = Array.from({length:antall},(_,i)=>({ slot:'bilde-'+(i+1), x:60+i*(w+24), y:120, w, h:1110 })); }
  return { canvas:CV, celler: celler.map(asp), tekst: (antall===0 ? null : { ...TEKST_RECT }) };
}

function router(plan, previewStatus, ctr, images=IMAGES, design=DESIGN){ return route => {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
  const json = (o,s=200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
  const CSP = { 'content-security-policy':"style-src 'self' 'unsafe-inline'; img-src https: data:" };
  if (p === '/api/dashboard/plakat/preview'){
    if (previewStatus === 403) return route.fulfill({ status:403, contentType:'application/json', body:JSON.stringify({error:'Plakater krever Vekst.'}) });
    if (previewStatus === 400) return route.fulfill({ status:400, contentType:'application/json', body:JSON.stringify({error:'Denne kombinasjonen finnes ikke.'}) });
    if (req.method()==='POST'){ let body={}; try{ body=req.postDataJSON(); }catch(e){}
      const datas=(body.plasser||[]).filter(x=>x&&x.data).map(x=>x.data);
      return route.fulfill({ status:200, contentType:'text/html', headers:CSP, body: datas.length ? POSTER_KAM(datas) : POSTER_BG(body.background||'mork', +(body.tdx||0), +(body.tdy||0)) });
    }
    return route.fulfill({ status:200, contentType:'text/html', headers:CSP, body:POSTER_BG(url.searchParams.get('background')||'mork', +(url.searchParams.get('tdx')||0), +(url.searchParams.get('tdy')||0)) });
  }
  if (p === '/api/dashboard/plakat/render') { if (ctr) ctr.n++;
    const bg = url.searchParams.get('background') || 'mork';
    return route.fulfill({ status:200, contentType:'image/png', body: POSTER_PNG[bg] || POSTER_PNG.mork || PNG1x1 }); }
  if (p === '/api/dashboard/plakat/layout') return json(mockLayout(Math.max(0, Math.min(4, parseInt(url.searchParams.get('antall'),10)||0))));
  if (p === '/api/dashboard/plakat/regler') return json({ skjoldStyrke:{ min:0.6, max:1.4, default:1 }, barber:{ palette:design.palette, morkSperret:design.palette==='sand', utseendeVersjon:UTSEENDE_V }, maler:MALER_KREM });
  if (p === '/api/dashboard/profile')        return json(PROFILE);
  if (p === '/api/dashboard/design')         return json(design);
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
  return { iframe: !!frame, srcdocSatt: !!(frame && frame.srcdoc && /Verv en venn/.test(frame.srcdoc)),
    segs: document.querySelectorAll('.pk-seg').length, slider: !!q('.pk-slider'), checks: document.querySelectorAll('.pk-check input').length,
    sliderMin: q('.pk-slider') ? q('.pk-slider').min : null, sliderMax: q('.pk-slider') ? q('.pk-slider').max : null, sliderVal: q('.pk-slider') ? q('.pk-slider').value : null,
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
// Lag 3b: tekst-dra — hjelpelinjer, offset (fra sessionStorage) og gjennomsiktig håndtak.
const S3B = `()=>{ const wrap=document.getElementById('plakatPrevWrap'); const box=wrap.querySelector('.pk-tekst');
  const gv=wrap.querySelector('.pk-guide-v'), gh=wrap.querySelector('.pk-guide-h');
  let st=null; try{ st=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){}
  const p=st&&(st.plakater||[]).filter(x=>x.id===st.valgtId)[0];
  return { guideV:gv?getComputedStyle(gv).display:null, guideH:gh?getComputedStyle(gh).display:null,
    tdx:p?p.tdx:null, tdy:p?p.tdy:null, transp: box?getComputedStyle(box).backgroundColor==='rgba(0, 0, 0, 0)':null }; }`;

const browser = await chromium.launch();
// Bygg poster-PNG-ene (4:5-lerret) én gang — /render-mocken serverer dem etter background.
{ const pp = await browser.newPage({ viewport:{ width:1080, height:1350 }, deviceScaleFactor:1 });
  for (const bg of ['mork','lys','beige']) { await pp.setContent(POSTER_BG(bg), { waitUntil:'load' }); POSTER_PNG[bg] = await pp.screenshot({ type:'png' }); }
  await pp.close(); }
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
  // Skjerm 1 (tre maler): 2 galleri-bilder → «Uten bilde»/«Ett bilde» tilgjengelige (2 miniatyrer),
  // «Fire bilder» (2×2, krever 4) låst (1, ingen fetch). Tre like kort, ingen «Flere maler»-seksjon.
  const s1 = await page.evaluate(eval(S1));
  await shot(page, `skjerm1-${bredde}`);
  rad.push({ skjerm:`1 · ${bredde}`, kort:s1.kort, laast:s1.laast, thumbs:s1.thumbs, lastet:s1.lastet, renderKall:ctr.n,
    'låst=ingen-fetch': ctr.n === (s1.kort - s1.laast) ? 'ok' : 'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  // Skjerm 2, mal 2 («Ett bilde», antall=1) → skjoldstyrke-slider + ÉN implisitt valgt celle
  await page.locator('.plakat-kort').nth(1).click(); await page.waitForTimeout(1000);
  const m = await page.evaluate(eval(S2));
  await shot(page, `skjerm2-${bredde}`);
  rad.push({ skjerm:`2 · ${bredde}`, iframe:m.iframe, srcdoc:m.srcdocSatt?'ok':'FEIL', 'segs(2 fmt)':m.segs, slider:m.slider,
    'styrke': m.sliderMin+'–'+m.sliderMax+'@'+m.sliderVal, 'checks(2)':m.checks, 'celle(1)':m.celler, 'implisitt':m.implisittValgt,
    'laster':m.lasterVist, 'feil':m.feilVist, jsfeil: errs.length?errs.join('; '):'ingen' });
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
  rad.push({ bredde:'375 mal1', iframe:m.iframe, srcdoc:m.srcdocSatt?'ok':'FEIL', 'segs(2 fmt)':m.segs, slider:m.slider, 'checks(2)':m.checks, laster:'—', feil:'—', jsfeil:'—' });
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
  rad.push({ bredde:'375 403', iframe:m.iframe, srcdoc:'—', 'segs(2 fmt)':m.segs, slider:m.slider, 'checks(2)':m.checks, laster:m.lasterVist, feil:m.feilVist+' «'+m.feilTekst+'»', jsfeil:'—' });
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

// Lag 3b — dra tekstblokken opp til lerretets senter: begge hjelpelinjer, lokal flytting (ingen fetch
// per piksel), én reload ved slipp (2 req: status-fetch + iframe-src), gjennomsiktig håndtak. @320/375.
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let prev = 0; page.on('request', r => { if (r.url().includes('/plakat/preview')) prev++; });
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1200);
  // Base-posisjon (tdx=tdy=0): dra-boksens skjerm-rect skal matche skalert /layout.tekst-rect < 2px —
  // samme krav som celle-overlayene (S3). Fanger «boks bommer på teksten» maskinelt, ikke bare med øyne.
  const boksAlign = await page.evaluate((T) => { const wrap=document.getElementById('plakatPrevWrap'); const box=wrap&&wrap.querySelector('.pk-tekst');
    if(!wrap||!box) return { avvik:999 }; const wr=wrap.getBoundingClientRect(), s=wrap.clientWidth/1080, r=box.getBoundingClientRect();
    const avvik=Math.max(Math.abs((r.left-wr.left)-T.x*s), Math.abs((r.top-wr.top)-T.y*s), Math.abs(r.width-T.w*s), Math.abs(r.height-T.h*s));
    return { avvik:Math.round(avvik*100)/100 }; }, TEKST_RECT);
  const prevFoer = prev;
  const s = await page.evaluate(() => document.getElementById('plakatPrevWrap').clientWidth/1080);
  const opp = (930-675)*s;  // px opp: offer-blokkens senter (y 760+340/2=930) → lerretets vertikale midt (675)
  const bb = await page.locator('.pk-tekst').boundingBox(); const cx = bb.x+bb.width/2, cy = bb.y+bb.height/2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i=1;i<=8;i++){ await page.mouse.move(cx, cy-opp*i/8); await page.waitForTimeout(20); }
  const prevUnderDrag = prev;
  // MID-DRAG: boksen er flyttet, men ingen ny preview er lastet ennå (ingen fetch per piksel) → mock-teksten
  // står fortsatt på base-y. «Boks over, tekst under» her er RIKTIG og forventet — draget er ikke sluppet.
  await page.screenshot({ path:`${OUT}/plakat-3b-mid-drag-${bredde}.png`, fullPage:false });
  await page.mouse.up(); await page.waitForTimeout(700);
  const m = await page.evaluate(eval(S3B));
  // POST-RELEASE: ny preview lastet med tekstOffset → mock-teksten har fulgt boksen. Boks og EKTE mock-tekst
  // skal være samlokalisert < 2px (samme krav som base-align), nå på den forskjøvede posisjonen.
  const postBox = await page.evaluate(() => { const wrap=document.getElementById('plakatPrevWrap'); const box=wrap&&wrap.querySelector('.pk-tekst');
    if(!wrap||!box) return null; const wr=wrap.getBoundingClientRect(), b=box.getBoundingClientRect();
    return { wl:wr.left, wt:wr.top, s:wrap.clientWidth/1080, bl:b.left, bt:b.top, bw:b.width, bh:b.height }; });
  const frB = await (await page.$('#plakatFrame')).contentFrame();
  const mtxt = frB ? await frB.evaluate(() => { const e=document.querySelector('.tekst'); if(!e) return null; const r=e.getBoundingClientRect(); return { left:r.left, top:r.top, w:r.width, h:r.height }; }) : null;
  let postAvvik = 999;
  if (postBox && mtxt) { const tl=postBox.wl+mtxt.left*postBox.s, tt=postBox.wt+mtxt.top*postBox.s, tw=mtxt.w*postBox.s, th=mtxt.h*postBox.s;
    postAvvik = Math.round(Math.max(Math.abs(postBox.bl-tl), Math.abs(postBox.bt-tt), Math.abs(postBox.bw-tw), Math.abs(postBox.bh-th))*100)/100; }
  await page.screenshot({ path:`${OUT}/plakat-3b-etter-slipp-${bredde}.png`, fullPage:false });
  rad.push({ skjerm:`3b · dra ${bredde}`, 'boksAvvikPx':boksAlign.avvik, 'boks-align<2px': boksAlign.avvik<2?'ok':'FEIL',
    guideV:m.guideV, guideH:m.guideH, begge:(m.guideV==='block'&&m.guideH==='block')?'ok':'FEIL',
    tdx:m.tdx, tdy:m.tdy, 'ingen-per-piksel': prevUnderDrag===prevFoer?'ok':'FEIL', 'reload=1x(1 req)': (prev-prevUnderDrag)===1?'ok':'FEIL',
    'post-avvik-px':postAvvik, 'post-samlokalisert<2px': postAvvik<2?'ok':'FEIL',
    'håndtak-transp': m.transp?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Lag 3c — beskjæring: hjørne-ikon åpner crop-view; boksen er låst til cellens aspect; resultatet er
// {x,y,w,h} i bildets EGNE piksler, klampet innenfor bildet (backend avviser utenfor).
// Beslutning 6: ingen «Bruk»-knapp — kryss (.pk-crop-x) lukker OG lagrer; laget monteres på <body>.
{
  const ASP = Math.round((468/543)*10000)/10000;
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1200);
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(200);   // velg celle → «Beskjær» aktiveres
  await page.locator('.pk-bildeknapper-btn', { hasText:'Beskjær' }).click(); await page.waitForTimeout(900);
  const kro = await page.evaluate(() => { const c=document.querySelector('.pk-crop');
    return { aapen:!!c, x:!!document.querySelector('.pk-crop-x'), bruk:!!document.querySelector('.pk-crop-bruk'), body:!!(c&&c.parentElement===document.body) }; });
  const NW = await page.evaluate(() => { const i=document.querySelector('.pk-crop-canvas img'); return i?i.naturalWidth:0; });
  const NH = await page.evaluate(() => { const i=document.querySelector('.pk-crop-canvas img'); return i?i.naturalHeight:0; });
  const dr = async (sel,dx,dy)=>{ const bb=await page.locator(sel).boundingBox(); if(!bb) return; const x=bb.x+bb.width/2,y=bb.y+bb.height/2;
    await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+dx,y+dy); await page.mouse.up(); await page.waitForTimeout(100); };
  await dr('.cropper-face', 24, -18); await dr('.cropper-point.point-se', -40, -30);   // flytt + skaler boksen
  await shot(page, 'lag3c-375');
  await page.click('.pk-crop-x'); await page.waitForTimeout(400);   // beslutning 6: kryss lukker + lagrer (ingen Bruk-knapp)
  const lukket = await page.evaluate(() => !document.querySelector('.pk-crop'));
  const rect = await page.evaluate(() => { let st=null; try{ st=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){}
    const p=st&&(st.plakater||[]).filter(x=>x.id===st.valgtId)[0]; return p&&p.rects?p.rects['bilde-1']:null; });
  const aspOk = rect ? Math.abs((rect.w/rect.h)-ASP)<0.06 : false;
  const inn = rect ? (rect.x>=0&&rect.y>=0&&rect.x+rect.w<=NW&&rect.y+rect.h<=NH) : false;
  rad.push({ skjerm:'3c · crop', cropAapen:kro.aapen?'ok':'FEIL', 'X+ingen-Bruk': (kro.x&&!kro.bruk)?'ok':'FEIL', 'på body':kro.body?'ok':'FEIL',
    'X lukket':lukket?'ok':'FEIL', 'bilde-px':NW+'×'+NH, rect:rect?`${rect.x},${rect.y},${rect.w}×${rect.h}`:null,
    'aspekt-låst': aspOk?'ok':'FEIL', innenfor: inn?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Beslutning 7 — «Endre bilde»: bytt-ikon per celle → velger (på <body>) → valgt bilde lagres i p.bilder.
{
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1100);
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(200);   // velg celle → «Endre bilde» aktiveres
  const harEndre = await page.evaluate(() => [...document.querySelectorAll('.pk-bildeknapper-btn')].some(b=>b.textContent==='Endre bilde'));
  await page.locator('.pk-bildeknapper-btn', { hasText:'Endre bilde' }).click(); await page.waitForTimeout(500);
  const v = await page.evaluate(() => { const l=document.querySelector('.pk-bildevelg');
    return { aapen:!!l, body:!!(l&&l.parentElement===document.body), bilder:document.querySelectorAll('.pk-bildevelg-bilde').length }; });
  await page.locator('.pk-bildevelg-bilde').nth(2).click(); await page.waitForTimeout(400);   // velg 3. bilde
  const e = await page.evaluate(() => { let st=null; try{ st=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(x){}
    const p=st&&(st.plakater||[]).filter(x=>x.id===st.valgtId)[0]; return { valgt:p&&p.bilder?p.bilder['bilde-1']:null, lukket:!document.querySelector('.pk-bildevelg') }; });
  rad.push({ skjerm:'7 · endre bilde', 'endre-knapp':harEndre?'ok':'FEIL', velger:v.aapen?'ok':'FEIL', 'på body':v.body?'ok':'FEIL', 'bilder(4)':v.bilder,
    'swap lagret': e.valgt==='31111111-1111-1111-1111-111111111111'?'ok':'FEIL', lukket:e.lukket?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Del 2 — kamerarull: «Velg bilde» har en Kamerarull-flis → opplasting blir nedskalert base64 i cellen (POST).
{
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let post = 0; page.on('request', r => { if (r.method()==='POST' && r.url().includes('/plakat/preview')) post++; });
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1100);
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(200);   // velg celle → «Endre bilde» aktiveres
  await page.locator('.pk-bildeknapper-btn', { hasText:'Endre bilde' }).click(); await page.waitForTimeout(500);
  const flis = await page.evaluate(() => !!document.querySelector('.pk-bildevelg-kamera'));
  await page.locator('.pk-bildevelg-kamera input[type=file]').setInputFiles(OPPLAST); await page.waitForTimeout(1300);   // velg fil → nedskaler → POST
  const b = await page.evaluate(() => { let s=null; try{ s=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){}
    const p=s&&(s.plakater||[]).filter(x=>x.id===s.valgtId)[0]; const im=p&&p.bilder?p.bilder['bilde-1']:null;
    return { base64: !!(im&&im.data&&/^data:image\/jpeg/.test(im.data)), w:im?im.width:null, h:im?im.height:null }; });
  rad.push({ skjerm:'del2 · kamerarull', flis:flis?'ok':'FEIL', 'celle=base64':b.base64?'ok':'FEIL', dim:b.w+'×'+b.h, POST:post>0?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Lys-gating + cache-buster — LYS krem-barber (mode:lys) med 4 galleri-bilder → alle fem maler
// tilgjengelige. 2×2 (fire) og mal2 mangler lys-variant → editoren MÅ tvinge mørk; mal3/tekst har lys
// → beholdes. Miniatyr-URL-ene skal bære v=<utseendeVersjon>. Bevises både på param og på skjerm-farge.
const DESIGN_LYS = { ...DESIGN, mode:'lys' };
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const miniByCount = {}; const previewBg = {};
  page.on('request', r => { const u=r.url();
    if (u.includes('/plakat/render')){ const q=new URL(u).searchParams;
      if (q.get('bredde')==='400'){ let pl=[]; try{ pl=JSON.parse(q.get('plasser')||'[]'); }catch(e){}
        miniByCount[pl.length] = { bg:q.get('background'), v:q.get('v') }; } }
    if (u.includes('/plakat/preview')){ const bg = r.method()==='POST'
      ? (()=>{ let b={}; try{ b=r.postDataJSON(); }catch(e){} return b.background; })()
      : new URL(u).searchParams.get('background'); previewBg._siste = bg; }
  });
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4, DESIGN_LYS));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(1100);
  await page.screenshot({ path:`${OUT}/plakat-lysgating-skjerm1-${bredde}.png`, fullPage:false });   // miniatyr-vegg: lys/mørk blandet
  // Skjerm 1: miniatyr-bakgrunn per bildeantall (lys-barber): «Uten bilde» (tekst, 0) beholder lys,
  // «Ett bilde» (mal2, 1) og 2×2 (fire, 4) tvinges mørk. Alle miniatyr-URL-er bærer v=<utseendeVersjon>.
  const alleV = Object.values(miniByCount).every(x => x.v === String(UTSEENDE_V));
  // Skjerm 2, «Fire bilder» (2×2, ingen lys) → background=mork tvunget, poster tegnes mørk.
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1100);
  const bgFire = previewBg._siste;
  await page.screenshot({ path:`${OUT}/plakat-lysgating-fire-${bredde}.png`, fullPage:false });
  // Tilbake → «Uten bilde» (mal1/tekst, HAR lys) → background=lys beholdt, poster tegnes lys (ingen over-tvang).
  await page.click('#plakatBack'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Uten bilde' }).click(); await page.waitForTimeout(1100);
  const bgMal1 = previewBg._siste;
  await page.screenshot({ path:`${OUT}/plakat-lysgating-mal1-${bredde}.png`, fullPage:false });
  rad.push({ skjerm:`lys-gate · ${bredde}`,
    'mini2×2(mørk)': (miniByCount[4]||{}).bg==='mork'?'ok':'FEIL', 'mini-tekst(lys)': (miniByCount[0]||{}).bg==='lys'?'ok':'FEIL',
    'alle v=utseende': alleV?'ok':'FEIL', 'fire→bg': bgFire, 'tvunget-mørk': bgFire==='mork'?'ok':'FEIL',
    'mal1→bg': bgMal1, 'lys-beholdt': bgMal1==='lys'?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Punkt 4 — bevis mot EKTE backend-geometri (ikke mock): fixtures/plakat-mal2-*.{json,html} er generert i
// backend-repoet fra byggLayout() + fillPoster() (samme spec.offer). Dra-boksen (fra ekte /layout.tekst)
// skal omslutte den EKTE offer-blokka i den ekte poster-HTML-en < 2px. Måler boksens skjerm-rect mot
// offer-blokkas faktiske rect INNE i iframen (mappet lerret→skjerm med samme s).
{
  const FIX_LAYOUT = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures/plakat-mal2-layout.json'), 'utf8'));
  const FIX_HTML = fs.readFileSync(path.resolve(import.meta.dirname, 'fixtures/plakat-mal2-preview.html'), 'utf8');
  for (const bredde of [320, 375]) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    const base = router('vekst', 200, null, IMAGES, DESIGN);   // mørk barber, 2 galleri → «Ett bilde» tilgjengelig
    await page.route('**/api/**', route => { const u = new URL(route.request().url()); const pth = u.pathname;
      if (pth === '/api/dashboard/plakat/layout')  return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(FIX_LAYOUT) });
      if (pth === '/api/dashboard/plakat/preview') return route.fulfill({ status:200, contentType:'text/html', body:FIX_HTML });
      return base(route); });
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
    await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
    await page.locator('.plakat-kort', { hasText:'Ett bilde' }).click(); await page.waitForTimeout(1600);
    await page.screenshot({ path:`${OUT}/plakat-ekte-boks-${bredde}.png`, fullPage:false });
    // Boksens skjerm-rect + wrap-origo + s (parent). Offer-blokkas rect hentes fra iframen (lerret-koord).
    const M = await page.evaluate(() => { const wrap=document.getElementById('plakatPrevWrap'); const box=wrap&&wrap.querySelector('.pk-tekst');
      if(!wrap||!box) return null; const wr=wrap.getBoundingClientRect(), b=box.getBoundingClientRect();
      return { wl:wr.left, wt:wr.top, s:wrap.clientWidth/1080, bl:b.left, bt:b.top, bw:b.width, bh:b.height }; });
    const fr = await (await page.$('#plakatFrame')).contentFrame();
    // Offer-blokka er den absoluttposisjonerte div-en på ekte offer-y (unik i HTML-en). getBoundingClientRect
    // inne i iframen = lerret-koordinater (iframe-viewport er 1080 bredt).
    const off = fr ? await fr.evaluate((y) => { const e=document.querySelector('[style*="top:'+y+'px"]'); if(!e) return null;
      const r=e.getBoundingClientRect(); return { left:r.left, top:r.top, w:r.width, h:r.height }; }, FIX_LAYOUT.tekst.y) : null;
    let avvik = 999;
    if (M && off) { const offL=M.wl+off.left*M.s, offT=M.wt+off.top*M.s, offW=off.w*M.s, offH=off.h*M.s;
      avvik = Math.round(Math.max(Math.abs(M.bl-offL), Math.abs(M.bt-offT), Math.abs(M.bw-offW), Math.abs(M.bh-offH))*100)/100; }
    rad.push({ skjerm:`ekte-geo · ${bredde}`, 'layout.tekst': `${FIX_LAYOUT.tekst.x},${FIX_LAYOUT.tekst.y},${FIX_LAYOUT.tekst.w}×${FIX_LAYOUT.tekst.h}`,
      'offer-funnet': off?'ok':'FEIL', 'boks-avvik-px': avvik, 'boks-på-ekte-tekst<2px': avvik<2?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
    await page.close();
  }
}

// Regresjon — crossOrigin-fella: crop-bildet ligger på en KRYSS-ORIGIN server UTEN CORS (R2-simulering).
// Uten crossOrigin='anonymous' skal bildet fortsatt lastes (naturalWidth>0) og Cropper initialiseres —
// crop er rect-only og trenger ikke ren canvas. Med crossOrigin ville dette gitt naturalWidth=0 → død crop.
for (const bredde of [320, 375, 1280]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const XIMG = ['a','b','c','d'].map((_,i)=>({ id:`${i+1}0000000-0000-0000-0000-000000000000`, url:`http://localhost:${NOCORS_PORT}/x.webp`, slot:'galleri', sort_order:i }));
  await page.route('**/api/**', router('vekst', 200, null, XIMG, DESIGN));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort', { hasText:'Fire bilder' }).click(); await page.waitForTimeout(1200);
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(200);   // 2×2 krever valgt celle
  await page.locator('.pk-bildeknapper-btn', { hasText:'Beskjær' }).click(); await page.waitForTimeout(1500);   // vent img.onload + Cropper
  const cr = await page.evaluate(() => { const lag=document.querySelector('.pk-crop'); const cont=document.querySelector('.cropper-container');
    const img=document.querySelector('.pk-crop-canvas img'); return { modal:!!lag, init:!!cont, nw: img?img.naturalWidth:0 }; });
  await page.screenshot({ path:`${OUT}/plakat-crop-nocors-${bredde}.png`, fullPage:false });
  // Ende-til-ende: kryss lukker+lagrer → getData/getImageData (ingen piksel-lesing) skal gi en gyldig rect.
  await page.locator('.pk-crop-x').click().catch(()=>{}); await page.waitForTimeout(400);
  const lagret = await page.evaluate(() => { let s=null; try{ s=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){}
    const p=s&&(s.plakater||[]).filter(x=>x.id===s.valgtId)[0]; const r=p&&p.rects&&p.rects['bilde-1']; return r?`${r.x},${r.y},${r.w}×${r.h}`:null; });
  rad.push({ skjerm:`crop u/CORS · ${bredde}`, 'modal-åpen': cr.modal?'ok':'FEIL', 'cropper-init': cr.init?'ok':'FEIL',
    'naturalWidth>0': cr.nw>0?('ok('+cr.nw+')'):'FEIL(0)', 'rect-lagret': lagret?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Sak 2 — «Beskjær»/«Endre bilde»-tekstknapper + to-kolonne på desktop. @320/375/1280, tre maler, med/uten
// valgt celle. Celle-ikonene skal være borte; knappene virker på valgt celle; ≥768px = to kolonner.
for (const bredde of [320, 375, 1280]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4, DESIGN));   // 4 galleri → alle tre maler tilgjengelige
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  const knappeStatus = () => page.evaluate(() => { const rad=document.querySelector('.pk-bildeknapper');
    const btns=[...document.querySelectorAll('.pk-bildeknapper-btn')]; const hint=document.querySelector('.pk-hint');
    return { radVist: rad?getComputedStyle(rad).display!=='none':false, antBtn:btns.length,
      alleDeakt: btns.length>0 && btns.every(b=>b.disabled), ingenDeakt: btns.length>0 && btns.every(b=>!b.disabled),
      hintVist: hint?getComputedStyle(hint).display!=='none':false, ikoner: document.querySelectorAll('.pk-celle-crop').length }; });
  await page.locator('.plakat-kort',{hasText:'Uten bilde'}).click(); await page.waitForTimeout(1100);
  const m1 = await knappeStatus();                                   // mal 1 → rad skjult
  await page.click('#plakatBack'); await page.waitForTimeout(400);
  await page.locator('.plakat-kort',{hasText:'Ett bilde'}).click(); await page.waitForTimeout(1100);
  const m2 = await knappeStatus();                                   // mal 2 → aktive, hint skjult
  await page.screenshot({ path:`${OUT}/plakat-sak2-mal2-${bredde}.png`, fullPage:false });
  await page.click('#plakatBack'); await page.waitForTimeout(400);
  await page.locator('.plakat-kort',{hasText:'Fire bilder'}).click(); await page.waitForTimeout(1200);
  const f0 = await knappeStatus();                                   // 2×2 uten valg → deaktivert + hint
  await page.screenshot({ path:`${OUT}/plakat-sak2-2x2-uvalgt-${bredde}.png`, fullPage:false });
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(300);
  const f1 = await knappeStatus();                                   // 2×2 med valg → aktive
  await page.screenshot({ path:`${OUT}/plakat-sak2-2x2-valgt-${bredde}.png`, fullPage:false });
  await page.locator('.pk-bildeknapper-btn',{hasText:'Beskjær'}).click(); await page.waitForTimeout(900);
  const cropAapnet = await page.evaluate(()=>!!document.querySelector('.pk-crop'));
  await page.locator('.pk-crop-x').click().catch(()=>{}); await page.waitForTimeout(300);
  let desk = {};
  if (bredde===1280) desk = await page.evaluate(() => { const prev=document.querySelector('.plakat-prev'); const kontr=document.querySelector('.plakat-kontroller');
    const ned=[...document.querySelectorAll('.pk-actions .btn-outline')].find(b=>b.textContent==='Last ned'); const del=document.querySelector('.pk-del'); const slid=document.querySelector('.pk-slider');
    const pr=prev&&prev.getBoundingClientRect(), kr=kontr&&kontr.getBoundingClientRect(), nr=ned&&ned.getBoundingClientRect();
    return { toKol: !!(pr&&kr)&&pr.right<=kr.left+1, lastNedSynlig: !!(nr&&nr.width>0&&nr.right<=innerWidth+1),
      delSkjult: del?getComputedStyle(del).display==='none':null, sliderInnenfor: (slid&&kr)?slid.getBoundingClientRect().width<=kr.width+1:null }; });
  rad.push({ skjerm:`sak2 · ${bredde}`, 'mal1-skjult': m1.radVist===false?'ok':'FEIL', 'mal2-aktiv': (m2.radVist&&m2.ingenDeakt&&!m2.hintVist)?'ok':'FEIL',
    '2x2-uvalgt': (f0.radVist&&f0.alleDeakt&&f0.hintVist)?'ok':'FEIL', '2x2-valgt': (f1.ingenDeakt&&!f1.hintVist)?'ok':'FEIL',
    'ikoner=0': f1.ikoner===0?'ok':'FEIL', 'beskjær→crop': cropAapnet?'ok':'FEIL',
    ...(bredde===1280?{ '2-kol':desk.toKol?'ok':'FEIL', 'lastned-synlig':desk.lastNedSynlig?'ok':'FEIL', 'del-skjult':desk.delSkjult?'ok':'FEIL', 'slider-innenfor':desk.sliderInnenfor?'ok':'FEIL' }:{}),
    jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Skjold er PLAKAT-globalt, ikke per celle: cellevalg/-bytte på 2×2 endrer ikke p.skjoldStyrke, utløser
// INGEN ny render (skjoldet står som før), og styrke-param bærer ingen celle-referanse. Fullflate over alt.
{
  const page = await browser.newPage({ viewport:{ width:375, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const styrkeParams = []; let celleParam = false;
  page.on('request', r => { const u=r.url(); if(u.includes('/plakat/preview')||u.includes('/plakat/render')){
    const q=new URL(u).searchParams; if(q.has('styrke')) styrkeParams.push(q.get('styrke'));
    if([...q.keys()].some(k=>/valgtcelle|^celle$|slot/i.test(k))) celleParam=true; } });
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4, DESIGN));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort',{hasText:'Fire bilder'}).click(); await page.waitForTimeout(1300);   // initial preview → styrke-param
  const les = () => page.evaluate(() => { let s=null; try{ s=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){}
    const p=s&&(s.plakater||[]).filter(x=>x.id===s.valgtId)[0]; return { styrke:p?p.skjoldStyrke:null, valgt:p?p.valgtCelle:null }; });
  const s0=await les(); const nFoer=styrkeParams.length;
  await page.locator('.pk-celle').nth(0).click(); await page.waitForTimeout(250); const s1=await les();
  await page.locator('.pk-celle').nth(1).click(); await page.waitForTimeout(250); const s2=await les();   // øvre celler (ikke under tekst-boksen som nå ligger på topp, z-index:4)
  const nEtter=styrkeParams.length;
  rad.push({ skjerm:'skjold-global', 'styrke uendret v/cellebytte': (s0.styrke===s1.styrke && s1.styrke===s2.styrke && s0.styrke!=null)?('ok('+s0.styrke+')'):'FEIL',
    'celle faktisk byttet': (s1.valgt!==s2.valgt && s2.valgt!=null)?'ok':'FEIL',
    'ingen ny render v/cellevalg': nEtter===nFoer?'ok':'FEIL', 'styrke-param sendt': styrkeParams.length>0?'ok':'FEIL',
    'ingen celle-param i kall': !celleParam?'ok':'FEIL', jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// B4-synk — sand-PALETT-barber (palett-navnet er fortsatt 'sand') skal få background 'beige' (ikke 'sand',
// ikke 400, ikke feil farge). Bekrefter at frontend sender den omdøpte verdien og at posteren tegnes beige.
const DESIGN_SAND = { ...DESIGN, palette:'sand', mode:'lys' };   // sand-paletten er lys-only
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:900 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let bgParam=null;
  page.on('request', r => { const u=r.url(); if(u.includes('/plakat/preview')){ if(r.method()==='POST'){ let b={}; try{ b=r.postDataJSON(); }catch(e){} bgParam=b.background; } else bgParam=new URL(u).searchParams.get('background'); } });
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4, DESIGN_SAND));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort',{hasText:'Ett bilde'}).click(); await page.waitForTimeout(1400);
  await page.screenshot({ path:`${OUT}/plakat-b4-sand-beige-${bredde}.png`, fullPage:false });
  const feilVist = await page.evaluate(()=>{ const f=document.getElementById('plakatPrevFeil'); return f?getComputedStyle(f).display!=='none':false; });
  const fr = await (await page.$('#plakatFrame')).contentFrame();
  const posterBg = fr ? await fr.evaluate(()=>{ const p=document.querySelector('.p'); return p?getComputedStyle(p).backgroundColor:null; }) : null;
  rad.push({ skjerm:`b4 sand→beige · ${bredde}`, 'bg-param': bgParam, 'er beige': bgParam==='beige'?'ok':'FEIL',
    'ikke 400/feil': feilVist===false?'ok':'FEIL', 'poster beige-farge': posterBg==='rgb(239, 230, 214)'?'ok':('FEIL('+posterBg+')'), jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Bug 3 — dra-boksen må ligge OVER cellene etter bildebytte: re-innsatte .pk-celler skal ikke okkludere
// .pk-tekst. To assertions: (a) elementFromPoint på boks-senter treffer .pk-tekst (ikke en .pk-celle);
// (b) boksen er faktisk DRAGBAR etter swap (tdy endres). Uten fiksen fanges cellene peker-eventene → FEIL.
for (const bredde of [320, 375, 1280]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1100 }, deviceScaleFactor:1 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', 200, null, IMAGES4, DESIGN));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort',{hasText:'Fire bilder'}).click(); await page.waitForTimeout(1200);
  await page.locator('.pk-celle').first().click(); await page.waitForTimeout(200);
  // Bytt bilde (trigger tegnCeller — den re-innsatte cellene som før okkluderte boksen)
  await page.locator('.pk-bildeknapper-btn',{hasText:'Endre bilde'}).click(); await page.waitForTimeout(500);
  await page.locator('.pk-bildevelg-bilde').nth(1).click(); await page.waitForTimeout(700);
  const lesTdy = () => page.evaluate(() => { let s=null; try{ s=JSON.parse(sessionStorage.getItem('bhq-plakat')); }catch(e){} const p=s&&(s.plakater||[]).filter(x=>x.id===s.valgtId)[0]; return p?(p.tdy||0):null; });
  const paaTopp = await page.evaluate(() => { const b=document.querySelector('.pk-tekst'); if(!b) return false;
    const r=b.getBoundingClientRect(); const el=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)); return !!(el && el.closest('.pk-tekst')); });
  const bb = await page.locator('.pk-tekst').boundingBox(); const cx=bb.x+bb.width/2, cy=bb.y+bb.height/2;
  const tdyFoer = await lesTdy();
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i=1;i<=5;i++){ await page.mouse.move(cx, cy-8*i); await page.waitForTimeout(15); }
  await page.mouse.up(); await page.waitForTimeout(200);
  const tdyEtter = await lesTdy();
  await page.screenshot({ path:`${OUT}/plakat-bug3-dra-etter-swap-${bredde}.png`, fullPage:false });
  rad.push({ skjerm:`bug3 dra-boks · ${bredde}`, 'boks-på-topp-etter-swap': paaTopp?'ok':'FEIL',
    'dragbar-etter-swap': (tdyEtter!=null && tdyFoer!=null && tdyEtter<tdyFoer)?'ok':'FEIL', 'tdy': tdyFoer+'→'+tdyEtter, jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Bug 6 — bytt bilde → bytt format skal vise NYTT bilde. FORSINKET /layout (>250ms) eksponerer racen:
// uten fiksen fyrer preview mens _layout er i transitt → plasserFor fallback til standard (gammelt) bilde.
// Med fiksen (behold gammel _layout + sekvensér preview etter layout) bærer preview alltid nytt bilde-id.
for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const previewPlasser = [];   // image_id-lister fra hvert GET /preview
  page.on('request', r => { const u=r.url(); if(u.includes('/plakat/preview') && r.method()==='GET'){
    try{ const pl=JSON.parse(new URL(u).searchParams.get('plasser')||'[]'); previewPlasser.push(pl.map(x=>x.image_id||(x.data?'base64':null))); }catch(e){} } });
  const base = router('vekst', 200, null, IMAGES4, DESIGN);
  await page.route('**/api/**', async route => { const p=new URL(route.request().url()).pathname;
    if (p==='/api/dashboard/plakat/layout'){ await new Promise(res=>setTimeout(res,400)); return base(route); }   // forsinket layout
    return base(route); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
  await openAcc(page, '#accVerv'); await page.click('#plakatOpenVerving'); await page.waitForTimeout(500);
  await page.locator('.plakat-kort',{hasText:'Ett bilde'}).click(); await page.waitForTimeout(1700);   // mal2 (4:5+9:16), vent forsinket layout
  await page.locator('.pk-bildeknapper-btn',{hasText:'Endre bilde'}).click(); await page.waitForTimeout(500);
  await page.locator('.pk-bildevelg-bilde').nth(1).click(); await page.waitForTimeout(900);            // bytt til bilde B (2. galleri)
  previewPlasser.length=0;                                                                              // se kun preview ETTER formatbytte
  await page.locator('.pk-seg', { hasText:'9:16' }).click(); await page.waitForTimeout(1400);           // bytt format → forsinket layout + preview
  const B='21111111-1111-1111-1111-111111111111';   // IMAGES4[1].id (2. galleri-bilde)
  const siste = previewPlasser[previewPlasser.length-1] || [];
  rad.push({ skjerm:`bug6 bilde/format · ${bredde}`, 'preview-plasser-etter-format': JSON.stringify(siste),
    'bærer NYTT bilde (B)': siste.includes(B)?'ok':'FEIL', 'antall preview etter format': previewPlasser.length, jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

console.table(rad);
console.log('JS-feil:', rad.filter(r=>r.jsfeil && r.jsfeil!=='ingen' && r.jsfeil!=='—').length);
await browser.close(); server.close(); noCorsServer.close();
