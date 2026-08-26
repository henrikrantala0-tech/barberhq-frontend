// Vekst → Rebooking: intervall-pillene i og utenfor prøveperioden.
//
// To ting verifiseres, og begge er «feil som ser riktige ut»:
//
//   1. PILLENE ER ALDRI DISABLED. Valget lagres under prøven og gjelder fra konvertering.
//      En låst pille ville lest som «du kan ikke velge ennå», mens sannheten er «du kan
//      velge, men prøven sender uansett etter 28». Derfor låser vi ikke — vi FORKLARER,
//      med info-ikonet ved «Send etter». Testen asserter disabled=false i ALLE tilstander,
//      også de der ikonet er skjult, så ingen sniker inn en låsing senere.
//
//   2. INGEN OPPDIKTET 28. Feiler GET /settings, er rebooking_interval_days null — ikke 28.
//      28 er en gyldig lagret verdi, så en fallback-28 tenner pilla som om det var barberens
//      eget valg. Ukjent skal se ukjent ut: null → ingen aktiv pille. Merk at det ikke lenger
//      finnes noe hint under pillene — den TOMME raden er hele signalet, og testen sjekker
//      derfor eksplisitt at #rebookHint ikke finnes.
//
//   3. INGEN PLASSHOLDER SOM LYVER. #rebookPreview er tom til /sms-preview svarer. Der sto
//      «SMS-utsending kobles på snart», som er usant nå — systemet sender.
//
// trial_days_left, ALDRI days_left (se advarselen over renderKonto i dashboard.html):
//   null = ikke startet · 0 = utløpt · >0 = løper. Kun >0 skal vise ikonet.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
               '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const FEILTEKST = 'Kunne ikke hente innstillingene — last siden på nytt.';
const NOTE = 'I prøveperioden sendes rebooking etter 28 dager. Valget ditt gjelder etter prøven.';

// billing: kun feltene noten leser. page_status live så Konto ikke havner i en rar gren.
const bill = (trialDaysLeft) => ({
  subscription_status: trialDaysLeft > 0 ? null : 'active', page_status: 'live',
  days_left: 99, trial_ends_at: null,            // Stripes felt — skal IKKE brukes av noten
  trial_days_left: trialDaysLeft, myk_periode: false,
  needs_attention: false, attention_grunn: null, nedtaking_dager_igjen: null,
});

const CASE = [
  { navn:'prove-loper',      trial:12,   settings:{ rebooking_interval_days:35 }, note:true,  pille:'35' },
  { navn:'prove-utlopt',     trial:0,    settings:{ rebooking_interval_days:35 }, note:false, pille:'35' },
  { navn:'prove-ikke-start', trial:null, settings:{ rebooking_interval_days:28 }, note:false, pille:'28' },
  // Feilet /settings: ingen aktiv pille, hint fram. Noten følger prøven som ellers.
  { navn:'settings-feiler',  trial:12,   settings:'FEIL',                          note:true,  pille:null },
  // Lagret verdi utenfor settet (gammel 30) — samme utfall som ukjent, uten at det er en feil.
  { navn:'ukjent-verdi',     trial:0,    settings:{ rebooking_interval_days:30 }, note:false, pille:null },
];

const browser = await chromium.launch();
const rapport = [];

