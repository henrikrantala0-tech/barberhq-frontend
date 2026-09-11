# CLAUDE.md — barberhq-frontend

Frontend for BarberHQ (statisk side, deployes til Netlify).
Søsterrepo: barberhq-backend (Railway).

**Backend-repoet er NØSTET på disk.** Git-rota er `C:\Users\henri\Desktop\barberhq-backend\`, men all
kildekode ligger ett nivå ned i `C:\Users\henri\Desktop\barberhq-backend\barberhq-backend\` — `src/`,
`booking-module.cjs`, `fyll.cjs`, malene og backendens egen CLAUDE.md er alle der.
Undermappa er ikke selv en git-rot. **Alle backend-filreferanser i dette dokumentet er
relative til det nøstede nivået**, ikke til git-rota: `src/lib/trial.js` betyr
`C:\Users\henri\Desktop\barberhq-backend\barberhq-backend\src\lib\trial.js`.
(⚠ En UTDATERT kopi uten git ligger på `C:\barberhq-backend\` — snapshot fra 16.06, mangler
hele dashboard/winback-koden. Ikke rediger den; bør slettes/omdøpes. Se «flagg» i chat 04.09.)

## ⚠️ Språk-status (viktig)
- **Norsk (no/) er ALLTID kilden.** sv/, da/, en/ oversettes FRA norsk.
- **sv/, da/, en/ er bevisst utdaterte akkurat nå.** Kun no/ har dagens
  nyeste dashboard og kom-i-gang (23.06). Oversettelse gjøres HELT TIL SLUTT,
  etter at norsk innhold er ferdig — ikke underveis (ville krevd re-oversetting
  ved hver endring).
- **Alle fire språk HAR dashboard.html.** Her sto det at da/ og sv/ manglet fila — feil.
  Det som faktisk skiller er alderen: sv/, da/ og en/ er fra 24.07 og har den GAMLE
  fanestrukturen. Talt 12.08 i hver fil: «Din side», «Konto» og «Tjenester & tider» gir
  **0 treff i alle tre**, mens no/ har 47 til sammen (16 / 33 / 1). Motsatt har sv/da/en
  fortsatt 10 treff hver på «Profil», fanen som er slått inn i «Din side» i no/. De tre
  må altså ikke bare oversettes — de må bygges om til fem-fane-strukturen.
- **Metode for dashbord-oversettelse er ikke bestemt.** Her sto det at jobben gjøres via
  `oversett_dash.py` i `backend-repo/verktøy`. Verifisert 12.08: scriptet finnes ikke i noen
  av repoene, og backend-repoet har ingen `verktøy/`- eller `tools/`-mappe i det hele tatt.
  Velg framgangsmåte når oversettelsesfasen faktisk starter.

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
- **⚠ FAST SJEKK — ny offentlig backend-rute = oppdater Netlify-proxyen.** Backend-ruter serveres via
  proxy-regler i netlify.toml (`/api/*`, `/book/*`, `/avmeld/*`, `/images/*`, `/verv/*`, `/lojalitet/*`
  → `api.trybarberhq.com`, status 200, force, ALLE før `/:slug`). En backend-rute UTEN en slik regel
  treffer Netlifys statiske 404 og når aldri Railway. Dette har bitt oss to ganger 10.09 (`/images/*` for
  crop/bildevelger, `/verv/*`+`/lojalitet/*` for kampanje-landinger). **Legger backend til en ny offentlig
  rute, MÅ en proxy-regel inn her — plassert FØR `/:slug`, ellers sluker ett-segment-slug-regelen den.**
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

- **Pris:** to planer — **Basis 89 kr/mnd, Vekst 179 kr/mnd** (`PLAN_INFO` `:5502`, fail-closed;
  ingen fast 249 eller 499-trapp lenger — verifisert mot kode 07.09). **30 dagers gratis prøveperiode**
  i alle markeder — bevisst og riktig, ikke en feil i koden. Her sto det «(trial_period_days: 30)», som
  bare er én av **tre** grener i `checkoutTrialParams` (backend `src/lib/trial.js`) — verifisert
  12.08 mot koden:
  1. **`trial_start_at` er NULL** → `{ trial_period_days: TRIAL_DAGER }`. Stripe teller selv de
     30 dagene. Dette er veien for den som betaler før hen publiserer.
  2. **`trial_start_at` satt og prøveperioden løper** → `{ trial_end: <unix-sekunder> }`, altså
     barberens EGEN sluttdato (`trial_start_at` + 30 dager), ikke en ny 30-dagersperiode. Verdien
     har et gulv: Stripe krever at `trial_end` ligger minst 48 timer fram (`STRIPE_MIN_TRIAL_MS`),
     så står det mindre igjen, brukes now+48t i stedet.
  3. **`trial_start_at` satt og perioden UTLØPT** → `{}` — ingen trial i det hele tatt, Stripe
     trekker med en gang.
  Konstanter: `TRIAL_DAGER = 30`, `MYK_PERIODE_DAGER = 7` (nåde etter utløp før siden tas ned).
  Nedtakingsdagen er summen av de to og er **aldri skrevet som et tall** i koden — `trialSweep.js`
  regner den ut som `NEDTAKINGSDAGER = TRIAL_DAGER + MYK_PERIODE_DAGER`. Ikke hardkod 37.
- **Marked:** fire land samtidig — NO / SE / DK / UK. Tyskland droppet.
- **Domene:** `trybarberhq.com` + `trybarberhq.no`.
- **Ingen KUNDE-pengestrøm** gjennom plattformen: kunder betaler barberen direkte i salongen,
  betalingsmetoder vises kun som info (`loadPayment`, Tjenester-fanen). ⚠ Barberens ABONNEMENT går
  derimot via Stripe og er LIVE (`loadBilling` → checkout/portal, `PLAN_INFO` 89/179) — ikke bland
  de to. «Ingen pengestrøm» gjaldt aldri abonnementet.
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
- **Typografiskala (ASPIRASJONELL — en retning, ikke en gjeldende regel):** skalaen
  `--fs-title/section/body/small/micro` + `--fw-bold/medium/regular` finnes, men er IKKE innført i
  frontendens egne sider — de bruker løse `px`. De eneste `--fs-`-treffene i frontend ligger i
  produktvisnings-klonen (`site/no/index.html` `#produkt .pv-book`) og er backend-arv fra
  booking-modulens CSS, ikke frontendens eget system (`dashboard.html` sier eksplisitt at den ikke
  bruker skalaen). Ønsket retning ved nye flater, men ikke håndhevet i dag.
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
- **ÉN Code-sesjon per repo.** To sesjoner på samme repo deler arbeidstre og kan committe
  hverandres endringer. Skjedde 6. august: en parallell sesjon committet endringer den ikke
  hadde skrevet (`46b3940` og `ecacf83` i backend-repoet). Det gikk bra den gangen fordi begge
  dro i samme retning — men `git add -A` fra én sesjon sveiper med seg halvferdig arbeid fra
  den andre, og to pusher kan kollidere. Startup-scriptet `C:\start.ps1` åpner én terminal per
  repo. **Blir det flere, steng dem.**

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
- **⚠ Klonet CSS: `vw/vh/vmin/vmax` og `@media` er begge VIEWPORT-baserte og meningsløse i
  en fastbreddet klon.** Produktvisningen i `site/no/index.html` kloner dashbordet og
  bookingsida inn i containere med fast designbredde. Alt som løses mot viewporten løses da
  mot LANDINGSSIDAS viewport, ikke mot containeren — og gir feil layout uten å feile.
  Begge har brent oss:
  - `@media`: kollapset dashbordets nav til tre faner på en 320px skjerm selv om containeren
    var 780px bred. Løsning: strippes i scoping-steget.
  - `vw`: `.cover h1{font-size:clamp(38px,11vw,54px)}` valgte TAKET (54px) fordi 11vw av
    1280px = 141px, der produktet på 320px viewport velger GULVET (38px). Tittelen brakk til
    to linjer der produktet holder én. Løsning: regnes om til px mot designbredden i
    scoping-steget, med teller og en vakt som feiler hvis noe gjenstår.
  - `position:fixed` er den TREDJE, og den mest lumske: den forankres til viewporten —
    MED MINDRE en forfar har `transform`/`filter`/`will-change`, som da blir containing
    block. Klonen har begge deler, så hvilken det blir avhenger av hvor en transform
    tilfeldigvis står. Bookingmodulen bruker fixed på `.sheet`, `.see-float` og
    `.cover-manage-link`. Målt: arket ble en grå flate på størrelse med hele sida, og
    CTA-en havnet 52px UNDER telefonskjermen. Løsning (`site/no/index.html`, under
    «Klonet CSS slutter her»): `.sheet` nøytraliseres til `position:static`, og de to
    andre til `absolute` mot en `.pv-scale` som er pinnet med `position:absolute;top:0;left:0`.
    Forankringen gjøres EKSPLISITT i stedet for å gjettes.
  **Nøytraliseringer skal kun rette LAYOUT, aldri legge til spacing.** Mine la på 20px
  padding på `.cover` (kilden har `padding:56px 0 120px` — null horisontalt, innrykket
  kommer fra `h1{margin:0 28px}`) og 20px i `.sheet-inner` der kilden har 24px. Til sammen
  86px mindre plass til tittelen enn produktet gir.
- **Produktfunn: `.cover h1` slutter å krympe under ~345px viewport.**
  `clamp(38px,11vw,54px)` har 38px som absolutt gulv, og h1 får 264px (320 − 2×28 margin).
  Målt ved 38px/−0.03em i Plus Jakarta Sans 600: «Grand Barber» (12 tegn) = 231px,
  «Barber Studio» (13) = 236px — begge passer. «Oslo Barbershop» (15) = 291px brekker.
  Grensen er tegnbredde, ikke antall: 8 tegn i bredeste bokstav (M), 11 i smaleste (n),
  ~13–14 i typisk blandet tekst. **Barbernavn over ~14 tegn brekker til to linjer på 320px.**
  Egen jobb: vurder maks-lengde på shop-navn i onboarding-skjemaet.
- **⚠ Maskinell CSS-scoping: kildens ROTELEMENTER må mappes til klonens rot, og landingssidas
  egne klassenavn må nøytraliseres.** To feil med samme symptom (nav/innhold grått bak en svart
  header i dashbord-klonen), begge funnet 09.08 ved å måle `getComputedStyle` mot kilden — de var
  usynlige på øyemål fordi resultatet bare så «litt annerledes» ut:
  1. `:root`, `html` OG `body` er alle klonens rot. Ble `body` glemt, havnet kildens
     `body{background:var(--bg)}` på `#produkt .pv-dash body` — en selektor som aldri kan treffe.
     **Variablene kom inn, så `--bg` målte riktig; det var deklarasjonen som forsvant.** Klonen ble
     gjennomsiktig og kortets eget `.brw{background:#141414}` lyste gjennom.
  2. Klonen arver klassenavn fra kilden, og landingssida har egne uscopede regler for noen av dem
     (`wrap`, `nav`, `logo`). `.nav{background:rgba(10,10,10,.72);backdrop-filter:blur(14px)}` la seg
     oppå klonen — en stil som ikke finnes i `dashboard.html` i det hele tatt. `.bygg-dash2.mjs` har
     nå en **kollisjonsvakt**: landingssidas CSS lastes mot klon-markupen, og for hver regel som
     treffer tilbakestilles nøyaktig de egenskapene den deklarerer, med `revert`, plassert FØR de
     klonede reglene. Lista regnes ut ved hver bygging — ikke hardkod den.
- **⚠ Maskinell CSS-utvelgelse og PSEUDO-ELEMENTER: `querySelectorAll` KASTER på
  `::before`/`::after`, og en try/catch som setter «treff=false» dropper dem stille.**
  Utvelgelsen holder en regel hvis selektoren treffer et element. Men `.cover-gallery::before`
  kan ikke slås opp — `querySelectorAll` kaster `SyntaxError`. Første versjon fanget det med
  try/catch og konkluderte «treffer ingenting», så ALLE pseudo-element-regler forsvant: begge
  90px-fadene over og under galleriet var borte, uten at noe feilet. Løsningen er å teste
  BASIS-selektoren — pseudo-elementer og -klasser strippes bort før oppslaget — og beholde
  regelen hvis basen treffer. Samme felle gjelder `:hover`, `:focus-visible`, `:disabled`
  og `:not(...)`.
- **⚠ Maskinell CSS-utvelgelse ser bare klasser som står i markupen ved BYGGETID.** Regler som
  aktiveres av JS i produktet (`.rekord-gull`, `.wi-fill.rekord`) blir aldri valgt, og klonen viser
  grønn der produktet viser gull — uten at noe feiler. Render-testen som sjekker at KLASSEN er satt
  er ikke nok; den må måle fargen. Utestående for dashbord-klonen.
- **⚠ Maskinelle splice/erstatninger på store filer: tell treff FØR skriving, aldri etter.**
  Tre tap 09.08 hadde samme signatur — et søk traff mer eller mindre enn antatt, skrivingen
  gikk gjennom, og feilen ble først synlig langt senere (eller aldri, fordi nettleseren
  reparerte den). Mønsteret som virker: finn, tell, avbryt med `process.exit(1)` hvis
  antallet avviker, og skriv fila til slutt i ett kall. Gjelder også `splice` på linjer:
  en for bred slice tok med to naboregler uten at noe feilet.
- **⚠ Blandede linjeskift i `site/no/index.html` bommer på ankere.** Fila hadde 911 CRLF og
  606 rene LF om hverandre etter flere maskinelle bygg. Skript som detekterer EOL med
  `s.includes('\r\n')` og oversetter søkestrenger med `\n` → CRLF traff da ingenting i
  LF-partiene, uten annen feilmelding enn «0 treff». `cat -A` LYVER her — pipelinen
  normaliserer, så linjeskiftene ser like ut. Normaliser fila til CRLF én gang før en serie
  maskinelle endringer.
- **Produktvisningens klon: fire rettelser som IKKE følger av byggeskriptene.** De gikk tapt
  én gang fordi de bare fantes som løse redigeringer:
  1. `data-to="10550"` på `.pv-rev` — uten den regner count-up-en mot `NaN` og KPI-en viser
     «NaN» i stedet for å telle til 10 550.
  2. Sekvensen for det AKTIVE kortet må startes fra synlighets-observatøren, ikke bare fra
     `tegn()`. Dashbordet er aktivt fra markupen, så `tegn()` kalles aldri for det ved
     innlasting — uten dette fyrer animasjonen aldri, stolpene blir stående på 0 og
     rekordtilstanden uteblir. (Het `dashSpilt` før; er nå `startSekvens(aktiv)` i
     observatøren, som dekker alle tre kortene.)
  3. `.pv-dash` skal IKKE ha egen `transform:scale()`. Hele vinduet (`.pv-win`) skaleres som
     én enhet; står begge, multipliseres de (0,718 × 0,718 = 0,516) og KPI-tallene faller fra
     14 til 10 px uten at noe ser åpenbart galt ut.
  4. `--ph-s` REGNES UT, den skrives ikke ned — og den må regnes av `offsetWidth`, ikke av
     `getBoundingClientRect()`. Rect-en er den TRANSFORMERTE bredden, og ringkarusellen
     skalerer kortene (.75 på siden, 1 i midten): et sidekort målte 202,5px der skjermflaten
     er 270px, så `--ph-s` ble 0,6328 i stedet for 0,84375 og innholdet rendret for smalt med
     tomrom på hver side. Verdien avhang altså av hvilket kort som hadde fokus i
     måleøyeblikket. `offsetWidth` er layoutbredden og kommer fra CSS: `.pv-phoneframe` 290
     − `.iph` padding 2×9 − border 2×1 = 270. Det var IKKE en timingfeil: målt likt ved
     DOMContentLoaded, load, `fonts.ready` og +4s.
- **⚠ Maskinelle erstatninger må ALDRI ankres på generiske lukketagger** (`</section>`,
  `</div>`) i filer som inneholder klonet markup. `site/no/index.html` har en klon av
  backendens booking-modul, og den inneholder `<section class="sheet">`. Et søk etter
  «neste `</section>`» traff da sheetens lukketagg i stedet for seksjonens: resultatet ble
  en duplisert hale — to `#sceneCap`, to `#pvOk`, seks `.cap` — altså **doble id-er**.
  Nettleseren reparerte det stille, sida så riktig ut, og hele render-testen var grønn.
  Oppdaget først da en erstatning fikk «2 treff, ventet 1» og vakten stoppet.
  Ankre på unike strenger (id, klassenavn, kommentar), og legg alltid inn en treff-teller
  som avbryter FØR skriving.
- **Rebooking- og verving-demoene deler to ting. Skal en av dem noen gang fjernes, er det
  disse to som ryker stille (kartlagt 09.08 — begge står, ingenting er fjernet).**
  1. **CSS-regelen med `.no-js`-fallbacken er DELT:**
     `.no-js .rbscope .bubble, … , .no-js .vvscope .bub, .no-js .vvscope .link-card, …
     {opacity:1!important}` (`site/no/index.html`, siste `.rbscope`-linje). Fjernes
     `.rbscope`-CSS-en som blokk, kan IKKE denne linja tas hel — `.vvscope`-halvdelen er i
     bruk. Splitt den først.
  2. **`document.documentElement.classList.remove('no-js')` gjelder BEGGE demoene**, men lå
     under overskriften for rebooking-animasjonen og leste som en del av den. Sletter noen
     rebooking-blokka som én enhet, forsvinner linja med — og da slutter VERVING-animasjonen
     å animere: alt vises på én gang, uten at noe feiler synlig, uten JS-feil, og
     skjermbildene ser nesten riktige ut. Linja er flyttet OVER overskriften med en
     kommentar som sier hvorfor. Ikke flytt den tilbake.
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
- **`logg-inn.html` (snudd 26.08):** magisk lenke er PRIMÆR innlogging — e-postfelt + «Send meg innloggingslenke» synlig uten klikk (`POST /api/send-magic-link`, alltid samme kvittering, avslører ikke om e-post finnes). Passord er sekundært: «Logg inn med passord» folder ut passordfeltet (`POST /api/login`). Delt e-postfelt. Håndterer `?error=expired` over skjemaet. «Glemt passord?»-innrammingen er borte — magisk lenke er ikke lenger en avstikker.
- **`opprett-passord.html`:** førstegangs passord-setting etter magisk-lenke-innlogging (`POST /api/dashboard/set-password`, min 8 tegn, felt-validering). Vis/skjul-øye på begge felt (gjenbrukt fra logg-inn). Fortsatt landingssida for magisk lenke + reset. **Dashboard redirecter IKKE lenger hit ved `hasPassword:false`** — redirecten i `loadProfil` er fjernet (26.08); en barber uten passord blir på dashbordet og setter det inline i Konto → Innlogging.

### Dashboard + kundeside
- **Design-fane:** live forhåndsvisning via `GET /api/dashboard/preview?layout&palette&font&mode` — full **server-render** av barberens EKTE side (`byggSideFraBarber → fill → booking-module.cjs`; `preview:true` hopper over /days+/slots og åpner sheet). Samme kilde som publisert side = ingen drift. `dashboard.html` setter kun `srcdoc` (cache per param-kombo, synlig `previewError` ved feil); ingen klient-fyll. Endepunktet `console.warn`-er på ufylt `{{PLACEHOLDER}}` — erstattet den gamle stille slutt-wipen (`replace(/{{[A-Z_]+}}/g,'')`) som skjulte at booking-modulen (all aksentfarge) aldri ble injisert → helt svart/hvit preview i ~4 mnd (rot-årsak: FASE B `6d06a8d` flyttet booking-UI inn i `{{BOOKING_MODULE}}` som wipen slettet). Layout-kort som ren tekst.
- **Preview 11.07:** booking-sheet auto-open fjernet (`booking-module.cjs`) — preview viser forside først, som live. Tomme forside-felt viser dempede plassholdere i preview (`(spesialitet)`/`(adresse)`/`(bio)` + grå bilde-bokser via delt `{{PH_CSS}}`); live kollapser som før. (Layout-preview-«buggen» var browser-cache, ikke kode.)
- **Mobil-nav (≤719px):** ALLE fem faner ligger i én dropdown — ingen står permanent i raden. Nav-raden viser bare toggelen til venstre (der Oversikt sto), med aktiv fanes navn + caret (f.eks. «Oversikt ▾»), alltid `.aktiv` (ink + understrek). Trykk → meny med alle fem, aktiv uthevet. Erstattet det gamle 3-synlige+«Mer»-oppsettet (Oversikt/Vekst/Din side sto, Tjenester/Konto skjult) — den asymmetriske splitten så tilfeldig ut. Desktop viser fortsatt alle fem i raden. Mobil Design-layout: preview sentrert, rekkefølge valg → preview → Lagre, 2-kolonne kort, breakpoint 700px.
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
- **⚠ Klonens rekord-terskel er `>=`, produktets er `>`.** `dashboard.html` bruker
  `var beaten = hasRecord && p.current_week_revenue > p.best_week_revenue`; scenens demo i `site/no/index.html` bruker
  `maalRev*e >= FORRIGE_REKORD`. Ved NØYAKTIG likt beløp tenner klonen gull der produktet
  ikke gjør det. I demoen er det uten betydning (10 550 passerer 10 100 med god margin), men
  avviket er reelt og skal ikke «ryddes» ved å endre produktet — det er klonen som er
  koreografi. Se også notatet om at gull-timingen i klonen er demo, ikke produktatferd.
- **Uke-rekord (lag 4) — KUN pill-modus inneværende uke:** `current_week_revenue`/`best_week_revenue`/`best_week_start` fra `/stats` (backend-beregnet, on-read/Oslo, best = MAX ferdige uker). Gull-KPI (`#estRevValue` gull-gradient + drop-shadow-glow + puls) tenner kun ved `current > best` OG `curPeriod==="uke"`. Dempet «Beste uke: X kr · [mnd]»-fotnote ellers.
- **Persentil + rekord-bar (batch 2) — KUN pill-modus inneværende uke:** fra `/stats.weekly_revenue` (`[{week_start,revenue}]`, all-time ferdige uker, on-read/Oslo, `max==best_week_revenue` per konstruksjon). Persentil «Bedre enn X% av dine egne uker» vist ved ≥6 uker OG pct≥50 (over median), undertrykt ved rekord. Rekord-bar `current/best`: <0.80 skjul · 0.80–1.0 «X kr unna» · ≥1.0 «Ny rekord denne uka! 🔥» 100% gull. Baren eier rekord-budskapet (tømmer `#rekordNote`) → ingen dobbelt. Skjult på 2uker/måned/historisk måned.
- **Merk (aldri sett live):** mot volum-test er `current_week` (~10 550) « `best` (13 950 = 76%) → persentil + rekord-bar naturlig SKJULT. «unna»/«rekord»-tilstand kun Playwright/deterministisk verifisert. `gull-demo.cjs`-fixtur (backend-repo) kan heve `current` over tersklene for å se dem live.
- **«Drevet av BarberHQ» (Oversikt):** `renderDrivenBy` henter ekte `GET /api/dashboard/attribution?period=uke|2uker|maaned` (session) via `api.attribution` for ikke-basis — mock (`MOCK_ATTRIBUTION` + `USE_MOCK`) fjernet i `fa02e3f`. Ved Basis-plan vises eksempeltall bak lås i stedet (Basis-visning, INGEN API-kall — lekker aldri ekte tall). Totalen kommer fra backendens autoritative `data.total {count,revenue}` (efaa553), gjort til ENESTE kilde i `46701a3` (klient-sum `attribSum` fjernet; mangler total → feilstate, aldri klient-sum). Tre rader (rebooking/verving/vinn tilbake); 0-rad «0 klipp · 0 kr», alle tre 0 → «Her bygger verdien seg opp». Delta «fra forrige uke» kun på uke-pill (2uker−uke), aldri på eksempeldata. Skjult på historisk måned. Gjenstår kun: verifiser seedede/ekte tall mot prod.

### Lojalitetsprogram (Vekst-fanen)
Ett trekkspill (`#accLoyal`) nederst i «Personlig»-lista, under Verving — speiler Vervings struktur:
INNSTILLINGER øverst, READ-ONLY oversikt under. **UI-navn «Lojalitetsprogram»; koden beholder `loyalty_*`**
(id-er `#loyal…`). Pill-rollen på bookinger heter `lojalitet`.
- **Kontrakt** `GET /api/dashboard/loyalty` → `{ enabled, threshold, pct, activated_at, count_history,
  participants[{customer_id,name,phone,opt_in_at,stamps,reward_ready}],
  eligible[{customer_id,name,phone,last_visit,completed_count}],
  totals{in_progress,ready,redeemed_month,participants,eligible} }`. `stamps` = inneværende runde (0..terskel,
  eksakt multiplum vises som terskel); `reward_ready` er UAVHENGIG av stamps. `totals` er populert også når `enabled:false`.
- **Ett kall** (`api.loyalty`) mater innstillinger + deltakerliste + kandidater. Ingen `/customers/recent` lenger — kandidatene er `eligible` (backend-filtrert, ekskluderer deltakerne). `completed_count` skiller stamkunde fra engangskunde.
- **Innstillinger:** program på/av (`loyalty_enabled`), terskel `<select>` 5–20 (default 10), belønning 20–100 steg 10 («Gratis klipp» ved 100 / «X % rabatt»), «Tell med klipp fra før» (`loyalty_count_history`, tilstands-speilet hjelpetekst). Lagres via `PUT /settings`; 403 → «Se abonnement»-lås. **Bekreftelse før av** (uthentede belønninger `ready` + de som `slutter å samle`) og **før terskel/pct-endring** mens `in_progress>0` (revert-til-lagret ved Avbryt).
- **Deltakere (opt-in):** kan-hente ALLTID øverst, så flest klipp. «X av terskel», klikk-kopierbart nummer, grønn «Kan hente». `reward_ready`+`stamps<terskel` → linje «Ubrukt belønning fra forrige runde». Diskret **person-minus-ikon** (ikke søppelbøtte — sletter ingenting) → bekreftelse UNDER raden («Kunden slutter å samle. Klippene beholdes.»); pill står. `has_unused_reward:true` i PUT-svaret → toast om at belønningen gjelder fortsatt.
- **Legg til kunde (opt-in):** `eligible` med `completed_count`, én «Legg til» per kunde, **ingen «legg til alle»**. `PUT /api/dashboard/customers/:id/loyalty {opt_in}` → `{customer_id,opt_in,opt_in_at,has_unused_reward}` (`api.loyaltyOptIn`).
- **Pill på bookinger:** `discountPill` → `rolle==='lojalitet'` gir «Lojalitet · Gratis klipp» (pct 100) / «Lojalitet · X %». Dekker Kommende + full liste + detalj-modal. Verving vinner ved kollisjon — backend sender ett objekt.
- **Basis:** skjoldes som de andre Vekst-accordionene (`skjoldVekstFlater` inkluderer `#accLoyal`), UTEN eksempeltall og UTEN «Eksempel»-merke — `loadLoyalty` returnerer tidlig ved `erBasis()` (ingen `/loyalty`-kall). Se Basis-visning.
- Render: `tools/render/lojalitetsprogram.mjs` (av / på-tom / på-liste / etter-innløsning + interaktive tilstander + pill + basis, 320/375, mørk/lys).

### Kampanjeplakater (Vekst-fanen)
Fullskjerm-editor (`#plakatOverlay`) i `dashboard.html`, åpnet fra to «Generer plakat»-knapper: én i
Verving-trekkspillet, én i Lojalitet-trekkspillet (`#loyalLeggTilWrap`, kun når programmet er PÅ).
Knappen setter `kampanjetype` (`verving`/`lojalitet`) for hele økten. Hele flaten er Vekst —
`erBasis()` sender til abonnement. Tilstand i sessionStorage (`bhq-plakat`), overlever refresh.
**Base-editoren er pushet og live** — prod-testet på dashbordet 09.09. Det som (per 10.09) IKKE er
pushet er testrunde-fiksene (bug 3 / beslutning 4–7 / kamerarull / miniatyr-cachebuster / lys-gating).
**Backend-kontrakt:** `GET/POST /api/dashboard/plakat/{preview,render}` + `GET /plakat/{layout,regler}`
(`docs/08-kampanjeplakater.md` Del 8, backend-repo) — prod-verifisert 09.09.
- **Skjerm 1 «Velg plakat»:** fem maler etter bildeantall — `mal1` «Uten bilde» (0) … `fire` «Fire
  bilder» (2×2). `mal1`+`mal2` anbefalt (større, øverst), resten under «Flere maler». Tilgjengelighet
  = antall galleri-bilder ≥ malens `antall`; låst kort → «Legg til bilde» → Din side. Lat-lastede
  miniatyrer (`GET /render?bredde=400&v=<utseendeVersjon>` — cache-buster fra `/regler.barber`, så
  PNG-en fornyes ved design-/profil-bytte); **låste kort henter aldri** (render-test: `renderKall == tilgjengelige`).
- **Skjerm 2 «Rediger»:** levende preview i iframe via `srcdoc` (POST når en celle bærer
  kamerarull-base64, GET ellers — iframe kan ikke navigere til POST). Kontroller: format 4:5 / 9:16
  (filtrert per bildeantall), skjoldstyrke-slider (område fra `/regler`, kun når malen har skjold,
  **plakat-globalt/fullflate — uavhengig av valgt celle**), QR + Lenke-avkryssing (QR kun visse format),
  Last ned + Del (`navigator.share` → PNG-blob, fallback nedlasting). Debounce 250 ms; nøytral feilstate
  ved 400/403/5xx.
- **Cachebuster `v=utseendeVersjon` på ALLE plakat-URL-er** (miniatyr + preview + render) — copy (rabatt/
  terskel) og font/palett leses fra barber-RADEN, ikke query, så uten `v=` cacher HTTP-en gammel copy.
  **Kilde er en DELT top-level `var _plakatVersjon`** (`utseendeVersjon()` leser den), med **to skrivere:**
  `hentRegler` (fra `/regler.barber.utseendeVersjon` ved editor-åpning) OG `api.saveSettings` (fra `PUT
  /settings`-RESPONSENS top-level `utseendeVersjon` ved innstillings-lagring i Vekst-fanen — utenfor plakat-
  IIFE-en). **`settPlakatVersjon` er MONOTON** (skriver aldri eldre over nyere → et `/regler`-svar underveis
  fra før en PUT overskriver ikke den ferske PUT-versjonen). Ikke bryt denne delte kilden.
- **Layout (`.pk-layout`):** enkeltkolonne på mobil (plakat → knapper → kontroller); **to kolonner ≥768px**
  (plakat ~460px venstre, knapper+kontroller høyre). **«Del» skjules ≥768px** (`navigator.share` er mobil-
  sentrisk; på desktop faller den til nedlasting → misvisende ved siden av «Last ned»).
- **Lag 3a — celle-valg:** trykkflater lagt over iframen (geometri fra `/layout`, samme skalering,
  align < 2px); ett-bilde-mal har implisitt valgt celle (`p.valgtCelle`). Valget styrer «Beskjær»/«Endre
  bilde»-knappene (se under). 2×2 uten valg → knappene deaktivert + hint «Velg et bilde først».
- **Lag 3b (beslutning 5) — dra tekstblokken:** på ekte tekst-geometri fra `/layout.tekst`,
  midtstillings-hjelpelinjer, lokal flytting (ingen fetch per piksel), én reload ved slipp, offset
  `tdx/tdy` i lerret-piksler. Mal 1 (flex) → backend gir `tekst:null` → ingen flytt-boks.
- **«Beskjær» / «Endre bilde» — tekstknapper (`.pk-bildeknapper`), IKKE celle-hjørne-ikoner** (de er
  fjernet). Virker på VALGT celle (`valgtCelleData(p)`); skjult ved mal 1 (ingen celler). Egen rad under
  plakaten (mobil) / øverst i høyre kolonne (desktop).
- **Lag 3c (beslutning 6) — beskjæring:** «Beskjær» på valgt celle → Cropper låst til cellens aspect, rect
  i bildets egne piksler klampet innenfor bildet; **kryss lukker OG lagrer** (ingen «Bruk»-knapp), på `<body>`.
  **⚠ `checkCrossOrigin:false` + `checkOrientation:false` + ingen `img.crossOrigin`** — R2 sender ikke CORS,
  og Cropper ville ellers gjort en egen CORS-request (crossOrigin+timestamp) → død crop. Rect-only crop
  trenger ingen ren canvas. Se «Kjent brutt på live» i Bildeplasserings-system.
- **Beslutning 7 — «Endre bilde»:** knapp på valgt celle → bildevelger (galleri, på `<body>`) → lagres i
  `p.bilder[slot]`. **⚠ Kamerarull-bilder er base64 (`{data,width,height}`, ingen `.url`/`.id`)** — alt som
  leser bilde-objektet MÅ håndtere BEGGE former: crop `img.src=bilde.data||bilde.url`; `plasserData` sender
  `{data}` vs `{image_id}`; `miniatyrQuery` (GET, kan ikke bære base64) faller tilbake til standard galleri-
  bilde for cellen. (Base64-vs-URL-forveksling har brutt crop to ganger.)
- **Bildevalg er GLOBALT per mal, delt på tvers av kampanjetype — BEVISST (10.09), ikke en glipp.**
  `p.bilder`/`p.rects` ligger på plakat-objektet i `PS.plakater`; `PS.kampanjetype` er ÉN sesjonsverdi. Så
  samme bilde/utsnitt vises på både verving- og lojalitet-plakaten — kampanjen skiller kun TEKSTEN (copy).
  Barbereren bruker samme salong-foto på begge. Ikke «fiks» dette til per-kampanje uten at Henrik ber om det.
- **Del 2 — kamerarull:** «Velg bilde» har en Kamerarull-flis (file input) → nedskalert base64 (jpeg)
  i cellen → POST-veien til preview/render. Nedskaleringen er **cellebevisst**: fullflate-celle
  (bredde ≥ 60 % av lerretet) → 2160 px lengste kant, kvadrant → 1080 px (`dashboard.html:7041`).
- **Bakgrunn/palett arves — velges IKKE i editoren:** `bakgrunnFraBarber()` utleder bakgrunnen av
  barberens bookingside-palett/-modus (`hentDesign`): **sand-PALETT → background «beige»** (B4-synk 10.09:
  backend døpte om bakgrunnsverdien `'sand'` → `'beige'`, alias lever én release; palett-NAVNET er fortsatt
  `'sand'` — kun background-verdien er beige), ellers mørk/lys. **Gated per mal:**
  `bakgrunnFor(p)` sjekker `/regler.maler[*].formater[fmt].bakgrunner` (matchet på `.bilder = antall`);
  er utgangspunktet «lys» men lys ikke tillatt for malen (i dagens spec mangler mal 2, mal 4 og 2×2
  lys-variant — men lista leses fra `/regler`, hardkodes aldri), tvinges mørk. Fail-closed: manglende/ukjent `/regler` → mørk. Editoren sender aldri en bakgrunn backend 400-er.
  Samme gating på render/preview OG `/layout` (geometrien avhenger av bakgrunn). `skjoldStyrke` leses
  også fra `/regler`; `morkSperret` er implisitt dekket (sand → `bakgrunnFraBarber` gir aldri lys/mørk).
- **Render-test:** `tools/render/plakat-editor.mjs` (skjerm 1, skjerm 2, mal1-uten-slider, 403-feilstate,
  lag 3a 2×2, 3b dra, 3c crop, beslutning 7, del 2 kamerarull) @320/375.

### Bildeplasserings-system (slots)
- `images` har `slot` (portrett/hero/galleri) + `sort_order`. Barbereren trykker en slot-boks per layout → laster opp dit. Galleri-grense 10; erstatning av portrett/hero sletter gammelt helt (DB+R2). `PATCH /images/:id/slot` flytter. Layout-bytte hard-sletter (DB+R2), transaksjonssikret (BEGIN/COMMIT/ROLLBACK, R2 best-effort utenfor transaksjon).
- `byggSideFraBarber()` leser slots (ikke opplastingsrekkefølge) — barberens plassering styrer siden.
- **Crop:** Cropper.js 1.6.2 self-hostet i `site/no/lib/`. Beskjær-ikon (modal) + ×-ikon per bilde. «Din side»-crop er destruktiv (canvas→blob→`PUT /api/dashboard/images/:id`, bevarer slot/sort_order); plakat-crop er rect-only. Aspect: portrett 1:1, galleri 3:4, hero 9:19.5, plakat 4:5/9:16.
- **iPhone-zoom-modell (11.09) — begge crop-verktøy.** Fast crop-boks i slottens/cellens aspekt (fyller modalen, ikke dragbar/skalerbar); bildet flyttes og zoomes BAK boksen. Cropper: `viewMode:3` (lerretet fyller alltid containeren → zoom-gulv, ingen tomme/svarte kanter), `dragMode:'move'`, `cropBoxMovable:false`, `cropBoxResizable:false`, `autoCropArea:1`, `toggleDragModeOnDblclick:false`. Åpner på min-zoom. Aspekt-badge viser fast format. **`viewMode:1` er FEIL her** — den krymper boksen mot et innpasset bredt bilde, boksen fyller da ikke modalen.
- **Default-layout for ordre-bygde barbere er `showcase`** (`bygg-barber.js STANDARD_DESIGN.layout`, alle bilder → `galleri`); DB-default er `direkte` (ingen bilder). Portrett (profil) og hero er **opt-in** — må velges manuelt i Din side. **Galleri 3:4 er derfor den eneste slotten i faktisk default-bruk** — der betyr crop-kvaliteten noe.
- **⚠ Kjent avvik — portrett-crop viser KVADRAT, siden viser SIRKEL.** Portrett rendres med `border-radius:50%` (`.portrait img`), men crop-boksen er et 1:1 kvadrat → hjørnene barbereren ser i croppen finnes ikke på siden. Sirkel-crop-boks er teknisk mulig (CSS på `.cropper-view-box` + dimme utenfor sirkelen), men **droppet 11.09**: portrett er opt-in og lite brukt (default er showcase/galleri) — ikke verdt tiden. Ikke gjenoppdag.
- **⚠ Hero-crop er IKKE WYSIWYG — utsnittet avhenger av kundens viewport.** Hero vises full-bleed (`.hero-media inset:0` i `.cover{min-height:100vh}`, `object-fit:cover; object-position:50% 42%`) mot SKJERMEN, ikke en pinnet 9:19.5-boks. Crop-boksen (9:19.5) er derfor kun sann for en ≈9:19.5-telefon. Målt med samme bilde: smal 0.462 → 99,9 % vertikalt synlig; vanlig telefon 0.562 → ~82 % (**~18 % tap**); nettbrett 0.75 → ~61 % (**~38 % tap**, øverste + nederste åttedel forsvinner). 42%-biasen skyver i tillegg vinduet opp. Prinsipielt umulig å gjøre WYSIWYG i dagens full-bleed hero-design (backend) — ikke en crop-sak. Ikke gjenoppdag.
- **✅ «Din side»-croppen VIRKER på live (korrigert 11.09 — «KJENT BRUTT PÅ LIVE» var FEIL diagnose).**
  Croppen LESER piksler (`getCroppedCanvas().toBlob()`), men slot-bildet lastes **SAME-ORIGIN** via
  Netlify-proxyen `/images/raw/:id`: `dashboard.js` returnerer den RELATIVE URL-en (`/images/raw/<id>?v=…`),
  `images.js` er en «proxy fra R2 — same-origin, ingen CORP-problem», og `netlify.toml` proxyer `/images/*`.
  Same-origin ⇒ canvasen taintes ALDRI ⇒ `getCroppedCanvas` fungerer. Den gamle linja antok at bildet kom
  fra R2 pub-hosten (`pub-…r2.dev`, kryss-origin uten ACAO) — det gjelder IKKE dashboardets slot-bilder,
  så ingen bucket-CORS-fix trengs.
  **⚠ Guardrail (ikke bryt):** crop-canvaset MÅ laste via den relative URL-en. ALDRI rewrite til
  `api.trybarberhq.com` eller R2 pub-hosten — det gjør bildet kryss-origin og gjeninnfører hele
  CORS-avhengigheten (+ en cache-mode-felle). Samme for opplasting: relativ `/api/dashboard/images`.
  (`#cropImg crossorigin="anonymous"` er et ufarlig levn — no-op på same-origin; kan ryddes senere.)
  **Plakat-croppen** er rect-only (`getData`/`getImageData`, ingen piksel-lesing) og kjører med
  `checkCrossOrigin:false` + `checkOrientation:false` uten `img.crossOrigin` — uendret.

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

## Dashboard: fane-struktur (11 → 5)

`site/no/dashboard.html` har **FEM faner** — talt 12.08: fem `<button role="tab" data-panel=…>`
og fem `<section class="panel" id=…>`, i denne rekkefølgen i DOM-en. Her sto det SEKS, som var
riktig fram til Profil-fanen ble slått inn i «Din side». To sammenslåinger har skjedd:
Innstillinger → Konto (06.08), og Profil → Din side. Begge fordi innholdet ikke bar en egen fane.

1. **Oversikt** = Oversikt + Bookinger + vinn-tilbake-**liste**. Pengeside-rekkefølge:
   KPI/omsetning → graf → «Drevet av BarberHQ» → kommende bookinger → full booking-liste
   (no-show-marker) → vinn-tilbake-liste.
2. **Vekst** = vekst-tall (rebooking-rate/trend) + attribusjon (EKTE `/attribution`, ikke mock) + SMS-knottene
   (påminnelse/rebooking/intervall, ekte `GET/PUT /api/dashboard/settings`) + **Lojalitetsprogram** (se
   egen seksjon). Hele fanens Vekst-flater (attribusjon/momentum/rebooking/vinn-tilbake/verving/lojalitet)
   skjules bak lås ved Basis-plan (`erBasis()` — se Basis-visning). Divider mellom
   måling (over) og kontroll (under). Plassholder-kommentar for vinn-tilbake-**konfig**
   (auto-SMS ved kansellering/no-show) — bygges med vekstfeaturen.
3. **Tjenester & tider** (`data-panel="tjenester"`) = tjenester + arbeidstider.
4. **Din side** = palett/font/layout/preview + bilder (slots/crop). Layout↔slot-kobling bevart:
   slot-visning følger VALGT layout (live), opplasting låst til LAGRET (banner + klikk-guard).
   Dynamisk bilde-hjelpetekst per layout. Bilder er borte som egen fane. **Nav-etiketten er «Din
   side», men `data-panel`/`id` er fortsatt `design`** — BEVART med vilje, samme grunn som
   `abonnement` under. Profil-fanen (navn, bio, adresse, tagline) er slått inn her og finnes ikke
   lenger som egen fane; det er ingen `data-panel="profil"` i fila.
5. **Konto** = abonnement ØVERST + «Utseende» (tema-toggle) under. Nav-etiketten er «Konto»,
   men `data-panel`/`id` er fortsatt `abonnement` — BEVISST, id-en henger sammen med
   `switchPanel('abonnement')` (Stripe-returen) og hele billing-koden. Ikke døp om id-en.

- **Abonnement-blokka er IKKE et skall — den er fullt koblet.** Dokumentasjonen sa lenge
  «skall — venter på billing»; det var feil. `loadBilling()` → `GET /api/dashboard/billing/status`
  → `renderBilling(b)` som bytter på `subscription_status`: `trialing`/`active`/`past_due` viser
  «Administrer abonnement» (full navigasjon til `GET /api/dashboard/billing/portal`, som svarer
  303 videre til Stripe Customer Portal), `canceled`/`unpaid`/ukjent viser «Legg inn kort»
  (knappeteksten settes av `settKnapp('Legg inn kort','checkout')`; «Start 30 dager gratis» har
  null treff i hele `site/` — verifisert 12.08)
  (`POST /api/dashboard/billing/checkout` → redirect til `{url}`). Retur fra Stripe håndteres av
  `applyBillingReturn()` på `?live=1` / `?avbrutt=1` — tvinger fram Konto-fanen, viser kvitterings-
  banner og stripper query-en med `replaceState`. Betaling ≠ publisering: «Gå live» er separat.
- **Basis-visning (Vekst-skjold).** Barbereren på Basis-plan ser Vekst-flatene låst i stedet for
  ekte data. Trigges KUN av `erBasis()` = `_billing.effective_plan==='basis'` (backendens autoritative
  «hva gjelder nå» — ALDRI `b.plan`, som er NULL i trial → ville låst prøvekunder ute). Trial/Vekst =
  uendret dashbord. Skjold-komponent (`settSkjold`/`fjernSkjold`): halvgjennomsiktig lås + «Se abonnement»
  (klikk → `switchPanel('abonnement')` + scroll `#accAbonnement`), innhold under `pointer-events:none`
  + inputs disabled. Flater: Oversikt «Drevet av» + Vekst attribusjon/momentum/rebooking/vinn-tilbake/
  verving/**lojalitet** (påminnelse + `#vekstStats`/trend IKKE låst — volum, ikke Vekst-attribusjon).
  **Lett skjold:** overlegg `.48` + `blur(1px)` (var `.66/1.5px`) så innholdet under så vidt antydes;
  lås-ikon + «Se abonnement» har skygge (mørk/lys per tema) for å leses først. **Kun de to «Drevet av»/
  attribusjons-flatene** viser eksempeltall (`VEKST_EKSEMPEL`, 6 850 kr) med «Eksempel»-merke.
  **Lojalitet skjoldes UTEN eksempeltall** (`VEKST_EKSEMPEL` har ingen `loyalty`-blokk) — kortet viser
  bare sin egen beskrivelse; rebooking/vinn-tilbake/verving likeså.
  **INGEN datahenting på skjoldede flater:** `loadWinback`/`loadVerving`/`loadLoyalty` returnerer tidlig
  ved `erBasis()` (init-`loadWinback` er flyttet til ETTER `loadBilling` så plan er kjent). `loadSmsInnstillinger`
  guardes IKKE — den fyller også den ULÅSTE SMS-påminnelsen og henter kun barberens egne settings, ikke kundedata.
  Backend gater WRITE: `PUT /settings` + `PUT /customers/:id/loyalty` → 403 for basis (`dashboard.js:1131/1136/1200`),
  viser «Se abonnement»-lenka. **⚠ Backend-funn (uløst):** GET `/winback`/`/referrals`/`/customers/recent` er
  IKKE plan-gatet (kun `asyncRoute`, ingen middleware) — frontend-guardene dekker klienten, backend bør gate også.
  Render: `tools/render/skjold.mjs` (basis + trial) + `tools/render/lojalitetsprogram.mjs` (STEG 4: full Vekst-panel + fetch-guards).
- **Tema-toggle: header (→31.07) → egen Innstillinger-fane (31.07) → Konto (06.08).** `#themeBtn`
  er samme knapp og samme id hele veien (all tema-JS er urørt), nå i en `.tog-row` nederst i Konto
  med etikett «Mørk modus» + «Huskes i denne nettleseren». Headerens `.who` har kun barbernavnet.
  Underteksten sier eksplisitt at dette gjelder dashbordet, ikke kundesida — lys/mørk for
  bookingsida velges under Design, og de to ble blandet sammen så lenge knappen sto løs i headeren.
  **`$("#themeBtn").addEventListener` har ingen null-sjekk** — flytter du knappen igjen, må den
  finnes i DOM-en ved sideload, ellers kaster init.
- **«Bytt passord» i Konto → Innlogging er BYGGET (GJORT 26.08).** Trekkspillet har to tilstander
  styrt av `profile.hasPassword` (`settInnloggingTilstand`): `false` → «Sett et passord» (kun nytt-felt,
  sender `{password}`); `true` → «Bytt passord» (nåværende + nytt, sender `{current_password,password}`).
  `POST /api/dashboard/set-password` VERIFISERER nåværende passord — frontend håndterer
  `code='mangler_naavaerende_passord'` (blir i dashbordet ved feil gammelt passord). Vis/skjul-øye på
  begge felt (bindToggle-mønsteret fra opprett-passord). Etter setting bytter seksjonen til «Bytt
  passord» uten reload.
- **Mobil-nav:** ALLE fem faner ligger i dropdownen — hver knapp har `class="nav-mer"`, og JS
  flytter dem inn i menyen på mobil, tilbake i raden på desktop. Toggelen står til venstre og bærer
  aktiv fanes navn (`updateToggle` → `#merLabel`); den er alltid `.aktiv`. Menyen ankres fra
  venstre (`positionerMeny` bruker `box.left`, ikke `box.right`), ellers ville 190px-menyen strukket
  seg forbi venstre skjermkant på 320. Konto bærer fortsatt varselprikken, og toggelen speiler den
  (`oppdaterMerPrikk` → `#merDot`). Verifisert 320/375/390: fem faner i menyen, `nav overflow = 0`,
  etikett følger aktiv fane, klikk bytter panel + lukker meny.
- **`loadSmsInnstillinger()` hører til VEKST, ikke Konto.** Het `loadInnstillinger()` da SMS-
  knottene bodde i en egen fane; omdøpt 06.08 så navnet ikke lokker noen til å lete i Konto.
- **Fanene er hardkodet tre steder som må holdes i synk:** nav-knapp (`data-panel`), `<section
  class="panel" id="…">`, og ev. lazy-load-gren i klikk-handleren. Ingen array, ingen konfig.
  `switchPanel(id)` har ingen null-sjekk — fjerner du en fane med en gjenværende kaller, kaster
  den `TypeError` på `.click()` av `null`.
- **Font-velgeren er LEVENDE** (Design: klikk → `design.font` → `PUT /api/dashboard/design` +
  preview-qs). Det var **onboarding**-fonten som ble fjernet (alle får Fraunces), ikke
  dashboard-velgeren. Ikke behandle den som dead UI.

## Kjent teknisk gjeld

**Overflow-flagget i render-testene er et RENT signal.** Det pleide ikke å være det:
`.hero-video` sto på `width:112vw` + `transform:scale(0.9)` og dyttet 5px ut på hver bredde,
så `overflow`-feltet var rødt i hver eneste kjøring og kunne ikke brukes til noe. Det er
fikset — regelen står nå på `width:100%;height:100.8%`, og `scrollWidth − viewport` måler
**0 på 320, 375 og 1280** (verifisert 12.08). Slår flagget ut nå, er det noe nytt.

**`kom-i-gang.html` 320px-overflow — PENSJONERT (26.08).** Steget som bar overflowen (design-steget:
palett-grid + layout-karusell `#layGrid` + preview-iframe) ble fjernet i skjemaombyggingen — 0 treff
på `layGrid/palGrid/preview-tjenester` nå. Render-testene måler `scrollWidth − viewport = 0` på
320/402/1280. Ikke lenger en kjent overflow.

### Funnet i frontend, men SKAL FIKSES I BACKEND (barberhq-backend)
Funnet ved å klone bookingmodulen inn i produktvisningen og måle klonen mot den publiserte
sida. Ikke frontend-feil, og ikke rørt herfra — ÉN Code-sesjon per repo, så backend-endringene
tas i backend-repoet.
- **UKLAR — navnedrift på samtykke-oppslaget.** Lokal kilde er konsistent med seg selv:
  `booking-module.cjs` kaller `POST /api/barbers/:slug/sms-consent-check`, og backend-ruta
  heter det samme (verifisert 12.08 mot begge sider). Men gjelden gjaldt aldri lokal kode —
  den gjaldt DRIFT mot den DEPLOYEDE sida på trybarberhq.com, som ble observert kalle
  `POST /api/barbers/:slug/sms-consent` under rendring av tilstandsbildene. Om deployet
  fortsatt ligger på det gamle navnet kan ikke avgjøres fra disken; det krever et oppslag mot
  prod. Til det er gjort står punktet som uavklart, ikke som løst.

- **ÅPEN — `buildPalette` er duplisert i `fyll.cjs` og `site/no/palett.js`, og må holdes i synk
  manuelt.** Fortsatt to kopier (verifisert 12.08). Ingen delt kilde.

- **ÅPEN — tredelt fane uten dekkende navn.** Fanen på `dashboard.html:1681` inneholder tjenester
  med priser, Arbeidstider (`:1734`) og Google Calendar (`:1692`). Etiketten «Tjenester & tider»
  nevner ikke de to siste. Navnedriften mot panel-tittelen er rettet (`58e7e60`); selve
  navngivningen står åpen.

- **ÅPEN (delvis testet) — mobil-loopens teleport på eldre iOS.** Produktvisnings-karusellen på
  mobil (`site/no/index.html`) er en uendelig loop: tre sett kloner + et scroll-drevet,
  rAF-throttlet hopp som holder `scrollLeft` i ett vindu på én settbredde (`sjekkOgHopp`).
  Det er ÉN bane for alle nettlesere — ingen feature-detection, ingen `scrollend`/debounce.
  **Verifisert uendelig på nyere iOS Safari (ekte enhet).** Eldre iOS (≤17.3, som mangler
  `scrollend`) kjører NØYAKTIG samme kode — det finnes ingen egen gren for dem — men
  momentum-fysikken der (hva som skjer når `scrollLeft` settes midt i et sving) er
  device-avhengig og **ikke testet på en faktisk gammel enhet**. Headless Chromium kan ikke
  reprodusere iOS-momentum, så gapet må lukkes med en ekte ≤17.3-enhet om det skal bli grønt.

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
> **⚠ UTDATERT etter no/-ombyggingen (26.08).** no/ steg 2 har IKKE lenger design-steget
> (layout-karusell `#layGrid`, palett-preview, `preview-tjenester.html`, `design={…}`) — det er
> erstattet av bilder (min 2) + tjenester + åpningstider, og skjemaet sender `services`/`hours`
> og redirecter til `/<slug>`. Hele delta-beskrivelsen under gjelder den GAMLE no/-versjonen og
> må re-kartlegges mot dagens no/ når en/ faktisk tas. Ikke bruk den som fasit.

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
**`palett.js` og `preview-tjenester.html` finnes KUN i no/ — ikke bare en/ mangler dem, det
gjør sv/ og da/ også** (verifisert 12.08: `ls site/*/palett.js` og `ls site/*/preview-tjenester.html`
gir ett treff hver, begge i no/). `images/` er på plass i en/, men mangler i sv/ og da/.
**Uavklart:** `palett.js` har norske palettnavn og inneholder `buildPalette` — kopieres den ut til
de andre språkene, er den duplisert i opptil FEM filer (fyll.cjs + fire språk). Alternativet er å
dele logikken og skille ut tekstene, men det rører no/ også. Henrik har ikke tatt stilling ennå.

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
   `direkte.template.html` har `.manage-link{position:absolute;top:18px` inne i en `.page` med
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

**Status 04.09.2026: lansert. Stripe-billing live. Ingen launch-blokkere.**
BarberHQ er ute i markedet. Konverteringsflyten (plan-velger Basis/Vekst i Konto,
`startCheckout` med `{plan}`, checkout-/portal-knapper) er ferdig og live — prod-verifisert.
Alt som tidligere sto som «lanseringsblokker» er enten levert eller ikke lenger blokkerende.
Lista under er POST-LAUNCH-arbeid, ikke launch-gating.

> **Historikk (13.08–25.08):** 23 commits gikk til `origin/main` i ett Netlify-bygg (Netlify
> auto-deployer fra `main`). `?ref=`-verving-kjeden ble fikset i backend samme dag
> (`e57535f` + `3e657f4`, `referralForVisning()`, overlever refresh), og dashbordets
> konverteringsflyt ble bygget og pushet 25.08 (`364e2c5`). Detaljene lever i git-historikk —
> ikke gjenoppdag som åpne oppgaver.

### Løst før/ved lansering (ikke gjenoppdag)
- **Stripe-billing + konverteringsflyt** — plan-velger Basis/Vekst, `startCheckout {plan}`,
  checkout/portal i Konto. Pris fra `PLAN_INFO[b.plan]` (89 Basis / 179 Vekst, fail-closed — verifisert `:5502` 07.09). Live og
  prod-verifisert (`364e2c5`). `effective_plan` leses nå av `erBasis()` (Vekst-skjoldet / Basis-visning
  — skjuler Vekst-flatene bak lås + eksempeltall når `effective_plan==='basis'`); `effective_plan_grunn`
  leses av `renderKonto` (`:5047`, billing-tilstandene). Ikke lenger «ligger klare, ubrukt».
- **«Gå live»-publisering** — barbereren publiserer selv fra Konto
  («Publiser og start gratis prøveperiode» → `PUT /api/dashboard/page-status`), eneste vei
  `forhandsvist → live`, skriver `trial_start_at` atomisk. Avpubliser er samme vei tilbake.
- **Verving-kjeden (`?ref=`)** — fikset i backend (`referralForVisning()`), overlever refresh.
  Verving-raden på landingssida er dekket.
- **Bytt/sett passord i Konto → Innlogging** — to tilstander fra `profile.hasPassword`, GJORT 26.08.
- **Duplikat-e-post (backend):** unik-indeks på `lower(email)` + deterministisk login følges videre
  i barberhq-backend. Ikke en frontend-oppgave; ikke lenger launch-gating.

### Løst post-launch (ikke gjenoppdag) — verifisert mot kode + git-logg 07.09
- **Lojalitetsprogram (Vekst-fanen)** — bygget ende-til-ende (`0fa6821`→`97ddf43`): deltakere,
  innstillinger (fire belønningsvalg 25/50/75/Gratis), «Legg til» (eligible + completed_count),
  pill på bookinger, Basis-skjold UTEN eksempeltall, ingen datahenting på skjoldede flater. Egen seksjon over.
- **Full mobil-gjennomgang av dashbordet** — kjørt (0 brukne flater); funn fikset (periodepiller
  `9ee04ca`, pris-0 `5fe012d`). Verktøy: `tools/render/mobil-gjennomgang.mjs`.
- **Bunn-nav på mobil** — BYGGET (`75a7386`), innhold klarer baren (`4abe4a1`). Ikke lenger «vurder».
- **Like periode-piller på 320** — `9ee04ca`: `#segs` (Oversikt) + `#attrPeriod` (Vekst),
  `.segs:not(.segs-val){display:flex;width:100%}` + `button{flex:1}` → 88/88/88.
- **Pris-0-markør i tjeneste-lista** — `5fe012d`: rød kant + «Sett pris».
- **Kalender-dagvelger på mobil starter på i dag** — `7d76c8c` (rotårsak i rekkevidden, ikke scroll-hack).

### Post-launch — gjenstående arbeid

#### Mobil (primærflate — de fleste barberere bruker dashbordet fra telefon)
- Full gjennomgang, bunn-nav og periodepille-fiksen er GJORT — se «Løst post-launch». Nye mobilfunn
  føyes til her.
- **Lojalitetsprogram-kortet @320/375/390 (trial + basis) — FERDIG.** Mobil-gjennomgangen er kjørt
  (21 kjøringer, 0 JS-feil, 0 overflow, ingen klipping). Trykkflate-funnene (bekreftelses-tekstknapper
  22px, fjern-ikon 30px m.fl.) er fikset i `f955de8` — alle kontroller ≥44px via padding/hitboks,
  uendret skrift. `tools/render/mobil-lojalitet.mjs` er nå en bestått regresjonstest. Rapporten i
  `docs/mobil-lojalitet.md` (07.09) beholdes som historikk over hva som ble funnet.

#### i18n (en/sv/da — oversettelsesfasen)
1. **Kundesiden er hardkodet norsk (backend).** `booking-module.cjs` har ingen i18n («Velg
   tjeneste», «Velg time», «Bygget med BarberHQ» osv.), og `prisTekst()` hardkoder `' kr'` — ingen
   valuta-abstraksjon. En UK/US-barberer via en/ får norsk bookingside med kroner. Må løses i
   backend før en/ tar imot ekte barberere.
2. **«Forgot password?» er død i en/** — `<a href="#" class="forgot">` i `site/en/logg-inn.html`.
   Magisk-lenke-flyten (`POST /api/send-magic-link` + `opprett-passord.html`) finnes bare i no/.
   Krever lenke/flyt i `en/logg-inn.html` + en engelsk `opprett-passord.html`.
3. **Oversettelse (utsatt fase) — full streng-liste under «Teknisk gjeld».** Kort: plassholdere,
   bilde-hjelpetekster, Vekst-flytens ledd, SMS-trekkspill, palett-navn og alt sv/da/en. Markør:
   `[oversettelse: sv/da/en]`. ⚠ `.ds-tab` rad 4/5 kan IKKE oversettes rett — de er sanne i det
   nordiske feltet, men usanne i USA (theCut PRO inkluderer begge). Faktasjekk, ikke språkjobb.
   **en/-flater som venter på denne fasen (ikke åpne no/-oppgaver):** terms/cookies-innhold (no/ er
   dekket av `vilkar.html`; en/ mangler innhold + har døde footer-`<a href="#">`), og «Forgot
   password»-flyten (pkt 2).
4. **Telefon-placeholderen (`#pf-phone` → `contact_phone`, Profil på «Din side», bygget no/ 11.09) er
   landavhengig — må håndteres i oversettelsesfasen:** «91 23 45 67» er NORSK format og må følge
   barberens `market` (NO/SE/DK/UK) når sv/da/en bygges. INGEN landkode-håndtering trengs — kunden
   ringer lokalt.

#### Innhold / sider
4. **Terms/Cookies-innhold: no/ DEKKET.** no/-footerne (`index`/`funksjoner`/`priser`/`support`)
   peker på `vilkar.html` — kombinert vilkår + personvern + cookies, ekte innhold, ingen døde lenker
   (verifisert 06.09). no/ har personvern INNE i vilkar.html (`#personvern`), ikke som egen
   `personvern.html`. en/-innholdet hører til oversettelsesfasen (pkt 3), ikke en åpen no/-oppgave.
   Merk `netlify.toml`: hele `/en/*` har `X-Robots-Tag: noindex` til oversettelsesfasen er ferdig.
5. **Døde footer-lenker (no/ FERDIG 06.09).** Vilkår/Personvern/Cookies peker på `vilkar.html` —
   som HAR innhold (18 seksjoner), ikke «mangler». Personvern/Cookies lander på `#personvern`/`#cookies`
   (id-anker + `scroll-padding-top:84px` for sticky nav, `59d56c4`). Alle fire no/-footere verifisert
   uten døde lenker (`index`/`funksjoner`/`priser`/`support`). en/-footerne hører til oversettelsesfasen
   (pkt 3). `Se dashbordet` (`id="demoNavBtn"`) er `href="#"` med vilje (`DEMO_ENABLED = false`) — ikke en bug.
6. **Landingsside-tekst (`site/no/index.html`).** «Bygd for å fylle stolen»-seksjonen skal endres
   (anker `<h2 class="sys-h2">`, omfang ikke bestemt), og siden mangler et sted som pitcher løftet
   direkte: FLERE KUNDER + OVERSIKT skal stå sammen ett sted, ikke bare underforstått i
   feature-seksjonene. Begge trekker budskapet fra «færre hull» til «flere kunder». Avklares før kode.
7. **`.ds-tab` nivåmerking + rebooking/verving-rader.** Radene ble tatt UT 12.08 (`8c41945`) og INN
    igjen 13.08 (`9de6c17`) — omgjort beslutning, ikke regresjon; ikke «rett» tilbake uten å spørre.
    De leser som BarberHQ-egenskaper for alle, mens begge er Vekst-eksklusive ifølge `priser.html`.
    En `.ds-note`-fotnote for nivåmerking ble bygget og fjernet igjen på Henriks beskjed — bevisst
    valg som må tas stilling til. Ikke gjenoppdag som bug.

#### Data / backend-avhengig
8. **Koble ekte data i Vekst.** Oversikt (diagram/KPI/rekord/månedsvelger) EKTE mot
    `/stats` + `/stats/month`; bookinger-liste ekte. «Drevet av»/Vekst-attribusjon er nå EKTE
    ende-til-ende: backend `GET /api/dashboard/attribution` returnerer `total {count,revenue}`
    (efaa553), frontend gjort autoritativ på `data.total` (`46701a3`, klient-sum fjernet). Gjenstår
    kun: verifiser seedede/ekte tall mot prod. No-show-knapp mock. (Ved Basis-plan vises eksempeltall
    bak lås, ikke ekte data — se Basis-visning.)
9. **Vekstfeatures (backend):** rebooking, verving, vinn-tilbake auto-SMS. Deretter
    landingsside-avsnitt under «fyll stolen» som forklarer dem.
10. **Test full klikk-flyt med ekte klippbilde** — crop + lagring i Din side, verifiser riktig slot
    på ekte kundeside. Bevist via API, ikke UI-flyt ennå.
    (Pris-0-markøren som sto her er GJORT — `5fe012d`, se «Løst post-launch».)

### Lav / polish
- **WebAuthn-instruksjonsbanner + «App kommer»-banner** i dashboard.
- **favicon.ico mangler** — 404 på alle sider (kosmetisk).

### Teknisk gjeld
12. **`buildHeroHeader()` (fyll.cjs) er dødkode** — backend-CLAUDE.md sier feilaktig «Hero bruker
    `{{HERO_HEADER}}`». Rydd begge.
13. **R2-foreldreløse bildeblobber** fra de 5 slettede test-barberne.
14. **Hero-bildegrense server-side** + **orders.barber_id FK-enforcement** — se sikkerhetshull.
15. **Oversettelse (utsatt fase):** plassholder-strenger (`(spesialitet)`/`(adresse)`/`(bio)`) +
    4 bilde-hjelpetekster + Vekst-flytens nye ledd (Påminnelse-boks «Kvelden før» + kortede
    undertekster) + de omskrevne SMS-trekkspillene i Vekst (06.08: `acc-sub` på både
    SMS-påminnelse og Rebooking, «Send etter» + pilletekstene «28/35/45 dager», og
    `sett-note` i SMS-påminnelse) + alt sv/da/en. Greppbar markør i koden:
    `[oversettelse: sv/da/en]`. **Også: norske palett-navn i `PALETTES` i
    `site/en/kom-i-gang.html`** — se «Layout-galleri på engelsk», punkt 6.
    **Merk:** «SMS-samtykke-linja i Rebooking-trekkspillet» sto her tidligere. Den strengen
    finnes ikke lenger — `acc-lead` ble slått sammen med noten, og noten ble deretter fjernet
    fra Rebooking helt. Ikke let etter den.
    **⚠ `.ds-tab` rad 4 og 5 kan IKKE oversettes rett — de må revurderes for en/.** ✕-cellene
    «Påminnelser koster per SMS» og «Rebooking er et betalt tillegg» er sanne som
    generaliseringer i det NORDISKE feltet (Fresha priser markedsførings-SMS per stykk uten fri
    kvote; Timma selger alt utover booking som betalte moduler; Squire legger markedsførings-SMS
    på topplanen; Setmore forbyr den; Booksy caper). De holder ikke i USA: **theCut PRO
    inkluderer både SMS og blasts i prisen**, så begge ✕-ene blir usanne. Dette er ikke en
    språkjobb — det er en faktasjekk mot et annet konkurransefelt, og radene må enten byttes
    eller tas ut i en/. Konkurranseanalysen ligger UTENFOR repoet; hent den før jobben startes.
    **`.ds-tab`-radtekstene har NULL linjemargin på 320** — fem av tolv celler ligger allerede på
    tre linjer (grensa), så sv/da-oversettelsene må måles celle for celle, ikke bare oversettes.
    Forvent omformuleringer: norsk er kortere enn svensk og dansk på flere av disse frasene.
16. **buildPalette duplisert** (fyll.cjs ↔ site/no/palett.js) — se «Kjent teknisk gjeld» over.
    (Tidssone-via-market sto her også; den er løst — `barbers.timezone` er sannhetskilde.)

### Hvor filer bor (plasseringsregler)
- **Seksjonsutkast bor i `_utkast/`** — `din-side-seksjon.html`, `din-side__bilde.html`,
  `problem-seksjon.html`, `problem-seksjon__venstre.html`, `systemer-seksjon.html`,
  `produktvisning-seksjon.html`, `SPEC-bytt-seksjoner.md`. Katalogen ligger utenfor publish-rota
  `site/` og serveres aldri. Nye utkast hører hjemme her, ikke i repo-rota.
- **Playwright-tooling** (`package.json`/`package-lock.json`) hører hjemme i repo-rota.
- **Skillet går på LEVETID, ikke på filtype.** Begge deler er Playwright-scripts; forskjellen
  er om de skal kunne kjøres igjen.
  - **`tools/render/` — faste render-tester.** Verifiserer flater vi endrer om igjen (Konto,
    nav-bredder, feedback-payload). De er en del av «render før deploy», og en
    verifiseringsrutine som bare finnes i en midlertidig katalog er ingen rutine — scratchpad
    ble slettet midt i en økt 08.08. Skjermbilder går til `.render-ut/` (gitignorert).
    **`page.on('pageerror')` er obligatorisk** i hvert script: den fanget en `Unexpected end
    of input` i dashboard.html der en `}` havnet bak en `//`-kommentar, så hele dashboard-JS-en
    var død — mens UI-et så helt normalt ut, bare med tomme lister. Se `tools/render/README.md`.
  - **Scratchpad — engangsundersøkelser.** Måler du én ting for å svare på ett spørsmål, og
    svaret er alt du trenger, hører scriptet hjemme i scratchpad-katalogen utenfor repoet.
    Samme for `demo_*.mjs` og løse `pw-screenshots/`.
  Regelen het før «scratchpad-testfiler hører ikke hjemme i repoet i det hele tatt». Den var
  for grov: den dyttet også de gjenbrukbare testene ut i en katalog som ryddes bort.
