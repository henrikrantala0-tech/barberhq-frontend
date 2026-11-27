// tools/render/konto-vekst.mjs — Konto «Abonnement» med Vekst-kortet (27.11.2026) + «Hentet inn» borte fra Oversikt/Vekst.
//
//   node tools/render/konto-vekst.mjs
//
// a) Gratis: plan-linja «Du er på Gratis · 0 kr/mnd», ingen statuskort / lenkeboks; salgskortet (VEKST, «Det som fyller
//    stolen.», 179 kr, sammenligning Nå | Vekst, «Oppgrader til Vekst» = POST /billing/checkout {plan:'vekst'}, «Ingen binding»,
//    SMS-vilkår), svever (abSveve 6 s) — reduced-motion: stille med glød. ROI-linja: ceil(223,75 / billigste pris) → én/to/tre
//    kunder; > 3 eller ingen pris → skjult.
// b) Vekst aktiv med tall: «Hentet inn i <måned>», grønn total, rader (kr / «Slå på» / «På»), bunnlinja, grønn ramme, ingen animasjon;
//    «Slå på» → Vekst-fanen med trekkspillet åpent. Lojalitetsprogram av.
// c) Vekst aktiv uten tall: måned 0 + 12 mnd 0 → «Tallene kommer …»; måned 0 + 12 mnd > 0 → «0 kr».
// d) Bunnen av Oversikt og Vekst: ingen «Hentet inn av BarberHQ», ingen «Se Vekst».
// e) Øvrige tilstander i ny stil: prøveperiode, betaling feilet, oppsagt ut perioden, Vekst i Stripe-prøve («Første trekk»), reserve.
// f) Låse-merket på Vekst-fanen (Gratis) → Konto, Vekst-kortet i synsfeltet; trykkflate ≥ 44×44.
// Alt /api/** mockes; ingen request når prod; ingen JS-feil. Skjermbilder → .render-ut/konto-vekst/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { gratis, prove, vekst, pastDue, billing } from './fixtures/billing.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT = path.resolve(import.meta.dirname, '../../.render-ut/konto-vekst');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/dashboard.html`;
const browser = await chromium.launch();
const feil = []; const sjekk = (ok, hva, d = '') => { if (!ok) feil.push(hva + (d ? ' — ' + d : '')); return ok; };
const dager = n => new Date(Date.now() + n * 864e5).toISOString();
const MND = new Date().toLocaleDateString('nb-NO', { month: 'long', timeZone: 'Europe/Oslo' });
const PROFIL = { slug: 'grand-barber', email: 'g@b.no', hasPassword: true, name: 'Henrik', shop: 'Grand Barber', address: '', booking_horizon_days: 28 };
const arm = (count, revenue) => ({ count, revenue });
const HENTET = (maaned, aar) => ({ maaned, aar });
const MED_TALL = { total: arm(9, 4250), rebooking: { ...arm(4, 1800), aktivert: true }, vinnTilbake: arm(3, 1350), vervet: arm(2, 1100) };
const NULL = { total: arm(0, 0), rebooking: { ...arm(0, 0), aktivert: true }, vinnTilbake: arm(0, 0), vervet: arm(0, 0) };