for (const bredde of [320, 402, 1280]) {
  for (const c of CASE) {
    const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    let skriv = 0;   // PUT/POST mot /settings — skal være 0 når kallet har feilet
    await page.route('**/api/**', route => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/dashboard/billing/status')
        return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(bill(c.trial)) });
      if (u.pathname === '/api/dashboard/settings') {
        if (route.request().method() !== 'GET') { skriv++; return route.fulfill({status:200,contentType:'application/json',body:'{}'}); }
        if (c.settings === 'FEIL') return route.fulfill({ status:500, contentType:'application/json', body:'{}' });
        return route.fulfill({ status:200, contentType:'application/json',
          body: JSON.stringify({ sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, ...c.settings }) });
      }
      if (u.pathname === '/api/dashboard/profile')
        return route.fulfill({ status:200, contentType:'application/json',
          body: JSON.stringify({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' }) });
      if (u.pathname === '/api/dashboard/preview')
        return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
      route.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify(/images|bookings|recent|services|hours|stats|attribution|winback|referrals/.test(u.pathname) ? [] : {}) });
    });

    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.$eval('button[data-panel="vekst"]', b => b.click());
    await page.waitForTimeout(700);
    // Trekkspillet er lukket by default — .acc-body har hidden. Åpne det.
    await page.$eval('#accRebook .acc-head', b => b.click());
    await page.waitForTimeout(500);

    const m = await page.evaluate(({ NOTE }) => {
      const pills = [...document.querySelectorAll('#rebookPills button')];
      const wrap  = document.getElementById('rebookInfoWrap');
      const ikon  = document.getElementById('rebookInfo');
      const tip   = document.getElementById('rebookInfoTip');
      const valgt = pills.filter(p => p.getAttribute('aria-selected') === 'true').map(p => p.dataset.days);
      const synlig = el => !!(el && !el.hidden && el.offsetParent !== null);
      return {
        antPills: pills.length,
        // disabled OG aria-disabled OG pointer-events: tre måter å låse en knapp på
        noenLaast: pills.some(p => p.disabled || p.getAttribute('aria-disabled') === 'true'
                                || getComputedStyle(p).pointerEvents === 'none'),
        valgt: valgt.join(',') || '—',
        ikonSynlig: synlig(wrap),
        tipTekstOk: !!tip && tip.textContent.trim() === NOTE,
        harIkon: !!ikon,
        // Plassholderen som lovte at utsending 'kobles på snart' skal være borte.
        preview: (document.getElementById('rebookPreview')||{}).textContent.trim(),
        // Samme plassholder sto i påminnelse-trekkspillet — også den skal være borte.
        previewPaam: (document.getElementById('paamPreview')||{}).textContent.trim(),
        // Hint-elementet skal ikke finnes i det hele tatt.
        hintFinnes: !!document.getElementById('rebookHint'),
        feilSynlig: synlig(document.getElementById('settFeil')),
        feilTekst: (document.getElementById('settFeil')||{}).textContent||'',
        bryterUbestemt: ['tog-paam','tog-rebook'].every(id => (document.getElementById(id)||{}).indeterminate === true),
        bryterAv: ['tog-paam','tog-rebook'].every(id => (document.getElementById(id)||{}).checked === false),
      };
    }, { NOTE });

    if (bredde === 402) {
      const box = await page.$('#accRebook');
      if (box) await box.screenshot({ path:`${OUT}/402-rebook-${c.navn}.png` });
      // Feilmeldinga står OVER .acc-list, altså utenfor #accRebook. Eget bilde av hele
      // blokka, ellers viser skjermbildet bryterne uten meldinga som forklarer dem.
      if (c.settings === 'FEIL') {
        const hel = await page.evaluateHandle(() => document.querySelector('.acc-list').parentElement);
        await hel.asElement().screenshot({ path:`${OUT}/402-rebook-feil-hel.png` });
      }
    }

    // Klikkbarhet i praksis, ikke bare attributter: trykk 45 og se at den blir valgt.
    let klikkbar = '—';
    if (c.navn === 'prove-loper') {
      await page.$eval('#rebookPills button[data-days="45"]', b => b.click());
      await page.waitForTimeout(250);
      klikkbar = await page.$eval('#rebookPills button[data-days="45"]',
        b => b.getAttribute('aria-selected') === 'true' ? 'ja ✓' : 'NEI ✗');
    }

    // Boblen på TRYKK, ikke bare hover — dashbordet er mobil-primært, og en tooltip som
    // bare finnes på hover er usynlig for de fleste barberere. Testes der ikonet er synlig.
    let tipTrykk = '—';
    if (m.ikonSynlig) {
      await page.click('#rebookInfo');
      await page.waitForTimeout(200);
      const aapen = await page.$eval('#rebookInfoTip', t => !t.hidden);
      if (bredde === 402) {
        const box = await page.$('#accRebook');
        if (box) await box.screenshot({ path:`${OUT}/402-rebook-${c.navn}-tip.png` });
      }
      // Trykk utenfor skal lukke igjen (ingen mouseleave på touch).
      await page.click('#rebookPills');
      await page.waitForTimeout(200);
      const lukket = await page.$eval('#rebookInfoTip', t => t.hidden);
      tipTrykk = (aapen && lukket) ? 'åpner+lukker ✓' : (aapen ? 'lukker IKKE ✗' : 'åpner IKKE ✗');
    }

    // VAKT: ved feilet kall skal INGEN interaksjon skrive til /settings. Trykk begge
    // bryterne og en pille, og krev at telleren står på 0. Uten dette ville en PUT sendt
    // en verdi barbereren aldri valgte — han trykket bare på en kontroll som viste feil
    // utgangspunkt. Kjøres kun i FEIL-caset; ellers er skriving nettopp det som skal skje.
    let skrivEtterKlikk = '—', bryterHoldt = '—';
    if (c.settings === 'FEIL') {
      const foer = skriv;
      // Input-en er opacity:0;width:0;height:0 — den kan ikke klikkes. Brukeren trykker
      // .sl-spanet inne i <label class="sw">, som er det som faktisk toggler checkboxen.
      await page.click('#tog-paam + .sl');
      await page.click('#tog-rebook + .sl');
      await page.click('#rebookPills button[data-days="45"]');
      await page.waitForTimeout(400);
      skrivEtterKlikk = (skriv - foer) === 0 ? '0 ✓' : ((skriv - foer) + ' ✗');
      // Bryterne skal FORTSATT være ubestemte etter klikket, ikke ha snudd til på.
      const etter = await page.evaluate(() => ['tog-paam','tog-rebook']
        .every(id => { const e = document.getElementById(id); return e.indeterminate === true && e.checked === false; }));
      const pilleTent = await page.evaluate(() =>
        [...document.querySelectorAll('#rebookPills button')].some(b => b.getAttribute('aria-selected') === 'true'));
      bryterHoldt = (etter && !pilleTent) ? 'ubestemt ✓' : 'GA ETTER ✗';
    }

    rapport.push({
      bredde, case: c.navn,
      pills: m.antPills,
      låst: m.noenLaast ? 'JA ✗' : 'nei ✓',
      valgt: m.valgt,
      'valgt ok': m.valgt === (c.pille || '—') ? 'ok ✓' : 'AVVIK ✗',
      ikon: m.ikonSynlig ? 'vist' : 'skjult',
      'ikon ok': m.ikonSynlig === c.note ? 'ok ✓' : 'AVVIK ✗',
      'tip-tekst': m.tipTekstOk ? 'ok ✓' : 'AVVIK ✗',
      'tip trykk': tipTrykk,
      'hint borte': m.hintFinnes ? 'FINNES ✗' : 'ok ✓',
      bryter: m.bryterUbestemt ? 'ubestemt' : (m.bryterAv ? 'av' : 'på/blandet'),
      'bryter ok': (m.bryterUbestemt === (c.settings === 'FEIL')) ? 'ok ✓' : 'AVVIK ✗',
      'skriv v/feil': skrivEtterKlikk,
      'holdt seg': bryterHoldt,
      feilmelding: m.feilSynlig ? 'vist' : 'skjult',
      'feil ok': (m.feilSynlig === (c.settings === 'FEIL')
                  && (!m.feilSynlig || m.feilTekst.trim() === FEILTEKST)) ? 'ok ✓' : 'AVVIK ✗',
      'preview tom': m.preview === '' ? 'ok ✓' : ('«' + m.preview.slice(0, 22) + '»'),
      'paam tom': m.previewPaam === '' ? 'ok ✓' : ('«' + m.previewPaam.slice(0, 18) + '»'),
      klikkbar,
      jsfeil: errs.length ? errs.join('; ').slice(0, 40) : 'ingen',
    });
    await page.close();
  }
}

