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

## Status 23.06

# BarberHQ — Status etter økt 23.06 (mal-polering + kom-i-gang live preview)

## HVA SOM BLE GJORT I DAG

### Booking-side-maler polert (ligger i sandkasse → MÅ landes i barberhq-backend)
Alle fire layouter fikk distinkt identitet + "dyrt" uttrykk:
- **Direkte** — INGEN galleri, rett til tjenester (rask booking). Én side.
- **Profil** — to-skjerms: portrett + bio + kant-til-kant gradient-galleri → "Se tjenester" → tjeneste-skjerm glir opp.
- **Showcase** — to-skjerms: navn + kant-til-kant gradient-galleri (INGEN portrett) → flytende transparent "Se tjenester" som blir liggende ved scroll. Galleriet blar gjennom ALLE bilder.
- **Hero** — IKKE bygget med nytt mønster ennå (skal ha stort STÅENDE hovedbilde + navn oppå, IKKE liggende, IKKE galleri).

### Nøkkelbeslutninger låst i dag
- Forside-layoutene (Profil/Showcase/Hero) er TO-SKJERMS: forside → "Se tjenester" (IKKE "Book nå") → tjeneste-skjerm som glir opp fra bunnen (eksklusiv overgang). Direkte forblir ÉN side.
- Alle galleribilder STÅENDE (4:5), aldri liggende (Henriks ekte bilder er 0.59 ratio).
- Galleri = kant-til-kant + gradient-fade (smelter inn i bakgrunn) på Profil + Showcase, IKKE Hero.
- Bio = frivillig 1-2 setninger på forsiden under undertekst. VALGT: bio nr 3 "Presisjon i hvert klipp. Din barber i hjertet av Oslo." Nytt felt `pitch` i ordre (ikke kollidere med `bio`=spesialitet).
- Font-valg FJERNET fra kom-i-gang (font velges i dashboard).
- fyll.cjs: 4-bilde-grensen (slice(0,4)) FJERNET — alle bilder vises nå.

### fyll.cjs endringer (sandkasse-versjon i outputs)
- La til BIO_BLOCK-håndtering (frivillig pitch, skjul blokk om tom, markør <!-- BIO_START...BIO_SLUTT -->)
- Fjernet slice(0,4) på galleri

### Hovedoppgaven: kom-i-gang live preview (FERDIG for Profil)
Den ekte kom-i-gang.html (157KB → nå 615KB) ble endret:
- Font-velger fjernet (HTML-rad, FONTS-array, design-state, renderDesign, submitFinal)
- Profil-layout vises nå som FAKTISK MAL KRYMPET i iframe (ikke skisse) — base64-embedded preview-mal med Google-fonter + postMessage-lytter
- buildPalette portet til JS i kom-i-gang
- Palett-klikk + lys/mørk sender postMessage til iframe → malen oppdaterer farger LIVE (verifisert: krem+lys funker)
- De 3 andre layoutene MIDLERTIDIG SKJULT (vises i morgen)
- Claude Code byttet inn no/kom-i-gang.html i frontend-repoet (IKKE committet ennå — Henrik tester først)

## ÅPENT PROBLEM (tenk på til neste økt)
**Palett-byttet er for lite synlig på Profil-forhåndsvisningen.** Profil-forsiden er mørk + portrett + galleri (bilder endrer ikke farge), så palett-endring vises bare i bio-tekst/aksent — lett å overse. Hele poenget er at barberen SKAL se fargene. 
LØSNINGSRETNING: forhåndsvisningen bør vise en del der fargene dominerer — f.eks. tjeneste-skjermen (fargede knapper, prislapper i aksent, kort med bakgrunnsfarge), ikke bare bildetung forside. Eller veksle/scrolle forside↔tjenester så palett-byttet blir tydelig.

## GJENSTÅR (neste økt)
1. Løs palett-synlighet (over) — viktigst
2. Bygg de 3 andre layoutene (Showcase/Hero/Direkte) inn i kom-i-gang som live iframes — samme mønster som Profil
3. Bygg Hero-malen med to-skjerms-mønster (stort stående bilde)
4. Legg bio-blokk inn i Showcase + Hero (mekanikk finnes i fyll.cjs)
5. Gi Profil flytende "Se tjenester"-knapp (for mange bilder, som Showcase)
6. Vurder: filstørrelse blir tung med 4 embedded maler — hente bilder eksternt i stedet?
7. Land de polerte malene + oppdatert fyll.cjs i barberhq-backend via Claude Code (erstatt gamle .template.html)
8. Commit + push kom-i-gang når Henrik har testet og godkjent

## FILER I OUTPUTS (kritiske)
- kom-i-gang.html (615KB) — ferdig, Profil live. Claude Code har byttet inn i repo.
- profil.template.polert.html, showcase.template.polert.html, direkte.template.polert.html — ferdige maler (IKKE i backend-repo ennå)
- fyll.cjs — oppdatert (bio + ingen grense) (IKKE i backend-repo ennå)

## Mersalg / tilleggstjenester (besluttet — bygges i booking+checkout-fasen)
- Kunder skal kunne hake av tillegg i kassen (f.eks. "+ Skjeggtrim kr 150,-",
  "+ Hodebunnsmassasje") oppå en hovedtjeneste — i stedet for å duplisere tjenester
  ("Skinfade" og "Skinfade med skjegg"). Øker timepris uten ekstra tidsbruk.
- Hører til bookingmotoren, som ikke finnes ennå. MVP har ingen kasse/checkout → wires IKKE inn nå.
- Forberedes når booking bygges:
  - `services[]` får valgfri `addons`: `{name, price, min}`.
    Eks: `{ "name":"Skin fade","min":40,"price":500,
            "addons":[{"name":"Skjeggtrim","price":150,"min":10}] }`
  - SQL: egen `addons`-tabell knyttet til tjeneste.
  - `fyll.cjs` + tjeneste-malen røres ikke nå (tillegg vises i kassen, ikke på tjeneste-lista).
  - Ikke vist i kom-i-gang-skjemaet i MVP.

## Status etter økt (maler + kom-i-gang)
- Fire bookingside-maler ferdige og konsistente (Showcase/Hero/Profil/Direkte), minimal som
  låst galleri-palett. Landet i barberhq-backend (maler + fyll.cjs: bio-mekanikk + ingen
  4-bilde-grense). Hero var ny.
- kom-i-gang: layout-galleri (4 statiske klikkbare kort + lightbox) over palett/bakgrunn,
  + live tjeneste-preview (preview-tjenester.html i iframe, postMessage fra buildPalette)
  som oppdaterer farge/bakgrunn i sanntid. Font-velger fjernet. ~615KB → ~50KB.
- kom-i-gang regnes som ferdig for nå.
