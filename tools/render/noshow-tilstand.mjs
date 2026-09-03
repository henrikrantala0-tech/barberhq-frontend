// tools/render/noshow-tilstand.mjs — no-show-tilstanden i Oversiktens booking-liste + modal.
//
// Verifiserer den LÅSTE tilstanden (Henrik-godkjent mockup):
//   - Fullført-rad: grønn «Fullført»-pill, nøytral No-show-knapp.
//   - No-show-rad: GRÅ «Ikke fullført»-pill (ikke --bad) + AKTIV No-show-knapp (rød tekst/kant,
//     mørk rød bakgrunn = dagens :hover), som KLASSE så den vises på touch (ingen hover).
//   - Feil: .row-err ligger INNE i raden (siste barn, egen full-bredde-linje under knapp+pill),
//     ikke som søsken mellom radene. Samme i modalens .bk-detail-actions.
//   - Navnet skal ikke brekke bokstav-for-bokstav på 320 når feilen vises.
//
// Serverer site/ lokalt og stubber /api/**. Bookings-GET gir én fullført + én no-show (begge
// passert). PATCH svarer 500 så et klikk på No-show utløser visRadFeil ekte.
//
//   node tools/render/noshow-tilstand.mjs
//
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
// To passerte bookinger i dag. Langt navn på no-show-raden for å presse 320-brekk-testen.
const iDag = (t)=>{ const d=new Date(); d.setHours(t,0,0,0); return d.toISOString(); };
const BOOKINGS = [
  { id:'b1', name:'Kristoffer', service:'Herreklipp', start:iDag(9),  end:iDag(10), status:'fullfort', price_label:'350 kr', phone:'+4790000001' },
  { id:'b2', name:'Aleksander Kristiansen', service:'Skjegg & klipp', start:iDag(11), end:iDag(12), status:'ikke_mott', price_label:'500 kr', phone:'+4790000002' },
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
  await page.waitForSelector('#bookingList .row', { timeout:5000 });
  await page.waitForTimeout(300);

  // Mål tilstanden på begge rader.
  const m = await page.evaluate(() => {
    const rgb = el => el ? getComputedStyle(el) : null;
    const rows = [...document.querySelectorAll('#bookingList .row')];
    const fRow = rows.find(r => r.querySelector('.tag.f'));
    const nRow = rows.find(r => r.querySelector('.tag.n'));
    const nBtn = nRow && nRow.querySelector('.noshowbtn');
    const fBtn = fRow && fRow.querySelector('.noshowbtn');
    const nTag = nRow && nRow.querySelector('.tag.n');
    const badBg = getComputedStyle(document.documentElement).getPropertyValue('--bad-bg').trim();
    return {
      noshowPillTekst: nTag ? nTag.textContent.trim() : '(ingen)',
      noshowPillBg:    nTag ? rgb(nTag).backgroundColor : null,
      noshowPillErBad: nTag ? rgb(nTag).backgroundColor.replace(/\s/g,'') : null,
      badBg,
      aktivKlasse:     nBtn ? nBtn.classList.contains('aktiv') : null,
      aktivBtnColor:   nBtn ? rgb(nBtn).color : null,
      aktivBtnBorder:  nBtn ? rgb(nBtn).borderTopColor : null,
      fullfortBtnAktiv: fBtn ? fBtn.classList.contains('aktiv') : null,
      fullfortBtnColor: fBtn ? rgb(fBtn).color : null,
      undobtnFinnes:   !!document.querySelector('.undobtn'),
      rowFlexWrap:     fRow ? rgb(fRow).flexWrap : null,
    };
  });

  await page.locator('#bookingList').screenshot({ path:`${OUT}/noshow-liste-${bredde}.png` });

  // Feil i rad: klikk No-show på fullført-raden → PATCH 500 → .row-err inne i raden.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#bookingList .row')];
    const fRow = rows.find(r => r.querySelector('.tag.f'));
    fRow.querySelector('.noshowbtn').click();
  });
  await page.waitForSelector('#bookingList .row .row-err', { timeout:3000 });
  const rowErr = await page.evaluate(() => {
    const err = document.querySelector('#bookingList .row .row-err');
    const row = err.closest('.row');
    const name = row.querySelector('.name');
    // Henriks bekymring = KUNDENAVNET brekker bokstav-for-bokstav. .name inneholder også
    // .svc (tjenesten), som ALLTID wrapper under navnet på smale rader — det er tiltenkt.
    // Mål derfor kun ledetekst-noden (navnet) fram til .svc, ikke hele .name.
    const svc = name.querySelector('.svc');
    const rng = document.createRange();
    rng.setStart(name, 0);
    if (svc) rng.setEndBefore(svc); else rng.selectNodeContents(name);
    const linjer = [...new Set([...rng.getClientRects()].map(x => Math.round(x.top)))].length;
    return {
      errInniRad:  err.parentElement === row,
      errErSisteBarn: row.lastElementChild === err,
      errBredde:   Math.round(err.getBoundingClientRect().width),
      radBredde:   Math.round(row.getBoundingClientRect().width),
      navnLinjer:  linjer,
      navnTekst:   name.textContent.trim(),
    };
  });
  await page.locator('#bookingList .row:has(.row-err)').screenshot({ path:`${OUT}/noshow-rad-feil-${bredde}.png` });

  // Modal-feil: åpne detalj på no-show-booking, klikk knappen → PATCH 500 → .row-err i actions.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#bookingList .row')];
    const nRow = rows.find(r => r.querySelector('.tag.n'));
    nRow.click();
  });
  await page.waitForSelector('.bk-detail-actions .noshowbtn', { timeout:3000 });
  await page.evaluate(() => document.querySelector('.bk-detail-actions .noshowbtn').click());
  await page.waitForSelector('.bk-detail-actions .row-err', { timeout:3000 });
  const modalErr = await page.evaluate(() => {
    const err = document.querySelector('.bk-detail-actions .row-err');
    const box = err.closest('.bk-detail-actions');
    return { errInniActions: err.parentElement === box, errErSisteBarn: box.lastElementChild === err };
  });
  await page.locator('.bk-detail').screenshot({ path:`${OUT}/noshow-modal-feil-${bredde}.png` });

  rapport.push({ bredde,
    'pill tekst':       m.noshowPillTekst === 'Ikke fullført' ? 'Ikke fullført ✓' : m.noshowPillTekst+' ✗',
    'pill ≠ rød':       (m.noshowPillErBad && m.noshowPillErBad === m.badBg.replace(/\s/g,'')) ? 'RØD ✗' : 'grå ✓',
    'aktiv-klasse':     m.aktivKlasse ? '✓' : '✗',
    'aktiv rød tekst':  /255|rgb/.test(m.aktivBtnColor||'') ? m.aktivBtnColor : m.aktivBtnColor,
    'fullført ikke aktiv': m.fullfortBtnAktiv === false ? '✓' : '✗',
    'undobtn borte':    m.undobtnFinnes ? '✗' : '✓',
    'rad flex-wrap':    m.rowFlexWrap,
    'rad-feil inni':    rowErr.errInniRad && rowErr.errErSisteBarn ? '✓' : '✗',
    'feil full bredde': Math.abs(rowErr.errBredde - rowErr.radBredde) < 40 ? '✓' : `${rowErr.errBredde}/${rowErr.radBredde} ✗`,
    'navn-linjer':      rowErr.navnLinjer <= 2 ? rowErr.navnLinjer+' ✓' : rowErr.navnLinjer+' ✗ BREKKER',
    'modal-feil inni':  modalErr.errInniActions && modalErr.errErSisteBarn ? '✓' : '✗',
    jsfeil:             errs.length ? errs.join('; ') : 'ingen',
  });
  await page.close();
}

console.table(rapport);
const feil = rapport.some(r => Object.values(r).some(v => String(v).includes('✗')) || r.jsfeil !== 'ingen');
console.log('\nalt grønt:', feil ? 'NEI ✗' : 'ja ✓');
await browser.close(); server.close();
