/**
 * Setter de fire engelske skjermrenderne inn i telefonrammen fra no/-mockupene,
 * så en/-galleriet blir 832x1740 med transparent bakgrunn, akkurat som no/.
 *
 * Rammen (bezel + avrundede hjørner) og status-linja (9:41 + Dynamic Island +
 * ikoner) finnes bare som ferdige piksler i de leverte webp-ene. Derfor:
 *   - basen er layout-direkte.webp (flat bakgrunn i toppen -> ren nøkling)
 *   - skjermflaten (26,26,780,1688) byttes ut, maskert med skjermens egen
 *     avrundede hjørneform hentet fra basen
 *   - status-linja legges tilbake oppå, nøklet på avstand fra basens
 *     bakgrunnsfarge (island = svart, glyfer = hvite, bakgrunn = gjennomsiktig)
 */
import { createRequire } from 'module';
import fs from 'fs';
const sharp = createRequire('C:/Users/henri/Desktop/barberhq-frontend/')('sharp');

const NO_IMAGES = 'C:/Users/henri/Desktop/barberhq-frontend/site/no/images';
const S = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-backend-barberhq-backend/c5080607-bbbb-4468-a157-d064ed083d38/scratchpad';
const OUT = S + '/mockup';
fs.mkdirSync(OUT, { recursive: true });

const FW = 832, FH = 1740;              // hele mockupen
const X = 26, Y = 26, W = 780, H = 1688; // skjermflaten
const CORNER = 150;                      // hjørneboks vi henter maskeform fra
const STATUS_H = 100;                    // høyden på status-linja i basen
const BASE = NO_IMAGES + '/layout-direkte.webp';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

// skjermflaten fra basen, som råpiksler
const { data: base, info } = await sharp(BASE)
  .extract({ left: X, top: Y, width: W, height: H }).removeAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const C = info.channels;

// ── 1) hjørnemaske: skjermen er alt som IKKE er den svarte bezel-en ────────
const mask = Buffer.alloc(W * H, 255);
const iHjørne = (x, y) => (x < CORNER || x >= W - CORNER) && (y < CORNER || y >= H - CORNER);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (!iHjørne(x, y)) continue;
    const i = (y * W + x) * C;
    mask[y * W + x] = clamp((lum(base[i], base[i + 1], base[i + 2]) - 4) * 24);
  }
}

// ── 2) status-linje-overlegg: nøklet på avstand fra basens bakgrunnsfarge ──
const BG_LUM = lum(base[(120 * W + 20) * C], base[(120 * W + 20) * C + 1], base[(120 * W + 20) * C + 2]);
const status = Buffer.alloc(W * STATUS_H * 4);
for (let y = 0; y < STATUS_H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C, o = (y * W + x) * 4;
    status[o] = base[i]; status[o + 1] = base[i + 1]; status[o + 2] = base[i + 2];
    status[o + 3] = clamp((Math.abs(lum(base[i], base[i + 1], base[i + 2]) - BG_LUM) - 6) * 12);
  }
}
const statusPng = await sharp(status, { raw: { width: W, height: STATUS_H, channels: 4 } }).png().toBuffer();

// ── 3) sett sammen ────────────────────────────────────────────────────────
for (const key of ['showcase', 'hero', 'profil', 'direkte']) {
  const rgb = await sharp(S + '/skjerm/' + key + '.png').resize(W, H).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = rgb[p * 3]; rgba[p * 4 + 1] = rgb[p * 3 + 1]; rgba[p * 4 + 2] = rgb[p * 3 + 2];
    rgba[p * 4 + 3] = mask[p];
  }
  const skjermPng = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

  await sharp(BASE)
    .composite([
      { input: skjermPng, top: Y, left: X },
      { input: statusPng, top: Y, left: X },
    ])
    .webp({ quality: 92 })
    .toFile(`${OUT}/layout-${key}.webp`);
  const m = await sharp(`${OUT}/layout-${key}.webp`).metadata();
  console.log(`layout-${key}.webp  ${m.width}x${m.height}  alpha=${m.hasAlpha}  ${(fs.statSync(`${OUT}/layout-${key}.webp`).size / 1024 | 0)}KB`);
}
