# 03 — Gjenstår

Ikke-blokkerende arbeid parkert med vilje. Launch-blokkere hører ikke hjemme her.

## Mobil-polish (fra (e)-gjennomgangen 2026-09-06 — ikke launch-blokkere)

Objektiv måling i (e) fant **0 brudd** (ingen overflow, klipping eller JS-feil) på alle fem faner
@320/375/390 i begge billing-shapes. Punktene under er «stygt/trangt», ikke «brukket». Codes
beskrivelse ordrett:

- **Momentum-skjoldet i basis** — kortet er lavt, så lås + «Se abonnement» blir litt klemt mot
  «Godt momentum»-teksten under. Lesbart, men tettest av skjoldene. *(lav)*
- **Vekst › «Slik henger det sammen»-flytdiagram** — høyt og tett på 320 (fem ledd stablet). Ikke
  brukket, men mye vertikal skrolling. *(lav)*

Render-harness for regresjon: `tools/render/mobil-gjennomgang.mjs` (fane × bredde × shape +
ekspandert accordion-runde).

## Prod-verifisering (ikke et mobilfunn)

- **Din side › Bilder-slots med ekte klippbilde.** Slot-boksene rendrer riktig i harnesset (blå
  ramme, 2-kolonne, ×/beskjær-ikoner), men webp-bildene lastet ikke i harnesset (viste alt-tekst
  «Klippebilde» over brutt bilde). Layouten er OK; selve bildevisningen + crop-modalen bør
  verifiseres med et **ekte klippbilde** i prod/innlogget sesjon — ikke noe harnesset kan avgjøre.
  (Samsvarer med det stående punktet om prod-data-test.)
