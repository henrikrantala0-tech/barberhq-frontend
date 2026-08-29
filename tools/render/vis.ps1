# vis.ps1 -- opens render screenshots in the Windows Photos app (default .png handler).
#
# ASCII-only ON PURPOSE: PowerShell 5.1 reads a BOM-less .ps1 as the system ANSI codepage, so
# any ae/oe/aa or dash in this file would corrupt string terminators and break parsing. Keep it
# plain ASCII. (Comments in English for the same reason -- the tool it drives is Norwegian.)
#
# Why this exists: the render scripts write PNGs to .render-ut/ but never OPEN them. SendUserFile
# only uploads to chat; Read only decodes into Code's own context. Neither puts the image on the
# desktop. Invoke-Item launches the default handler (Photos), which is what gets it on screen.
#
# Usage (from repo root):
#   powershell -File tools/render/vis.ps1                # open ALL PNGs in .render-ut
#   powershell -File tools/render/vis.ps1 konto-*        # only those matching the glob
#   powershell -File tools/render/vis.ps1 -Nyeste 6      # only the 6 newest (one render round)
#
# In Photos you can arrow through the rest of the folder from one image, so -Nyeste / the glob
# are there to avoid re-opening stale screenshots from earlier rounds.
param(
  [string]$Filter = '*',
  [int]$Nyeste = 0
)
$dir = Join-Path $PSScriptRoot '..\..\.render-ut'
if (-not (Test-Path $dir)) { Write-Output "No .render-ut folder at $dir -- run a render first."; exit 1 }
$files = Get-ChildItem (Join-Path $dir "$Filter.png") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if (-not $files) { Write-Output "No PNG in $dir matching '$Filter'."; exit 1 }
if ($Nyeste -gt 0) { $files = $files | Select-Object -First $Nyeste }
foreach ($f in $files) { Invoke-Item $f.FullName }
Write-Output "Opened $($files.Count) image(s) in Photos:"
$files | ForEach-Object { Write-Output "  $($_.Name)" }
