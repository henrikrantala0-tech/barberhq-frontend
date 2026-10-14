// tools/render/story-fullt.mjs — «Lag story» når ingen dager har ledige tider (backend story-storre, ee20605).
//   Oversikt: /story/ledige-timer/data har_ledige:false (med tjeneste) → knapp + tall-linje skjult, dempet
//   «Fullt de neste dagene» i stedet. har_ledige:true → som før. tjenester:0 eller /data-feil → ingen
//   «Fullt»-påstand (som før). Generatoren: preview 409 {kode:'ingen_ledige_tider'} → #storyFeil med egen
//   tekst, iframen skjult (ikke rått JSON).
// Alt under /api/** mockes; ingen request når api.trybarberhq.com (forsøk === fanget).
//   node tools/render/story-fullt.mjs   → .render-ut/story-fullt/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/story-fullt');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const billing={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',
  needs_attention:false,cancel_at_period_end:false,current_period_end:null,sms_saldo:0,sms_paaminnelser_sendes:false,
  sms_pakker:[],sms_pakke_kan_kjopes:false,sms_tilbud_avvist_at:null,trial_days_left:null,trial_ends_at:null};
const FULLT={tjenester:1,tjeneste_id:'s1',valgt_dager:4,har_ledige:false,apne_dager:5,tilgjengelige_dager:0,oppdatert:'Oppdatert ons 13:00',dager:[]};
const LEDIG={tjenester:1,tjeneste_id:'s1',valgt_dager:4,har_ledige:true,tilgjengelige_dager:7,oppdatert:'Oppdatert ons 13:00',dager:[{dato:'2026-10-15',overskrift:'Tor 15.10',tekst:'10:00, 11:00'}]};
// Alle dager stengt (apne_dager:0, backend 11f7f2f): ikke «full» → ingen «Fullt». Eldre backend uten feltet → som før.
const STENGT={tjenester:1,tjeneste_id:'s1',valgt_dager:4,har_ledige:false,apne_dager:0,tilgjengelige_dager:0,oppdatert:'',dager:[]};
const FULLT_UTEN_FELT={tjenester:1,tjeneste_id:'s1',valgt_dager:4,har_ledige:false,tilgjengelige_dager:0,oppdatert:'',dager:[]};
const UTEN_TJENESTE={tjenester:0,valgt_dager:4,har_ledige:false,tilgjengelige_dager:0,dager:[],oppdatert:''};
const INGEN_LEDIGE={error:'Ingen ledige tider de neste dagene — ingen story å lage.',kode:'ingen_ledige_tider'};

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function nySide(bredde,{data,dataStatus=200,visBanner=true,preview409=false}){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodFanget++; return r.abort(); });
  await page.route('**/api/**',async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname;
    if(u.hostname==='api.trybarberhq.com') prodFanget++;
    const json=(o,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(o)});
    if(p==='/api/dashboard/billing/status') return json(billing);
    if(p==='/api/dashboard/profile') return json({hasPassword:true,name:'Henrik',shop:'Grand Barber',email:'h@g.no',slug:'grand-barber'});
    if(p==='/api/dashboard/ledige') return json({antall:3,vis_banner:visBanner});
    if(p.endsWith('/story/ledige-timer/data')) return dataStatus===200?json(data):json({error:'x'},dataStatus);
    if(p.endsWith('/story/ledige-timer/preview')) return preview409?json(INGEN_LEDIGE,409)
      : route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><body style="background:#111"><div id="days"></div></body>'});
    if(p==='/api/dashboard/preview') return route.fulfill({status:200,contentType:'text/html',body:'<html></html>'});
    return json(/images|recent|services|hours|referrals|winback|rebooking|bookings/.test(p)?[]:{});
  });
  await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
  await page.waitForTimeout(500);
  return {page,errs};
}
const synlig=(page,sel)=>page.$eval(sel,e=>e.offsetParent!==null).catch(()=>false);
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});

