# Bunn-nav i dashbordet — spec

Besluttet 03.09.2026, spesifisert 04.09.2026.
Visuell referanse (klikkbar, viser aktiv tilstand):
https://claude.ai/code/artifact/25068f52-103e-474a-851c-87d33887d5ca

Erstatter dagens dropdown-nav på mobil med fast tab-bar i bunn.
Fil: `site/no/dashboard.html`. Ikoner: `docs/bunn-nav/ikoner-sprite.svg`.

---

## Rekkefølge (låst)

Oversikt · Vekst · Tjenester · Din side · Konto

Speiler dagens fanerekkefølge. «Tjenester & tider» kortes til **Tjenester**
i baren — kun der, ikke i selve fanen.

---

## Mål

| | |
|---|---|
| Barhøyde | 56px innhold + `env(safe-area-inset-bottom)` under |
| Ikon | 24px |
| Gap ikon → etikett | 3px |
| Etikett | 10,5px, weight 600, line-height 1.15, nowrap + ellipsis |
| Fane | `flex:1`, `min-height:48px`, hele fanen klikkbar |

56px er ikke tilfeldig: iOS tab bar er 49pt, Android 56dp. Over 64 begynner
baren å føles som en skuff. På 320×693 er 56px åtte prosent av skjermen.

---

## Ikke i veien

- Scroll-containeren får `padding-bottom: calc(56px + env(safe-area-inset-bottom))`.
  Uten den skjules siste rad i hver liste bak baren — **det** er når folk
  opplever baren som i veien, ikke høyden.
- Baren skal **ikke** skjules ved scroll. Et dashbord man hopper rundt i
  leser en forsvinnende bar som en bug.
- `position: sticky` i scroll-containeren, **ikke** `fixed` på `body` —
  ellers flyter baren over tastaturet på iOS.
- Krever `viewport-fit=cover` i viewport-metaen. Uten den returnerer
  `env(safe-area-inset-bottom)` null, og baren legger seg under
  hjemindikatoren i installert PWA.

---

## Innpasning — ingen nye designverdier

| | |
|---|---|
| Flate | Samme flate-token som dashbord-kortene. Ikke hvit-på-hvit. |
| Topplinje | 1px i samme kant-token som kortene. **Ingen box-shadow.** |
| Aktiv fane | Blekk-blå `#4d8bff` (`--info`) på ikon og etikett + `--ac: currentColor` |
| Inaktiv fane | Samme dempede tekstfarge som dashbordets sekundærtekst |
| Font | Arves. Ikke sett `font-family` på baren. |

Skygge er det som gjør en bunn-nav påtrengende — den løfter baren visuelt
av siden. Én hairline gjør at den leser som en del av flaten.

### De to blåfargene

Dashbordet har to blå, og begge er riktige — i hver sin rolle:

- **`#2563eb` = bakgrunn-blå.** Fylte knapper, badges, aktive piller.
  Hvit tekst gir 5,17:1 — består AA.
- **`#4d8bff` = blekk-blå.** Lenker, ikoner, rammer, **aktiv fane**.
  Mot mørk flate ca. 4,9:1 — består AA.

Feil vei rundt faller igjennom: hvit tekst på `#4d8bff` gir 3,25:1, og
`#2563eb` som blekk mot mørk flate gir 3,10:1.

Aktiv fane er blekk, ikke bakgrunn → **`#4d8bff`**, ikke knappeblåen.

---

## Bare mobil

**Bruk nøyaktig samme breakpoint som dagens dropdown-nav bytter på.**
Velges et eget tall, får du et bredde-vindu der begge navigasjonene vises,
eller ingen. Dropdown-nav-en skjules i samme media query som bunn-nav-en
vises — én regel, to utfall.

---

## Ikonene

Fem symboler i `ikoner-sprite.svg`. 24×24, `currentColor`. Fire er strek
(1,75px); **Tjenester er en fylt form** (se unntaket under).

Aktiv tilstand er **én regel, ikke to ikonsett**: hvert ikon har én utpekt
flate som fylles når `--ac: currentColor` settes på fanen.

| Ikon | Utpekt flate |
|---|---|
| Oversikt | midtprikken i blinken |
| Vekst | den høyeste stolpen |
| Tjenester | — (fylt form, se unntak) |
| Din side | penselhodet |
| Konto | hodet |

Kontrasten mellom aktiv og inaktiv er **farge + fyll, aldri størrelse**.
Ikonet skal ikke hoppe når fanen byttes.

### Unntak — Tjenester

Tjenester-ikonet er **Phosphor `scissors` (Fill), MIT-lisens** — en fylt form
(`fill="currentColor"`, `stroke="none"`) skalert fra 256-viewBoxen med
`scale(0.09375)`. Tallet skal ikke røres.

Den har **ingen `--ac`-flate**: aktiv er **kun fargeskift** (hele saksen blir
`--info`). Ikke legg på stroke «for konsistens» — da blir den dobbelt så tung.

---

## Verifiser før commit

- [ ] 320, 375, 402: «Oversikt» og «Tjenester» får ikke ellipsis.
      På 320 er hver fane 64px — det er den trange. Kuttes «Tjenester»,
      senk til 10px før du vurderer å korte ordet. «Tjen.» ser ødelagt ut.
- [ ] Ingen liste får siste rad skjult bak baren, i alle fem faner.
- [ ] Dropdown-nav-en er borte i nøyaktig de samme breddene, og tilbake
      over breakpointet.
- [ ] Ekte enhet i tillegg til Playwright — safe area og tastatur kan
      ikke testes headless.
