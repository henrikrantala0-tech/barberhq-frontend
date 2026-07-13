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
  dashboard.html, + funksjoner/priser/support/logg-inn.html/opprett-passord.html
- **Logo:** `assets/logo/` — master SVG + eksportvarianter (email, social, og).
  Byggpipeline i `tools/logo/`. Favicon er UTSATT (egen enkel-variant forkastet).
  **E-postlogo (side-klar):** plate-variant PNG (mørkt ordmerke på hvit avrundet plate) for å
  overleve Gmail dark mode. Ny R2-fil under NYTT filnavn (ikke overskriv — cache). `_layout.js`
  `LOGO_DARK_URL` + img 194×39.

## Deploy
- Netlify med **Git-integrasjon: auto-deploy fra `main`** (bekreftet live 11.07 —
  push til main går live automatisk, ingen manuell Drop). netlify.toml leses på
  hver build (språk-redirects + API/book-proxy til Railway).
- **Konsekvens:** push til main = umiddelbar prod-deploy. Ingen staging. Verifiser
  FØR push (render-before-commit), for det er ingen mellomstasjon.
- **Credits:** hver deploy koster ~15 credits (tak 1000/mnd). Batch pushes — se Arbeidsregler.

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
- **Oversikt = uke-rekord-akse; Vekst = måned-rekord-akse.** Persentil + progress-bar bor
  på Oversikt og er UKE-relative (måned har for få datapunkter for meningsfull persentil;
  uke-jakt gir hyppigere motivasjon). «Beste måned» (+ gullstolpe-på-rekord-måned) hører til
  Vekst — ÉN rekord-akse per flate, ikke doble.
- **Diagram-fargekoding er RELATIV** til beste stolpe i visningen (`colorForRatio(d.kr/max)`),
  ikke absolutt. Bevisst «deg-mot-deg-selv». Ingen tynt-data-demping (svakest i
  onboarding-vinduet — akseptert).
- **Attribusjon = definisjon A (utfallsbasert), ikke B (handlingsbasert).** Manuell
  vinn-tilbake-DM utenfor systemet kan ikke trackes; A observerer kun UTFALL (kom tilbake),
  lover ikke at verktøyet gjorde det. Framing MÅ matche: vekk fra «Drevet av / slik ble stolen
  fylt» (antyder verktøy-bragd) → ærlige utfalls-titler.
- **Attribusjons-prioritet:** vervet > recovery > rebooking; hver booking i én kategori (sum er sann).

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
- **Batch pushes (Netlify-credits):** auto-deploy koster ~15 credits/deploy, tak 1000/mnd.
  67 deploys på én dag (11.07) sprengte kvoten → hele siten 503 «usage_exceeded». Samle flere
  fikser per commit, verifiser lokalt (Playwright), push sjeldnere/større.
- **Dashboard-preview testes med «Disable cache» PÅ** — ellers gir browser-cache falske
  «bug»-spøkelser (layout-preview-«buggen» 11.07 var ren cache, ikke kode).
- **Test norsk tekst (æøå) via nettleser, ikke PowerShell.** PowerShell (Invoke-RestMethod/
  curl.exe) sender request-body i feil charset → æøå blir � på serveren. Koden er UTF-8-ren
  (verifisert 11.07); fella er PS-konsollen.
- **Railway shell:** engangs-scripts må ha `.cjs`-endelse (package.json er `type:module`) og
  ligge i `/app` (ikke `/tmp`) for å finne `pg`-modulen.

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

### Innlogging + passord (frontend)
- **`logg-inn.html`:** passord-innlogging (`POST /api/login`) + «Glemt passord?»-flyt som ber om magisk lenke (`POST /api/send-magic-link` — alltid samme kvittering, avslører ikke om e-post finnes). Håndterer `?error=expired` (utløpt/brukt magisk lenke) over skjemaet.
- **`opprett-passord.html`:** førstegangs passord-setting etter magisk-lenke-innlogging (`POST /api/dashboard/set-password`, min 8 tegn, felt-validering). Vis/skjul-øye på begge felt (gjenbrukt fra logg-inn). Dashboard redirecter hit når `profile.hasPassword` er false.

