/**
 * Maler bort «EST. OSLO» i Grand Barber-logoen.
 *
 * Retusjen gjøres på LOGO-UTKLIPPET, ikke på den ferdige no/layout-profil.webp.
 * Grunnen: profil-mockupen bygges på nytt av malpipelinen fra dette utklippet,
 * så en retusj i den ferdige webp-en ville blitt overskrevet ved neste render.
 * Retusjer man kilden, er den borte i alle framtidige renders.
 *
 * Målt i logo.png (404x408): teksten ligger på y 317..328, x 162..239.
 * Radene 306..316 og 329..333 er rene, og x 95..162 / 238..304 er ren mørk
 * flate på alle tekstradene.
 *
 * Metode: for hver rad speiles rene piksler fra samme rad inn over teksten
 * (venstre halvdel fra venstre side, høyre halvdel fra høyre). Da beholdes
 * både den vertikale gradienten og kornet i emblemflaten — ingen flat klatt.
 * Kantene mykes med en 5 px alpharampe så det ikke blir en synlig sømkant.
 */
import { createRequire } from 'module';
const sharp = createRequire('C:/Users/henri/Desktop/barberhq-frontend/')('sharp');

const S = 'C:/Users/henri/AppData/Local/Temp/claude/C--Users-henri-Desktop-barberhq-backend-barberhq-backend/c5080607-bbbb-4468-a157-d064ed083d38/scratchpad';
const IN = S + '/foto/logo.png';
const UT = S + '/foto/logo-retusj.png';

const X0 = 156, X1 = 246, Y0 = 312, Y1 = 334;   // felt som males over
const FJÆR = 5;                                   // mykning i px

const { data, info } = await sharp(IN).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const ut = Buffer.from(data);

const XC = Math.round((X0 + X1) / 2);
const rampe = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

for (let y = Y0; y <= Y1; y++) {
  for (let x = X0; x <= X1; x++) {
    // speil rene piksler inn fra nærmeste rene side på SAMME rad
    const src = x < XC ? X0 - 1 - (x - X0) : X1 + 1 + (X1 - x);
    if (src < 0 || src >= W) continue;

    // myk kant: full erstatning i midten, gradvis mot rendene
    const a = Math.min(
      rampe(x - X0, 0, FJÆR), rampe(X1 - x, 0, FJÆR),
      rampe(y - Y0, 0, FJÆR), rampe(Y1 - y, 0, FJÆR),
    );
    const i = (y * W + x) * C, j = (y * W + src) * C;
    for (let c = 0; c < C; c++) ut[i + c] = Math.round(data[i + c] * (1 - a) + data[j + c] * a);
  }
}

await sharp(ut, { raw: { width: W, height: H, channels: C } }).png().toFile(UT);

// kontroll: er det lyse piksler igjen der teksten sto?
const { data: sjekk } = await sharp(UT).removeAlpha().raw().toBuffer({ resolveWithObject: true });
let rest = 0, maks = 0;
for (let y = 314; y <= 332; y++) for (let x = 158; x <= 244; x++) {
  const i = (y * W + x) * C, l = (sjekk[i] + sjekk[i + 1] + sjekk[i + 2]) / 3;
  if (l > 55) rest++;
  if (l > maks) maks = l;
}
console.log(`piksler over terskel der teksten sto: ${rest} (var 141), lysest nå: ${maks.toFixed(0)}`);

// zoom for visuell kontroll: før/etter side ved side
const boks = { left: 120, top: 280, width: 170, height: 80 };
const [f, e] = await Promise.all([
  sharp(IN).extract(boks).resize(680, 320, { kernel: 'nearest' }).png().toBuffer(),
  sharp(UT).extract(boks).resize(680, 320, { kernel: 'nearest' }).png().toBuffer(),
]);
await sharp({ create: { width: 680, height: 660, channels: 3, background: '#c00' } })
  .composite([{ input: f, top: 0, left: 0 }, { input: e, top: 340, left: 0 }])
  .png().toFile(S + '/foto/_retusj-for-etter.png');
console.log('før/etter:', S + '/foto/_retusj-for-etter.png');
