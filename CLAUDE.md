# CLAUDE.md — barberhq-frontend

Frontend for BarberHQ (statisk side, deployes til Netlify).
Søsterrepo: barberhq-backend (Railway).

## ⚠️ Språk-status (viktig)
- **Norsk (no/) er ALLTID kilden.** sv/, da/, en/ oversettes FRA norsk.
- **sv/, da/, en/ er bevisst utdaterte akkurat nå.** Kun no/ har dagens
  nyeste dashboard og kom-i-gang (23.06). Oversettelse gjøres HELT TIL SLUTT,
  etter at norsk innhold er ferdig — ikke underveis (ville krevd re-oversetting
  ved hver endring).
- da/ og sv/ MANGLER dashboard.html foreløpig. Fikses i oversettelses-jobben.
- Oversettelse av dashboard gjøres via oversett_dash.py (i backend-repo/verktøy).

## Struktur
- no/ sv/ da/ en/ — én mappe per språk
- _redirects + netlify.toml — styrer språk-ruting på Netlify
- Hver språkmappe: index.html (landing), kom-i-gang.html (onboarding),
  dashboard.html, + funksjoner/priser/support/logg-inn.html

## Deploy
- Netlify. Skal kobles til dette repoet (auto-deploy fra main).
- Inntil kobling er live: deployet manuelt via Netlify Drop.

## Arbeidsspråk: norsk. Planlegg før bygging. Render før deploy.

## no/index.html — seksjonsrekkefølge (låst 26.06)
1. Hero (`#top`)
2. Produktvisning (`.pv-section` — fra `produktvisning-seksjon.html`)
3. Selvbooking (`#selvbooking`)
4. Vekst-intro (`#vekst`) → Rebooking (`#rebooking`) → Verving (`#verving`)
5. Avsluttende CTA (`.final-cta`)
Mangler (skrives separat): Problemet (#2), Din side/anti-marketplace (#5), Prøv gratis 30d (#7).
sv/, da/, en/ følger ikke denne rekkefølgen ennå — gjøres i oversettelses-jobben.

## no/index.html — kjente fikser og tilstand (02.07)
- **Telefon-mockup tastatur (02.07):** Delt tastatur i `.rbscope` og `.vvscope`
  var 210px og klippet knappene "Klikk her"/"Levert" (rebooking) og "Del min link"
  (verving). Fiks: `.keyboard` height 210→150px, padding `8px 4px 24px`→`6px 4px 14px`,
  `.msg-input` bottom 218→158px — i begge scopes. GJELDER KUN no/ — sv/da/en tas i
  oversettelsesfasen.
- **Død CSS ryddet (02.07):** 13 linjer fjernet — gamle prisplan-klasser
  (`.plan`, `.plan.pro`, `.badge`, `.plan-name`, `.plan-price`, `.plan-tag`,
  `.plan-cta`, `.cta-line`, `.cta-fill`) som ble igjen da prisplanen flyttet til
  priser.html. `.hero-badge` er fortsatt i bruk og ble beholdt.

## Status — sist oppdatert 2026-07-05

### Ferdig og pushet
- **Live mal-preview i Design-fanen** — viser ekte mal fra backend-endepunkt (`/api/templates/:layout`), svarte bilde-blokker (ikke demo-bilder), synkronisert med palett/font/layout/modus.
- **Layout-kort som bare tekst** i Design-fanen (ikke wireframes/screenshots).
- **Mobil fane-navigasjon** — "Mer"-meny: Oversikt · Bookinger · Tjenester synlig, resten i dropdown. Desktop uendret.
- **Palett-konsistens** — én delt kilde (`palett.js`) for kom-i-gang + dashboard, `fyll.cjs` i synk. Alle paletter rene svart/hvit bakgrunn i mørk modus, aksent skiller.
- **Mobil Design-layout** — preview sentrert, rekkefølge valg → preview → Lagre, kompakte 2-kolonne kort, breakpoint 700px.
- **Dashboard koblet til ekte bookingside** (root-cause) — `bygg.js` bygger nå fra `barbers`-raden (ikke `orders.payload`). Alt barbereren endrer i dashbordet (design, layout, font, adresse, bio, bilder, tjenester) når bookingsiden. Oppslag via `barbers.slug`, status-gating via `barbers.page_status`.
- **Bildeplasserings-system (lag 1–4):**
  - Lag 1: `slot` (portrett/hero/galleri) + `sort_order`-kolonner på `images` (migrering 009).
  - Lag 2: backend — opplasting til slot, slett-ved-erstatning (DB+R2), galleri-grense 10, `PATCH /images/:id/slot`, slot-nullstilling ved layout-bytte.
  - Lag 3: `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
  - Lag 4: Bilder-fane med trykkbare slot-bokser per layout (rund portrett, galleri-grid, hero-boks, Direkte-melding).

### Beslutninger som ligger til grunn
- Slot-navn: norsk (`portrett`/`hero`/`galleri`).
- Profil: 1 portrett + opptil 10 galleri = 11 totalt (unntak fra maks-10). Showcase: opptil 10 galleri. Hero: 1 bilde. Direkte: ingen bilder.
- Barbereren trykker en boks → laster opp til den slotten. Erstatt portrett/hero = slett gammelt helt (DB+R2). Galleri vokser etter behov.
- Slot nullstilles kun ved faktisk layout-bytte (ikke ved annen Design-lagring).
- Én barber = én bookingside (1:1).
- Bio-ingress gjenbruker `bio`-kolonnen (ett tekstfelt, ikke to).

### Gjenstår (til i morgen / senere)
1. **Galleri-boksene er høye på mobil** — vurder mindre thumbnails, helst testet med ekte bilde.
2. **DB-passordet må roteres** — ble eksponert i chat-sesjon. Railway → Postgres → regenerer credentials → oppdater `DATABASE_URL`. Høyest prioritet av utestående.
3. **Test hele bildeflyten med ekte klippbilde** — plasser bilde i slot via Bilder-fanen, verifiser at det havner riktig på ekte side. Systemet er bevist via API, ikke via full klikk-flyt med ekte bilde ennå.
4. **SESSION_SECRET-deployen** — sjekk om den fortsatt henger (Railway BuildKit-feil fra tidligere).
5. **Font i templates** — Space Grotesk / Jakarta vises i dashboard-preview, men leveres ikke på ekte side ennå (mangler `.ttf` i templates). Kun Fraunces + Inter er hardkodet i dag.
