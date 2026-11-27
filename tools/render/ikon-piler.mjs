// tools/render/ikon-piler.mjs — pil- og chevron-ikonene (site/no/ikoner.svg) i stedet for tekstpiler (27.11.2026).
//
//   node tools/render/ikon-piler.mjs
//
// For hvert sted: ingen tekstpil igjen (→ ← › ‹ ▾ …), ikonet er <svg class="ikon"><use href="ikoner.svg#…"> og LASTET
// (getBBox > 0), 16×16, strek 2 / runde ender, 6 px fra teksten, vertikalt midt på teksten (±1 px), riktig form (pil-h på
// «videre», pil-v på «tilbake», chevron på rader som åpner/folder ut — ned når den folder ut).
// Steder: Din side (Neste/Tilbake, forhåndsvisningens Tilbake, Tidligere/Senere i Bilder), Oversikt («Fullfør siden din»,
// «Lag story med ledige timer», «Se lista», månedsknappen), kalenderen (datoknapp + månedsvelger), Vekst («Kjøp SMS for å
// sende påminnelser»), plakat-editoren (Tilbake), Konto (Support/Vilkår/Personvern, Ideer og ønsker lukket/åpen, SMS-logg),
// demo-banneret, kom-i-gang (Tilbake / Neste). Noen tilstander tvinges synlige (hidden av / klasse på) — markert «tvunget».
// Alt /api/** mockes (fixtures/dinside-v2.mjs); ingen request når prod. Skjermbilder → .render-ut/ikon-piler/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { installerDinSideMock, startTilstand } from './fixtures/dinside-v2.mjs';
import { v2 } from './fixtures/billing.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT = path.resolve(import.meta.dirname, '../../.render-ut/ikon-piler');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/no/`;
const browser = await chromium.launch();
const feil = []; const sjekk = (ok, hva, d = '') => { if (!ok) feil.push(hva + (d ? ' — ' + d : '')); return ok; };
const TEKSTPIL = /[→←›‹↗↘▾▼▸►⟶➜]/;

