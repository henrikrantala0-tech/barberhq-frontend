# Renderkjede — layout-galleriet på engelsk

Bygger de fire mockupene i `site/en/images/layout-{showcase,hero,profil,direkte}.webp`
(832×1740, transparent bakgrunn, telefonramme) og verifiserer dem i `site/en/kom-i-gang.html`.

Ligger utenfor `site/` og publiseres derfor ikke (publish-rot er `site/`, se `netlify.toml`).

## Kjør i rekkefølge

| Script | Gjør |
|---|---|
| `1-bygg-hero.mjs` | bygger hero-fotoet fra det rene båndet i `no/layout-hero.webp` |
| `4-retusj-logo.mjs` | maler «EST. OSLO» bort fra Grand Barber-logoen |
| `2-render.mjs` | rendrer de fire skjermene (390×844 @2x) via backendens `fill()` |
| `3-ramme.mjs` | setter skjermene inn i telefonrammen + status-linja |
| `5-sjekk-kom-i-gang.mjs` | screenshot-sjekk av galleriet på 320 og 375 px |

**Stiene er absolutte scratchpad-stier og må repekes** før kjøring. Alle fire trenger
`sharp` og `playwright` fra frontend-repoets `node_modules`, og `fyll.cjs` fra backend-repoet.

## `kilder/`

Ferdige kilder — **klipp aldri ut på nytt fra `site/no/images/*.webp`**, det er den jobben
disse filene finnes for å slippe.

| Fil | Hva |
|---|---|
| `g1`–`g4.webp` | fire rene klippfoto (388×484), galleri i showcase/profil |
| `hero.webp` | hero-fotoet ferdig komponert (780×1688), stripefritt |
| `logo-retusj.webp` | Grand Barber-logoen med «EST. OSLO» retusjert bort |

`1-bygg-hero.mjs` og `4-retusj-logo.mjs` produserer `hero` og `logo-retusj` på nytt fra
`site/no/images/`. `g1`–`g4` er klippet ut én gang og gjenbrukes.

## Viktig

- **Engelsk UI er etterbehandling av HTML-en**, ikke i18n. Malene er norsk-hardkodet og
  `prisTekst()` hardkoder `' kr'`. Kartet ligger i `2-render.mjs` (`EN`). Rører ikke backend.
- **`.manage-link` dyttes ned i mockupen** fordi headless Chromium har
  `env(safe-area-inset-top)=0`. Selve kollisjonen er en ekte bug i `direkte.template.html`
  på notch-telefoner — se CLAUDE.md, «Layout-galleri på engelsk», punkt 5.
- Målene på telefonrammen står i CLAUDE.md, ikke her — ett sted.
