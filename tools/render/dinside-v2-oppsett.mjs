// tools/render/dinside-v2-oppsett.mjs — prototypen av «Din side» v2 (oppsett A / etter oppsettet B) mot den LOKALE backenden.
//
//   1) i backend-repoet:  E2E_FRONTEND_ORIGINS=http://127.0.0.1:4330 npm run e2e:backend      (127.0.0.1:3100, lokal DB)
//   2) her:               E2E_EPOST=… E2E_PASSORD=… node tools/render/dinside-v2-oppsett.mjs
//      E2E_EPOST/E2E_PASSORD = en lokal v2-barber med passord (står aldri i repoet). E2E_SLUG = samme barbers slug
//      (standard sidemal-test). E2E_BACKEND_DIR = backend-mappa (standard ../barberhq-backend/barberhq-backend).
//
// Prototypen (tools/render/prototyper/dinside-v2-oppsett.html) serveres fra repo-rota på 127.0.0.1:4330 — samme vert som
// API-et, ellers sendes ikke sesjons-cookien. Data, forhåndsvisning og lagring er ekte (lokal backend):
//   lagring = POST /api/dashboard/din-side/lagre { …, publiser: !live } → alltid 200 { lagret, publisering{publisert,melding?} }.
// Barberens page_status settes direkte i den LOKALE databasen før hver gruppe (A = ikke live, B = live), fordi v2 ikke kan
// avpubliseres via API-et. Hjelperen nekter å kjøre mot en ikke-lokal DATABASE_URL. Til slutt: live + nøytralt utseende.
// Alt annet enn 127.0.0.1 og Google Fonts avbrytes, så ingenting kan nå prod. Fargevelgeren er godkjent og fotograferes ikke.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

const { E2E_EPOST, E2E_PASSORD } = process.env;
if (!E2E_EPOST || !E2E_PASSORD) { console.error('Mangler E2E_EPOST/E2E_PASSORD (lokal v2-barber). Se toppen av fila.'); process.exit(2); }
const API = process.env.E2E_API || 'http://127.0.0.1:3100';
const PORT = +(process.env.E2E_FRONTEND_PORT || 4330);
const SLUG = process.env.E2E_SLUG || 'sidemal-test';
const REPO = path.resolve(import.meta.dirname, '../..');
const BACKEND = path.resolve(process.env.E2E_BACKEND_DIR || path.join(REPO, '../barberhq-backend/barberhq-backend'));
const OUT = path.resolve(REPO, '.render-ut/dinside-v2-oppsett');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

// page_status på den lokale testbarberen (kun lokal DB — samme vakt som e2e-backend.cjs sin preflight).
function settStatus(status) {
  const kode = `const {Pool}=require('pg');const u=process.env.DATABASE_URL||'';if(!/localhost|127\\.0\\.0\\.1/.test(u)){console.error('IKKE LOKAL DATABASE');process.exit(3);}
    const p=new Pool({connectionString:u});p.query("update barbers set page_status=$1 where slug=$2 and sidemal='v2'",[${JSON.stringify(status)},${JSON.stringify(SLUG)}])
    .then(r=>{if(r.rowCount!==1){console.error('fant ikke v2-barberen');process.exit(4);}p.end();}).catch(e=>{console.error(e.message);process.exit(5);});`;
  const r = spawnSync(process.execPath, ['--env-file', '.env', '-e', kode], { cwd: BACKEND, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('settStatus(' + status + ') feilet: ' + (r.stderr || r.status));
}

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript' };
const server = http.createServer((q, r) => { const f = path.join(REPO, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(REPO)) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/tools/render/prototyper/dinside-v2-oppsett.html?api=${encodeURIComponent(API)}`;
const browser = await chromium.launch();
let utenfor = 0;
const BILDE = path.resolve(REPO, 'site/no/images/layout-hero.webp');

// Logg inn ÉN gang og gjenbruk sesjonen (backendens passordvern gir 429 ved mange innlogginger på rad).
const okt = await (async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/innlogging`);
  const inn = await page.evaluate(async ([api, e, p]) => (await fetch(api + '/api/login', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) })).status, [API, E2E_EPOST, E2E_PASSORD]);
  if (inn !== 200) throw new Error('Lokal innlogging feilet: ' + inn);
  const st = await ctx.storageState(); await ctx.close(); return st;
})();
// Nøytralt utgangspunkt for utseende/kontakt (testene lagrer ekte).
async function noytral() {
  const ctx = await browser.newContext({ storageState: okt }); const page = await ctx.newPage(); await page.goto(`${ORIGIN}/innlogging`);
  const st = await page.evaluate(async api => { const d = await (await fetch(api + '/api/dashboard/din-side', { credentials: 'include' })).json();
    return (await fetch(api + '/api/dashboard/din-side', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profil: { tagline: 'Fades og skjeggtrim', address: d.profil.address || '', bio: d.profil.bio || '', om: d.profil.om || '' },
        utseende: { aksent: 'blaa', color_mode: 'mork', font: 'jakarta' }, kontakt: { instagram: '', tiktok: '', snapchat: '', contact_phone: '' } }) })).status; }, API);
  await ctx.close(); if (st !== 200) throw new Error('Nøytral tilstand feilet: ' + st);
}
// Backend har en fast grense på 120 kall/min per IP (src/server.js). Hver side gjør ~10 kall, så vi holder oss under ~100/min.
const apiTider = [];
async function ventPaaKvote() { for (;;) { const naa = Date.now(); while (apiTider.length && naa - apiTider[0] > 60_000) apiTider.shift();
  if (apiTider.length < 95) return; await new Promise(r => setTimeout(r, 1000)); } }
