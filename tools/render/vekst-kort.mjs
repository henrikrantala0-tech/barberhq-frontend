// tools/render/vekst-kort.mjs — Vekst-fanens funksjonskort (no/dashboard.html, 10.10).
//
// Dekker: ÉN bakgrunn i hele kortet — også i rader med bryter, med ekte hover (desktop) og på touch
// (der :hover blir hengende etter et trykk); forklaringslinja under SMS-boblene uten avmeldings-
// setningen; forklaringen under «Hentet inn av BarberHQ» uten «Dem lister vi for deg …»; og
// SMS-påminnelse-kortets tekst «Kunden får én SMS dagen før timen. Færre glemte avtaler.».
// Lys og mørk, 320 og 375. Alt /api/** mockes; ingenting når prod.
//
//   node tools/render/vekst-kort.mjs
//
// Skjermbilder → .render-ut/vekst-kort/ (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/vekst-kort');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const BILLING = { subscription_status: 'active', page_status: 'live', plan: 'vekst', effective_plan: 'vekst', effective_plan_grunn: 'subscription',
  needs_attention: false, attention_grunn: null, cancel_at_period_end: false, current_period_end: null, sms_saldo: 0, sms_pakke_kan_kjopes: false };
const SETTINGS = { sms_paaminnelse_enabled: true, sms_rebooking_enabled: true, rebooking_interval_days: 35, referral_enabled: true, loyalty_enabled: true };
const PREVIEW = { rebooking: { body: 'Hei Ola! Det er snart tid for ny klipp hos Grand Barber. Book her: trybarberhq.com/grand-barber', transaksjonell: false },
  paaminnelse: { body: 'Hei! Minner om timen din hos Grand Barber i morgen kl. 14:00.', transaksjonell: true } };

const browser = await chromium.launch();
let feil = 0, apiForsok = 0, apiMocket = 0; const skriv = [];
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };

// «På vei» (/attribution): antall kunder som når rebooking-vinduet. Settes per kjøring.
let PAA_VEI_N = 0;
const attribusjon = () => ({ total: { count: 0, revenue: 0 },
  hentetInn: { total: { count: 0, revenue: 0 }, vervet: { count: 0, revenue: 0 }, vinnTilbake: { count: 0, revenue: 0 }, rebooking: { count: 0, revenue: 0 } },
  paaVei: { rebooking: { naar_vindu_30d: PAA_VEI_N, med_samtykke: Math.min(PAA_VEI_N, 3) }, winback: { foerste_passerer_60: null, passerer_innen_30d: 0 } } });

async function side(bredde, tema, touch) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch (e) {} }, tema);
  page.on('request', q => { if (new URL(q.url()).hostname === 'api.trybarberhq.com') apiForsok++; });
  await page.route('**/*', route => { const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
    if (u.hostname === 'api.trybarberhq.com') apiMocket++;
    if (u.hostname === 'localhost' && !p.startsWith('/api/')) return route.continue();
    if (!p.startsWith('/api/')) { if (u.hostname === 'api.trybarberhq.com') return route.fulfill({ path: path.join(ROOT, decodeURIComponent(p)) });
      if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$/.test(u.hostname)) return route.continue(); return route.abort(); }
    const json = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() !== 'GET') skriv.push(req.method() + ' ' + p);
    if (p === '/api/dashboard/billing/status') return json(BILLING);
    if (p === '/api/dashboard/profile') return json({ hasPassword: true, name: 'Henrik', shop: 'Grand Barber', email: 'h@g.no', slug: 'grand-barber' });
    if (p === '/api/dashboard/settings') return json(SETTINGS);
    if (p === '/api/dashboard/attribution') return json(attribusjon());
    const pv = p.match(/sms-preview|sms\/preview/) ? (u.searchParams.get('kind') || '') : null;
    if (pv !== null) return json(PREVIEW[pv] || PREVIEW.rebooking);
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p) ? [] : {}); });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html#vekst`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  return { page, errs };
}
// Bakgrunn i venstre del (tittel) og i bryterkolonnen, sett med øynene: farge på piksel i et skjermbilde.
async function pikselBg(page, sel) {
  const r = await page.$eval(sel + ' .acc-row', e => { const a = e.getBoundingClientRect(), s = e.querySelector('.acc-sw').getBoundingClientRect();
    const y = a.top + a.height * 0.75;   // ikke helt nederst: der kan kortets avrundede hjørne ligge
    return { venstre: { x: a.left + 4, y }, hoyre: { x: a.right - 4, y } }; });   // i kantmargen (tittelens padding / bryterens marg): aldri tekst
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: page.viewportSize().width, height: page.viewportSize().height } });
  const p2 = await browser.newPage();
  const farger = await p2.evaluate(async ({ b64, pts }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const skala = img.width / innerWidth || 2;
    return pts.map(p => Array.from(x.getImageData(Math.round(p.x * 2), Math.round(p.y * 2), 1, 1).data).slice(0, 3).join(','));
  }, { b64: buf.toString('base64'), pts: [r.venstre, r.hoyre] });
  await p2.close();
  return farger;
}

