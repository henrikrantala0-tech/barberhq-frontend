// tools/render/funksjoner-v2.mjs — funksjoner.html: «Din egen side» i v2 + tomrommene + CTA-en som vokser (18.11.2026).
//
// Vakter (exit 1 ved avvik), på 320 / 375 / 1280:
//   1. Scenen: fire steg Profil → Utseende → Bilder → Kontakt. I midten av hvert steg er akkurat det steget synlig
//      (opacity 1, de andre 0), riktig stegknapp aktiv, godkjent stegtekst, begge bildene lastet (780 px) og HELE
//      pinnen innenfor synsfeltet under nav-en (ingenting klippes). Ingen v1-ord på siden (layoutnavn, stiler, paletter …).
//   2. Tomrom: avstanden fra «Din egen side» til første innhold under (≤ 24 px), og fra sist synlige innhold i scenen til
//      «Klar for din egen side?» (= CTA-ens toppavstand, ≤ 64 px). Tomrommet under «Få kunder tilbake» måles og skrives ut
//      (resten er den tomme bunnen i Kjernefunksjoner-pinnen — se CSS-kommentaren ved .des-scene).
//   3. CTA: skala 0,85 når toppen når bunnen av synsfeltet, 1 når seksjonen står midt i skjermen, aldri synkende på veien,
//      bare transform/opacity (ingen layout-endring: seksjonens høyde/plassering uendret under veksten). Knappen 17,5 px.
//   4. Reduced-motion: ingen pin, alle fire stegene synlige under hverandre, CTA i full størrelse uten transform.
// Skjermbilder → .render-ut/funksjoner-v2/: steg 1–4 @320/375, CTA i sluttstørrelse @320/375, + 1280-oversikt.
// Ingen request forlater localhost bortsett fra GSAP/fonter/ikoner fra CDN; alt annet aborteres.
//   node tools/render/funksjoner-v2.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/funksjoner-v2');
fs.rmSync(OUT, { recursive:true, force:true }); fs.mkdirSync(OUT, { recursive:true });
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.mp4':'video/mp4' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/no/funksjoner.html`;
const TEKST = [
  'Spesialitet, adresse og en kort beskrivelse. Mer om deg havner i en egen Om-fane.',
  'Lys eller mørk bakgrunn. Blå, gull, rød eller din egen farge. Seks skrifter til sjappenavnet.',
  'Portrett eller logo og opptil 10 bilder av arbeidet ditt. Valgfritt, siden er ferdig uten.',
  'Instagram, TikTok og Snapchat på siden. Nummeret ditt ser kunden bare i bookingbekreftelsen.',
];
const STEG = ['Profil', 'Utseende', 'Bilder', 'Kontakt'];
const V1_ORD = /16\s?777\s?216|Showcase|\bDirekte\b|\bHero\b|Klassisk|Signatur|\bModerne\b|Kraftig|\bLime\b|Lagre design|Lagre profil|Lagre endringer/;

const browser = await chromium.launch();
const sjekker = []; const sjekk = (navn, ok, detalj='') => sjekker.push({ navn, ok:!!ok, detalj });
const bilder = [];

async function aapne({ bredde, reduce = false }) {
  const hoyde = bredde <= 320 ? 568 : bredde < 700 ? 812 : 900;
  const ctx = await browser.newContext({ viewport:{ width:bredde, height:hoyde }, deviceScaleFactor:2, reducedMotion: reduce ? 'reduce' : 'no-preference',
    ...(bredde < 700 ? { isMobile:true, hasTouch:true } : {}) });
  const page = await ctx.newPage(); const errs = [], ute = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.hostname === 'localhost' || /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return r.fallback();
    ute.push(r.request().method() + ' ' + u.href); return r.abort(); });   // avbrutt = nådde aldri nettet
  await page.goto(URL_, { waitUntil:'networkidle' });
  // Scroll gjennom siden så pin-spacerne og lazy-bildene er på plass, og tilbake.
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 300) { await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(12); }
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(250);
  return { ctx, page, errs, ute, hoyde };
}
const pinInfo = page => page.evaluate(() => { const sp = [...document.querySelectorAll('.pin-spacer')].find(s => s.querySelector('#desPin'));
  if (!sp) return null; const st = ScrollTrigger.getAll().find(s => s.pin && s.pin.id === 'desPin'); return { start: st.start, end: st.end }; });
