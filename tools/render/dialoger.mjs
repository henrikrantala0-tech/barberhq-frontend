// tools/render/dialoger.mjs — alle dialoger i dashbordet: knappestil, 44 px og fokus ved åpning.
//
// For hver dialog (åpnet via sin ekte åpner der det går, ellers via funksjonen etter et ekte musklikk),
// på 320 og 375, lyst og mørkt tema:
//   • alle synlige knapper ≥ 44 px høye border-radius > 0
//   • åpnet med trykk/mus: fokus ligger I dialogen, og INGEN fokusring (outline) er synlig
//   • etter Tab: fokus på et element i dialogen, med synlig ring (:focus-visible)
//   • 0 pageerror, og ingen request når api.trybarberhq.com uten å gå gjennom mocken
// Native confirm() (Koble fra Google Calendar, Avpubliser) kan ikke styles og testes ikke her.
//
// ÉN felles lukkeknapp (.lukk-x) — for hver åpnet dialog/ark (+ hjemskjerm-kortet og fokusmodusens X i headeren):
//   • alle lukkeknapper (aria-label «Lukk…», tekst ×/✕, eller .lukk-x) har klassen .lukk-x
//   • ingen synlig ramme, ingen bakgrunn, trykkflate ≥ 44×44, SVG-ikon (ingen teksttegn)
//   • samme farge og samme ikonstørrelse på tvers av ALLE dialogene (per bredde × tema)
//   • trykk (pointerdown på X-en): fokus på X-en, INGEN outline; Tab til X-en: synlig outline
// Statisk: alle lukkeknapper i dashboard.html (markup + JS-maler) og dinside-v2.js har .lukk-x, ingen ×/✕ som
// knappetekst, de gamle X-klassene bærer ikke utseende (bare plassering), og suksessmeldingen er slettet.
//
//   node tools/render/dialoger.mjs
//
// Skjermbilder → .render-ut/dialoger/<dialog>-<bredde>-<tema>-{trykk,tab}.png (gitignorert).
// Lukkekryss → .render-ut/lukkekryss/<dialog>-<bredde>-<tema>-{trykk,tab}.png + ark-<bredde>-<tema>-<modus>.png
// (alle dialogene side om side); arkene listet i .render-ut/lukkekryss/ark.txt.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { vekst } from './fixtures/billing.mjs';
import { rutTestbilder } from './fixtures/testbilder.mjs';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/dialoger');
const OUTX = path.resolve(import.meta.dirname, '../../.render-ut/lukkekryss');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(OUTX, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// ── Mock-data ──
const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true, name:'Henrik', shop:'Grand Barber',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const past = (dagerSiden, h) => { const d = new Date(); d.setDate(d.getDate() - dagerSiden); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const BOOKINGS = [{ id:'b1', name:'Kristoffer', service:'Herreklipp', start:past(2, 11), end:past(2, 12), status:'fullfort', price_label:'350 kr', phone:'+4790000001' }];
const IMAGES = [{ id:'1', slot:'galleri', url:'/testbilder/bilde-1.webp', sort_order:0 }];
const HOURS = [1, 2, 3, 4, 5].map(w => ({ weekday:w, is_closed:false, open_time:'09:00', close_time:'17:00', breaks: w === 1 ? [{ weekday:1, start_time:'12:00', end_time:'12:30' }] : [] }));
const RECENT = { limit:10, customers:[{ customer_id:'c1', name:'Ola', phone:'+4790000003', referral_code:'OLA1', last_visit_at:past(5, 10), last_service:'Herreklipp' }] };
const SETTINGS = { referral_reward_recipient:'begge', referral_discount_pct:20, loyalty_enabled:true, loyalty_threshold:10, loyalty_pct:100, payment_methods:[] };
const REGLER = { skjoldStyrke:{ min:0.6, max:1.4, default:1 }, barber:{ morkSperret:false, utseendeVersjon:1789041600000 },
  maler:{ tekst:{ bilder:0, formater:{ '4:5':{ bakgrunner:['mork','beige','lys'], qr:true }, '9:16':{ bakgrunner:['mork','beige','lys'], qr:true } } },
          mal2:{ bilder:1, formater:{ '4:5':{ bakgrunner:['mork','beige'], qr:true } } },
          'fire-bilder':{ bilder:4, formater:{ '4:5':{ bakgrunner:['mork','beige'], qr:true } } } } };
const POSTER = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}.p{width:1080px;height:1350px;background:#141414;color:#e9d8b8;font:700 90px system-ui;display:flex;align-items:center;justify-content:center}</style></head><body><div class="p">Verv en venn</div></body></html>';
const STORY = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}.s{width:1080px;height:1920px;background:#141414;color:#fff;font:700 80px system-ui;display:flex;align-items:center;justify-content:center}</style></head><body><div class="s">Ledige timer</div></body></html>';
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQABsaG/AAAAAElFTkSuQmCC', 'base64');

let mocket = 0;
const router = route => {
  mocket++;
  const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
  const json = (o, s = 200) => route.fulfill({ status:s, contentType:'application/json', body:JSON.stringify(o) });
  if (m !== 'GET' && m !== 'HEAD') return json({ ok:true });               // skriv besvares lokalt, når aldri noe
  if (p === '/api/dashboard/profile')            return json(PROFILE);
  if (p === '/api/dashboard/billing/status')     return json(vekst({ page_status:'live' }));
  if (p === '/api/dashboard/bookings')           return json(BOOKINGS);
  if (p === '/api/dashboard/hours')              return json(HOURS);
  if (p === '/api/dashboard/services')           return json({ hoved:[{ id:1, name:'Herreklipp', price:350, duration:30, sort:0 }], tillegg:[] });
  if (p === '/api/dashboard/images')             return json(IMAGES);
  if (p === '/api/dashboard/settings')           return json(SETTINGS);
  if (p === '/api/dashboard/customers/recent')   return json(RECENT);
  if (p === '/api/dashboard/design')             return json({ mode:'mork', font:'jakarta' });
  if (p === '/api/dashboard/loyalty')            return json({ enabled:true, threshold:10, pct:100, count_history:false, participants:[], eligible:[], totals:{ in_progress:0, ready:0, redeemed_month:0, participants:0, eligible:0 } });
  if (p === '/api/dashboard/plakat/regler')      return json(REGLER);
  if (p === '/api/dashboard/plakat/layout')      return json(+u.searchParams.get('antall') === 1   // «Ett bilde»: én celle → implisitt valgt (Beskjær/Endre bilde aktive)
    ? { canvas:{ w:1080, h:1350 }, celler:[{ slot:'bilde-1', x:60, y:120, w:960, h:1110, aspect:0.8649 }], tekst:null }
    : { canvas:{ w:1080, h:1350 }, celler:[], tekst:null });
  if (p === '/api/dashboard/plakat/preview')     return route.fulfill({ status:200, contentType:'text/html', body:POSTER });
  if (p === '/api/dashboard/plakat/render')      return route.fulfill({ status:200, contentType:'image/png', body:PNG1 });
  if (p.endsWith('/story/ledige-timer/data'))    return json({ tjenester:1, valgt_dager:4, tilgjengelige_dager:7, undertekst:'denne uka', oppdatert:'Oppdatert tor 14:30', dager:[] });
  if (p.endsWith('/story/ledige-timer/preview')) return route.fulfill({ status:200, contentType:'text/html; charset=utf-8', body:STORY });
  if (p.endsWith('/story/ledige-timer/render'))  return route.fulfill({ status:200, contentType:'image/png', body:PNG1 });
  if (p === '/api/dashboard/ledige')             return json({ antall:5, vis_banner:true });
  if (p === '/api/dashboard/preview')            return route.fulfill({ status:200, contentType:'text/html', body:'<!DOCTYPE html><body></body>' });
  return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg|customers/.test(p) ? [] : {});
};

// Ekte musklikk på en nøytral flate (ingen handler) → peker er siste inndata, som når barbereren trykker.
async function trykkNoytralt(page) {
  await page.evaluate(() => { const d = document.createElement('div'); d.id = '__noytral';
    d.style.cssText = 'position:fixed;left:0;bottom:0;width:20px;height:20px;z-index:99999'; document.body.appendChild(d); });
  await page.click('#__noytral'); await page.evaluate(() => document.getElementById('__noytral').remove());
}
async function aapneAcc(page, sel) {
  await page.evaluate(s => { const h = document.querySelector(s + ' .acc-head'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); }, sel);
  await page.waitForTimeout(300);
}

async function aapnePlakatEttBilde(page) {
  await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(600); await aapneAcc(page, '#accVerv');
  await page.click('#plakatOpenVerving'); await page.waitForSelector('.plakat-kort', { timeout:5000 }); await page.waitForTimeout(400);
  await page.locator('.plakat-kort', { hasText:'Ett bilde' }).click(); await page.waitForSelector('.pk-bildeknapper-btn:not([disabled])', { timeout:5000 }); await page.waitForTimeout(400);
}

// rot = elementet som ER dialogen (måles og må inneholde fokus); synlig = selektor som venter til den er åpen.
const DIALOGER = [
  { navn:'beskjaering', rot:'#cropModal', synlig:'#cropModal.open', utenX:true,
    // Åpneren sitter i Din side v2 (bildekortets beskjær-knapp, i dinside-v2.js) — funksjonen kalles direkte.
    aapne: async page => { await trykkNoytralt(page); await page.evaluate(() => window._openCropModal('1', 'galleri', '/testbilder/bilde-1.webp')); await page.waitForTimeout(600); } },
  { navn:'verving', rot:'#vervModal', synlig:'#vervModal.open', utenX:true,
    aapne: async page => { await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(600); await aapneAcc(page, '#accVerv');
      await page.waitForSelector('#vervSendList .verv-btn:not([disabled])', { timeout:5000 }); await page.click('#vervSendList .verv-btn:not([disabled])'); } },
  { navn:'plakat', rot:'#plakatOverlay', synlig:'#plakatOverlay.open',
    aapne: async page => { await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(600); await aapneAcc(page, '#accVerv');
      await page.click('#plakatOpenVerving'); await page.waitForSelector('.plakat-kort', { timeout:5000 }); await page.waitForTimeout(500); } },
  { navn:'plakat-rediger', rot:'#plakatOverlay', synlig:'#plakatOverlay.open',
    aapne: async page => { await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(600); await aapneAcc(page, '#accVerv');
      await page.click('#plakatOpenVerving'); await page.waitForSelector('.plakat-kort', { timeout:5000 }); await page.waitForTimeout(400);
      await page.locator('.plakat-kort:not(.laast)').first().click(); await page.waitForTimeout(900); } },
  // Lagene «Beskjær» og «Endre bilde» legges på <body> over editoren (Ett bilde-malen, cellen er implisitt valgt).
  { navn:'plakat-beskjaer', rot:'.pk-crop', synlig:'.pk-crop',
    aapne: async page => { await aapnePlakatEttBilde(page); await page.locator('.pk-bildeknapper-btn', { hasText:'Beskjær' }).click(); await page.waitForTimeout(700); } },
  { navn:'plakat-bildevelger', rot:'.pk-bildevelg', synlig:'.pk-bildevelg',
    aapne: async page => { await aapnePlakatEttBilde(page); await page.locator('.pk-bildeknapper-btn', { hasText:'Endre bilde' }).click(); await page.waitForTimeout(300); } },
  { navn:'story', rot:'#storyOverlay', synlig:'#storyOverlay.vis',
    aapne: async page => { await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(600);
      await page.click('#storyOpen'); await page.waitForSelector('.story-dager-row .pk-seg', { timeout:5000 }); await page.waitForTimeout(500); } },
  { navn:'kalender', rot:'#calOverlay', synlig:'#calOverlay:not([hidden])',
    aapne: async page => { await page.click('#calOpenUpcoming'); await page.waitForTimeout(400); } },
  { navn:'bookingdetalj', rot:'#bkDetailBackdrop .bk-detail', synlig:'#bkDetailBackdrop:not([hidden])',
    aapne: async page => { await page.click('#calOpenUpcoming'); await page.waitForSelector('#calOverlay:not([hidden])');
      await page.evaluate(() => calGoto(calDayKey(CAL.alle[0].start))); await page.waitForTimeout(300);
      await page.locator('#calOverlay .cal-block').first().click(); } },
  { navn:'pause', rot:'#pauseBackdrop', synlig:'#pauseBackdrop:not([hidden])',
    aapne: async page => { await page.evaluate(() => switchPanel('tjenester')); await page.waitForTimeout(600); await page.click('#pauseBtn'); } },
  // Ikke dialoger, men samme X: kortet på Oversikt og fokusmodusens X i headeren. Tvinges synlige (visningsreglene har
  // egne tester: hjemskjerm-innebygd.mjs / dinside-v2.mjs) — her måles bare X-en (bareX).
  { navn:'hjemskjerm', rot:'#hsKort', synlig:'#hsKort:not([hidden])', bareX:true,
    aapne: async page => { await page.evaluate(() => { const k = document.getElementById('hsKort'); k.hidden = false;
      k.querySelectorAll('[data-hs]').forEach(el => { el.hidden = el.getAttribute('data-hs') !== 'ios'; }); k.scrollIntoView({ block:'center' }); }); } },
  { navn:'fokus', rot:'header', synlig:'body.fokus #fokusX', bareX:true,
    aapne: async page => { await page.evaluate(() => { document.body.classList.add('fokus'); window.scrollTo(0, 0); }); } },
];

// Måler dialogen: knapper (høyde/radius) + aktivt element (i dialogen? ring?).
const MAAL = rot => {
  const d = document.querySelector(rot);
  const synlig = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const ring = el => { if (!el) return false; const cs = getComputedStyle(el); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1; };
  const knapper = d ? [...d.querySelectorAll('button, a.btn, a.btn-outline, [role=button]')].filter(synlig).map(b => {
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const tekst = (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return { tekst, h: Math.round(r.height * 10) / 10, radius: parseFloat(cs.borderTopLeftRadius) || 0, vekt: cs.fontWeight };
  }) : [];
  const a = document.activeElement;
  return { finnes: !!d, knapper, fokusInne: !!(d && a && d.contains(a)), ring: ring(a),
    aktiv: a ? (a.id ? '#' + a.id : a.tagName.toLowerCase() + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '')) : '' };
};

// Lukkeknappene i rot: aria-label «Lukk…», tekst × / ✕ / ✖, eller klassen .lukk-x. Merkes med data-lx=<nr>.
const FINN_X = rot => {
  const d = document.querySelector(rot); if (!d) return [];
  const synlig = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const erX = b => /^lukk/i.test(b.getAttribute('aria-label') || '') || /^[×✕✖]$/.test((b.textContent || '').trim()) || b.classList.contains('lukk-x');
  document.querySelectorAll('[data-lx]').forEach(e => e.removeAttribute('data-lx'));
  return [...d.querySelectorAll('button')].filter(b => erX(b) && synlig(b)).map((b, i) => {
    b.dataset.lx = String(i);
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b), ikon = b.querySelector('svg');
    const ir = ikon ? ikon.getBoundingClientRect() : null, ics = ikon ? getComputedStyle(ikon) : null;
    const usynlig = c => /^transparent$|rgba\(\d+, \d+, \d+, 0\)/.test(c);
    const kant = ['Top', 'Right', 'Bottom', 'Left'].every(sd => parseFloat(cs['border' + sd + 'Width']) === 0 || usynlig(cs['border' + sd + 'Color']));
    return { navn: b.id ? '#' + b.id : (b.getAttribute('aria-label') || '?'), klasse: b.classList.contains('lukk-x'), kant,
      bgOk: usynlig(cs.backgroundColor) && cs.backgroundImage === 'none', bg: cs.backgroundColor + ' / ' + cs.backgroundImage,
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, farge: cs.color,
      ikon: ir ? `${Math.round(ir.width * 10) / 10}×${Math.round(ir.height * 10) / 10}/${ics.strokeWidth}` : 'mangler',
      tekst: (b.textContent || '').trim(), sentrum: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
  });
};
const RING_PAA = n => { const b = document.querySelector('[data-lx="' + n + '"]'); const a = document.activeElement;
  const cs = b && getComputedStyle(b);
  return { fokus: !!b && a === b, ring: !!cs && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1,
    aktiv: a ? (a.id || (typeof a.className === 'string' ? a.className : '') || a.tagName) : '' }; };
const xSamlet = {};   // `${bredde}-${tema}` → [{ dialog, farge, ikon }]
const xBilder = {};   // `${bredde}-${tema}-${modus}` → [{ dialog, fil }]

// Trykk på X-en uten å utløse klikket: pointerdown på X-en (fokus + :focus-visible-vurdering), slipp på X-ens forelder
// (klikket går da til felles forfar = forelderen, som ikke har noen lukke-handler). Midt på, 4 px ned: et hjørne kan
// ligge utenfor en avrundet forelder og treffe bakteppet, som lukker.
async function slippVedForelder(page, n) {
  const p = await page.evaluate(n => { const f = document.querySelector('[data-lx="' + n + '"]').parentElement.getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + 4 }; }, n);
  await page.mouse.move(p.x, p.y); await page.mouse.up(); await page.waitForTimeout(60);
}
// Tab til X-en (fokusfella i dialogen sykler). Er den ikke nådd innen 40 Tab (kortet/headeren ligger langt ut i siden),
// fokuseres den rett etter et Tab — tastatur er siste inndata, så :focus-visible gjelder også for focus().
async function tabTilX(page, n) {
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if ((await page.evaluate(RING_PAA, n)).fokus) return 'Tab'; }
  await page.evaluate(n => document.querySelector('[data-lx="' + n + '"]').focus(), n); return 'Tab + focus()';
}