for (const bredde of [320, 375]) for (const tema of ['dark', 'light']) {
  const id = `${bredde} ${tema}`;
  { // Desktop-lik enhet (ekte hover): hover på tittelen toner HELE raden, også bryterkolonnen
    const { page, errs } = await side(bredde, tema, false);
    for (const sel of ['#accPaam', '#accRebook']) {
      await page.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await page.mouse.move(0, 0);   // midt på skjermen: ikke under den faste bunnmenyen await page.waitForTimeout(100);
      const hvile = await pikselBg(page, sel);
      await page.hover(sel + ' .acc-head'); await page.waitForTimeout(250);
      const hover = await pikselBg(page, sel);
      sjekk(hvile[0] === hvile[1] && hover[0] === hover[1], `${id} hover ${sel}: én bakgrunn i hvile [${hvile}] og ved hover [${hover}]`);
    }
    // Tekstene
    const tekster = await page.evaluate(() => ({
      paam: (document.querySelector('#accPaam .acc-sub') || {}).textContent || '',
      winback: (document.querySelector('#accWinback .acc-sub') || {}).textContent || '',
      hentet: [...document.querySelectorAll('#vekst .block-s')].map(p => p.textContent).find(t => t.startsWith('Verving er kunder')) || '',
      html: document.getElementById('vekst').innerHTML,
    }));
    sjekk(tekster.paam.trim() === 'Kunden får én SMS dagen før timen. Færre glemte avtaler.', `${id}: SMS-påminnelse «${tekster.paam.trim()}»`);
    sjekk(/En personlig melding fra deg, ikke en maskin\.$/.test(tekster.winback.trim()) && !/—/.test(tekster.winback), `${id}: Vinn tilbake «${tekster.winback.trim()}»`);
    sjekk(tekster.hentet.endsWith('Vinn tilbake er kunder som var borte i over 60 dager og kom tilbake.') && !/Dem lister vi/.test(tekster.hentet), `${id}: «Hentet inn»-forklaringen uten «Dem lister vi …»`);
    // Forklaringslinja under rebooking-boblen (åpne rebooking for å få den rendret)
    await page.click('#accRebook .acc-head'); await page.waitForTimeout(700);
    const noter = await page.$$eval('#vekst .sms-prev-note', ps => ps.map(p => p.textContent));
    sjekk(noter.length > 0 && noter.every(t => !/Avmeldingslenka legges til automatisk/.test(t)) && noter.some(t => t === 'Går kun til kunder som har samtykket til SMS ved booking.'),
      `${id}: SMS-forklaringen uten avmeldings-setningen (${JSON.stringify(noter)})`);
    await page.mouse.move(0, 0); await page.waitForTimeout(200);   // ingen hover i skjermbildet
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    await page.locator('#vekst').screenshot({ path: path.join(OUT, `vekst-${tema}-${bredde}.png`) });
    sjekk(errs.length === 0, `${id}: JS-feil ${errs.join(' | ')}`); await page.close();
  }
  { // Touch (telefon): et trykk på tittelen skal ikke gi tittelfeltet egen bakgrunn
    const { page, errs } = await side(bredde, tema, true);
    const sel = '#accPaam';
    await page.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
    await page.tap(sel + ' .acc-head'); await page.waitForTimeout(250); await page.tap(sel + ' .acc-head'); await page.waitForTimeout(250);
    const etter = await pikselBg(page, sel);
    sjekk(etter[0] === etter[1], `${id} touch ${sel}: én bakgrunn etter trykk [${etter}]`);
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    await page.locator(sel).screenshot({ path: path.join(OUT, `paam-etter-trykk-${tema}-${bredde}.png`) });
    sjekk(errs.length === 0, `${id} touch: JS-feil ${errs.join(' | ')}`); await page.close();
  }
}
// «På vei»: samtykkelinja bare når noen når vinduet. 0 → bare tallet + «kunder når vinduet de neste 30 dagene».
for (const bredde of [320, 375]) for (const n of [0, 5]) {
  PAA_VEI_N = n;
  const { page, errs } = await side(bredde, 'dark', false);
  await page.evaluate(() => switchPanel('oversikt')); await page.waitForTimeout(1200);   // «På vei» står i «Drevet av» på Oversikt
  const pv = await page.$$eval('.di-pv-block', bs => bs.filter(b => b.offsetParent && /REBOOKING/.test(b.textContent)).map(b => ({
    num: (b.querySelector('.di-pv-num') || {}).textContent, txt: (b.querySelector('.di-pv-txt') || {}).textContent,
    samtykke: b.querySelector('.di-pv-consent') ? b.querySelector('.di-pv-consent').textContent : null })));
  const ok = pv.length > 0 && pv.every(x => x.num === String(n) && x.txt === 'kunder når vinduet de neste 30 dagene'
    && (n === 0 ? x.samtykke === null : x.samtykke === `3 av ${n} har SMS-samtykke i dag`));
  sjekk(ok, `${bredde} På vei med ${n} i vinduet: ${JSON.stringify(pv[0] || 'ikke rendret')}`);
  if (pv.length) {
    await page.mouse.move(0, 0);
    const blokk = page.locator('.di-pv').filter({ visible: true }).first();
    await blokk.screenshot({ path: path.join(OUT, `paa-vei-${n}-${bredde}.png`) });
  }
  sjekk(errs.length === 0, `${bredde} På vei ${n}: JS-feil ${errs.join(' | ')}`); await page.close();
}
PAA_VEI_N = 0;
sjekk(apiForsok === apiMocket, `alle ${apiForsok} kall mot api.trybarberhq.com besvart av mocken — ingen nådde prod`);
sjekk(skriv.length === 0, `skrivende kall: ${skriv.join(', ') || 0}`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