console.table(rapport);
const ok = rapport.every(r => r.låst === 'nei ✓' && r['valgt ok'] === 'ok ✓'
  && r['ikon ok'] === 'ok ✓' && r['tip-tekst'] === 'ok ✓' && r['hint borte'] === 'ok ✓'
  && r['preview tom'] === 'ok ✓' && r['paam tom'] === 'ok ✓' && r['feil ok'] === 'ok ✓' && r['bryter ok'] === 'ok ✓'
  && (r['skriv v/feil'] === '—' || r['skriv v/feil'] === '0 ✓')
  && (r['holdt seg'] === '—' || r['holdt seg'] === 'ubestemt ✓') && r.jsfeil === 'ingen'
  && (r.klikkbar === '—' || r.klikkbar === 'ja ✓')
  && (r['tip trykk'] === '—' || r['tip trykk'] === 'åpner+lukker ✓'));
console.log('\npiller aldri låst:  ', rapport.every(r => r.låst === 'nei ✓') ? 'ja ✓' : 'NEI ✗');
console.log('ingen oppdiktet 28: ', rapport.filter(r => r.case === 'settings-feiler')
  .every(r => r.valgt === '—') ? 'ja ✓' : 'NEI ✗');
console.log('hint fjernet:       ', rapport.every(r => r['hint borte'] === 'ok ✓') ? 'ja ✓' : 'NEI ✗');
console.log('plassholder borte:  ', rapport.every(r => r['preview tom'] === 'ok ✓' && r['paam tom'] === 'ok ✓') ? 'ja ✓ (begge)' : 'NEI ✗');
console.log('ikon kun i prøve:   ', rapport.every(r => r['ikon ok'] === 'ok ✓') ? 'ja ✓' : 'NEI ✗');
console.log('feil sier fra:     ', rapport.every(r => r['feil ok'] === 'ok ✓') ? 'ja ✓' : 'NEI ✗');
console.log('bryter ubestemt:    ', rapport.every(r => r['bryter ok'] === 'ok ✓') ? 'ja ✓' : 'NEI ✗');
console.log('ingen skriv v/feil: ', rapport.every(r => r['skriv v/feil'] === '—' || r['skriv v/feil'] === '0 ✓') ? 'ja ✓' : 'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