### Dashboard + kundeside
- **Design-fane:** live forhåndsvisning via `GET /api/dashboard/preview?layout&palette&font&mode` — full **server-render** av barberens EKTE side (`byggSideFraBarber → fill → booking-module.cjs`; `preview:true` hopper over /days+/slots og åpner sheet). Samme kilde som publisert side = ingen drift. `dashboard.html` setter kun `srcdoc` (cache per param-kombo, synlig `previewError` ved feil); ingen klient-fyll. Endepunktet `console.warn`-er på ufylt `{{PLACEHOLDER}}` — erstattet den gamle stille slutt-wipen (`replace(/{{[A-Z_]+}}/g,'')`) som skjulte at booking-modulen (all aksentfarge) aldri ble injisert → helt svart/hvit preview i ~4 mnd (rot-årsak: FASE B `6d06a8d` flyttet booking-UI inn i `{{BOOKING_MODULE}}` som wipen slettet). Layout-kort som ren tekst.
- **Preview 11.07:** booking-sheet auto-open fjernet (`booking-module.cjs`) — preview viser forside først, som live. Tomme forside-felt viser dempede plassholdere i preview (`(spesialitet)`/`(adresse)`/`(bio)` + grå bilde-bokser via delt `{{PH_CSS}}`); live kollapser som før. (Layout-preview-«buggen» var browser-cache, ikke kode.)
- **Mobil-nav:** "Mer"-meny — **Oversikt + Vekst** alltid synlig, resten (Profil · Tjenester & tider · Design · Konto) i dropdown; desktop viser alle. Mobil Design-layout: preview sentrert, rekkefølge valg → preview → Lagre, 2-kolonne kort, breakpoint 700px.
- **Palett-konsistens:** én delt kilde (`palett.js`) for kom-i-gang + dashboard, i synk med `fyll.cjs`. Ren svart/hvit bakgrunn i mørk modus, aksent skiller.
- **Kundeside bygges fra `barbers`-raden** (ikke `orders.payload`): alt barbereren endrer (design, layout, font, adresse, bio, bilder, tjenester) når bookingsiden. Oppslag via `barbers.slug`, status-gating via `barbers.page_status`. `savedLayout` er skilt fra `design.layout` — Bilder-fanen leser alltid lagret DB-verdi.

