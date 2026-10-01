// tools/render/overflow-kom-i-gang.mjs — horisontal-overflow + iOS-zoom-vakt for kom-i-gang.html (WebKit).
// To ting som begge gir sidelengs-swipe på iPhone:
//   1) STATISK overflow: et element stikker forbi innerWidth. Vi NØYTRALISERER body{overflow-x:hidden}
//      først (den plasteret KLIPPER overflowen → scrollWidth lyver), så ekte contributors eksponeres.
//   2) iOS ZOOM-ON-FOCUS: et skjemafelt < 16px zoomer iOS inn ved fokus, «og den zoomede sida kan dras
//      sidelengs» (samme rot-årsak som dashbordet). Vakt: ALLE input/select/textarea må være ≥16px.
// Skanner begge steg (1 + 2) på iPhone-breddene 320–440. Mocker ALT /api/** (aldri prod). Exit 1 ved regresjon.
//   node tools/render/overflow-kom-i-gang.mjs
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { webkit } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const WIDTHS=[320,375,390,393,402,430,440];

// Innerste element som stikker forbi innerWidth (ingen barn når like langt).
const DETECT=(W)=>{
  const EPS=0.5, out=[];
  const sel=(el)=>{ let s=el.tagName.toLowerCase(); if(el.id) s+='#'+el.id;
    if(el.classList.length) s+='.'+[...el.classList].slice(0,3).join('.');
    if(el.getAttribute&&el.getAttribute('type')) s+='[type='+el.getAttribute('type')+']'; return s; };
  for(const el of document.body.querySelectorAll('*')){
    const rects=el.getClientRects(); if(!rects.length) continue;
    const r=el.getBoundingClientRect(); if(r.right<=W+EPS || r.width<=0) continue;
    let childReaches=false;
    for(const c of el.children){ if(c.getBoundingClientRect().right>=r.right-1){ childReaches=true; break; } }
    if(childReaches) continue;
    const cs=getComputedStyle(el);
    out.push({sel:sel(el),right:Math.round(r.right),over:Math.round(r.right-W),width:Math.round(r.width),
      minWidth:cs.minWidth,whiteSpace:cs.whiteSpace,flexShrink:cs.flexShrink});
  }
  const map=new Map(); for(const o of out){ const e=map.get(o.sel); if(!e||o.over>e.over) map.set(o.sel,{...o,n:(e?e.n:0)+1}); else e.n++; }
  return [...map.values()].sort((a,b)=>b.over-a.over);
};
// Alle skjemafelt < 16px (iOS-zoom-trigger).
const SUB16=()=>{ const out=[];
  for(const el of document.querySelectorAll('input,select,textarea')){
    if(el.type==='hidden') continue;
    const fs=parseFloat(getComputedStyle(el).fontSize)||0;
    if(fs<16){ let s=el.tagName.toLowerCase(); if(el.id)s+='#'+el.id; if(el.className&&typeof el.className==='string')s+='.'+el.className.split(/\s+/).slice(0,2).join('.'); if(el.type)s+='[type='+el.type+']'; out.push({sel:s,fs}); } }
  // dedupe
  const m=new Map(); for(const o of out){ const e=m.get(o.sel); if(!e) m.set(o.sel,{...o,n:1}); else e.n++; } return [...m.values()];
};

const browser=await webkit.launch();
const overflowFunn=[]; const zoomFunn=new Set(); const jsFeil=[];
async function toStep2(page){
  await page.fill('#o-name','Henrik'); await page.fill('#o-shop','Grand Barber Oslo'); await page.fill('#o-email','ny@barber.no');
  await page.click('button[onclick="submitOb()"]'); await page.waitForTimeout(400);
  await page.fill('#svcList .svc-row:first-child .svc-name','Herreklipp');
  await page.fill('#svcList .svc-row:first-child .svc-price','450');
  await page.fill('#svcList .svc-row:first-child .svc-min','30'); await page.waitForTimeout(150);
}
for(const w of WIDTHS){
  const page=await browser.newPage({viewport:{width:w,height:844},deviceScaleFactor:2});
  page.on('pageerror',e=>{ if(!/ResizeObserver loop/i.test(e.message)) jsFeil.push(`${w}: ${e.message}`); });
  await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await page.goto(`http://localhost:${PORT}/no/kom-i-gang.html`,{waitUntil:'networkidle'});
  await page.addStyleTag({content:'html,body{overflow-x:visible !important}'});  // avslør ekte overflow
  await page.waitForTimeout(300);
  for(const steg of ['1','2']){
    if(steg==='2'){ await toStep2(page); await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight)); await page.waitForTimeout(200); }
    const doc=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth}));
    const hits=await page.evaluate(DETECT,w);
    if(hits.length||doc.sw>doc.iw) overflowFunn.push({steg,w,docOver:doc.sw-doc.iw,hits});
    (await page.evaluate(SUB16)).forEach(z=>zoomFunn.add(`${z.sel} = ${z.fs}px`));
  }
  await page.close();
}
await browser.close(); server.close();

let ok=true;
console.log('── STATISK OVERFLOW (overflow-x nøytralisert) ──');
if(!overflowFunn.length){ console.log('  ✓ ingen overflow på noen bredde/steg'); }
else { ok=false; for(const f of overflowFunn){ console.log(`  ✗ steg ${f.steg} @${f.w}px (docOver=${f.docOver})`);
  for(const h of f.hits) console.log(`      ${h.sel}${h.n>1?' ×'+h.n:''}  over +${h.over}px  min-width:${h.minWidth} white-space:${h.whiteSpace} flex-shrink:${h.flexShrink}`); } }
console.log('\n── iOS-ZOOM: felt < 16px ──');
if(!zoomFunn.size){ console.log('  ✓ alle input/select/textarea ≥16px'); }
else { ok=false; [...zoomFunn].sort().forEach(z=>console.log(`  ✗ ${z}  → iOS zoomer ved fokus → sidelengs-drag`)); }
console.log('\nJS-feil:', jsFeil.length?jsFeil.join(' | '):'ingen');
if(jsFeil.length) ok=false;
console.log('\nkom-i-gang overflow+zoom:', ok?'BESTÅTT ✓':'REGRESJON ✗');
process.exitCode = ok?0:1;
