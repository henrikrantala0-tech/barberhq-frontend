# Handoff → Claude Code: Layout-galleri inn i kom-i-gang

## Mål
Erstatt dagens halvferdige layout-preview i `kom-i-gang.html` (den iframe-baserte
live-Profil-previewen + de 3 midlertidig skjulte layoutene) med et **statisk, klikkbart
4-valgs layout-galleri**. Kunden velger STRUKTUR her ved å se. Palett/bakgrunn-valg er et
SEPARAT, senere steg (se "Utenfor scope").

## Assets (i ./images/)
Fire telefon-mockup-bilder, transparent bakgrunn, like dimensjoner (832×1740), WebP.
Alle viser samme demo-barber (Grand Barber) med LÅST minimal palett + mørk bakgrunn —
slik at det eneste som varierer mellom dem er selve layouten.

| Fil                     | Layout-nøkkel | Etikett             | Kort beskrivelse                          |
|-------------------------|---------------|---------------------|-------------------------------------------|
| layout-showcase.webp    | `showcase`    | Showcase            | Galleri i front — bildene fyller forsiden |
| layout-hero.webp        | `hero`        | Hero                | Stort hovedbilde — ett bilde fyller skjermen, navn oppå |
| layout-profil.webp      | `profil`      | Profil              | Portrett + galleri — logo/bilde øverst, så klippene |
| layout-direkte.webp     | `direkte`     | Direkte             | Rett til booking — ingen bilder, raskest  |

## Oppførsel i kom-i-gang
1. Vis 4 kort (thumbnail + etikett + kort beskrivelse) — f.eks. 2×2 på mobil.
2. Klikk på et kort → **utvid til større visning** (lightbox/modal) så barbereren ser
   layouten i detalj. Lukk på overlay-klikk + Esc.
3. Valg av layout setter skjemaets `layout`-verdi til nøkkelen i tabellen
   (`showcase`/`hero`/`profil`/`direkte`). Marker valgt kort tydelig.
4. Behold eksisterende feltnavn i skjemaet (`name`, `email`, … — IKKE `navn`/`epost`).

## Hva som skal fjernes/erstattes
- Den nåværende iframe-baserte live-Profil-layout-previewen.
- De 3 midlertidig skjulte layout-blokkene.
- IKKE legg font-velgeren tilbake (den er fjernet med vilje — font velges i dashboard).

## Viktig
- Ikke prøv å re-farge disse bildene per palett. De er låst til minimal med vilje;
  fargevalg vises i det separate tjeneste-previewen (steg 2).
- Bildene er WYSIWYG: den ekte kundesiden bygges fra de SAMME malene via `fyll.cjs`,
  så strukturen kunden får er identisk med bildet. (PNG kan lages på forespørsel.)

## Utenfor scope (steg 2 — senere)
Live palett/bakgrunn-preview = den ekte tjeneste-skjermen i en iframe som oppdateres via
postMessage når kunden bytter palett/lys-mørk. Bygges IKKE nå.

## Separat oppgave (backend, ikke denne handoff-en)
De fire malene (`showcase/hero/profil/direkte.template.html`) + `fyll.cjs` (bio-mekanikk +
ingen 4-bilde-grense) skal landes i `barberhq-backend` — det er det concierge-flyten bygger
kundesider med. Ligger i de fire render-kit-zip-ene fra denne økten.
