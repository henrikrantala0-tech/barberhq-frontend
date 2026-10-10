// tools/render/bildevarsel.mjs — ett felles bildevarsel i «Din side» (no/dashboard.html), drevet av
// backendens bildekrav/bilde_status (GET /design + svarene fra POST/DELETE /images).
//
// Mocken spiller backend etter kontrakten: BILDEKRAV er backendens tabell, og bilde_status regnes HER
// (i «backend») av bildene i mock-DB-en — dashbordet skal bare lese den. Bildene er stateful, så en
// DELETE endrer status og svaret bærer den nye. Alt /api/** mockes; ingenting når prod.
//
// Dekker: varsel/tekst per layout ved 'mangler' (i Design OG øverst i Bilder), ingen varsel ved 'ok',
// reservelinje ved 'reserve', «Legg til bilde» → riktig felt, sletting uten bekreftelse (også siste
// bilde) med varselet rett etter fra DELETE-svaret, hjelpetekst fra felt+maks, og gammel backend
// (uten feltene) → ingen varsler.
//
//   node tools/render/bildevarsel.mjs
//
// Skjermbilder → .render-ut/bildevarsel/<layout>-<tilstand>-<bredde>.png (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/bildevarsel');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

// ── «Backend» ────────────────────────────────────────────────────────────────
const BILDEKRAV = {
  profil:   { felt: ['portrett', 'galleri'], baerer: 'portrett', reserve: null,      maks: { portrett: 1, galleri: 10 } },
  showcase: { felt: ['galleri'],             baerer: 'galleri',  reserve: null,      maks: { galleri: 10 } },
  hero:     { felt: ['hero'],                baerer: 'hero',     reserve: 'galleri', maks: { hero: 1 } },
  direkte:  { felt: [],                      baerer: null,       reserve: null,      maks: {} },
};
function bildeStatus(imgs) {
  const har = f => !!f && imgs.some(i => i.slot === f);
  const ut = {};
  for (const [l, k] of Object.entries(BILDEKRAV)) ut[l] = !k.baerer ? null : har(k.baerer) ? null : har(k.reserve) ? 'reserve' : 'mangler';
  return ut;
}
const BILDE_URL = ['/no/images/layout-showcase.webp', '/no/images/layout-profil.webp', '/no/images/layout-hero.webp'];
const img = (id, slot, n = 0) => ({ id, slot, url: BILDE_URL[n % 3], sort_order: n });

const PROFILE = { slug: 'grand-barber', email: 'grand@barber.no', hasPassword: true, name: 'Henrik', shop: 'Grand Barber',
  address: 'Storgata 1', tagline: 'Fades', bio: 'Presisjon.', booking_horizon_days: 28 };
const BILLING = { subscription_status: null, page_status: 'live', trial_start_at: null, trial_days_left: null,
  needs_attention: false, attention_grunn: null, plan: null, effective_plan: 'basis', effective_plan_grunn: 'gratis',
  cancel_at_period_end: false, current_period_end: null, trial_ends_at: null };
const PREVIEW_HTML = '<!DOCTYPE html><html><body style="margin:0;background:#111;color:#eee;font:14px system-ui;padding:16px"><h1>Grand Barber</h1></body></html>';

function lagRouter(state) {
  return route => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
    const kontrakt = () => state.gammel ? {} : { bildekrav: BILDEKRAV, bilde_status: bildeStatus(state.imgs) };
    if (p === '/api/dashboard/profile') return json(PROFILE);
    if (p === '/api/dashboard/design' && m === 'GET') return json({ palette: 'minimal', font: 'fraunces', layout: state.layout, mode: 'mork', ...kontrakt() });
    if (p === '/api/dashboard/images' && m === 'GET') return json(state.imgs);
    const del = p.match(/^\/api\/dashboard\/images\/(\d+)$/);
    if (del && m === 'DELETE') { state.slettet.push(Number(del[1])); state.imgs = state.imgs.filter(i => i.id !== Number(del[1])); return json({ ok: true, ...kontrakt() }); }
    if (p === '/api/dashboard/billing/status') return json(BILLING);
    if (p === '/api/dashboard/preview') return route.fulfill({ status: 200, contentType: 'text/html', body: PREVIEW_HTML });
    if (m !== 'GET') state.skriv.push(m + ' ' + p);
    const liste = /images|bookings|recent|services|hours|stats|attribution|winback|referrals|rebooking|sms-logg/.test(p);
    return json(liste ? [] : {});
  };
}

