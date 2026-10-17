// tools/render/logg-inn-epost.mjs — e-postfeltet og kvitteringene i no/logg-inn.html (14.10.2026).
//   1. Tom/ugyldig e-post stoppes FØR kallet: feil ved feltet, ingen request, ingen kvittering.
//   2. «Send meg kode og lenke»: kvittering + kodefelt KUN ved 2xx. 4xx/5xx/nettverksfeil → feilmelding.
//   3. «Glemt passordet?»: samme regel.
//   4. ?error=expired uten #expired-msg i markupen: resten av JS-en kjører likevel (knappen virker).
//   5. Alle getElementById-oppslag i skriptet har et element (samme felle som 4, andre steder i fila).
//   6. request_id (17.10): lagres i localStorage, følger /login-kode og «Send på nytt»; code ny_kode/laast →
//      «Send meg en ny kode» + nullstilt forespørsel; feil_kode → prøv igjen; gjenoppretting etter omlasting;
//      annen e-post / utløpt → ingen request_id; suksess sletter forespørselen. Skjermbilder 320/375.
// /api/send-magic-link og /api/login-kode mockes; alt annet mot api.trybarberhq.com avbrytes og telles (skal være 0).
//
//   node tools/render/logg-inn-epost.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const FIL  = path.join(ROOT, 'no/logg-inn.html');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/logg-inn-epost');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml',
               '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json', '.webp':'image/webp' };
let utenExpired = false;   // case 4: server logg-inn.html uten #expired-msg
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    if (f === FIL && utenExpired) b = Buffer.from(String(b).replace(/<p class="notice" id="expired-msg"><\/p>/, ''));
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const browser = await chromium.launch();
let prodUfanget = 0;

async function nySide(bredde, svar, url = '/no/logg-inn.html', kodeSvar = []) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  const kall = [], kodeKall = []; let rid = 0;
  await page.route(u => u.hostname === 'api.trybarberhq.com', r => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/api/send-magic-link') {
      kall.push(JSON.parse(r.request().postData() || '{}'));
      if (svar === 'nett') return r.abort('failed');
      return r.fulfill({ status: svar, contentType: 'application/json', body: svar < 300 ? JSON.stringify({ ok: true, request_id: 'rid-' + (++rid) }) : '{"error":"x"}' });
    }
    if (p === '/api/login-kode') {
      kodeKall.push(JSON.parse(r.request().postData() || '{}'));
      const [st, body] = kodeSvar.shift() || [400, { error: 'x', code: 'feil_kode' }];
      return r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(body) });
    }
    prodUfanget++; return r.abort();
  });
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'networkidle' });
  return { page, errs, kall, kodeKall };
}
const synlig = (page, sel) => page.$eval(sel, e => e.offsetParent !== null).catch(() => false);
const tekst  = (page, sel) => page.$eval(sel, e => e.offsetParent !== null ? e.textContent.trim().replace(/\s+/g, ' ') : '—').catch(() => '—');
const rapport = []; const bilder = [];
const push = (navn, f, errs) => rapport.push({ sjekk: navn, resultat: f.length ? '✗ ' + f.join(' | ') : 'OK ✓', jsfeil: errs.length ? errs.join('; ') : 'ingen' });
const KVITT = 'Sjekk e-posten din. Hvis adressen er registrert, har vi sendt en kode og en lenke.';

