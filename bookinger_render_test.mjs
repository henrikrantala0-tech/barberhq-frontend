// Regresjonsvakt + render-gate: Kommende + Siste bookinger (Oversikt-fanen).
// Screenshots på 320/375 for visuell godkjenning + assertions som trener
// grupperings-/dayHead-logikken (faste ankere, datering, sortering innad,
// «nå»-splitten mellom seksjonene). Kjør: `node bookinger_render_test.mjs`.
//
// Klokka pinnes til 09:00 i dag (clock.setFixedTime) så «i dag/i morgen»-
// filtrering blir deterministisk uansett når scriptet kjøres.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const DASH = 'file:///C:/Users/henri/Desktop/barberhq-frontend/no/dashboard.html';
const OUT  = 'C:/Users/henri/Desktop/barberhq-frontend/pw-screenshots';

const _b = new Date();
const ANCHOR = new Date(_b.getFullYear(), _b.getMonth(), _b.getDate(), 9, 0, 0);
function atDay(dayOffset, h, m){
  return new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate()+dayOffset, h, m||0, 0).toISOString();
}

const BOOKINGS = [
  // KOMMENDE (start > nå = 09:00 i dag). NB: 09:30 lagt FØR 16:00 i responsen for
  // å bevise at seksjonen selv sorterer tidligst→senest innad i dagen.
  { id:'u1', start:atDay(0, 10, 0),  name:'Marcus L.',  service:'Skin fade',      price:450, status:'booket' },
  { id:'u2', start:atDay(0, 13, 30), name:'Jonas B.',   service:'Herreklipp',     price:300, status:'booket' },
  // i morgen (+1): BEVISST TOM → trener «I morgen»-ankeret som alltid synlig
  { id:'u4', start:atDay(4, 14, 30), name:'David K.', service:'Skjegg',     price:250, status:'booket' },
  { id:'u3', start:atDay(2, 11, 0),  name:'Omar T.',  service:'Herreklipp', price:300, status:'booket' },
  { id:'u6', start:atDay(6, 16, 0),  name:'Erik S.',  service:'Skin fade',  price:450, status:'booket' },
  { id:'u5', start:atDay(6, 9, 30),  name:'Ali R.',   service:'Skjegg',     price:250, status:'booket' },
  { id:'u7', start:atDay(9, 12, 0),  name:'Sofus P.', service:'Klipp',      price:300, status:'booket' },

  // SISTE (start <= slutt av i dag)
  { id:'p0', start:atDay(0, 8, 0),   name:'Nora H.',    service:'Klipp',          price:300, status:'booket' },  // passert i dag → auto-fullført
  { id:'p1', start:atDay(-1, 10, 0), name:'Henrik N.',  service:'Skinnfade',      price:450, status:'fullfort' },
  { id:'p2', start:atDay(-1, 14, 0), name:'Ukjent',     service:'Klipp',          price:300, status:'noshow' },
  { id:'p3', start:atDay(-1, 16, 30),name:'Sander V.',  service:'Klipp + skjegg', price:400, status:'venter' },
  { id:'p4', start:atDay(-3, 11, 0), name:'Adam Sø',    service:'Klipp + skjegg', price:400, status:'fullfort' },
  { id:'p5', start:atDay(-6, 12, 0), name:'Filip Aas',  service:'Klipp',          price:300, status:'fullfort' },
  { id:'p6', start:atDay(-12, 9, 0), name:'Lars Moe',   service:'Skinnfade',      price:450, status:'fullfort' },
];

const PROFILE = JSON.stringify({ name:'Demo Barber', shop:'Demo Barber Shop', hasPassword:true });
const DATED = /^[A-ZÆØÅ]{3} \d{1,2}\. [A-ZÆØÅ]{3}$/; // f.eks. «TOR 16. JUL»

const browser = await chromium.launch();

