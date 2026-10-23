// tools/render/fixtures/sjekk.mjs — felles dom for render-skriptene: JA/NEI på skjermen OG i exit-koden.
//
//   import { sjekk, ferdig } from './fixtures/sjekk.mjs';
//   sjekk(ok, 'Pillen males helt');       // skriver «Pillen males helt: JA» / «…: NEI» og teller NEI
//   …
//   ferdig();                             // til slutt: minst én NEI → «N påstand(er) svarte NEI.» + process.exitCode = 1
//
// Hvorfor: 17 skript skrev NEI/✗ og avsluttet med exit 0, så en feil var bare synlig for den som leste utskriften
// (8 av dem feilet stille 22.10.2026). Alle skript som feller en dom skal gå gjennom sjekk(), ikke egne ok?'JA':'NEI'.
// sjekk() returnerer ok, så den kan brukes inne i uttrykk. detalj (valgfri) skrives bare ved NEI.
let antallNei = 0;
const nei = [];

export function sjekk(ok, tekst, detalj = '') {
  const bra = !!ok;
  console.log(`${tekst}: ${bra ? 'JA' : 'NEI'}${!bra && detalj ? ` — ${detalj}` : ''}`);
  if (!bra) { antallNei++; nei.push(tekst); }
  return bra;
}

export function ferdig() {
  if (!antallNei) return;
  console.log(`\n${antallNei} påstand(er) svarte NEI:`);
  for (const t of nei) console.log(`  ✗ ${t}`);
  process.exitCode = 1;
}
