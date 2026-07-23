# BarberHQ — Status landingsside (29.06.2026)

## Hva denne økten handlet om
Restrukturere `no/index.html` til den låste 8-seksjons-rekkefølgen, bygge de manglende seksjonene, og bryte opp overskrift-monotonien på siden.

---

## LANDET PÅ SIDEN (committet lokalt, IKKE pushet)

Siden er nå **2 commits foran origin/main** — ingenting er live på Netlify ennå.

Faktisk seksjonsrekkefølge i `no/index.html` nå:
1. Hero (`#top`) — «Kundene booker selv. Du bare klipper.»
2. Problem — «Booker du fortsatt i DM-en?» — **men gammel pill-versjon** (ikke de nye kortene)
3. Produktvisning (`pv-section`) — **gammel versjon uten overskrift/fade/glød**
4. Selvbooking (`#selvbooking`) — «Rett i kalenderen din»
5. Accordion (`#systemer`) — «Bygd for å fylle stolen», rebooking + verving som sammenleggbare rader. **Ferdig og committet (abf3e3f).** Klikk-trigget animasjon (byttet ut IntersectionObserver). Gamle `#vekst`/`#rebooking`/`#verving` slettet.
6. Avsluttende CTA (`.final-cta`)

Encoding-bug (PS5.1 CP1252 → mojibake) oppsto og ble løst korrekt via `git checkout` + `-Encoding utf8`.

---

## BYGD I CHATTEN, KLAR — men IKKE inne på siden ennå

Disse ligger ferdig i `/mnt/user-data/outputs/` og i repoet som referansefiler, men er **ikke limt inn i index.html**:

- **`problem-seksjon.html`** — ny versjon med store kort (ikon + tittel + undertekst + rød «3»-prikk), sentrert. Skal **erstatte** den gamle pill-versjonen på siden. Tekst: «Det funker — helt til det ikke gjør det. En Instagram-profil alene gir ikke alltid det beste førsteinntrykket.» Fire kort: Tapte meldinger, Frem og tilbake, Dårlig oversikt, No-show.
- **`produktvisning-seksjon.html`** — oppdatert med eyebrow «PRODUKTET» + overskrift «Alt du trenger.» + kant-fade (`mask-image`, smelter inn i `#0a0a0a`) + subtil hvit glød bak telefonene. Skal **erstatte** den gamle produktvisningen. Base64-bilde innbygd.
- **`din-side-seksjon.html`** — NY anti-marketplace-seksjon. To-kolonne sammenligning «Katalog-appene» (grå, røde kryss) vs «BarberHQ» (blå glød, grønne haker). Overskrift «Din side. Ikke en katalog.» Fem punkter hver. BarberHQ til høyre (bevisst — sterkere slutt). Bruker IKKE ekte konkurrentnavn (unngår å sende leads til dem). Skal settes inn etter produktvisning.

---

## BESLUTNINGER TATT DENNE ØKTEN

- **Selvbooking-seksjonen skal FJERNES.** Konklusjon: unødvendig fyll — alle skjønner hvordan en bookingside funker, og den dreper tempoet mellom produkt og posisjonering. (Ikke fjernet ennå.)
- **Overskrift-monotoni er et reelt problem:** 7 nesten identiske seksjoner (eyebrow → 64px-overskrift → undertekst → innhold, alltid sentrert). Leseren slutter å registrere overskriftene.
- **Valgt løsning: Retning 2** — venstrestilt to-spalte for støtte-seksjoner med klippe-bilde ved siden av teksten, vekslende med sentrerte seksjoner. To størrelser: hero + «Alt du trenger» store, resten mindre. Ikke bygd ennå.
- **Bilde-regelen opphevet** av Henrik for fjes på siden — MEN landet på å bruke **egne klippe-bilder** større/flere steder i stedet for stock/AI-fjes (troverdighet + juss).
- BarberHQ-kolonne til høyre i sammenligningen (sterkere slutt).
- Femte sammenligningspunkt: «Fast mal — alle ser like ut» vs «Siden bygges etter dine ønsker» (knytter concierge-bygging inn).

---

## NESTE STEG (i rekkefølge)

1. **Henrik henter klippe-bilder fra Instagram** — portrett 4:5, full oppløsning (ikke skjermbilder), 4–6 stk. Sjekk GDPR: bare bilder der kunde har sagt ja / ansikt vendt bort.
2. **Bygg Retning 2-seksjonene i chatten** (tryggere enn å sende alt til Claude Code samtidig):
   - Problem → venstrestilt to-spalte med bilde
   - Din-side → venstrestilt to-spalte med bilde
   - Evt. fjes-stripe
   - Krymp overskrifter til to-størrelse-hierarki
   - Render + Henrik godkjenner hver
3. **Bygg «Prøv gratis»-seksjonen** (#7, aldri laget) — 30 dager + risikoreversering, INGEN priser/tall, rett før CTA.
4. **Én samlet Claude Code-runde** som tar ALT inn på siden:
   - Erstatt gammel problem → ny (kort/to-spalte)
   - Erstatt gammel produktvisning → ny (overskrift/fade/glød)
   - Sett inn din-side
   - Sett inn Prøv gratis
   - **FJERN selvbooking**
   - Krymp overskrifter
   - UTF-8-sikring, render-før-commit
5. **Push** — alt live samtidig først når hele den nye siden er komplett og godkjent.

---

## VEDVARENDE LÆRDOM FRA ØKTEN

- **Nedlasting fra chat feilet konsekvent** for Henrik (filer kom aldri ned i Downloads, eller fikk `.FINAL`/`.final`-suffiks med mellomrom i navnet fra Edge). Løsning: PowerShell `copy` med eksakt navn i anførselstegn, eller heredoc-blokker direkte i terminalen.
- **Brukernavn er `henri`, ikke `henrik`** — sti er `C:\Users\henri\Desktop\barberhq-frontend`.
- Claude Code **«proceed?»** ≠ permission-prompt. Bypass-permission i settings rører ikke «proceed». Bare svar «proceed», eller be den kjøre flere steg sammenhengende og kun stoppe før commit.
- `--dangerously-skip-permissions` er et CLI-flagg ved oppstart, ikke noe man skriver inni Claude Code.
- **Render-før-commit holdt** — fanget at problem-seksjonen på siden var gammel pill-versjon (grep avslørte `pwrap/opt/pad` med `<span class="pill">`, ingen `pcard`).
- Henrik vil ha **ærlig motstand, ikke medhold** — sa det eksplisitt. Ikke spille på lag, tenk selv, aldri si «la meg være ærlig».