### Oversikt-diagram (Oversikt-fanen)
Ett stolpediagram + KPI, én motor. `sliceDaily(daily[], period)` / `sliceMonth(days[], ym)` null-fyller til `[{l,kr,l2,count,new,returning}]` → `renderBarChart(data, period)` (leser `d.l/d.kr/d.l2`). Samme skårne array mater KPI-kortene (Σcount=Kunder, Σrevenue=Estimert omsetning). Diagrammet dekker hele historikken.
- **Perioder:** pill-er (Siste uke=7d / Siste 2 uker=14d / Denne måneden=1.→i dag), rullende, forankret Oslo-i-dag. `daily[]` = 90-dagers vindu fra `/stats`.
- **Månedsvelger:** «Tidligere»-dropdown fra `/stats.months_with_data` (nyest øverst, ekskl. inneværende måned). Valg → `GET /api/dashboard/stats/month?ym=YYYY-MM` (sparse `days[]` + måned-totaler, ym-validering→400) → `sliceMonth` (dag-antall via `new Date(år,mnd,0).getDate()` → korrekt 28/29/30/31) → bytter BÅDE diagram + KPI. Pill↔måned-state isolert (pill-klikk nullstiller dropdown; ingen lekkasje).
- **Volum-farge (lag 1):** `colorForRatio(d.kr/max)` — glidende lineær RGB dempet blågrå → brand-blå → brand-grønn, relativt til beste stolpe i visningen. Per-stolpe gradient (mørk bunn→lys topp av stolpens EGEN farge), ingen glow.
- **HUD + touch (lag 2, variant A):** magnetisk `pointerdown`/`pointermove` på `#chartBars`, snap via `getBoundingClientRect`. Valgt stolpe → **kort forankret til stolpen** (`#chartHud`, absolutt i `.chart-wrap`): dato liten/dempet, beløp stort + «· N klipp», pills nye (blå) / gjengangere (grønn). Løsrevet caret (`#chartCaret`) på stolpe-senter + peker-linje til stolpetopp; horisontal clamping innenfor kort-padding ved kant-stolper; skann-glid `transition:left .09s`. `pointer-events:none` på kort/caret → tap/skann/undo treffer stolpene under. Undo: tap valgt stolpe → `clearSel()`, tap-vs-dra <8px.
- **Entré + tell-opp (lag 3):** stolper stiger staggered venstre→høyre (variant D: step 95ms / rise 350ms, clamp `ENTRY_MAX_TOTAL=3000` → 90-heatmap sprenger aldri), KPI teller 0→target, KUN første render (`chartEntered`-flagg); pill/tab = uniform vekst, ingen tell-opp. Respekterer `prefers-reduced-motion`.
- **Uke-rekord (lag 4) — KUN pill-modus inneværende uke:** `current_week_revenue`/`best_week_revenue`/`best_week_start` fra `/stats` (backend-beregnet, on-read/Oslo, best = MAX ferdige uker). Gull-KPI (`#estRevValue` gull-gradient + drop-shadow-glow + puls) tenner kun ved `current > best` OG `curPeriod==="uke"`. Dempet «Beste uke: X kr · [mnd]»-fotnote ellers.
- **Persentil + rekord-bar (batch 2) — KUN pill-modus inneværende uke:** fra `/stats.weekly_revenue` (`[{week_start,revenue}]`, all-time ferdige uker, on-read/Oslo, `max==best_week_revenue` per konstruksjon). Persentil «Bedre enn X% av dine egne uker» vist ved ≥6 uker OG pct≥50 (over median), undertrykt ved rekord. Rekord-bar `current/best`: <0.80 skjul · 0.80–1.0 «X kr unna» · ≥1.0 «Ny rekord denne uka! 🔥» 100% gull. Baren eier rekord-budskapet (tømmer `#rekordNote`) → ingen dobbelt. Skjult på 2uker/måned/historisk måned.
- **Merk (aldri sett live):** mot volum-test er `current_week` (~10 550) « `best` (13 950 = 76%) → persentil + rekord-bar naturlig SKJULT. «unna»/«rekord»-tilstand kun Playwright/deterministisk verifisert. `gull-demo.cjs`-fixtur (backend-repo) kan heve `current` over tersklene for å se dem live.
- **«Drevet av BarberHQ»:** p.t. REN MOCK (`MOCK_DRIVEN` × flat 350 kr, ikke koblet). Erstattes av ekte attribution-endepunkt — se Må gjøres + Kjent teknisk gjeld.