async function lukkSjekk(page, dlg, bredde, temaNavn, id) {
  const xs = await page.evaluate(FINN_X, dlg.rot);
  // Beskjæring og verving har aldri hatt X — de lukkes med «Avbryt»/«Lukk»-knappen. Ingen X lagt til (ingen andre
  // designendringer); vakta sikrer at de heller ikke får en X uten .lukk-x.
  if (dlg.utenX) { sjekk(xs.length === 0, `${id}: ingen X (lukkes med tekstknapp)`, xs.map(x => x.navn).join(', ')); return; }
  sjekk(xs.length > 0, `${id}: har lukkeknapp (X)`, 'ingen funnet');
  const nokkel = `${bredde}-${temaNavn}`;
  for (const [n, x] of xs.entries()) {
    const xid = `${id} · X ${x.navn}`;
    sjekk(x.klasse, `${xid}: klassen .lukk-x`);
    sjekk(x.kant, `${xid}: ingen synlig ramme`);
    sjekk(x.bgOk, `${xid}: ingen bakgrunn`, x.bg);
    sjekk(x.w >= 44 && x.h >= 44, `${xid}: trykkflate ≥ 44×44`, `${x.w}×${x.h}`);
    sjekk(x.ikon !== 'mangler' && x.tekst === '', `${xid}: SVG-ikon, ingen teksttegn`, `ikon ${x.ikon}, tekst «${x.tekst}»`);
    (xSamlet[nokkel] ||= []).push({ dialog: `${dlg.navn} ${x.navn}`, farge: x.farge, ikon: x.ikon });
    // Pekeren må stå over X-en (et lag kan ha flyttet seg siden målingen): mål sentrum på nytt.
    const c = await page.evaluate(n => { const r = document.querySelector('[data-lx="' + n + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, n);
    // Fokus kan allerede stå på X-en med ring (Tab-steget over) — da ville trykket bare beholdt den. Start uten fokus.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.waitForTimeout(80);
    const t = await page.evaluate(RING_PAA, n);
    if (n === 0) { const fil = `${OUTX}/${dlg.navn}-${bredde}-${temaNavn}-trykk.png`; await page.screenshot({ path: fil });
      (xBilder[`${nokkel}-trykk`] ||= []).push({ dialog: dlg.navn, fil }); }
    await slippVedForelder(page, n);
    sjekk(t.fokus && !t.ring, `${xid}: trykk — fokus på X, ingen outline`, `fokus ${t.fokus} (${t.aktiv}), ring ${t.ring}`);
    const vei = await tabTilX(page, n); await page.waitForTimeout(60);
    const k = await page.evaluate(RING_PAA, n);
    if (n === 0) { const fil = `${OUTX}/${dlg.navn}-${bredde}-${temaNavn}-tab.png`; await page.screenshot({ path: fil });
      (xBilder[`${nokkel}-tab`] ||= []).push({ dialog: dlg.navn, fil }); }
    sjekk(k.fokus && k.ring, `${xid}: Tab — synlig outline (${vei})`, `fokus ${k.fokus} (${k.aktiv}), ring ${k.ring}`);
  }
}

const browser = await chromium.launch();
const prodTreff = [];
for (const bredde of [320, 375]) for (const tema of ['light', 'dark']) {
  const temaNavn = tema === 'light' ? 'lys' : 'mork';
  for (const dlg of DIALOGER) {
    const ctx = await browser.newContext({ viewport:{ width:bredde, height:780 }, deviceScaleFactor:2 });
    await ctx.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (_) {} }, tema);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    // Catch-all FØR alt annet: relative /api/** og alt mot prod-verten går til mocken.
    await page.route('**/api/**', router);
    await page.route(u => new URL(u).hostname === 'api.trybarberhq.com' && !new URL(u).pathname.startsWith('/api/'), r => r.abort());
    page.on('request', r => { if (new URL(r.url()).hostname === 'api.trybarberhq.com') prodTreff.push(r.url()); });
    await rutTestbilder(page);
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.waitForTimeout(900);
    const id = `${dlg.navn} · ${bredde} · ${temaNavn}`;
    try {
      await dlg.aapne(page);
      await page.waitForSelector(dlg.synlig, { timeout:5000 });
      await page.waitForTimeout(250);
    } catch (e) { sjekk(false, `${id}: dialogen åpnes`, e.message.split('\n')[0]); await ctx.close(); continue; }

    if (dlg.bareX) {
      await lukkSjekk(page, dlg, bredde, temaNavn, id);
      sjekk(!errs.length, `${id}: ingen pageerror`, errs.join('; '));
      await ctx.close(); continue;
    }
    const t = await page.evaluate(MAAL, dlg.rot);
    await page.screenshot({ path:`${OUT}/${dlg.navn}-${bredde}-${temaNavn}-trykk.png` });
    sjekk(t.finnes && t.knapper.length > 0, `${id}: dialogen har synlige knapper`, `fant ${t.knapper.length}`);
    for (const k of t.knapper) {
      const min = 44;
      sjekk(k.h >= min, `${id}: «${k.tekst}» ≥ ${min} px`, `${k.h} px`);
      sjekk(k.radius > 0, `${id}: «${k.tekst}» har avrundede hjørner`, `radius ${k.radius}`);
    }
    sjekk(t.fokusInne, `${id}: trykk-åpnet — fokus i dialogen`, `aktivt: ${t.aktiv}`);
    sjekk(!t.ring, `${id}: trykk-åpnet — ingen fokusring`, `ring på ${t.aktiv}`);

    await page.keyboard.press('Tab'); await page.waitForTimeout(120);
    const k = await page.evaluate(MAAL, dlg.rot);
    await page.screenshot({ path:`${OUT}/${dlg.navn}-${bredde}-${temaNavn}-tab.png` });
    sjekk(k.fokusInne, `${id}: etter Tab — fokus i dialogen`, `aktivt: ${k.aktiv}`);
    sjekk(k.ring, `${id}: etter Tab — synlig fokusring`, `ingen ring på ${k.aktiv}`);
    await lukkSjekk(page, dlg, bredde, temaNavn, id);
    sjekk(!errs.length, `${id}: ingen pageerror`, errs.join('; '));
    await ctx.close();
  }
}