// Måler ett element med ikon. forventet: { form:'pil-h'|'pil-v'|'chevron', ned?:bool, etter?:bool (ikonet etter teksten) }
const MAAL = (sel) => {
  const el = document.querySelector(sel); if (!el) return { finnes: false };
  const svg = el.querySelector('svg.ikon') || (el.matches('svg.ikon') ? el : null);
  const use = svg && svg.querySelector('use');
  const r = svg && svg.getBoundingClientRect(), cs = svg && getComputedStyle(svg);
  let bbox = 0; try { const b = use.getBBox(); bbox = b.width * b.height; } catch (_) {}
  // tekstens boks (alle tekstnoder i elementet, utenom ikonet)
  const rg = document.createRange(); let tekst = null;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (!n.data.trim() || (svg && svg.contains(n))) continue;
    const p = n.parentElement; if (p && getComputedStyle(p).display === 'none') continue;
    rg.selectNodeContents(n); const b = rg.getBoundingClientRect(); if (!b.width) continue;
    tekst = tekst ? { l: Math.min(tekst.l, b.left), r: Math.max(tekst.r, b.right), t: Math.min(tekst.t, b.top), b: Math.max(tekst.b, b.bottom) } : { l: b.left, r: b.right, t: b.top, b: b.bottom }; }
  const vis = el.checkVisibility ? el.checkVisibility() : el.offsetParent !== null;
  return { finnes: true, vis, ren: el.textContent.trim(), href: use && use.getAttribute('href'), lastet: bbox > 0,
    w: r && Math.round(r.width * 10) / 10, h: r && Math.round(r.height * 10) / 10, strek: cs && cs.strokeWidth, ende: cs && cs.strokeLinecap, hjorne: cs && cs.strokeLinejoin,
    transform: cs && cs.transform,
    avst: tekst && r ? Math.round((r.left >= tekst.r ? r.left - tekst.r : tekst.l - r.right) * 10) / 10 : null,
    etter: tekst && r ? r.left >= tekst.r - 1 : null,
    midt: tekst && r ? Math.round(((r.top + r.bottom) / 2 - (tekst.t + tekst.b) / 2) * 10) / 10 : null };
};
async function sjekkEl(page, sel, navn, f) {
  const m = await page.evaluate(MAAL, sel);
  if (!sjekk(m.finnes, `${navn}: finnes`, sel)) return m;
  sjekk(!TEKSTPIL.test(m.ren), `${navn}: ingen tekstpil`, m.ren);
  sjekk(m.href === `ikoner.svg#${f.form}`, `${navn}: ikonet er ${f.form}`, m.href);
  sjekk(m.lastet, `${navn}: ikonet er lastet (sprite funnet)`);
  sjekk(m.w === 16 && m.h === 16 && m.strek === '2px' && m.ende === 'round' && m.hjorne === 'round', `${navn}: 16×16, strek 2, runde ender/hjørner`, JSON.stringify([m.w, m.h, m.strek, m.ende, m.hjorne]));
  if (f.ned) sjekk(/matrix\(6\.1\d*e-17, 1, -1, 6\.1\d*e-17|matrix\(0, 1, -1, 0/.test(m.transform) || f.aapen, `${navn}: chevron peker ned`, m.transform);
  if (f.tekst !== false) {
    sjekk(m.avst !== null && Math.abs(m.avst - 6) <= 0.6, `${navn}: 6 px fra teksten`, String(m.avst));
    sjekk(m.midt !== null && Math.abs(m.midt) <= 1, `${navn}: vertikalt midt på teksten`, String(m.midt));
    if (f.etter !== undefined) sjekk(m.etter === f.etter, `${navn}: ikonet står ${f.etter ? 'etter' : 'før'} teksten`);
  }
  return m;
}
async function bilde(page, sel, fil, luft = 14) {
  await page.mouse.move(1, 1);
  const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, w: b.width, h: b.height }; }, sel);
  if (!r) return; await page.waitForTimeout(150);
  const vw = page.viewportSize().width;
  await page.screenshot({ path: path.join(OUT, fil + '.png'), fullPage: true, clip: { x: Math.max(0, r.x - luft), y: Math.max(0, r.y - luft), width: Math.min(vw - Math.max(0, r.x - luft), r.w + 2 * luft), height: r.h + 2 * luft } });
}
async function ny(bredde, mockOpts = {}, url = 'dashboard.html') {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('bhq-theme', 'dark'); } catch (_) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const m = await installerDinSideMock(page, { sidemal: 'v2', ...mockOpts });
  await page.goto(BASE + url, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
  return { ctx, page, errs, m };
}
const fane = (page, id) => page.evaluate(i => document.querySelector(`.nav button[data-panel="${i}"]`).click(), id).then(() => page.waitForTimeout(700));

