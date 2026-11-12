// tools/render/fokusring.mjs — fokusringen vises KUN ved tastaturnavigering (Henrik 12.11.2026).
//
// Feilen: den blå ringen dukket opp ved trykk med finger/mus. To kilder: WebKit (iPhone) gir :focus-visible når koden
// kaller .focus() etter et trykk (datovelgeren, modaler, kalenderen), og Chromium gir det på felt ved trykk.
// Rotfiksen: <head>-skriptet i dashboard.html setter html.tastatur ved Tab (og piltaster/Home/End utenfor tekstfelt) og
// fjerner den ved ethvert trykk/klikk; CSS-en tegner ringen bare under html.tastatur.
//
// Måler i Chromium OG WebKit, @320 og @375, fire mål — «Legg til booking» (Oversikt), en dag i datovelgeren,
// bunn-nav-fanene og lukk-knappen i modalen:
//   1. trykk (touch) og klikk (mus) → INGEN ring: verken på elementet som har fokus etterpå (også når koden har flyttet
//      fokus selv) eller noe annet sted på siden.
//   2. Tab til det samme målet → ring (2px, #4d8bff eller --info) på akkurat det elementet.
//   3. Skrivefelt: trykk gir kantfarge, ingen ring.
// Skjermbilder fra WebKit (iPhone-motoren): trykk-* og tab-* per mål og bredde → .render-ut/fokusring/
// Alt under /api/** mockes; den delte datovelgeren leveres fra backend-repoet på disk (som legg-til-booking.mjs).
//   node tools/render/fokusring.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';
import { statiskeGoogleFonter } from './fixtures/webkit-fonter.mjs';   // WebKit/Windows tegner ellers fet Inter tynt

const ROOT = process.env.BHQ_SITE || path.resolve(import.meta.dirname, '../../site');   // BHQ_SITE: kjør mot en annen kopi (bites-kontroll)
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/fokusring');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const KLIENT = process.env.BHQ_KLIENT || path.resolve(import.meta.dirname, '../../../barberhq-backend/barberhq-backend/src/klient');
if (!fs.existsSync(path.join(KLIENT, 'datovelger.js'))) { console.error(`Fant ikke datovelger.js i ${KLIENT} — sett BHQ_KLIENT.`); process.exit(1); }
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const LOR = '2026-11-14';
const o = (d, hm) => new Date(`${d}T${hm}:00+01:00`).toISOString();
const SVC = [{ id:11, name:'Herreklipp', min:30, price:350, sort:0 }, { id:12, name:'Skin fade', min:45, price:400, sort:1 }];
const B = [{ id:'b1', start:o(LOR, '10:00'), end:o(LOR, '10:30'), name:'Ola Nordmann', phone:'+4791234567', service:'Herreklipp', service_id:11, status:'bekreftet', kilde:'kunde', price_label:'350 kr', addons:[] }];