### Bildeplasserings-system (slots)
- `images` har `slot` (portrett/hero/galleri) + `sort_order`. Barbereren trykker en slot-boks per layout → laster opp dit. Galleri-grense 10; erstatning av portrett/hero sletter gammelt helt (DB+R2). `PATCH /images/:id/slot` flytter. Layout-bytte hard-sletter (DB+R2), transaksjonssikret (BEGIN/COMMIT/ROLLBACK, R2 best-effort utenfor transaksjon).
- `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
- **Crop:** Cropper.js 1.6.2 self-hostet i `no/lib/`. Beskjær-ikon (modal) + ×-ikon per bilde. Crop og Endre bruker `PUT /api/dashboard/images/:id` — bytter R2-fil, bevarer slot/sort_order (destruktiv klientside-crop, canvas→blob→PUT). Aspect: portrett 1:1, galleri 3:4, hero 9:19.5.

### Ordre → barber (Modell B — automatisk)
- Ordre inn → `buildBarberFromOrder(orderId,{pool})` (`src/lib/`) kjøres AUTOMATISK: egen transaksjon, idempotent, `rows[0]`-safe. Slug mot `barbers`, INSERT barbers, UPDATE `orders.barber_id`, re-knytt onboarding-bilder, auto-tildel slots (galleri maks 10; hero → første bilde; direkte → ingen; portrett ALDRI auto). Ved suksess: `orders.status = 'forhandsvist'`.
- **Telegram-varsel** med 2 inline-knapper: 👁 Forhåndsvis (ren URL, `/{slug}`) + 📧 Send e-post (callback → `sendSideKlar`, setter `side_klar_sendt_at`, `editMessage` fjerner knappene + «✅ E-post sendt»). Ingen bygg-/endre-/re-send-knapp — bug-flyt går via ordre-ID → Code manuelt.
- **Webhook:** `POST /api/telegram/webhook`, sikret med `TELEGRAM_WEBHOOK_SECRET` (`X-Telegram-Bot-Api-Secret-Token`, fail-closed 401). `setWebhook` med `allowed_updates:['callback_query']`. `side_klar_sendt_at TIMESTAMPTZ` på `barbers` = idempotens på e-post-send.

### Feedback (idé + support)
- `POST /api/feedback` (`type: idea|support`) → Telegram (viser meldingsteksten) + e-post til info@. Idé beriket med barber-kontekst fra sesjon; support offentlig m/rate-limit. Erstattet to feil: `support.html` POStet til `/api/orders` (fantom-leads, tekst forsvant i payload), og dashboard «Ideer & ønsker» var død UI (`console.log`). Begge nå: ekte POST, suksess kun ved 2xx, mailto-fallback.

### Tagline/bio + font
- `tagline`-kolonne er skilt fra `bio`: `bygg.js` mapper `tagline → {{SPECIALTY}}`, `bio → {{BIO_BLOCK}}`; `fyll.cjs` fjerner tom `.sub` rent. Dashboard Profil-fane har to valgfrie felt (Tagline + Beskrivelse). Onboarding rører ikke tagline/bio.
- **Font-levering kundeside:** Space Grotesk + Plus Jakarta Sans base64-embeddet i templates (Railway CSP `font-src 'self' data:` blokkerer Google Fonts CDN). `.ttf` i `backend/fonts/`. `{{H1_FONT_FAMILY}}` på h1 + h2 i hero/profil/showcase — kun titler, brødtekst Inter. Dashboard-preview server-renderer nå via samme vei (base64-fonter fra `fontOpts()`), ikke lenger CDN.

### Beslutninger som ligger til grunn
- Slot-navn: norsk (`portrett`/`hero`/`galleri`).
- Profil: 1 portrett + opptil 10 galleri = 11 totalt (unntak fra maks-10). Showcase: opptil 10 galleri. Hero: 1 bilde. Direkte: ingen bilder.
- Barbereren trykker en boks → laster opp til den slotten. Erstatt portrett/hero = slett gammelt helt (DB+R2). Galleri vokser etter behov.
- Slot hard-slettes kun ved faktisk layout-bytte — ikke ved annen Design-lagring.
- Én barber = én bookingside (1:1).
- Tagline (kort, valgfri) + Bio (lengre, valgfri) er to separate felt. Onboarding samler ikke tagline — barbereren fyller i dashboard.
- Onboarding-bilder er alltid klippbilder — portrett-slot fylles ALDRI automatisk ved bygg-barber.

## Dashboard: fane-struktur (11 → 6, GJENNOMFØRT 11.07)

`no/dashboard.html` er slått sammen fra 11 til 6 faner:

1. **Oversikt** = Oversikt + Bookinger + vinn-tilbake-**liste**. Pengeside-rekkefølge:
   KPI/omsetning → graf → «Drevet av BarberHQ» → kommende bookinger → full booking-liste
   (no-show-marker) → vinn-tilbake-liste.
2. **Vekst** = vekst-tall (rebooking-rate/trend/attribusjon, mock) + SMS-knottene
   (påminnelse/rebooking/intervall, ekte `GET/PUT /api/dashboard/settings`). Divider mellom
   måling (over) og kontroll (under). Plassholder-kommentar for vinn-tilbake-**konfig**
   (auto-SMS ved kansellering/no-show) — bygges med vekstfeaturen.
3. **Profil** = navn, bio, adresse, tagline (uendret, står alene).
4. **Design** = palett/font/layout/preview + bilder (slots/crop). Layout↔slot-kobling bevart:
   slot-visning følger VALGT layout (live), opplasting låst til LAGRET (banner + klikk-guard).
   Dynamisk bilde-hjelpetekst per layout. Bilder er borte som egen fane.
5. **Tjenester & tider** = tjenester + arbeidstider.
6. **Konto** = abonnement (skall — venter på billing + passord-side). Nav-knappen heter fortsatt
   «Abonnement»; døp om til «Konto» når billing/passord bygges.

- **Mobil-nav:** Oversikt + Vekst alltid synlig; Profil/Tjenester & tider/Design/Konto bak «Mer».
- **Font-velgeren er LEVENDE** (Design: klikk → `design.font` → `PUT /api/dashboard/design` +
  preview-qs). Det var **onboarding**-fonten som ble fjernet (alle får Fraunces), ikke
  dashboard-velgeren. Ikke behandle den som dead UI.

## Kjent teknisk gjeld

- **Tidssone for åpningstider er hardkodet via `barbers.market`** (NO/SE/DK → Europe/Oslo, UK → Europe/London).
  Dette er en MVP-forenkling. Booking-validering mot `business_hours` bruker denne utledningen.
  Riktig løsning: egen `timezone`-kolonne på `barbers`, satt per barber ved onboarding, og bruk den
  i stedet for market-mappingen. Må fikses før vi tar inn barberere utenfor CET/UK.
- **buildPalette er duplisert i fyll.cjs og no/palett.js — må holdes i synk manuelt.**
- **«Drevet av BarberHQ»-seksjonen (Oversikt) er ren mock** (`MOCK_DRIVEN` × flat 350 kr, ikke
  koblet). Erstattes av ekte `GET /api/dashboard/attribution` — se Må gjøres. Viser oppdiktede
  tall til da (bryter ikke ingen-fabrikkerte-regelen før ekte kunde, men launch er ikke her).
- **Dødt attribusjons-stillas på Vekst-fanen:** `api.attribution` (`dashboard.html:806`) kaller et
  slug-basert `/api/barbers/:slug/attribution` som IKKE finnes på backend + `MOCK_ATTRIB` +
  `renderAttrib`/`#vekstAttrib`. Nytt session-endepunkt (`/api/dashboard/attribution`) bør betjene
  BÅDE «Drevet av» (Oversikt) og Vekst; fjern det døde slug-kallet når Vekst bygges.

