/**
 * Screenshot-sjekk av layout-galleriet i site/en/kom-i-gang.html, 320 + 375 px.
 * Går gjennom steg 1 (land = UK) for å komme til steg 2 der galleriet ligger,
 * og åpner lightboxen på Profile for å se logoen i full størrelse.
 */
import path from 'path';
import fs from 'fs';
const { chromium } = await import('file:///C:/Users/henri/Desktop/barberhq-frontend/node_modules/playwright/index.mjs');

const FILE = 'file:///C:/Users/henri/Desktop/barberhq-frontend/site/en/kom-i-gang.html';
const OUT = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-backend-barberhq-backend/c5080607-bbbb-4468-a157-d064ed083d38/scratchpad/kom-i-gang';
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
for (const w of [320, 375]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const feil = [];
  p.on('requestfailed', r => { if (/\.webp/.test(r.url())) feil.push(r.url()); });

  await p.goto(FILE, { waitUntil: 'networkidle' });
  await p.fill('#o-name', 'James Carter');
  await p.fill('#o-shop', 'Carter & Sons');
  await p.fill('#o-city', 'Manchester');
  await p.fill('#o-email', 'james@carterandsons.co.uk');
  await p.click('.cbtn[data-country="UK"]');
  await p.click('#obForm .ob-submit');
  await p.waitForTimeout(700);

  await p.locator('#layGrid').screenshot({ path: path.join(OUT, `${w}-galleri.png`) });

  // lightbox på Profile
  await p.click('.pcard[data-key="profil"] .lay-exp');
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, `${w}-lightbox-profil.png`) });

  // lastes bildene faktisk, og fra fil (ikke base64)?
  const bilder = await p.evaluate(() => [...document.querySelectorAll('#layGrid img.lthumb')].map(i => ({
    src: i.getAttribute('src'), lastet: i.complete && i.naturalWidth > 0, nat: i.naturalWidth + 'x' + i.naturalHeight,
  })));
  console.log(`\n── ${w}px ──`);
  bilder.forEach(i => console.log(`  ${i.lastet ? 'OK ' : 'FEIL'} ${i.nat.padEnd(10)} ${i.src}`));
  console.log(`  base64 i src: ${bilder.some(i => i.src.startsWith('data:'))}`);
  console.log(`  feilede webp-requests: ${feil.length ? feil.join(', ') : 'ingen'}`);
  await ctx.close();
}
await b.close();
console.log('\nBilder i', OUT);
