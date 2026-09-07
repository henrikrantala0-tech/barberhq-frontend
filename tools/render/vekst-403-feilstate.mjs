// tools/render/vekst-403-feilstate.mjs — 403 (og nettverks-kast) fra de fire Vekst-listene
// (/winback, /referrals, /customers/recent, /loyalty) skal ALDRI gi evig «Laster …» og ALDRI
// en misvisende tom-tilstand («bra jobba» / «ingen vervinger»). Forventet: ærlig feilstate.
//
//   node tools/render/vekst-403-feilstate.mjs
//
// To scenarier:
//   403  = alle fire ruter svarer 403 (Vekst-gaten) → api.* returnerer null → feilstate
//   kast = alle fire ruter route.abort('failed') (fetch rejecter) → try/catch → samme feilstate
//
// Måler at ingen av #wbList/#vervReferrals/#vervSendList/#loyalOversikt inneholder «Laster»,
// at hver viser en «Kunne ikke hente …»-tekst, og at ingen JS-feil kastes ubehandlet.
// Skjermbilder → .render-ut/vekst403-*.png (gitignorert). Åpne: powershell -File tools/render/vis.ps1 vekst403-*

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true,
  name:'Henrik', shop:'Grand Barber', address:'', tagline:'', bio:'', booking_horizon_days:28 };
// Vekst (IKKE basis) → erBasis() falsk → loaderne kjører faktisk fetch (ellers returnerer de tidlig).
const BILLING = { subscription_status:'trialing', page_status:'live',
  plan:null, effective_plan:'vekst', effective_plan_grunn:'trial_vindu',
  trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };

// De fire gatede rutene. settings er IKKE i lista (feiler aldri til null; gir _hentFeilet-objekt).
const GATED = ['/api/dashboard/winback','/api/dashboard/referrals','/api/dashboard/customers/recent','/api/dashboard/loyalty'];

function router(scenario) {
  return route => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    const j = (obj, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')        return j(PROFILE);
    if (p === '/api/dashboard/billing/status') return j(BILLING);
    if (GATED.includes(p)) {
      if (scenario === 'kast') return route.abort('failed');   // fetch() rejecter → api.* kaster → try/catch
      return j({ error:'plan_gated' }, 403);                    // 403-respons → api.* returnerer null
    }
    // Alt annet: nøytralt, så resten av dashbordet ikke bråker.
    const listeAktig = /images|bookings|services|hours|sms-logg|stats|attribution|momentum/.test(p);
    if (p === '/api/dashboard/settings') return j({});
    if (p === '/api/dashboard/attribution') return j({ period:'uke', rebooking:{count:0,revenue:0}, vervet:{count:0,revenue:0}, recovery:{count:0,revenue:0}, total:{count:0,revenue:0} });
    return j(listeAktig ? [] : {});
  };
}

const MAAL = `() => {
  const t = id => (document.querySelector(id)?.textContent || '').trim();
  const laster = id => /Laster/i.test(document.querySelector(id)?.innerHTML || '');
  return {
    wb:     t('#wbList'),          wbLaster:     laster('#wbList'),
    refs:   t('#vervReferrals'),   refsLaster:   laster('#vervReferrals'),
    send:   t('#vervSendList'),    sendLaster:   laster('#vervSendList'),
    loyal:  t('#loyalOversikt'),   loyalLaster:  laster('#loyalOversikt'),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
}`;

const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;
for (const f of fs.readdirSync(OUT)) { if (/^vekst403-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const browser = await chromium.launch();
const rad = [];
for (const scenario of ['403','kast']) {
  for (const tema of ['dark','light']) {
    for (const bredde of [320,375]) {
      const page = await browser.newPage({ viewport:{ width:bredde, height:1000 }, deviceScaleFactor:2 });
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch(e){} }, tema);
      await page.route('**/api/**', router(scenario));
      await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
      await page.addStyleTag({ content: SKJUL_BARER });
      await page.evaluate(() => switchPanel('vekst'));
      await page.waitForTimeout(1200);
      // Åpne alle accordions i Vekst så feilstatene faktisk er synlige i bildet.
      await page.evaluate(() => document.querySelectorAll('#vekst .acc-head').forEach(h => {
        if (h.getAttribute('aria-expanded') !== 'true') h.click();
      }));
      await page.waitForTimeout(400);
      const m = await page.evaluate(eval(MAAL));
      if (bredde === 320) await page.screenshot({ path:`${OUT}/vekst403-${scenario}-${tema}.png`, fullPage:true });
      rad.push({ scenario, tema, bredde,
        laster: [m.wbLaster,m.refsLaster,m.sendLaster,m.loyalLaster].some(Boolean) ? 'JA(!)' : 'nei',
        wb:m.wb.slice(0,40), refs:m.refs.slice(0,40), send:m.send.slice(0,40), loyal:m.loyal.slice(0,40),
        overflow:m.overflow, jsfeil: errs.length ? errs.join('; ') : 'ingen' });
      await page.close();
    }
  }
}
console.table(rad);
console.log('\nEvig «Laster» noe sted (skal være 0):', rad.filter(r=>r.laster!=='nei').length);
console.log('Ubehandlede JS-feil (skal være 0):', rad.filter(r=>r.jsfeil!=='ingen').length);
console.log('Overflow != 0 (skal være 0):', rad.filter(r=>r.overflow!==0).map(r=>`${r.scenario}/${r.tema}/${r.bredde}=${r.overflow}`).join(' ') || 'ingen');

await browser.close(); server.close();
