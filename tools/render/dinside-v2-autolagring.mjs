// tools/render/dinside-v2-autolagring.mjs — «Din side» v2: hver endring lagres med en gang (Henriks valg A, 12.11.2026).
//
//   node tools/render/dinside-v2-autolagring.mjs
//
// Kontrakten som testes (dinside-v2.js, «AUTOLAGRING»):
//   · tekst etter ~1 s pause eller når feltet forlates · telefon når feltet forlates · fargevelger når man slipper ·
//     font/aksent/bakgrunn med en gang · PUT /din-side med BARE de endrede feltene · aldri publiser fra autolagring
//   · hver bildehandling lagres for seg (POST /din-side/lagre, multipart, uten tekstfelt, publiser:false)
//   · siden lukkes / appen i bakgrunnen → det som gjenstår sendes (keepalive) · fanebytte/X venter på lagringen
//   · statuslinja: «Lagrer …» mens lagringen pågår, «Lagret ✓» ca. 2 s etter hver lagring og så tonet ut, feil står til
//     de er løst; plassen holdes · feil → melding ved feltet (+ «Prøv igjen» ved nett-/serverfeil), utkastet beholdes
//   · live side: ingen lagreknapp · ikke live: «Publiser siden» på siste steg (publiser:true)
// Skjermbilder (320/375) i .render-ut/dinside-v2-autolagring/: lagrer, lagret, tonet ut, feil, siste steg live / ikke live.
// Alt mot /api/** og api.trybarberhq.com mockes (fixtures/dinside-v2.mjs) — ingen request når prod.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { installerDinSideMock, startTilstand } from './fixtures/dinside-v2.mjs';
import { v2 as v2Billing } from './fixtures/billing.mjs';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT = path.resolve(import.meta.dirname, '../../.render-ut/dinside-v2-autolagring');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png',
               '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/dashboard.html#dinside`;
const browser = await chromium.launch();
const BILDE = path.resolve(ROOT, 'no/images/layout-hero.webp');
const IKKE_LIVE = () => v2Billing({ page_status: 'forhandsvist', publisert_at: null });

