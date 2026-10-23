// tools/render/dinside-v2.mjs — «Din side» for v2-barbere: fire steg, lagre, forhåndsvisning, ulagret-varsel (19.10.2026).
//
//   node tools/render/dinside-v2.mjs            # full matrise + interaksjoner (320/375/402/1280)
//   node tools/render/dinside-v2.mjs --rask     # én bredde (375), kun interaksjonene
//
// Matrise (skjermbilder i .render-ut/dinside-v2/): hvert steg × dashbord lys/mørk × med/uten bilder/tomme felt ×
// langt sjappenavn med æøå × forhåndsvisning åpen på mobil × feilmelding ved lagring × ulagret-varselet.
// Målinger (ikke bare bilder): overflow, trykkflater ≥ 40 px, v1-flater skjult, ingen request mot prod.
// Interaksjoner: verdier holdes på tvers av steg · Lagre aktiv bare ved endring · PUT inneholder alt (aldri sjappenavn) ·
// 400 → melding ved riktig felt + hopp til steget, ingenting tapt · debounce på preview · preview bruker ulagrede verdier ·
// «Tilbake» fra preview bevarer steg/innhold/rulleposisjon · beforeunload · fanebytte-dialog · fontvelger fra valg.fonter,
// Inter + «laster» til fonten er der · rekkefølge via piler (PUT /images/rekkefolge) · v1-barber helt uendret.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { installerDinSideMock, startTilstand, tomTilstand, bildeVersjon as mockVersjon } from './fixtures/dinside-v2.mjs';
import { v2 as v2Billing } from './fixtures/billing.mjs';

const RASK = process.argv.includes('--rask');
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/dinside-v2');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.webp':'image/webp', '.png':'image/png',
               '.svg':'image/svg+xml', '.mp4':'video/mp4', '.json':'application/json', '.jpg':'image/jpeg' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/dashboard.html#dinside`;
const browser = await chromium.launch();

const feil = [];          // { hva, detalj }
const sjekk = (ok, hva, detalj = '') => { if (!ok) feil.push({ hva, detalj }); return ok; };
const LANGT = 'Ærlig Øyvind & Åses Barbershop Østre Aker';

async function ny({ bredde = 375, tema = 'dark', hoyde = 800, mock = {}, vent = 'networkidle' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: hoyde }, deviceScaleFactor: 2 });
  await ctx.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (_) {} }, tema);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const m = await installerDinSideMock(page, mock);
  await page.goto(URL_, { waitUntil: vent });
  if (mock.sidemal !== 'v1') await page.waitForSelector('#dv2Grid:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, m, errs };
}
const synlig = (page, sel) => page.$eval(sel, e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').catch(() => false);
const verdi = (page, sel) => page.$eval(sel, e => e.value);
const stegKnapp = (page, i) => page.click(`#dv2Steg [data-steg="${i}"]`);
const lagringer = m => m.utkast.filter(u => u.action === 'lagre');   // POST /din-side/lagre (JSON eller multipart)
const valgtSteg = (page, i) => page.$eval(`#dv2Steg [data-steg="${i}"]`, e => e.getAttribute('aria-selected') === 'true');
async function lagreSiste(page){await stegKnapp(page,3);await page.click('#dv2Lagre');await page.waitForTimeout(500);if(await page.locator('#suksessOverlay').isVisible())await page.locator('#suksessX').click();}

// Visningsvindu = det brukeren ser (klistret lagre-linje på plass). «-hel» = hele siden (lagre-linja tegnes midt i, det er en artefakt).
const skjerm = async (page, navn) => { await page.screenshot({ path: `${OUT}/${navn}.png` }); await page.screenshot({ path: `${OUT}/${navn}-hel.png`, fullPage: true }); };

async function maal(page, ctx) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const knapper = [...document.querySelectorAll('#dinsideV2 button, #dinsideV2 input[type=color]')].filter(b => b.offsetParent !== null && !b.closest('[hidden]'));
    const smaa = knapper.filter(b => { const r = b.getBoundingClientRect(); return r.height < 40 || r.width < 40; })
      .map(b => `${(b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 18)} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`);
    return { overflow: document.documentElement.scrollWidth - vw, smaa, v1Synlig: ['#sideAccs', '#dinsideCta', '#fokusBar', '.side-wrap'].filter(s => { const e = document.querySelector(s); return e && e.offsetParent !== null; }) };
  });
  sjekk(r.overflow <= 0, `${ctx}: horisontal overflow`, r.overflow + ' px');
  sjekk(!r.smaa.length, `${ctx}: trykkflater under 40 px`, r.smaa.join(' · '));
  sjekk(!r.v1Synlig.length, `${ctx}: v1-flater synlige på v2`, r.v1Synlig.join(', '));
  return r;
}

/* ════════ 1. Matrise ════════ */
if (!RASK) {
  for (const bredde of [320, 375, 402, 1280]) {
    for (const tema of ['dark', 'light']) {
      const kontekst = `${bredde}/${tema}`;
      const { ctx, page, m, errs } = await ny({ bredde, tema, mock: { tilstand: startTilstand() } });
      sjekk(await page.evaluate(() => document.body.classList.contains('sm-v2')), `${kontekst}: body.sm-v2`);
      for (let i = 0; i < 4; i++) { await stegKnapp(page, i); await page.waitForTimeout(350); await skjerm(page, `${bredde}-${tema}-steg${i + 1}-med-bilder`); await maal(page, `${kontekst} steg ${i + 1}`); }
      sjekk(m.prod === 0, `${kontekst}: request mot prod`, String(m.prod));
      sjekk(!errs.length, `${kontekst}: pageerror`, errs.join('; '));
      await ctx.close();
    }
    // Tomt: tomme felt, ingen bilder
    {
      const { ctx, page, errs } = await ny({ bredde, tema: 'dark', mock: { tilstand: tomTilstand() } });
      for (let i = 0; i < 4; i++) { await stegKnapp(page, i); await page.waitForTimeout(250); await skjerm(page, `${bredde}-dark-steg${i + 1}-tomt`); await maal(page, `${bredde} tomt steg ${i + 1}`); }
      sjekk(!errs.length, `${bredde} tomt: pageerror`, errs.join('; '));
      await ctx.close();
    }
    // Langt sjappenavn med æøå i fontvelgeren
    {
      const t = startTilstand(); t.profil.shop = LANGT;
      const { ctx, page, errs } = await ny({ bredde, tema: 'dark', mock: { tilstand: t } });
      await stegKnapp(page, 1); await page.waitForTimeout(900); await skjerm(page, `${bredde}-dark-steg2-langt-navn`);
      const o = await page.$$eval('#dv2FontProve', ns => ns.map(e => ({ sw: e.scrollWidth, cw: e.clientWidth, tekst: e.textContent })));
      sjekk(o.length === 1 && o.every(x => x.tekst === LANGT && x.sw <= x.cw + 1), `${bredde}: langt sjappenavn med æøå brytes uten overflow i én fontforhåndsvisning`, JSON.stringify(o.map(x => x.sw + '>' + x.cw)));
      await maal(page, `${bredde} langt navn`);
      sjekk(!errs.length, `${bredde} langt navn: pageerror`, errs.join('; '));
      await ctx.close();
    }
    // Forhåndsvisning åpen (mobil) / side om side (desktop)
    {
      const { ctx, page, errs } = await ny({ bredde, tema: 'light', mock: {} });
      if (bredde < 720) { await page.click('#dv2SeSiden'); await page.waitForSelector('#dv2Pv.apen iframe'); await page.waitForTimeout(900); }
      else await page.waitForTimeout(900);
      await skjerm(page, `${bredde}-light-forhandsvisning`);
      const f = await page.$eval('#dv2Ramme', e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
      sjekk(bredde >= 1024 || f.w >= bredde - 48, `${bredde}: forhåndsvisning i full bredde på mobil (24 px marg som i prototypen)`, JSON.stringify(f));
      sjekk(!errs.length, `${bredde} preview: pageerror`, errs.join('; '));
      await ctx.close();
    }
    // Feilmelding ved lagring (400 med felt) og ulagret-dialogen
    {
      const { ctx, page, errs } = await ny({ bredde, tema: 'dark', mock: {} });
      await stegKnapp(page, 3); await page.fill('#dv2Telefon', '000'); await lagreSiste(page); await page.waitForTimeout(500);
      await skjerm(page, `${bredde}-dark-feil-ved-lagring`);
      await page.fill('#dv2Telefon', '91 23 45 67'); await stegKnapp(page, 0); await page.fill('#dv2Tagline', 'Endret'); await page.evaluate(() => document.querySelector('.nav button[data-panel="oversikt"]').click());   // som bunn-navet gjør (skjult topp-nav klikkes programmatisk)
      await page.waitForTimeout(400); await skjerm(page, `${bredde}-dark-ulagret-varsel`);
      sjekk(!errs.length, `${bredde} feil/varsel: pageerror`, errs.join('; '));
      await ctx.close();
    }
  }
}

/* ════════ 1b. Ingen felt bak en fast bar (runde 2, 23.10.2026) ════════
   Aldri to faste barer: oppsettet (fokusmodus) har bare Tilbake/Neste fast, vanlig Din side bare bunn-navet. Når siden er
   scrollet HELT ned, skal ALT som kan trykkes eller skrives i (i hele panelet, ikke bare stegene) stå over det faste.
   Fanget før: «Ideer & ønsker»-knappen lå bak bunnbaren, fordi bunnluften sto på stegene i stedet for på panelet. */
for (const bredde of [320, 375]) for (const tema of ['dark', 'light']) for (const oppsett of [false, true]) {
  const kontekst = `${bredde}/${tema}/${oppsett ? 'oppsett' : 'vanlig'}`;
  const { ctx, page, errs } = await ny({ bredde, tema, mock: oppsett ? { billing: v2Billing({ page_status: 'forhandsvist', publisert_at: null }) } : {} });
  for (let i = 0; i < 4; i++) {
    await stegKnapp(page, i); await page.waitForTimeout(350);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const vis = e => { if (!e) return false; const cs = getComputedStyle(e), b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.height > 0; };
      // Bunn-navet er sticky (bunn), bunnbaren fixed i oppsettet — begge ligger over innholdet mens man scroller.
      const faste = [...document.querySelectorAll('#dv2Bar, .bunn-nav')].filter(e => vis(e) && ['fixed', 'sticky'].includes(getComputedStyle(e).position));
      const linje = Math.min(innerHeight, ...faste.map(e => e.getBoundingClientRect().top));
      const fast = e => faste.some(f => f.contains(e));
      const felt = [...document.querySelectorAll('#design input:not([type=file]), #design textarea, #design button, #design [role=radio], #design [role=slider]')]
        .filter(e => vis(e) && e.offsetParent !== null && !fast(e) && !e.closest('[hidden]'));
      const bak = felt.filter(e => e.getBoundingClientRect().bottom > linje + 0.5)
        .map(e => (e.id || e.textContent.trim().slice(0, 20) || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom) + '>' + Math.round(linje));
      return { antallFaste: faste.length, bak, felt: felt.length };
    });
    sjekk(r.antallFaste === 1, `${kontekst} steg ${i + 1}: nøyaktig én fast bar`, String(r.antallFaste));
    sjekk(r.felt > 0 && !r.bak.length, `${kontekst} steg ${i + 1}: ingen felt bak en fast bar`, r.bak.join(' · '));
  }
  sjekk(!errs.length, `${kontekst}: pageerror (fast bar)`, errs.join('; '));
  await ctx.close();
}

