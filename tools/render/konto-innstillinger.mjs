// tools/render/konto-innstillinger.mjs — Konto-fanen som innstillingsside (no/dashboard.html, 10.10).
// Erstatter konto-trekkspill.mjs (trekkspillene finnes ikke lenger).
//
// Dekker: seksjonsrekkefølge + overskrifter, ingen trekkspill (eneste pil = SMS-loggen), abonnementskortet
// alltid synlig, SMS-kortet kun på Gratis, Konto-radene (Navn/E-post/Passord) med «Endre» i samme rad — ett
// og flere åpne, Lagre (PUT /profile, POST /set-password) og Avbryt, «Ikke satt» uten passord, tema som
// segmentert valg, SMS-logg med antall denne måneden (forbruk.sendt_maaned) som eneste fold, Hjelp-lenker,
// Avpubliser KUN nederst (dempet, ikke rød), Logg ut, lenker til Konto scroller til seksjonen, varselprikk,
// og Tjenester-fanens kalenderplassering (arvet fra den gamle testen). Alt /api/** mockes; ingenting når prod.
//
//   node tools/render/konto-innstillinger.mjs
//
// Skjermbilder → .render-ut/konto-innstillinger/ (gitignorert). Bunnmenyen skjules under skjermbildene av
// Konto-panelet, ellers legger den seg over innholdet i element-utsnittet.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/konto-innstillinger');
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

const PAKKER = [{ antall: 100, pris_kr: 129, per_sms_kr: 1.29 }, { antall: 250, pris_kr: 279, per_sms_kr: 1.12 }, { antall: 500, pris_kr: 499, per_sms_kr: 1 }];
const base = () => ({ subscription_status: null, page_status: 'live', plan: null, effective_plan: 'basis', effective_plan_grunn: 'gratis',
  trial_start_at: null, trial_days_left: null, trial_ends_at: null, needs_attention: false, attention_grunn: null,
  cancel_at_period_end: false, current_period_end: null, sms_saldo: 0, sms_paaminnelser_sendes: false, sms_pakker: PAKKER,
  sms_pakke_kan_kjopes: true, sms_tilbud_avvist_at: null });
const SCEN = {
  'gratis-0':   () => ({ ...base(), sms_saldo: 0 }),
  'gratis-120': () => ({ ...base(), sms_saldo: 120, sms_paaminnelser_sendes: true,
                         sms_paaminnelse_eksempel: 'Hei! Minner om timen din hos Grand Barber i morgen kl. 14:00.' }),
  'vekst':      () => ({ ...base(), subscription_status: 'active', plan: 'vekst', effective_plan: 'vekst', effective_plan_grunn: 'subscription',
                         sms_pakke_kan_kjopes: false, sms_paaminnelser_sendes: true }),
  'prove':      () => ({ ...base(), effective_plan: 'vekst', effective_plan_grunn: 'trial_vindu', trial_days_left: 9,
                         sms_pakke_kan_kjopes: false }),
};
const SMS_LOGG = (medTall) => ({ omfang: 'kun_leveranser', har_mer: false, neste_cursor: null,
  forbruk: { barber_month: 4, monthly_cap: 200, barber_day: 1, daily_cap: 50, ...(medTall ? { sendt_maaned: 37 } : {}) },
  logg: [
    { kind: 'paaminnelse', kind_label: 'Påminnelse', kunde: 'Ola Nordmann', nummer: '+47 912 34 567', sent_at: new Date(Date.now() - 2 * 36e5).toISOString() },
    { kind: 'rebooking', kind_label: 'Rebooking', kunde: 'Kari Hansen', nummer: '+47 934 56 789', sent_at: new Date(Date.now() - 26 * 36e5).toISOString() },
  ] });

const browser = await chromium.launch();
let feil = 0; let apiForsok = 0, apiMocket = 0; const skrivUventet = [];
const sjekk = (ok, t) => { console.log((ok ? 'OK   ' : 'FEIL ') + t); if (!ok) feil++; };

