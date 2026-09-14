// «Drevet av BarberHQ» v2 — panelet mot /attribution-shape ({paaVei, hentetInn?}).
// Tre tilstander × Oversikt + Vekst × 320/375. Vokter:
//  - Panelet har NØYAKTIG TRE armer: Verving, Vinn tilbake, Rebooking — i den rekkefølgen.
//    LOJALITET er fjernet (14.09) og skal ALDRI finnes i panelet — vakten BITER hvis raden kommer tilbake
//    (ingen «Lojalitet»-arm, ingen .di-setup, ingen «kunder i programmet»-linje).
//  - Vekst m/data: Hentet inn (total) + tre armer + På vei (Oversikt) / rader (Vekst).
//  - Basis: hentetInn MANGLER → INGEN «Hentet inn», kun På vei + CTA (Oversikt) / CTA (Vekst).
//    Manglende hentetInn skal ALDRI kaste (fail-trygt).
//  - Ny konto: 0 kr uten undertekst, tre armer «Ingen ennå».
// page.on('pageerror') obligatorisk — se tools/render/README.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

const bill = (plan) => ({ subscription_status:'active', plan, effective_plan:plan, effective_plan_grunn:'subscription',
  page_status:'live', days_left:99, trial_days_left:null, myk_periode:false, needs_attention:false });
// paaVeiFull: winback N=3 (klare nå-tilstand). paaVeiDato: N=0 + dato (prognose). paaVeiNy: N=0 + null («Ingen ennå»).
const paaVeiFull = { rebooking:{naar_vindu_30d:88,med_samtykke:7}, winback:{foerste_passerer_60:'2026-09-14',passerer_innen_30d:3}, lojalitet:{aktive_stampkort:4,ett_klipp_unna:1}, verving:{lenke_finnes:true} };
const paaVeiDato = { rebooking:{naar_vindu_30d:12,med_samtykke:3}, winback:{foerste_passerer_60:'2026-09-25',passerer_innen_30d:0}, lojalitet:{aktive_stampkort:0,ett_klipp_unna:0}, verving:{lenke_finnes:true} };
const paaVeiNy   = { rebooking:{naar_vindu_30d:0,med_samtykke:0}, winback:{foerste_passerer_60:null,passerer_innen_30d:0}, lojalitet:{aktive_stampkort:0,ett_klipp_unna:0}, verving:{lenke_finnes:true} };
const hentetVekst = { period:'siste_maaned', total:{count:6,revenue:2048}, vervet:{count:0,revenue:0}, lojalitet:{count:0,revenue:0,program:{klipp:9,kunder:4,aktivert:true}}, vinnTilbake:{count:0,revenue:0}, rebooking:{count:6,revenue:2048,aktivert:true} };
const hentetNy    = { period:'siste_maaned', total:{count:0,revenue:0}, vervet:{count:0,revenue:0}, lojalitet:{count:0,revenue:0,program:{klipp:0,kunder:0,aktivert:false}}, vinnTilbake:{count:0,revenue:0}, rebooking:{count:0,revenue:0,aktivert:true} };
const STATES = {
  vekst:       { plan:'vekst', attr:{ paaVei:paaVeiFull, hentetInn:hentetVekst } },   // winback N>0 → «N kunder er klare nå»
  basis:       { plan:'basis', attr:{ paaVei:paaVeiFull } },                          // INGEN hentetInn
  nykonto:     { plan:'vekst', attr:{ paaVei:paaVeiNy,   hentetInn:hentetNy } },      // winback null → «Ingen ennå»
  datoprognose:{ plan:'vekst', attr:{ paaVei:paaVeiDato, hentetInn:hentetVekst } },   // winback N=0 + dato → «DD. mnd»
};
const stats = { daily:[], months_with_data:[], current_week_revenue:0, best_week_revenue:0, best_week_start:null, weekly_revenue:[] };

