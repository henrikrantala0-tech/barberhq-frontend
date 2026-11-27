// tools/render/tjenester-liste.mjs — Tjenester & tider som LISTE + ark for legg til / rediger (27.11.2026).
//
//   node tools/render/tjenester-liste.mjs
//
// Sjekker (320 / 375 / 1280, mørk; lista også lys @375):
//   · rader uten boks, hårlinje under hver rad, ingen kolonneoverskrift; navn 15/600, «Rediger»/«Slett» 14/500 med ≥ 44×44 trykkflate
//   · «1 000 kr · 30 min» (norsk tusenskille), beskrivelse på én linje med ellipsis, langt navn brytes (kuttes ikke)
//   · trykk på raden / «Rediger» åpner ARKET fylt inn; «+ Legg til» åpner det tomt; titlene; ingen skjema i lista; lista uendret bak arket
//   · arket = «Legg til booking»-arket: samme skall (bunnark < 561 px, dialog ellers), tittel, ×, labels, Lagre-knapp og fokus ved åpning
//   · labels Navn/Pris/Varighet/Beskrivelse; feltene uendret (16px, 44px); «kr»/«min» alltid i feltet; beskrivelse skjult bak lenke,
//     resize:none og vokser med teksten; × / Esc / trykk utenfor lukker og forkaster; Enter = Lagre
//   · Lagre sender HELE lista til PUT /services (rene tall); arket lukkes først ved ok, «Lagret» ved raden; feil i arket, verdiene står
//   · validering under feltet (ingen alert); siste hovedtjeneste kan ikke slettes (inline-melding, ingen PUT); Slett lagrer straks
//   · pris 0 → rød «Sett pris» i meta-linja; «45,5» → 46, «1 200» → 1200, negativ → feil under feltet (erstatter pris0-markor / tjenester-komma)
//   · betaling: rader uten meta-linje, «Ny/Rediger betalingsmetode» med ett felt «F.eks. Vipps», PUT /payment-methods {methods}
//   · overskrifter: alle .tt-h1 like, alle .tt-h2 like (mindre/dempet), 28 px over og under hver skillestrek
//   · ingen horisontal overflow, ingen JS-feil, ingen alert, ingen request mot prod
// Skjermbilder → .render-ut/tjenester-liste/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { installerDinSideMock } from './fixtures/dinside-v2.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT = path.resolve(import.meta.dirname, '../../.render-ut/tjenester-liste');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/dashboard.html#tjenester`;
const browser = await chromium.launch();
const feil = [];
const sjekk = (ok, hva, detalj = '') => { if (!ok) feil.push({ hva, detalj }); return ok; };
const LANGT = 'Skin fade med skjeggtrim, varmt håndkle og hårvask etterpå';
const TJ = () => ({
  hoved: [{ name: 'Skinfade', price: 1000, min: 30, description: 'Klipp på sidene og kort på toppen, avsluttet med styling og voks' },
          { name: 'Klipp', price: 450, min: 30, description: '' },
          { name: LANGT, price: 1250, min: 75, description: '' }],
  tillegg: [{ name: 'Skjegg', price: 150, min: 15, description: '' }, { name: 'Hårvask', price: 100, min: 0, description: '' }],
});

// Oppsett: felles mock (fanger ALT under /api/ og api.trybarberhq.com) + egne ruter for tjenester/betaling oppå (registreres
// sist → vinner). Tilstanden lever i mocken, så en vellykket PUT gir ny GET-sannhet.
async function aapne(bredde, { tema = 'dark', tjenester = TJ(), betaling = ['Kontant', 'Vipps', 'Kort'] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (_) {} }, tema);
  const page = await ctx.newPage(); const errs = []; const dialoger = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => { dialoger.push(d.message()); d.dismiss(); });
  const m = await installerDinSideMock(page, { sidemal: 'v2', tjenester });
  const st = { tj: tjenester, pay: betaling, putFeil: null, put: [] };
  await page.route(u => new URL(u).pathname === '/api/dashboard/services', async route => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(st.tj) });
    const body = req.postDataJSON(); st.put.push({ sti: 'services', body });
    if (st.putFeil) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: st.putFeil }) });
    st.tj = body; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route(u => new URL(u).pathname === '/api/dashboard/payment-methods', async route => {
    const body = route.request().postDataJSON(); st.put.push({ sti: 'payment-methods', body });
    if (st.putFeil) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: st.putFeil }) });
    st.pay = body.methods; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, payment_methods: st.pay }) });
  });
  await page.route(u => new URL(u).pathname === '/api/dashboard/settings', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ payment_methods: st.pay }) }) : route.fallback());
  // Faste ukedager (man–fre 10–18, lør 10–16, søn stengt) → «Faste tider» vises, som for de fleste barbere. Bare GET.
  const HOURS = [1, 2, 3, 4, 5].map(wd => ({ weekday: wd, is_closed: false, open_time: '10:00', close_time: '18:00', breaks: [] }))
    .concat([{ weekday: 6, is_closed: false, open_time: '10:00', close_time: '16:00', breaks: [] }, { weekday: 0, is_closed: true, open_time: null, close_time: null, breaks: [] }]);
  await page.route(u => new URL(u).pathname === '/api/dashboard/hours', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOURS) }) : route.fulfill({ status: 500, body: '{}' }));
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('.nav button[data-panel="tjenester"]').click());
  await page.waitForSelector('#hovedList .tj-rad'); await page.waitForTimeout(300);
  return { ctx, page, errs, dialoger, m, st };
}
// Skjermbilde av et utsnitt: fra toppen av første element til bunnen av siste (+ luft), hele bredden.
async function bilde(page, fra, til, navn, luft = 20) {
  await page.mouse.move(1, 1);   // ingen hover-farge i bildet
  const r = await page.evaluate(([a, b]) => { const A = document.querySelector(a).getBoundingClientRect(), B = document.querySelector(b).getBoundingClientRect();
    return { y: A.top + scrollY, h: B.bottom - A.top }; }, [fra, til]);
  await page.screenshot({ path: `${OUT}/${navn}.png`, fullPage: true, clip: { x: 0, y: Math.max(0, r.y - luft), width: page.viewportSize().width, height: r.h + 2 * luft } });
}
const normal = s => s.replace(/ | /g, ' ');

