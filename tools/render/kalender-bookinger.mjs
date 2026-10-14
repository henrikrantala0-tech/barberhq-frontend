// tools/render/kalender-bookinger.mjs — kalenderen tegner ALLE bookinger (14.10.2026).
//   1. Stengt dag MED booking (dagen satt til stengt etter at kunden booket): blokka vises, innenfor dagflaten,
//      og dagoverskriften sier «· Stengt». (Før: bare «Stengt», bookingen var borte.)
//   2. Bookinger utenfor åpningstid (åpent 10–17; 08:30, 10:00, 18:00): alle tre innenfor dagflaten, i riktig
//      rekkefølge ovenfra, ingen oppå hverandre. (Før: 08:30 og 10:00 begge på top 0, 18:00 under aksen.)
//   3. Vanlig dag (booking innenfor åpningstid): aksen starter fortsatt på åpningstiden — uendret.
// Klokka fryses (page.clock) til mandag 19.10.2026 10:00 Oslo. Alt under /api/** mockes.
//   node tools/render/kalender-bookinger.mjs   → .render-ut/kalender-bookinger/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/kalender-bookinger');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const PX=1.8;   // PX_PER_MIN i dashboard.html

const NAA='2026-10-19T08:00:00Z';   // mandag 10:00 Oslo (UTC+2)
const timer=(mandag)=>[0,1,2,3,4,5,6].map(wd=>wd===1?mandag:{weekday:wd,is_closed:false,open_time:'10:00',close_time:'17:00',breaks:[]});
const bk=(id,fra,til)=>({id,start:`2026-10-19T${fra}:00Z`,end:`2026-10-19T${til}:00Z`,name:'Kunde '+id,service:'Klipp',service_id:1,status:'booket'});
const SCEN=[
  {id:'stengt-dag',  hours:timer({weekday:1,is_closed:true,open_time:null,close_time:null,breaks:[]}), bk:[bk('S','10:00','10:30')], bilde:true},
  {id:'utenfor-tid', hours:timer({weekday:1,is_closed:false,open_time:'10:00',close_time:'17:00',breaks:[]}),
     bk:[bk('A','06:30','07:00'),bk('B','08:00','08:30'),bk('C','16:00','16:30')], bilde:true},   // Oslo 08:30, 10:00, 18:00
  {id:'vanlig',      hours:timer({weekday:1,is_closed:false,open_time:'10:00',close_time:'17:00',breaks:[]}), bk:[bk('V','09:00','09:30')]},  // Oslo 11:00
];

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function aapne(bredde,scen){
  const ctx=await browser.newContext({timezoneId:'Europe/Oslo',viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.clock.install({time:new Date(NAA)});
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',route=>{
    const u=new URL(route.request().url()), p=u.pathname;
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/profile') return json({slug:'grand-barber',email:'g@b.no',hasPassword:true,name:'Henrik',shop:'Grand',booking_horizon_days:28});
    if(p==='/api/dashboard/hours') return json(scen.hours);
    if(p==='/api/dashboard/services') return json({hoved:[{id:1,name:'Klipp',sort:0,price:300,min:30}],tillegg:[]});
    if(p==='/api/dashboard/bookings') return json(scen.bk);
    if(p==='/api/dashboard/billing/status') return json({subscription_status:'active',plan:'vekst',effective_plan:'vekst',effective_plan_grunn:'subscription',page_status:'live'});
    return json(/images|recent|winback|referrals|rebooking|sms-logg|momentum|loyalty|stats|attribution/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.click('#calOpenUpcoming'); await page.waitForTimeout(400);
  const geo=await page.evaluate(()=>{
    const col=document.querySelector('#calDays .cal-day'), body=col.querySelector('.cal-daybody');
    const blokker=[...body.querySelectorAll('.cal-block')].map(b=>({id:b.dataset.id,top:b.offsetTop,h:b.offsetHeight,left:b.offsetLeft,w:b.offsetWidth}));
    return {hode:col.querySelector('.cal-dayhead').textContent.trim(), // Aksens lengde (inline høyde = (yMax−yMin)×PX_PER_MIN). clientHeight er IKKE målet: .cal-day strekkes bare
      // til den synlige høyden i .cal-scroll (flex), mens linjer og blokker er absolutte og tegnes/scrolles under.
      bodyH:parseFloat(body.style.height), kolH:col.offsetHeight, hodeH:col.querySelector('.cal-dayhead').offsetHeight, blokker,
      akse:document.querySelector('#calAxis .cal-hour span')?.textContent.trim()};
  });
  return {ctx,page,errs,geo};
}
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const innenfor=(g,b)=>b.top>=0&&b.top+b.h<=g.bodyH;
const overlapp=(a,b)=>a.top<b.top+b.h&&b.top<a.top+a.h&&a.left<b.left+b.w&&b.left<a.left+a.w;

for(const w of [320,375]) for(const scen of SCEN){
  if(w===320&&!scen.bilde) continue;
  const {ctx,page,errs,geo:g}=await aapne(w,scen);
  const f=[];
  if(g.blokker.length!==scen.bk.length) f.push(`${g.blokker.length} blokker (ventet ${scen.bk.length})`);
  g.blokker.forEach(b=>{ if(!innenfor(g,b)) f.push(`${b.id} utenfor dagflaten (top ${b.top}, h ${b.h}, flate ${g.bodyH})`); });
  for(let i=0;i<g.blokker.length;i++) for(let j=i+1;j<g.blokker.length;j++) if(overlapp(g.blokker[i],g.blokker[j])) f.push(`${g.blokker[i].id} og ${g.blokker[j].id} oppå hverandre`);
  if(g.kolH<g.hodeH+g.bodyH-1) f.push(`kolonnen ${g.kolH}px er kortere enn dagen ${g.hodeH+g.bodyH}px (kant/bakgrunn slutter midt i dagen)`);
  if(scen.id==='stengt-dag'&&!/Stengt/.test(g.hode)) f.push(`overskrift «${g.hode}»`);
  if(scen.id==='utenfor-tid'){
    const t=Object.fromEntries(g.blokker.map(b=>[b.id,b.top]));
    if(!(t.A<t.B&&t.B<t.C)) f.push(`rekkefølge ${JSON.stringify(t)}`);
    if(t.B-t.A!==Math.round(90*PX)) f.push(`avstand 08:30→10:00 = ${t.B-t.A}px (ventet ${Math.round(90*PX)})`);
    if(g.akse!=='08:00') f.push(`aksen starter ${g.akse} (ventet 08:00)`);
  }
  if(scen.id==='vanlig'){
    if(g.akse!=='10:00') f.push(`aksen starter ${g.akse} (ventet 10:00, uendret)`);
    if(g.blokker[0]&&g.blokker[0].top!==Math.round(60*PX)) f.push(`11:00-blokka top ${g.blokker[0].top}`);
  }
  if(scen.bilde){
    // page.clock fryser tegningen — slå på sanntid før skjermbildet. Topp og bunn av dagen, så alle blokker synes.
    await page.clock.resume();
    for(const [del,y] of [['topp',0],['bunn',1e6]]){
      await page.$eval('.cal-scroll',(e,y)=>{e.scrollTop=y;},y); await page.waitForTimeout(300);
      const fil=path.join(OUT,`${scen.id}-${w}-${del}.png`); await page.screenshot({path:fil}); bilder.push(fil);
    }
  }
  push(`${w} ${scen.id}`,f,errs); await ctx.close();
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
