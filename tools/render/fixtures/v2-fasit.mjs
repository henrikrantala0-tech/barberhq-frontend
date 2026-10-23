// tools/render/fixtures/v2-fasit.mjs — den EKTE v2-bookingsida for klonens demobarber, rendret lokalt
// med backendens egne fyll-funksjoner (fillV2 + fillBookV2). Brukes av bygg-bookingklon-v2.mjs (kilden
// klonen bygges fra) og booking-tilstander.mjs (fasiten klonen sammenlignes mot).
//
// LES-ONLY mot backend-repoet: vi require-r fyll.cjs og leser maler/fonter, skriver ingenting der.
// INGEN nettverk ut: alt serveres av en lokal http-server her (sidene, fontene fra backend/fonts, bildene
// fra site/no/images) og /api/** besvares av mockene under. Kallere skal i tillegg route-blokkere alt
// som ikke er localhost i Playwright, så et glemt endepunkt feiler i stedet for å nå prod.
//
// Demobarberen er den SAMME som klonen alltid har vist: Grand Barber, «Fades og skjeggtrim»,
// Storgata 33, 0184 Oslo, Skinfade 350 / Saksklipp 399 / BarneKlipp 300 + tillegg Skjegg, fredag
// 25. september kl. 11:00, kunden Marcus. v2-standarder: sjappenavn-font jakarta (V2_STANDARD_FONT),
// aksent blå, lys modus.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const BACKEND = process.env.BHQ_BACKEND
  || 'C:/Users/henri/Desktop/barberhq-backend/barberhq-backend';
const SITE = path.resolve(import.meta.dirname, '../../../site');
const require = createRequire(path.join(BACKEND, 'fyll.cjs'));
const fyll = require(path.join(BACKEND, 'fyll.cjs'));

export const SLUG = 'grand-barber';
// «I dag» i demoen: fredag 25. september 2026, før åpning (Oslo). Kallerne fryser klokka hit.
export const DEMO_NAA = new Date('2026-09-25T07:30:00+02:00');
export const DEMO_DATO = '2026-09-25';
export const DEMO_TID = '11:00';
export const DEMO_NAVN = 'Marcus', DEMO_TLF = '900 00 000';
// Samme tider som v1-klonen viste (17 luker).
const TIDER = ['11:00','11:30','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00',
  '18:30','20:00','20:30','21:00','22:30'];
const LUKKET_UKEDAG = 6;   // lørdag stengt, som v1-klonens datostripe (26. sep og 3. okt «closed»)

const SERVICES = [
  { id:'svc-skinfade',  name:'Skinfade',   price_nok:350, minutes:30, kind:'hoved',   is_addon:false },
  { id:'svc-saksklipp', name:'Saksklipp',  price_nok:399, minutes:30, kind:'hoved',   is_addon:false },
  { id:'svc-barn',      name:'BarneKlipp', price_nok:300, minutes:30, kind:'hoved',   is_addon:false },
  { id:'svc-skjegg',    name:'Skjegg',     price_nok:150, minutes:15, kind:'tillegg', is_addon:true  },
].map(s => ({ ...s, price:s.price_nok, min:s.minutes, description:null }));
const HOURS = [1,2,3,4,5,6,0].map(w => ({ weekday:w, is_closed:w===LUKKET_UKEDAG,
  open_time:w===LUKKET_UKEDAG?null:'10:00:00', close_time:w===LUKKET_UKEDAG?null:'18:00:00' }));
const BARBER = {
  slug:SLUG, shop_name:'Grand Barber', display_name:'Grand Barber', address:'Storgata 33, 0184 Oslo',
  language:'no', font:'jakarta', aksent:'blaa', custom_accent:null, color_mode:'lys',
  contact_phone:'91 23 45 23', instagram:'grandbarber', tiktok:'grandbarber', snapchat:'grandbarber',
};
const PAYMENT = ['vipps', 'cash'];
export const BILDER = { portrett:'/images/produkt/portrett.webp',
  galleri:[1,2,3,4].map(i => `/images/produkt/galleri-${i}.webp`) };

