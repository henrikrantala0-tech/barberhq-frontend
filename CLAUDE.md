# CLAUDE.md — barberhq-frontend

Frontend for BarberHQ (statisk side, deployes til Netlify).
Søsterrepo: barberhq-backend (Railway).

**Backend-repoet er NØSTET på disk.** Git-rota er `C:\dev\barberhq-backend\`, men all
kildekode ligger ett nivå ned i `C:\dev\barberhq-backend\barberhq-backend\` — `src/`,
`booking-module.cjs`, `fyll.cjs`, malene og backendens egen CLAUDE.md er alle der.
Undermappa er ikke selv en git-rot. **Alle backend-filreferanser i dette dokumentet er
relative til det nøstede nivået**, ikke til git-rota: `src/lib/trial.js` betyr
`C:\dev\barberhq-backend\barberhq-backend\src\lib\trial.js`.

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

- **Pris:** 249 kr/mnd fast (ingen 499-trapp foreløpig). **30 dagers gratis prøveperiode** i alle
  markeder — bevisst og riktig, ikke en feil i koden. Her sto det «(trial_period_days: 30)», som
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
- **⚠ Klonens rekord-terskel er `>=`, produktets er `>`.** `dashboard.html` bruker
  `var beaten = hasRecord && p.current_week_revenue > p.best_week_revenue`; scenens demo i `site/no/index.html` bruker
  `maalRev*e >= FORRIGE_REKORD`. Ved NØYAKTIG likt beløp tenner klonen gull der produktet
  ikke gjør det. I demoen er det uten betydning (10 550 passerer 10 100 med god margin), men
  avviket er reelt og skal ikke «ryddes» ved å endre produktet — det er klonen som er
  koreografi. Se også notatet om at gull-timingen i klonen er demo, ikke produktatferd.
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

## Dashboard: fane-struktur (11 → 5)

`site/no/dashboard.html` har **FEM faner** — talt 12.08: fem `<button role="tab" data-panel=…>`
og fem `<section class="panel" id=…>`, i denne rekkefølgen i DOM-en. Her sto det SEKS, som var
riktig fram til Profil-fanen ble slått inn i «Din side». To sammenslåinger har skjedd:
Innstillinger → Konto (06.08), og Profil → Din side. Begge fordi innholdet ikke bar en egen fane.

1. **Oversikt** = Oversikt + Bookinger + vinn-tilbake-**liste**. Pengeside-rekkefølge:
   KPI/omsetning → graf → «Drevet av BarberHQ» → kommende bookinger → full booking-liste
   (no-show-marker) → vinn-tilbake-liste.
2. **Vekst** = vekst-tall (rebooking-rate/trend/attribusjon, mock) + SMS-knottene
   (påminnelse/rebooking/intervall, ekte `GET/PUT /api/dashboard/settings`). Divider mellom
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
- **Tema-toggle: header (→31.07) → egen Innstillinger-fane (31.07) → Konto (06.08).** `#themeBtn`
  er samme knapp og samme id hele veien (all tema-JS er urørt), nå i en `.tog-row` nederst i Konto
  med etikett «Mørk modus» + «Huskes i denne nettleseren». Headerens `.who` har kun barbernavnet.
  Underteksten sier eksplisitt at dette gjelder dashbordet, ikke kundesida — lys/mørk for
  bookingsida velges under Design, og de to ble blandet sammen så lenge knappen sto løs i headeren.
  **`$("#themeBtn").addEventListener` har ingen null-sjekk** — flytter du knappen igjen, må den
  finnes i DOM-en ved sideload, ellers kaster init.
- **«Bytt passord» hører hjemme i Konto, men er BEVISST IKKE bygget** — det ligger kun en
  HTML-kommentar der. Årsak: `POST /api/dashboard/set-password` tar kun `{password}` og verifiserer
  ikke nåværende passord. Den ruta er laget for førstegangs-setting etter magisk lenke; brukt som
  «bytt passord» i et innlogget dashbord ville den latt hvem som helst med en kapret sesjon bytte
  passordet uten å kunne det gamle. Venter på backend-rute som krever nåværende passord (dag 2).
- **Mobil-nav:** Oversikt + Vekst alltid synlig; Profil/Tjenester & tider/Design/Konto bak «Mer»
  (fanen har `class="nav-mer"` og plukkes opp av «Mer»-menyen automatisk). Verifisert 320/375
  etter sammenslåingen: fire faner i menyen, toggle-etiketten blir «Konto ▾» når fanen er valgt.
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

