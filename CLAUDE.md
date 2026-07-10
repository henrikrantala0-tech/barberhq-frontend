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

## Låste beslutninger (ikke reåpne uten at Henrik ber om det)

- **Pris:** 249 kr/mnd fast (ingen 499-trapp foreløpig). **30 dagers gratis prøveperiode** (trial_period_days: 30) i alle markeder — dette er bevisst og riktig, ikke en feil i koden.
- **Marked:** fire land samtidig — NO / SE / DK / UK. Tyskland droppet.
- **Domene:** `trybarberhq.com` + `trybarberhq.no`.
- **MVP har ingen pengestrøm** gjennom plattformen. Kunder betaler barberen
  direkte i salongen. Betalingsmetoder vises kun som info.
- **Stripe Connect Express** utsatt til depositum/no-show-funksjon bygges.
  Penger skal ALDRI gå via Henriks konto — hver barber egen mottaker.
- **Kalender:** dashbord er master. Enveis push til Google Calendar (OAuth)
  etter levering. Aldri toveis sync (CASA-verifisering er fellen).
  Aldri be om API-nøkler i skjema.
- **Bilder i onboarding:** primært concierge (Henrik henter fra Instagram) +
  dashboard-opplasting. Dashbordet MÅ ha bildeopplasting fra dag én.
- **Anti-marketplace** er kjernedifferensiator — aldri funksjoner som
  eksponerer barberens kunder for konkurrenter. Aldri marketplace.
- **Ingen falsk social proof** — null kunder nå; alle påstander må være ærlige.
- **Font:** valg fjernet fra onboarding (alle får Fraunces). Font velges i
  dashbordet etterpå.
- Design er låst: 6 paletter, 4 layouter (Profil/Showcase/Hero/Direkte).
  Ikke endre uten å spørre.

## Arbeidsregler (Henriks preferanser)

- **Arbeidsspråk: uformell norsk.**
- **Planlegg før bygging** — Henrik krever detaljert seksjon-for-seksjon-plan
  før kode skrives. Ikke hopp rett til implementasjon på større oppgaver.
- **Rot-årsak-fikser** — overflate-patcher avvises. Finn og fiks underliggende
  årsak.
- **Boot before push:** enhver backend-endring verifiseres lokalt FØR push —
  minimum `node --check` på alle endrede `.js`/`.cjs`-filer. En parse-feil i én
  route-fil tar ned hele serveren (Railway starter aldri forbi `import`-fasen).
  Brent oss 2026-07-09: `SyntaxError: Identifier 'totalMin' has already been declared`
  i bookings.js krasjet prod i ~7 min før det ble oppdaget.
- **Render før deploy** når det gjelder visuelle endringer. Playwright
  (Chromium, `device_scale_factor=2`). Fonter (Fraunces/Inter variable TTF)
  fra `raw.githubusercontent.com/google/fonts`.
- **Valider base64/bilder** etter fil-endringer som rører bilder
  (PNG-sig `8950`, JPEG-sig `ffd8`).
- **asyncRoute på alle nye async ruter** — bruk `asyncRoute` fra
  `src/lib/asyncRoute.js` på alle nye async Express-ruter. Wrapper ruter
  unhandled rejections til error-middleware → 500-respons og logg, uten å ta
  ned prosessen. `process.on('unhandledRejection')` i server.js er kun siste
  skanse — primærforsvaret er asyncRoute + try/catch per rute.
- **Screenshot-godkjenning:** Code viser Playwright-bildene og STOPPER for Henriks
  godkjenning før commit — self-rapportering ("ser bra ut") er ikke godkjenning.
- **Typografiskala:** alle font-størrelser via CSS-variablene `--fs-title/section/body/small/micro`
  og `--fw-bold/medium/regular` — ingen løse `px`-verdier for font-size eller font-weight.
- Når Henrik sier "ferdig med saken" er beslutningen låst — gå videre.
- Push tilbake ærlig på dårlige idéer, men respekter låste beslutninger.

**Arbeidslogger hører ikke hjemme i CLAUDE.md. Bruk git-historikk.**

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


## Systemtilstand

Hvordan systemet fungerer NÅ. Forløp/debugging-historikk ligger i git-historikk.

