# initTrialNudge — verving-sjekken var død fra dag én

**Fjernet 13.09.2026.**

> initTrialNudge leste `attr.verving.count` som aldri har eksistert i noen shape.
> Sjekken var død fra dag én; nudgen ble aldri undertrykt av verving-aktivitet alene.
> Fjernet 13.09 — #3 (all-time referrals) er riktig signal.

## Kontekst

`initTrialNudge` (`site/no/dashboard.html`) skal ALDRI vise prøve-nudgen hvis barbereren
allerede bruker Vekst-funksjonene. Sjekk #4 var ment å fange verving-aktivitet, men leste
`attr.verving.count`:

- **Gammel /attribution-shape:** flat `{ period, total, vervet, recovery, rebooking }` — nøkkelen
  het `vervet`, aldri `verving`. `attr.verving` var `undefined`.
- **Ny shape (46898fd):** `paaVei.verving.lenke_finnes` (boolean, ingen `count`) +
  `hentetInn.vervet` (`{count,revenue}`). `attr.verving` på toppnivå finnes fortsatt ikke.

Sjekken var altså `undefined && …` = alltid falsk, i BEGGE shapes. En barber med reell
verving-aktivitet fikk nudgen likevel.

**Riktig signal er #3** (`api.referrals()` → `refs.length>0`), som er **all-time** og dekker
«har vervet» bedre enn et 7-dagers attribusjons-vindu ville gjort. #4 ble derfor slettet, ikke
remappet — å remappe til `hentetInn.vervet.count` ville bare gjeninnført et smalere duplikat av #3.

**Bonus:** `api.attribution('uke')` ble kalt KUN av denne døde sjekken i `initTrialNudge`, så
slettingen fjerner også et unødvendig fetch ved oppstart.

**Ikke gjenoppliv** en vindus-basert attribusjons-sjekk her — verving-undertrykkingen bor i #3.