async function aapne(motor, w, touch) {
  const browser = motor === 'webkit' ? wk : cr;
  const ctx = await browser.newContext({ timezoneId:'Europe/Oslo', viewport:{ width:w, height:844 }, deviceScaleFactor:2, hasTouch:touch, isMobile:touch });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const prod = [], mocket = new Set(); page.on('request', q => { if (new URL(q.url()).hostname === 'api.trybarberhq.com') prod.push(q); });
  await page.clock.setFixedTime(new Date('2026-11-12T09:00:00Z'));
  if (motor === 'webkit') await statiskeGoogleFonter(page);
  await page.route('**/book/_/datovelger.*', route => { const n = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ status:200, contentType:n.endsWith('.css') ? 'text/css' : 'application/javascript', body:fs.readFileSync(path.join(KLIENT, n)) }); });
  await page.route('**/api/**', route => { mocket.add(route.request());
    const u = new URL(route.request().url()), p = u.pathname, J = x => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(x) });
    if (p === '/api/dashboard/profile') return J({ slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber', booking_horizon_days:28 });
    if (p === '/api/dashboard/billing/status') return J({ subscription_status:'active', plan:'vekst', effective_plan:'vekst', effective_plan_grunn:'subscription', page_status:'live', needs_attention:false });
    if (p === '/api/dashboard/hours') return J([0,1,2,3,4,5,6].map(wd => ({ weekday:wd, is_closed:wd === 0, open_time:'10:00', close_time:'18:00', breaks:[] })));
    if (p === '/api/dashboard/services') return J({ hoved:SVC, tillegg:[] });
    if (p === '/api/dashboard/bookings') return J(B);
    if (p === '/api/dashboard/bookings/dag') { const d = u.searchParams.get('dato');
      return J({ dato:d, aapningstid:{ is_closed:false, open:'10:00', close:'18:00', avvik:false }, bookinger:B.filter(b => b.start.slice(0, 10) === d), pauser:[] }); }
    if (p === '/api/dashboard/google/status') return J({ connected:false, scope_ok:true });
    return J(/images|recent|winback|referrals|rebooking|sms-logg|momentum|loyalty|stats|attribution|customers/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => !!window.BhqDatovelger, null, { timeout:5000 }).catch(() => {});
  const lekk = () => prod.filter(q => !mocket.has(q)).length;
  return { ctx, page, errs, lekk };
}
// Ring = synlig outline (stil ≠ none, bredde > 0). Måles på elementet som har fokus OG over hele siden.
const ring = (page, maal = null) => page.evaluate((maal) => {
  const navn = e => e === document.body ? 'body' : (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].join('.') : '') + (e.dataset.date ? `[${e.dataset.date}]` : '') + (e.dataset.panel ? `[${e.dataset.panel}]` : ''));
  const harRing = e => { const cs = getComputedStyle(e); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0; };
  const a = document.activeElement;
  const alle = [...document.querySelectorAll('*')].filter(e => harRing(e) && e.checkVisibility()).map(navn);
  const cs = a ? getComputedStyle(a) : null;
  return { aktiv:a ? navn(a) : null, erMaal:!!(maal && a && a.matches(maal)), aktivRing:!!a && a !== document.body && harRing(a), farge:cs && cs.outlineColor, stil:cs && cs.outlineStyle, alle,
           tastatur:document.documentElement.classList.contains('tastatur') };
}, maal);
const ventModal = page => page.waitForFunction(() => document.querySelector('#bkNyDag').innerText.includes('Opptatt'), null, { timeout:4000 }).catch(() => {});
const bilder = [];
async function bilde(page, navn, clip) { await page.waitForTimeout(200); const fil = path.join(OUT, navn + '.png'); await page.screenshot(clip ? { path:fil, clip } : { path:fil }); bilder.push(fil); }
const boks = (page, sel, pad = 14, under = 0) => page.$eval(sel, (e, [p, u]) => { const r = e.getBoundingClientRect(); return { x:0, y:Math.max(0, r.top - p), width:innerWidth, height:Math.min(innerHeight - Math.max(0, r.top - p), r.height + p * 2 + u) }; }, [pad, under]);
const blaa = c => /77, 139, 255|20, 86, 168|77 139 255/.test(String(c)) || /#4d8bff/i.test(String(c));   // #4d8bff eller --info

const cr = await chromium.launch(), wk = await webkit.launch();

