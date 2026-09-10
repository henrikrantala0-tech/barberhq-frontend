# Mobil-gjennomgang — Lojalitetsprogram-kortet (`#accLoyal`)

**Metode:** `tools/render/mobil-lojalitet.mjs` (Playwright, `device_scale_factor=2`). Målt @320/375/390
i trial + basis, alle tilstander: av · på uten deltakere · på med liste · fjern-bekreftelse ·
endrings-bekreftelse · av-advarsel · basis (skjoldet). Målt: dokument-overflow, elementer som stikker
forbi viewporten, trykkflater < 44px (min-dimensjon), klippet tekst, JS-feil.
**Rapport — ingen fikser gjort.** Skjermbilder @320: `.render-ut/mloy-*.png`.
Kjørt 07.09. **0 JS-feil i alle 21 kjøringene.**

> **STATUS 07.09:** Trykkflate-funnene under (🟡) er FIKSET i `f955de8` — alle kontroller ≥44px
> høyde via padding/hitboks (toggelen via usynlig `::after`), uendret skrift. `tools/render/mobil-lojalitet.mjs`
> er nå en fast regresjonstest (BESTÅTT: 0 JS-feil, 0 overflow, alle trykkflater ≥44px). Rapporten
> beholdes som historikk over hva som ble funnet.

---

## 🔴 BRUKKET
**Ingenting.** Ingen horisontal overflow (dok-overflow = 0px på 320/375/390), ingen elementer stikker
forbi viewporten, ingen klippet tekst, ingen JS-feil — i noen tilstand, på noen bredde, trial eller basis.
Navnene klippes ikke (pillen «Kan hente» ligger på meta-linja, ikke ved navnet). Layouten holder.

---

## 🟡 STYGT — trykkflater under 44px (WCAG/HIG-anbefaling)
Alt her er funksjonelt; det er trykkhøyde på mobil. Ingen er *feil*, men flere er lavere enn 44px.
Verst nederst i lista. Samme funn på alle tre bredder (kun horisontal bredde varierer).

| Element | Størrelse | Tilstand(er) | Merknad |
|---|---|---|---|
| Bekreftelses-tekstknapper: «Fjern» / «Avbryt» / «Slå av likevel» | **22px høye** | fjern-bekreft, av-advarsel | Lavest av alt. Rene tekstknapper (`.kl-fjern-*`, `.kl-off-*`). Én er destruktiv. |
| Fjern-ikon (person-minus) | **30×30** | på-liste + alle med liste | Én per deltaker (5 stk). Bevisst diskré, men destruktiv handling på liten flate. |
| «Legg til»-knapp (`.verv-btn`) | **65×29** | på-tom, på-liste | 29px høy, én per kandidat (4 stk). |
| Terskel- + belønning-select | **~236–306 × 35** | alle på-tilstander | Full bredde (lett å treffe horisontalt), men 35px høy. |
| Toggle-brytere (`.sw`: Program på / Tell med) | **38×22** | alle på-tilstander | iOS-toggles er typisk ~51×31; disse er 38×22. |
| Endrings-bekreftelsens «Lagre» / «Avbryt» (`.btn`/`.btn-outline`) | **75×39 / 80×39** | endring-bekreft | 39px — nærmest 44, høyest av bekreftelsesknappene (fikset i går). |
| «Slå på lojalitetsprogram» (primær-CTA) | **198×42** | av | 42px, så vidt under 44. |

**Mønster:** de dedikerte `.btn`-knappene (endrings-bekreftelsen, «Slå på») ligger på 39–42px — nesten
i mål. De ad-hoc tekstknappene i fjern-/av-boksene (22px) og fjern-ikonet (30px) er de klart laveste.
Om vi skal heve noe, er det disse to først.

---

## 🟢 GREIT
- **Ingen overflow / klipping** på 320/375/390 i noen tilstand — kortet er trygt på smal skjerm.
- **Basis (skjoldet):** rent på alle bredder — ingen trykkflate-flagg (inputs disabled bak skjoldet),
  ingen overflow. Skjoldet + «Se abonnement» + kortnavn leses, innhold under antydes.
- **Selectene** er full bredde og stabler under 400px (etikett over, select under) — flukter og bryter ikke.
- **Deltakerrader** brekker rent: navn full bredde, «X av Y» + pill på meta-linja, nummer på egen linje,
  person-minus top-høyre. Ingen navneklipp selv med «Kan hente»-pill.
- **Bekreftelses-boksene** (fjern/endring/av) legger seg under raden/innstillingen i full bredde — ingen
  trenger horisontal plass de ikke har.
- **0 JS-feil** i alle 21 kjøringene.

---

## Forslag til lista (bli enige før fiks)
1. **Hev de laveste trykkflatene til ~44px:** bekreftelses-tekstknappene (22px) og fjern-ikonet (30px).
   Enklest: øk `padding`/`min-height` på `.kl-fjern-*`/`.kl-off-*` og `.kl-remove` uten å endre det
   visuelle uttrykket (usynlig hitboks rundt).
2. **Vurder** om selects (35px) og toggles (38px) er verdt å heve — de er lette å treffe i praksis
   (full bredde / kjent iOS-mønster), så lavere prioritet.
3. **«Slå på» (42px) og endrings-knappene (39px)** er så nær 44 at et lite `padding`-dytt tar dem i mål
   hvis vi først er inne og rører knappene.

Alt dette er polish, ikke blokkere. Ingen brukne flater.
