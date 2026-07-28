/**
 * Rendrer de fire layout-mockupene til den ENGELSKE kom-i-gang-siden.
 * Bygger på render_layouts.mjs fra 27.07-økta, med to endringer:
 *   - nytt hero-foto (foto/hero.png) uten kantstriper
 *   - engelsk UI-tekst (malene er norsk-hardkodet; dette er REN mockup-
 *     etterbehandling av HTML-en, ikke en i18n-fiks i backend)
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const BE = 'C:/Users/henri/Desktop/barberhq-backend/barberhq-backend';
const FE = 'C:/Users/henri/Desktop/barberhq-frontend';
const SCRATCH = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-backend-barberhq-backend/c5080607-bbbb-4468-a157-d064ed083d38/scratchpad';
const FOTO = SCRATCH + '/foto';
const WORK = SCRATCH + '/html';
const OUT = SCRATCH + '/skjerm';
fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(BE + '/');
const { fill } = require(BE + '/fyll.cjs');
const { chromium } = await import('file:///' + FE + '/node_modules/playwright/index.mjs');

const b64 = (p, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
// Bildene som egne filer ved siden av HTML-en (data-URI ga ERR_INVALID_URL på ett av dem)
const photo = n => { fs.copyFileSync(FOTO + '/' + n + '.png', WORK + '/' + n + '.png'); return n + '.png'; };
const fontUri = n => b64(BE + '/fonts/' + n + '.ttf', 'font/ttf');

// ── DEMO-INNHOLD (engelsk, stedløst) ──────────────────────────────────────
const SHOP = 'Grand Barber';
const TAGLINE = 'Fades & classic cuts';
const BIO = 'Precision in every cut. Sharp fades, clean lines, no rush.';
const SERVICES = [
  { id: 1, name: "Men's cut",   minutes: 30, price_nok: 28 },
  { id: 2, name: 'Skin fade',   minutes: 40, price_nok: 32 },
  { id: 3, name: 'Cut & beard', minutes: 45, price_nok: 40 },
  { id: 4, name: 'Beard trim',  minutes: 20, price_nok: 16 },
  { id: 5, name: 'Student cut', minutes: 30, price_nok: 24 },
];

const GALLERY = ['g1', 'g2', 'g3', 'g4'].map(photo);
const PORTRAIT = photo('logo-retusj');  // Grand Barber-logoen med «EST. OSLO» malt bort
const HERO = photo('hero');

// ── Norsk → engelsk, KUN for mockupen. Lengste treff først. ───────────────
const EN = [
  ['Har du time? Endre eller avbestill', 'Have a booking? Change or cancel'],
  ['Er du sikker p\u00e5 at du vil avbestille denne timen?', 'Are you sure you want to cancel this booking?'],
  ['Velg minst &eacute;n tjeneste for &aring; booke', 'Select at least one service to book'],
  ['Velg minst \u00e9n tjeneste for \u00e5 booke', 'Select at least one service to book'],
  ['Ingen betaling n&aring; &mdash; du betaler hos barbereren.', 'No payment now &mdash; you pay at the shop.'],
  ['Ingen betaling n\u00e5 \u2014 du betaler hos barbereren.', 'No payment now \u2014 you pay at the shop.'],
  ['Velg en dato for \u00e5 se ledige tider', 'Pick a date to see available times'],
  ['Vi gleder oss til \u00e5 se deg.', 'We look forward to seeing you.'],
  ['Booking bekreftet!', 'Booking confirmed!'],
  ['Dine opplysninger', 'Your details'],
  ['Bekreft booking', 'Confirm booking'],
  ['Endre/avbestill', 'Change/cancel'],
  ['Velg tjeneste', 'Choose service'],
  ['Ledige tider', 'Available times'],
  ['Til bekreftelse', 'To confirm'],
  ['Henter tider', 'Loading times'],
  ['Se tjenester', 'See services'],
  ['Dato og tid', 'Date & time'],
  ['Ja, avbestill', 'Yes, cancel'],
  ['Bygget med', 'Built with'],
  ['Avbestill', 'Cancel booking'],
  ['Endre tid', 'Reschedule'],
  ['Velg time', 'Choose time'],
  ['Legg til', 'Add-ons'],
  ['Telefon', 'Phone'],
  ['Tilbake', 'Back'],
  ['Avbryt', 'Dismiss'],
  ['FULLT', 'FULL'],
  ['Endre', 'Change'],
  ['Navn', 'Name'],
];
const tilEngelsk = html => EN.reduce((s, [no, en]) => s.split(no).join(en), html);

const fontOpts = {
  fraunces: fontUri('Fraunces'),
  inter:    fontUri('Inter'),
  grotesk:  fontUri('SpaceGrotesk'),
  jakarta:  fontUri('PlusJakartaSans'),
};

const BASE = {
  shop: SHOP, navn: SHOP, adresse: '', epost: 'demo@example.com',
  lang: 'en', market: 'UK', palette: 'minimal', mode: 'mork', font: 'fraunces',
  bio: TAGLINE, pitch: BIO,
};

const LAYOUTS = [
  { key: 'showcase', order: { ...BASE, layout: 'showcase', images: GALLERY } },
  { key: 'hero',     order: { ...BASE, layout: 'hero',     heroImage: HERO } },
  { key: 'profil',   order: { ...BASE, layout: 'profil',   heroImage: PORTRAIT, images: GALLERY } },
  { key: 'direkte',  order: { ...BASE, layout: 'direkte' } },
];

const browser = await chromium.launch();

for (const { key, order } of LAYOUTS) {
  const tpl = fs.readFileSync(`${BE}/${key}.template.html`, 'utf8');
  let html = fill(tpl, order, { ...fontOpts, bookHref: '#', tz: 'Europe/London' }, SERVICES);

  // Backend har ingen valuta-abstraksjon — prisTekst() hardkoder ' kr'.
  html = html.replace(/(\d+)\s*kr\b/g, '£$1');
  html = tilEngelsk(html);

  // MOCKUP-ONLY: mockupen tegner en iPhone-statuslinje, men headless Chromium
  // rapporterer env(safe-area-inset-top)=0. .manage-link er absolutt plassert
  // på top:18px og havner derfor under statuslinja. Flyttes ned KUN i bildet.
  // (Samme kollisjon finnes på ekte notch-telefon — se rapport til Henrik.)
  if (key === 'direkte') {
    html = html.replace('</style>', '.page{padding-top:88px;padding-bottom:12px}.manage-link{top:52px}\n</style>');
  }

  const f = path.join(WORK, key + '.html');
  fs.writeFileSync(f, html, 'utf8');

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  await p.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, key + '.png') });

  const leftover = await p.evaluate(() => (document.documentElement.innerHTML.match(/\{\{[A-Z_]+\}\}/g) || []).slice(0, 6));
  const norsk = await p.evaluate(() => {
    const t = document.body.innerText;
    return ['Velg', 'Endre', 'tjenest', 'Avbestill', 'Bygget', 'Tilbake', 'Dato og', 'Ledige', ' kr']
      .filter(w => t.includes(w));
  });
  console.log(`${key.padEnd(9)} ufylte: ${leftover.length ? leftover.join(',') : 'ingen'} | norsk igjen: ${norsk.length ? norsk.join(',') : 'ingen'}${errs.length ? ' | console: ' + errs.slice(0, 2).join(' / ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log('\nSkjermrender i', OUT);