### Dashboard + kundeside
- **Design-fane:** live mal-preview fra `/api/templates/:layout` (ekte mal, svarte bilde-blokker), synkronisert med palett/font/layout/modus. Layout-kort som ren tekst.
- **Mobil-nav:** "Mer"-meny (Oversikt · Bookinger · Tjenester synlig, resten i dropdown); desktop uendret. Mobil Design-layout: preview sentrert, rekkefølge valg → preview → Lagre, 2-kolonne kort, breakpoint 700px.
- **Palett-konsistens:** én delt kilde (`palett.js`) for kom-i-gang + dashboard, i synk med `fyll.cjs`. Ren svart/hvit bakgrunn i mørk modus, aksent skiller.
- **Kundeside bygges fra `barbers`-raden** (ikke `orders.payload`): alt barbereren endrer (design, layout, font, adresse, bio, bilder, tjenester) når bookingsiden. Oppslag via `barbers.slug`, status-gating via `barbers.page_status`. `savedLayout` er skilt fra `design.layout` — Bilder-fanen leser alltid lagret DB-verdi.

### Bildeplasserings-system (slots)
- `images` har `slot` (portrett/hero/galleri) + `sort_order`. Barbereren trykker en slot-boks per layout → laster opp dit. Galleri-grense 10; erstatning av portrett/hero sletter gammelt helt (DB+R2). `PATCH /images/:id/slot` flytter. Layout-bytte hard-sletter (DB+R2), transaksjonssikret (BEGIN/COMMIT/ROLLBACK, R2 best-effort utenfor transaksjon).
- `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
- **Crop:** Cropper.js 1.6.2 self-hostet i `no/lib/`. Beskjær-ikon (modal) + ×-ikon per bilde. Crop og Endre bruker `PUT /api/dashboard/images/:id` — bytter R2-fil, bevarer slot/sort_order (destruktiv klientside-crop, canvas→blob→PUT). Aspect: portrett 1:1, galleri 3:4, hero 9:19.5.

### Barber fra ordre
- `POST /api/admin/orders/:id/bygg-barber` oppretter barber atomisk: slug mot `barbers`, INSERT barbers, UPDATE `orders.barber_id`, re-knytter onboarding-bilder til barber_id, auto-tildeler slots (galleri maks 10; hero → første bilde; direkte → ingen; portrett ALDRI auto). Idempotent med FOR UPDATE radlås (409 ved dobbeltkjøring).

### Tagline/bio + font
- `tagline`-kolonne er skilt fra `bio`: `bygg.js` mapper `tagline → {{SPECIALTY}}`, `bio → {{BIO_BLOCK}}`; `fyll.cjs` fjerner tom `.sub` rent. Dashboard Profil-fane har to valgfrie felt (Tagline + Beskrivelse). Onboarding rører ikke tagline/bio.
- **Font-levering kundeside:** Space Grotesk + Plus Jakarta Sans base64-embeddet i templates (Railway CSP `font-src 'self' data:` blokkerer Google Fonts CDN). `.ttf` i `backend/fonts/`. `{{H1_FONT_FAMILY}}` på h1 + h2 i hero/profil/showcase — kun titler, brødtekst Inter. Dashboard-preview bruker CDN (Netlify, ingen streng CSP).

### Beslutninger som ligger til grunn
- Slot-navn: norsk (`portrett`/`hero`/`galleri`).
- Profil: 1 portrett + opptil 10 galleri = 11 totalt (unntak fra maks-10). Showcase: opptil 10 galleri. Hero: 1 bilde. Direkte: ingen bilder.
- Barbereren trykker en boks → laster opp til den slotten. Erstatt portrett/hero = slett gammelt helt (DB+R2). Galleri vokser etter behov.
- Slot hard-slettes kun ved faktisk layout-bytte — ikke ved annen Design-lagring.
- Én barber = én bookingside (1:1).
- Tagline (kort, valgfri) + Bio (lengre, valgfri) er to separate felt. Onboarding samler ikke tagline — barbereren fyller i dashboard.
- Onboarding-bilder er alltid klippbilder — portrett-slot fylles ALDRI automatisk ved bygg-barber.

## Kjent teknisk gjeld

- **Tidssone for åpningstider er hardkodet via `barbers.market`** (NO/SE/DK → Europe/Oslo, UK → Europe/London).
  Dette er en MVP-forenkling. Booking-validering mot `business_hours` bruker denne utledningen.
  Riktig løsning: egen `timezone`-kolonne på `barbers`, satt per barber ved onboarding, og bruk den
  i stedet for market-mappingen. Må fikses før vi tar inn barberere utenfor CET/UK.
- **buildPalette er duplisert i fyll.cjs og no/palett.js — må holdes i synk manuelt.**

### Gjenstår (neste økt / senere)
1. **Test full klikk-flyt med ekte klippbilde** — crop + lagring i Bilder-fanen, verifiser at bildet havner riktig i riktig slot på ekte kundeside. Bevist via API, ikke via UI-flyt ennå.
2. **Hero-bildegrense server-side** — se sikkerhetshull over.
3. **orders.barber_id FK** — verifiser enforcement, se sikkerhetshull over.