// Første synlige innhold under et element / sist synlige innhold over et element (blad-elementer, klipp og opacity tatt med).
const SYNLIG = `(() => {
  const op = e => { let o = 1; for (let x = e; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x); o *= +c.opacity; if (c.visibility==='hidden'||c.display==='none') return 0; } return o; };
  const klipp = e => { const r = e.getBoundingClientRect(); let t = r.top, b = r.bottom;
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const c = getComputedStyle(x);
      if (c.overflowY !== 'visible' || c.overflowX !== 'visible') { const p = x.getBoundingClientRect(); t = Math.max(t, p.top); b = Math.min(b, p.bottom); } }
    return { t, b, w: r.width }; };
  return [...document.querySelectorAll('main *, section *, .foot *')].filter(e => !e.children.length || e.tagName === 'IMG' || e.tagName === 'svg')
    .map(e => ({ e, ...klipp(e) })).filter(x => x.w && x.b > x.t && op(x.e) > .05 && x.b > 0 && x.t < innerHeight); })()`;

for (const bredde of [320, 375, 1280]) {
  const { ctx, page, errs, ute, hoyde } = await aapne({ bredde });
  const tag = String(bredde);
  const pin = await pinInfo(page);
  sjekk(`${tag}: scenen er pinnet`, pin && pin.end > pin.start, JSON.stringify(pin));
  const sideTekst = await page.evaluate(() => document.body.innerText);
  sjekk(`${tag}: ingen v1-ord på siden`, !V1_ORD.test(sideTekst), (sideTekst.match(V1_ORD) || [''])[0]);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(y => scrollTo(0, y), Math.round(pin.start + (pin.end - pin.start) * (i*100 + 50) / 400)); await page.waitForTimeout(250);
    const m = await page.evaluate(i => {
      const segs = [...document.querySelectorAll('#dineegenside .des-seg')].map(s => +getComputedStyle(s).opacity);
      const seg = document.querySelectorAll('#dineegenside .des-seg')[i];
      const aktiv = [...document.querySelectorAll('#dineegenside .des-step-btn')].filter(b => b.classList.contains('on')).map(b => b.textContent);
      const pinR = document.getElementById('desPin').getBoundingClientRect(), navH = document.querySelector('.nav').getBoundingClientRect().height;
      const imgs = [...seg.querySelectorAll('img')].map(im => ({ ok: im.complete && im.naturalWidth === 780, src: im.getAttribute('src') }));
      return { segs, aktiv, tekst: seg.querySelector('.des-text p').textContent, imgs, pinTop: Math.round(pinR.top), pinBunn: Math.round(pinR.bottom), navH: Math.round(navH), vh: innerHeight,
        of: document.documentElement.scrollWidth - innerWidth };
    }, i);
    sjekk(`${tag} steg ${i+1}: bare «${STEG[i]}» synlig, riktig knapp aktiv`, m.segs.every((o, j) => j === i ? o > .99 : o < .01) && m.aktiv.join() === STEG[i], JSON.stringify({ s:m.segs, a:m.aktiv }));
    sjekk(`${tag} steg ${i+1}: godkjent tekst`, m.tekst === TEKST[i], m.tekst);
    sjekk(`${tag} steg ${i+1}: begge bildene lastet (780 px)`, m.imgs.length === 2 && m.imgs.every(x => x.ok), JSON.stringify(m.imgs));
    sjekk(`${tag} steg ${i+1}: hele pinnen i synsfeltet under nav-en, ingen overflow`, m.pinTop >= m.navH - 1 && m.pinBunn <= m.vh + 1 && m.of <= 0, JSON.stringify({ t:m.pinTop, b:m.pinBunn, nav:m.navH, vh:m.vh, of:m.of }));
    if (bredde !== 1280) { const fil = path.join(OUT, `steg-${i+1}-${STEG[i].toLowerCase()}-${bredde}.png`); await page.screenshot({ path:fil }); bilder.push(fil); }
    else if (i === 1) { const fil = path.join(OUT, `steg-2-utseende-1280.png`); await page.screenshot({ path:fil }); bilder.push(fil); }
  }
  // Tomrom under tittelen: fra «Din egen side» til første synlige innhold under (midt i steg 1 og i overgangen 1→2).
  for (const [navn, t] of [['steg 1', 50], ['overgang 1→2', 100]]) {
    await page.evaluate(y => scrollTo(0, y), Math.round(pin.start + (pin.end - pin.start) * t / 400)); await page.waitForTimeout(250);
    const gap = await page.evaluate(SYNLIG_ => { const h2 = document.querySelector('#dineegenside .des-h2').getBoundingClientRect().bottom;
      const neste = eval(SYNLIG_).filter(x => x.t >= h2 - 1).map(x => x.t); return Math.round(Math.min(...neste) - h2); }, SYNLIG);
    sjekk(`${tag}: under «Din egen side» (${navn}) ≤ 24 px tomt`, gap <= 24, gap + ' px');
  }
  // Tomrom over CTA-en: sist synlige innhold i scenen → CTA-tittelen.
  { const ctaTop = await page.evaluate(() => document.querySelector('#finalCta h2').getBoundingClientRect().top + scrollY);
    await page.evaluate(y => scrollTo(0, y), Math.round(ctaTop - hoyde + 120)); await page.waitForTimeout(300);
    const g = await page.evaluate(SYNLIG_ => { const h2 = document.querySelector('#finalCta h2').getBoundingClientRect().top;
      const over = eval(SYNLIG_).filter(x => x.b <= h2 + 1 && !x.e.closest('#finalCta')).map(x => x.b);
      return { gap: Math.round(h2 - Math.max(...over)), pad: parseFloat(getComputedStyle(document.getElementById('finalCta')).paddingTop) }; }, SYNLIG);
    // Tillatt: CTA-ens egen toppavstand (vanlig seksjonsavstand) + scenens bunnpolstring + overskriftens linjeavstand (≤ 16 px).
    sjekk(`${tag}: over «Klar for din egen side?» = vanlig seksjonsavstand (${g.pad} px + ≤ 16)`, g.gap <= g.pad + 16, g.gap + ' px'); }
  // Tomrom under «Få kunder tilbake» (Kjernefunksjoner-pinnen er urørt — måles og skrives ut, ingen terskel).
  { const ks = await page.evaluate(() => { const st = ScrollTrigger.getAll().find(s => s.pin && s.pin.id === 'ksPin'); return st ? st.end : null; });
    // Tittelens posisjon FØR pinnen (målt fra toppen — etter pinnen står den pinnede boksen flyttet til sluttposisjonen).
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
    const desH2 = await page.evaluate(() => document.querySelector('#dineegenside .des-h2').getBoundingClientRect().top + scrollY);
    await page.evaluate(y => scrollTo(0, y), Math.round(Math.max(ks, desH2 - hoyde + 120))); await page.waitForTimeout(300);
    const gap = await page.evaluate(SYNLIG_ => { const h2 = document.querySelector('#dineegenside .des-h2').getBoundingClientRect().top;
      const over = eval(SYNLIG_).filter(x => x.b <= h2 + 1 && !x.e.closest('#dineegenside')).map(x => x.b); return over.length ? Math.round(h2 - Math.max(...over)) : null; }, SYNLIG);
    console.log(`  ${tag}: under «Få kunder tilbake» → «Din egen side»: ${gap} px`); }
  // CTA: skala gjennom innscrollingen
  { const g = await page.evaluate(() => { const r = document.getElementById('finalCta').getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, H: document.documentElement.scrollHeight }; });
    const fra = g.top - hoyde, til = Math.min(g.top + g.h/2 - hoyde/2, g.H - hoyde);
    const skala = [], layout = [];
    for (let k = 0; k <= 10; k++) { await page.evaluate(y => scrollTo(0, y), Math.round(fra + (til - fra) * k / 10)); await page.waitForTimeout(80);
      const m = await page.evaluate(() => { const inn = document.getElementById('finalCtaInner'), c = getComputedStyle(inn); const mx = c.transform === 'none' ? 1 : new DOMMatrix(c.transform).a;
        const s = document.getElementById('finalCta').getBoundingClientRect(); return { s: mx, op: +c.opacity, secH: Math.round(s.height), innH: inn.offsetHeight }; });
      skala.push(+m.s.toFixed(3)); layout.push(m.secH + '/' + m.innH); }
    sjekk(`${tag} CTA: 0,85 ved inngang → 1 midt i skjermen`, Math.abs(skala[0] - .85) < .01 && Math.abs(skala[10] - 1) < .002, skala.join(' '));
    sjekk(`${tag} CTA: vokser jevnt (aldri synkende)`, skala.every((s, k) => k === 0 || s >= skala[k-1] - .0005), skala.join(' '));
    sjekk(`${tag} CTA: ingen layout-endring under veksten`, new Set(layout).size === 1, [...new Set(layout)].join(' | '));
    const btn = await page.evaluate(() => getComputedStyle(document.querySelector('#finalCta .btn')).fontSize);
    sjekk(`${tag} CTA: knappen 17,5 px`, btn === '17.5px', btn);
    if (bredde !== 1280) { await page.waitForTimeout(150); const fil = path.join(OUT, `cta-slutt-${bredde}.png`); await page.screenshot({ path:fil }); bilder.push(fil); } }
  // Alt utenom localhost/CDN er AVBRUTT (nådde aldri nettet). Vakt: ingen skrivende forsøk i det hele tatt.
  sjekk(`${tag}: ingen pageerror, ingen skrivende request`, errs.length === 0 && ute.every(u => u.startsWith('GET ')), errs.join('|').slice(0,120) + ' ' + ute.filter(u => !u.startsWith('GET ')).join(','));
  if (ute.length) console.log(`  ${tag}: avbrutt (nådde ikke nettet): ${[...new Set(ute)].join(', ')}`);
  await ctx.close();
}

