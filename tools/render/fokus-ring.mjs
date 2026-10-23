// tools/render/fokus-ring.mjs — verifiserer synlig tastatur-fokusring på markedssidene.
//   node tools/render/fokus-ring.mjs
// For hver side + bredde (320/375/1200):
//   • Tab gjennom siden, mål outline (farge/bredde/offset) på hvert fokuserte element
//   • Sjekk om ringen klippes av en forelder med overflow!=visible (rotårsaken i index.html)
//   • Museklikk på en knapp skal IKKE gi :focus-visible-ring
//   • 0 console/pageerror
//   • Lagrer 3 fokus-screenshots per side/bredde til .render-ut/
// Krav: outline = rgb(77, 139, 255), width 2px. Grønt = alle synlige fokuserbare har ringen, ingen klippes.

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
import { sjekk, ferdig } from './fixtures/sjekk.mjs';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.woff2':'font/woff2', '.ttf':'font/ttf' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r)); const PORT = server.address().port;

const PAGES = ['logg-inn','opprett-passord','priser','support','vanlige-sporsmal','vilkar','kom-i-gang','index'];
const WIDTHS = [320, 375, 1200];
const WANT_COLOR = 'rgb(77, 139, 255)';

// Måler aktivt element: synlighet, outline, og om ringen klippes av overflow-forelder.
function measureActive() {
  return `(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0 && el.offsetParent!==null || cs.position==='fixed';
    const focusVisible = el.matches(':focus-visible');
    const offset = parseFloat(cs.outlineOffset)||0;
    const ow = parseFloat(cs.outlineWidth)||0;
    // Ring-boks = elementets rect utvidet med offset+bredde på alle kanter
    const pad = offset + ow;
    const ring = { top:r.top-pad, left:r.left-pad, right:r.right+pad, bottom:r.bottom+pad };
    // Gå opp i foreldrekjeden; klippes ringen av en overflow!=visible-forelder?
    let clippedBy = null;
    let p = el.parentElement;
    while (p) {
      const pcs = getComputedStyle(p);
      const ox = pcs.overflowX, oy = pcs.overflowY;
      const clips = (o,axis) => o!=='visible' && !(o==='clip');
      if ((ox!=='visible') || (oy!=='visible')) {
        const pr = p.getBoundingClientRect();
        const eps = 0.5;
        const overX = (ox!=='visible') && (ring.left < pr.left-eps || ring.right > pr.right+eps);
        const overY = (oy!=='visible') && (ring.top < pr.top-eps || ring.bottom > pr.bottom+eps);
        if (overX || overY) { clippedBy = { sel: p.tagName.toLowerCase()+(p.className&&typeof p.className==='string'?'.'+p.className.trim().split(/\\s+/).join('.'):''), ox, oy, overX, overY }; break; }
      }
      p = p.parentElement;
    }
    // Usynlig tab-stopp: selve elementet (ikke bare ringen) ligger helt utenfor en klippende forelder, eller har
    // null flate — f.eks. en lenke i en LUKKET mobilmeny (max-height:0) eller et karusellkort utenfor sporet.
    let skjult = r.width === 0 || r.height === 0;
    for (let q = el.parentElement; q && !skjult; q = q.parentElement) {
      const qs = getComputedStyle(q); if (qs.overflowX === 'visible' && qs.overflowY === 'visible') continue;
      const qr = q.getBoundingClientRect();
      if (r.right <= qr.left + 1 || r.left >= qr.right - 1 || r.bottom <= qr.top + 1 || r.top >= qr.bottom - 1) skjult = true;
    }
    const desc = el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + (el.className&&typeof el.className==='string'?('.'+el.className.trim().split(/\\s+/).slice(0,2).join('.')):'');
    return { desc, visible, skjult, iPanel: !!el.closest('.nav-panel'), focusVisible, color:cs.outlineColor, width:cs.outlineWidth, offset:cs.outlineOffset, style:cs.outlineStyle, clippedBy };
  })()`;
}