for (const bredde of [320, 375, 1280]) {
  const k = String(bredde);
  const { ctx, page, errs, dialoger, m, st } = await aapne(bredde);

  // ── a) Lista ──
  const liste = await page.evaluate(() => {
    const cs = e => getComputedStyle(e);
    const rader = [...document.querySelectorAll('#hovedList .tj-rad, #tilleggList .tj-rad')];
    return {
      hode: document.querySelectorAll('.svc-head-h, .svc-head-t, #svcHodeH, #svcHodeT').length,
      gammelLagre: !!document.getElementById('saveSvc') || !!document.getElementById('savePay'),
      rader: rader.map(r => { const n = r.querySelector('.tj-navn'), m = r.querySelector('.tj-meta'), b = r.querySelector('.tj-besk');
        return { navn: n.textContent, nFs: cs(n).fontSize, nFw: cs(n).fontWeight, nH: n.getBoundingClientRect().height, nKlipp: n.scrollWidth > n.clientWidth + 1,
          meta: m.textContent.replace(/Lagret$/, ''), mFs: cs(m).fontSize,
          besk: b ? { tekst: b.textContent, linjer: Math.round(b.getBoundingClientRect().height / parseFloat(cs(b).lineHeight)), ellipsis: cs(b).textOverflow, kuttet: b.scrollWidth > b.clientWidth } : null,
          kant: cs(r).borderBottomWidth + ' ' + cs(r).borderBottomStyle, kantFarge: cs(r).borderBottomColor, bg: cs(r).backgroundColor, ramme: cs(r).borderTopWidth,
          pad: cs(r).paddingTop + '/' + cs(r).paddingBottom,
          knapper: [...r.querySelectorAll('.tj-knapp')].map(x => { const q = x.getBoundingClientRect(); return { t: x.textContent, w: q.width, h: q.height, fs: cs(x).fontSize, fw: cs(x).fontWeight, c: cs(x).color, bg: cs(x).backgroundColor, ramme: cs(x).borderTopWidth }; }),
          radH: r.getBoundingClientRect().height };
      }),
      legg: [...document.querySelectorAll('.tj-legg')].map(x => { const q = x.getBoundingClientRect(), c = cs(x); return { t: x.textContent, fs: c.fontSize, fw: c.fontWeight, c: c.color, h: q.height, ramme: c.borderTopStyle, align: c.textAlign, venstre: Math.round(q.left) }; }),
      wrapVenstre: Math.round(document.querySelector('#hovedList').getBoundingClientRect().left),
    };
  });
  sjekk(liste.hode === 0 && !liste.gammelLagre, `${k}: ingen kolonneoverskrift og ingen «Lagre tjenester»/«Lagre betaling»`, JSON.stringify([liste.hode, liste.gammelLagre]));
  sjekk(liste.rader.length === 5, `${k}: 5 rader`, String(liste.rader.length));
  sjekk(liste.rader.every(r => r.nFs === '15px' && r.nFw === '600' && r.mFs === '13px'), `${k}: navn 15/600, meta 13`, JSON.stringify(liste.rader.map(r => [r.nFs, r.nFw, r.mFs])));
  sjekk(liste.rader.every(r => r.kant === '1px solid' && r.kantFarge === 'rgba(255, 255, 255, 0.08)' && r.bg === 'rgba(0, 0, 0, 0)' && r.ramme === '0px' && r.pad === '14px/14px'),
    `${k}: rad uten boks, hårlinje rgba(255,255,255,.08) under, 14px padding`, JSON.stringify(liste.rader.map(r => [r.kant, r.kantFarge, r.bg, r.pad])));
  sjekk(liste.rader.every(r => r.knapper.length === 2 && r.knapper[0].t === 'Rediger' && r.knapper[1].t === 'Slett'
    && r.knapper.every(b => b.w >= 44 && b.h >= 44 && b.fs === '14px' && b.fw === '500' && b.c === 'rgba(255, 255, 255, 0.55)' && b.bg === 'rgba(0, 0, 0, 0)' && b.ramme === '0px')),
    `${k}: «Rediger»/«Slett» 14/500 .55, uten ramme, ≥ 44×44`, JSON.stringify(liste.rader[0].knapper));
  const metaer = liste.rader.map(r => normal(r.meta));
  sjekk(metaer.join('|') === '1 000 kr · 30 min|450 kr · 30 min|1 250 kr · 75 min|150 kr · 15 min|100 kr', `${k}: meta-linjene («1 000 kr · 30 min», tillegg uten 0 min)`, metaer.join('|'));
  const b0 = liste.rader[0].besk;
  sjekk(b0 && b0.linjer === 1 && b0.ellipsis === 'ellipsis' && (bredde === 1280 || b0.kuttet), `${k}: beskrivelse én linje med ellipsis`, JSON.stringify(b0));
  sjekk(liste.rader.filter(r => r.besk).length === 1, `${k}: bare tjenesten med beskrivelse har linje 3`);
  const lang = liste.rader[2];
  sjekk(!lang.nKlipp && (bredde === 1280 || lang.nH > 30), `${k}: langt navn brytes over to linjer, kuttes ikke`, JSON.stringify([lang.nH, lang.nKlipp]));
  sjekk(liste.legg.length === 3 && liste.legg.every(x => x.fs === '15px' && x.fw === '600' && x.c === 'rgb(77, 139, 255)' && x.h === 44 && x.ramme === 'none' && x.venstre === liste.wrapVenstre),
    `${k}: «+ Legg til» blå 15/600, 44px, uten ramme, venstrestilt`, JSON.stringify(liste.legg));
  await page.evaluate(() => document.querySelector('#hovedList').scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -120));
  await bilde(page, '#tjenester .tt-h1', '#addTillegg', `${k}-a-liste`);

  // ── Arket er «Legg til booking»-arket sitt skall: samme mål på skall, tittel, ×, labels og Lagre ──
  const arkMaal = sel => page.evaluate(s => {
    const b = document.querySelector(s), m = b.querySelector('.pause-modal'), c = e => getComputedStyle(e), r = m.getBoundingClientRect();
    const lab = c(b.querySelector('.fld label')), h = c(b.querySelector('.pause-modal-h')), x = b.querySelector('.pause-modal-close'), l = b.querySelector('.ark-lagre');
    return { skall: [c(b).alignItems, c(m).borderRadius, c(m).padding, c(m).maxWidth, Math.round(r.width), Math.round(innerHeight - r.bottom) === 0 ? 'bunn' : 'midt'].join(' '),
      tittel: [h.fontSize, h.fontWeight, h.marginBottom].join(' '), lukk: [x.getBoundingClientRect().width, x.getBoundingClientRect().height, c(x).top, c(x).right].join(' '),
      label: [lab.fontSize, lab.fontWeight, lab.color, lab.marginBottom].join(' '),
      lagre: [Math.round(l.getBoundingClientRect().width), Math.round(l.getBoundingClientRect().height), c(l).fontSize, c(l).backgroundColor].join(' '),
      fokus: document.activeElement === m };
  }, sel);
  await page.evaluate(() => aapneNyBooking(null, 'oversikt')); await page.waitForTimeout(300);
  const bk = await arkMaal('#bkNyBackdrop');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const listeFor = await page.$eval('#tjenester', e => e.innerHTML.length);

  // ── b) Rediger tjenesten med beskrivelse — trykk på raden (ikke knappen) ──
  await page.click('#hovedList .tj-rad[data-i="0"] .tj-meta'); await page.waitForTimeout(150);
  const tj = await arkMaal('#tjArk');
  for (const n of ['skall', 'tittel', 'lukk', 'label', 'lagre']) sjekk(tj[n] === bk[n], `${k}: arket = «Legg til booking» (${n})`, `${tj[n]} ≠ ${bk[n]}`);
  sjekk(tj.fokus && bk.fokus, `${k}: fokus på arket ved åpning (som «Legg til booking»)`);
  sjekk(bredde < 561 ? /bunn$/.test(tj.skall) : /midt$/.test(tj.skall), `${k}: bunnark på mobil, dialog på desktop`, tj.skall);
  const red = await page.evaluate(() => {
    const a = document.getElementById('tjArk'), vis = e => !!e && e.checkVisibility();
    const felt = [...a.querySelectorAll('.tj-inp')].filter(vis).map(x => { const r = x.getBoundingClientRect(), f = x.closest('.fld');
      return { f: x.dataset.f, v: x.value, label: f.querySelector('label').textContent, fs: getComputedStyle(x).fontSize, h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width),
        resize: getComputedStyle(x).resize, suffiks: (x.parentNode.querySelector('.tj-enhet-tekst') || {}).textContent || null }; });
    return { tittel: a.querySelector('.pause-modal-h').textContent, felt, lenke: vis(a.querySelector('.tj-besk-lenke')), avbryt: !!a.querySelector('.tj-avbryt, [data-tj="avbryt"]'),
      lagre: a.querySelector('.ark-lagre').textContent, iListe: !!document.querySelector('#tjenester .tj-skjema, #tjenester .tj-inp') };
  });
  sjekk(red.tittel === 'Rediger tjeneste', `${k}: tittel «Rediger tjeneste»`, red.tittel);
  sjekk(red.felt.map(x => x.label).join('|') === 'Navn|Pris|Varighet|Beskrivelse' && red.felt[0].v === 'Skinfade' && red.felt[1].v === '1000' && red.felt[2].v === '30' && /Klipp på sidene/.test(red.felt[3].v) && !red.lenke,
    `${k}: labels Navn/Pris/Varighet/Beskrivelse, verdiene fylt inn, beskrivelsen åpen`, JSON.stringify(red.felt.map(x => [x.label, x.v])));
  sjekk(red.felt.every(x => x.fs === '16px') && red.felt.slice(0, 3).every(x => x.h === 44), `${k}: feltene uendret (16px, 44px)`, JSON.stringify(red.felt.map(x => [x.fs, x.h])));
  const [n, p, mi, be] = red.felt;
  sjekk(p.top > n.top && p.top === mi.top && Math.abs(p.w - mi.w) <= 1 && p.left === n.left, `${k}: navn i full bredde, pris + varighet 50/50 under`, JSON.stringify(red.felt.slice(0, 3)));
  sjekk(p.suffiks === 'kr' && mi.suffiks === 'min' && be.resize === 'none', `${k}: «kr»/«min» som suffiks, beskrivelsen uten dra-håndtak`, JSON.stringify([p.suffiks, mi.suffiks, be.resize]));
  sjekk(!red.avbryt && red.lagre === 'Lagre' && !red.iListe, `${k}: ingen «Avbryt», ingen skjema i lista`, JSON.stringify(red));
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-b-rediger.png` });
  // Beskrivelsen vokser med teksten
  const h0 = await page.$eval('#tjArkBeskFelt', e => e.offsetHeight);
  await page.fill('#tjArkBeskFelt', 'Klipp på sidene og kort på toppen, avsluttet med styling og voks. Vask, hårbehandling og en kald drikke er med i prisen.');
  const h1 = await page.$eval('#tjArkBeskFelt', e => ({ h: e.offsetHeight, rull: e.scrollHeight > e.clientHeight + 1 }));
  sjekk(h1.h > h0 && !h1.rull, `${k}: beskrivelsesfeltet vokser med teksten`, JSON.stringify([h0, h1]));
  // Lukk med × uten å lagre → endringen forkastes, lista uendret
  await page.fill('#tjArkNavn', 'Skinfade XL');
  await page.click('#tjArkLukk'); await page.waitForTimeout(100);
  sjekk(await page.$eval('#tjArk', e => e.hidden) && (await page.$eval('#hovedList .tj-rad[data-i="0"] .tj-navn', e => e.textContent)) === 'Skinfade' && st.put.length === 0,
    `${k}: × lukker, endringen forkastes, ingen lagring`);
  await page.click('#hovedList .tj-rad[data-i="0"] [data-tj="rediger"]');
  sjekk(await page.$eval('#tjArkNavn', e => e.value) === 'Skinfade', `${k}: åpnet på nytt → lagret verdi, ikke det forkastede`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  sjekk(await page.$eval('#tjArk', e => e.hidden), `${k}: Esc lukker`);
  sjekk((await page.$eval('#tjenester', e => e.innerHTML.length)) === listeFor, `${k}: lista uendret etter åpning/lukking`);

  // ── Nytt tillegg ──
  await page.click('#addTillegg'); await page.waitForTimeout(150);
  const till = await page.evaluate(() => { const a = document.getElementById('tjArk');
    return { tittel: a.querySelector('.pause-modal-h').textContent, ph: a.querySelector('#tjArkNavn').placeholder, verdier: [...a.querySelectorAll('.tj-inp')].filter(e => e.checkVisibility()).map(e => e.value).join(''),
      lenke: a.querySelector('.tj-besk-lenke').checkVisibility(), besk: a.querySelector('#tjArkBesk').checkVisibility() }; });
  sjekk(till.tittel === 'Nytt tillegg' && till.ph === 'F.eks. Skjegg' && till.verdier === '' && !till.lenke && !till.besk, `${k}: «Nytt tillegg» — tomt, ingen beskrivelse`, JSON.stringify(till));
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-d-nytt-tillegg.png` });
  // Trykk utenfor arket lukker
  await page.mouse.click(5, 5); await page.waitForTimeout(100);
  sjekk(await page.$eval('#tjArk', e => e.hidden), `${k}: trykk utenfor lukker`);

  // ── c) Ny hovedtjeneste: beskrivelse skjult → vist ──
  await page.click('#addHoved'); await page.waitForTimeout(150);
  const ny = await page.evaluate(() => { const a = document.getElementById('tjArk'), l = a.querySelector('.tj-besk-lenke');
    return { tittel: a.querySelector('.pause-modal-h').textContent, ph: a.querySelector('#tjArkNavn').placeholder, verdier: [...a.querySelectorAll('.tj-inp')].map(e => e.value).join(''),
      lenke: l.checkVisibility() && l.textContent, lenkeFs: getComputedStyle(l).fontSize, besk: a.querySelector('#tjArkBesk').checkVisibility(),
      suffiks: [...a.querySelectorAll('.tj-enhet-tekst')].map(e => e.checkVisibility() ? e.textContent : '-').join() }; });
  sjekk(ny.tittel === 'Ny hovedtjeneste' && ny.ph === 'F.eks. Skinfade' && ny.verdier === '' && ny.lenke === '+ Legg til beskrivelse' && ny.lenkeFs === '13px' && !ny.besk,
    `${k}: «Ny hovedtjeneste» — tomt, beskrivelsen skjult bak lenke`, JSON.stringify(ny));
  sjekk(ny.suffiks === 'kr,min', `${k}: «kr»/«min» står også i tomme felt`, ny.suffiks);
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-c1-ny-hovedtjeneste.png` });
  await page.click('#tjArkBeskLenke');
  const vist = await page.evaluate(() => { const t = document.getElementById('tjArkBeskFelt');
    return { ph: t.placeholder, fokus: document.activeElement === t, label: t.closest('.fld').querySelector('label').textContent, lenke: document.getElementById('tjArkBeskLenke').checkVisibility() }; });
  sjekk(vist.ph === 'F.eks. klipp på sidene og kort på toppen' && vist.fokus && vist.label === 'Beskrivelse' && !vist.lenke, `${k}: beskrivelsen vises med label og fokus`, JSON.stringify(vist));
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-c2-ny-hovedtjeneste-beskrivelse.png` });

  // Validering i arket: tomt navn + mangler varighet → feil under feltene, ingen PUT, ingen alert
  await page.click('#tjArkLagre');
  const val = await page.evaluate(() => [...document.querySelectorAll('#tjArk .fld-err')].filter(e => !e.hidden).map(e => [e.id, e.textContent]));
  sjekk(val.map(x => x[0]).join() === 'tjArkNavnFeil,tjArkMinFeil' && st.put.length === 0, `${k}: validering under feltene, ingen lagring`, JSON.stringify(val));
  sjekk(await page.evaluate(() => document.activeElement.id) === 'tjArkNavn', `${k}: fokus til første feilfelt`);
  if (bredde === 375) { await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-c3-validering.png` }); }

  // Lagre ny (Enter i et felt = Lagre, som i «Legg til booking»): hele lista, rene tall, beskrivelse; arket lukkes, «Lagret» ved raden
  await page.fill('#tjArkNavn', 'Barnehårklipp');
  await page.fill('#tjArkPris', '1 200');
  await page.fill('#tjArkMin', '45,4');
  await page.fill('#tjArkBeskFelt', '  Under 12 år  ');
  await page.focus('#tjArkMin'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const put1 = st.put.at(-1);
  sjekk(put1 && put1.sti === 'services' && put1.body.hoved.length === 4 && put1.body.tillegg.length === 2, `${k}: Lagre sender hele lista (4 + 2)`, JSON.stringify(put1 && put1.body));
  const nyRad = put1 && put1.body.hoved[3];
  sjekk(nyRad && nyRad.name === 'Barnehårklipp' && nyRad.price === 1200 && nyRad.min === 45 && nyRad.description === 'Under 12 år', `${k}: «1 200» → 1200, «45,4» → 45, beskrivelsen trimmet`, JSON.stringify(nyRad));
  sjekk(put1 && put1.body.hoved[0].description.startsWith('Klipp på sidene') && put1.body.hoved[2].name === LANGT, `${k}: de andre radene sendes urørt`);
  const lagret = await page.evaluate(() => { const r = document.querySelector('#hovedList .tj-rad[data-i="3"]'), s = r && r.querySelector('.tj-lagret.show');
    return { arkLukket: document.getElementById('tjArk').hidden, lagret: !!s && getComputedStyle(s).display !== 'none', farge: s && getComputedStyle(s).color, fs: s && getComputedStyle(s).fontSize }; });
  sjekk(lagret.arkLukket && lagret.lagret && lagret.farge === 'rgb(62, 207, 126)' && lagret.fs === '13px', `${k}: arket lukkes, grønn «Lagret» ved raden`, JSON.stringify(lagret));
  if (bredde === 375) { await page.evaluate(() => document.querySelector('#hovedList').scrollIntoView({ block: 'center' })); await bilde(page, '#hovedList', '#addHoved', `${k}-c4-lagret`); }
  await page.waitForTimeout(2200);
  sjekk(await page.$('#hovedList .tj-lagret.show') === null, `${k}: «Lagret» borte etter ~2 s`);

  // Fail-closed: lagring feiler → arket og verdiene står, feilen i arket, lista uendret
  st.putFeil = 'Ugyldig pris for «Klipp» — må være et helt tall mellom 0 og 100000 kr.';
  await page.click('#hovedList .tj-rad[data-i="1"] [data-tj="rediger"]');
  await page.fill('#tjArkPris', '500');
  await page.click('#tjArkLagre'); await page.waitForTimeout(250);
  const fc = await page.evaluate(() => ({ aapent: !document.getElementById('tjArk').hidden, pris: document.getElementById('tjArkPris').value,
    feil: document.getElementById('tjArkFeil').checkVisibility() && document.getElementById('tjArkFeil').textContent, lagre: document.getElementById('tjArkLagre').textContent }));
  sjekk(fc.aapent && fc.pris === '500' && fc.feil === st.putFeil && fc.lagre === 'Lagre' && dialoger.length === 0, `${k}: fail-closed — arket + verdi står, feilen i arket, ingen alert`, JSON.stringify(fc));
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-f-lagring-feilet.png` });
  await page.click('#tjArkLukk');
  const etterFeil = await page.$eval('#hovedList .tj-rad[data-i="1"] .tj-meta', e => e.textContent.replace(/Lagret$/, ''));
  sjekk(normal(etterFeil) === '450 kr · 30 min', `${k}: lista uendret etter feilet lagring`, etterFeil);
  st.putFeil = null;

  // Slett lagrer straks (uten dialog): sletter «Klipp» → PUT uten den
  const forSlett = st.put.length;
  await page.click('#hovedList .tj-rad[data-i="1"] [data-tj="slett"]'); await page.waitForTimeout(250);
  const put2 = st.put.at(-1);
  sjekk(st.put.length === forSlett + 1 && put2.body.hoved.map(x => x.name).join('|') === `Skinfade|${LANGT}|Barnehårklipp` && dialoger.length === 0, `${k}: Slett lagrer straks, uten dialog`, JSON.stringify(put2 && put2.body.hoved.map(x => x.name)));
  sjekk((await page.$$('#hovedList .tj-rad')).length === 3, `${k}: raden er borte`);

  // ── e) Betaling ──
  const pay = await page.evaluate(() => [...document.querySelectorAll('#payList .tj-rad')].map(r => ({ navn: r.querySelector('.tj-navn').textContent, meta: !!r.querySelector('.tj-meta'), kn: r.querySelectorAll('.tj-knapp').length })));
  sjekk(pay.length === 3 && pay.every(r => !r.meta && r.kn === 2), `${k}: betaling som rader uten meta-linje`, JSON.stringify(pay));
  await page.evaluate(() => document.querySelector('#payList').scrollIntoView({ block: 'center' }));
  await page.click('#addPay'); await page.waitForTimeout(150);
  const payF = await page.evaluate(() => { const a = document.getElementById('tjArk');
    return { tittel: a.querySelector('.pause-modal-h').textContent, felt: [...a.querySelectorAll('.tj-inp')].filter(e => e.checkVisibility()).map(x => [x.closest('.fld').querySelector('label').textContent, x.placeholder]),
      lenke: a.querySelector('.tj-besk-lenke').checkVisibility() }; });
  sjekk(payF.tittel === 'Ny betalingsmetode' && JSON.stringify(payF.felt) === '[["Navn","F.eks. Vipps"]]' && !payF.lenke, `${k}: «Ny betalingsmetode» — ett felt «F.eks. Vipps»`, JSON.stringify(payF));
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/${k}-e1-ny-betalingsmetode.png` });
  await page.fill('#tjArkNavn', 'Bankkort');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const put3 = st.put.at(-1);
  sjekk(put3 && put3.sti === 'payment-methods' && put3.body.methods.join() === 'Kontant,Vipps,Kort,Bankkort' && await page.$eval('#tjArk', e => e.hidden), `${k}: betaling lagres med hele lista, arket lukkes`, JSON.stringify(put3 && put3.body));
  await page.click('#payList .tj-rad[data-i="1"] [data-tj="rediger"]');
  sjekk(await page.$eval('#tjArk .pause-modal-h', e => e.textContent) === 'Rediger betalingsmetode' && await page.$eval('#tjArkNavn', e => e.value) === 'Vipps', `${k}: «Rediger betalingsmetode» fylt inn`);
  await page.click('#tjArkLukk');
  await page.waitForTimeout(2200);

  // Overskrifter + luft rundt skillestrekene
  const ov = await page.evaluate(() => {
    const stil = e => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.textTransform, c.letterSpacing, c.color].join(' '); };
    const panel = document.getElementById('tjenester');
    const h1 = [...panel.querySelectorAll('.tt-h1')].map(e => [e.textContent, stil(e)]);
    const h2 = [...panel.querySelectorAll('.tt-h2')].filter(e => e.offsetParent).map(e => [e.textContent, stil(e)]);
    const s = [...panel.querySelectorAll('.tt-s')].map(e => stil(e));
    // Luft: for hver synlig skillestrek, avstand til nærmeste synlige søsken over/under (marger + innhold, ikke box-modellen).
    const synlig = e => e && e.getClientRects().length && getComputedStyle(e).display !== 'none';
    const strek = [...panel.querySelectorAll('.svc-divider')].filter(synlig).map(d => {
      let a = d.previousElementSibling; while (a && !synlig(a)) a = a.previousElementSibling;
      let b = d.nextElementSibling; while (b && !synlig(b)) b = b.nextElementSibling;
      const r = d.getBoundingClientRect();
      return { over: Math.round(r.top - a.getBoundingClientRect().bottom), under: Math.round(b.getBoundingClientRect().top - r.bottom), forTekst: a.id || a.className, etterTekst: b.textContent.slice(0, 20) };
    });
    const bk = document.getElementById('bkRegler'), bkR = bk.getBoundingClientRect(); let fb = bk.previousElementSibling; while (fb && !synlig(fb)) fb = fb.previousElementSibling;
    const bkFoerste = bk.firstElementChild.getBoundingClientRect();
    return { h1, h2, s, strek, bk: { over: Math.round(bkR.top - fb.getBoundingClientRect().bottom), under: Math.round(bkFoerste.top - bkR.top - 1) },
      fasit: stil(panel.querySelector('.tt-h1')) };
  });
  sjekk(ov.h1.map(x => x[0]).join('|') === 'Hovedtjenester|Tillegg|Betaling|Arbeidstider' && ov.h1.every(x => x[1] === ov.h1[0][1]), `${k}: nivå 1 helt like`, JSON.stringify(ov.h1));
  sjekk(ov.h1[0][1] === '11px 700 uppercase 0.44px rgb(207, 207, 207)', `${k}: nivå 1 = dagens «Hovedtjenester» (11/700/versaler/.04em/--ink-2)`, ov.h1[0][1]);
  sjekk(ov.s.length === 4 && ov.s.every(x => x === ov.s[0]), `${k}: alle underteksteer like`, JSON.stringify(ov.s));
  sjekk(ov.h2.map(x => x[0]).join('|') === 'Faste tider|Enkeltdager|Kommende endringer' && ov.h2.every(x => x[1] === ov.h2[0][1]) && /^10\.5px 600 uppercase .* rgba\(255, 255, 255, 0\.45\)$/.test(ov.h2[0][1]),
    `${k}: nivå 2 like, mindre og dempet`, JSON.stringify(ov.h2));
  sjekk(ov.strek.length === 4 && ov.strek.every(x => x.over === 28 && x.under === 28), `${k}: 28 px over og under hver skillestrek`, JSON.stringify(ov.strek));
  sjekk(ov.bk.over === 28 && ov.bk.under === 28, `${k}: 28 px rundt streken over «Samle bookinger»`, JSON.stringify(ov.bk));
  await page.evaluate(() => document.querySelector('#payList').scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -150));
  await bilde(page, '#addTillegg', '#enkeltdager .ed-hint', `${k}-e-betaling-arbeidstider`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  sjekk(overflow <= 0, `${k}: ingen horisontal overflow`, overflow + ' px');
  sjekk(m.prod === 0, `${k}: ingen request mot prod`); sjekk(!errs.length, `${k}: pageerror`, errs.join('; ')); sjekk(!dialoger.length, `${k}: ingen alert/dialog`, dialoger.join('; '));
  await ctx.close();

  // ── d) Siste hovedtjeneste kan ikke slettes ──
  const en = await aapne(bredde, { tjenester: { hoved: [{ name: 'Skinfade', price: 1000, min: 30, description: 'Klipp på sidene og kort på toppen' }], tillegg: [{ name: 'Skjegg', price: 150, min: 15, description: '' }] } });
  await en.page.click('#hovedList .tj-rad [data-tj="slett"]'); await en.page.waitForTimeout(150);
  const sist = await en.page.evaluate(() => ({ rader: document.querySelectorAll('#hovedList .tj-rad').length, feil: document.querySelector('#hovedList .tj-rad .tj-rad-feil')?.textContent }));
  sjekk(sist.rader === 1 && sist.feil === 'Du må ha minst én hovedtjeneste. Legg til en ny før du sletter denne.' && en.st.put.length === 0, `${k}: siste hovedtjeneste slettes ikke — inline-melding, ingen PUT`, JSON.stringify(sist));
  await en.page.evaluate(() => document.querySelector('#hovedList').scrollIntoView({ block: 'center' }));
  await bilde(en.page, '#tjenester .tt-h1', '#addHoved', `${k}-d-siste-hovedtjeneste`);
  sjekk(!en.errs.length && en.m.prod === 0, `${k}/d: ingen JS-feil, ingen prod`, en.errs.join('; '));
  await en.ctx.close();
}

// Pris 0 + komma/negativ (tok over for pris0-markor.mjs og tjenester-komma.mjs, 27.11.2026) — 375
{ const { ctx, page, errs, m, st } = await aapne(375, { tjenester: { hoved: [{ name: 'Klipp', price: 0, min: 30, description: '' }, { name: 'Skinfade', price: 500, min: 40, description: '' }], tillegg: [{ name: 'Voks', price: 0, min: 0, description: '' }] } });
  const p0 = await page.evaluate(() => [...document.querySelectorAll('.tj-rad .tj-meta')].map(e => { const s = e.querySelector('.tj-mangler'); return [e.textContent.replace(/Lagret$/, ''), s ? getComputedStyle(s).color : null]; }));
  sjekk(p0[0][0] === 'Sett pris · 30 min' && p0[0][1] === 'rgb(255, 107, 94)' && p0[1][1] === null && p0[2][0] === 'Sett pris', '375: pris 0 → rød «Sett pris» i meta-linja (også tillegg)', JSON.stringify(p0));
  await page.click('#hovedList .tj-rad[data-i="0"] [data-tj="rediger"]');
  sjekk(await page.$eval('#tjArkPris', e => e.value) === '', '375: pris 0 → tomt prisfelt');
  await page.fill('#tjArkPris', '-50');
  await page.click('#tjArkLagre');
  const neg = await page.$eval('#tjArkPrisFeil', e => !e.hidden && e.textContent);
  sjekk(neg && st.put.length === 0, '375: negativ pris → feil under prisfeltet, ingen lagring', JSON.stringify(neg));
  await page.fill('#tjArkPris', '45,5');
  sjekk(await page.$eval('#tjArkPrisFeil', e => e.hidden), '375: feilen forsvinner når feltet endres');
  await page.click('#tjArkLagre'); await page.waitForTimeout(250);
  sjekk(st.put.at(-1)?.body.hoved[0].price === 46, '375: «45,5» → 46', JSON.stringify(st.put.at(-1)?.body.hoved[0]));
  sjekk(!errs.length && m.prod === 0, '375 pris 0: ingen JS-feil, ingen prod', errs.join('; '));
  await ctx.close(); }

// Lys modus (375): lista + arket — tokens har egne lyse motstykker
{ const { ctx, page, errs, m } = await aapne(375, { tema: 'light' });
  const lys = await page.evaluate(() => { const r = document.querySelector('#hovedList .tj-rad'), c = getComputedStyle(r);
    return { kant: c.borderBottomColor, knapp: getComputedStyle(r.querySelector('.tj-knapp')).color, legg: getComputedStyle(document.getElementById('addHoved')).color }; });
  sjekk(lys.kant === 'rgba(0, 0, 0, 0.08)' && lys.knapp === 'rgba(0, 0, 0, 0.62)' && lys.legg === 'rgb(20, 86, 168)', '375 lys: egne lyse tokens', JSON.stringify(lys));
  await page.evaluate(() => document.querySelector('#hovedList').scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -120));
  await bilde(page, '#tjenester .tt-h1', '#addTillegg', '375-lys-a-liste');
  await page.click('#hovedList .tj-rad[data-i="0"] [data-tj="rediger"]'); await page.waitForTimeout(150);
  await page.mouse.move(1, 1); await page.screenshot({ path: `${OUT}/375-lys-b-rediger.png` });
  sjekk(!errs.length && m.prod === 0, '375 lys: ingen JS-feil, ingen prod', errs.join('; '));
  await ctx.close(); }

await browser.close(); server.close();
console.log(feil.length ? `\n${feil.length} AVVIK:` : '\nOK ✓ — alle sjekker grønne');
for (const f of feil) console.log(' ✗', f.hva, f.detalj ? `— ${f.detalj}` : '');
console.log('Skjermbilder:', OUT);
if (feil.length) process.exitCode = 1;
