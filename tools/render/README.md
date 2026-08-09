# tools/render — render-før-commit

Playwright-scripts som verifiserer visuelle endringer i `site/no/` før de committes.
De serverer `site/` fra en lokal engangs-server, stubber `/api/**`, og måler.

```
node tools/render/konto-trekkspill.mjs    # Konto: fire trekkspill, alle tilstander
node tools/render/nav-prikk.mjs           # varselprikk i nav + «Mer»-toggel
node tools/render/mal-nav-bredde.mjs      # måler om fanene får plass på 320
node tools/render/feedback-payload.mjs    # /api/feedback: riktig payload per boks
```

Skjermbilder havner i `.render-ut/` i repo-rota (gitignorert).

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
