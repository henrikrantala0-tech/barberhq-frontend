// tools/render/noshow-tilstand.mjs — no-show-tilstanden i booking-detaljflaten (modal).
//
// ⚠ OMSKREVET 21.09: den gamle IN-LISTE-flaten (#bookingList med .row / .tag.f / .tag.n /
// .noshowbtn og in-row .row-err) er FJERNET fra Oversikt 14.09 — «Siste bookinger» ble slettet
// (se dashboard.html: «rowHTML2/loadBookinger/renderBookinger + #ovsWbNudge slettet med
// seksjonen (no-show-oppfølging lever i Vekst › Vinn tilbake)»). Historikk eies nå av kalenderen.
// No-show-tilstanden lever kun i den DELTE detaljflaten (.bk-detail / .bk-detail-actions), åpnet
// fra kalenderen (blokk-klikk) eller en booking-rad. Testen verifiserer derfor tilstanden DER:
//
//   - No-show-booking → GRÅ «Ikke fullført»-tag (.tag.n, ikke --bad-bg) i modal-hodet.
//   - AKTIV No-show-knapp (.noshowbtn.aktiv, rød tekst) i .bk-detail-actions.
//   - Fullført-booking → grønn «Fullført»-tag (.tag.f), No-show-knapp IKKE .aktiv.
//   - PATCH feiler (500) ved klikk → .row-err legges INNE i .bk-detail-actions som siste barn
//     (egen full-bredde-linje under knappen), ikke som søsken utenfor.
//
// Kalenderen bygges via #calOpenUpcoming (kjører calFetch → CAL.alle), så åpnes detaljflaten for
// hver booking med openDetalj(id). Bookings-GET gir én fullført + én no-show (begge PASSERT, innen
// -14d-vinduet så de er i CAL.alle). PATCH svarer 500 så et klikk på No-show utløser visRadFeil ekte.
//
//   node tools/render/noshow-tilstand.mjs
// Skjermbilder → .render-ut/noshow-*-<bredde>.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml',
  '.mp4':'video/mp4', '.ttf':'font/ttf' };
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

