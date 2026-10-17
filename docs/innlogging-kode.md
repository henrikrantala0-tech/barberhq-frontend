# Innlogging med kode — API-kontrakt (17.10.2026)

Kontrakten frontend (`site/no/logg-inn.html`) er bygget mot. Backend eier rutene; speil endringer i
backend-repoets `docs/systemtilstand.md` (Auth).

## `POST /api/send-magic-link`
Request: `{ email, formaal?, request_id? }`
- `formaal: 'reset'` → «Glemt passordet?» (lenka/koden lander på opprett-passord).
- `request_id` → «Send koden på nytt»: samme forespørsel, ny e-post.
  Uten `request_id` → ny forespørsel.

Svar 2xx: `{ ok: true, request_id }` — alltid likt for kjente og ukjente adresser (ingen
e-post-enumerering), så også ukjente adresser får en `request_id`.

## `POST /api/login-kode`
Request: `{ email, kode, request_id }` (`kode` = 6 siffer).

| Status | Body | Frontend |
|---|---|---|
| 200 | `{ ok: true, redirect }` | Sletter lagret forespørsel, går til `redirect` (kun trybarberhq.com / samme origin) |
| 400 | `{ error, code: 'ny_kode' }` — `request_id` mangler, finnes ikke, eller koden er utløpt | Sletter lagret forespørsel, viser «Send meg en ny kode» (ny forespørsel, uten `request_id`) |
| 400 | `{ error, code: 'laast' }` — forespørselen har nådd 5 forsøk | Som `ny_kode` |
| 400 | `{ error, code: 'feil_kode' }` — koden stemmer ikke | «Koden stemmer ikke», feltet markeres for ny innskriving |
| 429 | | «For mange forsøk» — lenka i e-posten virker fortsatt |

**Frontend styrer på `code`, aldri på `error`-teksten.** Tekstene frontend viser er egne.
400 uten `code` (eldre backend) behandles som feil kode.

## Lagring i nettleseren
`localStorage['bhq-innlogging-kode'] = { request_id, email, formaal, utloper }`, `utloper` = nå + 10 min.
- localStorage, ikke sessionStorage: en hjemskjerm-app som drepes mens barberen er i Mail, mister
  sessionStorage. Ved ny lasting (uten `?error=`) står e-posten og kodefeltet klare igjen.
- `request_id` sendes bare når e-posten er den samme (uten hensyn til store/små bokstaver) og
  forespørselen ikke er utløpt. Ellers sendes kallet uten, og backend svarer `ny_kode`.
- Koden virker derfor bare i nettleseren den ble bedt om fra. På en annen enhet: lenka i e-posten.