async function ny({ bredde = 375, hoyde = 800, tema = 'dark', mock = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: hoyde }, deviceScaleFactor: 2 });
  await ctx.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (_) {} }, tema);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const m = await installerDinSideMock(page, mock);
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForSelector('#dv2Grid:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return { ctx, page, m, errs };
}
const puts = m => m.kall.filter(k => k.metode === 'PUT' && k.sti === '/api/dashboard/din-side');
const lagreKall = m => m.utkast.filter(u => u.action === 'lagre');
const status = page => page.$eval('#dv2Status', e => ({ t: e.textContent, k: e.className }));
const stegKnapp = (page, i) => page.click(`#dv2Steg [data-steg="${i}"]`);
const synlig = (page, sel) => page.$eval(sel, e => e.checkVisibility()).catch(() => false);
const aktivt = page => page.evaluate(() => (document.querySelector('.panel.active') || {}).id);
const nav = (page, panel) => page.evaluate(p => document.querySelector(`.nav button[data-panel="${p}"]`).click(), panel);   // som bunn-navet gjør
async function ventPaa(fn, ms = 4000) { const slutt = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > slutt) return v; await new Promise(r => setTimeout(r, 60)); } }
const lagretOk = page => ventPaa(async () => /Lagret ✓/.test((await status(page)).t) && await page.evaluate(() => !DinSideV2.ulagret()));
// Statuslinja står i bunnbaren nederst i steget (live side) — rull helt ned, slik brukeren ser den over bunn-navet.
async function skjerm(page, navn) { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${navn}.png` }); }

/* ── A. Tekst: lagres etter en pause, bare det endrede feltet, aldri publiser ── */
{
  const { ctx, page, m, errs } = await ny();
  sjekk(!(await synlig(page, '#dv2Publiser')), 'A: live side, steg 1 — ingen lagre-/publiserknapp');
  await page.fill('#dv2Tagline', 'Fades og skjegg æøå');
  await page.waitForTimeout(450);
  sjekk(puts(m).length === 0, 'A: ingen lagring mens man fortsatt kan skrive (< 1 s)', String(puts(m).length));
  await lagretOk(page);
  const p = puts(m);
  sjekk(p.length === 1 && JSON.stringify(p[0].body) === JSON.stringify({ profil: { tagline: 'Fades og skjegg æøå' } }), 'A: én PUT /din-side med bare det endrede feltet', JSON.stringify(p.map(x => x.body)));
  sjekk(m.tilstand.profil.tagline === 'Fades og skjegg æøå', 'A: lagret på serveren');
  const st = await status(page);
  sjekk(st.t === 'Lagret ✓' && /lagret/.test(st.k), 'A: «Lagret ✓» i statuslinja (diskret)', JSON.stringify(st));
  // Skriving i ett strekk → én lagring etter pausen, ikke én per tegn
  await page.click('#dv2Bio'); await page.keyboard.press('End'); await page.keyboard.type(' Kom innom!', { delay: 70 });
  await lagretOk(page);
  sjekk(puts(m).length === 2 && puts(m)[1].body.profil.bio.endsWith('Kom innom!'), 'A: et strekk med skriving gir ÉN lagring', String(puts(m).length));
  // Felt forlates → lagres med en gang (uten å vente på pausen)
  await page.fill('#dv2Address', 'Storgata 1, Oslo'); await page.click('#dv2Tittel');
  await page.waitForTimeout(300);
  sjekk(puts(m).length === 3 && puts(m)[2].body.profil.address === 'Storgata 1, Oslo', 'A: feltet forlatt → lagret med en gang', String(puts(m).length));
  sjekk(!m.kall.some(k => /page-status/.test(k.sti)) && lagreKall(m).length === 0 && !puts(m).some(k => 'publiser' in (k.body || {})), 'A: autolagring publiserer aldri (ingen /lagre, ingen publiser, ingen /page-status)');
  sjekk(m.prod === 0 && !errs.length, 'A: ingen prod-request, ingen JS-feil', errs.join('; '));
  await ctx.close();
}

/* ── B. Telefon: bare når feltet forlates · handle normaliseres av serveren ── */
{
  const { ctx, page, m } = await ny();
  await stegKnapp(page, 3);
  await page.fill('#dv2Telefon', '98 76 54 32'); await page.waitForTimeout(1500);
  sjekk(puts(m).length === 0, 'B: telefonen lagres ikke mens feltet har fokus');
  await page.click('#dv2Instagram');
  await ventPaa(async () => puts(m).length === 1);
  sjekk(puts(m)[0] && JSON.stringify(puts(m)[0].body) === JSON.stringify({ kontakt: { contact_phone: '98 76 54 32' } }), 'B: telefonen lagres når feltet forlates', JSON.stringify(puts(m).map(x => x.body)));
  await page.fill('#dv2Instagram', '@mitt_navn'); await page.click('#dv2Tittel'); await lagretOk(page);
  sjekk(await page.$eval('#dv2Instagram', e => e.value) === 'mitt_navn', 'B: serverens normaliserte handle vises når feltet er forlatt', await page.$eval('#dv2Instagram', e => e.value));
  await ctx.close();
}

/* ── C. Font på steg 2 → forlat flyten → endringen er lagret ── */
{
  // (1) font + fanebytte
  const { ctx, page, m, errs } = await ny();
  await stegKnapp(page, 1); await page.selectOption('#dv2Fonter', 'bebas');
  await nav(page, 'oversikt'); await page.waitForTimeout(600);
  sjekk(await aktivt(page) === 'oversikt' && !(await synlig(page, '.dv2-dialog')), 'C: font endret → fanebytte uten dialog', await aktivt(page));
  sjekk(m.tilstand.utseende.font === 'bebas' && puts(m).length === 1 && JSON.stringify(puts(m)[0].body) === JSON.stringify({ utseende: { font: 'bebas' } }), 'C: fonten er lagret (bare font i kallet)', JSON.stringify(puts(m).map(x => x.body)));
  sjekk(!errs.length, 'C: ingen JS-feil', errs.join('; '));
  await ctx.close();
}
{
  // (2) lagringen er treg: fanebyttet venter til den er ferdig, ingen dialog
  const { ctx, page, m } = await ny({ mock: { putForsinkelse: 1200 } });
  await stegKnapp(page, 1); await page.selectOption('#dv2Fonter', 'fraunces');
  await nav(page, 'oversikt'); await page.waitForTimeout(300);
  sjekk(await aktivt(page) === 'design' && /Lagrer/.test((await status(page)).t) && !(await synlig(page, '.dv2-dialog')), 'C: treg lagring — byttet venter, «Lagrer …», ingen dialog', JSON.stringify(await status(page)));
  await ventPaa(async () => await aktivt(page) === 'oversikt', 4000);
  sjekk(await aktivt(page) === 'oversikt' && m.tilstand.utseende.font === 'fraunces', 'C: … og skjer når lagringen er ferdig', await aktivt(page));
  await ctx.close();
}
{
  // (3) tekst skrevet og fanen byttet før pausen → lagres før byttet
  const { ctx, page, m } = await ny();
  await page.fill('#dv2Om', 'Parkering i bakgården.'); await nav(page, 'oversikt');
  await ventPaa(async () => await aktivt(page) === 'oversikt');
  sjekk(m.tilstand.profil.om === 'Parkering i bakgården.' && !(await synlig(page, '.dv2-dialog')), 'C: tekst før pausen + fanebytte → lagret, ingen dialog');
  await ctx.close();
}
{
  // (4) siden lukkes / lastes på nytt rett etter en endring (iPhone: ingen beforeunload-dialog) → sendt med keepalive
  const { ctx, page, m } = await ny();
  let dialog = null; page.on('dialog', d => { dialog = d.type(); d.dismiss().catch(() => {}); });
  await page.click('#dv2Tagline'); await page.fill('#dv2Tagline', 'Rett før lukking');
  await page.goto('about:blank'); await page.waitForTimeout(600);
  const k = puts(m).pop();
  sjekk(m.tilstand.profil.tagline === 'Rett før lukking' && k && JSON.stringify(k.body) === JSON.stringify({ profil: { tagline: 'Rett før lukking' } }), 'C: siden forlates før pausen → endringen sendes likevel (keepalive)', JSON.stringify(k && k.body));
  sjekk(dialog === null, 'C: ingen «Forlate siden?» når alt kan sendes', String(dialog));
  // Tilbake: endringen er der
  await page.goto(URL_, { waitUntil: 'networkidle' }); await page.waitForSelector('#dv2Grid:not([hidden])');
  sjekk(await page.$eval('#dv2Tagline', e => e.value) === 'Rett før lukking', 'C: åpnet på nytt → endringen står');
  await ctx.close();
}
{
  // (5) appen i bakgrunnen (visibilitychange hidden) → det som gjenstår sendes
  const { ctx, page, m } = await ny();
  await stegKnapp(page, 3); await page.fill('#dv2Telefon', '41 22 33 44');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await ventPaa(async () => m.tilstand.kontakt.contact_phone === '41 22 33 44');
  sjekk(m.tilstand.kontakt.contact_phone === '41 22 33 44', 'C: appen i bakgrunnen → også telefonen (feltet ikke forlatt) sendes', m.tilstand.kontakt.contact_phone);
  await ctx.close();
}

/* ── D. Fargevelgeren: lagres når man slipper ── */
{
  const { ctx, page, m } = await ny();
  await stegKnapp(page, 1); await page.click('[data-aksent="egen"]'); await lagretOk(page);
  const n0 = puts(m).length;
  const b = await page.$eval('#dv2Sv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await page.mouse.move(b.x + b.w * 0.2, b.y + b.h * 0.3); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.w * (0.2 + i * 0.07), b.y + b.h * 0.3, { steps: 2 });
  await page.waitForTimeout(400);
  sjekk(puts(m).length === n0, 'D: ingen lagring mens man drar', `${puts(m).length - n0} kall`);
  await page.mouse.up(); await lagretOk(page);
  const k = puts(m).slice(n0);
  sjekk(k.length === 1 && k[0].body.utseende.aksent === 'egen' && /^#[0-9a-f]{6}$/.test(k[0].body.utseende.custom_accent) && m.tilstand.utseende.custom_accent === k[0].body.utseende.custom_accent, 'D: én lagring når man slipper (aksent + farge sammen)', JSON.stringify(k.map(x => x.body)));
  await page.fill('#dv2Hex', '#12'); await page.waitForTimeout(1400);
  sjekk(puts(m).length === n0 + 1 && await page.$eval('#dv2HexFeil', e => !e.hidden), 'D: ugyldig fargekode sendes ikke, melding ved feltet');
  await ctx.close();
}

/* ── S. Statuslinja (Henrik 12.11.2026): «Lagrer …» mens lagringen pågår · «Lagret ✓» ca. 2 s etter hver lagring, så
      tones den ut · feilmeldinger står til de er løst · plassen holdes (knappene hopper ikke) ── */
for (const bredde of [320, 375]) {
  const { ctx, page, m, errs } = await ny({ bredde, mock: { putForsinkelse: 1500 } });
  // Live side på mobil: statuslinja står fast rett over bunn-navet (ute av flyten). Knappen skal aldri flytte seg.
  const pille = () => page.$eval('#dv2Status', e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), bn = document.querySelector('.bunn-nav').getBoundingClientRect();
    return { vis: cs.display !== 'none' && r.height > 0, fast: cs.position === 'fixed', bred: Math.round(r.width) === innerWidth, bunn: Math.round(r.bottom), topp: Math.round(r.top), bnTopp: Math.round(bn.top), iVindu: r.top >= 0 && r.bottom <= innerHeight }; });
  const knappTopp = () => page.$eval('#dv2Neste', e => Math.round(e.getBoundingClientRect().top + scrollY));
  const k0 = await knappTopp();
  let pl = await pille();
  sjekk(!pl.vis && (await status(page)).t === '', `S ${bredde}: ingen statuslinje før noe er lagret`, JSON.stringify(pl));
  await page.fill('#dv2Tagline', 'Klipp uten stress'); await page.click('#dv2Tittel');   // forlatt → lagres nå; svaret tar 1,5 s
  await page.waitForTimeout(300);
  let st = await status(page); pl = await pille();
  sjekk(st.t === 'Lagrer …', `S ${bredde}: «Lagrer …» mens lagringen pågår`, JSON.stringify(st));
  sjekk(pl.vis && pl.fast && pl.bred && pl.iVindu && Math.abs(pl.bunn - pl.bnTopp) <= 1, `S ${bredde}: statuslinja står fast rett over bunn-navet, full bredde, synlig uten å rulle`, JSON.stringify(pl));
  sjekk(await knappTopp() === k0, `S ${bredde}: knappen flytter seg ikke når statuslinja kommer`);
  await page.screenshot({ path: `${OUT}/${bredde}-lagrer.png` });
  await ventPaa(async () => (await status(page)).t === 'Lagret ✓', 4000);
  const t0 = Date.now();
  st = await status(page);
  sjekk(st.t === 'Lagret ✓' && /lagret/.test(st.k) && !/tones/.test(st.k), `S ${bredde}: «Lagret ✓» når lagringen er ferdig`, JSON.stringify(st));
  await page.waitForTimeout(Math.max(0, 1500 - (Date.now() - t0)));
  sjekk(await page.$eval('#dv2Status', e => e.textContent === 'Lagret ✓' && getComputedStyle(e).opacity === '1'), `S ${bredde}: fortsatt helt synlig etter 1,5 s`);
  await page.waitForTimeout(Math.max(0, 2150 - (Date.now() - t0)));
  const midt = await page.$eval('#dv2Status', e => ({ k: e.className, o: +(+getComputedStyle(e).opacity).toFixed(2) }));
  sjekk(/tones/.test(midt.k) && midt.o < 1, `S ${bredde}: tones ut etter ca. 2 s`, JSON.stringify(midt));
  await page.waitForTimeout(Math.max(0, 3000 - (Date.now() - t0)));
  const etter = { t: (await status(page)).t, vis: (await pille()).vis, k: await knappTopp() };
  sjekk(etter.t === '' && !etter.vis && etter.k === k0, `S ${bredde}: borte etter toningen, knappen står stille`, JSON.stringify({ ...etter, k0 }));
  await page.screenshot({ path: `${OUT}/${bredde}-tonet-ut.png` });
  // Feil blir stående til den er løst
  m.opts.putForsinkelse = 0; m.opts.putFeil = 'nett';
  await stegKnapp(page, 1); await page.selectOption('#dv2Fonter', 'oswald');
  await ventPaa(async () => /Ikke lagret/.test((await status(page)).t));
  await page.waitForTimeout(3200);
  st = await status(page);
  const fortsatt = await page.evaluate(() => !!document.querySelector('[data-dv2-feil="font"]'));
  sjekk(/Ikke lagret/.test(st.t) && /feil/.test(st.k) && fortsatt, `S ${bredde}: feilmeldingen står fortsatt etter 3 s (ved feltet og i statuslinja)`, JSON.stringify(st));
  await page.evaluate(() => document.querySelector('[data-dv2-feil="font"]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${bredde}-feil.png` });
  // Rullet helt ned med feilen synlig: statuslinja dekker ikke «← Tilbake» / «Neste →»
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150);
  const dekk = await page.evaluate(() => { const p = document.getElementById('dv2Status').getBoundingClientRect();
    return ['#dv2Tilbake', '#dv2Neste'].map(s => document.querySelector(s)).filter(e => e && e.checkVisibility()).map(e => { const r = e.getBoundingClientRect(); return { id: e.id, bunn: Math.round(r.bottom), pilleTopp: Math.round(p.top), overlapp: r.bottom > p.top && r.top < p.bottom }; }); });
  sjekk(dekk.length && dekk.every(d => !d.overlapp), `S ${bredde}: statuslinja dekker ikke knappene når man har rullet helt ned`, JSON.stringify(dekk));
  m.opts.putFeil = null;
  await page.click('[data-dv2-feil="font"] .dv2-provigjen'); await lagretOk(page);
  st = await status(page);
  sjekk(st.t === 'Lagret ✓' && !(await page.$('[data-dv2-feil="font"]')), `S ${bredde}: løst → feilen borte, «Lagret ✓»`, JSON.stringify(st));
  sjekk(!errs.length, `S ${bredde}: ingen JS-feil`, errs.join('; '));
  await ctx.close();
}