// Mock: billing, tjenester (ROI), attribution (maaned / siste_12mnd), loyalty. logg teller kall per sti.
async function ny(bredde, { b, tjenester = { hoved: [{ name: 'Klipp', price: 450, min: 30 }], tillegg: [] }, hentet = HENTET(MED_TALL, MED_TALL),
  loyalty = { enabled: false }, tema = 'dark', redusert = false, hash = '#konto' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2, reducedMotion: redusert ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (_) {} }, tema);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const logg = { kall: [], prod: 0 };
  await page.route(u => /trybarberhq\.com$/.test(new URL(u).hostname), r => { logg.prod++; return r.abort(); });
  await page.route('**/api/**', route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    logg.kall.push(req.method() + ' ' + p + u.search);
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/dashboard/profile') return json(PROFIL);
    if (p === '/api/dashboard/billing/status') return json(b);
    if (p === '/api/dashboard/services') return json(tjenester);
    if (p === '/api/dashboard/attribution') { const per = u.searchParams.get('period');
      const hi = per === 'maaned' ? hentet.maaned : per === 'siste_12mnd' ? hentet.aar : MED_TALL;
      return hi === null ? json({ error: 'x' }, 500) : json({ paaVei: {}, ...(b.effective_plan === 'vekst' ? { hentetInn: hi } : {}) }); }
    if (p === '/api/dashboard/loyalty') return json({ ...loyalty, threshold: 10, pct: 100, participants: [], eligible: [], totals: {} });
    if (p === '/api/dashboard/billing/checkout') return json({ url: `http://localhost:${server.address().port}/__stripe-mock` });
    if (p === '/api/dashboard/settings') return json({ sms_paaminnelse_enabled: true, sms_rebooking_enabled: true, payment_methods: [] });
    return json(/images|bookings|recent|services|hours|stats|winback|referrals|rebooking|sms-logg|momentum|date-overrides/.test(p) ? [] : {});
  });
  await page.goto(URL_ + hash, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  return { ctx, page, errs, logg };
}
const tilKonto = async page => { await page.evaluate(() => switchPanel('abonnement')); await page.waitForTimeout(800); };
async function bilde(page, sel, fil, luft = 16) {
  await page.mouse.move(1, 1);
  const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); const b = e.getBoundingClientRect(); return { y: b.top + scrollY, h: b.height }; }, sel);
  if (!r) return; await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, fil + '.png'), fullPage: true, clip: { x: 0, y: Math.max(0, r.y - luft), width: page.viewportSize().width, height: r.h + 2 * luft } });
}
const SEKSJON = '#kontoAbonnement';

