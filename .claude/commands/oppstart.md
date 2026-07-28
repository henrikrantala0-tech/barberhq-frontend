Kjør oppstartsdiagnose. Utfør alle stegene, men rapporter kort.

Gjør dette (uten å skrive ut underveis):
1. Slå fast hvilket repo og branch du er i.
2. Les CLAUDE.md i repo-roten i sin helhet.
3. Kjør:
   - `git status --short`
   - `git log origin/main..HEAD --oneline`
   - `git log -5 --oneline`
   - `git fetch --dry-run`

Rapporter så MAKS fire linjer, i dette formatet:

Repo: <navn> (<branch>)
Sist: <hva som var i gang, én setning>
Status: <uncommittet / ikke pushet / rent — kun tallene, f.eks. "3 filer endret, 1 commit ikke pushet">
Neste: <hva som står først, én setning>

Ingenting mer. Ikke list filer, ikke list commits, ikke forklar,
ikke gjenta CLAUDE.md. Jeg spør om detaljene selv.

Regler:
- Ikke gjett. Peker CLAUDE.md og git i ulike retninger, skriv
  "uklart:" foran Sist-linja i stedet for å velge én av dem.
- Ikke start på noe arbeid, ikke commit, ikke push, ikke rediger filer.