async function aapne(bredde, params, { hoyde = 760, touch = false, rute } = {}) {
  await ventPaaKvote();
  const ctx = await browser.newContext({ viewport: { width: bredde, height: hoyde }, deviceScaleFactor: 2, hasTouch: touch, storageState: okt });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const kall = []; page.on('request', q => { const u = new URL(q.url()); if (u.port === new URL(API).port) { apiTider.push(Date.now()); } if (u.port === new URL(API).port) kall.push({ metode: q.method(), sti: u.pathname, ct: q.headers()['content-type'] || '', body: q.postData() }); });
  await page.route(u => u.hostname !== '127.0.0.1' && !/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), r => { utenfor++; return r.abort(); });
  if (rute) await rute(page);
  await page.goto(`${BASE}&${params}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.klar === '1', null, { timeout: 15000 });
  await page.waitForTimeout(350);
  return { ctx, page, errs, kall };
}
const synlig = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; }).catch(() => false);
const pvSeq = page => page.evaluate(() => +(document.body.dataset.pvSeq || 0));
const ventPv = async (page, foer) => { await page.waitForFunction(n => +(document.body.dataset.pvSeq || 0) > n, foer, { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(150); };
const STEG = ['profil', 'utseende', 'bilder', 'kontakt'];
const maal = [];
const knapper = page => page.$$eval('.pt-rad .dv2-btn', bs => bs.filter(b => b.offsetParent && !b.closest('#bekreft')).map(b => b.textContent.trim()).join(' | '));

await noytral();
// ── A (ikke live): fire steg × 320/375 × mørk/lys, uten hjelpelinje; siste steg også MED hjelpelinje ──
settStatus('forhandsvist');
for (const bredde of [320, 375]) for (const tema of ['mork', 'lys']) for (let s = 0; s < 4; s++) for (const hjelp of s === 3 ? [0, 1] : [0]) {
  const { ctx, page, errs } = await aapne(bredde, `modus=A&tema=${tema}&steg=${s}&hjelp=${hjelp}`);
  if (s === 3) { await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(120); }
  await page.screenshot({ path: `${OUT}/A-${bredde}-${tema}-${s + 1}-${STEG[s]}${hjelp ? '-hjelpelinje' : ''}.png` });
  const ikkeBak = s !== 3 || await page.evaluate(() => document.querySelector('#f-contact_phone').getBoundingClientRect().bottom <= document.querySelector('#bar').getBoundingClientRect().top - 8);
  maal.push({ g: 'A', bredde, tema, s, hjelp, ikkeBak, knapper: await knapper(page), hjelpelinje: await synlig(page, '#hjelpelinje'), lagreAv: await page.$eval('#neste', b => b.disabled),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), x: await synlig(page, '#lukkOppsett'), faner: await synlig(page, '.pt-bunnnav'), errs: errs.length });
  await ctx.close();
}
// ── B (live): fire steg × 320/375 × mørk/lys (hjelpelinja vises aldri når siden er live, selv med hjelp=1) ──
settStatus('live');
for (const bredde of [320, 375]) for (const tema of ['mork', 'lys']) for (let s = 0; s < 4; s++) {
  const { ctx, page, errs } = await aapne(bredde, `modus=B&tema=${tema}&steg=${s}&hjelp=1`);
  if (s === 3) { await page.fill('#f-tiktok', 'ny_tiktok'); await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(120); }
  await page.screenshot({ path: `${OUT}/B-${bredde}-${tema}-${s + 1}-${STEG[s]}.png` });
  maal.push({ g: 'B', bredde, tema, s, knapper: await knapper(page), hjelpelinje: await synlig(page, '#hjelpelinje'), lagreAv: await page.$eval('#neste', b => b.disabled),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), x: await synlig(page, '#lukkOppsett'), faner: await synlig(page, '.pt-bunnnav'), errs: errs.length });
  await ctx.close();
}

// ── Første lagring (ekte): A ikke live → «Lagre endringer» → publiser:true → «Siden din er live» → Oversikt ──
const bekreft = [];
for (const tema of ['mork', 'lys']) {
  settStatus('forhandsvist');
  const { ctx, page, errs, kall } = await aapne(375, `modus=A&tema=${tema}&steg=3&hjelp=1`);
  await page.click('#neste'); await page.waitForFunction(() => document.body.dataset.bekreftet === '1', null, { timeout: 10000 }).catch(() => {});
  const lagreKall = kall.find(k => k.sti === '/api/dashboard/din-side/lagre');
  await page.screenshot({ path: `${OUT}/375-${tema}-bekreftelse.png` });
  const b = { tema, bekreftet: await synlig(page, '#bekreft'), tittel: await page.textContent('#bekreftH'), lenke: await page.textContent('#lenke'),
    publiserSendt: !!lagreKall && JSON.parse(lagreKall.body).publiser === true, pageStatusKall: kall.filter(k => k.sti === '/api/dashboard/page-status').length,
    fokus: await page.evaluate(() => document.activeElement.id) };
  await page.click('#kopier'); await page.waitForTimeout(150); b.kopiert = (await page.textContent('#kopiert')).trim();
  await page.click('#tilOversikt'); await page.waitForTimeout(250);
  b.oversikt = await synlig(page, '#oversikt'); b.kortBorte = !(await synlig(page, '#fullforKort')); b.bunnnav = await synlig(page, '.pt-bunnnav');
  await page.screenshot({ path: `${OUT}/375-${tema}-oversikt-etter.png` });
  b.errs = errs.length; bekreft.push(b); await ctx.close();
}

// ── Lagret, men ikke publisert: publisering.melding vises (svaret overstyres her — den lokale barberen oppfyller kravene) ──
settStatus('forhandsvist');
const melding = await (async () => {
  const { ctx, page, errs } = await aapne(375, 'modus=A&tema=mork&steg=3', { rute: async p => p.route('**/api/dashboard/din-side/lagre', async r => {
    // Ikke send videre (da ville siden faktisk gått live) — svar i kontraktens form som om en åpen dag mangler.
    const d = await (await r.fetch({ url: API + '/api/dashboard/din-side', method: 'GET' })).json();
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, lagret: true, sidemal: 'v2', ...d, page_status: 'forhandsvist',
      publisering: { bedt_om: true, publisert: false, forste_gang: false, page_status: 'forhandsvist', grunn: 'krav_mangler', mangler: ['apen_dag'],
        melding: 'Endringene er lagret, men siden kan ikke publiseres før du har lagt inn åpningstid på minst én dag.' } }) }); }) });
  await page.click('#neste'); await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/375-mork-lagret-ikke-publisert.png` });
  const ut = { status: (await page.textContent('#status')).trim(), bekreftet: await synlig(page, '#bekreft'), errs: errs.length };
  await ctx.close(); return ut;
})();
settStatus('live');