for (const motor of ['chromium', 'webkit']) for (const w of [320, 375]) {
  const tag = `${motor} ${w}`, skjerm = motor === 'webkit';
  for (const maate of ['trykk', 'klikk']) {
    const touch = maate === 'trykk';
    const { ctx, page, errs, lekk } = await aapne(motor, w, touch);
    const tr = sel => touch ? page.tap(sel) : page.click(sel);
    const start = await ring(page);
    sjekk(start.alle.length === 0, `${tag} ${maate}: ingen ring når siden er lastet`, JSON.stringify(start.alle));

    // 1. «Legg til booking» (Oversikt) → modalen åpnes, koden fokuserer arket
    await tr('#upLeggTil'); await ventModal(page);
    let r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0 && !r.tastatur, `${tag} ${maate} «Legg til booking»: ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `1-trykk-legg-til-booking-${w}`);

    // 2. En dag i datovelgeren → velgeren lukkes og koden flytter fokus til datofeltet
    await tr('#bkNyDatoKnapp'); await page.waitForTimeout(150);
    await tr(`#bkNyKal .bhq-dv-dag[data-date="${LOR}"]`); await page.waitForTimeout(250);
    r = await ring(page);
    sjekk(r.aktiv === '#bkNyDatoKnapp' && !r.aktivRing && r.alle.length === 0, `${tag} ${maate} dag i datovelgeren: fokus flyttet av koden, ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `2-trykk-dag-i-datovelgeren-${w}`, await boks(page, '#bkNyDatoKnapp', 70, 260));

    // Skrivefelt: trykk gir kantfarge, ingen ring
    await tr('#bkNyNavn'); await page.waitForTimeout(100);
    r = await ring(page);
    const kant = await page.$eval('#bkNyNavn', e => getComputedStyle(e).borderTopColor);
    sjekk(r.aktiv === '#bkNyNavn' && !r.aktivRing && blaa(kant), `${tag} ${maate} skrivefelt: kantfarge, ingen ring`, JSON.stringify({ ...r, kant }));
    // Valg (select, .kl-select): den gamle regelen sto på :focus, ikke :focus-visible → ring ved hvert trykk.
    await tr('#bkNySvc'); await page.waitForTimeout(100);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} valg (Tjeneste): ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `5-trykk-valg-tjeneste-${w}`, await boks(page, '.bkn-to', 40, 0));
    await page.keyboard.press('Escape').catch(() => {});   // lukk ev. åpen nedtrekksliste (modalen står)

    // 4. Lukk-knappen i modalen (Escape over kan ha lukket den alt — åpne igjen i så fall)
    if (await page.$eval('#bkNyBackdrop', e => e.hidden)) { await tr('#upLeggTil'); await ventModal(page); }
    await tr('#bkNyLukk'); await page.waitForTimeout(200);
    r = await ring(page);
    sjekk(await page.$eval('#bkNyBackdrop', e => e.hidden) && !r.aktivRing && r.alle.length === 0, `${tag} ${maate} lukk-knappen: ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `4-trykk-lukk-${w}`, await boks(page, '.up-knapper', 120, 0));

    // 3. Bunn-nav-fanene (mobil): Vekst, så tilbake til Oversikt
    await tr('.bunn-nav .tab[data-panel="vekst"]'); await page.waitForTimeout(250);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} bunn-nav (Vekst): ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `3-trykk-bunn-nav-${w}`, await boks(page, '.bunn-nav', 30, 0));
    // Konto → Utseende: trykk på «Lys» — koden flytter fokus selv (themeGrid, .focus()); deretter «Mørk» tilbake
    await tr('.bunn-nav .tab[data-panel="abonnement"]'); await page.waitForTimeout(300);
    await page.$eval('#themeGrid', e => e.scrollIntoView({ block:'center' }));
    await tr('#themeGrid [data-tema="light"]'); await page.waitForTimeout(150);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} Konto › tema (fokus fra koden): ingen ring`, JSON.stringify(r));
    await tr('#themeGrid [data-tema="dark"]'); await page.waitForTimeout(150);
    await tr('.bunn-nav .tab[data-panel="oversikt"]'); await page.waitForTimeout(250);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} bunn-nav (Oversikt): ingen ring`, JSON.stringify(r));

    // Bryter (Tjenester › arbeidstider, tirsdag = data-i 1): trykk på sporet → bryteren slår seg av (ikke lagret), ingen ring; trykk igjen
    await tr('.bunn-nav .tab[data-panel="tjenester"]'); await page.waitForTimeout(400);
    await page.$eval('#hoursList .sw input[data-i="1"] + .sl', e => e.scrollIntoView({ block:'center' }));
    await tr('#hoursList .sw input[data-i="1"] + .sl'); await page.waitForTimeout(150);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} bryter: ingen ring`, JSON.stringify(r));
    if (skjerm && touch) await bilde(page, `6-trykk-bryter-${w}`, await boks(page, '#hoursList .day:has(input[data-i="1"])', 60, 60));
    await tr('#hoursList .sw input[data-i="1"] + .sl'); await page.waitForTimeout(150);
    await tr('.bunn-nav .tab[data-panel="oversikt"]'); await page.waitForTimeout(250);

    // Kalenderen: «Åpne kalender» → koden fokuserer overlegget; «+» og lukk
    await tr('#calOpenUpcoming'); await page.waitForTimeout(300);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} kalenderen åpnes: ingen ring`, JSON.stringify(r));
    await tr('#calClose'); await page.waitForTimeout(200);
    r = await ring(page);
    sjekk(!r.aktivRing && r.alle.length === 0, `${tag} ${maate} kalenderen lukkes: ingen ring`, JSON.stringify(r));

    sjekk(errs.length === 0 && lekk() === 0, `${tag} ${maate}: ingen JS-feil, alt gjennom mocken`, errs.join(' | '));
    await ctx.close();
  }

  // Tab-navigering til de samme målene → ring. Utgangspunkt: et trykk først (ingen ring), så Tab.
  {
    const { ctx, page, errs, lekk } = await aapne(motor, w, true);
    const tabTil = async (fraSel, maal) => {   // fokus på naboen uten ring, så ett Tab-trykk inn på målet
      await page.$eval(fraSel, e => e.focus());
      await page.keyboard.press('Tab'); await page.waitForTimeout(120);
      const r = await ring(page, maal);
      return { r, ok:r.erMaal && r.aktivRing && blaa(r.farge) && r.tastatur };
    };
    // 1. «Legg til booking»: Tab fra «Åpne kalender»
    let { r, ok } = await tabTil('#calOpenUpcoming', '#upLeggTil');
    sjekk(ok, `${tag} Tab → «Legg til booking»: ring`, JSON.stringify(r));
    if (skjerm) await bilde(page, `1-tab-legg-til-booking-${w}`, await boks(page, '.up-knapper', 120, 0));

    // 4. Lukk-knappen: åpne modalen med trykk (ingen ring), så Tab fra arket → første knapp er lukk
    await page.tap('#upLeggTil'); await ventModal(page);
    await page.keyboard.press('Tab'); await page.waitForTimeout(120);
    r = await ring(page);
    sjekk(r.aktiv === '#bkNyLukk' && r.aktivRing && blaa(r.farge), `${tag} Tab → lukk-knappen: ring`, JSON.stringify(r));
    if (skjerm) await bilde(page, `4-tab-lukk-${w}`, await boks(page, '#bkNyH', 40, 40));

    // 2. Dag i datovelgeren: åpne med trykk, Tab fra 13. til 14.
    await page.tap('#bkNyDatoKnapp'); await page.waitForTimeout(150);
    ({ r, ok } = await tabTil('#bkNyKal .bhq-dv-dag[data-date="2026-11-13"]', `#bkNyKal .bhq-dv-dag[data-date="${LOR}"]`));
    sjekk(ok, `${tag} Tab → dag i datovelgeren: ring`, JSON.stringify(r));
    if (skjerm) await bilde(page, `2-tab-dag-i-datovelgeren-${w}`, await boks(page, '#bkNyDatoKnapp', 70, 260));
    // Enter på dagen (tastatur) → koden flytter fokus til datofeltet: der SKAL ringen stå
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    r = await ring(page);
    sjekk(r.aktiv === '#bkNyDatoKnapp' && r.aktivRing, `${tag} Enter på dag (tastatur) → datofeltet får ring`, JSON.stringify(r));
    // Et trykk etterpå tar ringen bort igjen
    await page.tap('#bkNyNavn'); await page.waitForTimeout(100);
    r = await ring(page);
    sjekk(!r.tastatur && !r.aktivRing && r.alle.length === 0, `${tag} trykk etter Tab → ringen borte`, JSON.stringify(r));
    await page.tap('#bkNyLukk'); await page.waitForTimeout(200);

    // 3. Bunn-nav: Tab fra Oversikt-fanen til Vekst
    ({ r, ok } = await tabTil('.bunn-nav .tab[data-panel="oversikt"]', '.bunn-nav .tab[data-panel="vekst"]'));
    sjekk(ok, `${tag} Tab → bunn-nav (Vekst): ring`, JSON.stringify(r));
    if (skjerm) await bilde(page, `3-tab-bunn-nav-${w}`, await boks(page, '.bunn-nav', 30, 0));

    // Bryter: fokus på feltet uten ring, Shift+Tab ut og Tab inn igjen → ringen på det synlige sporet (.sl)
    await page.tap('.bunn-nav .tab[data-panel="tjenester"]'); await page.waitForTimeout(400);
    const brSel = '#hoursList .sw input[data-i="1"]';
    await page.$eval(brSel, e => { e.focus(); e.closest('.day').scrollIntoView({ block:'center' }); });
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await page.waitForTimeout(400);   // .sw .sl har transition:.18s på alt, også outline — mål når ringen er tonet inn
    const br = await page.$eval(brSel, e => { const sl = e.nextElementSibling, cs = getComputedStyle(sl);
      return { fokus:document.activeElement === e, stil:cs.outlineStyle, bredde:cs.outlineWidth, farge:cs.outlineColor, tastatur:document.documentElement.classList.contains('tastatur') }; });
    sjekk(br.fokus && br.tastatur && br.stil === 'solid' && br.bredde === '2px' && blaa(br.farge), `${tag} Tab → bryter: ring på sporet`, JSON.stringify(br));
    if (skjerm) await bilde(page, `6-tab-bryter-${w}`, await boks(page, '#hoursList .day:has(input[data-i="1"])', 60, 60));
    await page.touchscreen.tap(4, 140); await page.waitForTimeout(100);   // trykk i venstremargen (ingen kontroll der)
    const brEtter = await page.$eval(brSel, e => getComputedStyle(e.nextElementSibling).outlineStyle);
    sjekk(brEtter === 'none', `${tag} trykk etter Tab → ringen på bryteren borte`, brEtter);

    sjekk(errs.length === 0 && lekk() === 0, `${tag} Tab: ingen JS-feil, alt gjennom mocken`, errs.join(' | '));
    await ctx.close();
  }
}

await cr.close(); await wk.close(); server.close();
console.log('\nBilder:\n' + bilder.join('\n'));
ferdig();
