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

## ⚠️ Sikkerhetsregler for Code (stående, ikke overstyr)
**Aldri print miljøvariabler, connection strings eller hemmeligheter til terminalen.**
Ikke kjør `railway variables`, `printenv`, `cat .env` eller lignende som printer secrets
til output. DB-passordet ble eksponert to ganger via `railway variables` i chat-sesjon
(05.07) — rotert begge ganger. Hvis DB-tilgang trengs: spør brukeren, ikke dump variabler.

**Bcrypt-hasher og hemmeligheter kopieres ALLTID direkte fra Code-output**, aldri via
chatten — 1/l og 0/O er uleselige i chatfonten og har forårsaket feil (05.07).

## Kjente sikkerhetshull (MVP-bevisst, ikke akutt)
- **Hero-bildegrense er kun klientsiden** — `kom-i-gang.html` begrenser til 1 fil for
  hero, men backend (`multer`) har kun en generell grense på 5 filer, ingen per-layout-
  validering. En teknisk bruker kan sende flere hero-bilder direkte mot API-et.
- **orders.barber_id FK ikke fullt enforced** — vi så en id som ikke matchet uten at DB
  klaget under testing. Bør verifiseres — kan føre til stille feil ved feil barber_id.

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
  - Lag 2: backend — opplasting til slot, slett-ved-erstatning (DB+R2), galleri-grense 10, `PATCH /images/:id/slot`, hard sletting (DB+R2) ved layout-bytte (transaksjonssikret med BEGIN/COMMIT/ROLLBACK, R2 best-effort utenfor transaksjon).
  - Lag 3: `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
  - Lag 4: Bilder-fane med trykkbare slot-bokser per layout (rund portrett, galleri-grid, hero-boks, Direkte-melding).
- **Layout-drift fikset (05.07)** — `savedLayout` skilt fra `design.layout` i dashboard.
  Bilder-fanen leser alltid lagret verdi fra DB, ikke ulagret preview-state. `_designReady`-hack fjernet.
- **`POST /api/admin/orders/:id/bygg-barber` (05.07)** — oppretter barber fra ordre
  atomisk: slug mot barbers-tabellen, INSERT barbers, UPDATE orders.barber_id, re-knytter
  onboarding-bilder til barber_id, auto-tildeler slots (galleri maks 10; hero → første bilde;
  direkte → ingen; portrett ALDRI auto — klippbilder er ikke portretter). Idempotent med
  FOR UPDATE radlås (409 ved dobbeltkjøring). Verifisert mot prod (henrik-fades).
- **Crop-feature (dashboard):** Cropper.js 1.6.2 self-hostet i `no/lib/`. Hvert bilde:
  beskjær-ikon (Cropper-modal) + ×-ikon (Fjern/Endre). Endre og crop bruker begge
  `PUT /api/dashboard/images/:id` — bytter R2-fil, bevarer slot/sort_order. Destruktiv
  klientside-crop (canvas→blob→PUT). Aspect-forhold: portrett 1:1, galleri 3:4 (endret
  fra 4:5), hero 9:19.5. Hero-template er 100vh fullskjerm — 9:19.5 gjelder crop + dashboard-boks.
- **Tagline/bio-duplisering fikset (05.07)** — `bygg.js` doblet `barber.bio` inn i
  både `{{SPECIALTY}}` og `{{BIO_BLOCK}}`. Fikset: ny `tagline`-kolonne (migrasjon 010,
  kjørt mot prod), `bygg.js` mapper `tagline→{{SPECIALTY}}` + `bio→{{BIO_BLOCK}}`,
  `fyll.cjs` fjerner tom `.sub` rent (ingen tom `<p>`). Dashboard Profil-fane har to
  valgfrie felt: Tagline + Beskrivelse. Onboarding-skjemaet rører ikke tagline/bio.
  Commits: `ddd086a` (backend) + `dadfd4b` (frontend).
- **Font-levering for kundesider (05.07)** — Space Grotesk + Plus Jakarta Sans
  base64-embeddet i templates. Railway CSP (`font-src 'self' data:`) krever base64 —
  Google Fonts CDN er blokkert på kundeside-ruten. `.ttf` i `backend/fonts/` (begge
  mapper). `fyll.cjs` embedder, `bygg.js fontOpts()` inkluderer alle fire fonter.
  `{{H1_FONT_FAMILY}}` på h1 + h2 i tre templates (hero/profil/showcase) — kun titler,
  brødtekst forblir Inter. Dashboard-preview brukte allerede CDN (Netlify, ingen streng CSP).
  Commit: `07311d7` (backend).

### Beslutninger som ligger til grunn
- Slot-navn: norsk (`portrett`/`hero`/`galleri`).
- Profil: 1 portrett + opptil 10 galleri = 11 totalt (unntak fra maks-10). Showcase: opptil 10 galleri. Hero: 1 bilde. Direkte: ingen bilder.
- Barbereren trykker en boks → laster opp til den slotten. Erstatt portrett/hero = slett gammelt helt (DB+R2). Galleri vokser etter behov.
- Slot nullstilles (nå: hard-slettes) kun ved faktisk layout-bytte — ikke ved annen Design-lagring.
- Én barber = én bookingside (1:1).
- Tagline (kort, valgfri) + Bio (lengre, valgfri) er to separate felt. Onboarding samler ikke tagline — barbereren fyller i dashboard.
- Onboarding-bilder er alltid klippbilder — portrett-slot fylles ALDRI automatisk ved bygg-barber.
- Slug-ruting: barbersider på `api.trybarberhq.com/<slug>` i dag (stygt for deling). Beslutning tatt: flytt til `trybarberhq.com/<slug>` via Netlify-proxy — ikke bygget ennå.

## Kjent teknisk gjeld

- **Tidssone for åpningstider er hardkodet via `barbers.market`** (NO/SE/DK → Europe/Oslo, UK → Europe/London).
  Dette er en MVP-forenkling. Booking-validering mot `business_hours` bruker denne utledningen.
  Riktig løsning: egen `timezone`-kolonne på `barbers`, satt per barber ved onboarding, og bruk den
  i stedet for market-mappingen. Må fikses før vi tar inn barberere utenfor CET/UK.

### Gjenstår (neste økt / senere)
1. **Slug-ruting** — flytt barbersider til `trybarberhq.com/<slug>` via Netlify-proxy til backend. Krever reservliste for eksisterende ruter + slug-validering i bygg-barber mot reserverte ord.
2. **Test full klikk-flyt med ekte klippbilde** — crop + lagring i Bilder-fanen, verifiser at bildet havner riktig i riktig slot på ekte kundeside. Bevist via API, ikke via UI-flyt ennå.
3. **Hero-bildegrense server-side** — se sikkerhetshull over.
4. **orders.barber_id FK** — verifiser enforcement, se sikkerhetshull over.
