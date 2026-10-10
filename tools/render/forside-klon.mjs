// tools/render/forside-klon.mjs — tekst i forsidens dashbord-kloner (site/no/index.html) mot dashbordet.
//
// Produktvisningen og Vekst-demoene (.rbdemo: rebooking, påminnelse, verving, vinn tilbake, lojalitet)
// kloner dashbordets Vekst-kort. Når dashbordets tekst endres, blir klonen stående med den gamle — det
// skjedde med «kvelden før» (10.10). Denne testen låser klonens UI-tekster til det dashbordet sier i dag,
// og tar skjermbilder av demoene på 320 og 375. Alt nettverk utenfor localhost avbrytes.
//
//   node tools/render/forside-klon.mjs
//
// Skjermbilder → .render-ut/forside-klon/ (gitignorert).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/forside-klon');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const dash = fs.readFileSync(path.join(ROOT, 'no/dashboard.html'), 'utf8');
const browser = await chromium.launch();
let feil = 0, prod = 0;
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };

// Tekstene klonen skal ha — og at dashbordet faktisk sier det samme (ellers er det testen som er utdatert).
const LIK = [
  ['Kunden får én SMS dagen før timen. Færre glemte avtaler.', 4],
  ['Kunder som ikke har booket ny time får én SMS når intervallet er passert.', 4],
  ['Kunder som ikke møtte opp, eller har vært borte lenge. En personlig melding fra deg, ikke en maskin.', 4],
  ['Kunder som verver en venn utløser rabatt når vennen har vært innom.', 4],
];
const BORTE = ['kvelden før', 'SLIK SER DEN UT', 'Del vervelenke', 'deg — ikke en maskin'];

