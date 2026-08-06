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

### Land + tidssone i site/en/kom-i-gang.html (bygget 27.07, pushet 28.07)
Verifisert på 320/375. **Pushet — ligger sammen med layout-galleriet i `aa7ac98`:**
- **Land-felt** (`#countryPick`, UK/USA, ingen forhåndsvalgt verdi) mellom By og E-post.
  `market` sendes nå fra dette valget, ikke fra språk — `L2M`-mappen er FJERNET i en/.
  no/, sv/, da/ har fortsatt sin egen `L2M`-linje og er urørt.
- **Tidssone-felt** (`#o-tz`, seks IANA-soner) som vises kun ved USA, sendes som `timezone`
  topp-nivå, nullstilles og utelates ved bytte tilbake til UK.
- **City-placeholder** følger landvalget (UK «e.g. London» / USA «e.g. Miami»).
- Payload verifisert med avlyttet fetch: UK ⇒ `market=UK` uten timezone; US ⇒ `market=US` +
  `timezone`; US→UK ⇒ timezone droppet. Validering blokkerer steg 2 ved manglende land og ved
  USA uten tidssone.
- **Backend tar ikke imot dette ennå:** `market='US'` treffer ingen gren, og `timezone` ignoreres
  (tidssone utledes fortsatt av `barbers.market`). Se «Kjent teknisk gjeld».
- Merk: `kom-i-gang.html` har ingen lys variant — sida er hardkodet mørk, ingen
  `prefers-color-scheme`. Lys/mørk-bryteren i steg 2 gjelder kundesida, ikke skjemaet.

## Struktur
- **Publish-rot er `site/`** (satt i netlify.toml `[build] publish = "site"`, commit `04558f9`).
  Alt utenfor `site/` — CLAUDE.md, tools/, .claude/, _utkast/, assets/, config — ligger
  strukturelt utenfor prod og kan ikke serveres.
- site/no/ site/sv/ site/da/ site/en/ — én mappe per språk.
  **Kortform:** `no/`, `sv/`, `da/`, `en/` brukes videre i dette dokumentet som språk-kortform;
  på disk er stien alltid `site/<språk>/`.
- netlify.toml — styrer språk-ruting på Netlify. (`_redirects` er BORTE — rutingen ble
  konsolidert inn i netlify.toml i commit `6c4be83`.)
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
- **Launch-plan ligger i backend-repoets CLAUDE.md (LAUNCH-PLAN-seksjonen) — les den ved
  /oppstart før frontend-arbeid prioriteres.**

**Arbeidslogger hører ikke hjemme i CLAUDE.md. Bruk git-historikk.**