**`kom-i-gang.html` har ~8px horisontal overflow på 320 (steg 2).** Pre-eksisterende, bevist
uavhengig av palett-jobben: `scrollWidth` er 328 også når sand-kortet fjernes live, og også
når hele layout-karusellen (`#layGrid`) skjules. Ikke diagnostisert — kilden er hverken
palett-gridet eller karusellen. Render-testens overflow-flagg slår derfor ut på onboarding@320
uten at det er en regresjon.

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

> **Push-status (13.08): KØEN ER PUSHET.** 23 commits gikk til `origin/main` i ett Netlify-bygg,
> denne commiten inkludert. Netlify auto-deployer fra `main`, så det er nå live.
>
> Her sto det tidligere at push var BLOKKERT til Stripe-prisene fantes. Den blokkeringen er
> opphevet: prisene finnes i sandbox — verifisert 13.08, begge produkter, ti priser. Ikke les
> det gamle notatet som en åpen oppgave.
>
> **`?ref=`-kjeden er FIKSET i backend (13.08, `e57535f` + `3e657f4`, pushet).** Verifisert med
> 11 tester og Chromium mot tre stier. `side.js` leser nå `req.query.ref` og validerer via
> `referralForVisning()` i `src/lib/referral.js` — samme funksjon som `book-v2.js` kaller, så
> regelen bor ett sted i stedet for to. `3e657f4` var den andre halvparten: `history`-kallene
> beholder query-en, så `?ref=` overlever refresh.
>
> **Her sto en diagnose med kodesteder som pekte på `fyll.cjs:136` og «tjenestekort-
> navigasjonen». Den er STRØKET — den beskrev kode som ikke lenger ser slik ut, og den var
> dessuten feil: den navigasjonen finnes ikke (rendret bevis). Den ekte taps-mekanismen var
> `history`-kallene.** Ikke let etter `.svc`-hrefen som årsak.
>
> Frontend har ingen åpen fiks her. Verving-raden på landingssida er dekket.

### Høyt — lanseringsblokkere
1. **Duplikat-e-post (backend):** `barbers.email` har INGEN unik-constraint; login tar `rows[0]`
   uten `ORDER BY` = ikke-deterministisk lotteri ved duplikat. Fiks: (a) partial unik-indeks
   `CREATE UNIQUE INDEX ON barbers(lower(email)) WHERE email IS NOT NULL`, (b) deterministisk
   login (avvis flertreff / `ORDER BY created_at`) i `auth.js` — begge stedene som gjør
   `SELECT … FROM barbers WHERE lower(email) = lower($1)`: under `router.post('/login'` (henter
   `password_hash`) og under `send-magic-link` (henter `display_name`).
   De-dup allerede gjort via test-rydding.
2. **«Gå live»-funksjon** mangler i dashboard — barber kan ikke publisere siden (`page_status`).
2b. **`.ds-tab` mangler nivåmerking (13.08).** Verving-raden i `site/no/index.html` («Verving må
   du styre selv» ✕ / «Innebygd verving med sporing» ✓) er **DEKKET** — `?ref=`-kjeden ble fikset
   i backend samme dag (`e57535f` + `3e657f4`, pushet), se push-notatet over. Her sto det at
   raden var en usann påstand på en produksjonsside, at vervingen ikke virket ende-til-ende, og
   at den måtte leveres eller ryke før lansering. **Alt det er utdatert — vervingen virker, og
   raden krever ingen oppfølging.** Historikken er verdt å kjenne, siden raden ble tatt UT av
   samme tabell 12.08 og inn igjen 13.08: det er en omgjort beslutning, ikke en regresjon.
   **Det som FORTSATT står åpent er nivåmerkingen.** En `.ds-note`-fotnote «Automatisk
   rebooking og verving følger Vekst» ble bygget og deretter fjernet igjen på Henriks beskjed —
   klassen er borte fra både markup og CSS, ikke bare skjult. Konsekvensen er at rebooking- og
   verving-radene leser som BarberHQ-egenskaper for alle, mens begge er Vekst-eksklusive ifølge
   `priser.html`. Det er samme problem som fikk radene fjernet 12.08 (`8c41945`). Ikke gjenoppdag
   dette som en bug — det er et bevisst valg som må tas stilling til før lansering.
3. **Billing (Stripe):** 1 mnd gratis + betaling etter. Rekkefølge billing vs. vekstfeatures IKKE
   avgjort — tas når vi kommer dit.
4. **KUNDESIDEN ER HARDKODET NORSK — blokkerer hele en/-markedet (funnet 27.07).**
   `booking-module.cjs` (backend) har ingen i18n: «Velg tjeneste», «Velg time», «Dato og tid»,
   «Dine opplysninger», «Velg minst én tjeneste for å booke», «Se tjenester», «Har du time?
   Endre eller avbestill», «Bygget med BarberHQ» er faste norske strenger. `prisTekst()` i samme
   fil hardkoder `' kr'` — det finnes ingen valuta-abstraksjon i det hele tatt. En UK/US-barberer
   som onboarder via en/ får altså en norsk bookingside med kroner. Må løses i backend FØR en/
   kan ta imot ekte barberere; er uavhengig av (og større enn) land/tidssone-feltene i skjemaet.
