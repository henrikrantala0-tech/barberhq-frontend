// tools/render/fixtures/webkit-fonter.mjs — riktige fontvekter i Playwrights WebKit på Windows.
//
//   import { statiskeGoogleFonter } from './fixtures/webkit-fonter.mjs';
//   if (motor === 'webkit') await statiskeGoogleFonter(page);   // FØR page.goto
//
// Hvorfor: dashbordet henter Inter fra Google Fonts (300/400/500/700/800). En moderne nettleser får ÉN variabel
// woff2-fil for alle vektene. Playwrights WebKit-bygg for Windows regner bredden riktig ut fra font-weight, men TEGNER
// glyfene i fila sin standardvekt (400): fet tekst («Legg til booking», «Kommende bookinger») ble tynn på
// skjermbildene. Målt 12.11.2026: samme tekst ved 400/700 → bredde 136,0/139,8 px i begge motorer, men WebKit-bildet
// viser lik strektykkelse. Safari på iPhone tegner den variable fila riktig, så feilen er i render-oppsettet, ikke i
// dashbordet.
//
// Løsning: css2-forespørslene hentes på nytt fra Google UTEN nettleser-UA. Da svarer Google med statiske filer, én per
// vekt (samme Inter, samme versjon, de navngitte vektene) — og dem tegner WebKit med riktig strektykkelse. Samme
// CSS-oppsett og vekt-utvalg som dashbordet ber om, så 600 tegnes fortsatt med 700-fila, som på iPhone.
// Bare WebKit trenger dette; Chromium tegner den variable fila riktig og skal få den.
const cache = new Map();

export async function statiskeGoogleFonter(page) {
  // Regex, ikke glob: css2-URL-en har query (?family=…&display=swap), og globben traff den ikke (målt).
  await page.route(/^https:\/\/fonts\.googleapis\.com\/css2\?/, async route => {
    const url = route.request().url();
    try {
      if (!cache.has(url)) {
        const r = await fetch(url, { headers: { 'User-Agent': 'curl/8.4.0' } });
        if (!r.ok) throw new Error('Google Fonts svarte ' + r.status);
        const css = await r.text();
        if (!/fonts\.gstatic\.com\/[^)]+\.ttf/.test(css)) throw new Error('fikk ikke statiske .ttf-filer');
        cache.set(url, css);
      }
      await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: cache.get(url) });
    } catch (e) {
      console.error(`[webkit-fonter] ${e.message} — WebKit får den variable fila (tynn fet tekst på bildene).`);
      await route.continue();
    }
  });
}