/* ── S2. Fontbytte øverst i Utseende på en ekte telefonhøyde (320×568, 375×667): «Lagret ✓» synes der man er — uten å
       rulle ned til bunnbaren. Brukeren ruller bare fram til fontvelgeren, som man gjør for å trykke på den. ── */
for (const [bredde, hoyde] of [[320, 568], [375, 667]]) {
  const { ctx, page, errs } = await ny({ bredde, hoyde });
  await stegKnapp(page, 1); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
  await page.evaluate(() => { const f = document.getElementById('dv2Fonter'), r = f.getBoundingClientRect(), bn = document.querySelector('.bunn-nav').getBoundingClientRect();
    if (r.bottom > bn.top - 70) f.scrollIntoView({ block: 'center' }); });   // fram til fontvelgeren hvis den står under folden
  await page.selectOption('#dv2Fonter', 'bebas');
  await ventPaa(async () => (await status(page)).t === 'Lagret ✓');
  const r = await page.evaluate(() => { const s = document.getElementById('dv2Status').getBoundingClientRect(), f = document.getElementById('dv2Fonter').getBoundingClientRect(),
    bn = document.querySelector('.bunn-nav').getBoundingClientRect(), bar = document.getElementById('dv2Bar').getBoundingClientRect();
    return { pille: [Math.round(s.top), Math.round(s.bottom)], font: [Math.round(f.top), Math.round(f.bottom)], bnTopp: Math.round(bn.top), barTopp: Math.round(bar.top), h: innerHeight }; });
  sjekk(r.font[0] >= 0 && r.font[1] <= r.pille[0] && r.pille[0] >= 0 && Math.abs(r.pille[1] - r.bnTopp) <= 1,
    `S2 ${bredde}×${hoyde}: fontvelgeren og «Lagret ✓» synlige samtidig — statuslinja rett over bunn-navet, ikke oppå velgeren`, JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/${bredde}-lagret-etter-fontbytte.png` });
  sjekk(!errs.length, `S2 ${bredde}: ingen JS-feil`, errs.join('; '));
  await ctx.close();
}
{
  // Oppsettet (fokus): statuslinja står i den faste bunnbaren og holder plassen også tom (ingen pille, knappene hopper ikke)
  const { ctx, page } = await ny({ mock: { billing: IKKE_LIVE() } });
  const s = await page.$eval('#dv2Status', e => ({ fast: getComputedStyle(e).position === 'fixed', h: Math.round(e.getBoundingClientRect().height), iBar: !!e.closest('#dv2Bar') && getComputedStyle(document.getElementById('dv2Bar')).position === 'fixed' }));
  sjekk(!s.fast && s.iBar && s.h > 0, 'Oppsettet: statuslinja i den faste bunnbaren, plassen holdt når den er tom', JSON.stringify(s));
  await ctx.close();
}

/* ── E. Feil: melding ved feltet, «Prøv igjen», utkastet beholdt ── */
for (const bredde of [320, 375]) {
  const { ctx, page, m, errs } = await ny({ bredde });
  await page.fill('#dv2Tagline', 'Klipp uten stress'); await lagretOk(page);
  // Nettet faller ut → fontvalget feiler
  m.opts.putFeil = 'nett';
  await stegKnapp(page, 1); await page.selectOption('#dv2Fonter', 'oswald');
  await ventPaa(async () => /Ikke lagret/.test((await status(page)).t));
  const f = await page.evaluate(() => { const p = document.querySelector('[data-dv2-feil="font"]'); return p && { tekst: p.textContent, knapp: !!p.querySelector('.dv2-provigjen'), synlig: p.checkVisibility() }; });
  sjekk(f && f.synlig && /Ikke lagret/.test(f.tekst) && f.knapp, `E ${bredde}: rød melding ved fontfeltet med «Prøv igjen»`, JSON.stringify(f));
  sjekk(f && (f.tekst.match(/prøv igjen/gi) || []).length === 1, `E ${bredde}: «prøv igjen» står bare én gang (knappen)`, f && f.tekst);
  const st = await status(page);
  sjekk(/Ikke lagret/.test(st.t) && /feil/.test(st.k), `E ${bredde}: statuslinja sier «Ikke lagret»`, JSON.stringify(st));
  sjekk(await page.$eval('#dv2Fonter', e => e.value) === 'oswald' && await page.evaluate(() => DinSideV2.ulagret()) && m.tilstand.utseende.font === 'jakarta', `E ${bredde}: utkastet beholdt (oswald valgt), serveren urørt`);
  sjekk(await page.$eval('#dv2Steg [data-steg="1"] .feilpunkt', e => !e.hidden), `E ${bredde}: feilprikk på steget`);
  const knapp = await page.$eval('[data-dv2-feil="font"] .dv2-provigjen', e => { const r = e.getBoundingClientRect(); return Math.round(r.height); });
  sjekk(knapp >= 40, `E ${bredde}: «Prøv igjen» har trykkflate ≥ 40 px`, String(knapp));
  // Forlate flyten mens lagringen har feilet → dialog
  await nav(page, 'oversikt');
  await page.waitForSelector('.dv2-dialog', { timeout: 4000 }).catch(() => {});
  const d = await page.evaluate(() => { const x = document.querySelector('.dv2-dialog'); return x && { t: x.querySelector('h4').textContent, k: [...x.querySelectorAll('.dv2-btn')].map(b => b.textContent) }; });
  sjekk(d && d.t === 'Endringene er ikke lagret' && d.k.includes('Forkast endringene') && d.k.includes('Bli her'), `E ${bredde}: forlate etter feilet lagring → «Forkast endringene» / «Bli her»`, JSON.stringify(d));
  await page.click('.dv2-dialog .dv2-btn:not(.farlig)'); await page.waitForTimeout(250);
  sjekk(await aktivt(page) === 'design' && await page.$eval('#dv2Fonter', e => e.value) === 'oswald', `E ${bredde}: «Bli her» — utkastet står`);
  // Nettet er tilbake → «Prøv igjen»
  m.opts.putFeil = null;
  await page.click('[data-dv2-feil="font"] .dv2-provigjen'); await lagretOk(page);
  sjekk(m.tilstand.utseende.font === 'oswald' && !(await page.$('[data-dv2-feil="font"]')) && (await status(page)).t === 'Lagret ✓', `E ${bredde}: «Prøv igjen» lagrer, meldingen forsvinner, «Lagret ✓»`);
  sjekk(!errs.length, `E ${bredde}: ingen JS-feil`, errs.join('; '));
  await ctx.close();
}
{
  // Valideringsfeil (400 med felt): melding ved feltet uten «Prøv igjen» (et nytt forsøk hjelper ikke), resten lagres
  const { ctx, page, m } = await ny();
  await stegKnapp(page, 3);
  await page.fill('#dv2Telefon', '000'); await page.fill('#dv2Snapchat', 'grand.snap'); await page.click('#dv2Tittel');
  await ventPaa(async () => m.tilstand.kontakt.snapchat === 'grand.snap');
  const fm = await page.$eval('[data-felt="contact_phone"] .fld-err', e => ({ vis: !e.hidden, tekst: e.textContent, knapp: !!e.querySelector('.dv2-provigjen') }));
  sjekk(fm.vis && /ikke gyldig/.test(fm.tekst) && !fm.knapp, '400: melding under telefonfeltet, uten «Prøv igjen»', JSON.stringify(fm));
  sjekk(m.tilstand.kontakt.snapchat === 'grand.snap' && m.tilstand.kontakt.contact_phone === '91 23 45 67', '400: det gyldige feltet lagres, det ugyldige ikke');
  await page.fill('#dv2Telefon', '91 23 45 68');
  sjekk(await page.$eval('[data-felt="contact_phone"] .fld-err', e => e.hidden), '400: meldingen forsvinner når feltet endres');
  await page.click('#dv2Tittel'); await lagretOk(page);
  sjekk(m.tilstand.kontakt.contact_phone === '91 23 45 68', '400: rettet nummer lagres');
  await ctx.close();
}

/* ── F. Siste steg: live side uten knapp · ikke live med «Publiser siden» — og autolagring publiserer aldri ── */
for (const bredde of [320, 375]) {
  {
    const { ctx, page } = await ny({ bredde });
    await stegKnapp(page, 3); await page.waitForTimeout(200);
    const k = await page.evaluate(() => ({ publiser: document.getElementById('dv2Publiser').checkVisibility(), neste: document.getElementById('dv2Neste').checkVisibility(),
      tilbake: document.getElementById('dv2Tilbake').checkVisibility(), hjelp: document.getElementById('dv2Hjelpelinje').checkVisibility() }));
    sjekk(!k.publiser && !k.neste && k.tilbake && !k.hjelp, `F ${bredde}: live, siste steg — bare «← Tilbake», ingen lagreknapp`, JSON.stringify(k));
    await page.fill('#dv2Snapchat', 'grand'); await page.click('#dv2Tittel'); await lagretOk(page);
    await skjerm(page, `${bredde}-siste-steg-live`);
    await ctx.close();
  }
  {
    const { ctx, page, m, errs } = await ny({ bredde, mock: { billing: IKKE_LIVE() } });
    await page.fill('#dv2Tagline', 'Utkast før publisering'); await stegKnapp(page, 1); await page.click('[data-mode="lys"]');
    await lagretOk(page);
    sjekk(puts(m).length === 2 && lagreKall(m).length === 0 && !puts(m).some(k => 'publiser' in (k.body || {})), `F ${bredde}: ikke live — endringene lagres med PUT, ingen publisering`, JSON.stringify(puts(m).map(k => k.body)));
    sjekk(m.tilstand.profil.tagline === 'Utkast før publisering' && await page.evaluate(() => _billing && _billing.page_status) === 'forhandsvist', `F ${bredde}: ikke live — lagret, siden fortsatt ikke publisert`);
    await stegKnapp(page, 3); await page.waitForTimeout(250);
    const k = await page.evaluate(() => ({ publiser: document.getElementById('dv2Publiser').checkVisibility() && document.getElementById('dv2Publiser').textContent, aktiv: !document.getElementById('dv2Publiser').disabled,
      hjelp: document.getElementById('dv2Hjelpelinje').checkVisibility() && document.getElementById('dv2Hjelpelinje').textContent }));
    sjekk(k.publiser === 'Publiser siden' && k.aktiv && k.hjelp === 'Når du publiserer, går siden live og kundene kan booke.', `F ${bredde}: ikke live, siste steg — «Publiser siden» + hjelpelinje`, JSON.stringify(k));
    await page.screenshot({ path: `${OUT}/${bredde}-siste-steg-ikke-live.png` });
    if (bredde === 375) {
      await page.fill('#dv2Instagram', 'grand_fade');   // ikke lagret ennå når man trykker → følger med publiseringen
      await page.click('#dv2Publiser'); await page.waitForSelector('#dv2Bekreft:not([hidden])', { timeout: 5000 }).catch(() => {});
      const lg = lagreKall(m);
      sjekk(lg.length === 1 && lg[0].draft.publiser === true && lg[0].draft.kontakt.instagram === 'grand_fade', 'F: «Publiser siden» → publiser:true med hele utkastet', JSON.stringify(lg.map(x => x.draft)));
      sjekk(await page.$eval('#dv2BekreftH', e => e.textContent) === 'Siden din er live' && !m.kall.some(k => /page-status/.test(k.sti)), 'F: «Siden din er live», ingen /page-status');
    }
    sjekk(!errs.length, `F ${bredde}: ingen JS-feil`, errs.join('; '));
    await ctx.close();
  }
}
{
  // Krav mangler: lagret, ikke publisert → backendens melding vises som den er
  const t = startTilstand(); t.krav = { tjeneste_med_pris: true, apen_dag: false };
  const { ctx, page } = await ny({ mock: { tilstand: t, billing: IKKE_LIVE() } });
  await stegKnapp(page, 3); await page.click('#dv2Publiser'); await page.waitForTimeout(700);
  const st = await status(page);
  sjekk(/kan ikke publiseres før du har lagt inn åpningstid/.test(st.t) && /info/.test(st.k) && await page.$eval('#dv2Bekreft', e => e.hidden), 'F: krav mangler → meldingen fra backend, ingen bekreftelse', JSON.stringify(st));
  await ctx.close();
}
{
  // X i oppsettet: det som gjenstår lagres og oppsettet lukkes uten dialog
  const { ctx, page, m } = await ny({ mock: { billing: IKKE_LIVE() } });
  await page.fill('#dv2Tagline', 'Lagres ved X'); await page.click('#fokusX');
  await ventPaa(async () => await aktivt(page) === 'oversikt');
  sjekk(await aktivt(page) === 'oversikt' && m.tilstand.profil.tagline === 'Lagres ved X' && !(await synlig(page, '.dv2-dialog')), 'F: X med endring → lagret, oppsettet lukket uten dialog');
  await ctx.close();
}

/* ── G. Bilder: hver handling lagres for seg ── */
{
  const { ctx, page, m, errs } = await ny();
  await stegKnapp(page, 2); await page.waitForTimeout(400);
  await page.setInputFiles('#dv2FilGalleri', BILDE);
  await ventPaa(async () => lagreKall(m).length === 1 && await page.evaluate(() => !DinSideV2.ulagret()));
  const l1 = lagreKall(m)[0];
  sjekk(l1 && l1.draft.publiser === false && !l1.draft.profil && !l1.draft.utseende && !l1.draft.kontakt && l1.draft.images.length === 5 && l1.filer.length === 1, 'G: opplasting → én lagring med bare bildene (publiser:false, ingen tekstfelt)', JSON.stringify(l1 && { ...l1.draft, images: l1.draft.images.length, filer: l1.filer.length }));
  sjekk(m.tilstand.bilder.filter(b => b.slot === 'galleri').length === 4 && (await page.$$eval('#dv2Galleri .flis', f => f.map(e => e.dataset.id))).every(id => !/^draft-/.test(id)), 'G: galleriet viser serverens bilder etter lagring');
  await page.click('#dv2Galleri .flis[data-id="g1"]'); await page.click('[data-h="senere"]');
  await ventPaa(async () => lagreKall(m).length === 2 && await page.evaluate(() => !DinSideV2.ulagret()));
  sjekk(m.tilstand.bilder.filter(b => b.slot === 'galleri').sort((a, b) => a.sort_order - b.sort_order).map(b => b.id).slice(0, 2).join() === 'g2,g1', 'G: flytting lagres med en gang');
  await page.click('#dv2Galleri .flis[data-id="g3"]'); await page.click('#dv2Galleri [data-h="slett"]'); await page.waitForSelector('.dv2-dialog');
  const dl = await page.evaluate(() => ({ t: document.querySelector('.dv2-dialog p').textContent, k: [...document.querySelectorAll('.dv2-dialog .dv2-btn')].map(b => b.textContent) }));
  sjekk(dl.t === 'Bildet fjernes fra siden din med en gang.' && dl.k.includes('Fjern bildet') && dl.k.includes('Behold') && !/når du lagrer/.test(dl.t), 'G: slettedialogen sier at bildet fjernes med en gang', JSON.stringify(dl));
  await page.click('.dv2-dialog .farlig');
  await ventPaa(async () => lagreKall(m).length === 3 && await page.evaluate(() => !DinSideV2.ulagret()));
  sjekk(!m.tilstand.bilder.some(b => b.id === 'g3'), 'G: sletting lagres med en gang');
  sjekk(!errs.length, 'G: ingen JS-feil', errs.join('; '));
  await ctx.close();
}
{
  // Bildelagringen feiler → melding i Bilder med «Prøv igjen», utkastet beholdt; nettet tilbake → «Prøv igjen» lagrer
  const { ctx, page, m } = await ny({ mock: { lagreFeil: 'nett' } });
  await stegKnapp(page, 2); await page.waitForTimeout(400);
  await page.setInputFiles('#dv2FilGalleri', BILDE);
  await ventPaa(async () => await page.$eval('#dv2BilderFeil', e => !e.hidden));
  const bf = await page.$eval('#dv2BilderFeil', e => ({ t: e.textContent, knapp: !!e.querySelector('.dv2-provigjen') }));
  sjekk(/ikke lagret/i.test(bf.t) && bf.knapp && (await page.$$eval('#dv2Galleri .flis', f => f.length)) === 4 && m.tilstand.bilder.filter(b => b.slot === 'galleri').length === 3, 'G: feilet bildelagring → melding med «Prøv igjen», bildet står i utkastet, serveren urørt', JSON.stringify(bf));
  m.opts.lagreFeil = null;
  await page.click('#dv2BilderFeil .dv2-provigjen');
  await ventPaa(async () => await page.evaluate(() => !DinSideV2.ulagret()));
  sjekk(m.tilstand.bilder.filter(b => b.slot === 'galleri').length === 4 && await page.$eval('#dv2BilderFeil', e => e.hidden), 'G: «Prøv igjen» lagrer bildet');
  await ctx.close();
}

await browser.close(); server.close();
console.log('\nSkjermbilder:', OUT);
ferdig();