// Reduced-motion
for (const bredde of [375]) {
  const { ctx, page, errs } = await aapne({ bredde, reduce:true });
  const m = await page.evaluate(() => ({ pinnet: !!document.querySelector('.pin-spacer #desPin'), red: document.getElementById('dineegenside').classList.contains('des-reduced'),
    segs: [...document.querySelectorAll('#dineegenside .des-seg')].map(s => +getComputedStyle(s).opacity),
    synlig: getComputedStyle(document.getElementById('dineegenside')).display, cta: getComputedStyle(document.getElementById('finalCtaInner')).transform }));
  sjekk(`reduced ${bredde}: ingen pin, alle fire stegene synlige`, !m.pinnet && m.red && m.synlig === 'block' && m.segs.length === 4 && m.segs.every(o => o === 1), JSON.stringify(m));
  sjekk(`reduced ${bredde}: CTA i full størrelse uten transform`, m.cta === 'none', m.cta);
  sjekk(`reduced ${bredde}: ingen pageerror`, errs.length === 0, errs.join('|'));
  await ctx.close();
}

await browser.close(); server.close();
const feil = sjekker.filter(s => !s.ok);
for (const s of sjekker) if (!s.ok) console.log('✗ ' + s.navn + '  — ' + s.detalj);
console.log('\nBilder:'); bilder.forEach(b => console.log(b));
console.log(`\n${sjekker.length - feil.length}/${sjekker.length} sjekker grønne.`);
process.exit(feil.length ? 1 : 0);