// ── Forhåndsvisningen: Laster, feil, rulleposisjon, bildeutkast via /din-side/preview, fokusfelle + Escape (mobil) ──
const pv = {};
{ // Laster + feil (rammen sier fra)
  let svar = 'treg';
  const { ctx, page, errs } = await aapne(375, 'modus=B&tema=mork&steg=0', { rute: async p => p.route('**/api/dashboard/preview', async r => {
    if (svar === 'treg') { await new Promise(x => setTimeout(x, 1500)); return r.fallback(); }
    return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Kunne ikke lage forhåndsvisningen.' }) }); }) });
  await page.click('#pvKnapp');
  await page.evaluate(() => { const i = document.getElementById('f-tagline'); i.value = 'Treg forhåndsvisning'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(600);
  pv.laster = await synlig(page, '#pvLaster');
  await page.screenshot({ path: `${OUT}/375-mork-forhandsvis-laster.png` });
  await page.waitForTimeout(1600); svar = 'feil';
  await page.evaluate(() => { const i = document.getElementById('f-tagline'); i.value = 'Feil i forhåndsvisning'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(1200);
  pv.feil = (await page.textContent('#pvMelding')).trim(); pv.lasterBorte = !(await synlig(page, '#pvLaster'));
  await page.screenshot({ path: `${OUT}/375-mork-forhandsvis-feil.png` });
  pv.errs1 = errs.length; await ctx.close();
}
{ // Rulleposisjon beholdes mellom oppdateringer + fokusfelle/Escape i fullskjerm (mobil). Lav skjerm (320×560), så den
  // korte lokale bookingsiden faktisk kan rulles; vi ruller så langt den rekker (maks 300 px).
  const { ctx, page, errs } = await aapne(320, 'modus=B&tema=mork&steg=0', { hoyde: 560 });
  await page.click('#pvKnapp'); await page.waitForTimeout(300);
  // Iframen er sandboxet uten allow-same-origin (som i dashbordet) — siden kan ikke røre den; Playwright går inn i rammen.
  const ramme = () => page.frames().find(f => f.parentFrame() === page.mainFrame());
  const maks = await ramme().evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const maal = Math.min(300, maks);
  await ramme().evaluate(y => scrollTo(0, y), maal); await page.waitForTimeout(300);
  const foer = await pvSeq(page);
  await page.evaluate(() => { const i = document.getElementById('f-tagline'); i.value = 'Ny tekst'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await ventPv(page, foer); await page.waitForTimeout(400);
  pv.rull = { maks, maal, etter: await ramme().evaluate(() => Math.round(scrollY)) };
  // Fokusfelle: ti Tab fra «← Tilbake» — fokus står hele tiden i flaten (knappen eller iframen; inni iframen er lov).
  await page.focus('#pvLukk'); const steder = [];
  for (let k = 0; k < 10; k++) { await page.keyboard.press('Tab'); steder.push(await page.evaluate(() => document.activeElement.id || document.activeElement.tagName)); }
  pv.felle = steder.every(x => x === 'pvLukk' || x === 'pvRamme'); pv.felleSteder = [...new Set(steder)].join(',');
  // Escape mens fokus er INNE i bookingsiden (iframen) — sendes videre og lukker.
  if (await page.evaluate(() => document.activeElement.id) !== 'pvRamme') { await page.focus('#pvLukk'); await page.keyboard.press('Tab'); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  pv.escape = !(await page.$eval('#pv', e => e.classList.contains('apen'))) && await page.evaluate(() => document.activeElement.id) === 'pvKnapp';
  pv.errs2 = errs.length; await ctx.close();
}
{ // Bildeutkast: ny fil → forhåndsvisning via POST /din-side/preview (multipart), ingenting lagret før «Lagre endringer»
  const { ctx, page, errs, kall } = await aapne(1280, 'modus=B&tema=mork&steg=2', { hoyde: 900 });
  const foer = await pvSeq(page);
  await page.setInputFiles('#f-bilder', BILDE); await ventPv(page, foer);
  const k = kall.filter(x => x.sti === '/api/dashboard/din-side/preview');
  pv.bildeutkast = k.length > 0 && /multipart\/form-data/.test(k[k.length - 1].ct) && !kall.some(x => x.sti === '/api/dashboard/din-side/lagre');
  pv.bildeIPv = /data:image\/jpeg;base64/.test(await page.$eval('#pvRamme', f => f.srcdoc || ''));
  pv.errs3 = errs.length; await ctx.close();
}
// ── Mer info (om): Profil-steget med og uten tekst (320/375 × mørk/lys). Forhåndsvisningen bytter IKKE fane (bare rulleposisjonen beholdes).
const OM_TEKST = 'Gratis parkering i bakgården. Jeg tar kort og Vipps.\n\nJeg jobber alene, så det er alltid rolig i stolen.';
const om = [];
const valgtFane = async page => (await (await page.$('#pvRamme')).contentFrame()).evaluate(() => (document.querySelector('.v2-tab[aria-selected="true"]') || {}).textContent || '').catch(() => '?');
settStatus('forhandsvist');
const omFoer = await (async () => { const ctx = await browser.newContext({ storageState: okt }); const page = await ctx.newPage(); await page.goto(`${ORIGIN}/innlogging`);
  const v = await page.evaluate(async api => (await (await fetch(api + '/api/dashboard/din-side', { credentials: 'include' })).json()).profil.om || '', API); await ctx.close(); return v; })();
async function settOm(tekst) { const ctx = await browser.newContext({ storageState: okt }); const page = await ctx.newPage(); await page.goto(`${ORIGIN}/innlogging`);
  const st = await page.evaluate(async ([api, t]) => (await fetch(api + '/api/dashboard/din-side', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profil: { om: t } }) })).status, [API, tekst]); await ctx.close(); if (st !== 200) throw new Error('settOm feilet: ' + st); }
await settOm('');
for (const bredde of [320, 375]) for (const tema of ['mork', 'lys']) {
  const { ctx, page, errs, kall } = await aapne(bredde, `modus=A&tema=${tema}&steg=0`);
  const m = { bredde, tema };
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/om-${bredde}-${tema}-1-uten-tekst.png` });
  m.etikett = await page.$eval('label[for="f-om"]', e => e.textContent.trim());
  m.hjelp = await page.$eval('#f-om', e => (document.getElementById(e.getAttribute('aria-describedby')) || {}).textContent || '');
  m.maks = await page.$eval('#f-om', e => e.maxLength);
  m.plass = await page.$eval('#f-om', e => e.placeholder);
  m.sammeStil = await page.evaluate(() => { const a = getComputedStyle(document.querySelector('#f-bio')), b = getComputedStyle(document.querySelector('#f-om'));
    return ['borderTopColor', 'borderRadius', 'backgroundColor', 'fontSize', 'paddingLeft', 'lineHeight', 'width'].every(k => a[k] === b[k]); });
  m.underBio = await page.evaluate(() => !!(document.querySelector('[data-felt="bio"]').compareDocumentPosition(document.querySelector('[data-felt="om"]')) & Node.DOCUMENT_POSITION_FOLLOWING));
  const foer = await pvSeq(page);
  await page.fill('#f-om', OM_TEKST); await ventPv(page, foer); await page.waitForTimeout(250);
  m.fane = (await valgtFane(page)).trim();                       // skal fortsatt være første fane (Tjenester)
  m.ikkeLagret = !kall.some(x => x.sti === '/api/dashboard/din-side/lagre');
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}/om-${bredde}-${tema}-2-med-tekst.png` });
  m.errs = errs.length; om.push(m); await ctx.close();
}
// Lagring (B, live — publiserer ikke): om følger med i POST /din-side/lagre og står i databasen etterpå.
settStatus('live');
{ const { ctx, page, errs, kall } = await aapne(375, 'modus=B&tema=mork&steg=0');
  await page.fill('#f-om', OM_TEKST);
  for (let i = 0; i < 3; i++) await page.click('#neste');
  await page.click('#neste'); await page.waitForTimeout(1500);   // siste steg: samme knapp er «Lagre endringer»
  const k = kall.filter(x => x.sti === '/api/dashboard/din-side/lagre').pop();
  om.lagreBody = k ? (JSON.parse(k.body || '{}').profil || {}).om : undefined;
  om.lagret = await page.evaluate(async api => (await (await fetch(api + '/api/dashboard/din-side', { credentials: 'include' })).json()).profil.om, API);
  om.lagreErrs = errs.length; await ctx.close(); }
await settOm(omFoer);
// ── 1280: én desktop-visning (A, Profil-steget, fast telefonramme) ──
settStatus('forhandsvist');
{ const { ctx, page, errs } = await aapne(1280, 'modus=A&tema=mork&steg=0', { hoyde: 900 });
  await page.screenshot({ path: `${OUT}/1280-mork-desktop.png` });
  pv.desk = { panel: await synlig(page, '#pv'), knappSkjult: !(await synlig(page, '#pvKnapp')), errs: errs.length }; await ctx.close(); }
settStatus('live');
await noytral();

console.table(maal); console.table(bekreft); console.log(JSON.stringify({ melding, pv }, null, 1));
const A = maal.filter(m => m.g === 'A'), B = maal.filter(m => m.g === 'B');
sjekk(maal.every(m => m.overflow <= 0), 'ingen horisontal overflow (A og B, 320/375, mørk/lys)');
sjekk(maal.every(m => m.errs === 0) && bekreft.every(b => b.errs === 0) && melding.errs === 0 && !pv.errs1 && !pv.errs2 && !pv.errs3 && !pv.desk.errs, 'ingen JS-feil');
sjekk(A.every(m => m.x && !m.faner) && B.every(m => !m.x && m.faner), 'A: X, ingen hovedfaner · B: hovedfaner, ingen X');
sjekk(maal.filter(m => m.s < 3).every(m => m.knapper === '← Tilbake | Neste →'), 'steg 1–3: én rad «← Tilbake» + «Neste →», ingen lagre-knapp');
sjekk(maal.filter(m => m.s === 3).every(m => m.knapper === '← Tilbake | Lagre endringer'), 'siste steg: én rad «← Tilbake» + «Lagre endringer»');
sjekk(A.filter(m => m.s === 3).every(m => !m.lagreAv), 'A (ikke live): «Lagre endringer» er aktiv også uten endringer (lagring publiserer)');
sjekk(A.every(m => m.ikkeBak), 'siste felt står over bunnbaren med luft, også med hjelpelinja (320/375)', A.filter(m => !m.ikkeBak).map(m => m.bredde + m.tema + (m.hjelp ? '+h' : '')).join(' '));
sjekk(A.filter(m => m.s === 3).every(m => m.hjelpelinje === !!m.hjelp) && B.every(m => !m.hjelpelinje), 'hjelpelinja: bare når foreslått og siden ikke er live (aldri i B)');
sjekk(bekreft.every(b => b.publiserSendt && b.pageStatusKall === 0), 'lagring sender publiser:true til /din-side/lagre; ingen PUT /page-status');
sjekk(bekreft.every(b => b.bekreftet && b.tittel === 'Siden din er live' && b.fokus === 'bekreftH' && b.lenke.endsWith('/' + SLUG)), 'etter første lagring: «Siden din er live» med lenken');
sjekk(bekreft.every(b => /kopiert|markert/i.test(b.kopiert)), '«Kopier lenke» gir beskjed');
sjekk(bekreft.every(b => b.oversikt && b.kortBorte && b.bunnnav), '«Gå til Oversikt»: dashbordet, uten «Fullfør siden din» (siden er live)');
sjekk(/kan ikke publiseres før du har lagt inn åpningstid/.test(melding.status) && !melding.bekreftet, 'lagret men ikke publisert: publisering.melding vises som den er, ingen bekreftelse');
sjekk(pv.laster && /Kunne ikke lage forhåndsvisningen/.test(pv.feil) && pv.lasterBorte, 'forhåndsvisning: «Laster»-linje under henting, feilmelding i rammen ved feil');
sjekk(pv.rull.maks >= 40 && Math.abs(pv.rull.etter - pv.rull.maal) <= 2, 'forhåndsvisning: rulleposisjonen beholdes mellom oppdateringer', JSON.stringify(pv.rull));
sjekk(pv.felle && pv.escape, 'fullskjerm (mobil): fokusfelle, Escape lukker (også fra bookingsiden), fokus tilbake til «Forhåndsvis»', pv.felleSteder);
sjekk(pv.bildeutkast && pv.bildeIPv, 'bildeutkast: ny fil vises i forhåndsvisningen via POST /din-side/preview (multipart), ikke lagret');
sjekk(pv.desk.panel && pv.desk.knappSkjult, '1280: fast telefonramme til høyre');
console.table(om); console.log('Om lagring:', JSON.stringify({ body: om.lagreBody === OM_TEKST, lagret: om.lagret === OM_TEKST, errs: om.lagreErrs }));
sjekk(om.every(m => m.etikett === 'Mer info' && m.hjelp === 'Vises i Om-fanen på siden din.' && m.plass === 'F.eks. priser, parkering, hvordan du jobber' && m.maks === 4000 && m.underBio && m.sammeStil), 'Mer info: etikett (plassholder «F.eks. priser, parkering, hvordan du jobber») under Kort beskrivelse, hjelpetekst om Om-fanen, maks 4000, samme stil som Kort beskrivelse');
sjekk(om.every(m => m.fane === 'Tjenester' && m.ikkeLagret), 'skriver i Mer info → forhåndsvisningen bytter ikke fane, og ingenting lagres', om.map(m => m.fane).join(','));
sjekk(om.lagreBody === OM_TEKST && om.lagret === OM_TEKST && !om.lagreErrs, 'om sendes i POST /din-side/lagre og er lagret etterpå');
sjekk(om.every(m => m.errs === 0), 'Om: ingen JS-feil');
sjekk(utenfor === 0, 'ingen request utenfor 127.0.0.1 / Google Fonts', String(utenfor));
await browser.close(); server.close();
console.log('Skjermbilder:', OUT);
ferdig();
