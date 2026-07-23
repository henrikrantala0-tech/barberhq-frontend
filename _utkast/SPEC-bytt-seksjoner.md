# SPEC: Bytt inn nye problem- og din-side-seksjoner i `no/index.html`

## Mål
Erstatt to seksjoner i `no/index.html` med nye, venstrestilte versjoner, behold de seks andre uendret, og rendre HELE siden med Playwright for visuell godkjenning FØR commit.

## Kontekst
To nye seksjoner er bygget og godkjent i chat. De ligger som ferdige, frittstående HTML-filer:
- `problem-seksjon__venstre.html`
- `din-side__bilde.html`

Disse er IKKE i repoet ennå. Først steg er å hente dem inn (se under).

## Låst seksjonsrekkefølge (skal ikke endres)
hero → problem → produkt → slik funker det → din side → bonus → prøv gratis → CTA

## Steg

### 1. Hent de to nye seksjonsfilene inn i repoet
Kopier fra outputs-mappen til en midlertidig plassering i frontend-repoet (f.eks. `_nye-seksjoner/`):
- `problem-seksjon__venstre.html`
- `din-side__bilde.html`

(Filene deles fra denne chatten. Last dem ned og legg dem i repo-roten eller en temp-mappe. Bruk PowerShell `-Encoding utf8` ved enhver skriving — PowerShell 5.1 defaulter til CP1252 og lager mojibake på æøå.)

### 2. Identifiser de eksisterende seksjonene i `no/index.html`
Finn de to seksjonene som skal byttes. De er sannsynligvis avgrenset med kommentarer som `<!-- ===== problem ===== -->` / `<!-- ===== din-side ===== -->` eller har `id="problem"` / `id="din-side"`. Bekreft start- og slutt-tag før du rører noe.

### 3. Bytt PROBLEM-seksjonen
Erstatt hele den eksisterende problem-seksjonen med innholdet fra `problem-seksjon__venstre.html`.

Endringene mot den gamle versjonen:
- Overskrift + eyebrow + undertekst er nå VENSTRESTILT (ikke sentrert). De ligger i en `.problem-head` med `max-width:620px`.
- Korttitlene (`.pcard-t`) er RØDE: `color:#e0574f` (samme røde som no-show-prikken).
- Teksten i kort 2 er «Unødvendig **mas** frem og tilbake tar tid fra klipp» (tidligere «pirk»).
- Fire kort uendret: Tapte meldinger / Frem og tilbake / Dårlig oversikt / No-show.

VIKTIG: Ta KUN `<section>`-blokken og dens tilhørende `<style>`-blokk fra fila. IKKE ta med `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` — det er bare wrapper for frittstående rendering.

### 4. Bytt DIN SIDE-seksjonen
Erstatt hele den eksisterende din-side-seksjonen med innholdet fra `din-side__bilde.html`.

Endringene:
- VENSTRESTILT to-spalte: bilde til venstre (`0.95fr`), tekst + sammenligning til høyre (`1fr`).
- Den blå BarberHQ-kolonnen og rød-kryss/grønn-hake-sammenligningen er beholdt fra den eksisterende versjonen — IKKE endre fargene til gull.
- Bildet er et `<img class="ds-img" src="data:image/jpeg;base64,...">` med innebygd base64 (1000×1250, 4:5). Det har topp/bunn-fade via `mask-image:linear-gradient(...)`.

Samme regel: KUN `<section>` + `<style>`, ikke wrapper-taggene.

### 5. Font-lasting
Begge nye filer har en `@font-face`-blokk som laster Inter fra en lokal `inter.ttf`-sti. I `no/index.html` lastes Inter sannsynligvis allerede (Google Fonts eller lokal). FJERN `@font-face`-blokken fra de innlimte seksjonene og la siden bruke sin eksisterende Inter-lasting, så vi ikke får dobbel font-deklarasjon.

### 6. Sjekk CSS-klassenavn-kollisjon
De nye seksjonene bruker prefiksene `.problem-*`, `.pcard-*`, `.ds-*`. Sjekk at disse ikke kolliderer med eksisterende klasser i `no/index.html` (særlig `.ds-*` hvis din-side allerede brukte det). Hvis kollisjon: behold de nye reglene (de er den godkjente versjonen).

### 7. UTF-8-sjekk
Etter innliming: bekreft at æøå rendres riktig i fila (ikke `Ã¦` o.l.). Hvis mojibake oppstår: `git checkout -- no/index.html`, og skriv på nytt med `-Encoding utf8`.

### 8. RENDER FØR COMMIT (obligatorisk)
Kjør Playwright (headless Chromium, `device_scale_factor=2`) mot den ferdige `no/index.html` og ta ett fullsides-skjermbilde. Send skjermbildet til Henrik for godkjenning.

IKKE commit før Henrik har sett skjermbildet og godkjent. Det er den faste render-før-commit-regelen.

Sjekkliste i skjermbildet:
- Rytmen veksler: hero (sentrert) → problem (venstre) → produkt (sentrert) → slik funker det → din side (venstre, bilde) → bonus → prøv gratis → CTA.
- Problem-overskrift sitter til venstre, fire kort med røde titler under.
- Din side: bilde til venstre fader pent i topp/bunn, blå sammenligning til høyre.
- Ingen mojibake på norske tegn.
- Ingen dobbel font-flash eller layout-brudd ved seksjonsovergangene.

### 9. Etter godkjenning
- `git add no/index.html` (+ slett temp-mappa `_nye-seksjoner/` hvis brukt)
- Commit med melding: `Bytt til venstrestilt problem + din-side med bilde på no/index.html`
- Oppdater `CLAUDE.md` hvis noe i strukturen endret seg
- `git status` i begge repoer

## Hva som IKKE skal røres
- hero, produkt, slik funker det, bonus, prøv gratis, CTA — alle uendret
- Designsystem: `#0a0a0a` bg, `#0e0e0e` kort, blå `#4d8bff`, grønn `#3ecf7e`, rød `#e0574f`
- Telefonmockups flate/oppreist, ingen vinkler
