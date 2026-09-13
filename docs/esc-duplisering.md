# `esc()` finnes i TRE kopier — duplikatet er rotårsaken

**Skrevet 2026-09-13** etter at et attributt-XSS-hull i dashbordet ble funnet og lukket
(commit `82b0738`).

## Hva som skjedde

HTML-escaping-hjelperen `esc()` er hånd-kopiert til tre steder som må holdes i synk manuelt:

| Fil | Repo | Escaper | Form |
|-----|------|---------|------|
| `site/no/dashboard.html:2921` | frontend | `& < > " '` (etter fiks) | ett regex-pass + oppslagstabell |
| `fyll.cjs:252` | backend (nøstet) | `& < > " '` | `.replace`-kjede, `&` først |
| `booking-module.cjs:3` | backend (nøstet) | `& < > " '` | `.replace`-kjede, `&` først |

**Alle tre escaper nå både `"` og `'`.** De to backend-kopiene gjorde det allerede;
`dashboard.html` var etternøleren — den escapet kun `& < >` og manglet **både `"` og `'`**.

Konsekvensen av det manglende `"`: overalt hvor dashbordet bygger
`attributt="'+esc(x)+'"` med barber- eller kunde-styrt data (kundenavn/-telefon i
verving/lojalitet/vinn-tilbake, barberens egne tjenestenavn og betalingsmetoder), kunne
et `"`-tegn i dataen bryte ut av attributtet og injisere en event-handler
(`onmouseover=…`). Verste vei var lagret XSS **kunde → barber**: en kunde booker med et
preparert navn, og koden kjører når barbereren åpner dashbordet. Bevist før/etter med
Playwright (hover satte `document.title` før fiksen, ren tekst etter).

## Hvorfor dette er et notat verdt å skrive

**Duplikatet ER rotårsaken.** Tre hånd-vedlikeholdte kopier driver fra hverandre: to ble
forbedret uten at den tredje fulgte med, og forskjellen var usynlig til den ble utnyttbar.
Dette er (minst) tredje gang en duplisert hjelper har bitt oss — jf. `buildPalette` som er
duplisert i `fyll.cjs` ↔ `site/no/palett.js` (se «Kjent teknisk gjeld» i CLAUDE.md).

**Fast regel til neste gang:** endrer du én `esc()`, endre alle tre i samme åndedrag. Det
finnes ingen delt kilde — frontend og backend er separate repoer (og ÉN Code-sesjon per
repo), så backend-kopiene må røres fra backend-sesjonen.

## Ekstra: en FJERDE, ufullstendig kopi

`booking-module.cjs:503` har en egen `h()` som escaper `& < > "` men **ikke `'`**. Den er
ikke en av de tre `esc()`-kopiene, men er en nær-duplikat med samme drift-risiko. Bør
konsolideres når backend-siden ryddes.