for (const bredde of [320, 375, 1280]) {
  const k = String(bredde);
  // ── Din side: Neste / Tilbake (steg 2), forhåndsvisningens Tilbake (mobil), Tidligere / Senere (Bilder) ──
  { const { ctx, page, errs, m } = await ny(bredde, {}, 'dashboard.html#dinside');
    await page.waitForSelector('#dv2Neste', { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => { try { if (window.DinSideV2 && DinSideV2.startOppsett) DinSideV2.startOppsett(); } catch (_) {} });   // oppsettet: bunnbaren med Neste/Tilbake
    await page.waitForTimeout(500);
    await page.click('#dv2Steg [data-steg="1"]').catch(() => {}); await page.waitForTimeout(400);
    await sjekkEl(page, '#dv2Neste', `${k} Din side Neste`, { form: 'pil-h', etter: true });
    await sjekkEl(page, '#dv2Tilbake', `${k} Din side Tilbake`, { form: 'pil-v', etter: false });
    await bilde(page, '.dv2-bar-rad', `${k}-dinside-neste-tilbake`, 10);
    if (bredde < 1024) {
      await page.click('#dv2SeSiden').catch(() => {}); await page.waitForTimeout(500);
      await sjekkEl(page, '#dv2PvLukk', `${k} forhåndsvisning Tilbake`, { form: 'pil-v', etter: false });
      await bilde(page, '.dv2-pv-topp', `${k}-dinside-forhandsvisning-tilbake`, 8);
      await page.click('#dv2PvLukk').catch(() => {}); await page.waitForTimeout(300);
    }
    sjekk(!errs.length && m.prod === 0, `${k} Din side: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }

  // ── Din side → Bilder: «Rekkefølge» [←] «2 av 5» [→] (27.11.2026) — første / midterste / siste valgt, ett bilde = ingen rad ──
  { const t = startTilstand({ bilder: [{ id: 'b1', slot: 'portrett', sort_order: 0, fil: 0 }]
      .concat([0, 1, 2, 3, 4].map(i => ({ id: 'g' + (i + 1), slot: 'galleri', sort_order: i, fil: i }))) });
    const { ctx, page, errs, m } = await ny(bredde, { tilstand: t }, 'dashboard.html#dinside');
    await page.waitForSelector('#dv2Steg', { timeout: 8000 }).catch(() => {});
    await page.click('#dv2Steg [data-steg="2"]').catch(() => {}); await page.waitForTimeout(600);
    const RAD = () => { const r = document.querySelector('#dv2Galleri .dv2-rekkefolge'); if (!r) return null;
      const kn = [...r.querySelectorAll('button')].map(b => { const q = b.getBoundingClientRect(), c = getComputedStyle(b);
        return { h: b.dataset.h, aria: b.getAttribute('aria-label'), av: b.disabled, w: Math.round(q.width), hh: Math.round(q.height), ramme: c.borderTopWidth + ' ' + c.borderTopStyle,
          ikon: (b.querySelector('use') || {}).getAttribute && b.querySelector('use').getAttribute('href'), tekst: b.textContent.trim() }; });
      const pos = r.querySelector('.dv2-rekke-pos'), et = r.querySelector('.dv2-etikett'), ref = document.querySelector('#dinsideV2 .dv2-gruppe>legend, #dinsideV2 .dv2-etikett:not(#dv2RekkeEtikett)');
      return { etikett: et && et.textContent, etikettStil: et && [getComputedStyle(et).fontSize, getComputedStyle(et).fontWeight].join(' '),
        refStil: ref && [getComputedStyle(ref).fontSize, getComputedStyle(ref).fontWeight].join(' '),
        pos: pos && pos.textContent, posStil: pos && [getComputedStyle(pos).fontSize, getComputedStyle(pos).color].join(' '), kn,
        beskjaerSlett: [...document.querySelectorAll('#dv2Galleri .dv2-verktoy .dv2-handl button')].map(b => b.textContent.trim()).join('|') }; };
    for (const [i, navn, venstreAv, hoyreAv] of [[0, 'forste', true, false], [2, 'midterste', false, false], [4, 'siste', false, true]]) {
      await page.click(`#dv2Galleri .flis[data-id="g${i + 1}"]`); await page.waitForTimeout(250);
      const r = await page.evaluate(RAD);
      if (!sjekk(r, `${k} Rekkefølge (${navn}): raden finnes`)) continue;
      sjekk(r.etikett === 'Rekkefølge' && r.etikettStil === r.refStil, `${k} Rekkefølge: etikett i samme stil som de andre`, JSON.stringify([r.etikettStil, r.refStil]));
      sjekk(r.pos === `${i + 1} av 5` && /^14px /.test(r.posStil), `${k} Rekkefølge (${navn}): «${i + 1} av 5», 14 px dempet`, JSON.stringify([r.pos, r.posStil]));
      const [v, h] = r.kn;
      sjekk(r.kn.length === 2 && v.h === 'tidligere' && h.h === 'senere' && v.aria === 'Flytt bildet tidligere' && h.aria === 'Flytt bildet senere',
        `${k} Rekkefølge: to ikonknapper med aria-label`, JSON.stringify(r.kn));
      sjekk(r.kn.every(b => b.w === 44 && b.hh === 44 && b.ramme === '1px solid' && b.tekst === ''), `${k} Rekkefølge: 44×44, ramme, ingen tekst`, JSON.stringify(r.kn.map(b => [b.w, b.hh, b.ramme])));
      sjekk(v.ikon === 'ikoner.svg#pil-v' && h.ikon === 'ikoner.svg#pil-h', `${k} Rekkefølge: pil-v / pil-h`);
      sjekk(v.av === venstreAv && h.av === hoyreAv, `${k} Rekkefølge (${navn}): venstre ${venstreAv ? 'av' : 'på'}, høyre ${hoyreAv ? 'av' : 'på'}`, JSON.stringify([v.av, h.av]));
      sjekk(r.beskjaerSlett === 'Beskjær|Slett', `${k} Rekkefølge: «Beskjær» og «Slett» står som før`, r.beskjaerSlett);
      const linje = await page.$eval('#dv2Galleri .dv2-verktoy > p', e => e.textContent);
      sjekk(linje === 'Rekkefølgen er slik kunden ser den, rad for rad.', `${k} Rekkefølge: den korte linja over raden`, linje);
      await bilde(page, '#dv2Galleri .dv2-verktoy', `${k}-dinside-rekkefolge-${navn}`, 10);
    }
    // Høyre-pila flytter det valgte bildet én plass senere i galleriet
    await page.click('#dv2Galleri .flis[data-id="g2"]'); await page.waitForTimeout(200);
    await page.click('#dv2Galleri .dv2-rekkefolge [data-h="senere"]'); await page.waitForTimeout(300);
    const rekke = await page.$$eval('#dv2Galleri .flis', f => f.map(x => x.dataset.id).join(','));
    const pos = await page.$eval('#dv2Galleri .dv2-rekke-pos', e => e.textContent).catch(() => '');
    sjekk(rekke === 'g1,g3,g2,g4,g5' && pos === '3 av 5', `${k} Rekkefølge: → flytter bildet én plass senere`, rekke + ' / ' + pos);
    sjekk(!errs.length && m.prod === 0, `${k} Rekkefølge: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }
  { // Bare ett galleribilde → ingen rekkefølge-rad
    const t = startTilstand({ bilder: [{ id: 'g1', slot: 'galleri', sort_order: 0, fil: 0 }] });
    const { ctx, page, errs } = await ny(bredde, { tilstand: t }, 'dashboard.html#dinside');
    await page.waitForSelector('#dv2Steg', { timeout: 8000 }).catch(() => {});
    await page.click('#dv2Steg [data-steg="2"]').catch(() => {}); await page.waitForTimeout(500);
    await page.click('#dv2Galleri .flis[data-id="g1"]').catch(() => {}); await page.waitForTimeout(250);
    sjekk(!(await page.$('#dv2Galleri .dv2-rekkefolge')) && (await page.$$('#dv2Galleri .dv2-verktoy .dv2-handl button')).length === 2, `${k} ett bilde: ingen rekkefølge-rad, Beskjær/Slett står`);
    await bilde(page, '#dv2Galleri .dv2-verktoy', `${k}-dinside-rekkefolge-ett-bilde`, 10);
    sjekk(!errs.length, `${k} ett bilde: JS-feil`, errs.join('; '));
    await ctx.close(); }

  // ── Oversikt: «Fullfør siden din» (ikke live), «Lag story …» (tvunget), «Se lista» (ovsPaaVeiHtml), månedsknappen ──
  { const { ctx, page, errs, m } = await ny(bredde, { billing: v2({ page_status: 'forhandsvist', publisert_at: null }) });
    await page.evaluate(() => { try { sessionStorage.setItem('dv2OppsettLukket', '1'); } catch (_) {} if (typeof avsluttFokus === 'function') avsluttFokus(); });
    await fane(page, 'oversikt');
    await sjekkEl(page, '#dv2Fullfor', `${k} Oversikt «Fullfør siden din»`, { form: 'chevron', tekst: false });
    await bilde(page, '#dv2Fullfor', `${k}-oversikt-fullfor-siden`);
    await page.evaluate(() => { const b = document.getElementById('storyOpenOversikt'); if (b) b.hidden = false; });   // tvunget
    await sjekkEl(page, '#storyOpenOversikt', `${k} «Lag story med ledige timer» (tvunget)`, { form: 'pil-h', etter: true });
    await bilde(page, '#storyOpenOversikt', `${k}-oversikt-lag-story`);
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'testPaaVei'; d.style.cssText = 'padding:12px 0';
      d.innerHTML = ovsPaaVeiHtml({ winback: { borte: 3, no_show: 1 }, rebooking: { naar_vindu_30d: 2, med_samtykke: 2 } }, false);
      const s = document.getElementById('ovsTall') || document.querySelector('#oversikt'); s.parentNode.insertBefore(d, s); });
    await page.waitForTimeout(300);   // <use> mot ikoner.svg lastes asynkront for nye elementer
    await sjekkEl(page, '#testPaaVei [data-di-winback]', `${k} «Se lista» (PÅ VEI)`, { form: 'pil-h', etter: true });
    await bilde(page, '#testPaaVei .pv-rad', `${k}-oversikt-se-lista`);
    await sjekkEl(page, '#maanedBtn', `${k} månedsknappen`, { form: 'chevron', ned: true, etter: true });
    await bilde(page, '#maanedBtn', `${k}-oversikt-maanedknapp`, 10);
    sjekk(!errs.length && m.prod === 0, `${k} Oversikt: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }

  // ── Kalenderen: datoknappen + månedsvelgeren ──
  { const { ctx, page, errs, m } = await ny(bredde);
    await page.evaluate(() => { if (typeof openKalender === 'function') openKalender(); }); await page.waitForTimeout(800);
    await sjekkEl(page, '#calDateBtn', `${k} kalender datoknapp`, { form: 'chevron', ned: true, etter: true });
    await page.click('#calDateBtn').catch(() => {}); await page.waitForTimeout(400);
    await sjekkEl(page, '.cal-mp-head [data-mp="-1"]', `${k} månedsvelger forrige`, { form: 'chevron', tekst: false });
    await sjekkEl(page, '.cal-mp-head [data-mp="1"]', `${k} månedsvelger neste`, { form: 'chevron', tekst: false });
    const venstre = await page.$eval('.cal-mp-head [data-mp="-1"] svg', e => getComputedStyle(e).transform);
    sjekk(/matrix\(-1, (1\.2\d*e-16|0), -?(1\.2\d*e-16|0), -1/.test(venstre), `${k} månedsvelger forrige: chevron peker venstre`, venstre);
    const kalKnapp = await page.$eval('.cal-mp-head [data-mp="1"]', b => { const c = getComputedStyle(b), r = b.getBoundingClientRect();
      return [b.className, Math.round(r.width), Math.round(r.height), c.borderTopWidth, c.borderRadius].join(' '); });
    const al = await page.$$eval('.cal-mp-head [data-mp]', b => b.map(x => x.getAttribute('aria-label')).join('|'));
    sjekk(al === 'Forrige måned|Neste måned', `${k} månedsvelger: aria-label`, al);
    const tittelFoer = await page.$eval('.cal-mp-title', e => e.textContent);
    await page.click('.cal-mp-head [data-mp="1"] svg').catch(() => {}); await page.waitForTimeout(200);   // klikk PÅ ikonet virker
    sjekk(tittelFoer !== await page.$eval('.cal-mp-title', e => e.textContent), `${k} månedsvelger: klikk på ikonet bytter måned`);
    await bilde(page, '.cal-topbar', `${k}-kalender-datoknapp`, 8);
    // Enkeltdager (Tjenester & tider): forrige/neste måned = samme .ed-pil + chevron som månedsvelgeren over
    await page.evaluate(() => { if (typeof toggleMonthpick === 'function') toggleMonthpick(true); const x = document.querySelector('#calClose, .cal-close'); if (x) x.click(); });
    await fane(page, 'tjenester');
    await page.evaluate(() => document.getElementById('edForrige').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
    await sjekkEl(page, '#edForrige', `${k} Enkeltdager forrige måned`, { form: 'chevron', tekst: false });
    await sjekkEl(page, '#edNeste', `${k} Enkeltdager neste måned`, { form: 'chevron', tekst: false });
    const edKnapp = await page.$eval('#edNeste', b => { const c = getComputedStyle(b), r = b.getBoundingClientRect();
      return [b.className, Math.round(r.width), Math.round(r.height), c.borderTopWidth, c.borderRadius].join(' '); });
    sjekk(edKnapp === kalKnapp, `${k} månedsvelgerne i begge kalenderne er like`, edKnapp + ' ≠ ' + kalKnapp);
    await bilde(page, '#enkeltdager .ed-head', `${k}-enkeltdager-maanedsvelger`, 8);
    await page.evaluate(() => { if (typeof openKalender === 'function') openKalender(); }); await page.waitForTimeout(600);
    await page.click('#calDateBtn').catch(() => {}); await page.waitForTimeout(300);
    await bilde(page, '.cal-mp-head', `${k}-kalender-maanedsvelger`, 8);
    sjekk(!errs.length && m.prod === 0, `${k} kalender: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }

  // ── Vekst: «Kjøp SMS for å sende påminnelser» (tvunget) · plakat-editorens Tilbake (tvunget) ──
  { const { ctx, page, errs, m } = await ny(bredde);
    await fane(page, 'vekst');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const p = document.getElementById('paamKjop'); if (p) p.hidden = false; });   // tvunget (vises bare på Gratis med 0 SMS)
    await page.waitForTimeout(300);
    await sjekkEl(page, '#paamKjopLenke', `${k} «Kjøp SMS for å sende påminnelser» (tvunget)`, { form: 'pil-h', etter: true });
    await bilde(page, '#paamKjop', `${k}-vekst-kjop-sms`);
    await page.evaluate(() => { document.getElementById('plakatOverlay').classList.add('open'); document.getElementById('plakatBack').hidden = false; });
    await sjekkEl(page, '#plakatBack', `${k} plakat Tilbake (tvunget)`, { form: 'pil-v', etter: false });
    await bilde(page, '#plakatBack', `${k}-plakat-tilbake`, 10);
    sjekk(!errs.length && m.prod === 0, `${k} Vekst: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }

  // ── Konto: Support/Vilkår/Personvern · Ideer og ønsker (lukket/åpen) · SMS-logg (lukket/åpen) · demo-banneret (tvunget) ──
  { const { ctx, page, errs, m } = await ny(bredde);
    await fane(page, 'abonnement');
    for (const [sel, navn] of [['#kontoHjelp a.kt-lenke[href="/no/support.html"]', 'Support'], ['#kontoHjelp a.kt-lenke[href="/no/vilkar.html"]', 'Vilkår']])
      await sjekkEl(page, sel, `${k} Konto ${navn}`, { form: 'chevron', tekst: false });
    await bilde(page, '#kontoHjelp', `${k}-konto-hjelp-lukket`, 6);
    await page.click('#kontoHjelp .kt-ide > summary').catch(() => {}); await page.waitForTimeout(300);
    const aapen = await page.$eval('#kontoHjelp .kt-ide > summary .kt-pil', e => getComputedStyle(e).transform);
    sjekk(/matrix\(6\.1\d*e-17, 1, -1, 6\.1\d*e-17|matrix\(0, 1, -1, 0/.test(aapen), `${k} Ideer og ønsker åpen: chevron peker ned`, aapen);
    await bilde(page, '#kontoHjelp .kt-ide', `${k}-konto-ideer-aapen`, 6);
    await sjekkEl(page, '#kontoSmsLogg .acc-chev', `${k} SMS-logg (lukket)`, { form: 'chevron', ned: true, tekst: false });
    await bilde(page, '#kontoSmsLogg', `${k}-konto-sms-logg`, 6);
    await page.evaluate(() => document.getElementById('demoBanner').classList.add('show'));   // tvunget
    await sjekkEl(page, '#demoBanner a', `${k} demo-banneret (tvunget)`, { form: 'pil-h', etter: true });
    await bilde(page, '#demoBanner', `${k}-demo-banner`, 0);
    sjekk(!errs.length && m.prod === 0, `${k} Konto: JS-feil / prod`, errs.join('; '));
    await ctx.close(); }

  // ── kom-i-gang: Tilbake (nav) · Neste (steg 1) ──
  { const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    let prod = 0; await page.route(u => /trybarberhq\.com$/.test(new URL(u).hostname) || new URL(u).pathname.startsWith('/api/'), r => { prod++; return r.abort(); });
    await page.goto(BASE + 'kom-i-gang.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await sjekkEl(page, '.nav-wrap a.m-ikon', `${k} kom-i-gang Tilbake`, { form: 'pil-v', etter: false });
    await sjekkEl(page, 'button.ob-submit[onclick="submitOb()"]', `${k} kom-i-gang Neste`, { form: 'pil-h', etter: true });
    await bilde(page, '.nav-wrap', `${k}-kom-i-gang-tilbake`, 6);
    await bilde(page, 'button.ob-submit[onclick="submitOb()"]', `${k}-kom-i-gang-neste`, 10);
    sjekk(!errs.length && prod === 0, `${k} kom-i-gang: JS-feil / request ut (${prod})`, errs.join('; '));
    await ctx.close(); }
}
await browser.close(); server.close();
console.log(feil.length ? `\n${feil.length} AVVIK:\n  ✗ ` + feil.join('\n  ✗ ') : '\nOK ✓ — alle sjekker grønne');
console.log('Skjermbilder:', OUT);
if (feil.length) process.exitCode = 1;
