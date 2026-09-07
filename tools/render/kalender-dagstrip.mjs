// tools/render/kalender-dagstrip.mjs — kalenderens dagvelger (.cal-daystrip) på mobil.
// ROTÅRSAK-VERIFISERING: under mobilbredde (≤760) skal strippen starte på I DAG (helt til venstre),
// med kommende dager til høyre — ikke 14 fortids-chips foran som dytter i dag mot høyre.
// scrollIntoView() kan ikke redde det (renderCal kjøres mens overlayet er skjult), så VENSTREKANTEN
// måles: første chip = i dag på mobil. Desktop (>760) skal være URØRT (første chip = i dag−14).
//
//   node tools/render/kalender-dagstrip.mjs
//
// Skjermbilder → .render-ut/kal-dagstrip-*.png (gitignorert). Åpne: powershell -File tools/render/vis.ps1 kal-dagstrip-*

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) { if (/^kal-dagstrip-.*\.png$/.test(f)) { try { fs.rmSync(path.join(OUT, f)); } catch(e){} } }

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand Barber',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const BILLING = { subscription_status:'trialing', page_status:'live', plan:null, effective_plan:'vekst',
  effective_plan_grunn:'trial_vindu', trial_days_left:30, nedtaking_dager_igjen:37, myk_periode:false, needs_attention:false, attention_grunn:null };
// Bookinger spredt: én i fortid (i dag−2), i dag, +1, +3, +6. Timer: alle dager åpne 09–17.
const at = (dagerFra, hh) => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+dagerFra); d.setHours(hh,0,0,0); return d.toISOString(); };
const BOOKINGS = [
  { id:1, name:'Ola Nordmann',  service:'Herreklipp', start:at(-2,10), end:at(-2,10.5), status:'fullfort' },
  { id:2, name:'Kari Nordmann', service:'Skin fade',  start:at(0,11),  end:at(0,11.5),  status:'booket' },
  { id:3, name:'Amir Haddad',   service:'Klipp',      start:at(0,13),  end:at(0,13.5),  status:'booket' },
  { id:4, name:'Nina Dahl',     service:'Fade',       start:at(1,9),   end:at(1,9.5),   status:'booket' },
  { id:5, name:'Lars Vik',      service:'Klipp',      start:at(3,12),  end:at(3,12.5),  status:'booket' },
  { id:6, name:'Sara Ali',      service:'Skjegg',     start:at(6,14),  end:at(6,14.5),  status:'booket' },
];
const HOURS = [0,1,2,3,4,5,6].map(w => ({ weekday:w, is_closed:false, open_time:'09:00', close_time:'17:00' }));

function router() {
  return route => {
    const p = new URL(route.request().url()).pathname;
    const j = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
    if (p === '/api/dashboard/profile')        return j(PROFILE);
    if (p === '/api/dashboard/billing/status') return j(BILLING);
    if (p === '/api/dashboard/bookings')       return j(BOOKINGS);
    if (p === '/api/dashboard/hours')          return j(HOURS);
    if (p === '/api/dashboard/services')       return j({ hoved:[], tillegg:[] });
    return j(/images|recent|winback|referrals|rebooking|sms-logg|stats|attribution|momentum|loyalty|settings/.test(p) ? [] : {});
  };
}

const SKJUL_BARER = `nav.nav{position:static!important} .bunn-nav{display:none!important} .sjekk-pill-wrap{display:none!important}`;

const browser = await chromium.launch();
const rad = [];
// Mobil: 320/375/402 (skal starte på i dag). Desktop 1280 = kontroll (skal starte på i dag−14, urørt).
for (const bredde of [320, 375, 402, 1280]) {
  for (const tema of ['dark','light']) {
    const mobil = bredde <= 760;
    const page = await browser.newPage({ viewport:{ width:bredde, height:760 }, deviceScaleFactor:2 });
    const errs=[]; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(t => { try { localStorage.setItem('bhq-theme', t); } catch(e){} }, tema);
    await page.route('**/api/**', router());
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
    await page.addStyleTag({ content: SKJUL_BARER });
    await page.waitForTimeout(700);
    await page.evaluate(async () => { await openKalender('today'); });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const key = d => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
      const todayKey = key(new Date());
      const chips = [...document.querySelectorAll('#calDaystrip .cal-chip')];
      const strip = document.querySelector('#calDaystrip');
      const first = chips[0];
      // Hvilken chip er faktisk SYNLIG lengst til venstre (minst left innenfor stripen, ≥ stripens venstrekant)?
      const sl = strip.getBoundingClientRect().left;
      const synlig = chips.map(c => ({ key:+c.dataset.key, today:c.classList.contains('is-today'),
        left: Math.round(c.getBoundingClientRect().left - sl) })).filter(c => c.left > -20 && c.left < strip.clientWidth);
      synlig.sort((a,b)=>a.left-b.left);
      return {
        antall: chips.length,
        forsteKey: first ? +first.dataset.key : null,
        forsteErIDag: first ? first.classList.contains('is-today') : false,
        forsteErFortid: first ? (+first.dataset.key < todayKey) : false,
        venstreSynligErIDag: synlig.length ? synlig[0].today : false,
        venstreSynligLeft: synlig.length ? synlig[0].left : null,
      };
    });
    await page.locator('#calDaystrip').screenshot({ path:`${OUT}/kal-dagstrip-${bredde}-${tema}.png` });
    rad.push({ bredde, tema, mobil, chips:m.antall, forsteErIDag:m.forsteErIDag, forsteErFortid:m.forsteErFortid,
      venstreSynligErIDag:m.venstreSynligErIDag, venstreLeft:m.venstreSynligLeft, jsfeil: errs.length?errs.join('; '):'ingen' });
    await page.close();
  }
}
console.table(rad);
console.log('\nMobil (≤760): forsteErIDag skal være TRUE + venstreSynligErIDag TRUE:',
  rad.filter(r=>r.mobil).every(r=>r.forsteErIDag && r.venstreSynligErIDag) ? 'OK' : 'FEIL');
console.log('Desktop (1280): forsteErFortid skal være TRUE (urørt, starter i dag−14):',
  rad.filter(r=>!r.mobil).every(r=>r.forsteErFortid) ? 'OK' : 'FEIL');
console.log('JS-feil totalt:', rad.filter(r=>r.jsfeil!=='ingen').length);
for (const r of rad) console.log(`  ${OUT}\\kal-dagstrip-${r.bredde}-${r.tema}.png`);

await browser.close(); server.close();