async function side(bredde, { scen = 'vekst', billing, harPassord = true, smsTall = true, godta = false, pageStatus } = {}) {
  const page = await browser.newPage({ viewport: { width: bredde, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const dialoger = []; page.on('dialog', d => { dialoger.push(d.message()); godta ? d.accept() : d.dismiss(); });
  const logg = { profilPut: [], pw: [], settingsPut: [], magic: [], pageStatus: [] };
  // Hvert kall mot api.trybarberhq.com (CONFIG.API_BASE) skal besvares av mocken her — telles begge veier.
  page.on('request', q => { if (new URL(q.url()).hostname === 'api.trybarberhq.com') apiForsok++; });
  await page.route('**/*', async route => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const m = req.method();
    if (u.hostname === 'api.trybarberhq.com') apiMocket++;
    if (u.hostname === 'localhost' && !p.startsWith('/api/')) return route.continue();
    if (!p.startsWith('/api/')) {
      if (/fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$|cdnjs\.cloudflare\.com$/.test(u.hostname)) return route.continue();
      if (u.hostname === 'api.trybarberhq.com') return route.fulfill({ path: path.join(ROOT, decodeURIComponent(p)) });
      return route.abort();
    }
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/dashboard/billing/status') return json(billing ? billing() : SCEN[scen]());
    if (p === '/api/dashboard/profile' && m === 'GET') return json({ hasPassword: harPassord, name: 'Henrik Rantala', shop: 'Grand Barber',
      email: 'henrik@grandbarber.no', slug: 'grand-barber', address: '', tagline: '', bio: '' });
    if (p === '/api/dashboard/profile' && m === 'PUT') { logg.profilPut.push(JSON.parse(req.postData() || '{}')); return json({ ok: true }); }
    if (p === '/api/dashboard/settings' && m === 'PUT') { logg.settingsPut.push(JSON.parse(req.postData() || '{}')); return json({ ok: true }); }
    if (p === '/api/dashboard/set-password') { logg.pw.push(Object.keys(JSON.parse(req.postData() || '{}')).sort().join(',')); return json({ ok: true }); }
    if (p === '/api/send-magic-link') { logg.magic.push(JSON.parse(req.postData() || '{}')); return json({ ok: true }); }
    if (p === '/api/dashboard/page-status' && m === 'PUT') { const body = JSON.parse(req.postData() || '{}'); logg.pageStatus.push(body.status);
      const [st, svar] = pageStatus ? pageStatus(body) : [200, {}]; return json(svar, st); }
    if (p === '/api/dashboard/sms-logg') return json(SMS_LOGG(smsTall));
    if (p === '/api/dashboard/settings') return json({ sms_paaminnelse_enabled: true, sms_rebooking_enabled: false, rebooking_interval_days: 35 });
    if (p === '/api/dashboard/google/status') return json({ connected: true, scope_ok: true, google_email: 'henrik@grandbarber.no' });
    if (p === '/api/dashboard/preview') return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' });
    if (m !== 'GET') skrivUventet.push(m + ' ' + p);
    return json(/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p) ? [] : {});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil: 'networkidle' });
  await page.$eval('button[data-panel="abonnement"]', b => b.click());
  await page.waitForTimeout(900);
  return { page, errs, logg, dialoger };
}
const vis = (page, sel) => page.$eval(sel, el => { if (!el || el.closest('[hidden]')) return false; const r = el.getBoundingClientRect();
  return getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
const tekst = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '—');
async function skudd(page, navn) {
  await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
  await page.locator('#abonnement').screenshot({ path: path.join(OUT, navn + '.png') });
}

const FORVENT_REKKE = { 'gratis-0': ['kontoAbonnement', 'kontoSms', 'kontoKonto', 'kontoUtseende', 'kontoSmsLogg', 'kontoHjelp'],
  'gratis-120': ['kontoAbonnement', 'kontoSms', 'kontoKonto', 'kontoUtseende', 'kontoSmsLogg', 'kontoHjelp'],
  'vekst': ['kontoAbonnement', 'kontoKonto', 'kontoUtseende', 'kontoSmsLogg', 'kontoHjelp'],
  'prove': ['kontoAbonnement', 'kontoKonto', 'kontoUtseende', 'kontoSmsLogg', 'kontoHjelp'] };
const OVERSKRIFT = { kontoAbonnement: 'Abonnement og publisering', kontoSms: 'SMS-påminnelser', kontoKonto: 'Konto',
  kontoUtseende: 'Utseende', kontoSmsLogg: 'SMS-logg', kontoHjelp: 'Hjelp' };

for (const bredde of [320, 375, 1280]) {
  for (const scen of Object.keys(SCEN)) {
    const { page, errs } = await side(bredde, { scen });
    const id = `${bredde} ${scen}`;
    const m = await page.evaluate(() => {
      const synlig = el => { if (el.closest('[hidden]')) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sek = [...document.querySelectorAll('#kontoSider > .kt-seksjon')].filter(synlig);
      return {
        rekke: sek.map(s => s.id),
        overskrifter: Object.fromEntries(sek.map(s => [s.id, s.querySelector('.kt-h').textContent.trim()])),
        trekkspill: document.querySelectorAll('#abonnement .acc, #abonnement .acc-head').length,
        piler: [...document.querySelectorAll('#abonnement .acc-chev')].filter(synlig).map(p => p.closest('[id]').id),
        bunnSist: (() => { const b = document.querySelector('#kontoSider > .kt-bunn'); return !!b && b === document.querySelector('#kontoSider').lastElementChild; })(),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    sjekk(JSON.stringify(m.rekke) === JSON.stringify(FORVENT_REKKE[scen]), `${id}: seksjoner ${m.rekke.join(' → ')}`);
    sjekk(m.rekke.every(s => m.overskrifter[s] === OVERSKRIFT[s]), `${id}: overskrifter ${JSON.stringify(Object.values(m.overskrifter))}`);
    sjekk(m.trekkspill === 0 && m.piler.length === 1 && m.piler[0] === 'smsLoggFold', `${id}: ingen trekkspill, eneste pil = SMS-loggen (${m.piler})`);
    sjekk(m.bunnSist, `${id}: Avpubliser/Logg ut står nederst`);
    sjekk(await vis(page, '#kontoStatus'), `${id}: abonnementsstatus synlig uten å trykke («${await tekst(page, '#kontoStatus')}»)`);
    if (scen.startsWith('gratis')) {
      sjekk(await vis(page, '#smsSaldoRad'), `${id}: SMS-saldo synlig uten å trykke («${await tekst(page, '#smsSaldoRad')}»)`);
      sjekk((await vis(page, '#smsPaamRad')) === (scen === 'gratis-120'), `${id}: bryter-rad ${scen === 'gratis-120' ? 'vist' : 'skjult ved saldo 0'}`);
    }
    // Konto-radene
    sjekk(await tekst(page, '#navnVerdi') === 'Henrik Rantala' && await tekst(page, '#kontoEpost') === 'henrik@grandbarber.no'
      && await tekst(page, '#pwVerdi') === '••••••••', `${id}: verdier Navn/E-post/Passord`);
    sjekk(await page.$$eval('#kontoKonto [data-endre]', b => b.map(x => x.dataset.endre).join(',')) === 'radNavn,radPassord', `${id}: «Endre» på Navn og Passord, ikke E-post`);
    // Avpubliser: bare nederst, dempet (ikke rød), synlig når siden er live
    const av = await page.evaluate(() => { const b = document.getElementById('unpublish');
      return { iBunn: !!b.closest('.kt-bunn'), iKort: !!b.closest('.subcard'), antall: [...document.querySelectorAll('#abonnement button, #abonnement a')].filter(x => /Avpubliser/.test(x.textContent)).length,
        farge: getComputedStyle(b).color, synlig: b.style.display !== 'none' }; });
    sjekk(av.iBunn && !av.iKort && av.antall === 1 && av.synlig && av.farge !== 'rgb(192, 89, 74)', `${id}: Avpubliser kun nederst, dempet (${av.farge})`);
    sjekk(await vis(page, '#loggUt'), `${id}: Logg ut synlig`);
    // SMS-logg: antall denne måneden, lukket til trykk
    sjekk(await tekst(page, '#smsMaanedTall') === '37 SMS' && !(await vis(page, '#smsLoggList')), `${id}: SMS-logg «${await tekst(page, '#smsMaanedTall')}», lukket`);
    // Hjelp
    const hjelp = await page.$$eval('#kontoHjelp .kt-lenke', a => a.map(x => x.textContent.replace(/[›\s]+/g, ' ').trim() + '=' + x.getAttribute('href')).join(' | '));
    sjekk(hjelp === 'Support=/no/support.html | Vilkår=/no/vilkar.html | Personvern=/no/vilkar.html#personvern', `${id}: Hjelp ${hjelp}`);
    sjekk(await page.$$eval('.konto-brand a', a => a.length) === 0 && await vis(page, '.konto-brand .kb-logo-mork'), `${id}: bunnteksten har logo, ingen lenker`);
    sjekk(m.overflow === 0, `${id}: overflow ${m.overflow}`);
    // Målt med Range (tekstens faktiske bredde) mot elementets boks — scrollWidth bommet på ellipsis i flex.
    const kutt = await page.$$eval('#kontoSider .kt-verdi.kt-hel, #kontoSider .kt-etikett', es => es.filter(e => {
      if (!e.offsetParent || !e.textContent.trim()) return false;
      const r = document.createRange(); r.selectNodeContents(e);
      return r.getBoundingClientRect().width > e.getBoundingClientRect().width + 1;
    }).map(e => e.id || e.textContent.trim()));
    sjekk(kutt.length === 0, `${id}: ingen avkuttet etikett eller kort verdi (${kutt.join(', ') || '—'})`);
    await skudd(page, `${scen}-${bredde}`);

    if (scen === 'gratis-120' || scen === 'vekst') {
      // Ett «Endre» åpent
      await page.click('#radNavn [data-endre]'); await page.waitForTimeout(200);
      const en = await page.evaluate(() => ({ red: !document.getElementById('radNavnRed').hidden, endreSkjult: document.querySelector('#radNavn [data-endre]').hidden,
        verdi: document.getElementById('pf-name').value, fokus: document.activeElement.id }));
      sjekk(en.red && en.endreSkjult && en.verdi === 'Henrik Rantala' && en.fokus === 'pf-name', `${id}: «Endre» Navn åpner i raden ${JSON.stringify(en)}`);
      await skudd(page, `${scen}-ett-aapent-${bredde}`);
      // Flere åpne
      await page.click('#radPassord [data-endre]'); await page.waitForTimeout(200);
      sjekk(await vis(page, '#radNavnRed') && await vis(page, '#radPassordRed') && await vis(page, '#pw-current') && await vis(page, '#pw-new'),
        `${id}: Navn og Passord åpne samtidig`);
      await skudd(page, `${scen}-flere-aapne-${bredde}`);
      await page.close();
    } else { await page.close(); }
    sjekk(errs.length === 0, `${id}: JS-feil ${errs.join(' | ')}`);
  }
}

// ── Interaksjon (375) ──────────────────────────────────────────────────────────────────────────────
{
  const { page, errs, logg } = await side(375, { scen: 'vekst' });
  // Navn: Avbryt tilbakestiller, Lagre sender PUT /profile med navnet, lukker og viser ny verdi
  await page.click('#radNavn [data-endre]'); await page.fill('#pf-name', 'Noe annet'); await page.click('[data-avbryt="radNavn"]');
  sjekk(await page.$eval('#pf-name', e => e.value) === 'Henrik Rantala' && !(await vis(page, '#radNavnRed')) && logg.profilPut.length === 0,
    'Navn: Avbryt tilbakestiller og lukker, ingenting sendt');
  await page.click('#radNavn [data-endre]'); await page.fill('#pf-name', 'Henrik R.'); await page.click('#saveNavn'); await page.waitForTimeout(700);
  sjekk(logg.profilPut.length === 1 && logg.profilPut[0].name === 'Henrik R.', `Navn: Lagre → PUT /profile name=«${logg.profilPut[0] && logg.profilPut[0].name}»`);
  sjekk(!(await vis(page, '#radNavnRed')) && await tekst(page, '#navnVerdi') === 'Henrik R.' && await vis(page, '#radNavn [data-endre]'), 'Navn: raden lukkes og viser ny verdi');
  // Passord (satt): «Endre» → nåværende + nytt + gjenta, «Glemt passordet?» under
  await page.click('#radPassord [data-endre]'); await page.waitForTimeout(150);
  sjekk(await tekst(page, '#radPassord [data-endre]') === 'Endre' && await vis(page, '#pw-current') && await vis(page, '#pw-new') && await vis(page, '#pw-repeat')
    && await tekst(page, '#pwForgot') === 'Glemt passordet? Få en lenke på e-post' && await tekst(page, '#savePw') === 'Lagre', 'Passord satt: nåværende + nytt + gjenta + glemt-lenke');
  await page.fill('#pw-new', 'y'.repeat(9)); await page.fill('#pw-repeat', 'y'.repeat(9)); await page.click('#savePw'); await page.waitForTimeout(250);
  sjekk(await tekst(page, '#pwErr') === 'Skriv inn nåværende passord' && logg.pw.length === 0, `Passord: mangler nåværende → «${await tekst(page, '#pwErr')}», ingenting sendt`);
  await page.fill('#pw-current', 'x'.repeat(9)); await page.fill('#pw-repeat', 'z'.repeat(9)); await page.click('#savePw'); await page.waitForTimeout(250);
  sjekk(await tekst(page, '#pwErr') === 'Passordene er ikke like' && logg.pw.length === 0, `Passord: ulike → «${await tekst(page, '#pwErr')}», ingenting sendt`);
  await page.fill('#pw-repeat', 'y'.repeat(9));
  await page.click('#savePw'); await page.waitForTimeout(700);
  sjekk(logg.pw.join('|') === 'current_password,password' && !(await vis(page, '#radPassordRed')) && await tekst(page, '#pwVerdi') === '••••••••',
    `Passord: Lagre → POST /set-password {${logg.pw}} og raden lukkes`);
  // For kort passord: feilen vises i raden, raden står åpen
  await page.click('#radPassord [data-endre]'); await page.fill('#pw-current', 'x'.repeat(9)); await page.fill('#pw-new', 'kort'); await page.click('#savePw'); await page.waitForTimeout(300);
  sjekk(await vis(page, '#pwErr') && await vis(page, '#radPassordRed') && logg.pw.length === 1, `Passord: for kort → «${await tekst(page, '#pwErr')}» i raden`);
  await page.click('[data-avbryt="radPassord"]');
  sjekk(!(await vis(page, '#pwErr')) && await page.$eval('#pw-new', e => e.value) === '' && await page.$eval('#pw-repeat', e => e.value) === '', 'Passord: Avbryt tømmer feltene og feilen');
  // Tema: segmentert valg
  await page.click('#themeGrid [data-tema="light"]'); await page.waitForTimeout(200);
  const tema = await page.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), valgt: document.querySelector('#themeGrid [aria-checked="true"]').textContent,
    lagret: localStorage.getItem('bhq-theme') }));
  sjekk(tema.t === 'light' && tema.valgt === 'Lys' && tema.lagret === 'light', `Tema: Lys valgt ${JSON.stringify(tema)}`);
  await page.focus('#themeGrid [data-tema="light"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  sjekk(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'Tema: piltast bytter til Mørk');
  // SMS-logg: folder ut ved trykk
  await page.click('#smsLoggFold'); await page.waitForTimeout(200);
  sjekk(await vis(page, '#smsLoggList .sms-row') && await page.$eval('#smsLoggFold', b => b.getAttribute('aria-expanded')) === 'true', 'SMS-logg: lista folder ut ved trykk');
  await skudd(page, 'vekst-smslogg-aapen-375');
  await page.click('#smsLoggFold'); await page.waitForTimeout(150);
  sjekk(!(await vis(page, '#smsLoggList')), 'SMS-logg: lukkes igjen');
  // Lenker til Konto scroller til seksjonen
  await page.evaluate(() => { switchPanel('oversikt'); window.scrollTo(0, 0); }); await page.waitForTimeout(300);
  await page.evaluate(() => aapneAbonnement()); await page.waitForTimeout(900);
  const top = await page.$eval('#kontoAbonnement', e => Math.round(e.getBoundingClientRect().top));
  sjekk(await vis(page, '#kontoAbonnement') && top >= 0 && top < 120, `aapneAbonnement → Konto, scrollet til abonnement (top ${top})`);
  sjekk(errs.length === 0, `interaksjon: JS-feil ${errs.join(' | ')}`);
  await page.close();
}
{ // «Se SMS-pakker» (Gratis) → SMS-seksjonen
  const { page, errs } = await side(375, { scen: 'gratis-120' });
  await page.evaluate(() => { switchPanel('oversikt'); window.scrollTo(0, 0); }); await page.waitForTimeout(300);
  await page.evaluate(() => aapneKontoSeksjon('kontoSms')); await page.waitForTimeout(900);
  const top = await page.$eval('#kontoSms', e => Math.round(e.getBoundingClientRect().top));
  sjekk(top >= 0 && top < 120, `«Se SMS-pakker» → scrollet til SMS-påminnelser (top ${top})`);
  sjekk(errs.length === 0, `SMS-lenke: JS-feil ${errs.join(' | ')}`);
  await page.close();
}
for (const bredde of [320, 375]) { // Passord: ikke satt / satt / glemt-lenken, avpubliseringsfeil, publiseringsfeil, SMS-kortet
  { const { page, errs, logg } = await side(bredde, { scen: 'vekst', harPassord: false });
    sjekk(await tekst(page, '#pwVerdi') === 'Ikke satt' && await tekst(page, '#radPassord [data-endre]') === 'Lag passord', `${bredde} ikke satt: «Ikke satt» + «Lag passord»`);
    await page.click('#radPassord [data-endre]'); await page.waitForTimeout(200);
    sjekk(!(await vis(page, '#pw-current')) && await vis(page, '#pw-new') && await vis(page, '#pw-repeat') && !(await vis(page, '#pwForgot')),
      `${bredde} ikke satt: bare nytt + gjenta, ingen glemt-lenke`);
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    await page.locator('#kontoKonto').screenshot({ path: path.join(OUT, `passord-ikke-satt-${bredde}.png`) });
    await page.fill('#pw-new', 'y'.repeat(9)); await page.fill('#pw-repeat', 'y'.repeat(9)); await page.click('#savePw'); await page.waitForTimeout(700);
    sjekk(logg.pw.join('|') === 'password' && await tekst(page, '#pwVerdi') === '••••••••' && await tekst(page, '#radPassord [data-endre]') === 'Endre',
      `${bredde} ikke satt → Lagre sender {${logg.pw}}, raden bytter til «Endre»`);
    sjekk(errs.length === 0, `${bredde} ikke satt: JS-feil ${errs.join(' | ')}`); await page.close(); }
  { const { page, errs, logg } = await side(bredde, { scen: 'vekst' });
    await page.click('#radPassord [data-endre]'); await page.waitForTimeout(200);
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    await page.locator('#kontoKonto').screenshot({ path: path.join(OUT, `passord-satt-${bredde}.png`) });
    await page.click('#pwForgot'); await page.waitForTimeout(500);
    sjekk(logg.magic.length === 1 && logg.magic[0].email === 'henrik@grandbarber.no' && await tekst(page, '#pwForgotOk') === 'Sjekk e-posten din. Vi har sendt en lenke til henrik@grandbarber.no.',
      `${bredde} glemt: POST /api/send-magic-link {email} + «${await tekst(page, '#pwForgotOk')}»`);
    await page.locator('#kontoKonto').screenshot({ path: path.join(OUT, `passord-glemt-${bredde}.png`) });
    sjekk(errs.length === 0, `${bredde} satt/glemt: JS-feil ${errs.join(' | ')}`); await page.close(); }
  { // Avpublisering feiler → feilen står rett ved knappen nederst, ikke i #pubErr
    const { page, errs, logg, dialoger } = await side(bredde, { scen: 'vekst', godta: true, pageStatus: () => [500, { error: 'Kunne ikke avpublisere. Prøv igjen.' }] });
    await page.click('#unpublish'); await page.waitForTimeout(900);
    const pos = await page.evaluate(() => { const b = document.getElementById('unpublish').getBoundingClientRect(), e = document.getElementById('avpubErr').getBoundingClientRect();
      return { avstand: Math.round(e.top - b.bottom) }; });
    sjekk(logg.pageStatus.join() === 'forhandsvist' && dialoger.length === 1 && await vis(page, '#avpubErr') && await tekst(page, '#avpubErr') === 'Kunne ikke avpublisere. Prøv igjen.'
      && !(await vis(page, '#pubErr')) && pos.avstand >= 0 && pos.avstand < 24, `${bredde} avpubliseringsfeil ved knappen (avstand ${pos.avstand}px), #pubErr tom`);
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    const r = await page.evaluate(() => { const a = document.getElementById('kontoHjelp').getBoundingClientRect(), b = document.querySelector('.konto-brand').getBoundingClientRect();
      return { y: a.bottom + scrollY - 10, h: b.top - a.bottom + 20 }; });
    await page.screenshot({ path: path.join(OUT, `avpublisering-feil-${bredde}.png`), clip: { x: 0, y: r.y, width: bredde, height: r.h }, fullPage: true });
    sjekk(errs.length === 0, `${bredde} avpublisering: JS-feil ${errs.join(' | ')}`); await page.close(); }
  { // Publisering (tilstand 0) feiler → feilen blir i abonnementskortet
    const { page, errs } = await side(bredde, { scen: 'gratis-0', billing: () => ({ ...SCEN['gratis-0'](), page_status: 'forhandsvist' }),
      pageStatus: () => [400, { error: 'Minst én tjeneste med pris kreves for å gå live' }] });
    await page.click('#kontoAksjon'); await page.waitForTimeout(900);
    sjekk(await vis(page, '#pubErr') && !!(await page.$('#kontoAbonnement #pubErr')) && /Minst én tjeneste/.test(await tekst(page, '#pubErr')) && !(await vis(page, '#avpubErr')),
      `${bredde} publiseringsfeil i abonnementskortet: «${await tekst(page, '#pubErr')}»`);
    sjekk(errs.length === 0, `${bredde} publisering: JS-feil ${errs.join(' | ')}`); await page.close(); }
  { // SMS-kortet (Gratis 120)
    const { page, errs } = await side(bredde, { scen: 'gratis-120' });
    sjekk(await page.$eval('#kontoSms .kt-h', e => e.textContent.trim()) === 'SMS-påminnelser' && await tekst(page, '#smsBryterTekst') === 'Påminnelse dagen før',
      `${bredde} SMS-kort: overskrift «SMS-påminnelser», bryter-rad «Påminnelse dagen før»`);
    await page.addStyleTag({ content: '.bunn-nav{visibility:hidden!important}' });
    await page.locator('#kontoSms').screenshot({ path: path.join(OUT, `sms-kort-${bredde}.png`) });
    sjekk(errs.length === 0, `${bredde} SMS-kort: JS-feil ${errs.join(' | ')}`); await page.close(); }
}
{ // Tankestrek ut av feedback-kortet i Hjelp
  const { page, errs } = await side(375, { scen: 'vekst' });
  const t = await page.$$eval('#kontoHjelp .block-s', ps => ps.map(p => p.textContent));
  sjekk(t.includes('Ønsker du en ny funksjon, farge eller layout? Send oss, vi leser alt.') && !t.some(x => x.includes('—')), 'Hjelp: «Send oss, vi leser alt.» uten tankestrek');
  sjekk(errs.length === 0, `Hjelp: JS-feil ${errs.join(' | ')}`); await page.close();
}
{ // Gammel backend uten sendt_maaned → intet tall; needs_attention → prikk ved overskriften
  const { page, errs } = await side(375, { scen: 'gratis-0', smsTall: false, billing: () => ({ ...SCEN['gratis-0'](), needs_attention: true }) });
  sjekk(await tekst(page, '#smsMaanedTall') === '' , 'SMS-logg uten sendt_maaned: intet tall');
  sjekk(await vis(page, '#kontoAccDot') && await vis(page, '#kontoAbonnement .kt-h #kontoAccDot'), 'needs_attention: prikk ved «Abonnement og publisering»');
  sjekk(errs.length === 0, `gammel backend: JS-feil ${errs.join(' | ')}`);
  await page.close();
}
{ // Tjenester & tider: kalenderen øverst (arvet fra konto-trekkspill.mjs)
  for (const bredde of [320, 402]) {
    const { page, errs } = await side(bredde, { scen: 'vekst' });
    await page.$eval('button[data-panel="tjenester"]', b => b.click()); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const g = document.querySelector('#gcal').getBoundingClientRect(); const h = document.querySelector('#hoursList').getBoundingClientRect();
      const forste = document.querySelector('#tjenester .svc-group-h'); const f = forste ? forste.getBoundingClientRect() : null;
      return { overTjenester: !f || g.bottom <= f.top, overTider: g.bottom <= h.top };
    });
    sjekk(t.overTjenester && t.overTider, `${bredde} Tjenester: Google Kalender øverst`);
    sjekk(errs.length === 0, `${bredde} Tjenester: JS-feil ${errs.join(' | ')}`);
    await page.close();
  }
}
sjekk(apiForsok === apiMocket, `alle ${apiForsok} kall mot api.trybarberhq.com besvart av mocken (${apiMocket}) — ingen nådde prod`);
sjekk(skrivUventet.length === 0, `uventede skrivende kall: ${skrivUventet.join(', ') || 0}`);
await browser.close(); server.close();
console.log(feil ? `${feil} FEIL` : 'Alt grønt — bilder i ' + OUT);
process.exit(feil ? 1 : 0);