/* ════════ 2. Interaksjoner (375) ════════ */
{
  // 2a. Verdier holdes på tvers av steg · Lagre aktiv bare ved endring · PUT-innhold
  const { ctx, page, m, errs } = await ny({ bredde: 375, mock: {} });
  sjekk(await page.$eval('#dv2Lagre', e => e.disabled), 'Lagre er deaktivert uten endringer');
  // Runde 2 (23.10.2026): ingen «← Tilbake» på første steg — ikke en deaktivert knapp, den står ikke der.
  sjekk(await synlig(page, '#dv2Neste') && !(await synlig(page, '#dv2Lagre')) && !(await synlig(page, '#dv2Tilbake')), 'Steg 1: bare «Neste →» — ingen «← Tilbake», ingen lagre-knapp');
  sjekk(!(await synlig(page, '#dv2Hjelpelinje')), 'Siden er live: ingen hjelpelinje');
  await page.fill('#dv2Tagline', 'Ny spesialitet æøå');
  sjekk(!(await page.$eval('#dv2Lagre', e => e.disabled)), 'Lagre blir aktiv ved endring');
  await stegKnapp(page, 3); await page.fill('#dv2Instagram', 'https://instagram.com/mitt_navn/');
  await page.click('#dv2Tilbake'); await page.click('#dv2Tilbake'); await page.click('#dv2Tilbake');
  sjekk(await verdi(page, '#dv2Tagline') === 'Ny spesialitet æøå', 'Verdi holdes etter steg-bytte (profil)');
  await stegKnapp(page, 3);
  sjekk(await verdi(page, '#dv2Instagram') === 'https://instagram.com/mitt_navn/', 'Verdi holdes etter steg-bytte (kontakt)');
  // Utseende: mørk→lys, gull
  await stegKnapp(page, 1);
  await page.click('[data-mode="lys"]'); await page.click('[data-aksent="gull"]');
  await lagreSiste(page); await page.waitForTimeout(600);
  const put = lagringer(m);
  sjekk(put.length === 1 && !m.kall.some(k => k.metode === 'PUT' && /din-side|page-status/.test(k.sti)), 'Nøyaktig én POST /din-side/lagre (ingen PUT /din-side, ingen PUT /page-status)', String(put.length));
  const b = put[0] && put[0].draft;
  sjekk(b && b.profil && !('shop' in b.profil), 'Lagringen inneholder ikke sjappenavn', JSON.stringify(b && b.profil));
  sjekk(b && b.profil.tagline === 'Ny spesialitet æøå' && b.utseende.color_mode === 'lys' && b.utseende.aksent === 'gull' && b.kontakt.instagram.includes('mitt_navn') && 'contact_phone' in b.kontakt, 'Lagringen bærer alle tre grupper', JSON.stringify(b));
  sjekk(b && b.publiser === false && !b.images, 'Live side: publiser:false, ren JSON uten bilder', JSON.stringify(b && { publiser: b.publiser, images: b.images }));
  const st = await page.$eval('#dv2Status', e => e.textContent);
  sjekk(/Lagret/.test(st), 'Bekreftelse etter lagring', st);
  sjekk(await page.$eval('#dv2Lagre', e => e.disabled), 'Lagre deaktiveres etter lagring');
  sjekk(await verdi(page, '#dv2Instagram') === 'mitt_navn', 'Handle normaliseres av server (vises etter lagring)');
  await stegKnapp(page, 3); sjekk(await verdi(page, '#dv2Instagram') === 'mitt_navn', 'Normalisert handle fra serverens svar', await verdi(page, '#dv2Instagram'));
  sjekk(m.prod === 0, 'Ingen request mot prod (2a)'); sjekk(!errs.length, '2a pageerror', errs.join('; '));
  await ctx.close();
}
{
  // 2b. 400 → melding ved riktig felt, hopp til steget, ingenting tapt
  const { ctx, page, errs } = await ny({ bredde: 375, mock: {} });
  await page.fill('#dv2Tagline', 'Beholdes'); await stegKnapp(page, 3); await page.fill('#dv2Telefon', '000');
  await stegKnapp(page, 0);
  await lagreSiste(page); await page.waitForTimeout(500);
  sjekk(await valgtSteg(page, 3), '400: hopper til steget feltet ligger i (Kontakt)');
  const fm = await page.$eval('[data-felt="contact_phone"] .dv2-feil', e => ({ vis: !e.hidden, tekst: e.textContent }));
  sjekk(fm.vis && /ikke gyldig/.test(fm.tekst), '400: melding under telefonfeltet', JSON.stringify(fm));
  sjekk(await verdi(page, '#dv2Telefon') === '000' && await verdi(page, '#dv2Tagline') === 'Beholdes', '400: ingenting i skjemaet går tapt');
  sjekk(!(await page.$eval('#dv2Lagre', e => e.disabled)), '400: Lagre fortsatt aktiv');
  await page.fill('#dv2Telefon', '91 23 45 67');
  sjekk(await page.$eval('[data-felt="contact_phone"] .dv2-feil', e => e.hidden), 'Feilen forsvinner når feltet endres');
  await ctx.close();
  // lokal validering av egen farge
  const c2 = await ny({ bredde: 375, mock: {} });
  await stegKnapp(c2.page, 1); await c2.page.click('[data-aksent="egen"]'); await c2.page.fill('#dv2Hex', '#zzz');
  await lagreSiste(c2.page); await c2.page.waitForTimeout(300);
  sjekk(await c2.page.$eval('#dv2HexFeil', e => !e.hidden && /gyldig fargekode/.test(e.textContent)), 'Ugyldig hex gir melding ved feltet');
  sjekk(lagringer(c2.m).length === 0, 'Ugyldig hex sendes ikke til serveren');
  await c2.page.fill('#dv2Hex', '#ffee00'); await c2.page.waitForTimeout(200);
  const v = await c2.page.$eval('#dv2Kontrast', e => ({ vis: !e.hidden, tekst: e.textContent }));
  sjekk(!v.vis, 'Kontrastvarsel: gul mot mørk bakgrunn gir ingen varsel', JSON.stringify(v));
  await c2.page.click('[data-mode="lys"]'); await c2.page.waitForTimeout(150);
  sjekk(await c2.page.$eval('#dv2Kontrast', e => !e.hidden), 'Kontrastvarsel: samme gul mot lys bakgrunn varsler (modus teller)');
  await c2.page.click('[data-mode="mork"]'); await c2.page.fill('#dv2Hex', '#1a1a1a'); await c2.page.waitForTimeout(200);
  const v2_ = await c2.page.$eval('#dv2Kontrast', e => ({ vis: !e.hidden, tekst: e.textContent }));
  sjekk(v2_.vis && /kontrast/.test(v2_.tekst), 'Kontrastvarsel under 3,0 vises', JSON.stringify(v2_));
  await lagreSiste(c2.page); await c2.page.waitForTimeout(500);
  sjekk(lagringer(c2.m).length === 1, 'Lagring tillatt ved lav kontrast');
  await c2.ctx.close();
}
{
  // 2c. Forhåndsvisning: ulagrede verdier, debounce, forside/bookingside, tilbake bevarer steg + rulleposisjon (mobil)
  const { ctx, page, m, errs } = await ny({ bredde: 375, hoyde: 600, mock: {} });
  await stegKnapp(page, 0);
  await page.evaluate(() => window.scrollTo(0, 120));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click('#dv2SeSiden'); await page.waitForSelector('#dv2Pv.apen'); await page.waitForTimeout(700);
  const kallFoer = m.previewHtml.length;
  sjekk(kallFoer >= 1, 'Preview hentes når flaten åpnes');
  const b0 = m.previewHtml[m.previewHtml.length - 1];
  sjekk(b0 && b0.side === 'forside' && !('contact_phone' in (b0.kontakt || {})), 'Preview: forside, uten telefon', JSON.stringify(b0 && b0.kontakt));
  await page.click('[data-side="book"]'); await page.waitForTimeout(600);
  sjekk(m.previewHtml[m.previewHtml.length - 1].side === 'book', 'Bytte til bookingside');
  await page.click('[data-side="forside"]'); await page.waitForTimeout(500);
  await page.click('#dv2PvLukk'); await page.waitForTimeout(300);
  sjekk(await valgtSteg(page, 0), 'Tilbake: samme steg');
  sjekk(Math.abs((await page.evaluate(() => window.scrollY)) - y0) <= 2, 'Tilbake: rulleposisjon bevart', `${y0} → ${await page.evaluate(() => window.scrollY)}`);
  // debounce: raskt skriving → få kall; innholdet er ulagret
  await page.click('#dv2SeSiden'); await page.waitForTimeout(600); const n0 = m.previewHtml.length;
  await page.click('#dv2PvLukk'); await page.evaluate(() => window.scrollTo(0, 0));
  await page.focus('#dv2Tagline'); await page.keyboard.press('End');
  await page.keyboard.type('abcdef', { delay: 30 }); await page.waitForTimeout(900);
  sjekk(m.previewHtml.length === n0, 'Mobil: ingen preview-kall mens flaten er lukket', `${m.previewHtml.length} vs ${n0}`);
  await page.click('#dv2SeSiden'); await page.waitForTimeout(800);
  const sist = m.previewHtml[m.previewHtml.length - 1];
  sjekk(sist.profil.tagline.endsWith('abcdef'), 'Preview bruker ulagrede verdier', sist.profil.tagline);
  await ctx.close();
  // desktop: side om side + debounce
  const d = await ny({ bredde: 1280, mock: {} });
  await d.page.waitForTimeout(600); const n1 = d.m.previewHtml.length;
  await d.page.focus('#dv2Tagline'); await d.page.keyboard.press('End'); await d.page.keyboard.type('abcdefgh', { delay: 25 }); await d.page.waitForTimeout(1000);
  const nye = d.m.previewHtml.length - n1;
  sjekk(nye >= 1 && nye <= 2, 'Desktop: debounce ~300 ms (8 tegn gir 1–2 kall)', String(nye));
  const sideOmSide = await d.page.evaluate(() => { const a = document.querySelector('.dv2-edit').getBoundingClientRect(), p = document.querySelector('#dv2Pv').getBoundingClientRect(); return p.left >= a.right - 1 && Math.abs(p.top - a.top) < 120; });
  sjekk(sideOmSide, 'Fra 1024 px: redigering og fast telefonramme side om side');
  sjekk(await d.page.$eval('#design', e => e.getBoundingClientRect().width) > 1000, 'Fra 1024 px: v2-flaten er ca. 1080 px');
  sjekk(!(await synlig(d.page, '#dv2SeSiden')), '«Forhåndsvis»-knappen skjules når forhåndsvisningen alltid er synlig');
  const ramme = await d.page.$eval('#dv2Ramme', e => { const r = e.getBoundingClientRect(); return r.height / r.width; });
  sjekk(Math.abs(ramme - 19.5 / 9) < 0.05, 'Fra 1024 px: telefonramme 9:19,5', ramme.toFixed(3));
  await d.ctx.close();
}
{
  // 2d. Ulagrede endringer: beforeunload + fanebytte-dialog
  const { ctx, page, errs } = await ny({ bredde: 375, mock: {} });
  await page.click('#dv2Bio'); await page.fill('#dv2Bio', 'Ulagret tekst');   // ekte klikk = brukeraktivering, ellers viser ikke Chromium beforeunload
  const dlg = new Promise(res => { page.once('dialog', async d => { res(d.type()); await d.dismiss(); }); setTimeout(() => res(null), 4000); });
  page.close({ runBeforeUnload: true }).catch(() => {});
  const dialogType = await dlg;
  sjekk(dialogType === 'beforeunload', 'beforeunload ved lukking med ulagrede endringer', String(dialogType));
  await ctx.close();
  const c = await ny({ bredde: 375, mock: {} });
  await c.page.fill('#dv2Bio', 'Ulagret tekst');
  await c.page.evaluate(() => document.querySelector('.nav button[data-panel="oversikt"]').click());
  await c.page.waitForSelector('.dv2-dialog', { timeout: 3000 }).catch(() => {});
  sjekk(await synlig(c.page, '.dv2-dialog'), 'Fanebytte med ulagrede endringer viser dialog');
  sjekk(await c.page.evaluate(() => document.querySelector('#design').classList.contains('active')), 'Står fortsatt på Din side mens dialogen er oppe');
  await c.page.click('.dv2-dialog .dv2-btn:not(.farlig):not(.prim)'); await c.page.waitForTimeout(250);   // «Bli her»
  sjekk(await verdi(c.page, '#dv2Bio') === 'Ulagret tekst' && await c.page.evaluate(() => document.querySelector('#design').classList.contains('active')), '«Bli her» beholder utkastet');
  await c.page.evaluate(() => document.querySelector('.nav button[data-panel="oversikt"]').click());
  await c.page.waitForSelector('.dv2-dialog'); await c.page.click('.dv2-dialog .farlig'); await c.page.waitForTimeout(500);
  sjekk(await c.page.evaluate(() => document.querySelector('#oversikt').classList.contains('active')), '«Forkast» går videre til valgt fane');
  await c.page.evaluate(() => document.querySelector('.nav button[data-panel="design"]').click()); await c.page.waitForTimeout(700);
  sjekk(await verdi(c.page, '#dv2Bio') !== 'Ulagret tekst', 'Forkastet utkast kommer ikke tilbake');
  await c.ctx.close();
}
{
  // 2e. Dropdown + ett dynamisk sjappenavn.
  const {ctx,page,errs}=await ny({bredde:375,mock:{}});await stegKnapp(page,1);
  const list=await page.$$eval('#dv2Fonter option',es=>es.map(e=>e.value));
  sjekk(JSON.stringify(list)===JSON.stringify(['jakarta','bebas','fraunces','oswald','josefin','jost']),'Seks fonter fra serverens valg',list.join(','));
  sjekk(await page.locator('#dv2FontProve').count()===1,'Én navneforhåndsvisning under dropdown');
  await page.selectOption('#dv2Fonter','bebas');await page.waitForTimeout(300);
  sjekk(await verdi(page,'#dv2Fonter')==='bebas','Fontvalg i dropdown oppdateres umiddelbart');
  sjekk(await page.locator('#dv2FontProve').textContent()==='Grand Barber','Viser barberens sjappenavn');
  sjekk(/BebasNeue/.test(await page.locator('#dv2FontProve').evaluate(e=>getComputedStyle(e).fontFamily)),'Valgt font brukes på navnet');
  // Dashbordets egen tekst bruker aldri Fraunces — bare prøven av barberens valg (#dv2FontProve) kan gjøre det.
  await page.selectOption('#dv2Fonter','fraunces');await page.waitForTimeout(500);
  const fr=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>!e.closest('#dv2FontProve')&&e.offsetParent!==null&&/Fraunces/i.test(getComputedStyle(e).fontFamily)).map(e=>e.tagName+'.'+e.className).slice(0,5));
  sjekk(!fr.length,'Ingen dashbordtekst i Fraunces utenom fontprøven',fr.join(', '));
  // Alle seks fontene LASTER (FontFace-status) og er forskjellige filer — en stand-in eller 404 gir NEI. (23.10.2026: Oswald,
  // Josefin Sans og Jost var stand-ins i mocken og så ut som Bebas/Plus Jakarta i skjermbildene.)
  const fl=await page.evaluate(()=>[...document.fonts].filter(f=>/PlusJakartaSans|BebasNeue|Fraunces|Oswald|JosefinSans|Jost/.test(f.family)).map(f=>f.family.replace(/['"]/g,'')+':'+f.status));
  sjekk(['PlusJakartaSans','BebasNeue','Fraunces','Oswald','JosefinSans','Jost'].every(n=>fl.includes(n+':loaded')),'Alle seks fontene lastes (FontFace loaded)',fl.join(', '));
  // Hver font er lastet (document.fonts.check) og er den som faktisk brukes på prøven når den er valgt. Ikke bredder:
  // to ulike fonter kan måle likt ved tilfeldighet (Jakarta og Fraunces ga begge 260 px, 23.10.2026).
  const FAM={jakarta:['PlusJakartaSans',700],bebas:['BebasNeue',400],fraunces:['Fraunces',600],oswald:['Oswald',600],josefin:['JosefinSans',700],jost:['Jost',600]};
  // Ikke document.fonts.check: dashbordet har også v1-fontvelgerens Fraunces fra Google Fonts (ulastet til den brukes), og check()
  // krever at ALLE treff er lastet. Sjekk at fonten v2-prøven laster selv (FontFace med samme familie; vekten kommer fra valg.fonter) har status loaded.
  const ikkeLastet=await page.evaluate(F=>Object.values(F).filter(([n,w])=>![...document.fonts].some(f=>f.family.replace(/['"]/g,'')===n&&f.status==='loaded')).map(([n])=>n),FAM);
  sjekk(!ikkeLastet.length,'Alle seks fontene er lastet (FontFace loaded)',ikkeLastet.join(', '));
  const brukt=[];for(const [k,[n]] of Object.entries(FAM)){await page.selectOption('#dv2Fonter',k);await page.waitForTimeout(150);const ff=await page.$eval('#dv2FontProve',el=>getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g,'').trim());if(ff!==n)brukt.push(k+'→'+ff);}
  sjekk(!brukt.length,'Prøven bruker valgt font for alle seks',brukt.join(', '));
  sjekk(!errs.length,'Fontdropdown uten JS-feil',errs.join('; '));await ctx.close();
}
{
  // 2f. Bilder: rekkefølge, sletting med bekreftelse, tomt galleri, 1:1-crop
  const { ctx, page, m, errs } = await ny({ bredde: 375, mock: {} });
  await stegKnapp(page, 2); await page.waitForTimeout(500);
  sjekk(await page.$$eval('#dv2Galleri .flis', f => f.length) === 3, 'Galleriet viser 3 bilder');
  const g = await page.$$eval('#dv2Galleri .flis', f => f.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.left)]; }));
  sjekk(g.every(x => x[0] === g[0][0] && x[1] === x[0]), 'Galleriet: 2 per rad, like store og kvadratiske', JSON.stringify(g));
  sjekk(g[2][2] === g[0][2], 'Siste bilde (oddetall) står alene i venstre kolonne i samme størrelse', JSON.stringify(g));
  await skjerm(page, '375-dark-bilder-oddetall');
  await page.click('#dv2Galleri .flis:nth-child(1)'); await page.click('[data-h="senere"]'); await page.waitForTimeout(400);
  const rf = m.kall.find(k => k.sti === '/api/dashboard/images/rekkefolge');
  sjekk(!rf && JSON.stringify(await page.$$eval('#dv2Galleri .flis',es=>es.map(e=>e.dataset.id)))===JSON.stringify(['g2','g1','g3']),'Ny rekkefølge beholdes som utkast uten HTTP-skriving');
  await page.click('#dv2Galleri [data-h="slett"]'); await page.waitForSelector('.dv2-dialog');
  sjekk(m.kall.filter(k => k.metode === 'DELETE').length === 0, 'Sletting krever bekreftelse (ingen DELETE før «Slett bildet»)');
  await page.click('.dv2-dialog .farlig'); await page.waitForTimeout(500);
  sjekk(m.kall.filter(k => k.metode === 'DELETE').length === 0 && await page.$$eval('#dv2Galleri .flis', f => f.length) === 2, 'Fjern fra utkast etter bekreftelse, uten å slette live');
  sjekk((await page.$eval('#dv2Sek2 .ingress', e => e.textContent)).includes('ferdig uten'), 'Steget sier at siden er ferdig uten bilder');
  await ctx.close();
}
{
  // 2i. Bildeutkast ende-til-ende mot mocken: opplasting → beskjæring → flytting → sletting → forhåndsvisning → ÉN multipart-lagring.
  //     Ingen bilde-HTTP-skriving før «Lagre endringer»; forhåndsvisningen får små kopier, lagringen full fil + original.
  const BILDE = path.resolve(ROOT, 'no/images/layout-hero.webp');
  const fliser = page => page.$$eval('#dv2Galleri .flis', es => es.map(e => e.dataset.id));
  const bildeSkriv = m => m.kall.filter(k => /^\/api\/dashboard\/images/.test(k.sti) && k.metode !== 'GET').length;
  const { ctx, page, m, errs } = await ny({ bredde: 375, mock: {} });
  await stegKnapp(page, 2); await page.waitForTimeout(400);
  await page.setInputFiles('#dv2FilGalleri', BILDE); await page.waitForTimeout(800);
  const f1 = await fliser(page);
  sjekk(f1.length === 4 && /^draft-/.test(f1[3]), 'Opplasting legger bildet i utkastet', JSON.stringify(f1));
  sjekk(bildeSkriv(m) === 0 && !m.utkast.some(u => u.action === 'lagre'), 'Opplasting skriver ingenting til serveren');
  // Beskjær det nye bildet via dashbordets crop-modal → utkastet, ikke PUT /images/:id
  await page.click(`#dv2Galleri .flis[data-id="${f1[3]}"]`); await page.click('#dv2Galleri [data-h="beskjaer"]');
  // Cropper må være «ready» (bildet lastet) før lagring — vent på tilstanden, ikke på en fast pause.
  await page.waitForFunction(() => typeof _cropper !== 'undefined' && _cropper && _cropper.ready, null, { timeout: 8000 }).catch(() => {});
  await page.click('#cropSave');
  await page.waitForFunction(() => !document.querySelector('#cropModal').classList.contains('open'), null, { timeout: 5000 }).catch(() => {});
  const cropErr = await page.$eval('#cropErr', e => e.textContent);
  const ny0 = await page.evaluate(() => { const b = DinSideV2._S.bilder.find(x => x._new); return b && { rect: !!b.cropRect, orig: !!b._original, blob: /^blob:/.test(b.url) }; });
  sjekk(ny0 && ny0.rect && ny0.orig && ny0.blob, 'Beskjæring av nytt bilde lagres i utkastet (utsnitt + original beholdt)', JSON.stringify(ny0) + ' cropErr=' + cropErr);
  sjekk(!(await page.$eval('#cropModal', e => e.classList.contains('open'))), 'Crop-modalen lukkes etter beskjæring');
  sjekk(bildeSkriv(m) === 0, 'Beskjæring skriver ingenting til serveren');
  // Flytt g1 ett hakk senere, slett g2
  await page.click('#dv2Galleri .flis[data-id="g1"]'); await page.click('[data-h="senere"]'); await page.waitForTimeout(200);
  await page.click('#dv2Galleri .flis[data-id="g2"]'); await page.click('#dv2Galleri [data-h="slett"]'); await page.waitForSelector('.dv2-dialog');
  await page.click('.dv2-dialog .farlig'); await page.waitForTimeout(300);
  const f2 = await fliser(page);
  sjekk(JSON.stringify(f2.slice(0, 2)) === '["g1","g3"]' && f2.length === 3, 'Flytting og sletting står i utkastet', JSON.stringify(f2));
  // Forhåndsvisning med bildeutkast: multipart, liten kopi, ingen original
  await page.click('#dv2SeSiden'); await page.waitForTimeout(1200);
  const pv = m.utkast.filter(u => u.action === 'preview').pop();
  const full = fs.statSync(BILDE).size;
  // Bytes sier lite (kilden er en liten webp); det som teller er pikselkanten på kopien som sendes.
  const pvKant = await page.evaluate(async () => { const b = DinSideV2._S.bilder.find(x => x._new); if (!b || !b._pv) return null; const bm = await createImageBitmap(b._pv); return Math.max(bm.width, bm.height); });
  sjekk(pv && pv.filer.length === 1 && pvKant && pvKant <= 600 && !pv.draft.images.some(e => e.original), 'Forhåndsvisning av bildeutkast sender en kopi på maks 600 px uten original', pv ? JSON.stringify(pv.filer) + ' kant=' + pvKant : 'ingen preview-kall');
  sjekk(pv && !('contact_phone' in (pv.draft.kontakt || {})), 'Forhåndsvisning av bildeutkast sender ikke telefon');
  await page.click('#dv2PvLukk'); await page.waitForTimeout(200);
  // Lagre
  await lagreSiste(page); await page.waitForTimeout(600);
  const lg = m.utkast.filter(u => u.action === 'lagre');
  sjekk(lg.length === 1 && !m.kall.some(k => k.sti === '/api/dashboard/din-side' && k.metode === 'PUT'), 'Nøyaktig én multipart-lagring (og ingen separat PUT)', String(lg.length));
  const man = lg[0] && lg[0].draft.images;
  const gal = man ? man.filter(e => e.slot === 'galleri') : [];
  sjekk(gal.length === 3 && gal[0].id === 'g1' && gal[1].id === 'g3' && !gal[2].id && gal[2].file && gal[2].original && gal[2].cropRect, 'Manifestet: rekkefølge, sletting, ny fil med original og utsnitt', JSON.stringify(man));
  sjekk(man && man.some(e => e.id === 'b1' && e.slot === 'portrett'), 'Manifestet beholder portrettet');
  sjekk(lg[0] && lg[0].filer.some(x => x.str === full || x.str > 0) && lg[0].filer.length === 2, 'Lagringen sender fil + original', lg[0] && JSON.stringify(lg[0].filer));
  sjekk(/Lagret/.test(await page.$eval('#dv2Status', e => e.textContent)), 'Bekreftelse etter bildelagring', await page.$eval('#dv2Status', e => e.textContent));
  await stegKnapp(page, 2); await page.waitForTimeout(300);
  const f3 = await fliser(page);
  sjekk(JSON.stringify(f3) === JSON.stringify(m.tilstand.bilder.filter(b => b.slot === 'galleri').map(b => b.id)) && !f3.some(id => /^draft-/.test(id)), 'Etter lagring viser galleriet serverens bilder', JSON.stringify(f3));
  sjekk(await page.evaluate(() => !DinSideV2.ulagret()) && await page.$eval('#dv2Lagre', e => e.disabled), 'Etter lagring: ingen ulagrede endringer, Lagre deaktivert');
  sjekk(m.prod === 0, 'Bildeutkast: ingen request mot prod'); sjekk(!errs.length, 'Bildeutkast: pageerror', errs.join('; '));
  await skjerm(page, '375-dark-bilder-etter-lagring');
  await ctx.close();

  // 2j. Lagringen feiler (409 annen fane · nettfeil · 500): utkastet står urørt, tydelig melding, Lagre fortsatt aktiv
  for (const [navn, opt, tekst] of [['409', { konflikt: true }, /annen fane/], ['nettfeil', { lagreFeil: 'nett' }, /bekrefte lagringen/], ['500', { lagreFeil: { status: 500, error: 'Kunne ikke lagre utkastet. Prøv igjen.' } }, /Kunne ikke lagre/]]) {
    const c = await ny({ bredde: 375, mock: opt });
    await stegKnapp(c.page, 2); await c.page.waitForTimeout(400);
    await c.page.setInputFiles('#dv2FilGalleri', BILDE); await c.page.waitForTimeout(800);
    await stegKnapp(c.page, 3); await c.page.click('#dv2Lagre'); await c.page.waitForTimeout(800);
    const st = await c.page.$eval('#dv2Status', e => e.textContent);
    sjekk(tekst.test(st), `${navn}: melding ved lagre-knappen`, st);
    sjekk(!(await c.page.$eval('#dv2Lagre', e => e.disabled)) && await c.page.evaluate(() => DinSideV2.ulagret()), `${navn}: Lagre aktiv og utkastet ulagret`);
    await stegKnapp(c.page, 2); await c.page.waitForTimeout(200);
    sjekk((await fliser(c.page)).length === 4 && c.m.tilstand.bilder.filter(b => b.slot === 'galleri').length === 3, `${navn}: utkastet beholdt, serveren urørt`);
    sjekk(!c.errs.length, `${navn}: pageerror`, c.errs.join('; '));
    await c.ctx.close();
  }

  // 2k. Opplasting før bildelista er hentet: venter på den, så utkastet bygger på serverens bilder (ikke en tom liste → 409)
  {
    const c = await ny({ bredde: 375, mock: { bilderForsinkelse: 1500 }, vent: 'commit' });
    await stegKnapp(c.page, 2);
    await c.page.setInputFiles('#dv2FilGalleri', BILDE); await c.page.waitForTimeout(2600);
    const f = await fliser(c.page);
    sjekk(f.length === 4 && f.slice(0, 3).join() === 'g1,g2,g3', 'Tidlig opplasting venter på bildelista', JSON.stringify(f));
    await stegKnapp(c.page, 3); await c.page.click('#dv2Lagre'); await c.page.waitForTimeout(2600);   // ny GET /images etter lagring har samme forsinkelse
    sjekk(/Lagret/.test(await c.page.$eval('#dv2Status', e => e.textContent)), 'Tidlig opplasting lagres uten konflikt', await c.page.$eval('#dv2Status', e => e.textContent));
    sjekk(!c.errs.length, 'Tidlig opplasting: pageerror', c.errs.join('; '));
    await c.ctx.close();
  }

  // 2l. Bare tekst lagres selv om bildelista ikke kunne hentes (PUT trenger ikke bildene)
  {
    const c = await ny({ bredde: 375, mock: {} });
    await c.page.route('**/api/dashboard/images', r => r.request().method() === 'GET' ? r.fulfill({ status: 500, body: '{}' }) : r.fallback());
    await c.page.evaluate(() => { DinSideV2._S.bilderLastet = false; });
    await c.page.fill('#dv2Tagline', 'Bare tekst'); await lagreSiste(c.page);
    sjekk(lagringer(c.m).some(u => u.draft && !u.draft.images) && /Lagret/.test(await c.page.$eval('#dv2Status', e => e.textContent)), 'Tekst lagres uten bildelista', await c.page.$eval('#dv2Status', e => e.textContent));
    await c.ctx.close();
  }
}
{
  // 2m. Versjonsstempelet (konfliktvernet ved bildelagring) har SAMME format i backend, frontend og mock — ett felles eksempel.
  //     backend imageVersion(rows): portrett+galleri, «id:updated_at-ms:slot:sort_order», sortert, «|». Hero telles ikke.
  //     updated_at null → 0 (new Date(0)). GET /images bærer updated_at-ms som ?v= (0 ved null).
  const RADER = [   // DB-radene backend ser
    { id: 'aaa', slot: 'galleri',  sort_order: 1, updated_at: '2026-10-20T10:00:00.000Z' },
    { id: 'bbb', slot: 'portrett', sort_order: 0, updated_at: '2026-10-21T08:30:00.000Z' },
    { id: 'ccc', slot: 'hero',     sort_order: 0, updated_at: '2026-10-21T08:30:00.000Z' },
    { id: 'ddd', slot: 'galleri',  sort_order: 0, updated_at: null },
  ];
  const FASIT = 'aaa:1792490400000:galleri:1|bbb:1792571400000:portrett:0|ddd:0:galleri:0';
  // Samme rader slik GET /images leverer dem til dashbordet (backend dashboard.js: url `/images/raw/${id}?v=${ms|0}`)
  const GET_IMAGES = RADER.map(r => ({ id: r.id, slot: r.slot, sort_order: r.sort_order, url: `/images/raw/${r.id}?v=${r.updated_at ? new Date(r.updated_at).getTime() : 0}` }));
  // …og slik mocken lagrer dem (v = updated_at-ms)
  const MOCK = RADER.map(r => ({ id: r.id, slot: r.slot, sort_order: r.sort_order, v: r.updated_at ? new Date(r.updated_at).getTime() : 0 }));
  const BACKEND = path.resolve(import.meta.dirname, '../../../barberhq-backend/barberhq-backend/src/lib/imageDraft.js');
  if (fs.existsSync(BACKEND)) {
    const { imageVersion } = await import(pathToFileURL(BACKEND).href);
    sjekk(imageVersion(RADER) === FASIT, 'Versjonsstempel: backend imageVersion() = fasit', imageVersion(RADER));
  } else console.log('  (backend-repoet finnes ikke på disk — backend-siden av 2m hoppet over)');
  sjekk(mockVersjon(MOCK) === FASIT, 'Versjonsstempel: mock = fasit', mockVersjon(MOCK));
  const { ctx, page } = await ny({ bredde: 375, mock: {} });
  const fe = await page.evaluate(l => DinSideV2.bildeVersjon(l), GET_IMAGES);
  sjekk(fe === FASIT, 'Versjonsstempel: frontend bildeVersjon() = fasit', fe);
  console.log('  Versjonsstempel-format (likt på alle sider):', FASIT);
  await ctx.close();
}
{
  // 2n. Tjenestebeskrivelsen er v2-kun: v1-barber ser ikke feltet, v2-barber ser det (også når billing svarer etter tjenestene).
  const TJ = { hoved: [{ name: 'Skin fade', price: 450, min: 45, description: 'Med vask og styling' }, { name: 'Klipp', price: 350, min: 30 }], tillegg: [{ name: 'Skjegg', price: 150, min: 15 }] };
  const tilTjenester = async page => { await page.evaluate(() => document.querySelector('.nav button[data-panel="tjenester"]').click()); await page.waitForTimeout(900); };
  const beskr = page => page.$$eval('.svc-description', es => es.map(e => ({ v: e.value, synlig: e.offsetParent !== null })));
  for (const sm of ['v2', 'v1']) {
    const { ctx, page, errs } = await ny({ bredde: 375, mock: { sidemal: sm, tjenester: TJ } });
    await tilTjenester(page);
    const b = await beskr(page);
    if (sm === 'v2') sjekk(b.length === 2 && b.every(x => x.synlig) && b[0].v === 'Med vask og styling', 'v2: beskrivelsesfelt ved hver hovedtjeneste (ikke tillegg)', JSON.stringify(b));
    else sjekk(b.length === 0, 'v1: ingen beskrivelsesfelt', JSON.stringify(b));
    sjekk(!errs.length, `${sm} tjenester: pageerror`, errs.join('; '));
    await ctx.close();
  }
  {
    // Tjenestene tegnes før billing har svart → feltet kommer når sidemal blir kjent
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
    await installerDinSideMock(page, { tjenester: TJ, billingForsinkelse: 1500 });
    await page.goto(URL_.replace('#dinside', '#tjenester'), { waitUntil: 'commit' });
    await page.waitForTimeout(700);
    const foer = await page.$$eval('.svc-description', es => es.length);
    await page.waitForTimeout(2200);
    const etter = await page.$$eval('.svc-description', es => es.length);
    sjekk(foer === 0 && etter === 2, 'v2: beskrivelsesfeltet dukker opp når billing svarer etter tjenestene', `før=${foer} etter=${etter}`);
    await ctx.close();
  }
}
{
  // 2o. Ny versjon etter deploy (harUlagret): ulagret v2-utkast som IKKE gir input-hendelser (bilde, fargevalg) hindrer
  //     auto-reload → stripen vises. Etter vellykket lagring er flagget nullstilt → auto-reload skjer igjen.
  //     Deploy simuleres som i ny-versjon.mjs: ny ETag på HEAD /no/dashboard.html + dashbordet i forgrunnen etter ett minutt.
  const BILDE = path.resolve(ROOT, 'no/images/layout-hero.webp');
  async function nyMedEtag(mock) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    const st = { etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-ssl"', lastinger: 0 };
    page.on('request', q => { if (new URL(q.url()).pathname === '/no/dashboard.html' && q.method() === 'GET' && q.resourceType() === 'document') st.lastinger++; });
    const m = await installerDinSideMock(page, mock);
    await page.route(u => { const x = new URL(u); return x.hostname === 'localhost' && x.pathname === '/no/dashboard.html'; },
      r => r.request().method() === 'HEAD' ? r.fulfill({ status: 200, headers: { ETag: st.etag }, body: '' }) : r.fallback());
    await page.clock.install(); await page.clock.resume();
    await page.goto(URL_, { waitUntil: 'networkidle' }); await page.waitForSelector('#dv2Grid:not([hidden])', { timeout: 8000 }); await page.waitForTimeout(500);
    return { ctx, page, m, st, errs };
  }
  const deploy = async (page, st) => {
    await page.clock.fastForward(61 * 1000); st.etag = '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-ssl"';
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(900);
  };
  const stripe = page => page.$eval('#nyVersjon', e => !e.hidden && e.getBoundingClientRect().height > 0).catch(() => false);
  // (a) ulagret bilde → ingen reload, stripe
  {
    const c = await nyMedEtag({});
    await stegKnapp(c.page, 2); await c.page.waitForTimeout(300);
    await c.page.setInputFiles('#dv2FilGalleri', BILDE); await c.page.waitForTimeout(800);
    const foer = c.st.lastinger; await deploy(c.page, c.st);
    sjekk(c.st.lastinger === foer && await stripe(c.page), 'Ny versjon + ulagret bilde: ingen reload, stripen vises', `lastinger ${foer}→${c.st.lastinger}`);
    sjekk(!c.errs.length, 'Ny versjon (bilde): pageerror', c.errs.join('; '));
    await c.ctx.close();
  }
  // (b) ulagret fargevalg (klikk, ingen input-hendelse) → ingen reload, stripe
  {
    const c = await nyMedEtag({});
    await stegKnapp(c.page, 1); await c.page.click('#dv2Aksenter [data-aksent="gull"]'); await c.page.waitForTimeout(300);
    const foer = c.st.lastinger; await deploy(c.page, c.st);
    sjekk(c.st.lastinger === foer && await stripe(c.page), 'Ny versjon + ulagret fargevalg: ingen reload, stripen vises', `lastinger ${foer}→${c.st.lastinger}`);
    await c.ctx.close();
  }
  // (c) tekst + bilde lagret → flagget nullstilt → reload
  {
    const c = await nyMedEtag({});
    await c.page.fill('#dv2Tagline', 'Lagres før deploy');
    await stegKnapp(c.page, 2); await c.page.setInputFiles('#dv2FilGalleri', BILDE); await c.page.waitForTimeout(800);
    await lagreSiste(c.page); await c.page.waitForTimeout(600);
    sjekk(/Lagret/.test(await c.page.$eval('#dv2Status', e => e.textContent).catch(() => '')), 'Ny versjon: lagringen gikk gjennom før deploy');
    const foer = c.st.lastinger; await deploy(c.page, c.st);
    for (let i = 0; i < 30 && c.st.lastinger === foer; i++) await new Promise(r => setTimeout(r, 100));
    sjekk(c.st.lastinger === foer + 1, 'Ny versjon etter vellykket lagring: auto-reload skjer', `lastinger ${foer}→${c.st.lastinger}`);
    await c.ctx.close();
  }
  // (d) «Forkast» (fanebytte-dialogen) nullstiller også → reload
  {
    const c = await nyMedEtag({});
    await c.page.fill('#dv2Bio', 'Forkastes'); await stegKnapp(c.page, 2); await c.page.setInputFiles('#dv2FilGalleri', BILDE); await c.page.waitForTimeout(800);
    await c.page.click('.nav button[data-panel="oversikt"]', { force: true }).catch(() => c.page.evaluate(() => document.querySelector('.nav button[data-panel="oversikt"]').click()));
    await c.page.waitForSelector('.dv2-dialog'); await c.page.click('.dv2-dialog .farlig'); await c.page.waitForTimeout(400);
    const foer = c.st.lastinger; await deploy(c.page, c.st);
    for (let i = 0; i < 30 && c.st.lastinger === foer; i++) await new Promise(r => setTimeout(r, 100));
    sjekk(c.st.lastinger === foer + 1, 'Ny versjon etter «Forkast»: auto-reload skjer', `lastinger ${foer}→${c.st.lastinger}`);
    await c.ctx.close();
  }
}
{
  // 2p. Beskjæringsdialogen mens bildet laster: synlig «Laster bildet …», flaten kollapser ikke, Lagre låst. Etter lasting:
  //     lastetilstanden borte, Lagre aktiv når verktøyet er klart. Originalen holdes tilbake til vi slipper den.
  for (const bredde of [320, 375]) {
    const { ctx, page, errs } = await ny({ bredde, mock: {} });
    await stegKnapp(page, 2); await page.waitForTimeout(400);
    let slipp; const sperre = new Promise(r => slipp = r);
    await page.route(u => /\/images\/g2\/original$/.test(new URL(u).pathname), async r => { await sperre; return r.fallback(); });
    await page.click('#dv2Galleri .flis[data-id="g2"]'); await page.click('#dv2Galleri [data-h="beskjaer"]'); await page.waitForTimeout(500);
    const under = await page.evaluate(() => { const w = document.querySelector('.crop-canvas-wrap'), l = document.getElementById('cropLaster');
      return { tekst: l.offsetParent !== null ? l.textContent : null, h: Math.round(w.getBoundingClientRect().height), laast: document.getElementById('cropSave').disabled }; });
    sjekk(under.tekst === 'Laster bildet …' && under.h >= 300 && under.laast, `${bredde}: beskjæring laster — synlig tekst, flaten har høyde, Lagre låst`, JSON.stringify(under));
    slipp();
    await page.waitForFunction(() => typeof _cropper !== 'undefined' && _cropper && _cropper.ready, null, { timeout: 8000 }).catch(() => {});
    const etter = await page.evaluate(() => ({ laster: document.querySelector('.crop-canvas-wrap').classList.contains('laster'), synlig: document.getElementById('cropLaster').offsetParent !== null, aktiv: !document.getElementById('cropSave').disabled }));
    sjekk(!etter.laster && !etter.synlig && etter.aktiv, `${bredde}: beskjæring klar — lastetilstand borte, Lagre aktiv`, JSON.stringify(etter));
    sjekk(!errs.length, `${bredde} beskjæring: pageerror`, errs.join('; '));
    await ctx.close();
  }
}
{
  // 2q. Oppsettet (A): v2-barber med side som ikke er live → fokusmodus ved innlasting, uten hovedfaner og sjekkliste.
  //     «Lagre endringer» er aktiv uten endringer og sender publiser:true til /din-side/lagre (aldri PUT /page-status).
  //     Svar publisert:true → «Siden din er live» med lenken, «Kopier lenke», «Gå til Oversikt» (uten «Fullfør siden din»).
  for (const bredde of [320, 375]) for (const tema of ['dark', 'light']) {
    const { ctx, page, m, errs } = await ny({ bredde, tema, mock: { billing: v2Billing({ page_status: 'forhandsvist', publisert_at: null }) } });
    const ctxt = `A ${bredde}/${tema}`;
    const a = await page.evaluate(() => ({ fokus: document.body.classList.contains('fokus'), tittel: document.getElementById('dv2Tittel').textContent,
      bunnNav: !!document.querySelector('.bunn-nav') && getComputedStyle(document.querySelector('.bunn-nav')).display !== 'none',
      x: getComputedStyle(document.getElementById('fokusX')).display !== 'none', pill: !document.getElementById('sjekkPill').hidden,
      ide: [...document.querySelectorAll('#design .ideacard')].some(e => e.offsetParent !== null) }));
    sjekk(a.fokus && a.tittel === 'Sett opp siden din' && !a.bunnNav && a.x && !a.pill && !a.ide, `${ctxt}: oppsettet åpnes direkte — «Sett opp siden din», X, ingen hovedfaner, ingen sjekkliste, ingen Ideer & ønsker`, JSON.stringify(a));
    await skjerm(page, `A-${bredde}-${tema}-steg1`);
    await maal(page, `${ctxt} steg 1`);
    await stegKnapp(page, 3); await page.waitForTimeout(250);
    sjekk(!(await page.$eval('#dv2Lagre', e => e.disabled)) && await synlig(page, '#dv2Hjelpelinje'), `${ctxt}: siste steg — «Lagre endringer» aktiv uten endringer + hjelpelinje`);
    const ikkeBak = await page.evaluate(() => { const f = document.querySelector('#dv2Telefon'); f.scrollIntoView({ block: 'end' }); scrollTo(0, document.documentElement.scrollHeight);
      return f.getBoundingClientRect().bottom <= document.getElementById('dv2Bar').getBoundingClientRect().top - 8; });
    sjekk(ikkeBak, `${ctxt}: siste felt står over bunnbaren med luft (også med hjelpelinja)`);
    await skjerm(page, `A-${bredde}-${tema}-steg4`);
    if (bredde === 375 && tema === 'dark') {
      await page.click('#dv2Lagre'); await page.waitForSelector('#dv2Bekreft:not([hidden])', { timeout: 5000 }).catch(() => {});
      const lg = lagringer(m);
      sjekk(lg.length === 1 && lg[0].draft.publiser === true, 'A: lagring sender publiser:true', JSON.stringify(lg.map(x => x.draft && x.draft.publiser)));
      sjekk(!m.kall.some(k => /page-status/.test(k.sti)), 'A: ingen kall til /page-status');
      const bk = await page.evaluate(() => ({ h: document.getElementById('dv2BekreftH').textContent, lenke: document.getElementById('dv2Lenke').textContent, fokus: document.activeElement && document.activeElement.id, iFokus: document.body.classList.contains('fokus') }));
      sjekk(bk.h === 'Siden din er live' && /grand-barber$/.test(bk.lenke) && bk.fokus === 'dv2BekreftH' && !bk.iFokus, 'A: «Siden din er live» med lenken, fokus på overskriften, oppsettet avsluttet', JSON.stringify(bk));
      await skjerm(page, 'A-375-dark-bekreftelse');
      await page.click('#dv2Kopier'); await page.waitForTimeout(200);
      sjekk(/kopiert|markert/i.test(await page.$eval('#dv2Kopiert', e => e.textContent)), '«Kopier lenke» gir beskjed');
      await page.click('#dv2TilOversikt'); await page.waitForTimeout(400);
      sjekk(await page.evaluate(() => document.getElementById('oversikt').classList.contains('active') && document.getElementById('dv2Fullfor').hidden), '«Gå til Oversikt»: Oversikt uten «Fullfør siden din» (siden er live)');
    }
    sjekk(m.prod === 0, `${ctxt}: ingen request mot prod`); sjekk(!errs.length, `${ctxt}: pageerror`, errs.join('; '));
    await ctx.close();
  }
  // Kravene mangler: lagret, men ikke publisert → backendens melding vises som den er, ingen bekreftelse.
  {
    const t = startTilstand(); t.krav = { tjeneste_med_pris: true, apen_dag: false };
    const { ctx, page, m, errs } = await ny({ bredde: 375, mock: { tilstand: t, billing: v2Billing({ page_status: 'forhandsvist', publisert_at: null }) } });
    await stegKnapp(page, 3); await page.click('#dv2Lagre'); await page.waitForTimeout(700);
    const st = await page.$eval('#dv2Status', e => ({ t: e.textContent, k: e.className }));
    sjekk(/kan ikke publiseres før du har lagt inn åpningstid/.test(st.t) && /info/.test(st.k) && await page.$eval('#dv2Bekreft', e => e.hidden), 'Krav mangler: publisering.melding vises som den er, ingen bekreftelse', JSON.stringify(st));
    sjekk(lagringer(m).length === 1 && !m.kall.some(k => /page-status/.test(k.sti)), 'Krav mangler: én lagring, ingen /page-status');
    await skjerm(page, 'A-375-dark-krav-mangler');
    sjekk(!errs.length, 'Krav mangler: pageerror', errs.join('; '));
    await ctx.close();
  }
}
{
  // 2r. X og «Fullfør siden din»: uten endringer lukker X til Oversikt (kortet vises, hovedfanene tilbake);
  //     kortet åpner oppsettet igjen. Med ulagrede endringer: «Forkast» / «Bli her». Lukket oppsett huskes ved reload i økta.
  const { ctx, page, errs } = await ny({ bredde: 375, mock: { billing: v2Billing({ page_status: 'forhandsvist', publisert_at: null }) } });
  const tilstand = () => page.evaluate(() => ({ fokus: document.body.classList.contains('fokus'), panel: document.querySelector('.panel.active') && document.querySelector('.panel.active').id,
    kort: !document.getElementById('dv2Fullfor').hidden && document.getElementById('dv2Fullfor').offsetParent !== null,
    bunnNav: getComputedStyle(document.querySelector('.bunn-nav')).display !== 'none', tittel: document.getElementById('dv2Tittel').textContent }));
  await page.click('#fokusX'); await page.waitForTimeout(400);
  let s = await tilstand();
  sjekk(!s.fokus && s.panel === 'oversikt' && s.kort && s.bunnNav, 'X uten endringer: Oversikt med «Fullfør siden din» og hovedfanene', JSON.stringify(s));
  await skjerm(page, 'A-375-dark-oversikt-fullfor');
  await page.click('#dv2Fullfor'); await page.waitForTimeout(600);
  s = await tilstand();
  sjekk(s.fokus && s.panel === 'design' && s.tittel === 'Sett opp siden din' && !s.bunnNav, '«Fullfør siden din» åpner oppsettet igjen', JSON.stringify(s));
  await page.fill('#dv2Tagline', 'Skal forkastes');
  await page.click('#fokusX'); await page.waitForSelector('.dv2-dialog', { timeout: 3000 }).catch(() => {});
  const knapper = await page.$$eval('.dv2-dialog .dv2-btn', bs => bs.map(b => b.textContent));
  sjekk(knapper.includes('Forkast') && knapper.includes('Bli her'), 'X med ulagrede endringer: «Forkast» / «Bli her»', knapper.join(' | '));
  await page.click('.dv2-dialog .dv2-btn:not(.farlig)'); await page.waitForTimeout(250);
  s = await tilstand();
  sjekk(s.fokus && s.panel === 'design' && await verdi(page, '#dv2Tagline') === 'Skal forkastes', '«Bli her»: oppsettet og utkastet står', JSON.stringify(s));
  await page.click('#fokusX'); await page.waitForSelector('.dv2-dialog'); await page.click('.dv2-dialog .farlig'); await page.waitForTimeout(400);
  s = await tilstand();
  sjekk(!s.fokus && s.panel === 'oversikt' && await page.evaluate(() => !DinSideV2.ulagret() && DinSideV2._S.utkast.profil.tagline !== 'Skal forkastes'), '«Forkast»: utkastet forkastet, Oversikt', JSON.stringify(s));
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  s = await tilstand();
  sjekk(!s.fokus && s.kort, 'Reload i samme økt etter X: oppsettet forblir lukket, kortet står', JSON.stringify(s));
  sjekk(!errs.length, 'X/Fullfør: pageerror', errs.join('; '));
  await ctx.close();
}
{
  // 2s. Fullskjerm-forhåndsvisning (mobil): Escape inne i bookingsiden (fokus i iframen) lukker flaten, fokus tilbake til «Forhåndsvis».
  const { ctx, page, errs } = await ny({ bredde: 375, mock: {} });
  await page.click('#dv2SeSiden'); await page.waitForSelector('#dv2Pv.apen'); await page.waitForTimeout(900);
  const fr = await (await page.$('#dv2Iframe')).contentFrame();
  await fr.click('body', { position: { x: 20, y: 20 } }).catch(() => {}); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const e = await page.evaluate(() => ({ apen: document.getElementById('dv2Pv').classList.contains('apen'), fokus: document.activeElement && document.activeElement.id }));
  sjekk(!e.apen && e.fokus === 'dv2SeSiden', 'Escape inne i forhåndsvisningen lukker flaten, fokus til «Forhåndsvis»', JSON.stringify(e));
  sjekk(await page.$eval('#dv2PvLukk', b => b.textContent) === '← Tilbake', 'Fullskjerm: «← Tilbake»');
  sjekk(!errs.length, 'Escape: pageerror', errs.join('; '));
  await ctx.close();
}
{
  // 2t. Mer info (om): under Kort beskrivelse, hjelpetekst om Om-fanen, plassholder, maks fra valg.maks.om; følger med i lagringen.
  const { ctx, page, m, errs } = await ny({ bredde: 375, mock: {} });
  const o = await page.evaluate(() => { const t = document.getElementById('dv2Om'), l = document.querySelector('label[for="dv2Om"]');
    return { etikett: l.firstChild.textContent.trim(), hjelp: document.getElementById('dv2OmHjelp').textContent, plass: t.placeholder, maks: t.maxLength,
      underBio: !!(document.querySelector('[data-felt="bio"]').compareDocumentPosition(document.querySelector('[data-felt="om"]')) & Node.DOCUMENT_POSITION_FOLLOWING),
      beskrevet: (t.getAttribute('aria-describedby') || '').includes('dv2OmHjelp') }; });
  sjekk(o.etikett === 'Mer info' && o.hjelp === 'Vises i Om-fanen på siden din.' && o.plass === 'F.eks. priser, parkering, hvordan du jobber' && o.maks === 4000 && o.underBio && o.beskrevet, 'Mer info: etikett, hjelpetekst, plassholder, maks 4000, under Kort beskrivelse', JSON.stringify(o));
  await page.fill('#dv2Om', 'Gratis parkering i bakgården.'); await lagreSiste(page); await page.waitForTimeout(500);
  const lg = lagringer(m).pop();
  sjekk(lg && lg.draft.profil.om === 'Gratis parkering i bakgården.' && m.tilstand.profil.om === 'Gratis parkering i bakgården.', 'Mer info lagres som profil.om', JSON.stringify(lg && lg.draft.profil));
  sjekk(!errs.length, 'Mer info: pageerror', errs.join('; '));
  await ctx.close();
}
{
  // 2g. v1-barber: dagens Din side helt uendret, ingen v2-kall
  const { ctx, page, m, errs } = await ny({ bredde: 375, mock: { sidemal: 'v1' } });
  await page.waitForTimeout(600);
  sjekk(await page.evaluate(() => !document.body.classList.contains('sm-v2') && document.body.classList.contains('sm-v1')), 'v1: body.sm-v1');
  sjekk(!(await synlig(page, '#dinsideV2')), 'v1: v2-flaten er skjult');
  sjekk(await synlig(page, '#sideAccs') && await synlig(page, '.side-wrap'), 'v1: dagens Din side er synlig');
  sjekk(m.kall.filter(k => /din-side/.test(k.sti) || k.sti === '/api/dashboard/preview' && k.metode === 'POST').length === 0, 'v1: ingen kall mot v2-rutene');
  sjekk(m.kall.some(k => k.sti === '/api/dashboard/design'), 'v1: lastet via /design som før');
  sjekk(!errs.length, 'v1: pageerror', errs.join('; '));
  await skjerm(page, '375-dark-v1-uendret');
  await ctx.close();
}

{
  // 2h. INGEN v1-flate synlig på v2 — i noen tilstand (billing ikke svart ennå, billing feilet, etter lagring,
  //     etter fanebytte og tilbake, etter reload, ?velkommen=1, ulike bredder). Rotårsaken som ble funnet 19.10:
  //     før billing hadde svart hadde body ingen sidemal-klasse, og da sto hele v1-flaten synlig.
  const V1_SEL = '#design .v1-kun, #design #sideAccs, #design .side-wrap, #design #dinsideLive, #design #dinsideCta, #design #fokusBar, #design #accProfil, #design #accBilder, #design #accDesign';
  const v1Synlig = page => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => e.id || e.className.split(' ')[0]), V1_SEL);
  const v1Tekst = page => page.evaluate(() => { const p = document.querySelector('#design'); const t = (p.innerText || ''); return ['Design siden din', 'Endringer vises i forhåndsvisningen', 'Publiser siden', 'Trykk på en boks'].filter(s => t.includes(s)); });
  async function ingenV1(page, hva) {
    const a = await v1Synlig(page), b = await v1Tekst(page);
    sjekk(!a.length && !b.length, `v1-flate synlig på v2: ${hva}`, [...a, ...b].join(', '));
  }
  for (const bredde of [320, 375, 1280]) {
    // (a) billing svarer sent: tett sampling hele ventetiden + etterpå
    {
      const ctx = await browser.newContext({ viewport: { width: bredde, height: 800 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage(); const m = await installerDinSideMock(page, { billingForsinkelse: 1600 });
      await page.goto(URL_, { waitUntil: 'commit' });
      for (let i = 0; i < 9; i++) { await page.waitForTimeout(250); await ingenV1(page, `${bredde}: mens billing lastes (+${(i + 1) * 250} ms)`); }
      await page.waitForSelector('#dv2Grid:not([hidden])', { timeout: 8000 });
      await ingenV1(page, `${bredde}: etter at billing og Din side er lastet`);
      sjekk(await page.evaluate(() => document.body.classList.contains('sm-v2')), `${bredde}: body.sm-v2 etter billing`);
      // (b) etter lagring
      await page.fill('#dv2Tagline', 'Lagret nå'); await lagreSiste(page); await page.waitForTimeout(700);
      await ingenV1(page, `${bredde}: etter lagring`);
      // (c) fanebytte og tilbake (via topp-navet slik bunn-navet gjør)
      await page.evaluate(() => document.querySelector('.nav button[data-panel="oversikt"]').click()); await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelector('.nav button[data-panel="design"]').click()); await page.waitForTimeout(800);
      await ingenV1(page, `${bredde}: etter fanebytte og tilbake`);
      // (d) reload på #dinside
      await page.reload({ waitUntil: 'commit' });
      for (let i = 0; i < 4; i++) { await page.waitForTimeout(300); await ingenV1(page, `${bredde}: reload (+${(i + 1) * 300} ms)`); }
      await page.waitForTimeout(1800); await ingenV1(page, `${bredde}: etter reload`);
      sjekk(m.prod === 0, `${bredde}: ingen request mot prod (v1-vakt)`);
      await ctx.close();
    }
  }
  // (e) billing feiler: verken v1 eller v2, en rolig beskjed
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
    await installerDinSideMock(page, { billingStatus: 500 });
    await page.goto(URL_, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
    await ingenV1(page, 'billing feilet');
    sjekk(/Kunne ikke laste Din side/.test(await page.$eval('#dv2Start', e => e.textContent).catch(() => '')), 'Billing feilet: tydelig beskjed i stedet for v1-flaten');
    await ctx.close();
  }
  // (f) velkommen-param (fokusmodus-inngang) på v2
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
    await installerDinSideMock(page, {});
    await page.goto(URL_.replace('/dashboard.html', '/dashboard.html?velkommen=1'), { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
    await ingenV1(page, '?velkommen=1'); await ctx.close();
  }
  // (g) v1-barber: v1-flaten kommer når billing er kjent (og ikke før); v2-flaten vises aldri
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } }); const page = await ctx.newPage();
    await installerDinSideMock(page, { sidemal: 'v1', billingForsinkelse: 900 });
    await page.goto(URL_, { waitUntil: 'commit' });
    await page.waitForTimeout(400);
    sjekk((await v1Synlig(page)).length === 0, 'v1-barber: v1-flaten venter også til billing er kjent');
    await page.waitForTimeout(2500);
    sjekk((await v1Synlig(page)).length > 0 && !(await synlig(page, '#dv2Grid')), 'v1-barber: v1-flaten vises etter billing, v2 aldri');
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(feil.length ? `\n${feil.length} AVVIK:` : '\nOK ✓ — alle sjekker grønne');
for (const f of feil) console.log(' ✗', f.hva, f.detalj ? `— ${f.detalj}` : '');
console.log('Skjermbilder:', OUT);
if (feil.length) process.exitCode = 1;