const PROFILE = { slug:'grand-barber', email:'grand@barber.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// To PASSERTE bookinger, innen kalenderens -14d-vindu så begge havner i CAL.alle. Langt navn på
// no-show-raden beholdt (historisk 320-brekk-bekymring) — måles nå i modal-hodet.
const past = (daysAgo, h) => { const d=new Date(); d.setDate(d.getDate()-daysAgo); d.setHours(h,0,0,0); return d.toISOString(); };
const BOOKINGS = [
  { id:'b1', name:'Kristoffer', service:'Herreklipp', start:past(2,9),  end:past(2,10), status:'fullfort', price_label:'350 kr', phone:'+4790000001' },
  { id:'b2', name:'Aleksander Kristiansen', service:'Skjegg & klipp', start:past(3,11), end:past(3,12), status:'ikke_mott', price_label:'500 kr', phone:'+4790000002' },
];

function router(route){
  const u = new URL(route.request().url());
  const p = u.pathname, m = route.request().method();
  const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
  if (p === '/api/dashboard/bookings' && m === 'GET') return json(BOOKINGS);
  if (/^\/api\/dashboard\/bookings\//.test(p) && m === 'PATCH')            // toggle → feiler med vilje
    return route.fulfill({ status:500, contentType:'application/json', body:JSON.stringify({error:'nei'}) });
  if (p === '/api/dashboard/profile')       return json(PROFILE);
  if (p === '/api/dashboard/billing/status') return json({ subscription_status:'trialing', page_status:'live', plan:'vekst', effective_plan:'vekst', needs_attention:false });
  const listeAktig = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
  return json(listeAktig ? [] : {});
}

const browser = await chromium.launch();
const rapport = [];

for (const bredde of [320, 375, 1280]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:1400 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.waitForTimeout(600);

  // Bygg kalenderen (calFetch → CAL.alle) og la den stå åpen.
  await page.click('#calOpenUpcoming');
  await page.waitForSelector('#calOverlay:not([hidden])', { timeout:5000 });
  await page.waitForTimeout(300);

  // ── Tilstand: åpne detaljflaten for no-show-bookingen ──
  await page.evaluate(() => openDetalj('b2'));
  await page.waitForSelector('.bk-detail-actions .noshowbtn', { timeout:3000 });
  const nMeas = await page.evaluate(() => {
    const rgb = el => el ? getComputedStyle(el) : null;
    const tag = document.querySelector('.bk-detail .bk-detail-head .tag');
    const btn = document.querySelector('.bk-detail-actions .noshowbtn');
    const badBg = getComputedStyle(document.documentElement).getPropertyValue('--bad-bg').trim();
    // Kundenavnet i modal-hodet: skal ikke brekke bokstav-for-bokstav på 320.
    const nameEl = document.querySelector('.bk-detail-name');
    const rng = document.createRange(); rng.selectNodeContents(nameEl);
    const linjer = [...new Set([...rng.getClientRects()].map(x => Math.round(x.top)))].length;
    return {
      pillTekst: tag ? tag.textContent.trim() : '(ingen)',
      pillErN:   tag ? tag.classList.contains('n') : false,
      pillBg:    tag ? rgb(tag).backgroundColor.replace(/\s/g,'') : null,
      badBg:     badBg.replace(/\s/g,''),
      aktivKlasse: btn ? btn.classList.contains('aktiv') : null,
      aktivBtnColor: btn ? rgb(btn).color : null,
      navnLinjer: linjer,
      navnTekst:  nameEl ? nameEl.textContent.trim() : '',
    };
  });
  await page.locator('.bk-detail').screenshot({ path:`${OUT}/noshow-modal-noshow-${bredde}.png` });

  // ── Fullført-bookingen: tag grønn, No-show-knapp IKKE aktiv ──
  await page.evaluate(() => { lukkDetalj(); openDetalj('b1'); });
  await page.waitForSelector('.bk-detail-actions .noshowbtn', { timeout:3000 });
  const fMeas = await page.evaluate(() => {
    const tag = document.querySelector('.bk-detail .bk-detail-head .tag');
    const btn = document.querySelector('.bk-detail-actions .noshowbtn');
    return {
      pillTekst: tag ? tag.textContent.trim() : '(ingen)',
      pillErF:   tag ? tag.classList.contains('f') : false,
      btnAktiv:  btn ? btn.classList.contains('aktiv') : null,
    };
  });

  // ── Feil i modal: klikk No-show på fullført-raden → PATCH 500 → .row-err i actions ──
  await page.evaluate(() => document.querySelector('.bk-detail-actions .noshowbtn').click());
  await page.waitForSelector('.bk-detail-actions .row-err', { timeout:3000 });
  const modalErr = await page.evaluate(() => {
    const err = document.querySelector('.bk-detail-actions .row-err');
    const box = err.closest('.bk-detail-actions');
    return {
      errInniActions: err.parentElement === box,
      errErSisteBarn: box.lastElementChild === err,
      errBredde: Math.round(err.getBoundingClientRect().width),
      boxBredde: Math.round(box.getBoundingClientRect().width),
    };
  });
  await page.locator('.bk-detail').screenshot({ path:`${OUT}/noshow-modal-feil-${bredde}.png` });

  rapport.push({ bredde,
    'no-show pill tekst': nMeas.pillTekst === 'Ikke fullført' ? 'Ikke fullført ✓' : nMeas.pillTekst+' ✗',
    'pill .n grå':        (nMeas.pillErN && nMeas.pillBg !== nMeas.badBg) ? 'grå ✓' : 'RØD/feil ✗',
    'aktiv-klasse':       nMeas.aktivKlasse ? '✓' : '✗',
    'aktiv rød tekst':    nMeas.aktivBtnColor,
    'navn-linjer':        nMeas.navnLinjer <= 2 ? nMeas.navnLinjer+' ✓' : nMeas.navnLinjer+' ✗ BREKKER',
    'fullført pill':      (fMeas.pillErF && fMeas.pillTekst==='Fullført') ? 'Fullført ✓' : fMeas.pillTekst+' ✗',
    'fullført ikke aktiv': fMeas.btnAktiv === false ? '✓' : '✗',
    'modal-feil inni':    modalErr.errInniActions && modalErr.errErSisteBarn ? '✓' : '✗',
    'feil full bredde':   Math.abs(modalErr.errBredde - modalErr.boxBredde) < 40 ? '✓' : `${modalErr.errBredde}/${modalErr.boxBredde} ✗`,
    jsfeil:               errs.length ? errs.join('; ') : 'ingen',
  });
  await page.close();
}

console.table(rapport);
const feil = rapport.some(r => Object.values(r).some(v => String(v).includes('✗')) || r.jsfeil !== 'ingen');
console.log('\nalt grønt:', feil ? 'NEI ✗' : 'ja ✓');
process.exitCode = feil ? 1 : 0;
await browser.close(); server.close();
