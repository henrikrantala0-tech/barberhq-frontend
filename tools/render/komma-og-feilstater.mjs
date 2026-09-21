// tools/render/komma-og-feilstater.mjs — regresjonstest for input-robusthet + feilstater.
// Dekker fire funn fra bug-runden 21.09:
//   H-1  onboarding-pris leser komma («45,5»→46, «1 500»→1500, negativ→synlig feil)
//   L-12 varighet leser komma begge steder; ugyldig/tom → SYNLIG feil, ikke stille 30
//   M-6  arbeidstider: GET-feil → feilstate + «Prøv igjen», Lagre disabled, ALDRI oppdiktede tider
//   M-8  Oversikt: hard nettverksfeil (abort) på /stats+/bookings → feilstate + retry, ikke evig «Laster …»
//   L-3  pris/min fra backend koerses til tall + esc → ingen attributt-injeksjon
//
//   node tools/render/komma-og-feilstater.mjs
//
// Exit 1 ved regresjon. Skjermbilder → .render-ut/kf-*.png (gitignorert).

import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;
const URLB = `http://localhost:${PORT}/no`;

const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik', shop:'Grand',
  address:'', tagline:'', bio:'', booking_horizon_days:28 };
const HOURS_OK = [ {weekday:1,is_closed:false,open_time:'10:00',close_time:'18:00',breaks:[]} ];

const browser = await chromium.launch();
const rapport = [];
const feil = [];      // menneskelesbare regresjoner
function sjekk(navn, ok, detalj){ rapport.push({ sjekk:navn, ok: ok?'JA':'NEI', detalj }); if(!ok) feil.push(navn); }