for (const bredde of [320, 375, 1280]) {
  const k = String(bredde);
  // ── a) Gratis: med ROI (450 kr → «én kunde»), to kunder (150 kr), uten (50 kr → n = 5; ingen pris) ──
  for (const [navn, tj, forvent] of [['roi-en', 450, 'én kunde'], ['roi-to', 150, 'to kunder'], ['uten-roi', 50, null], ['uten-pris', 0, null]]) {
    if (bredde !== 375 && !['roi-en', 'uten-roi'].includes(navn)) continue;
    const { ctx, page, errs, logg } = await ny(bredde, { b: gratis(), tjenester: { hoved: tj ? [{ name: 'Klipp', price: tj, min: 30 }, { name: 'Skinfade', price: 600, min: 45 }] : [{ name: 'Klipp', price: 0, min: 30 }], tillegg: [] } });
    await tilKonto(page);
    const m = await page.evaluate(() => {
      const v = e => e && e.checkVisibility(), q = s => document.querySelector(s), cs = s => getComputedStyle(q(s));
      const kort = q('#kontoVekst');
      return { plan: v(q('#abPlan')) && q('#abPlan').textContent, planStil: [cs('#abPlan').fontSize, cs('#abPlan').color].join(' '),
        statusKort: v(q('#abKort')), lenke: !!q('#pubLink'), kort: v(kort),
        et: q('.ab-salg-et').textContent, etStil: [cs('.ab-salg-et').fontSize, cs('.ab-salg-et').fontWeight, cs('.ab-salg-et').letterSpacing, cs('.ab-salg-et').textTransform].join(' '),
        h: q('.ab-salg-h').textContent, pris: q('.ab-salg-pris').textContent, prisStil: cs('.ab-salg-pris b').fontSize + ' ' + cs('.ab-salg-pris b').fontWeight,
        roi: v(q('#abRoi')) ? q('#abRoi').textContent : null, roiIkon: (q('#abRoi use') || {}).getAttribute && q('#abRoi use').getAttribute('href'),
        rader: [...document.querySelectorAll('.ab-tr:not(.ab-th)')].map(r => [...r.children].map(c => c.querySelector('use') ? c.querySelector('use').getAttribute('href').split('#')[1] + ':' + getComputedStyle(c.querySelector('svg')).color : c.textContent.trim())),
        hode: [...q('.ab-th').children].map(c => c.textContent.trim()).join('|'),
        knapp: q('#kontoOppBtn').textContent, knappStil: [cs('#kontoOppBtn').fontSize, cs('#kontoOppBtn').fontWeight, cs('#kontoOppBtn').borderRadius, cs('#kontoOppBtn').color].join(' '),
        knappBredde: Math.abs(q('#kontoOppBtn').getBoundingClientRect().width - (kort.clientWidth - parseFloat(cs('#kontoVekst').paddingLeft) - parseFloat(cs('#kontoVekst').paddingRight))) < 1,
        binding: q('.ab-binding').textContent, fin: q('.ab-salg-fin').textContent,
        anim: cs('#kontoVekst').animationName + ' ' + cs('#kontoVekst').animationDuration + ' ' + cs('#kontoVekst').animationIterationCount };
    });
    sjekk(m.plan === 'Du er på Gratis · 0 kr/mnd' && /^12\.5px /.test(m.planStil), `${k} Gratis (${navn}): plan-linja`, JSON.stringify([m.plan, m.planStil]));
    sjekk(!m.statusKort && !m.lenke, `${k} Gratis: ingen statuskort, ingen lenkeboks`);
    sjekk(m.kort && m.et === 'Vekst' && m.etStil === '11px 700 0.88px uppercase' && m.h === 'Det som fyller stolen.' && m.pris.replace(/\s+/g, ' ') === '179 kr/mnd eks. mva' && m.prisStil === '34px 800',
      `${k} Gratis: salgskortets topp`, JSON.stringify(m));
    sjekk(forvent ? m.roi === `Får du tilbake ${forvent} i måneden, har Vekst betalt seg.` && m.roiIkon === 'ikoner.svg#trend' : m.roi === null, `${k} Gratis (${navn}): ROI-linja`, String(m.roi));
    sjekk(m.hode === 'Funksjon|Nå|Vekst' && JSON.stringify(m.rader.map(r => r[0])) === JSON.stringify(['Bookingside og kalender', 'SMS-påminnelser', 'Rebooking', 'Vinn tilbake', 'Verving', 'Lojalitetsprogram', 'Hvor kundene kommer fra'])
      && m.rader[1][1] === 'Pakke' && m.rader[1][2] === '100 inkl.' && m.rader.slice(2).every(r => r[1] === '–' && /^hake:rgb\(62, 207, 126\)/.test(r[2])) && /^hake:/.test(m.rader[0][1]),
      `${k} Gratis: sammenligningen`, JSON.stringify(m.rader));
    // Tabellen (Henrik 27.11.2026): rader 14 px, NÅ/VEKST 11 px, kolonnene 40 / 64 px; ingen rad brytes på 375 (320: padding 16, brekk tillatt).
    const tab = await page.evaluate(() => {
      const rader = [...document.querySelectorAll('#kontoVekst .ab-tr:not(.ab-th)')], th = document.querySelectorAll('#kontoVekst .ab-th > span');
      const lh = parseFloat(getComputedStyle(rader[0]).lineHeight);
      return { rad: getComputedStyle(rader[0]).fontSize, hode: getComputedStyle(th[1]).fontSize + '/' + getComputedStyle(th[2]).fontSize,
        kol: getComputedStyle(rader[0]).gridTemplateColumns.split(' ').slice(1).join(' '), pad: getComputedStyle(document.getElementById('kontoVekst')).paddingLeft,
        brutt: rader.filter(r => r.firstElementChild.getBoundingClientRect().height > lh * 1.5).map(r => r.firstElementChild.textContent) }; });
    sjekk(tab.rad === '14px' && tab.hode === '11px/11px' && tab.kol === '40px 64px', `${k} Gratis: tabell 14/11 px, kolonner 40/64`, JSON.stringify(tab));
    sjekk(bredde === 320 ? tab.pad === '16px' : (tab.brutt.length === 0 && tab.pad === '20px'), `${k} Gratis: ${bredde === 320 ? 'padding 16 px' : 'ingen rad brytes'}`, JSON.stringify(tab));
    if (bredde === 320) console.log(`  (320: rader som brytes: ${tab.brutt.length ? tab.brutt.join(', ') : 'ingen'})`);
    sjekk(m.knapp === 'Oppgrader til Vekst' && m.knappStil === '15px 700 12px rgb(255, 255, 255)' && m.knappBredde, `${k} Gratis: knappen`, m.knappStil);
    sjekk(m.binding === 'Ingen binding. Si opp når du vil.' && m.fin === 'Etter 100 SMS: 1,21 kr per SMS på neste faktura. Maks 400 kr i måneden.', `${k} Gratis: binding + SMS-vilkår`);
    sjekk(m.anim === 'abSveve 6s infinite', `${k} Gratis: kortet svever`, m.anim);
    await bilde(page, SEKSJON, `${k}-a-gratis-${navn}`);
    if (navn === 'roi-en' && bredde === 375) {   // «Oppgrader til Vekst» gjør det samme som før: POST /billing/checkout {plan:'vekst'}
      const post = page.waitForRequest(r => r.url().includes('/api/dashboard/billing/checkout'));
      await page.$eval('#kontoOppBtn', b => b.click()); const r = await post;   // kortet svever → aldri «stabilt» for page.click
      sjekk(JSON.parse(r.postData() || '{}').plan === 'vekst', `${k} Gratis: Oppgrader → checkout {plan:'vekst'}`);
    }
    sjekk(!errs.length && logg.prod === 0, `${k} Gratis (${navn}): JS-feil / prod`, errs.join('; '));
    await ctx.close();
  }
  // reduced-motion: stille, med gløden
  if (bredde === 375) { const { ctx, page } = await ny(bredde, { b: gratis(), redusert: true }); await tilKonto(page);
    const r = await page.$eval('#kontoVekst', e => [getComputedStyle(e).animationName, getComputedStyle(e).boxShadow]);
    sjekk(r[0] === 'none' && /rgba\(77, 139, 255, 0\.55\)/.test(r[1]), `${k} reduced-motion: stille med glød`, JSON.stringify(r)); await ctx.close(); }

  // ── b) Vekst aktiv med tall, Lojalitetsprogram av; «Slå på» → Vekst-fanen ──
  { const { ctx, page, errs, logg } = await ny(bredde, { b: vekst(), loyalty: { enabled: false } });
    await tilKonto(page); await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const q = s => document.querySelector(s), cs = s => getComputedStyle(q(s));
      return { salg: q('#kontoVekst').checkVisibility(), plan: q('#abPlan').checkVisibility(), status: q('#kontoStatus').textContent.trim(), l: q('#abHentetL').textContent,
        sum: q('#abHentetSum').checkVisibility() && q('#abHentetSum').textContent, sumStil: [cs('#abHentetSum').fontSize, cs('#abHentetSum').fontWeight, cs('#abHentetSum').color].join(' '),
        rader: [...document.querySelectorAll('#abRader .ab-rad')].map(r => r.innerText.replace(/\s+/g, ' ').trim()),
        bunn: q('#abBunn').textContent.replace(/\s/g, ' '), fin: q('#kontoFin').checkVisibility() && q('#kontoFin').textContent, manage: q('#manageSub').checkVisibility(),
        ramme: cs('#abKort').boxShadow, anim: cs('#abKort').animationName, lenke: !!q('#pubLink') }; });
    sjekk(!m.salg && !m.plan && m.status === '● Vekst er aktivt' && m.l === `Hentet inn i ${MND}`, `${k} Vekst: status + «Hentet inn i ${MND}»`, JSON.stringify(m));
    sjekk(m.sum && m.sum.replace(/\s/g, ' ') === '4 250 kr' && m.sumStil === '32px 800 rgb(62, 207, 126)', `${k} Vekst: total i stor grønn`, JSON.stringify([m.sum, m.sumStil]));
    sjekk(JSON.stringify(m.rader.map(r => r.replace(/ /g, ' '))) === JSON.stringify(['Rebooking 1 800 kr', 'Vinn tilbake 1 350 kr', 'Verving 1 100 kr', 'Lojalitetsprogram Slå på']), `${k} Vekst: rader`, JSON.stringify(m.rader));
    sjekk(m.bunn === '179 kr/mnd eks. mva · 100 SMS inkludert' && /Etter 100 SMS/.test(m.fin || '') && m.manage, `${k} Vekst: bunnlinja + vilkår + Administrer`, JSON.stringify([m.bunn, m.fin, m.manage]));
    sjekk(/rgba\(62, 207, 126, 0\.35\)/.test(m.ramme) && m.anim === 'none' && !m.lenke, `${k} Vekst: grønn ramme, ingen animasjon, ingen lenkeboks`, m.ramme);
    sjekk(logg.kall.some(x => /attribution\?period=maaned/.test(x)) && !logg.kall.some(x => /siste_12mnd/.test(x)), `${k} Vekst: henter period=maaned (ikke 12 mnd når måneden har tall)`);
    await bilde(page, SEKSJON, `${k}-b-vekst-med-tall-lojalitet-av`);
    if (bredde === 375) {
      await page.click('#abRader [data-ab-til="#accLoyal"]'); await page.waitForTimeout(900);
      const r = await page.evaluate(() => ({ panel: aktivtPanel(), aapen: document.querySelector('#accLoyal .acc-head').getAttribute('aria-expanded') }));
      sjekk(r.panel === 'vekst' && r.aapen === 'true', `${k} Vekst: «Slå på» → Lojalitetsprogram i Vekst-fanen`, JSON.stringify(r));
    }
    sjekk(!errs.length && logg.prod === 0, `${k} Vekst: JS-feil / prod`, errs.join('; ')); await ctx.close(); }
  // Rebooking av + Lojalitet på
  if (bredde === 375) { const { ctx, page } = await ny(bredde, { b: vekst(), loyalty: { enabled: true }, hentet: HENTET({ ...MED_TALL, rebooking: { ...MED_TALL.rebooking, aktivert: false } }, MED_TALL) });
    await tilKonto(page); await page.waitForTimeout(400);
    const rader = await page.$$eval('#abRader .ab-rad', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
    sjekk(rader[0] === 'Rebooking Slå på' && rader[3] === 'Lojalitetsprogram På', `${k} Vekst: Rebooking av → «Slå på», Lojalitet på → «På»`, JSON.stringify(rader));
    await bilde(page, SEKSJON, `${k}-b-vekst-rebooking-av-lojalitet-paa`); await ctx.close(); }

  // ── c) Vekst uten tall: måned 0 + 12 mnd 0 → tekst; måned 0 + 12 mnd > 0 → 0 kr ──
  for (const [navn, aar, tom] of [['uten-tall', NULL, true], ['null-denne-mnd', MED_TALL, false]]) {
    if (bredde !== 375 && navn !== 'uten-tall') continue;
    const { ctx, page, errs, logg } = await ny(bredde, { b: vekst(), loyalty: { enabled: true }, hentet: HENTET(NULL, aar) });
    await tilKonto(page); await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({ sum: document.getElementById('abHentetSum').checkVisibility() && document.getElementById('abHentetSum').textContent,
      tom: document.getElementById('abHentetTom').checkVisibility(), rader: document.querySelectorAll('#abRader .ab-rad').length }));
    sjekk(logg.kall.some(x => /siste_12mnd/.test(x)), `${k} Vekst (${navn}): henter siste_12mnd når måneden er 0`);
    sjekk(tom ? (m.tom && !m.sum && m.rader === 4) : (!m.tom && (m.sum || '').replace(/\s/g, ' ') === '0 kr' && m.rader === 4), `${k} Vekst (${navn})`, JSON.stringify(m));
    await bilde(page, SEKSJON, `${k}-c-vekst-${navn}`);
    sjekk(!errs.length && logg.prod === 0, `${k} Vekst (${navn}): JS-feil / prod`, errs.join('; ')); await ctx.close();
  }

  // ── d) Bunnen av Oversikt og Vekst uten «Hentet inn» (Gratis og Vekst) ──
  for (const [navn, b] of [['gratis', gratis()], ['vekst', vekst()]]) {
    const { ctx, page, errs, logg } = await ny(bredde, { b, hash: '' });
    await page.evaluate(() => switchPanel('oversikt')); await page.waitForTimeout(700);
    const ov = await page.evaluate(() => ({ tekst: /Hentet inn av BarberHQ|Se Vekst|179 kr\/mnd/.test(document.getElementById('oversikt').innerText),
      dom: !!document.querySelector('#drivenBy, #drivenByWrap, #vekstHentet, #vekstHentetWrap'), siste: document.querySelector('#oversikt > section.ovs-sek:last-of-type').id }));
    sjekk(!ov.tekst && !ov.dom && ov.siste === 'ovsTall', `${k} Oversikt (${navn}): ingen Hentet inn, Nøkkeltall er siste seksjon`, JSON.stringify(ov));
    await page.evaluate(() => { const s = document.getElementById('ovsTall'); s.scrollIntoView({ block: 'end' }); }); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${k}-d-oversikt-bunn-${navn}.png`) });
    await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
    const vk = await page.evaluate(() => /Hentet inn av BarberHQ|Se Vekst/.test(document.getElementById('vekst').innerText));
    sjekk(!vk, `${k} Vekst-fanen (${navn}): ingen Hentet inn`);
    await page.evaluate(() => document.getElementById('trend').scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, `${k}-d-vekst-under-diagrammet-${navn}.png`) });
    sjekk(!logg.kall.some(x => /attribution/.test(x)), `${k} (${navn}): Oversikt/Vekst henter ikke /attribution`, logg.kall.filter(x => /attribution/.test(x)).join(' '));
    sjekk(!errs.length && logg.prod === 0, `${k} Oversikt/Vekst (${navn}): JS-feil / prod`, errs.join('; ')); await ctx.close();
  }

  // ── e) Øvrige tilstander i ny stil ──
  for (const [navn, b, forvent] of [
    ['prove', prove(), { status: '● Vekst, prøveperiode', knapp: 'Oppgrader til Vekst' }],
    ['betaling-feilet', pastDue(), { status: '● Betalingen feilet', knapp: 'Oppdater betaling' }],
    ['oppsagt', vekst({ cancel_at_period_end: true, current_period_end: '2026-12-14T10:00:00Z' }), { status: '● Vekst til 14. desember', manage: true }],
    ['stripe-prove', vekst({ subscription_status: 'trialing', trial_ends_at: '2026-12-09T10:00:00Z' }), { status: '● Vekst er aktivt', trekk: 'Første trekk 9. desember.' }],
    ['reserve', billing({ effective_plan_grunn: 'ukjent' }), { status: '● Abonnementsstatus utilgjengelig' }]]) {
    if (bredde === 1280 && navn === 'reserve') continue;
    const { ctx, page, errs, logg } = await ny(bredde, { b });
    await tilKonto(page); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const q = s => document.querySelector(s), v = s => q(s).checkVisibility();
      return { status: q('#kontoStatus').textContent.trim(), knapp: v('#kontoAksjon') ? q('#kontoAksjon').textContent : null, manage: v('#manageSub'),
        trekk: v('#abTrekk') ? q('#abTrekk').textContent : null, salg: v('#kontoVekst'), radius: getComputedStyle(q('#abKort')).borderRadius, lenke: !!q('#pubLink') }; });
    sjekk(m.status === forvent.status && (!forvent.knapp || m.knapp === forvent.knapp) && (!forvent.manage || m.manage) && (!forvent.trekk || m.trekk === forvent.trekk)
      && !m.salg && m.radius === '16px' && !m.lenke, `${k} ${navn}: melding/knapp i nytt kort`, JSON.stringify(m));
    await bilde(page, SEKSJON, `${k}-e-${navn}`);
    sjekk(!errs.length && logg.prod === 0, `${k} ${navn}: JS-feil / prod`, errs.join('; ')); await ctx.close();
  }

  // ── f) Låse-merket (Gratis, Vekst-fanen) → Konto, Vekst-kortet; trykkflate ≥ 44×44 ──
  { const { ctx, page, errs } = await ny(bredde, { b: gratis(), hash: '' });
    await page.evaluate(() => switchPanel('vekst')); await page.waitForTimeout(900);
    const flate = await page.evaluate(() => { const m = document.querySelector('#accRebook .laas-merke'); if (!m) return null;
      m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const treff = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === m || m.contains(e)); };
      return { w: r.width, h: r.height, rolle: m.getAttribute('role'), ok: treff(cx, cy - 21) && treff(cx, cy + 21) && treff(cx - Math.max(21, r.width / 2 - 1), cy) && treff(cx + Math.max(21, r.width / 2 - 1), cy) }; });
    sjekk(flate && flate.ok && flate.rolle === 'button', `${k} låse-merket: knapp med trykkflate ≥ 44×44`, JSON.stringify(flate));
    // Rekkefølgen er lik på alle fire radene: «Vekst»-merket med lås, så chevronen; chevronene står på samme x; ingen bryter.
    const rek = await page.evaluate(() => ['#accRebook', '#accWinback', '#accVerv', '#accLoyal'].map(id => {
      const a = document.querySelector(id), m = a.querySelector('.laas-merke'), c = a.querySelector('.acc-chev'), sw = a.querySelector('.acc-sw');
      const rm = m && m.getBoundingClientRect(), rc = c.getBoundingClientRect();
      return { id, foer: !!m && rm.right <= rc.left, chevH: Math.round(rc.right), bryter: !!sw && sw.checkVisibility() }; }));
    sjekk(rek.every(r => r.foer && !r.bryter) && new Set(rek.map(r => r.chevH)).size === 1, `${k} Vekst-fanen: lås før chevron på alle radene, chevronene på linje`, JSON.stringify(rek));
    if (bredde !== 1280) { await page.mouse.move(1, 1); await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });   // sticky bunn-nav ville dekket siste rad; utsnitt i dokumentkoordinater: «AUTOMATIKK» → bunnen av Lojalitetsprogram
      const u = await page.evaluate(() => { const t = document.querySelector('#accPaam').getBoundingClientRect().top + scrollY - 70, b = document.querySelector('#accLoyal').getBoundingClientRect().bottom + scrollY + 16; return { y: t, h: b - t }; });
      await page.screenshot({ path: path.join(OUT, `${k}-g-vekst-fanen-laas.png`), fullPage: true, clip: { x: 0, y: u.y, width: bredde, height: u.h } }); }
    await page.click('#accRebook .laas-merke'); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => { const v = document.getElementById('kontoVekst').getBoundingClientRect();
      return { panel: aktivtPanel(), synlig: v.top < innerHeight && v.bottom > 0, aapen: document.querySelector('#accRebook .acc-head').getAttribute('aria-expanded') }; });
    sjekk(r.panel === 'abonnement' && r.synlig, `${k} låse-merket → Konto, Vekst-kortet i synsfeltet`, JSON.stringify(r));
    sjekk(!errs.length, `${k} låse-merket: JS-feil`, errs.join('; ')); await ctx.close(); }
}
// Lys tema (375): salgskortet + Vekst-kortet
for (const [navn, b] of [['gratis', gratis()], ['vekst', vekst()]]) {
  const { ctx, page, errs } = await ny(375, { b, tema: 'light' }); await tilKonto(page); await page.waitForTimeout(400);
  await bilde(page, SEKSJON, `375-lys-${navn}`); sjekk(!errs.length, `lys ${navn}: JS-feil`, errs.join('; ')); await ctx.close();
}
await browser.close(); server.close();
console.log(feil.length ? `\n${feil.length} AVVIK:\n  ✗ ` + feil.join('\n  ✗ ') : '\nOK ✓ — alle sjekker grønne');
console.log('Skjermbilder:', OUT);
if (feil.length) process.exitCode = 1;