5. **«Forgot password?» er død i en/ — `<a href="#" class="forgot">Forgot password?</a>` i
   `site/en/logg-inn.html`.**
   Magisk-lenke-flyten (`POST /api/send-magic-link` + `opprett-passord.html`) finnes i no/, men
   er aldri portet til en/. En barberer som ikke kommer inn i dashbordet har ikke et produkt —
   dette er en lanseringsblokker, ikke en død footer-lenke. Krever både lenke/flyt i
   `en/logg-inn.html` og en engelsk `opprett-passord.html` (fila finnes bare i no/ i dag).
6. **Full mobil-gjennomgang av HELE dashbordet (`site/no/dashboard.html`) — ikke gjort.**
   Dashbordet er bygget og verifisert fra desktop, men **de fleste barberere vil bruke det fra
   telefonen** — mobil er primærflaten, ikke et sidespor. Alle fem faner må gås gjennom systematisk
   på 320/375/390 (Playwright, `device_scale_factor=2`, «Disable cache» PÅ): Oversikt (diagram +
   HUD-kort + KPI + «Drevet av» + booking-lister), Vekst, Tjenester & tider (inkl. `.gcal-warn`),
   Din side (preview + slot-bokser + crop-modal + profilfeltene), Konto. Se særlig etter
   horisontal overflow, for små trykkflater, tabeller/lister som ikke brekker, modaler som ikke
   får plass, og «Mer»-menyen. Egen runde — kartlegg først, bli enige om lista, så fiks.
   **Kjent funn allerede (06.08, bevisst utsatt):** periodepillene brekker til to linjer på 320
   — «Siste uke / Siste 2 uker» på første linje, «Denne måneden» alene under. Skyldes
   `.segs{flex-wrap:wrap}`, som er DELT CSS mellom Oversiktens `#segs` og Vekstens `#attrPeriod`,
   så en fiks treffer begge flater samtidig. Derfor ikke tatt som del av Vekst-arbeidet.
7. **Salgsflatene kjenner ikke to prisnivåer ennå (kartlagt 13.08).** `priser.html` skiller Basis
   fra Vekst. `site/no/index.html` er ryddet (se under); dashbordet gjenstår og henger på
   Stripe + gating — rekkefølgen er Stripe-priser → gating → dashboard-teksten.
   - **Rebooking og verving: UT 12.08 (`8c41945`), INN IGJEN 13.08 (`9de6c17`).** De ble fjernet
     fordi de er Vekst-eksklusive og seksjonen var nivå-nøytral — et løfte til Basis-kunder om
     noe de ikke får. Henrik tok dem inn igjen dagen etter, med begrunnelsen at Vekst er ankeret
     markedsføringen selger (prøven kjører på Vekst, kortet er merket «ALLE STARTER HER»).
     **Ikke «rett» dette tilbake uten å spørre — det er en omgjort beslutning, ikke en regresjon.**
     Se 2b for nivåmerkingen, som er den delen som fortsatt står åpen.
   - **Radsettet er skrevet om to ganger.** Dagens seks rader (`9de6c17`) er ikke de fem fra
     `8c41945`. «Prisen er prisen» finnes ikke lenger — rad 3 er nå «Gebyr per booking og per ny
     kunde» ✕ / «Én fast månedspris» ✓, fordi «Prisen er prisen» gjentok «Fast pris» i tittelen
     og ble hult. Les radene ut av fila, ikke ut av denne historikken.
   - **Tittel/ingress lagt om 13.08 (`927add9`)** — leder nå med pris og forutsigbarhet
     («Fast pris. / Fordi siden er din.») i stedet for merkevare («Din side. Ikke en katalog.»).
     Anti-marketplace er BEHOLDT, men flyttet fra påstand til begrunnelse: den forklarer hvorfor
     prisen kan stå fast. **Ikke skriv den tilbake til et merkevare-argument** — målgruppa booker
     i DM og har ingen merkevare å beskytte ennå. Rammen som gjelder for denne seksjonen: ingen
     navngitte konkurrenter, ingen tall, ingen prosentsatser, ingen «flere kunder»-språk.
   - **`site/no/dashboard.html` har flat 249 hardkodet tre steder** (linjenr. per 13.08, ankere er
     det som gjelder): `const PRIS='249 kr', PRIS_SUFF='/ mnd';` (3284),
     `settMikro('249 kr/mnd etter prøveperioden. Ingen binding.')` (3328), og
     `settMikro('Gratis i 30 dager, ingen kort. Deretter 249 kr/mnd — si opp når som helst.')`
     (3342). 399 finnes ikke i fila i det hele tatt. `PRIS` er én konstant, ikke tilstandsavhengig
     av nivå — **må bli nivå-avhengig når gating bygges.** Dashbordet er dessuten stedet barbereren
     faktisk «velger nivå ved prøveslutt» (`priser.html` l.203), så det er den flata som først blir
     selvmotsigende.