## Må gjøres (prioritert)

### Høyt — lanseringsblokkere
1. **Duplikat-e-post (backend):** `barbers.email` har INGEN unik-constraint; login tar `rows[0]`
   uten `ORDER BY` = ikke-deterministisk lotteri ved duplikat. Fiks: (a) partial unik-indeks
   `CREATE UNIQUE INDEX ON barbers(lower(email)) WHERE email IS NOT NULL`, (b) deterministisk
   login (avvis flertreff / `ORDER BY created_at`) i `auth.js:35` + `send-magic-link` `auth.js:113`.
   De-dup allerede gjort via test-rydding.
2. **«Gå live»-funksjon** mangler i dashboard — barber kan ikke publisere siden (`page_status`).
3. **Billing (Stripe):** 1 mnd gratis + betaling etter. Rekkefølge billing vs. vekstfeatures IKKE
   avgjort — tas når vi kommer dit.

### Medium
4. **Vekstfeatures (backend):** rebooking, verving, vinn-tilbake auto-SMS. Deretter landingsside-
   avsnitt under «fyll stolen» som forklarer dem.
5. **Profil-side i Konto-fanen:** bytt passord m.m. Døp om nav «Abonnement» → «Konto».
6. **Koble ekte data i Vekst** — Oversikt (diagram/KPI/rekord/månedsvelger) er nå EKTE mot
   `/stats` + `/stats/month`. Gjenstår: Vekst-fanen (stats/trend) + attribusjon «Drevet av»
   (backend `/api/dashboard/attribution` bygges først). Bookinger-liste ekte; no-show-knapp mock.
