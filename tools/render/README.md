# tools/render — render-før-commit

Playwright-scripts som verifiserer visuelle endringer i `site/no/` før de committes.
De serverer `site/` fra en lokal engangs-server, stubber `/api/**`, og måler.

```
node tools/render/konto-trekkspill.mjs    # Konto: fire trekkspill, alle tilstander
node tools/render/konto-lenke.mjs         # Konto: adresse-blokka per page_status
node tools/render/nav-prikk.mjs           # varselprikk i nav + «Mer»-toggel
node tools/render/feedback-payload.mjs    # /api/feedback: riktig payload per boks
node tools/render/salgssider-trial.mjs    # salgssidene: ingen gammel trial-copy
```

Skjermbilder havner i `.render-ut/` i repo-rota (gitignorert).

## Se screenshots (åpne i Bilder-appen)

Render-scriptene SKRIVER PNG til `.render-ut/` men ÅPNER dem aldri. `SendUserFile` laster kun
opp i chatten, og `Read` dekoder inn i Code sin egen kontekst — ingen av delene får bildet opp på
skrivebordet. For å faktisk se dem i Bilder-appen (Windows default `.png`-handler):

```
powershell -File tools/render/vis.ps1               # alle PNG i .render-ut
powershell -File tools/render/vis.ps1 konto-*       # kun de som matcher
powershell -File tools/render/vis.ps1 -Nyeste 6     # de 6 nyeste (typisk én runde)
```

Mekanismen er `Invoke-Item` (starter default-handleren). Native Windows, ikke WSL — ingen
sti-oversettelse. **`vis.ps1` er ASCII-only med vilje:** PowerShell 5.1 leser en BOM-løs `.ps1`
som ANSI, så æøå/tankestrek i fila knekker parsingen. Ikke legg inn norske spesialtegn der.

## ⚠ `page.on('pageerror')` er obligatorisk

Hvert script MÅ fange `pageerror` og rapportere den sammen med resultatet:

```js
const errs = [];
page.on('pageerror', e => errs.push(e.message));
…
rapport.push({ …, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
```

**Ikke fjern den for å rydde.** Den fanget 8. august en `Unexpected end of input`
i `dashboard.html` — en `}` var havnet bak en `//`-kommentar, så `renderKonto`
lukket aldri og **hele dashboard-JS-en var død**.

UI-et viste ingenting galt: sida rendret, fanene så normale ut, listene var bare
tomme og prikkene borte. Uten `pageerror`-fangsten ville skjermbildene blitt sendt
til godkjenning med «prikken virker ikke» som konklusjon — og den ekte feilen,
at ingen JS kjørte, ville stått igjen.

Et grønt skjermbilde er ikke bevis på at siden virker. `jsfeil: 'ingen'` er en
del av beviset.

## Måling slår øyemål

Scriptene rapporterer tall, ikke bare bilder — `getBoundingClientRect`,
`offsetParent !== null`, `getComputedStyle`. Grunner fra samme dag:

- **`offsetParent`, ikke bare `hidden`.** En prikk med `hidden=false` var likevel
  usynlig, fordi forelderen (`.nav-mer-meny`) sto lukket. Attributtet var riktig;
  elementet var 0×0.
- **Ikke `clientWidth − scrollWidth` som klaringsmål i flex med `margin-left:auto`.**
  Auto-margen spiser slakken, så tallet klemmes til 0 uansett hvor god plass det er.
  Mål geometri: siste elements høyrekant mot neste elements venstrekant.
- **Skjermbilder av ulike elementer har ulik skala.** To panel-screenshots med ulik
  høyde skaleres forskjellig i visningen, så «den fonten ser større ut» kan være ren
  skaleringsforskjell. Sammenlign med `getComputedStyle`, eller klipp ut i native
  piksler og stable.
- **`fullPage: true` + scroll-reveal = tomme flater.** Salgssidene (`index`, `priser`,
  `funksjoner`, `support`) skjuler innhold med `.reveal{opacity:0}` til en
  IntersectionObserver legger på `.in` ved scroll. `fullPage` fanger hele sida uten å
  scrolle, så observeren fyrer aldri under folden. 2746px av priser.html kom ut som tom
  mørk flate — det så ut som manglende innhold, men sida var i orden. Tving fram først:

  ```js
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
  await page.waitForTimeout(800);   // transition er .7s
  ```

  Denne løy MOTSATT vei av de andre: den viste et problem som ikke fantes. Begge
  retninger koster like mye tid — mål før du konkluderer.
- **`fullPage` + `position:sticky` + scroll = falsk overlapp.** Salgssidenes `.nav` er
  `position:sticky;top:0`. Scroller du før du regner ut en `clip` og så skyter med
  `fullPage:true`, males headeren på sin fastlåste posisjon — altså oppå dokumentinnholdet
  der scroll-offsetet var. Det så ut som at headeren dekket hero-teksten på priser.html.
  Målt i vanlig viewport-skudd ved `scrollY=0`: nav-bunn 69px, hero-eyebrow 153px — 84px
  klaring, ingen overlapp.

  Skal du dokumentere hva en bruker ser: ta et **vanlig viewport-skudd**, ikke `fullPage`
  med clip. Trenger du en seksjon lenger ned, scroll dit og skyt viewporten — ikke bland
  scroll og `fullPage`.