// ── ONBOARDING (H-1 + L-12): collectServices() leser komma og gir synlig feil ────────────
{
  const page = await browser.newPage({ viewport:{width:390,height:900}, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${URLB}/kom-i-gang.html`, { waitUntil:'domcontentloaded' });
  const t = await page.evaluate(() => {
    const row = document.querySelector('.svc-row');
    const nm = row.querySelector('.svc-name'), pr = row.querySelector('.svc-price'), mn = row.querySelector('.svc-min');
    const set = (n,p,m)=>{ nm.value=n; pr.value=p; mn.value=m; };
    const o = {};
    set('Klipp','45,5','30');  let r=collectServices(); o.komma  = r.list[0]&&r.list[0].price===46 && !r.err;
    set('Klipp','1 500','30'); r=collectServices();     o.space  = r.list[0]&&r.list[0].price===1500;
    set('Klipp','-50','30');   r=collectServices();     o.neg    = r.list.length===0 && r.err && r.err.el===pr;
    set('Klipp','300','');     r=collectServices();     o.tomMin = r.list.length===0 && r.err && r.err.el===mn;
    set('Klipp','300','abc');  r=collectServices();     o.ugyMin = r.list.length===0 && r.err && r.err.el===mn;
    set('Klipp','300','1,5');  r=collectServices();     o.kMin   = r.list[0]&&r.list[0].min===2 && !r.err;
    set('Klipp','300','30');   r=collectServices();     o.ok     = r.list.length===1 && !r.err;
    return o;
  });
  const jsfeil = errs.length?errs.join('; '):'ingen';
  sjekk('H-1 onboarding komma-pris «45,5»→46', t.komma, jsfeil);
  sjekk('H-1 onboarding «1 500»→1500', t.space);
  sjekk('H-1 onboarding negativ pris → synlig feil', t.neg);
  sjekk('L-12 onboarding tom varighet → synlig feil (ikke stille 30)', t.tomMin);
  sjekk('L-12 onboarding ugyldig varighet → synlig feil', t.ugyMin);
  sjekk('L-12 onboarding komma-varighet «1,5»→2', t.kMin);
  sjekk('onboarding gyldig rad → ingen feil', t.ok);
  sjekk('onboarding ingen JS-feil', jsfeil==='ingen', jsfeil);
  await page.close();
}

// ── DASHBOARD-harness med konfigurerbar ruter ────────────────────────────────────────────
function mkRouter(cfg) {
  return route => {
    const p = new URL(route.request().url()).pathname;
    if (cfg.abort && cfg.abort.some(rx => rx.test(p))) return route.abort();
    if (cfg.fail  && cfg.fail.some(rx => rx.test(p)))  return route.fulfill({ status:500, contentType:'application/json', body:'{"error":"x"}' });
    const json = obj => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(obj) });
    if (p === '/api/dashboard/profile')  return json(PROFILE);
    if (p === '/api/dashboard/services') return json(cfg.services || { hoved:[{name:'Klipp',price:300,min:30}], tillegg:[] });
    if (p === '/api/dashboard/hours')    return json(HOURS_OK);
    if (p === '/api/dashboard/billing/status') return json({ subscription_status:'trialing', effective_plan:'vekst', plan:null });
    const listeAktig = /images|bookings|recent|hours|stats|attribution|winback|referrals|rebooking|sms-logg|momentum/.test(p);
    return json(listeAktig ? [] : {});
  };
}
async function dash(cfg, fn) {
  const page = await browser.newPage({ viewport:{width:390,height:1200}, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const cur = { ...cfg };
  await page.route('**/api/**', r => mkRouter(cur)(r));
  await page.goto(`${URLB}/dashboard.html`, { waitUntil:'networkidle' });
  const out = await fn(page, cur);
  out.jsfeil = errs.length?errs.join('; '):'ingen';
  await page.close();
  return out;
}

// ── L-12 dashboard: komma + tom varighet → rød .svc-min + flagg + Lagre disabled ─────────
{
  const r = await dash({}, async (page) => {
    await page.evaluate(() => switchPanel('tjenester'));
    await page.waitForTimeout(600);
    await page.fill('#hovedList .svc-row-h:nth-of-type(1) .svc-pris', '45,5'); await page.waitForTimeout(80);
    await page.fill('#hovedList .svc-row-h:nth-of-type(1) .svc-min', '30,5'); await page.waitForTimeout(80);
    const ok = await page.evaluate(() => ({ price:hoved[0].price, min:hoved[0].min, save:document.querySelector('#saveSvc').disabled }));
    await page.fill('#hovedList .svc-row-h:nth-of-type(1) .svc-min', ''); await page.waitForTimeout(80);
    await page.screenshot({ path:`${OUT}/kf-l12-dash-tom-varighet.png`, clip:{x:0,y:0,width:390,height:360} });
    const tom = await page.evaluate(() => {
      const row = document.querySelector('#hovedList .svc-row-h:nth-of-type(1)');
      const min = row.querySelector('.svc-min'), flag = row.querySelector('.svc-flag');
      return { rød:min.classList.contains('min-0'), flagg:flag.textContent, vis:!flag.hidden,
        save:document.querySelector('#saveSvc').disabled, err:document.querySelector('#svcErr').textContent };
    });
    return { kommaPris:ok.price===46, kommaMin:ok.min===31, gyldigSave:ok.save===false,
      tomRød:tom.rød, tomFlagg:tom.flagg==='Sett varighet'&&tom.vis, tomSave:tom.save, tomErr:!!tom.err };
  });
  sjekk('L-12 dashboard komma-pris «45,5»→46', r.kommaPris, r.jsfeil);
  sjekk('L-12 dashboard komma-varighet «30,5»→31', r.kommaMin);
  sjekk('L-12 dashboard gyldig → Lagre aktiv', r.gyldigSave);
  sjekk('L-12 dashboard tom varighet → rød .svc-min', r.tomRød);
  sjekk('L-12 dashboard tom varighet → «Sett varighet»-flagg', r.tomFlagg);
  sjekk('L-12 dashboard tom varighet → Lagre disabled + feiltekst', r.tomSave && r.tomErr);
  sjekk('L-12 dashboard ingen JS-feil', r.jsfeil==='ingen', r.jsfeil);
}

// ── L-3: ondsinnet pris/min-streng fra backend → tall + esc, ingen attributt-injeksjon ───
{
  const r = await dash({ services:{ hoved:[{ name:'Klipp', price:'" onfocus=alert(1) x="', min:'"><img src=x onerror=alert(2)>' }], tillegg:[] } }, async (page) => {
    await page.evaluate(() => switchPanel('tjenester'));
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const row = document.querySelector('#hovedList .svc-row-h:nth-of-type(1)');
      return { prisVal:row.querySelector('.svc-pris').value, minVal:row.querySelector('.svc-min').value,
        onfocus:row.innerHTML.includes('onfocus'), onerror:row.innerHTML.includes('onerror'),
        arrPris:hoved[0].price, arrMin:hoved[0].min };
    });
  });
  sjekk('L-3 ond pris-streng → value «0», ingen onfocus', r.prisVal==='0' && !r.onfocus, r.jsfeil);
  sjekk('L-3 ond min-streng → value «0», ingen onerror', r.minVal==='0' && !r.onerror);
  sjekk('L-3 arr koerset til tall (0)', r.arrPris===0 && r.arrMin===0);
  sjekk('L-3 ingen JS-feil', r.jsfeil==='ingen', r.jsfeil);
}

// ── M-6: /hours GET-feil → feilstate + retry, ingen mock-dager, Lagre disabled; retry OK ──
{
  const r = await dash({ fail:[/\/api\/dashboard\/hours$/] }, async (page, cur) => {
    await page.evaluate(() => switchPanel('tjenester'));
    await page.waitForTimeout(600);
    await page.screenshot({ path:`${OUT}/kf-m6-hours-feil.png`, clip:{x:0,y:0,width:390,height:420} });
    const f = await page.evaluate(() => { const el=document.querySelector('#hoursList');
      return { txt:el.textContent, retry:!!el.querySelector('.retry-lenke'),
        dager:el.querySelectorAll('.day-wrap').length, save:document.querySelector('#saveHours').disabled }; });
    cur.fail = [];
    await page.click('#hoursList .retry-lenke'); await page.waitForTimeout(500);
    const ok = await page.evaluate(() => ({ dager:document.querySelectorAll('#hoursList .day-wrap').length,
      save:document.querySelector('#saveHours').disabled }));
    return { melding:f.txt.includes('Klarte ikke å laste arbeidstidene'), retry:f.retry,
      ingenMock:f.dager===0, feilSave:f.save, retryDager:ok.dager>0, retrySave:ok.save===false };
  });
  sjekk('M-6 hours-feil → melding «Klarte ikke å laste arbeidstidene»', r.melding, r.jsfeil);
  sjekk('M-6 hours-feil → «Prøv igjen»-knapp', r.retry);
  sjekk('M-6 hours-feil → INGEN oppdiktede dager', r.ingenMock);
  sjekk('M-6 hours-feil → «Lagre» disabled', r.feilSave);
  sjekk('M-6 retry lykkes → dager render + «Lagre» aktiv', r.retryDager && r.retrySave);
  sjekk('M-6 ingen JS-feil', r.jsfeil==='ingen', r.jsfeil);
}

// ── M-8: hard nettverksfeil (abort) på /stats+/bookings → feilstate + retry ──────────────
{
  const r = await dash({ abort:[/\/api\/dashboard\/stats$/, /\/api\/dashboard\/bookings$/] }, async (page, cur) => {
    await page.waitForTimeout(800);  // loadOversikt kjører på init
    await page.screenshot({ path:`${OUT}/kf-m8-oversikt-feil.png`, clip:{x:0,y:0,width:390,height:520} });
    const f = await page.evaluate(() => ({
      stats:document.querySelector('#stats').textContent, statsRetry:!!document.querySelector('#stats .retry-lenke'),
      up:document.querySelector('#upcomingList').textContent, upRetry:!!document.querySelector('#upcomingList .retry-lenke') }));
    cur.abort = [];
    await page.click('#stats .retry-lenke'); await page.waitForTimeout(600);
    const ok = await page.evaluate(() => document.querySelector('#stats').textContent.slice(0,40));
    return { statsMelding:f.stats.includes('Klarte ikke å laste tallene'), statsRetry:f.statsRetry,
      statsIkkeLaster:!f.stats.includes('Laster'), upMelding:f.up.includes('Klarte ikke å laste bookinger'),
      upRetry:f.upRetry, retryOk:!ok.includes('Klarte ikke') };
  });
  sjekk('M-8 #stats abort → melding «Klarte ikke å laste tallene»', r.statsMelding, r.jsfeil);
  sjekk('M-8 #stats abort → «Prøv igjen» + ikke «Laster»', r.statsRetry && r.statsIkkeLaster);
  sjekk('M-8 #upcomingList abort → melding + «Prøv igjen»', r.upMelding && r.upRetry);
  sjekk('M-8 retry lykkes → innhold tilbake', r.retryOk);
  sjekk('M-8 ingen JS-feil', r.jsfeil==='ingen', r.jsfeil);
}

await browser.close(); server.close();
console.table(rapport);
const alleOk = feil.length===0;
console.log('\nkomma-og-feilstater:', alleOk ? 'ALLE OK ✓' : `REGRESJON i ${feil.length}: ${feil.join(' | ')}`);
process.exit(alleOk ? 0 : 1);