const browser = await chromium.launch();
const summary = [];
for (const pg of PAGES) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport:{ width:w, height:900 }, deviceScaleFactor:2 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    const cerr = []; page.on('console', m => { if (m.type()==='error') cerr.push(m.text()); });
    // kom-i-gang/index gjør API-kall — stub tomt så konsollen er ren
    await ctx.route('**/api/**', route => route.fulfill({ status:200, contentType:'application/json', body:'{}' }));
    await page.goto(`http://localhost:${PORT}/no/${pg}.html`, { waitUntil:'domcontentloaded' });
    await page.waitForTimeout(600);
    // .btn har transition:all .2s → outline-color faner fra currentColor (hvit) til blå over 200ms.
    // Vi måler den SATTE ringen (det brukeren ser når fokus står), ikke fade-mellomtrinnet.
    await page.addStyleTag({ content: '*{transition-duration:0s!important;animation-duration:0s!important}' });

    const seen = new Set();
    const focusRows = [];
    let shots = 0;
    // Vent til det fokuserte elementet står stille: karusellen på index sentrerer et kort som får fokus med glatt
    // scroll (scrollTo behavior:smooth er ikke en CSS-transition og slås ikke av over). Måler vi midt i glidningen,
    // ser ringen klippet ut selv om den står fritt når scrollen er ferdig.
    const ventStille = async () => { let forrige = '';
      for (let k = 0; k < 12; k++) { const n = await page.evaluate(() => { const a = document.activeElement; if (!a) return ''; const r = a.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); });
        if (n === forrige) return; forrige = n; await page.waitForTimeout(80); } };
    let usynligeStopp = 0;
    const usynligeListe = [];
    for (let i=0; i<40; i++) {
      await page.keyboard.press('Tab');
      await ventStille();
      const m = await page.evaluate(measureActive());
      if (m && m.skjult) { usynligeStopp++; usynligeListe.push(m.desc); }
      if (!m) continue;
      const key = m.desc;
      if (seen.has(key)) { if (seen.size>3 && i>15) break; continue; }
      seen.add(key);
      focusRows.push(m);
      if (m.visible && shots<3) {
        await page.screenshot({ path:`${OUT}/fokus-${pg}-${w}-${shots+1}.png`, fullPage:false });
        shots++;
      }
    }
    // Museklikk-test: ekte klikk på første synlige knapp/lenke → skal IKKE gi :focus-visible
    let mouseNoRing = 'n/a';
    const target = await page.$('button, a[href]');
    if (target) {
      await target.click({ position:{ x:4, y:4 } }).catch(()=>{});
      const fv = await page.evaluate(() => { const el=document.activeElement; return !!(el && el.matches && el.matches(':focus-visible')); });
      mouseNoRing = fv ? 'RING (feil)' : 'ingen ring';
    }

    // Åpen mobilmeny: lenkene SKAL nås med Tab når menyen er åpen (lukket = utilgjengelig, åpen = tilgjengelig).
    let menyApen = 'n/a';
    if (w <= 375 && await page.$('#nav-burger')) {
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); scrollTo(0, 0); });
      await page.click('#nav-burger'); await page.waitForTimeout(350);
      let naadd = 0;
      for (let k = 0; k < 10; k++) { await page.keyboard.press('Tab');
        const m = await page.evaluate(measureActive()); if (m && m.iPanel && !m.skjult) naadd++; }
      menyApen = naadd > 0 ? `${naadd} lenker nås` : 'INGEN nås';
      await page.click('#nav-burger'); await page.waitForTimeout(350);
    }
    const visRows = focusRows.filter(r => r.visible);
    const isFormField = r => /^(input|select|textarea)/.test(r.desc);
    const wrongColor = visRows.filter(r => r.focusVisible && r.color!==WANT_COLOR && r.style!=='none');
    // «utenRing» som betyr noe: a/button/[tabindex] uten ring. Inputs/select/textarea bruker border-fokus (forventet).
    const noRing = visRows.filter(r => !isFormField(r) && (!r.focusVisible || r.style==='none' || r.width==='0px'));
    const clipped = visRows.filter(r => r.clippedBy);
    if (wrongColor.length) console.log(`  [${pg} @${w}] FEIL FARGE:`, wrongColor.map(c=>`${c.desc} color=${c.color} style=${c.style}`).join(' | '));
    summary.push({
      side:pg, bredde:w,
      fokuserbare:visRows.length,
      feilFarge: wrongColor.length,
      utenRing: noRing.length,
      klippet: clipped.length,
      usynligeStopp,
      menyApen,
      museIngenRing: mouseNoRing,
      jsfeil: errs.length,
      konsollfeil: cerr.length,
    });
    if (clipped.length) console.log(`  [${pg} @${w}] KLIPPET:`, clipped.map(c=>`${c.desc} <- ${c.clippedBy.sel}`).join(' | '));
    if (noRing.length) console.log(`  [${pg} @${w}] UTEN RING:`, noRing.map(c=>`${c.desc}(${c.style}/${c.width})`).join(' | '));
    if (usynligeStopp) console.log(`  [${pg} @${w}] USYNLIGE TAB-STOPP:`, usynligeListe.join(' | '));
    if (errs.length) console.log(`  [${pg} @${w}] JSFEIL:`, errs.join('; '));
    await ctx.close();
  }
}
console.table(summary);
const ok = summary.every(r => r.feilFarge===0 && r.klippet===0 && r.jsfeil===0 && r.museIngenRing!=='RING (feil)');
sjekk(ok, '\nAlle synlige fokuserbare: blå ring, ingen klipping, mus gir ingen ring, 0 JS-feil');
sjekk(summary.every(r => r.usynligeStopp === 0), 'Tab hopper aldri til en usynlig lenke (lukket meny, kort utenfor sporet)',
  summary.filter(r => r.usynligeStopp).map(r => `${r.side}@${r.bredde}=${r.usynligeStopp}`).join(' '));
sjekk(summary.every(r => r.menyApen === 'n/a' || r.menyApen !== 'INGEN nås'), 'Åpen mobilmeny: lenkene nås med Tab (320/375)',
  summary.filter(r => r.menyApen === 'INGEN nås').map(r => `${r.side}@${r.bredde}`).join(' '));
await browser.close(); server.close();
ferdig();   // minst én NEI -> exit 1 (fixtures/sjekk.mjs)
