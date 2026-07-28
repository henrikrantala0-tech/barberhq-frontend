/**
 * Bygger et nytt hero-foto til den engelske layout-mockupen.
 *
 * Forrige økt forlenget det rene båndet (780x900) nedover med kantkopiering
 * -> vertikale striper under haka. Her gjør vi i stedet:
 *   1) hent DET STØRSTE rene båndet (målt: tekst starter på skjerm-rad 1149,
 *      status-linja slutter rundt absolutt y=180) -> 780x995
 *   2) legg det på toppen av et 780x1688-lerret i sidens bakgrunnsfarge
 *   3) ton fotoet ned i bakgrunnsfargen over de siste ~300 px
 * Ingen piksler oppfinnes -> ingen striper. Bunnen er ren bakgrunn, som malen
 * uansett legger sin scrim + tekst oppå.
 */
import { createRequire } from 'module';
import fs from 'fs';
const sharp = createRequire('C:/Users/henri/Desktop/barberhq-frontend/')('sharp');

const NO_IMAGES = 'C:/Users/henri/Desktop/barberhq-frontend/site/no/images';
const OUT = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-backend-barberhq-backend/c5080607-bbbb-4468-a157-d064ed083d38/scratchpad';
fs.mkdirSync(OUT + '/foto', { recursive: true });

const BG = '#0a0a0a';                 // buildPalette('minimal','mork').bg
const W = 780, H = 1688;              // skjermflaten i 832x1740-mockupen
const BAND = { left: 26, top: 180, width: 780, height: 995 };
const FADE_FROM = 660;                // der nedtoningen begynner

const band = await sharp(NO_IMAGES + '/layout-hero.webp').extract(BAND).png().toBuffer();

const fade = Buffer.from(
  `<svg width="${W}" height="${H}">
     <defs><linearGradient id="g" x1="0" y1="${FADE_FROM}" x2="0" y2="${BAND.height}" gradientUnits="userSpaceOnUse">
       <stop offset="0" stop-color="${BG}" stop-opacity="0"/>
       <stop offset="0.55" stop-color="${BG}" stop-opacity="0.72"/>
       <stop offset="1" stop-color="${BG}" stop-opacity="1"/>
     </linearGradient></defs>
     <rect x="0" y="${FADE_FROM}" width="${W}" height="${BAND.height - FADE_FROM}" fill="url(#g)"/>
     <rect x="0" y="${BAND.height}" width="${W}" height="${H - BAND.height}" fill="${BG}"/>
   </svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite([{ input: band, top: 0, left: 0 }, { input: fade, top: 0, left: 0 }])
  .png()
  .toFile(OUT + '/foto/hero.png');

// gallerifotoene gjenbrukes uendret fra forrige økt sitt utklipp
const PREV = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-frontend/134f38be-3256-4090-bbb9-6ca9a983f373/scratchpad/crops';
for (const n of ['g1', 'g2', 'g3', 'g4']) fs.copyFileSync(`${PREV}/${n}.png`, `${OUT}/foto/${n}.png`);

console.log('hero.png bygget:', (await sharp(OUT + '/foto/hero.png').metadata()).width + 'x' + (await sharp(OUT + '/foto/hero.png').metadata()).height);