// Tastatur-åpnet (én bredde/tema holder — logikken er tema-uavhengig): fokus på første kontroll MED ring.
{
  const ctx = await browser.newContext({ viewport:{ width:375, height:780 }, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => switchPanel('tjenester')); await page.waitForTimeout(500);
  await page.focus('#pauseBtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const m = await page.evaluate(MAAL, '#pauseBackdrop');
  sjekk(m.fokusInne && m.ring, 'Tastatur-åpnet pause: fokus på første kontroll med ring', `aktivt ${m.aktiv}, ring ${m.ring}`);
  await page.keyboard.press('Escape'); await page.focus('#pauseClose'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const tilbake = await page.evaluate(() => document.activeElement && document.activeElement.id);
  sjekk(tilbake === 'pauseBtn', 'Tastatur-lukket pause: fokus tilbake på åpneren', `aktivt ${tilbake}`);
  sjekk(!errs.length, 'Tastatur-runde: ingen pageerror', errs.join('; '));
  await ctx.close();
}

// ── Samme farge og samme ikonstørrelse på tvers av ALLE dialogene (per bredde × tema) ──
for (const [nokkel, liste] of Object.entries(xSamlet)) {
  const farger = [...new Set(liste.map(x => x.farge))], ikoner = [...new Set(liste.map(x => x.ikon))];
  sjekk(farger.length === 1, `Lukkeknapper ${nokkel}: samme farge i alle ${liste.length}`, liste.map(x => `${x.dialog}=${x.farge}`).join(', '));
  sjekk(ikoner.length === 1, `Lukkeknapper ${nokkel}: samme ikonstørrelse i alle ${liste.length}`, liste.map(x => `${x.dialog}=${x.ikon}`).join(', '));
  console.log(`  ${nokkel}: farge ${farger.join(' | ')}, ikon ${ikoner.join(' | ')} (${liste.length} X-er)`);
}
sjekk(Object.keys(xSamlet).length === 4, 'Lukkeknapper målt på 320/375 × lys/mørk', Object.keys(xSamlet).join(', '));

// ── Statisk: alle lukkeknapper i markup + JS-maler har .lukk-x ──
{
  const KILDER = ['no/dashboard.html', 'no/dinside-v2.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  let antall = 0; const uten = [];
  for (const [f, src] of KILDER) {
    // (?!<button) i innholdet: «<button>» i en kommentar kan ikke starte en match som sluker neste ekte knapp.
    for (const m of src.matchAll(/<button\b([^>]*)>((?:(?!<button\b)[\s\S])*?)<\/button>/g)) {
      const attr = m[1], inni = m[2];
      const label = (attr.match(/aria-label="([^"]*)"/) || [])[1] || '';
      const tekst = inni.replace(/<[^>]*>/g, '').trim();
      const x = /^lukk/i.test(label) || /^(×|&times;|✕|✖)$/.test(tekst) || /LUKK_X_SVG|M6 6l12 12/.test(inni) || /\blukk-x\b/.test(attr);
      if (!x || /^fjern/i.test(label)) continue;   // .svc-rm («Fjern» en rad) er en slette-knapp, ikke en lukkeknapp
      antall++;
      if (!/class="[^"]*\blukk-x\b/.test(attr)) uten.push(`${f}: ${m[0].slice(0, 90)}`);
    }
    // createElement-knapper: ingen X-tegn satt direkte (de skal gå via lagLukkX)
    for (const m of src.matchAll(/(textContent|innerHTML)\s*=\s*(['"])(×|&times;|✕|✖)\2/g)) uten.push(`${f}: ${m[0]}`);
    antall += (src.match(/lagLukkX\('/g) || []).length;
  }
  console.log(`  statisk: ${antall} lukkeknapper (markup + JS-maler)`);
  sjekk(antall >= 10, 'Statisk: lukkeknapper funnet i markup + JS-maler', `${antall}`);
  sjekk(!uten.length, 'Statisk: alle lukkeknapper har .lukk-x (ingen ×/✕-tekst)', uten.join(' | '));
  const dash = KILDER[0][1];
  // De gamle X-klassene står bare igjen som plasseringskroker — ingen farge/ramme/bakgrunn/størrelse/font.
  const css = [...dash.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const dode = [];
  for (const m of css.matchAll(/([^{}]*\.(?:pause-modal-close|bk-detail-close|cal-close|hs-kort-x|pk-crop-x|fokus-x)\b[^{}]*)\{([^}]*)\}/g))
    if (/(^|;)\s*(background|border|color|font-size|width|height|min-width|min-height|padding)\s*:/.test(m[2])) dode.push(m[1].trim().slice(-60) + '{…}');
  sjekk(!dode.length, 'Statisk: gamle X-klasser bærer ikke utseende (bare plassering)', dode.join(' | '));
  sjekk(!/\.(plakat-x|cal-story-x|suksess-x)\b/.test(dash), 'Statisk: døde X-klasser (.plakat-x/.cal-story-x/.suksess-x) er borte');
  sjekk(!/suksessOverlay|suksessX|visSuksesskort|lukkSuksess|suksess-kort|Siden din er klar\./.test(dash), 'Statisk: suksessmeldingen er slettet');
}

// ── Ark: alle dialogene side om side per bredde × tema × modus ──
{
  const ark = [];
  for (const [nokkel, liste] of Object.entries(xBilder)) {
    const W = 320, GAP = 16, TOPP = 30;
    const ruter = await Promise.all(liste.map(async ({ fil }) => {
      const b = await sharp(fil).resize({ width: W }).png().toBuffer(); return { b, h: (await sharp(b).metadata()).height };
    }));
    const H = Math.max(...ruter.map(r => r.h)) + TOPP + GAP, B = liste.length * (W + GAP) + GAP;
    const etiketter = liste.map((x, i) => `<text x="${GAP + i * (W + GAP)}" y="21" font-family="Arial" font-size="15" fill="#111">${x.dialog}</text>`).join('');
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${TOPP}">${etiketter}</svg>`);
    const fil = path.join(OUTX, `ark-${nokkel}.png`);
    await sharp({ create: { width: B, height: H, channels: 3, background: '#d9d9d9' } })
      .composite([{ input: svg, left: 0, top: 0 }, ...ruter.map((r, i) => ({ input: r.b, left: GAP + i * (W + GAP), top: TOPP }))])
      .png().toFile(fil);
    ark.push(fil);
  }
  ark.sort();
  fs.writeFileSync(path.join(OUTX, 'ark.txt'), ark.join('\n') + '\n');
  sjekk(ark.length === 8, 'Ark: 8 (2 bredder × 2 tema × trykk/tab)', `${ark.length}`);
  console.log(`Ark: ${path.join(OUTX, 'ark.txt')}`);
}

sjekk(mocket > 0, 'Mocken svarte på API-kall');
sjekk(prodTreff.every(u => new URL(u).pathname.startsWith('/api/')), 'Ingen umocket request mot api.trybarberhq.com', prodTreff.join(', '));
console.log(`\nSkjermbilder: ${OUT}`);
await browser.close(); server.close();
ferdig();
