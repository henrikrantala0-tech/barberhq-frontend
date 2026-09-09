// tools/render/plakat-editor.mjs — Kampanjeplakat-editoren i dashbordet.
// Lag 1 (skjelett + navigasjon): «Generer plakat» bor som sekundærknapp (.btn-outline) INNE i
// Verving- og Lojalitet-trekkspillet (under innstillingene). Knappen setter kampanjetypen for
// hele editor-økten. Lojalitet-knappen vises kun når programmet er PÅ. Basis → rutes til Konto.
// Mocker /api/dashboard/* som skjold.mjs. Screenshots → .render-ut/plakat-*.png (gitignorert).
//   node tools/render/plakat-editor.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const svg = c => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${c}"/></svg>`);
const IMAGES = [
  { id:101, url:svg('#c0392b'), slot:'galleri', sort_order:0 },
  { id:102, url:svg('#2980b9'), slot:'galleri', sort_order:1 },
  { id:103, url:svg('#27ae60'), slot:'galleri', sort_order:2 },
  { id:104, url:svg('#8e44ad'), slot:'galleri', sort_order:3 },
];
const PROFILE = { slug:'grand-barber', email:'g@b.no', hasPassword:true, name:'Henrik',
  shop:'Grand Barber', address:'', tagline:'Fades & skjeggpleie', bio:'', booking_horizon_days:28 };
const DESIGN = { palette:'krem', font:'jakarta', layout:'profil', mode:'mork', customAccent:null, savedLayout:'profil' };
function billing(plan){ return { subscription_status: plan==='basis'?'active':'trialing', page_status:'live',
  plan: plan==='basis'?'basis':null, effective_plan:plan, effective_plan_grunn: plan==='basis'?'subscription':'trial_vindu',
  trial_days_left: plan==='basis'?null:30, nedtaking_dager_igjen:null, myk_periode:false, needs_attention:false, attention_grunn:null }; }
function loyalty(enabled){ return { enabled, threshold:10, pct:100, count_history:false,
  participants: enabled?[{customer_id:1,name:'Amir Haddad',phone:'99887766',stamps:10,reward_ready:true}]:[],
  // 5 kandidater → med LOYAL_FORST=3 skal «Legg til kunde» vise 3 + «Vis flere (2)».
  eligible: enabled?[1,2,3,4,5].map(i=>({customer_id:100+i,name:'Kunde '+i,completed_count:i+2,last_visit:'2026-09-0'+i+'T10:00:00Z'})):[],
  totals:{in_progress: enabled?5:0,ready: enabled?1:0,redeemed_month:0,participants: enabled?1:0,eligible: enabled?5:0} }; }
function router(plan, loyEnabled){ return route => {
  const req = route.request(); const p = new URL(req.url()).pathname;
  const json = (obj, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(obj) });
  if (p === '/api/dashboard/profile')        return json(PROFILE);
  if (p === '/api/dashboard/design')         return json(DESIGN);
  if (p === '/api/dashboard/images')         return json(IMAGES);
  if (p === '/api/dashboard/billing/status') return json(billing(plan));
  if (p === '/api/dashboard/loyalty')        return json(loyalty(loyEnabled));
  if (p === '/api/dashboard/settings')       return json({ referral_reward_recipient:'begge', referral_discount_pct:20,
    loyalty_enabled:loyEnabled, loyalty_threshold:10, loyalty_pct:100, loyalty_count_history:false });
  const listeAktig = /images|bookings|recent|services|hours|winback|referrals|rebooking|sms-logg/.test(p);
  return json(listeAktig ? [] : {});
}; }

const shot = (page, navn) => page.screenshot({ path:`${OUT}/plakat-v3-${navn}.png`, fullPage:false });
async function openAcc(page, sel){
  await page.evaluate((s)=>{ const h=document.querySelector(s+' .acc-head'); if(h && h.getAttribute('aria-expanded')!=='true') h.click(); }, sel);
  await page.waitForTimeout(350);
}
const vis = sel => `() => { const e=document.querySelector('${sel}'); return { finnes:!!e, vises: !!(e&&e.offsetParent),
  bg: e?getComputedStyle(e).backgroundColor:null, hasBorder: e?getComputedStyle(e).borderTopWidth!=='0px':null }; }`;
const ktype = () => `() => { try { return (JSON.parse(sessionStorage.getItem('bhq-plakat'))||{}).kampanjetype; } catch(e){ return 'ERR'; } }`;

const browser = await chromium.launch();
const rapport = [];