### Medium
4. **Vekstfeatures (backend):** rebooking, verving, vinn-tilbake auto-SMS. Deretter landingsside-
   avsnitt under «fyll stolen» som forklarer dem.
5. **Bytt passord i Konto — BLOKKERT PÅ BACKEND (dag 2).** UI-en er ikke bygget med vilje:
   `POST /api/dashboard/set-password` verifiserer ikke nåværende passord (laget for førstegangs-
   setting etter magisk lenke). Trenger en backend-rute som krever `currentPassword` før frontend
   kan bygges. Plassen er klar — HTML-kommentar i `#abonnement`. (Nav-omdøpingen «Abonnement» →
   «Konto» er GJORT 06.08, sammen med sammenslåingen av Innstillinger.)
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
11. **Døde lenker i footeren på no/ (kartlagt 29.07 — flere av dem er siden rettet).**
    Ankere i stedet for linjenummer; grep etter strengen:
    - `Vilkår` / `Personvern` / `Cookies` under `<h5>Juridisk</h5>` — **var** `href="#"`, peker
      nå alle tre på `vilkar.html`. Punkt 10 gjelder fortsatt for at innholdet mangler, men
      lenkene er ikke lenger døde.
    - `Alt på ett sted` — **var** feilpekt. Lenka peker nå på `#produkt`, som er seksjonens
      faktiske id. Ingen `#alt-pa-ett-sted` finnes eller trengs.
    - `Funksjoner`, `Priser`, `Kom i gang`, e-post, Instagram og TikTok ER koblet — ikke rør
      dem. Instagram og TikTok peker på de ekte kontoene (`barberhq__` / `barber_hq_`) på alle
      fem no/-sider.
    - `Se dashbordet` (anker: `id="demoNavBtn"` og `id="demoNavPanelBtn"`) er `href="#"` med
      vilje — styres av `DEMO_ENABLED = false` og skrus på ved launch. Ikke en bug.
    Samme gjennomgang må gjøres på `funksjoner.html`, `priser.html`, `support.html` og i en/.
12. ~~**Produktvisningen skal se bedre ut.**~~ GJORT. Seksjonen er ikke lenger ett
    stillbilde med etiketter oppå — `dashboard-produkt.png` er slettet. `#produkt` er nå en
    levende scene med tre kort i en ringkarusell: kalender, klonet dashbord og klonet
    bookingside. Hvert kort spiller én sekvens per fokus og står i sluttilstand når fokus
    går videre; dvelletiden utledes av sekvenslengden. Se `tools/render/produktvisning.mjs`
    for hva som er verifisert, og `tools/render/booking-tilstander.mjs` for de seks
    bookingtilstandene målt mot den publiserte sida.
13. **«Bygd for å fylle stolen»-seksjonen skal endres.** Anker: `<h2 class="sys-h2">` i
    `site/no/index.html`. Henriks vurdering 29.07 — omfang ikke bestemt (tekst? layout? hele
    seksjonen?). Avklares før kode. **Merknaden om at bunn-CTA-en gjenbruker samme bilde er
    utdatert:** CTA-en het «Klar til å fylle stolen?» og hadde ikke noe bilde. Den heter nå
    «Vi setter opp siden din — og hjelper deg fylle kalenderen» (anker: `.final-cta`), og bildet
    som lå i `#din-side` er flyttet dit som maskert bakgrunn (`.cta-bg`). De to seksjonene deler
    fortsatt budskap, men ikke lenger noe bilde.
14. **Siden mangler et sted som pitcher løftet direkte (Henrik 12.08).** Vi skal si rett ut at
    vi hjelper barbereren med å skaffe FLERE KUNDER og å ha OVERSIKT over driften. Ikke ordrett
    — men de to løftene skal stå sammen ett sted på `site/no/index.html`, ikke bare underforstått
    i feature-seksjonene. Hvor det havner (egen seksjon vs. inn i en eksisterende) er ikke
    bestemt — avklares før kode. Henger sammen med «Bygd for å fylle stolen» (punkt 13): begge
    trekker budskapet fra «færre hull i kalenderen» til «flere kunder». Hero-underteksten er
    allerede snudd samme vei — `.hero-sub` ender nå på `<strong>Flere kunder, mer inntekt.</strong>`.

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