7. **Test full klikk-flyt med ekte klippbilde** — crop + lagring i Bilder-delen (Design), verifiser
   riktig slot på ekte kundeside. Bevist via API, ikke UI-flyt ennå.
8. **Pris-0-markør i tjeneste-lista** — rød kant + «Sett pris» (parallell til kundesidens
   `prisTekst`-vern; gå-live blokkeres allerede server-side).
9. **«Drevet av»-attribusjon ekte (backend-first, NESTE OPP):** erstatter mock-seksjonen.
   Backend (barberhq-backend) bygger tre kategorier HVER FOR SEG, verifisert mot volum-test før
   neste: rebooking (`rn>1`) → recovered (LAG, prev `ikke_mott`/gap>60d) → vervet
   (`customers.referred_by`, ÅPEN: kun første booking vs alle besøk). Deretter én
   `ranked→classified`-CASE-query (prioritet vervet>recovery>rebooking, ekte `price_nok`)
   eksponert som `GET /api/dashboard/attribution?period=uke|2uker|maaned` (session, vinduer
   matcher `sliceDaily`). **Query-plan + åpen vervet-beslutning: se barberhq-backend CLAUDE.md.**
   Frontend her: `renderDrivenBy` async mot endepunktet, A-framing-titler (ikke «slik ble stolen
   fylt»), skjul på måneds-visning (samme mønster som persentil/rekord-bar). Deretter Vekst-fanen.

### Lav / polish
9. **WebAuthn-instruksjonsbanner + «App kommer»-banner** i dashboard.
10. **favicon.ico mangler** — 404 på alle sider (kosmetisk).
11. **`logg-inn.html` `?error=expired`** — dempet grå i stedet for rød: «Logg inn med e-post og
    passord, eller be om en ny lenke.»

### Teknisk gjeld
12. **`buildHeroHeader()` (fyll.cjs) er dødkode** — backend-CLAUDE.md sier feilaktig «Hero bruker
    `{{HERO_HEADER}}`». Rydd begge.
13. **R2-foreldreløse bildeblobber** fra de 5 slettede test-barberne.
14. **Hero-bildegrense server-side** + **orders.barber_id FK-enforcement** — se sikkerhetshull.
15. **Oversettelse (utsatt fase):** plassholder-strenger (`(spesialitet)`/`(adresse)`/`(bio)`) +
    4 bilde-hjelpetekster + alt sv/da/en. Greppbar markør i koden: `[oversettelse: sv/da/en]`.
16. **Tidssone hardkodet via market** + **buildPalette duplisert** (fyll.cjs ↔ palett.js) — se
    «Kjent teknisk gjeld» over.

### Rydding (untracked repo-filer)
`git clean -f` ville slette både søppel OG ekte arbeid — ikke kjør blindt. Splitt:
- **Seksjonsutkast (commit vs. flytt ut, IKKE slett):** `din-side-seksjon.html`,
  `din-side__bilde.html`, `problem-seksjon.html`, `problem-seksjon__venstre.html`,
  `systemer-seksjon.html`, `produktvisning-seksjon.html`, `SPEC-bytt-seksjoner.md`.
- **Scratchpad-test (kan slettes):** `*_render_test.mjs`, `*_test.mjs`, `demo_*.mjs`, `pw-screenshots/`.
- `package.json`/`package-lock.json` (Playwright-tooling) — vurder å committe.