for (const bredde of [320, 375]) {
  const page = await browser.newPage({ viewport:{ width:bredde, height:800 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', true)); // loyalty PÅ
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1200);

  // Verving-knapp
  await openAcc(page, '#accVerv');
  await page.evaluate(() => { const b=document.querySelector('#plakatOpenVerving'); if(b) b.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(150);
  const vV = await page.evaluate(eval(vis('#plakatOpenVerving')));
  await shot(page, `knapp-verving-${bredde}`);

  // Lojalitet-knapp (program PÅ)
  await openAcc(page, '#accLoyal');
  await page.waitForTimeout(200);
  const kand = await page.evaluate(() => ({ rader: document.querySelectorAll('#loyalLeggTil .wb-row').length,
    visFlere: (()=>{const m=document.querySelector('#loyalLeggTilMore'); return m&&!m.hidden?m.textContent.trim():'skjult';})() }));
  await page.evaluate(() => { const b=document.querySelector('#plakatOpenLojalitet'); if(b) b.scrollIntoView({block:'center'}); });
  await page.waitForTimeout(150);
  const vL = await page.evaluate(eval(vis('#plakatOpenLojalitet')));
  await shot(page, `knapp-lojalitet-${bredde}`);

  // Åpne editoren fra Verving → kampanjetype=verving
  await page.click('#plakatOpenVerving'); await page.waitForTimeout(350);
  const kV = await page.evaluate(eval(ktype()));
  const openV = await page.evaluate(() => document.querySelector('#plakatOverlay').classList.contains('open'));
  await shot(page, `editor-verving-${bredde}`);
  await page.click('#plakatX'); await page.waitForTimeout(200);

  // Åpne fra Lojalitet → kampanjetype=lojalitet (flip i samme økt)
  await openAcc(page, '#accLoyal');
  await page.click('#plakatOpenLojalitet'); await page.waitForTimeout(350);
  const kL = await page.evaluate(eval(ktype()));
  if (bredde===375) await shot(page, `editor-lojalitet-${bredde}`);
  await page.click('#plakatX'); await page.waitForTimeout(150);

  rapport.push({ bredde,
    'verv-knapp vises': vV.vises, 'loj-knapp vises': vL.vises,
    'kand-rader (av 5)': kand.rader, 'kand vis-flere': kand.visFlere,
    'kampanjetype (verv-klikk)': kV, 'kampanjetype (loj-klikk)': kL, 'overlay åpnet': openV,
    jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Lojalitet AV → loj-knapp skal IKKE vises; verv-knapp vises.
{
  const page = await browser.newPage({ viewport:{ width:375, height:800 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('vekst', false)); // loyalty AV
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1000);
  await openAcc(page, '#accVerv'); await openAcc(page, '#accLoyal');
  const vV = await page.evaluate(eval(vis('#plakatOpenVerving')));
  const vL = await page.evaluate(eval(vis('#plakatOpenLojalitet')));
  await page.evaluate(() => { const e=document.querySelector('#accLoyal'); if(e) e.scrollIntoView({block:'center'}); });
  await shot(page, `loyalty-av-375`);
  rapport.push({ bredde:'375 LOJ-AV', 'verv-knapp vises':vV.vises, 'verv bg':'—', 'verv border':'—',
    'loj-knapp vises':vL.vises, 'kampanjetype (verv-klikk)':'—', 'overlay åpnet':'—', 'kampanjetype (loj-klikk)':'—',
    jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

// Basis → Vekst-flatene er skjoldet: knappen er disablet + dekket (kan ikke åpne editoren).
{
  const page = await browser.newPage({ viewport:{ width:375, height:800 }, deviceScaleFactor:2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', router('basis', true));
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
  await page.evaluate(() => switchPanel('vekst'));
  await page.waitForTimeout(1000);
  await openAcc(page, '#accVerv');
  const b = await page.evaluate(() => { const btn=document.querySelector('#plakatOpenVerving');
    return { erBasis: typeof erBasis==='function'?erBasis():'MANGLER', disabled: btn?btn.disabled:null,
      skjold: !!document.querySelector('#accVerv .skjold') }; });
  rapport.push({ bredde:'375 BASIS', 'verv-knapp vises':'(skjoldet)', 'verv bg':'—', 'verv border':'—',
    'loj-knapp vises':'—', 'kampanjetype (verv-klikk)':'—', 'overlay åpnet': b.disabled?'nei — disablet':'JA?!',
    'kampanjetype (loj-klikk)':'erBasis='+b.erBasis+' skjold='+b.skjold, jsfeil: errs.length?errs.join('; '):'ingen' });
  await page.close();
}

console.table(rapport);
console.log('\nJS-feil:', rapport.filter(r=>r.jsfeil!=='ingen').length);
await browser.close(); server.close();
