// tools/render/overflow-mobil.mjs — horisontal-overflow-vakt for dashbordet i WEBKIT (iOS-motor).
// iOS-spesifikke bugs (særlig input[type=time] sin innebygde minimumsbredde + flex min-width:auto) vises
// ofte IKKE i Chromium. Denne kjører WebKit på iPhone-breddene 320–440 og skanner alle fem fanene.
//
// Finner «contributor»-elementene: det INNERSTE elementet som stikker forbi innerWidth (ingen barn når
// like langt til høyre). Rapporterer selector, bredde, og hint om hvorfor (min-width, width, flex-shrink,
// white-space, scrollWidth). Mocker ALT /api/** (aldri prod). Exit 1 ved treff → brukbar som regresjonstest.
//   node tools/render/overflow-mobil.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { webkit } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;

const WIDTHS=[320,375,390,393,402,430,440];
const PANELS=['oversikt','vekst','tjenester','design','abonnement'];

// ── Mock-data nok til at hver fane rendrer EKTE innhold (ikke bare tomtilstand) ──
const billing = JSON.stringify({subscription_status:'active',plan:'vekst',effective_plan:'vekst',effective_plan_grunn:'subscription',needs_attention:false,page_status:'live',days_left:null,trial_start_at:null});
const profile = JSON.stringify({hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber Oslo',email:'henrik@grandbarber.no',slug:'grand-barber',tagline:'Fades & classic cuts',bio:'Skarpe fades, rene linjer.',address:'Storgata 12, 0155 Oslo',contact_phone:'91234567'});
const services = JSON.stringify({hoved:[{id:'s1',name:'Herreklipp',price:400,min:30,sort:0},{id:'s2',name:'Skjeggtrim og forming',price:250,min:20,sort:1}],tillegg:[{id:'s3',name:'Hårvask',price:100,min:10,sort:0}]});
// hours: RÅ backend-shape (weekday 0=søn…6=lør). Alle sju åpne; mandag med pause (verste rad-innhold).
const hours = JSON.stringify([0,1,2,3,4,5,6].map(wd=>({weekday:wd,is_closed:false,open_time:'09:00',close_time:'17:00',breaks: wd===1?[{start_time:'11:30',end_time:'12:00'}]:[]})));
const gstatus = JSON.stringify({connected:true,scope_ok:true,missing_scopes:[]});
const stats = JSON.stringify({daily:[{date:'2026-09-25',count:3,revenue:1200,new:1,returning:2}],months_with_data:['2026-09'],current_week_revenue:1200,best_week_revenue:3000,best_week_start:'2026-09-14',weekly_revenue:[{week_start:'2026-09-14',revenue:3000},{week_start:'2026-09-21',revenue:1200}]});
const attribution = JSON.stringify({total:{count:4,revenue:1700},rebooking:{count:2,revenue:900},verving:{count:1,revenue:500},vinn_tilbake:{count:1,revenue:300},sms_rebooking_enabled:true});
const vekstStats = JSON.stringify({rebooking_rate:0.42,trend:0.05,completed_all_time:12,avg_customers_per_month:8});
const settings = JSON.stringify({sms_reminder_enabled:true,sms_rebooking_enabled:true,sms_rebooking_days:35,loyalty_enabled:true,loyalty_threshold:10,loyalty_pct:100,loyalty_count_history:false});
const loyalty = JSON.stringify({enabled:true,threshold:10,pct:100,activated_at:'2026-08-01',count_history:false,participants:[{customer_id:'c1',name:'Ola Nordmann',phone:'90000001',opt_in_at:'2026-08-02',stamps:7,reward_ready:false}],eligible:[{customer_id:'c2',name:'Kari Nordmann',phone:'90000002',last_visit:'2026-09-20',completed_count:4}],totals:{in_progress:1,ready:0,redeemed_month:0,participants:1,eligible:1}});
const winback = JSON.stringify([]); const referrals = JSON.stringify({referrals:[],rewards:[]});

async function mock(page){
  await page.route('**/api/**', route=>{ const u=new URL(route.request().url()); const p=u.pathname;
    const J=(b)=>route.fulfill({status:200,contentType:'application/json',body:b});
    if(p==='/api/dashboard/billing/status') return J(billing);
    if(p==='/api/dashboard/profile')        return J(profile);
    if(p==='/api/dashboard/services')        return J(services);
    if(p==='/api/dashboard/hours')          return J(hours);
    if(p==='/api/dashboard/google/status')  return J(gstatus);
    if(p==='/api/dashboard/stats')          return J(stats);
    if(p.startsWith('/api/dashboard/stats/month')) return J(JSON.stringify({ym:u.searchParams.get('ym'),days:[],total:{count:0,revenue:0}}));
    if(p==='/api/dashboard/attribution')    return J(attribution);
    if(p==='/api/dashboard/vekst-stats'||p==='/api/dashboard/vekst/stats') return J(vekstStats);
    if(p==='/api/dashboard/settings')       return J(settings);
    if(p==='/api/dashboard/loyalty')        return J(loyalty);
    if(p==='/api/dashboard/winback')        return J(winback);
    if(p==='/api/dashboard/referrals')      return J(referrals);
    if(p==='/api/dashboard/bookings')       return J('[]');
    if(p==='/api/dashboard/images')         return J('[]');
    if(p==='/api/dashboard/sms-logg')       return J(JSON.stringify({omfang:'',forbruk:{},logg:[],neste_cursor:null,har_mer:false}));
    return J(/\[\]/.test('')?'{}':'{}');   // øvrige → {} (tomt, uskadelig)
  });
}

// In-page: finn innerste elementer som stikker forbi innerWidth.
const DETECT = (W)=>{
  const EPS=0.5, out=[];
  const sel=(el)=>{ let s=el.tagName.toLowerCase();
    if(el.id) s+='#'+el.id;
    if(el.classList.length) s+='.'+[...el.classList].slice(0,3).join('.');
    if(el.getAttribute&&el.getAttribute('type')) s+='[type='+el.getAttribute('type')+']';
    return s; };
  const panel=document.querySelector('.panel.active');
  const scope=panel||document.body;
  const els=scope.querySelectorAll('*');
  for(const el of els){
    const rects=el.getClientRects(); if(!rects.length) continue;
    const r=el.getBoundingClientRect();
    if(r.right<=W+EPS || r.width<=0) continue;
    // contributor = ingen barn når like langt til høyre (dette elementet ETABLERER bredden)
    let childReaches=false;
    for(const c of el.children){ const cr=c.getBoundingClientRect(); if(cr.right>=r.right-1){ childReaches=true; break; } }
    if(childReaches) continue;
    const cs=getComputedStyle(el);
    out.push({ sel:sel(el), right:Math.round(r.right), width:Math.round(r.width), over:Math.round(r.right-W),
      minWidth:cs.minWidth, widthCss:cs.width, flexShrink:cs.flexShrink, flexBasis:cs.flexBasis,
      whiteSpace:cs.whiteSpace, overflowX:cs.overflowX, boxSizing:cs.boxSizing, scrollW:el.scrollWidth, clientW:el.clientWidth });
  }
  // dedupe på selector (f.eks. 7 like time-inputs) → behold bredeste + antall
  const map=new Map();
  for(const o of out){ const k=o.sel; const e=map.get(k); if(!e||o.over>e.over){ map.set(k,{...o,n:(e?e.n:0)+1}); } else { e.n++; } }
  return [...map.values()].sort((a,b)=>b.over-a.over);
};

const browser=await webkit.launch();
const funn=[]; const jsFeil=[];
for(const w of WIDTHS){
  const page=await browser.newPage({viewport:{width:w,height:844},deviceScaleFactor:2});
  // ResizeObserver loop-notifikasjonen er en benign browser-melding (ikke en kode-feil) — filtreres bort.
  page.on('pageerror',e=>{ if(/ResizeObserver loop/i.test(e.message)) return; jsFeil.push(`${w}: ${e.message}`); });
  await mock(page);
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  for(const pan of PANELS){
    await page.evaluate(p=>switchPanel(p), pan);
    await page.waitForTimeout(500);
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.waitForTimeout(150);
    const docScroll=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth}));
    const hits=await page.evaluate(DETECT, w);
    if(hits.length || docScroll.sw>docScroll.iw) funn.push({w,pan,docOver:docScroll.sw-docScroll.iw,hits});
  }
  await page.close();
}
await browser.close(); server.close();

// ── Rapport ──
if(!funn.length){
  console.log('BESTÅTT ✓ — ingen horisontal overflow på noen fane (5) × bredde (7) i WebKit. JS-feil:',jsFeil.length?jsFeil.join(' | '):'ingen');
  process.exitCode = jsFeil.length?1:0;
} else {
  console.log('OVERFLOW FUNNET ✗\n');
  for(const f of funn){
    console.log(`▸ ${f.pan} @${f.w}px  (document scrollWidth−innerWidth = ${f.docOver})`);
    for(const h of f.hits){
      console.log(`   ${h.sel}${h.n>1?' ×'+h.n:''}  right=${h.right} (over +${h.over})  w=${h.width} scrollW=${h.scrollW}`);
      console.log(`      min-width:${h.minWidth}  width:${h.widthCss}  flex-shrink:${h.flexShrink}  white-space:${h.whiteSpace}  box-sizing:${h.boxSizing}`);
    }
    console.log('');
  }
  if(jsFeil.length) console.log('JS-feil:',jsFeil.join(' | '));
  process.exitCode=1;
}