const browser = await chromium.launch();
const rapport = [];
for (const flate of ['oversikt','vekst']) {
  for (const [navn, st] of Object.entries(STATES)) {
    for (const bredde of [320,375]) {
      const page = await browser.newPage({ viewport:{ width:bredde, height:1400 }, deviceScaleFactor:2 });
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.route('**/api/**', route => {
        const u = new URL(route.request().url()); const p = u.pathname; const m = route.request().method();
        const J = o => route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(o) });
        if (p === '/api/dashboard/billing/status') return J(bill(st.plan));
        if (p === '/api/dashboard/profile') return J({ hasPassword:true, name:'Henrik', shop:'Grand Barber', email:'h@g.no', slug:'grand-barber' });
        if (p === '/api/dashboard/preview') return route.fulfill({ status:200, contentType:'text/html', body:'<html><body></body></html>' });
        if (p === '/api/dashboard/attribution') return J(st.attr);
        if (p === '/api/dashboard/stats') return J(stats);
        if (p === '/api/dashboard/settings') { if (m!=='GET') return J({}); return J({ sms_paaminnelse_enabled:true, sms_rebooking_enabled:true, rebooking_interval_days:35, payment_methods:[] }); }
        if (p === '/api/dashboard/loyalty') return J({ enabled:st.plan!=='basis', threshold:10, pct:100, participants:[], eligible:[], totals:{in_progress:0,ready:0,redeemed_month:0,participants:0,eligible:0} });
        return J(/images|bookings|recent|winback|referrals|customers/.test(p) ? [] : {});
      });
      await page.goto(`http://localhost:${PORT}/no/dashboard.html`, { waitUntil:'networkidle' });
      if (flate === 'vekst') { await page.$eval('button[data-panel="vekst"]', b => b.click()); }
      await page.waitForTimeout(900);
      const host = flate === 'vekst' ? '#attrRows' : '#drivenBy';
      const m = await page.evaluate((h) => {
        const el = document.querySelector(h); const t = el ? el.innerText : '';
        const armer = el ? [...el.querySelectorAll('.di-row')].map(r => { const a=r.querySelector('.di-arm'); return a?a.textContent.trim():''; }).filter(Boolean) : [];
        return {
          harHentetInn:      /HENTET INN MED BARBERHQ/.test(t),
          harBunntekst:      /Kun klipp BarberHQ har bidratt til/.test(t),        // #4: skal være FALSE (flyttet til undertittel)
          // Lojalitet skal ALDRI finnes: ingen «Lojalitet»-arm, ingen .di-setup, ingen program-linje.
          lojFinnes:         armer.includes('Lojalitet') || /Lojalitet/.test(t) || /kunder i programmet|klipp registrert/.test(t) || !!(el && el.querySelector('.di-setup')),
          armer:             armer.join(','),
          harTreArmer:       armer.length===3 && armer[0]==='Verving' && armer[1]==='Vinn tilbake' && armer[2]==='Rebooking',
          harPaaVei:         /PÅ VEI/.test(t),
          harCta:            !!document.querySelector('[data-di-oppgrader]'),
          // Vinn-tilbake-armen (kun i #drivenBy/På vei): N>0 = .di-pv-num, dato = .di-pv-date, null = .di-pv-tom.
          wbArm: (function(){ var vt=el?[...el.querySelectorAll('.di-pv-block')].find(b=>/VINN TILBAKE/.test(b.innerText)):null;
            if(!vt) return null;
            return { num:!!vt.querySelector('.di-pv-num'), date:!!vt.querySelector('.di-pv-date'), tom:!!vt.querySelector('.di-pv-tom'),
                     link:!!vt.querySelector('.di-pv-link'), tekst:vt.innerText.replace(/\n/g,' ') }; })(),
        };
      }, host);
      const node = await page.$(host); if (node && bredde===375) await node.screenshot({ path:`${OUT}/drevet-av-${flate}-${navn}-375.png` });

      // Globalt: bunntekst borte + lojalitet ALDRI i panelet (biter hvis raden kommer tilbake). Så per tilstand/flate.
      let ok = errs.length===0 && !m.harBunntekst && !m.lojFinnes;
      // Basis (14.09): tre låste armer, INGEN total/hentetInn. CTA KUN på Vekst-fanen; på Oversikt bærer «På vei» (ingen CTA).
      if (navn==='basis' && flate==='oversikt') ok = ok && !m.harHentetInn && m.harTreArmer && m.harPaaVei && !m.harCta;
      if (navn==='basis' && flate==='vekst')    ok = ok && !m.harHentetInn && m.harTreArmer && !m.harPaaVei && m.harCta;
      if (navn==='vekst'  && flate==='oversikt') ok = ok && m.harHentetInn && m.harPaaVei && m.harTreArmer;
      if (navn==='vekst'  && flate==='vekst')    ok = ok && !m.harPaaVei && m.harTreArmer;   // rader, ingen På vei
      if (navn==='nykonto'&& flate==='oversikt') ok = ok && m.harHentetInn && m.harTreArmer;
      if (navn==='datoprognose' && flate==='oversikt') ok = ok && m.harHentetInn && m.harPaaVei && m.harTreArmer;
      if (navn==='datoprognose' && flate==='vekst')    ok = ok && !m.harPaaVei && m.harTreArmer;
      // Vinn-tilbake-armens tre tilstander (kun På vei/oversikt): N>0=tall+lenke, dato=dato+lenke, null=«Ingen ennå» uten tall/dato/lenke.
      if (flate==='oversikt'){
        if (navn==='vekst')        ok = ok && m.wbArm && m.wbArm.num && !m.wbArm.date && !m.wbArm.tom && m.wbArm.link && /kunder å hente inn/.test(m.wbArm.tekst);
        if (navn==='datoprognose') ok = ok && m.wbArm && m.wbArm.date && !m.wbArm.num && !m.wbArm.tom && m.wbArm.link && /passerer 60-dagersgrensen/.test(m.wbArm.tekst);
        if (navn==='nykonto')      ok = ok && m.wbArm && m.wbArm.tom && !m.wbArm.num && !m.wbArm.date && !m.wbArm.link && /Ingen ennå/.test(m.wbArm.tekst);
      }
      var wbVis = (flate==='oversikt' && m.wbArm) ? (m.wbArm.num?'N>0':m.wbArm.date?'dato':m.wbArm.tom?'tom':'?')+(m.wbArm.link?'+lenke':'') : '—';
      rapport.push({ flate, tilstand:navn, bredde, hentetInn:m.harHentetInn?'ja':'nei',
        lojalitet:m.lojFinnes?'FINNES✗':'borte', treArmer:m.harTreArmer?'ja':(navn==='basis'?'—':'NEI✗'),
        paaVei:m.harPaaVei?'ja':'nei', wbArm:wbVis, cta:m.harCta?'ja':'nei', jsfeil: errs.length?errs.join('; ').slice(0,40):'ingen', ok: ok?'✓':'✗' });
      await page.close();
    }
  }
}
console.table(rapport);
const ok = rapport.every(r => r.ok==='✓');
console.log('Basis uten hentetInn kaster ikke:', rapport.filter(r=>r.tilstand==='basis').every(r=>r.jsfeil==='ingen') ? 'ja ✓' : 'NEI ✗');
console.log('Lojalitet ALDRI i panelet (alle flater):', rapport.every(r=>r.lojalitet==='borte') ? 'ja ✓' : 'NEI ✗');
console.log('Vinn-tilbake-arm — N>0/dato/tom (oversikt):',
  (rapport.find(r=>r.tilstand==='vekst'&&r.flate==='oversikt')||{}).wbArm==='N>0+lenke'
  && (rapport.find(r=>r.tilstand==='datoprognose'&&r.flate==='oversikt')||{}).wbArm==='dato+lenke'
  && (rapport.find(r=>r.tilstand==='nykonto'&&r.flate==='oversikt')||{}).wbArm==='tom' ? 'ja ✓':'NEI ✗');
console.log('SAMLET:', ok ? 'GRØNT ✓' : 'NOE FEILER ✗');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
