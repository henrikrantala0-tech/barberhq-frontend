// BarberHQ logo — rasteriser master-SVG-ene til alle PNG-varianter.
// Krever:  npm install sharp png-to-ico   (kjør build_svg.py først)
// Kjør:    node build_png.mjs
//
// Skriver til ../../assets/logo/{email,social,og,favicon}.
// MERK: favicon/ genereres men committes ikke (utsatt) — se prosjektbeslutning.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOGO = join(HERE, '..', '..', 'assets', 'logo');
for (const d of ['email', 'social', 'og', 'favicon']) mkdirSync(join(LOGO, d), { recursive: true });

const master  = readFileSync(join(LOGO, 'barberhq.svg'), 'utf8');
const bMaster = readFileSync(join(LOGO, 'b.svg'), 'utf8');

function aspect(svg) {
  const m = svg.match(/viewBox="([\-\d.]+) ([\-\d.]+) ([\-\d.]+) ([\-\d.]+)"/).slice(1).map(Number);
  return m[2] / m[3];
}
const AR = aspect(master), AR_B = aspect(bMaster);

// Rendrer vektor-SVG direkte i mål-oppløsning (skarpt, ingen upscaling)
function render(svg, fill, w, h) {
  const s = svg.replace('fill="currentColor"', `fill="${fill}"`).replace('<svg ', `<svg width="${w}" height="${h}" `);
  return sharp(Buffer.from(s)).png();
}
const RGBA = (r, g, b) => ({ r, g, b, alpha: 1 });
const DARK = RGBA(10, 10, 10);     // #0a0a0a
const WHITE = RGBA(255, 255, 255); // #ffffff
const p = (...a) => join(LOGO, ...a);

async function square(size, textFill, bg, outfile) {
  const wmW = Math.round(size * 0.76), wmH = Math.round(wmW / AR);
  const wm = await render(master, textFill, wmW, wmH).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: wm, gravity: 'center' }]).png().toFile(outfile);
}
async function faviconB(size, outfile) {
  const bH = Math.round(size * 0.72), bW = Math.round(bH * AR_B);
  const b = await render(bMaster, '#ffffff', bW, bH).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: DARK } })
    .composite([{ input: b, gravity: 'center' }]).png().toFile(outfile);
}

// 1) E-post — høyde 40px @2x = 80px, transparent
await render(master, '#1a1a1a', Math.round(80 * AR), 80).toFile(p('email', 'barberhq-dark@2x.png'));
await render(master, '#ffffff', Math.round(80 * AR), 80).toFile(p('email', 'barberhq-light@2x.png'));

// 2) Sosiale — kvadrat, 12% marg/side (merke = 76% bredde)
for (const s of [1024, 512, 400]) {
  await square(s, '#ffffff', DARK,  p('social', `barberhq-square-dark-${s}.png`));
  await square(s, '#0a0a0a', WHITE, p('social', `barberhq-square-light-${s}.png`));
}

// 3) Open Graph — 1200x630, hvitt ordmerke på #0a0a0a, sentrert
{
  const W = 1200, H = 630;
  const wmW = Math.round(W * 0.60), wmH = Math.round(wmW / AR);
  const wm = await render(master, '#ffffff', wmW, wmH).toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: DARK } })
    .composite([{ input: wm, gravity: 'center' }]).png().toFile(p('og', 'barberhq-og-1200x630.png'));
}

// 4) Favicon — kun B, hvit på #0a0a0a (genereres, committes ikke enda)
await faviconB(32,  p('favicon', 'favicon-32.png'));
await faviconB(16,  p('favicon', 'favicon-16.png'));
await faviconB(180, p('favicon', 'apple-touch-icon-180.png'));
writeFileSync(p('favicon', 'favicon.ico'), await pngToIco([p('favicon', 'favicon-16.png'), p('favicon', 'favicon-32.png')]));

console.log('FERDIG — email, social, og, favicon skrevet');