function forsideHtml(){
  const tpl = fs.readFileSync(path.join(BACKEND, 'forside.v2.template.html'), 'utf8');
  const order = {
    navn:BARBER.display_name, shop:BARBER.shop_name, adresse:BARBER.address, lang:'no', market:'NO',
    bio:'Fades og skjeggtrim', pitch:'Sitter i sentrum og har klippet siden 2019.',
    instagram:BARBER.instagram, tiktok:BARBER.tiktok, snapchat:BARBER.snapchat, contactPhone:BARBER.contact_phone,
    mode:'lys', aksent:'blaa', customAccent:null, om:'', hours:HOURS, layout:'v2', font:'jakarta',
    services:SERVICES.filter(s=>!s.is_addon), images:BILDER.galleri.map(url=>({url})), heroImage:BILDER.portrett,
  };
  const opts = { bookHref:'/book/'+SLUG, tz:'Europe/Oslo', paymentMethods:PAYMENT, closedWeekdays:[LUKKET_UKEDAG],
    horizonDays:28, preview:false, forhandsvist:false, referral:null, reminderEnabled:false,
    inter:'/fonts/Inter.woff2', fontBase:'/fonts/' };
  let html = fyll.fillV2(tpl, order, opts, SERVICES);
  return html.replace(/\{\{REFERRAL_BANNER\}\}/g, '').replace(/__CSP_NONCE__/g, '');
}
function bookHtml(){
  const tpl = fs.readFileSync(path.join(BACKEND, 'book.v2.template.html'), 'utf8');
  const opts = { inter:'/fonts/Inter.woff2', fontBase:'/fonts/', tz:'Europe/Oslo', services:SERVICES,
    paymentMethods:PAYMENT, closedWeekdays:[LUKKET_UKEDAG], horizonDays:28, referral:null,
    reminderEnabled:false, smsUiEnabled:true, bookingLaast:false, forhandsvist:false };
  return fyll.fillBookV2(tpl, BARBER, opts).replace(/__CSP_NONCE__/g, '');
}

// /api-mockene. Alt besvares lokalt; ingenting når et ekte API.
function api(url, method, body){
  const u = new URL(url, 'http://x');
  const p = u.pathname.replace('/api/barbers/' + SLUG, '');
  if (p === '/days') {
    const days = [];
    for (let d = new Date('2026-09-01T12:00:00Z'); d < new Date('2026-11-01T12:00:00Z'); d.setUTCDate(d.getUTCDate()+1)) {
      const iso = d.toISOString().slice(0,10);
      days.push({ date:iso, status: d.getUTCDay()===LUKKET_UKEDAG ? 'closed' : (iso < DEMO_DATO ? 'past' : 'open') });
    }
    return { days };
  }
  if (p === '/slots') return { is_closed:false, slots:TIDER.map(l => ({ label:l,
    starts_at:`${u.searchParams.get('date')}T${l}:00+02:00`, ends_at:null })) };
  if (p === '/sms-consent-check') return { show_consent:true };
  if (p === '/referral-bonus-check') return { bonus:false };
  if (p === '/new-customer-check') return { referral_eligible:false };
  if (p === '/bookings' && method === 'POST') return { id:'demo', paaminnelse_sendes:false, loyalty:null };
  return null;
}

// Starter serveren. Returnerer { base, close }.
export async function startV2Server(){
  const sider = { ['/' + SLUG]: forsideHtml(), ['/book/' + SLUG]: bookHtml() };
  const MIME = { '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.ttf':'font/ttf' };
  const server = http.createServer((q, r) => {
    const sti = decodeURIComponent(q.url.split('?')[0]);
    if (sider[sti]) { r.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); r.end(sider[sti]); return; }
    if (sti.startsWith('/api/')) {
      let body = ''; q.on('data', c => body += c); q.on('end', () => {
        const svar = api(q.url, q.method, body);
        r.writeHead(svar ? 200 : 404, { 'Content-Type':'application/json' }); r.end(JSON.stringify(svar || { error:'mock mangler' }));
      }); return;
    }
    const fil = sti.startsWith('/fonts/') ? path.join(BACKEND, 'fonts', path.basename(sti))
              : sti.startsWith('/images/') ? path.join(SITE, 'no', sti) : null;
    if (!fil) { r.writeHead(404); r.end(); return; }
    fs.readFile(fil, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(fil)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise(res => server.listen(0, res));
  return { base:`http://localhost:${server.address().port}`, close:() => server.close() };
}

// Én side per tilstand, samme vei en kunde går. Returnerer siden stående i tilstanden.
// tilstand: forside | forside-valgt | dato | tid | skjema | kvittering
export async function gaaTil(page, base, tilstand){
  await page.route(u => !u.href.startsWith(base), r => r.abort());
  await page.clock.install({ time: DEMO_NAA });
  const vent = ms => page.waitForTimeout(ms);
  if (tilstand.startsWith('forside')) {
    await page.goto(`${base}/${SLUG}`, { waitUntil:'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (tilstand === 'forside-valgt') { await page.click('#front-services .service[data-id="svc-skinfade"]'); await vent(500); }
    return;
  }
  await page.goto(`${base}/book/${SLUG}?service=svc-skinfade`, { waitUntil:'networkidle' });
  await page.evaluate(() => document.fonts.ready); await vent(400);
  if (tilstand === 'dato') return;
  await page.click(`.day[data-date="${DEMO_DATO}"]`); await vent(400);
  await page.click(`.time[data-label="${DEMO_TID}"]`); await vent(200);
  if (tilstand === 'tid') return;
  await page.click('#flow-to-details'); await vent(500);
  await page.fill('#flow-cname', DEMO_NAVN); await page.fill('#flow-cphone', DEMO_TLF);
  await page.locator('#flow-cphone').blur(); await vent(500);
  if (tilstand === 'skjema') return;
  await page.click('#flow-sub'); await vent(600);   // POST går til den LOKALE mocken over
}