async function setup(width, bookingsBody){
  const ctx = await browser.newContext({ viewport:{ width, height:900 }, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(ANCHOR); // pinn «nå» = 09:00 i dag
  // LIFO: catch-all først, spesifikke sist
  await page.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await page.route('**/api/dashboard/profile', r => r.fulfill({ status:200, contentType:'application/json', body:PROFILE }));
  await page.route('**/api/dashboard/bookings', r => r.fulfill({ status:200, contentType:'application/json', body:bookingsBody }));
  await page.goto(DASH, { waitUntil:'domcontentloaded' });
  await page.evaluate(()=>{ try{ switchPanel('oversikt'); }catch(e){} });
  await page.waitForTimeout(900);
  return { ctx, page };
}

// Les Kommende-seksjoner: [{label, times:[], empty}]
const readUpcoming = () => window.__readUp();
// Les Siste-daggrupper: [{label, times:[]}]
const readSiste = () => window.__readBk();
function installReaders(){
  window.__readUp = () => {
    const out=[]; const root=document.querySelector('#upcomingList');
    root.querySelectorAll('.up-day').forEach(d=>{
      const n=d.nextElementSibling; const times=[];
      let empty=false;
      if(n&&n.classList.contains('up-rows')) n.querySelectorAll('.up-time').forEach(t=>times.push(t.textContent.trim()));
      else if(n&&n.classList.contains('up-empty')) empty=true;
      out.push({label:d.textContent.trim(), times, empty});
    });
    return out;
  };
  window.__readBk = () => {
    const out=[];
    document.querySelectorAll('#bookingList .daygroup').forEach(g=>{
      out.push({label:g.querySelector('.dayhead').textContent.trim(),
                times:[...g.querySelectorAll('.when.t')].map(t=>t.textContent.trim())});
    });
    return out;
  };
}
const ascending = a => a.every((v,i)=> i===0 || v>=a[i-1]);

async function shotEl(page, sel, name){
  await page.locator(sel).screenshot({ path:`${OUT}/${name}.png` });
  console.log(`Lagret ${name}.png`);
}

// ---- 1) Screenshots: alle tilstander × 320/375 ----
for (const width of [320, 375]){
  const { ctx, page } = await setup(width, JSON.stringify(BOOKINGS));
  await shotEl(page, '#upcomingList >> xpath=..', `bk_kommende_kompakt_${width}`);
  await page.click('[data-up-toggle]'); await page.waitForTimeout(250);
  await shotEl(page, '#upcomingList >> xpath=..', `bk_kommende_utvidet_${width}`);
  await shotEl(page, '#bookingList >> xpath=..', `bk_siste_2dager_${width}`);
  await page.click('[data-bk-toggle]'); await page.waitForTimeout(250);
  await shotEl(page, '#bookingList >> xpath=..', `bk_siste_vismer_${width}`);
  await ctx.close();
}

// ---- 2) Assertions: grupperings-/dayHead-invarianter (én bredde holder) ----
{
  const { ctx, page } = await setup(375, JSON.stringify(BOOKINGS));
  await page.evaluate(installReaders);

  // Kompakt Kommende: KUN de to ankerne, i rekkefølge; «I morgen» tom.
  let up = await page.evaluate(readUpcoming);
  assert.equal(up.length, 2, 'kompakt viser kun de to ankerne');
  assert.equal(up[0].label, 'I dag');
  assert.equal(up[1].label, 'I morgen');
  assert.deepEqual(up[0].times, ['10:00','13:30'], 'I dag sortert tidligst→senest');
  assert.ok(up[1].empty, '«I morgen» vises som tom anker');

  // Utvidet Kommende: ankere først (I morgen fortsatt tom), så DATERTE dager.
  await page.click('[data-up-toggle]'); await page.waitForTimeout(200);
  up = await page.evaluate(readUpcoming);
  assert.equal(up[0].label, 'I dag');
  assert.equal(up[1].label, 'I morgen');
  assert.ok(up[1].empty, '«I morgen» tom også i utvidet');
  const dated = up.slice(2);
  assert.ok(dated.length >= 3, 'framtidige dager listet i utvidet');
  dated.forEach(s => assert.match(s.label, DATED, `datert header: ${s.label}`));
  up.forEach(s => assert.ok(ascending(s.times), `stigende tid innad: ${s.label} ${s.times}`));

  // Siste default: KUN 2 dager (I dag + I går); «nå»-splitten legger dagens
  // kommende (10:00/13:30) også her under «I dag».
  let bk = await page.evaluate(readSiste);
  assert.equal(bk.length, 2, 'Siste default viser 2 dager');
  assert.equal(bk[0].label, 'I dag');
  assert.equal(bk[1].label, 'I går');
  assert.ok(bk[0].times.includes('10:00') && bk[0].times.includes('13:30'),
    '«nå»-split: dagens kommende speiles i Siste under I dag');
  assert.ok(ascending(bk[0].times), 'Siste I dag sortert stigende');

  // Siste vis mer: eldre dager datert (samme regel som kommende).
  await page.click('[data-bk-toggle]'); await page.waitForTimeout(200);
  bk = await page.evaluate(readSiste);
  assert.ok(bk.length > 2, 'vis mer utvider forbi 2 dager');
  const older = bk.slice(2);
  older.forEach(g => assert.match(g.label, DATED, `Siste datert header: ${g.label}`));
  await ctx.close();
}

// ---- 3) Anker-invariant: ankere vises ALLTID, også når kommende er helt tom ----
{
  const { ctx, page } = await setup(375, '[]');
  await page.evaluate(installReaders);
  const up = await page.evaluate(readUpcoming);
  assert.equal(up.length, 2, 'ankere synlige selv uten bookinger');
  assert.equal(up[0].label, 'I dag'); assert.ok(up[0].empty);
  assert.equal(up[1].label, 'I morgen'); assert.ok(up[1].empty);
  const btn = await page.$('#upcomingList [data-up-toggle]');
  assert.equal(btn, null, 'ingen «Vis mer» når det ikke finnes framtidige dager');
  await ctx.close();
}

await browser.close();
console.log('✓ Assertions passerte. Screenshots i pw-screenshots/bk_*');