## site/no/index.html — seksjonsrekkefølge (låst 26.06)
1. Hero (`#top`)
2. Produktvisning (`.pv-section` — fra `_utkast/produktvisning-seksjon.html`)
3. Selvbooking (`#selvbooking`)
4. Vekst-intro (`#vekst`) → Rebooking (`#rebooking`) → Verving (`#verving`)
5. Avsluttende CTA (`.final-cta`)
Mangler (skrives separat): Problemet (#2), Din side/anti-marketplace (#5), Prøv gratis 30d (#7).
sv/, da/, en/ følger ikke denne rekkefølgen ennå — gjøres i oversettelses-jobben.

## site/no/index.html — kjente fikser og tilstand (02.07)
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
- **Google Kalender-blokka har TRE tilstander** (Tjenester & tider), ikke to. Den tredje er
  `connected && scope_ok===false` fra `GET /api/dashboard/google/status`: tilkoblet, men skriving når
  ikke fram — enten manglende scope eller en 403 backend har flagget. Rød ramme (`.gcal-warn`) +
  «Bookinger havner ikke i kalenderen din. Koble til på nytt.» Teksten sier KONSEKVENSEN, ikke
  mekanismen — «mangler calendar.events» betyr ingenting for en barberer. `gcalAction` (ikke
  `gcalConnected`) styrer knappen, fordi «er tilkoblet» og «hva knappen gjør» sluttet å være samme
  spørsmål: i tredje tilstand ER man tilkoblet, men knappen skal koble til PÅ NYTT. `scope_ok===false`
  sjekkes eksplisitt så en eldre backend uten feltet ikke utløser varselet.
  **`.gcal-warn` MÅ ligge utenfor `@media`-blokkene** — første forsøk havnet inni en `max-width`-regel,
  og da var varselet usynlig på desktop mens 320/375-screenshotene så helt riktige ut.
- **Palett-konsistens:** én delt kilde (`site/no/palett.js`) for kom-i-gang + dashboard, i synk med `fyll.cjs`. Ren svart/hvit bakgrunn i mørk modus, aksent skiller.
- **Kundeside bygges fra `barbers`-raden** (ikke `orders.payload`): alt barbereren endrer (design, layout, font, adresse, bio, bilder, tjenester) når bookingsiden. Oppslag via `barbers.slug`, status-gating via `barbers.page_status`. `savedLayout` er skilt fra `design.layout` — Bilder-fanen leser alltid lagret DB-verdi.

### Oversikt-diagram (Oversikt-fanen)
Ett stolpediagram + KPI, én motor. `sliceDaily(daily[], period)` / `sliceMonth(days[], ym)` null-fyller til `[{l,kr,l2,count,new,returning}]` → `renderBarChart(data, period)` (leser `d.l/d.kr/d.l2`). Samme skårne array mater KPI-kortene (Σcount=Kunder, Σrevenue=Estimert omsetning). Diagrammet dekker hele historikken.
- **Perioder:** pill-er (Siste uke=7d / Siste 2 uker=14d / Denne måneden=1.→i dag), rullende, forankret Oslo-i-dag. `daily[]` = 90-dagers vindu fra `/stats`.
- **Månedsvelger:** «Tidligere»-dropdown fra `/stats.months_with_data` (nyest øverst, ekskl. inneværende måned). Valg → `GET /api/dashboard/stats/month?ym=YYYY-MM` (sparse `days[]` + måned-totaler, ym-validering→400) → `sliceMonth` (dag-antall via `new Date(år,mnd,0).getDate()` → korrekt 28/29/30/31) → bytter BÅDE diagram + KPI. Pill↔måned-state isolert (pill-klikk nullstiller dropdown; ingen lekkasje).
- **Ingen tall over stolpene (31.07).** `.cbar-val` (beløp i småskrift over hver stolpe) er fjernet
  helt — både CSS-regelen og `renderBarChart`-markupen. På fullt månedsdiagram (28–31 stolper)
  overlappet tallene hverandre til uleselig grøt. Beløpet bor i HUD-kortet ved trykk (lag 2), som
  allerede viser det større og med kontekst. Ikke legg dem tilbake uten å løse tettheten.
- **Volum-farge (lag 1):** `colorForRatio(d.kr/max)` — glidende lineær RGB dempet blågrå → brand-blå → brand-grønn, relativt til beste stolpe i visningen. Per-stolpe gradient (mørk bunn→lys topp av stolpens EGEN farge), ingen glow.
- **HUD + touch (lag 2, variant A):** magnetisk `pointerdown`/`pointermove` på `#chartBars`, snap via `getBoundingClientRect`. Valgt stolpe → **kort forankret til stolpen** (`#chartHud`, absolutt i `.chart-wrap`): dato liten/dempet, beløp stort + «· N klipp», pills nye (blå) / gjengangere (grønn). Løsrevet caret (`#chartCaret`) på stolpe-senter + peker-linje til stolpetopp; horisontal clamping innenfor kort-padding ved kant-stolper; skann-glid `transition:left .09s`. `pointer-events:none` på kort/caret → tap/skann/undo treffer stolpene under. Undo: tap valgt stolpe → `clearSel()`, tap-vs-dra <8px.
- **Entré + tell-opp (lag 3):** stolper stiger staggered venstre→høyre (variant D: step 95ms / rise 350ms, clamp `ENTRY_MAX_TOTAL=3000` → 90-heatmap sprenger aldri), KPI teller 0→target, KUN første render (`chartEntered`-flagg); pill/tab = uniform vekst, ingen tell-opp. Respekterer `prefers-reduced-motion`.
- **Uke-rekord (lag 4) — KUN pill-modus inneværende uke:** `current_week_revenue`/`best_week_revenue`/`best_week_start` fra `/stats` (backend-beregnet, on-read/Oslo, best = MAX ferdige uker). Gull-KPI (`#estRevValue` gull-gradient + drop-shadow-glow + puls) tenner kun ved `current > best` OG `curPeriod==="uke"`. Dempet «Beste uke: X kr · [mnd]»-fotnote ellers.
- **Persentil + rekord-bar (batch 2) — KUN pill-modus inneværende uke:** fra `/stats.weekly_revenue` (`[{week_start,revenue}]`, all-time ferdige uker, on-read/Oslo, `max==best_week_revenue` per konstruksjon). Persentil «Bedre enn X% av dine egne uker» vist ved ≥6 uker OG pct≥50 (over median), undertrykt ved rekord. Rekord-bar `current/best`: <0.80 skjul · 0.80–1.0 «X kr unna» · ≥1.0 «Ny rekord denne uka! 🔥» 100% gull. Baren eier rekord-budskapet (tømmer `#rekordNote`) → ingen dobbelt. Skjult på 2uker/måned/historisk måned.
- **Merk (aldri sett live):** mot volum-test er `current_week` (~10 550) « `best` (13 950 = 76%) → persentil + rekord-bar naturlig SKJULT. «unna»/«rekord»-tilstand kun Playwright/deterministisk verifisert. `gull-demo.cjs`-fixtur (backend-repo) kan heve `current` over tersklene for å se dem live.
- **«Drevet av BarberHQ» (Oversikt):** `renderDrivenBy` henter alltid ekte `GET /api/dashboard/attribution?period=uke|2uker|maaned` (session) via `api.attribution` — mock (`MOCK_ATTRIBUTION` + `USE_MOCK`-flagget) fjernet i `fa02e3f`. Tre rader (rebooking/vinn-tilbake/vervet); 0-rad-kategori rendrer «0 klipp · 0 kr», alle tre 0 → tomtilstand «Her bygger verdien seg opp». Delta «fra forrige uke» kun på uke-pill (2uker−uke). Skjult på historisk måneds-visning. Gjenstår: backend-query + verifiser ekte/seedet tall mot prod — se Må gjøres.

### Bildeplasserings-system (slots)
- `images` har `slot` (portrett/hero/galleri) + `sort_order`. Barbereren trykker en slot-boks per layout → laster opp dit. Galleri-grense 10; erstatning av portrett/hero sletter gammelt helt (DB+R2). `PATCH /images/:id/slot` flytter. Layout-bytte hard-sletter (DB+R2), transaksjonssikret (BEGIN/COMMIT/ROLLBACK, R2 best-effort utenfor transaksjon).
- `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
- **Crop:** Cropper.js 1.6.2 self-hostet i `site/no/lib/`. Beskjær-ikon (modal) + ×-ikon per bilde. Crop og Endre bruker `PUT /api/dashboard/images/:id` — bytter R2-fil, bevarer slot/sort_order (destruktiv klientside-crop, canvas→blob→PUT). Aspect: portrett 1:1, galleri 3:4, hero 9:19.5.

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

## Dashboard: fane-struktur (11 → 6, GJENNOMFØRT 11.07; +Innstillinger 31.07 = 7)

`site/no/dashboard.html` er slått sammen fra 11 til 6 faner (+ Innstillinger, se under):

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
7. **Innstillinger** (ny 31.07) = innstillinger for DASHBORDET, ikke for bookingsiden.
   Foreløpig kun «Utseende» med mørk/lys-toggle. Egen fane fordi tema-knappen ikke lenger
   bor i headeren — se under.

- **Tema-toggle flyttet fra header til Innstillinger (31.07).** `#themeBtn` er samme knapp og
  samme id (all eksisterende tema-JS er urørt), men står nå i en `.tog-row` i Innstillinger med
  etikett «Mørk modus» + «Huskes i denne nettleseren». Headerens `.who` har nå kun barbernavnet.
  Underteksten sier eksplisitt at dette gjelder dashbordet, ikke kundesida — lys/mørk for
  bookingsida velges under Design, og de to ble blandet sammen så lenge knappen sto løs i headeren.
- **«Bytt passord» hører hjemme i Innstillinger, men er BEVISST IKKE bygget** — det ligger kun en
  HTML-kommentar der. Årsak: `POST /api/dashboard/set-password` tar kun `{password}` og verifiserer
  ikke nåværende passord. Den ruta er laget for førstegangs-setting etter magisk lenke; brukt som
  «bytt passord» i et innlogget dashbord ville den latt hvem som helst med en kapret sesjon bytte
  passordet uten å kunne det gamle. Venter på backend-rute som krever nåværende passord.
- **Mobil-nav:** Oversikt + Vekst alltid synlig; Profil/Tjenester & tider/Design/Konto/Innstillinger
  bak «Mer» (fanen har `class="nav-mer"` og plukkes opp av «Mer»-menyen automatisk).
- **Font-velgeren er LEVENDE** (Design: klikk → `design.font` → `PUT /api/dashboard/design` +
  preview-qs). Det var **onboarding**-fonten som ble fjernet (alle får Fraunces), ikke
  dashboard-velgeren. Ikke behandle den som dead UI.

## Kjent teknisk gjeld

- **Tidssone for åpningstider er hardkodet via `barbers.market`** (NO/SE/DK → Europe/Oslo, UK → Europe/London).
  Dette er en MVP-forenkling. Booking-validering mot `business_hours` bruker denne utledningen.
  Riktig løsning: egen `timezone`-kolonne på `barbers`, satt per barber ved onboarding, og bruk den
  i stedet for market-mappingen. Må fikses før vi tar inn barberere utenfor CET/UK.
- **buildPalette er duplisert i fyll.cjs og site/no/palett.js — må holdes i synk manuelt.**
- **Attribusjon-mock er FJERNET (`fa02e3f`):** «Drevet av»-panelet er ikke lenger mock, og det gamle
  slug-stillaset (slug-basert `/api/barbers/:slug/attribution` + `MOCK_ATTRIB` + `renderAttrib`/`#vekstAttrib`)
  var allerede borte før dette. `api.attribution` kaller nå kun session-endepunktet
  `/api/dashboard/attribution` (mater `renderDrivenBy` på Oversikt). Utestående gjeld ligger på backend-
  siden (query + seedet/ekte tall) — se Må gjøres «Drevet av»-attribusjon.
- **Demo-fotoene til layout-galleriet fantes ikke som kildefiler** — `site/no/images/layout-*.webp`
  er ferdig komponerte mockups levert utenfra (832×1740, transparent bakgrunn, telefonramme), og
  fotoene måtte klippes ut av dem igjen for hvert nytt språk. **Løst 28.07:** utklippene ligger nå
  som kilder i `_utkast/layout_gallery_en/kilder/` (utenfor publish-rot) sammen med hele
  renderkjeden. Klipp aldri ut på nytt fra webp-ene — bruk kildene.

## Layout-galleri på engelsk — FERDIG 28.07 (pushet, `aa7ac98`)

Galleriet er bygget, rammet inn og koblet i `site/en/kom-i-gang.html`. Hele kjeden ligger i
`_utkast/layout_gallery_en/` (fem scripts + kilder) — kjør dem i rekkefølge for å bygge på nytt.
Scriptene har absolutte scratchpad-stier og må repekes.

Målt og verifisert, gjenbrukbart neste gang:
- **Telefonrammen:** skjermflaten er 780×1688 med origo (26,26) i den 832×1740 store webp-en —
  altså Playwright-viewport 390×844 med `device_scale_factor=2`. Status-linje (9:41) + Dynamic
  Island er tegnet OPPÅ skjermflaten i mockupen, så de må enten reproduseres eller unngås ved
  utklipp.
- **Rendring:** backendens egen `fill()` fra `fyll.cjs` brukes direkte med
  `{palette:'minimal', mode:'mork', font:'fraunces'}` og tom `adresse` (tom adresse ⇒ `CITY_SUFFIX`
  og `ADDR_BLOCK` blir tomme ⇒ ingen stedsnavn noe sted). Fonter sendes som base64 via `fontOpts`.
  Bilder MÅ sendes som egne filer ved siden av HTML-en — data-URI ga `ERR_INVALID_URL` på ett bilde.
- **Demo-innhold (godkjent):** Grand Barber · «Fades & classic cuts» ·
  «Precision in every cut. Sharp fades, clean lines, no rush.» · Men's cut 30/Skin fade 40/
  Cut & beard 45/Beard trim 20/Student cut 30. Priser i £.
- **Engelsk UI er ETTERBEHANDLING av HTML-en, ikke i18n.** Malene (`booking-module.cjs`,
  `*.template.html`) er norsk-hardkodet — «Se tjenester», «Velg tjeneste», «Bygget med», og
  `prisTekst()` hardkoder `' kr'`. `2-render.mjs` har et norsk→engelsk-kart som kjøres på ferdig
  HTML. Rører IKKE backend. Blir liggende til malene faktisk oversettes.
- **Utklipp av demo-foto fra `site/no/images/` (sharp `.extract`) — bare til referanse, kildene
  ligger nå i `_utkast/layout_gallery_en/kilder/`:** galleri fra `layout-showcase.webp` —
  `{top:487,height:484}` og `{top:975,height:484}`, kolonner `{left:26,width:388}` og
  `{left:417,width:388}`. Hero-bånd fra `layout-hero.webp`: `{left:26,top:180,width:780,height:995}`
  — **995, ikke 900**: den innbrente teksten starter først på skjermrad 1149.
- **Rammen settes sammen igjen i `3-ramme.mjs`:** basen er `no/layout-direkte.webp` (flat bakgrunn
  i toppen ⇒ ren nøkling). Skjermflaten byttes ut, maskert med skjermens egen hjørneform hentet fra
  basen, og status-linja legges tilbake oppå — nøklet på avstand fra basens bakgrunnsfarge, så
  Dynamic Island (svart) og glyfene (hvite) følger med mens bakgrunnen blir gjennomsiktig.

### en/ ↔ no/ kom-i-gang: hva som faktisk skiller (kartlagt 27.07)
**Steg 1 er strukturelt identisk** — kun språk skiller. Hele deltaet ligger i steg 2:
no/ har layout FØRST (med hjelpetekst), ekte `images/layout-*.webp` i
stedet for inline base64, «Anbefalt»-badge på showcase, live tjeneste-preview i iframe
(`preview-tjenester.html`, refarges via postMessage fra `buildPalette`), `palett.js` som delt
kilde, maks 10 bilder med dynamisk grense per layout (hero=1, direkte skjuler bolken), krav om
minst ett bilde med mindre layout=direkte, og `design={mint,mørk,profil}`.
CSS-deltaet er lite: `.lay-help`, `.preview-wrap`, `#tjenesterPreview`, `.preview-cap`,
`.layout-badge`. De reviderte `#layGrid`-reglene er portet 28.07 — en/ hadde
`.lthumb{height:288px;object-fit:cover}` som klippet thumbnailen til øverste halvdel av
telefonen; nå `height:auto` som i no/. Resten av stilarket er allerede likt.
**en/ mangler to filer no/ har:** `palett.js`, `preview-tjenester.html`. (`images/` er på plass.)
**Uavklart:** `palett.js` har norske palettnavn og inneholder `buildPalette` — en kopi til en/
gjør den duplisert i TRE filer (fyll.cjs, no/, en/). Alternativet er å dele logikken og skille ut
tekstene, men det rører no/ også. Henrik har ikke tatt stilling ennå.

Løst 28.07:
1. ~~Hero-bildet~~ **LØST.** Kantkopieringen er borte. `1-bygg-hero.mjs` legger det rene båndet
   (skalert 1,2× og senterbeskåret til 780 bredt) øverst på et 780×1688-lerret i `#0a0a0a` og toner
   det ned i bakgrunnsfargen over de siste ~215 px. Ingen piksler oppfinnes ⇒ ingen striper.
   Malens egen bunn-scrim ligger uansett oppå.
2. ~~Profil-portrettet~~ **LØST.** Henrik valgte logoen. «EST. OSLO» er retusjert bort i
   `4-retusj-logo.mjs`: for hver rad speiles rene piksler fra samme rad inn over teksten (venstre
   halvdel fra venstre side, høyre fra høyre), med 5 px alpharampe på kantene — beholder gradient
   og korn. Retusjen gjøres på **logo-utklippet**, ikke på den ferdige `layout-profil.webp`, ellers
   overskrives den ved neste render. Resultat: 0 piksler over terskel der teksten sto (var 141).
3. ~~Font-velgeren i en/~~ **FJERNET 28.07.** Sto igjen i en/ med norske etiketter («Klassisk
   serif», «Ren sans», «Kraftig»). Det var ikke oversettelsesetterslep — det var at en/ ikke
   speilet no/, som fjernet velgeren med vilje (alle får Fraunces, font velges i dashbordet).
   Samme snitt i en/: Font-blokka i steg 2, `FONTS`-arrayet, `font`-nøkkelen i `design`,
   `fontGrid`-rendringen og `fd.append('font')`. `.fsamp`-CSS og Google Fonts-`<link>`-ene står
   igjen i BEGGE — død CSS, bevisst beholdt for å holde filene like.
   **Dashboard-velgeren er urørt og fortsatt levende** — ikke forveksle de to.

Fortsatt åpent:
3. **Direkte-thumbnailen er markant annerledes enn no/:** malen rendrer nå FASE B-booking-
   modulen (3 steg), ikke den gamle enkle tjenestelista. Riktig ifølge WYSIWYG-prinsippet i
   `_utkast/layout_gallery_handoff/HANDOFF.md`, men en bevisst synlig endring. no/-galleriet viser
   fortsatt den gamle lista og bør rendres på nytt fra samme kjede.
4. **Valuta i Direkte-thumbnailen:** eneste layout som viser priser, og en/ dekker to valutaer.
   Nå £ i begge. Skisse: to varianter (`layout-direkte-uk.webp` / `-us.webp`) byttet på landvalget.
   Men det er plaster på det hardkodede `' kr'` i backend, ikke en fiks.
5. **`.manage-link` kolliderer med statuslinja på notch-telefon (ekte bug, ikke bare mockup):**
   `direkte.template.html:77` har `position:absolute;top:18px` inne i en `.page` med
   `padding:max(56px,env(safe-area-inset-top))`. Med `viewport-fit=cover` havner «Endre/avbestill»
   under statuslinja på enhver iPhone med notch. Mockupen dytter den ned i `2-render.mjs`; malen er
   IKKE fikset. Hører hjemme i backend-repoet.
6. **Palett-navnene i `site/en/kom-i-gang.html` står fortsatt på norsk.** `PALETTES`-arrayet er
   inline i fila og har norske titler/beskrivelser («Klassisk BarberHQ», «Krem & Gull»,
   «Minimalistisk», «Friskt grønt», «Sort/hvit + blå», «Brent oransje, sort») — synlig i steg 2.
   Tas i oversettelsesfasen sammen med resten av en/. Henger sammen med den uavklarte
   `palett.js`-delingen over: løses den ved å skille tekst fra logikk, forsvinner dette punktet
   av seg selv.

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
4. **KUNDESIDEN ER HARDKODET NORSK — blokkerer hele en/-markedet (funnet 27.07).**
   `booking-module.cjs` (backend) har ingen i18n: «Velg tjeneste», «Velg time», «Dato og tid»,
   «Dine opplysninger», «Velg minst én tjeneste for å booke», «Se tjenester», «Har du time?
   Endre eller avbestill», «Bygget med BarberHQ» er faste norske strenger. `prisTekst()` i samme
   fil hardkoder `' kr'` — det finnes ingen valuta-abstraksjon i det hele tatt. En UK/US-barberer
   som onboarder via en/ får altså en norsk bookingside med kroner. Må løses i backend FØR en/
   kan ta imot ekte barberere; er uavhengig av (og større enn) land/tidssone-feltene i skjemaet.
5. **«Forgot password?» er død i en/ — `site/en/logg-inn.html:146` peker på `href="#"`.**
   Magisk-lenke-flyten (`POST /api/send-magic-link` + `opprett-passord.html`) finnes i no/, men
   er aldri portet til en/. En barberer som ikke kommer inn i dashbordet har ikke et produkt —
   dette er en lanseringsblokker, ikke en død footer-lenke. Krever både lenke/flyt i
   `en/logg-inn.html` og en engelsk `opprett-passord.html` (fila finnes bare i no/ i dag).

### Medium
4. **Vekstfeatures (backend):** rebooking, verving, vinn-tilbake auto-SMS. Deretter landingsside-
   avsnitt under «fyll stolen» som forklarer dem.
5. **Bytt passord i Innstillinger — BLOKKERT PÅ BACKEND.** UI-en er ikke bygget med vilje:
   `POST /api/dashboard/set-password` verifiserer ikke nåværende passord (laget for førstegangs-
   setting etter magisk lenke). Trenger en backend-rute som krever `currentPassword` før frontend
   kan bygges. Døp samtidig om nav «Abonnement» → «Konto».
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
   Frontend her: GJORT (`fa02e3f`) — `renderDrivenBy` async mot session-endepunktet, mock/`USE_MOCK`
   fjernet, A-framing-titler, 0-rad-håndtering, skjul på historisk måneds-visning. Gjenstår: backend-
   query + verifiser ekte/seedet tall mot prod. Deretter Vekst-fanen.
10. **Terms- og Cookies-sider mangler — gjelder BÅDE en/ og no/.** Footerne på alle fire sider
    per språk (`index`, `funksjoner`, `priser`, `support`) har `<a href="#">` for Terms/Vilkår og
    Cookies. Privacy er løst i en/ (`privacy.html`); no/ har fortsatt `href="#"` på alle tre og
    trenger en oversatt `personvern.html` i tillegg. Sidene finnes ikke noe sted i repoet.
    Merk `netlify.toml`: hele `/en/*` har `X-Robots-Tag: noindex` til oversettelsesfasen er
    ferdig — juridiske sider under en/ blir altså ikke indeksert før den fjernes.
11. **Døde lenker i footeren på no/ (kartlagt 29.07).** Ikke bare de juridiske:
    - `Vilkår` / `Personvern` / `Cookies` (`site/no/index.html:861–863`) — `href="#"`, sidene
      finnes ikke. Samme sak som punkt 10.
    - `Alt på ett sted` (`:851`) — peker på `#alt-pa-ett-sted`, men **ingen seksjon har den id-en**.
      Produktvisningen heter `id="produkt"`. Enten repek lenka eller gi seksjonen riktig id.
    - `Funksjoner`, `Priser`, `Kom i gang`, e-post og Instagram ER koblet — ikke rør dem.
    - `Se dashbordet` (`:522`, `:536`) er `href="#"` med vilje — styres av `DEMO_ENABLED = false`
      og skrus på ved launch. Ikke en bug.
    Samme gjennomgang må gjøres på `funksjoner.html`, `priser.html`, `support.html` og i en/.
12. **Produktvisningen (`.pv-section`, `site/no/index.html:605`) skal se bedre ut.** Henriks
    vurdering 29.07 — ikke spesifisert hva som er galt ennå. Krever egen runde: se på den,
    bli enige om hva som feiler, så bygg. Seksjonen er én `dashboard-produkt.png` med tre
    absolutt-posisjonerte `.pv-title`-etiketter (`left/top` i %) oppå — etikett-posisjonene er
    hardkodet mot akkurat det bildet og brekker hvis bildet byttes.
13. **«Bygd for å fylle stolen»-seksjonen (`.sys-h2`, `site/no/index.html:673`) skal endres.**
    Henriks vurdering 29.07 — omfang ikke bestemt (tekst? layout? hele seksjonen?). Avklares før
    kode. Merk at CTA-en nederst (`:821` «Klar til å fylle stolen?») gjenbruker samme bilde —
    endres budskapet her, må de to henge sammen.

### Lav / polish
9. **WebAuthn-instruksjonsbanner + «App kommer»-banner** i dashboard.
10. **favicon.ico mangler** — 404 på alle sider (kosmetisk).

### Teknisk gjeld
12. **`buildHeroHeader()` (fyll.cjs) er dødkode** — backend-CLAUDE.md sier feilaktig «Hero bruker
    `{{HERO_HEADER}}`». Rydd begge.
13. **R2-foreldreløse bildeblobber** fra de 5 slettede test-barberne.
14. **Hero-bildegrense server-side** + **orders.barber_id FK-enforcement** — se sikkerhetshull.
15. **Oversettelse (utsatt fase):** plassholder-strenger (`(spesialitet)`/`(adresse)`/`(bio)`) +
    4 bilde-hjelpetekster + Vekst-flytens nye ledd (Påminnelse-boks «Kvelden før» + kortede
    undertekster + SMS-samtykke-linja i Rebooking-trekkspillet) + alt sv/da/en. Greppbar markør i
    koden: `[oversettelse: sv/da/en]`. **Også: norske palett-navn i `PALETTES` i
    `site/en/kom-i-gang.html`** — se «Layout-galleri på engelsk», punkt 6.
16. **Tidssone hardkodet via market** + **buildPalette duplisert** (fyll.cjs ↔ site/no/palett.js) — se
    «Kjent teknisk gjeld» over.

### Hvor filer bor (plasseringsregler)
- **Seksjonsutkast bor i `_utkast/`** — `din-side-seksjon.html`, `din-side__bilde.html`,
  `problem-seksjon.html`, `problem-seksjon__venstre.html`, `systemer-seksjon.html`,
  `produktvisning-seksjon.html`, `SPEC-bytt-seksjoner.md`. Katalogen ligger utenfor publish-rota
  `site/` og serveres aldri. Nye utkast hører hjemme her, ikke i repo-rota.
- **Playwright-tooling** (`package.json`/`package-lock.json`) hører hjemme i repo-rota.
- **Scratchpad-testfiler** (`*_render_test.mjs`, `*_test.mjs`, `demo_*.mjs`, `pw-screenshots/`)
  hører ikke hjemme i repoet i det hele tatt — legg dem i scratchpad-katalogen utenfor repoet.