for (const w of [320, 375]) {
  // ── 1–2. Send meg kode og lenke ──
  const CASES = [
    { id: 'tom',      epost: '',          svar: 200,    kall: 0, feltFeil: 'Skriv inn e-posten din.', bilde: true },
    { id: 'ugyldig',  epost: 'henrik@',   svar: 200,    kall: 0, feltFeil: 'Sjekk e-postadressen. Den ser ikke riktig ut.', bilde: true },
    { id: 'ok',       epost: 'h@g.no',    svar: 200,    kall: 1, kvitt: true, bilde: true },
    { id: 'serverfeil', epost: 'h@g.no',  svar: 500,    kall: 1, feil: 'Vi fikk ikke sendt lenken. Prøv igjen om litt.', bilde: true },
    { id: 'for-mange',  epost: 'h@g.no',  svar: 429,    kall: 1, feil: 'Vi fikk ikke sendt lenken. Prøv igjen om litt.' },
    { id: 'nettfeil', epost: 'h@g.no',    svar: 'nett', kall: 1, feil: 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.' },
  ];
  for (const c of CASES) {
    const { page, errs, kall } = await nySide(w, c.svar);
    await page.fill('#email', c.epost);
    await page.click('#magic-submit');
    await page.waitForTimeout(400);
    const f = [];
    if (kall.length !== c.kall) f.push(`kall=${kall.length}`);
    const ff = await tekst(page, '#email-feil');
    if (ff !== (c.feltFeil || '—')) f.push(`feltfeil «${ff}»`);
    const ok = await tekst(page, '#magic-ok');
    if (ok !== (c.kvitt ? KVITT : '—')) f.push(`kvittering «${ok}»`);
    if ((await synlig(page, '#kode')) !== !!c.kvitt) f.push('kodefelt feil synlighet');
    const mf = await tekst(page, '#magic-feil');
    if (mf !== (c.feil || '—')) f.push(`feilmelding «${mf}»`);
    if (await page.$eval('#magic-submit', b => b.disabled || b.textContent.trim() !== 'Send meg kode og lenke')) f.push('knappen ikke tilbake');
    if (c.feltFeil) {
      // Skriving i feltet fjerner feilen.
      await page.type('#email', 'x'); await page.waitForTimeout(50);
      if (await synlig(page, '#email-feil')) f.push('feltfeil står etter skriving');
      await page.fill('#email', c.epost); await page.click('#magic-submit'); await page.waitForTimeout(100);
    }
    if (c.bilde) { const fil = path.join(OUT, `lenke-${c.id}-${w}.png`); await page.screenshot({ path: fil }); bilder.push(fil); }
    push(`${w} lenke ${c.id}`, f, errs); await page.close();
  }

  // ── 3. Glemt passordet? ──
  for (const c of [
    { id: 'ok', svar: 200, ok: 'Sjekk e-posten din. Vi har sendt en lenke til h@g.no.', kode: true },
    { id: 'serverfeil', svar: 500, feil: 'Vi fikk ikke sendt lenken. Prøv igjen om litt.', kode: false },
    { id: 'nettfeil', svar: 'nett', feil: 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.', kode: false },
  ]) {
    const { page, errs, kall } = await nySide(w, c.svar);
    await page.fill('#email', 'h@g.no');
    await page.click('#pw-alt-btn'); await page.click('#pw-glemt'); await page.waitForTimeout(400);
    const f = [];
    if (kall.length !== 1 || kall[0].formaal !== 'reset') f.push(`kall ${JSON.stringify(kall)}`);
    const m = await page.$eval('#pw-glemt-msg', e => ({ k: e.className, t: e.textContent.trim() }));
    const forvent = c.ok ? { k: 'pw-glemt-msg ok', t: c.ok } : { k: 'pw-glemt-msg feil', t: c.feil };
    if (m.k !== forvent.k || m.t !== forvent.t) f.push(`melding ${m.k} «${m.t}»`);
    if ((await synlig(page, '#kode')) !== c.kode) f.push('kodefelt feil synlighet');
    if (c.id === 'serverfeil') { const fil = path.join(OUT, `glemt-serverfeil-${w}.png`); await page.screenshot({ path: fil }); bilder.push(fil); }
    push(`${w} glemt ${c.id}`, f, errs); await page.close();
  }
}

// ── 1b. Regelen er LØS: fanger bare tomt felt og det åpenbart feile (mangler @, ingen punktum i domenet).
// Godkjent = kallet går (1 request). Avvist = feil ved feltet, ingen request.
{
  const GODTAS  = ['navn+test@gmail.com', 'fornavn.etternavn@firma.no', 'henrik@frisør.no', 'a@b.co', '  h@g.no  '];
  const AVVISES = ['', '   ', 'henrik', 'henrik@', 'henrik@gmail', '@gmail.com', 'henrik gmail.com'];
  const { page, errs, kall } = await nySide(375, 200);
  const f = [];
  for (const adr of [...GODTAS, ...AVVISES]) {
    const før = kall.length;
    await page.fill('#email', adr); await page.click('#magic-submit'); await page.waitForTimeout(250);
    const sendt = kall.length - før === 1, feltFeil = await synlig(page, '#email-feil');
    if (GODTAS.includes(adr) && (!sendt || feltFeil)) f.push(`avviste «${adr}»`);
    if (AVVISES.includes(adr) && (sendt || !feltFeil)) f.push(`slapp gjennom «${adr}»`);
    // Chrome gjør IDN-domener om til punycode i <input type=email>.value (frisør.no → xn--frisr-yua.no),
    // så sammenlign på ASCII-formen av domenet.
    const ascii = a => { const [l, d] = a.trim().split('@'); return l + '@' + new URL('http://' + d).hostname; };
    if (GODTAS.includes(adr) && sendt && ascii(kall.at(-1).email) !== ascii(adr)) f.push(`sendte «${kall.at(-1).email}»`);
  }
  push(`e-postregel (${GODTAS.length} godtas, ${AVVISES.length} avvises)`, f, errs); await page.close();
}

// ── 4. ?error=expired: med og uten elementet ──
{
  const { page, errs } = await nySide(375, 200, '/no/logg-inn.html?error=expired');
  const f = [];
  if (await tekst(page, '#expired-msg') !== 'Logg inn med e-post og passord, eller be om en ny lenke.') f.push('notis mangler');
  push('expired med element', f, errs); await page.close();
}
{
  utenExpired = true;
  const { page, errs, kall } = await nySide(375, 200, '/no/logg-inn.html?error=expired');
  utenExpired = false;
  await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
  const f = [];
  if (await page.$('#expired-msg')) f.push('elementet ble ikke fjernet i testen');
  if (kall.length !== 1 || !(await synlig(page, '#magic-ok'))) f.push('JS-en stoppet: knappen virker ikke');
  push('expired UTEN element', f, errs); await page.close();
}

// ── 5. Alle id-oppslag har et element ──
{
  const html = fs.readFileSync(FIL, 'utf8');
  const ider = [...new Set([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
  const mangler = ider.filter(id => !html.includes(`id="${id}"`));
  push(`id-oppslag (${ider.length})`, mangler.map(id => 'mangler #' + id), []);
}

// ── 6. request_id: lagring, kode, «Send på nytt», ny_kode/laast/feil_kode, gjenoppretting ──
{
  const HJELP = 'Koden virker bare i nettleseren du ba om den fra. På en annen enhet: bruk lenka i e-posten.';
  const lagret = page => page.evaluate(() => JSON.parse(localStorage.getItem('bhq-innlogging-kode') || 'null'));
  const skrivKode = async page => { await page.fill('#loginKode', '123456'); await page.waitForTimeout(400); };
  const bilde = async (page, navn) => { const fil = path.join(OUT, navn); await page.screenshot({ path: fil, fullPage: true }); bilder.push(fil); };
  for (const w of [320, 375]) {
    // a–c: feil_kode → «Send på nytt» → ny_kode → «Send meg en ny kode»
    {
      const { page, errs, kall, kodeKall } = await nySide(w, 200, undefined,
        [[400, { error: 'x', code: 'feil_kode' }], [400, { error: 'x', code: 'ny_kode' }]]);
      const f = [];
      await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
      let l = await lagret(page);
      if (!l || l.request_id !== 'rid-1' || l.email !== 'h@g.no' || !(l.utloper > Date.now() + 9 * 60e3)) f.push('lagret etter send ' + JSON.stringify(l));
      if (await tekst(page, '#kodeHjelp') !== HJELP) f.push('hjelpetekst');
      await bilde(page, `kode-sendt-${w}.png`);
      await skrivKode(page);
      if (kodeKall[0]?.request_id !== 'rid-1' || kodeKall[0]?.kode !== '123456') f.push('login-kode ' + JSON.stringify(kodeKall[0]));
      if (await tekst(page, '#kodeFeil') !== 'Koden stemmer ikke. Sjekk e-posten og prøv igjen.') f.push('feil_kode-tekst');
      if (!(await lagret(page))) f.push('feil_kode slettet forespørselen');
      if (!(await synlig(page, '#kodeSubmit')) || await synlig(page, '#kodeNy')) f.push('feil_kode: knapper');
      await page.click('#kodeIgjen'); await page.waitForTimeout(400);
      if (kall[1]?.request_id !== 'rid-1') f.push('send på nytt uten request_id ' + JSON.stringify(kall[1]));
      if ((await lagret(page))?.request_id !== 'rid-2') f.push('ny request_id ikke lagret');
      if (await tekst(page, '#kodeStatus') !== 'Ny kode sendt. Sjekk e-posten din.') f.push('status etter send på nytt');
      if (await page.$eval('#loginKode', e => e.value) !== '') f.push('kodefeltet ikke tømt');
      await bilde(page, `kode-sendt-paa-nytt-${w}.png`);
      await skrivKode(page);
      if (kodeKall[1]?.request_id !== 'rid-2') f.push('andre login-kode ' + JSON.stringify(kodeKall[1]));
      if (await tekst(page, '#kodeFeil') !== 'Koden virker ikke lenger. Be om en ny kode.') f.push('ny_kode-tekst');
      if (await lagret(page)) f.push('ny_kode slettet ikke forespørselen');
      if (!(await synlig(page, '#kodeNy')) || await synlig(page, '#kodeSubmit') || await synlig(page, '#kodeIgjen')) f.push('ny_kode: knapper');
      await bilde(page, `kode-ny-kode-${w}.png`);
      await page.click('#kodeNy'); await page.waitForTimeout(400);
      if (kall.length !== 3 || 'request_id' in kall[2]) f.push('ny kode sendte request_id ' + JSON.stringify(kall[2]));
      if ((await lagret(page))?.request_id !== 'rid-3') f.push('rid-3 ikke lagret');
      if (await synlig(page, '#kodeNy') || !(await synlig(page, '#kodeSubmit')) || !(await synlig(page, '#kodeIgjen'))) f.push('etter ny kode: knapper');
      push(`${w} kode: feil_kode → på nytt → ny_kode → ny`, f, errs); await page.close();
    }
    // d: laast
    {
      const { page, errs } = await nySide(w, 200, undefined, [[400, { error: 'x', code: 'laast' }]]);
      const f = [];
      await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
      await skrivKode(page);
      if (await tekst(page, '#kodeFeil') !== 'For mange feil forsøk med denne koden. Be om en ny kode.') f.push('laast-tekst');
      if (await lagret(page)) f.push('laast slettet ikke forespørselen');
      if (!(await synlig(page, '#kodeNy'))) f.push('ingen ny-kode-knapp');
      push(`${w} kode: laast`, f, errs); await page.close();
    }
  }
  // e: gjenoppretting etter omlasting (hjemskjerm-appen drept), ikke ved ?error=expired
  {
    const { page, errs, kodeKall } = await nySide(375, 200);
    const f = [];
    await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    if (await page.$eval('#email', e => e.value) !== 'h@g.no') f.push('e-post ikke gjenopprettet');
    if (!(await synlig(page, '#kode')) || await tekst(page, '#magic-ok') !== KVITT) f.push('kodefelt/kvittering ikke gjenopprettet');
    await skrivKode(page);
    if (kodeKall[0]?.request_id !== 'rid-1') f.push('request_id etter omlasting ' + JSON.stringify(kodeKall[0]));
    await page.goto(`http://localhost:${PORT}/no/logg-inn.html?error=expired`, { waitUntil: 'networkidle' });
    if (await synlig(page, '#kode')) f.push('gjenopprettet ved ?error=expired');
    push('gjenoppretting etter omlasting', f, errs); await page.close();
  }
  // f–g: annen e-post / utløpt → ingen request_id
  {
    const { page, errs, kodeKall } = await nySide(375, 200);
    const f = [];
    await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
    await page.fill('#email', 'annen@g.no'); await skrivKode(page);
    if (!kodeKall[0] || 'request_id' in kodeKall[0]) f.push('annen e-post sendte request_id ' + JSON.stringify(kodeKall[0]));
    await page.fill('#email', 'H@G.no');
    await page.evaluate(() => { const k = 'bhq-innlogging-kode', r = JSON.parse(localStorage.getItem(k)); r.utloper = Date.now() - 1; localStorage.setItem(k, JSON.stringify(r)); });
    await page.fill('#loginKode', ''); await page.fill('#loginKode', '654321'); await page.waitForTimeout(400);
    if (!kodeKall[1] || 'request_id' in kodeKall[1]) f.push('utløpt sendte request_id ' + JSON.stringify(kodeKall[1]));
    if (await lagret(page)) f.push('utløpt ikke slettet');
    push('annen e-post / utløpt: ingen request_id', f, errs); await page.close();
  }
  // h: suksess sletter forespørselen
  {
    const { page, errs } = await nySide(375, 200, undefined, [[200, { ok: true, redirect: '/no/logg-inn.html?ferdig=1' }]]);
    const f = [];
    await page.fill('#email', 'h@g.no'); await page.click('#magic-submit'); await page.waitForTimeout(400);
    await skrivKode(page); await page.waitForLoadState('networkidle');
    if (!page.url().includes('ferdig=1')) f.push('ingen redirect');
    if (await lagret(page)) f.push('forespørselen står etter innlogging');
    if (await synlig(page, '#kode')) f.push('kodefelt gjenopprettet etter innlogging');
    push('suksess sletter forespørselen', f, errs); await page.close();
  }
  // i: «Glemt passordet?» → «Send på nytt» beholder formaal:'reset'
  {
    const { page, errs, kall } = await nySide(375, 200);
    const f = [];
    await page.fill('#email', 'h@g.no'); await page.click('#pw-alt-btn'); await page.click('#pw-glemt'); await page.waitForTimeout(400);
    if ((await lagret(page))?.formaal !== 'reset') f.push('formaal ikke lagret');
    await page.click('#kodeIgjen'); await page.waitForTimeout(400);
    if (kall[1]?.formaal !== 'reset' || kall[1]?.request_id !== 'rid-1') f.push('send på nytt ' + JSON.stringify(kall[1]));
    push('glemt → send på nytt beholder reset', f, errs); await page.close();
  }
}

await browser.close(); server.close();
rapport.push({ sjekk: 'ingen ufanget request til prod', resultat: prodUfanget ? `✗ ${prodUfanget}` : 'OK ✓', jsfeil: '—' });
console.table(rapport);
console.log('Bilder:\n' + bilder.join('\n'));
process.exit(rapport.some(r => r.resultat.startsWith('✗') || (r.jsfeil !== 'ingen' && r.jsfeil !== '—')) ? 1 : 0);