const browser = await chromium.launch();
let feil = 0;
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };
const TEKST = {
  showcase: 'Showcase viser galleriet ditt. Legg til minst ett bilde, eller velg Direkte.',
  hero: 'Hero viser et stort forsidebilde. Legg til et bilde, eller velg Direkte.',
  profil: 'Profil viser portrettet ditt. Legg til et portrett, eller velg en annen layout.',
};
const HINT = { hero: 'Hero: ett forsidebilde', profil: 'Profil: ett portrett + opptil 10 i galleriet',
  showcase: 'Showcase: opptil 10 bilder i galleriet', direkte: 'Direkte: ingen bilder på siden' };
const RESERVE = 'Siden bruker ditt første galleribilde.';

async function aapne(state, w) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => { errs.push('dialog: ' + d.message()); d.dismiss(); });
  // CONFIG.API_BASE er https://api.trybarberhq.com: ALT dit fanges her og besvares lokalt — /api/** av
  // mock-backend, bilde-URL-ene (API_BASE + /no/images/…) fra site/ på disk. Ingenting sendes ut.
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.hostname === 'localhost' && !u.pathname.startsWith('/api/')) return r.continue();
    if (u.pathname.startsWith('/api/') && (u.hostname === 'localhost' || u.hostname === 'api.trybarberhq.com')) return lagRouter(state)(r);
    if (u.hostname === 'api.trybarberhq.com') return r.fulfill({ path: path.join(ROOT, decodeURIComponent(u.pathname)) });
    if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$/.test(u.hostname)) return r.continue();
    state.prod++; return r.abort(); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#dinside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await aapneAkk(page, 'accDesign');   // varselet bor i Design («Din side» har ett åpent trekkspill om gangen)
  return { page, errs };
}
async function aapneAkk(page, id) {
  const apen = await page.evaluate(i => { const b = document.querySelector('#' + i + ' > .acc-body'); return b && !b.hidden; }, id);
  if (!apen) await page.click(`#${id} > .acc-head`);
  await page.waitForTimeout(300);
}
const les = page => page.evaluate(() => {
  const vis = el => { if (!el || el.closest('[hidden]')) return false; const r = el.getBoundingClientRect();
    return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0; };
  return {
    varsel: vis(document.querySelector('#layoutBildeVarsel')),
    tekst: (document.querySelector('#layoutBildeVarselTekst') || {}).textContent || '',
    hint: (document.querySelector('#layoutHint') || {}).textContent || '',
    felt: [...document.querySelectorAll('#bilderMount .slot-section .slot-box')].map(b => b.dataset.slot).filter((v, i, a) => a.indexOf(v) === i),
    reserve: [...document.querySelectorAll('#bilderMount .slot-reserve')].map(e => ({ t: e.textContent, i: e.closest('.slot-section').querySelector('.slot-box')?.dataset.slot })),
    direkteMsg: !!document.querySelector('#bilderMount .slot-direkte-msg'),
    // Varselet øverst i Bilder: «satt» = ikke [hidden] (trekkspillet kan være lukket), «synlig» = på skjermen.
    bSatt: !(document.querySelector('#bilderVarsel') || { hidden: true }).hidden,
    bSynlig: vis(document.querySelector('#bilderVarsel')),
    bTekst: (document.querySelector('#bilderVarselTekst') || {}).textContent || '',
    slettebekreftelse: !!document.querySelector('#bildeDelWarn,#showcaseDelWarn,.sg-danger'),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
async function bilde(page, navn) {
  const w = page.viewportSize().width;
  await aapneAkk(page, 'accDesign');
  const d = await page.evaluate(() => {
    const top = document.querySelector('#layoutGrid').previousElementSibling.getBoundingClientRect().top + scrollY - 8;
    const v = document.querySelector('#layoutBildeVarsel');
    const bunn = ((v && !v.hidden) ? v : document.querySelector('#layoutGrid')).getBoundingClientRect().bottom + scrollY + 12;
    return { top, bunn };
  });
  const a = await page.screenshot({ clip: { x: 0, y: d.top, width: w, height: d.bunn - d.top }, fullPage: true });
  await aapneAkk(page, 'accBilder');
  const r = await page.evaluate(() => { const e = document.querySelector('#accBilder').getBoundingClientRect(); return { top: e.top + scrollY - 8, h: e.height + 16 }; });
  const b = await page.screenshot({ clip: { x: 0, y: r.top, width: w, height: r.h }, fullPage: true });
  const ark = await browser.newPage({ viewport: { width: w, height: 400 }, deviceScaleFactor: 2 });
  await ark.setContent(`<body style="margin:0;background:#666;font:600 11px system-ui;color:#fff">
    <div style="padding:3px 6px">DESIGN → LAYOUT</div><img style="display:block;width:${w}px" src="data:image/png;base64,${a.toString('base64')}">
    <div style="padding:3px 6px">BILDER</div><img style="display:block;width:${w}px" src="data:image/png;base64,${b.toString('base64')}"></body>`);
  await ark.screenshot({ path: path.join(OUT, navn + '.png'), fullPage: true }); await ark.close();
  await aapneAkk(page, 'accDesign');
}

const TILSTANDER = [
  { layout: 'profil',   tilstand: 'mangler', imgs: [img(1, 'galleri', 0), img(2, 'galleri', 1)], status: 'mangler' },
  { layout: 'profil',   tilstand: 'ok',      imgs: [img(1, 'portrett', 1), img(2, 'galleri', 0), img(3, 'galleri', 2)], status: null },
  { layout: 'showcase', tilstand: 'mangler', imgs: [], status: 'mangler' },
  { layout: 'showcase', tilstand: 'ok',      imgs: [img(1, 'galleri', 0), img(2, 'galleri', 1), img(3, 'galleri', 2)], status: null },
  { layout: 'hero',     tilstand: 'mangler', imgs: [], status: 'mangler' },
  { layout: 'hero',     tilstand: 'reserve', imgs: [img(1, 'galleri', 0), img(2, 'galleri', 1)], status: 'reserve' },
  { layout: 'hero',     tilstand: 'ok',      imgs: [img(1, 'hero', 2)], status: null },
  { layout: 'direkte',  tilstand: 'ok',      imgs: [img(1, 'galleri', 0)], status: null },
];
const BAERER = { profil: 'portrett', showcase: 'galleri', hero: 'hero' };
const prodTotalt = { n: 0 }; const skrivTotalt = [];
for (const w of [320, 375]) {
  for (const t of TILSTANDER) {
    const state = { layout: t.layout, imgs: t.imgs.map(i => ({ ...i })), slettet: [], skriv: [], prod: 0, gammel: false };
    const { page, errs } = await aapne(state, w);
    const m = await les(page);
    const id = `${w} ${t.layout}/${t.tilstand}`;
    const vilVarsel = t.status === 'mangler';
    sjekk(m.varsel === vilVarsel && m.tekst === (vilVarsel ? TEKST[t.layout] : ''), `${id}: varsel ${m.varsel ? '«' + m.tekst + '»' : 'skjult'}`);
    sjekk(m.bSatt === vilVarsel && m.bTekst === (vilVarsel ? TEKST[t.layout] : ''), `${id}: samme varsel øverst i Bilder (${m.bSatt ? '«' + m.bTekst + '»' : 'skjult'})`);
    sjekk(!m.slettebekreftelse, `${id}: ingen slettebekreftelse i DOM-en`);
    sjekk(m.hint === HINT[t.layout], `${id}: hjelpetekst «${m.hint}»`);
    const forventFelt = BILDEKRAV[t.layout].felt.join(',');
    sjekk(t.layout === 'direkte' ? m.direkteMsg && !m.felt.length : m.felt.join(',') === forventFelt, `${id}: felt [${m.felt.join(',')}]${m.direkteMsg ? ' (direkte-melding)' : ''}`);
    const vilReserve = t.status === 'reserve';
    sjekk(vilReserve ? (m.reserve.length === 1 && m.reserve[0].t === RESERVE && m.reserve[0].i === 'hero') : m.reserve.length === 0,
      `${id}: reservelinje ${JSON.stringify(m.reserve)}`);
    sjekk(m.overflow === 0, `${id}: overflow ${m.overflow}`);
    await page.mouse.move(0, 0);
    await bilde(page, `${t.layout}-${t.tilstand}-${w}`);
    if (vilVarsel) {
      // «Legg til bilde» → Bilder-trekkspillet åpent, fokus på layoutens bærende (tomme) felt.
      await aapneAkk(page, 'accDesign');   // Bilder er lukket nå (ett åpent om gangen) — knappen skal åpne det
      await page.click('#layoutBildeVarselAdd'); await page.waitForTimeout(700);
      const fokus = await page.evaluate(() => ({ slot: document.activeElement?.dataset?.slot, tom: !document.activeElement?.classList.contains('filled'),
        apen: !document.querySelector('#accBilder > .acc-body').hidden }));
      sjekk(fokus.apen && fokus.slot === BAERER[t.layout] && fokus.tom, `${id}: «Legg til bilde» → ${JSON.stringify(fokus)}`);
    }
    sjekk(errs.length === 0, `${id}: JS-feil ${errs.join(' | ')}`);
    prodTotalt.n += state.prod; skrivTotalt.push(...state.skriv);
    await page.close();
  }

  // ── Sletting: alltid med en gang. Varselet kommer etterpå av bilde_status i DELETE-svaret ──
  const SLETT = [
    { navn: 'showcase siste galleribilde', layout: 'showcase', imgs: [img(1, 'galleri', 0)], id: 1, mangler: true },
    { navn: 'showcase ett av to',          layout: 'showcase', imgs: [img(1, 'galleri', 0), img(2, 'galleri', 1)], id: 1, mangler: false },
    { navn: 'profil portrett',             layout: 'profil',   imgs: [img(1, 'portrett', 1), img(2, 'galleri', 0)], id: 1, mangler: true },
    { navn: 'profil galleribilde',         layout: 'profil',   imgs: [img(1, 'portrett', 1), img(2, 'galleri', 0)], id: 2, mangler: false },
    { navn: 'hero uten galleri',           layout: 'hero',     imgs: [img(1, 'hero', 2)], id: 1, mangler: true },
    { navn: 'hero med galleri (→ reserve)', layout: 'hero',    imgs: [img(1, 'hero', 2), img(2, 'galleri', 0)], id: 1, mangler: false },
  ];
  for (const s of SLETT) {
    const state = { layout: s.layout, imgs: s.imgs.map(i => ({ ...i })), slettet: [], skriv: [], prod: 0, gammel: false };
    const { page, errs } = await aapne(state, w);
    await aapneAkk(page, 'accBilder');
    const foer = await les(page);
    sjekk(!foer.bSatt, `${w} slett ${s.navn}: intet varsel før slettingen`);
    await page.click(`#bilderMount .slot-menu-btn[data-id="${s.id}"]`); await page.waitForTimeout(250);
    await page.click('#slotPopupFjern'); await page.waitForTimeout(900);
    const m = await les(page);
    const id = `${w} slett ${s.navn}`;
    sjekk(state.slettet.length === 1 && state.slettet[0] === s.id, `${id}: slettet med en gang, uten bekreftelse (DELETE ${state.slettet})`);
    if (s.mangler) {
      sjekk(m.bSynlig && m.bTekst === TEKST[s.layout], `${id}: varselet vises øverst i Bilder rett etter: «${m.bTekst}»`);
      sjekk(m.varsel === false && m.tekst === TEKST[s.layout], `${id}: samme varsel satt i Design (lukket trekkspill)`);
      await page.mouse.move(0, 0);
      const r = await page.evaluate(() => { const e = document.querySelector('#accBilder').getBoundingClientRect(); return { y: e.top + scrollY - 8, h: e.height + 16 }; });
      await page.screenshot({ clip: { x: 0, y: r.y, width: w, height: r.h }, fullPage: true, path: path.join(OUT, `slett-${s.layout}-etter-${w}.png`) });
      await page.click('#bilderVarselAdd'); await page.waitForTimeout(700);
      const fokus = await page.evaluate(() => ({ slot: document.activeElement?.dataset?.slot, tom: !document.activeElement?.classList.contains('filled') }));
      sjekk(fokus.slot === BAERER[s.layout] && fokus.tom, `${id}: «Legg til bilde» i Bilder → ${JSON.stringify(fokus)}`);
    } else {
      sjekk(!m.bSatt && !m.tekst, `${id}: intet varsel etter slettingen`);
      if (s.layout === 'hero') sjekk(m.reserve.length === 1 && m.reserve[0].t === RESERVE, `${id}: DELETE-svaret satte 'reserve' → reservelinje vises`);
    }
    sjekk(errs.length === 0, `${id}: JS-feil ${errs.join(' | ')}`);
    prodTotalt.n += state.prod; skrivTotalt.push(...state.skriv);
    await page.close();
  }

  // ── Gammel backend: ingen bildekrav/bilde_status → ingen varsler (heller ikke ved sletting) ──
  {
    const state = { layout: 'showcase', imgs: [img(1, 'galleri', 0)], slettet: [], skriv: [], prod: 0, gammel: true };
    const { page, errs } = await aapne(state, w);
    const m = await les(page);
    sjekk(!m.varsel && !m.bSatt && m.hint === '' && m.felt.length === 0, `${w} gammel backend: varsel ${m.varsel}, hint «${m.hint}», felt [${m.felt}]`);
    sjekk(errs.length === 0, `${w} gammel backend: JS-feil ${errs.join(' | ')}`);
    await page.close();
  }
}
sjekk(prodTotalt.n === 0, `requests utenfor localhost (prod/annet): ${prodTotalt.n}`);
sjekk(skrivTotalt.length === 0, `uventede skrivende kall: ${skrivTotalt.join(', ') || 0}`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