for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.hostname === 'localhost') return r.continue();
    // Forsidens sesjonssjekk (GET /api/dashboard/session) besvares lokalt — den skal aldri nå prod.
    if (u.hostname === 'api.trybarberhq.com' && r.request().method() === 'GET') return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$|unpkg\.com$/.test(u.hostname)) return r.continue();
    prod++; console.log('  avbrutt:', r.request().method(), u.hostname + u.pathname); return r.abort(); });
  await page.goto(`http://localhost:${PORT}/no/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => ({
    subs: [...document.querySelectorAll('.rb-acc-s')].map(e => e.textContent.trim()),
    html: document.body.innerHTML,
    forh: (document.querySelector('.paa-forh-k') || {}).textContent || '',
    knapper: [...document.querySelectorAll('.vv-kbtn')].map(e => e.textContent.trim()),
    sistHer: [...document.querySelectorAll('.wb-ctx')].map(e => e.textContent.trim()),
  }));
  // Vinn tilbake: «sist her 4. mai, 74 dager siden» — komma, ikke tankestrek, i BÅDE klonen og dashbordets wbLapsedCtx.
  const sist = t.sistHer.filter(x => x.startsWith('sist her'));
  sjekk(sist.length === 2 && sist.every(x => /^sist her \d{1,2}\. [a-zæøå]+, \d+ dager siden$/.test(x)) && !t.sistHer.some(x => x.includes('—')),
    `${bredde}: vinn tilbake-klonen «${sist.join(' | ')}», ingen tankestrek i noen linje`);
  sjekk(/var since=\(c\.days_since!=null\)\?\(', '\+c\.days_since\+'&nbsp;dager&nbsp;siden'\)/.test(dash) && !/' — '\+c\.days_since/.test(dash),
    `${bredde}: dashbordets wbLapsedCtx skriver «, N dager siden» (ikke tankestrek)`);
  for (const [tekst, n] of LIK) {
    const ant = t.subs.filter(x => x === tekst).length;
    sjekk(ant === n && dash.includes(tekst.replace('. Færre', '. Færre')), `${bredde}: «${tekst.slice(0, 45)}…» ${ant}× i klonen, og står i dashbordet`);
  }
  for (const b of BORTE) sjekk(!t.html.includes(b), `${bredde}: «${b}» finnes ikke lenger i forsiden`);
  sjekk(t.forh === 'DETTE FÅR KUNDEN' && /Dette får kunden/.test(dash), `${bredde}: etikett over SMS-forhåndsvisningen «${t.forh}» (dashbordet: «Dette får kunden»)`);
  sjekk(t.knapper.length === 3 && t.knapper.every(k => k === 'Kopier') && /class="verv-btn"[^>]*>Kopier</.test(dash), `${bredde}: vervingsknappene «${t.knapper.join(', ')}» (dashbordet: «Kopier»)`);
  // Skjermbilder av demoene: demoene bor i «Fem systemer»-radene, som er lukket. Åpne raden, la scene 1
  // (Vekst-fanens kort i telefonen, med teksten fra dashbordet) spille, og ta bilde av raden.
  for (const [rad, navn] of [['sys-rebooking', 'rebooking'], ['sys-paaminnelse', 'paaminnelse'], ['sys-verving', 'verving'], ['sys-vinn-tilbake', 'vinn-tilbake']]) {
    const el = page.locator('#' + rad);
    if (!(await el.count())) { sjekk(false, `${bredde}: fant ikke #${rad}`); continue; }
    await el.scrollIntoViewIfNeeded();
    if ((await el.getAttribute('data-open')) !== 'true') await page.click('#' + rad + ' .sys-head');
    await page.waitForTimeout(1600);
    await el.screenshot({ path: path.join(OUT, `${navn}-${bredde}.png`) });
    await page.click('#' + rad + ' .sys-head'); await page.waitForTimeout(400);   // lukk igjen
  }
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  sjekk(ov === 0, `${bredde}: overflow ${ov}`);
  sjekk(errs.length === 0, `${bredde}: JS-feil ${errs.join(' | ')}`);
  await page.close();
}
// ── Redusert bevegelse: «Fem systemer»-demoene står i SLUTTSCENEN med en gang, uten tidsur ──
// Samme regel som produktvisningen (Henrik 10.10). Måles 150 ms etter at raden åpnes (før ville
// rebooking/påminnelse/verving fortsatt stå i scene 1 — tidsurene gikk på 1,6–3,6 s) og igjen etter 4 s.
const SLUTT = {
  'sys-rebooking':    () => { const st = document.getElementById('rbStage');
    return !!st.querySelector('.rb-scene[data-s="3"].on') && document.getElementById('rbBoble').classList.contains('inn')
      && document.getElementById('rbDag').textContent === '35'; },
  'sys-paaminnelse':  () => { const st = document.getElementById('paaStage');
    return !!st.querySelector('.rb-scene[data-s="3"].on') && document.getElementById('paaBoble').classList.contains('inn'); },
  'sys-verving':      () => { const st = document.getElementById('vvStage');
    return !!st.querySelector('.rb-scene[data-s="3"].on') && !!document.querySelector('#vvRows .crow.inn') && document.getElementById('vvCount').textContent === '1'; },
  'sys-vinn-tilbake': () => document.getElementById('wbListe').classList.contains('inn') && document.getElementById('wbAcc').classList.contains('aapen'),
};
for (const bredde of [320, 375]) {
  const ctx = await browser.newContext({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.hostname === 'localhost') return r.continue();
    if (u.hostname === 'api.trybarberhq.com' && r.request().method() === 'GET') return r.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$|unpkg\.com$/.test(u.hostname)) return r.continue();
    prod++; return r.abort(); });
  await page.goto(`http://localhost:${PORT}/no/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  for (const [rad, ferdig] of Object.entries(SLUTT)) {
    const el = page.locator('#' + rad);
    await el.scrollIntoViewIfNeeded();
    if ((await el.getAttribute('data-open')) !== 'true') await page.click('#' + rad + ' .sys-head');
    await page.waitForTimeout(150);
    const straks = await page.evaluate(ferdig);
    await page.waitForTimeout(4000);
    const etter = await page.evaluate(ferdig);
    sjekk(straks && etter, `${bredde} redusert ${rad}: sluttscenen med en gang (${straks}) og fortsatt etter 4 s (${etter})`);
    await el.screenshot({ path: path.join(OUT, `redusert-${rad.replace('sys-', '')}-${bredde}.png`) });
    await page.click('#' + rad + ' .sys-head'); await page.waitForTimeout(300);
  }
  sjekk(errs.length === 0, `${bredde} redusert: JS-feil ${errs.join(' | ')}`);
  await ctx.close();
}
sjekk(prod === 0, `uventede requests utenfor localhost: ${prod}`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
