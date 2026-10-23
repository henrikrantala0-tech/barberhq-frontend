// tools/render/v1-vakt.mjs — ingen rester av v1 («Din side» med layouter, stiler og paletter) i frontend (23.10.2026).
//
//   node tools/render/v1-vakt.mjs          # exit 1 ved treff
//
// v1 er fjernet: alle barbere er v2 (én fast mal: lys/mørk, blå/gull/rød/egen aksent, skrift på sjappenavnet,
// bilder = portrett + galleri). Denne vakta søker gjennom site/ og tools/render/ etter v1-begrepene og feiler hvis
// de dukker opp igjen. Mønstrene er PRESISE — vanlige ord som «hero» (forsidens hero-seksjon), «direkte» («betaler
// deg direkte»), «layout» (CSS) og «Profil» (v2-steget) gir ikke treff. Unntak står i UNNTAK med begrunnelse.
import fs from 'node:fs'; import path from 'node:path';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const MAPPER = ['site', 'tools/render'];
const HOPP = [/[\\/]node_modules[\\/]/, /[\\/]\.render-ut[\\/]/, /v1-vakt\.mjs$/];
const TEKST = /\.(html|js|mjs|cjs|css|json|txt|xml|md|toml)$/i;

// Filer/kataloger som ikke skal finnes.
const FORBUDTE_STIER = [
  [/^site[\\/](sv|da|en)([\\/]|$)/, 'sv/da/en (slettet, 301 til /no/)'],
  [/layout-(direkte|showcase|profil|hero)\.webp$/i, 'v1-layoutbilde'],
  [/pv-(hero|profil|direkte|showcase)-|pv-showcase-(lime|custom)/i, 'v1-forhåndsvisning (funksjoner)'],
  [/palett\.js$/i, 'v1-palettene'],
  [/preview-tjenester\.html$/i, 'v1-preview-iframe'],
];
// Innhold. Hvert mønster er et v1-begrep; navnet sier hvorfor.
const MONSTRE = [
  [/\bshowcase\b/i, 'layout «showcase»'],
  [/\bLAYOUTS\b|savedLayout|design\.layout|data-layout\b|layoutHint|renderSlotView|layout\s*:\s*['"](direkte|showcase|profil|hero)['"]/, 'v1-layoutvalg'],
  [/\b(Klassisk|Signatur|Kraftig)\b/, 'v1-stil (Klassisk/Signatur/Moderne/Kraftig)'],
  [/\bLime\b|Street mint|\bPALETTES\b|buildPalette|paletteGrid|--palett-|palette\s*:\s*['"]/, 'v1-palett'],
  [/\bmint\b|\bkrem\b/i, 'v1-palett (mint/krem)'],
  [/grotesk/i, 'v1-font Space Grotesk'],
  [/slideshow/i, 'v1-slideshow'],
  [/hero-fade|slot\s*===?\s*['"]hero['"]|['"]?hero['"]?\s*:\s*1\b/, 'v1 hero-slot'],
  [/\bsidemal\b|\berV2\b|\bsm-v[12]\b|v1-kun|sjekkPill|loadDesign\b/, 'v1/v2-grein i frontend'],
  [/\/api\/dashboard\/preview\?/, 'v1-preview (GET /preview?layout&palette…)'],
];
// Unntak: [fil (relativ, / som skille), mønsternavn, begrunnelse]
const UNNTAK = [
  ['tools/render/dinside-v2.mjs', 'v1 hero-slot', 'testen viser at hero-bilder i backend-data (flyttede barbere) IKKE telles i imageVersion'],
  ['tools/render/dinside-v2-oppsett.mjs', 'v1/v2-grein i frontend', 'e2e mot lokal DB: barbers.sidemal er backend-kolonnen, ikke en frontend-grein'],
  ['tools/render/dinside-v2.mjs', 'v1/v2-grein i frontend', 'negativ test: lista over gammel v1-markup som IKKE skal finnes i DOM-en'],
  ['tools/render/fixtures/plakat-mal2-preview.html', 'v1-font Space Grotesk', 'lagret plakat-render fra backend; plakatens fonter eies av backend'],
  // Plakaten: bakgrunnen utledes fortsatt av barbers.palette (sand → beige) i BÅDE frontend og backend (backend 400-er mørk for
  // sand). Fjernes når backend gjør plakaten v2 (bakgrunn = color_mode). Til da må testen mocke v1-paletten.
  ['tools/render/plakat-editor.mjs', 'v1-palett', 'plakaten bruker barbers.palette (sand) til den er v2 i backend'],
  ['tools/render/plakat-editor.mjs', 'v1-palett (mint/krem)', 'som over'],
  ['tools/render/plakat-editor.mjs', 'v1-layoutvalg', 'mock av GET /design (plakaten leser palette/mode derfra)'],
];

const funn = [];
function gaa(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(REPO, full).split(path.sep).join('/');
    if (HOPP.some(r => r.test(full))) continue;
    for (const [r, hva] of FORBUDTE_STIER) if (r.test(rel)) funn.push(`${rel}: ${hva} (fila/katalogen skal ikke finnes)`);
    if (e.isDirectory()) { gaa(full); continue; }
    if (!TEKST.test(e.name)) continue;
    const linjer = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    linjer.forEach((l, i) => {
      for (const [r, hva] of MONSTRE) {
        if (!r.test(l)) continue;
        if (UNNTAK.some(([f, m]) => f === rel && m === hva)) continue;
        funn.push(`${rel}:${i + 1}: ${hva} — ${l.trim().slice(0, 110)}`);
      }
    });
  }
}
for (const m of MAPPER) gaa(path.join(REPO, m));
for (const k of ['sv', 'da', 'en']) if (fs.existsSync(path.join(REPO, 'site', k))) funn.push(`site/${k}/ finnes (skal være slettet)`);

console.log(funn.length ? funn.join('\n') : 'ingen v1-rester');
sjekk(funn.length === 0, `Ingen v1-rester i ${MAPPER.join(' og ')} (${funn.length} treff)`);
ferdig();
