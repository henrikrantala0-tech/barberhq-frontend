// Nav-vakt — feiler hvis nav/footer-lenkene har driftet fra hverandre på markedssidene.
//
// Bakgrunn: nav + footer er kopiert inn i hver HTML-fil (ingen delt kilde uten byggesteg —
// se vurderingen i chat 26.09). Da er det lett å legge en lenke til noen sider og glemme
// andre (skjedde med «Vanlige spørsmål»-lenka: lagt i desktop-navet, glemt i index sin
// mobil-panel). Denne vakta leser lenkene (TEKST + HREF) i .nav-links, .nav-panel og
// <footer> og krever at de er LIKE på tvers av de delte mal-sidene.
//
// Kjøres FØR commit som rører nav eller footer (se CLAUDE.md). Exit 1 ved avvik.
//
// Mal-sidene deler nøyaktig samme nav/footer. index er UNNTATT streng likhet fordi
// landingssida har egne nav-elementer (Se dashbordet / Mitt dashbord) og et #produkt-
// selvanker i footeren — den sjekkes i stedet som SUPERSETT for nav (må inneholde alle
// de delte lenkene, kan ha egne i tillegg). logg-inn/opprett-passord/kom-i-gang/dashboard/
// preview-tjenester har ikke denne delte nav/footer-en og er ikke med.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../site/no');
const TEMPLATE = ['funksjoner', 'priser', 'support', 'vilkar', 'vanlige-sporsmal'];
const LANDING  = 'index';

const BLOKKER = {
  'nav-links': /<div class="nav-links">[\s\S]*?<\/div>/,
  'nav-panel': /<div class="nav-panel"[^>]*>[\s\S]*?<\/div>/,
  'footer':    /<footer[\s\S]*?<\/footer>/,
};

function lenker(side, re) {
  const h = fs.readFileSync(path.join(DIR, side + '.html'), 'utf8');
  const m = h.match(re);
  if (!m) return null;                 // blokken mangler helt
  return [...m[0].matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(a => a[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() + ' → ' + a[1]);
}

let feil = 0;
for (const [navn, re] of Object.entries(BLOKKER)) {
  const perSide = {};
  for (const s of TEMPLATE) perSide[s] = lenker(s, re);

  const mangler = TEMPLATE.filter(s => perSide[s] === null);
  if (mangler.length) {
    console.error(`✗ ${navn}: blokken MANGLER på: ${mangler.join(', ')}`);
    feil++; continue;
  }

  const fasit = perSide[TEMPLATE[0]].join(' | ');
  const avvik = TEMPLATE.filter(s => perSide[s].join(' | ') !== fasit);
  if (avvik.length) {
    console.error(`✗ ${navn}: ULIKE lenker på tvers av mal-sidene:`);
    for (const s of TEMPLATE) console.error(`    ${s.padEnd(17)} ${perSide[s].join(' | ')}`);
    feil++;
    continue;
  }
  console.log(`✓ ${navn}: like på alle ${TEMPLATE.length} mal-sider (${perSide[TEMPLATE[0]].length} lenker)`);

  // index som supersett — kun for nav (footer har #produkt-selvanker, hoppes over).
  if (navn !== 'footer') {
    const idx = lenker(LANDING, re);
    if (idx === null) {
      console.error(`  ✗ ${LANDING}: ${navn}-blokken mangler`);
      feil++;
    } else {
      const savnet = perSide[TEMPLATE[0]].filter(l => !idx.includes(l));
      if (savnet.length) {
        console.error(`  ✗ ${LANDING} ${navn} mangler delte lenker: ${savnet.join(', ')}`);
        feil++;
      } else {
        console.log(`  ✓ ${LANDING} ${navn} inneholder alle delte lenker (+${idx.length - perSide[TEMPLATE[0]].length} egne)`);
      }
    }
  }
}

if (feil) {
  console.error(`\nNAV-VAKT: ${feil} problem(er) — nav/footer har driftet. Fiks før commit.`);
  process.exit(1);
}
console.log('\nNAV-VAKT: nav-links, nav-panel og footer er konsistente ✓');