const OVERSIKT=[
  {id:'fullt',         opts:{data:FULLT},                 knapp:false, linje:false, fullt:true,  bilde:true},
  {id:'ledig',         opts:{data:LEDIG},                 knapp:true,  linje:true,  fullt:false, bilde:true},
  {id:'stengt',        opts:{data:STENGT,visBanner:false}, knapp:false, linje:false, fullt:false, bilde:true},
  {id:'stengt-banner', opts:{data:STENGT},                knapp:true,  linje:true,  fullt:false},
  {id:'fullt-uten-felt',opts:{data:FULLT_UTEN_FELT},      knapp:false, linje:false, fullt:true},
  {id:'uten-tjeneste', opts:{data:UTEN_TJENESTE},         knapp:true,  linje:true,  fullt:false},
  {id:'data-feil',     opts:{data:null,dataStatus:500},   knapp:true,  linje:true,  fullt:false},
  {id:'ledig-uten-banner', opts:{data:LEDIG,visBanner:false}, knapp:false, linje:false, fullt:false},
];
for(const w of [320,375]){
  for(const c of OVERSIKT){
    if(w===320&&!c.bilde) continue;
    const {page,errs}=await nySide(w,c.opts);
    const f=[];
    const m={knapp:await synlig(page,'#storyOpenOversikt'), linje:await synlig(page,'#storyLedigeLinje'), fullt:await synlig(page,'#storyFullt')};
    for(const k of ['knapp','linje','fullt']) if(m[k]!==c[k]) f.push(`${k}=${m[k]}`);
    if(c.fullt){
      const t=await page.$eval('#storyFullt',e=>e.textContent.trim());
      if(t!=='Fullt de neste dagene') f.push(`tekst «${t}»`);
      const farge=await page.$eval('#storyFullt',e=>getComputedStyle(e).color);
      const mut=await page.evaluate(()=>{ const s=document.createElement('span'); s.style.color='var(--mut)'; document.body.appendChild(s); const c=getComputedStyle(s).color; s.remove(); return c; });
      if(farge!==mut) f.push(`ikke dempet (${farge})`);
    }
    if(c.bilde){
      // Uten knapp/linje (stengt): sentrer på periodevelgeren rett under, så tomrommet der «Fullt» ellers står synes.
      await page.$eval(c.fullt?'#storyFullt':(c.knapp?'#storyOpenOversikt':'#segs'),e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(200);
      const fil=path.join(OUT,`oversikt-${c.id}-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil);
    }
    push(`${w} Oversikt ${c.id}`,f,errs); await page.close();
  }
  // Generatoren: 409 ingen_ledige_tider. apne_dager:0 (alle stengt) → egen tekst; > 0 eller mangler → «Fullt».
  const FULLT_TEKST='Fullt de neste dagene. Det er ingen ledige tider å lage story av.';
  for(const [id,data,vent,bilde] of [['409',FULLT,FULLT_TEKST,true],['409-stengt',STENGT,'Du har stengt alle de neste dagene.',true],['409-uten-felt',FULLT_UTEN_FELT,FULLT_TEKST,false]]){
    if(!bilde&&w===320) continue;
    const {page,errs}=await nySide(w,{data,preview409:true});
    await page.evaluate(()=>window.aapneStory&&window.aapneStory()); await page.waitForTimeout(1500);
    const f=[];
    const t=await page.$eval('#storyFeil',e=>getComputedStyle(e).display!=='none'?e.textContent.trim():'—');
    if(t!==vent) f.push(`storyFeil «${t}»`);
    if(await page.$eval('#storyFrame',e=>getComputedStyle(e).visibility!=='hidden')) f.push('iframen (rått JSON) synes');
    if(bilde){ const fil=path.join(OUT,`generator-${id}-${w}.png`); await page.screenshot({path:fil}); bilder.push(fil); }
    push(`${w} generator ${id}`,f,errs); await page.close();
  }
}
await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
