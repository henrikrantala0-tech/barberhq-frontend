import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const ROOT = path.resolve(import.meta.dirname, '../../site');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:320,height:800},deviceScaleFactor:2});
await page.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"hasPassword":true,"daily":[],"months":[]}'}));
await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(1000);

const res=await page.evaluate(()=>{
  const nav=document.querySelector('nav.nav');
  const alle=[...document.querySelectorAll('.nav button[data-panel], .nav-mer-meny button[data-panel]')];
  alle.forEach(b=>{nav.appendChild(b);b.style.display='inline-block';});
  const toggle=document.querySelector('.nav-mer-toggle');
  const merDot=document.querySelector('#merDot'); if(merDot)merDot.hidden=true; // fjernes uansett
  const bredder={}; alle.forEach(b=>bredder[b.dataset.panel]=Math.round(b.getBoundingClientRect().width));
  const toggleB=Math.round(toggle.getBoundingClientRect().width);

  // Prioritert rekkefølge: det som IKKE får plass går i «Mer»
  const PRI=['oversikt','abonnement','design','vekst','tjenester'];
  const NAVN={oversikt:'Oversikt',abonnement:'Konto',design:'Din side',vekst:'Vekst',tjenester:'Tjenester & tider'};
  const A320=272, A402=354;
  const ut=[];
  for(let k=2;k<=5;k++){
    const synlige=PRI.slice(0,k);
    const iMer=PRI.slice(k);
    const sumB=synlige.reduce((a,p)=>a+bredder[p],0);
    for(const marg of [26,20,16,12]){
      // hver synlig knapp har margin-right; toggelen kommer etter (kun når noe er i Mer)
      const sum=sumB+marg*synlige.length+(iMer.length?toggleB:0);
      ut.push({ 'synlige':synlige.map(p=>NAVN[p]).join(' · '),
                'i Mer':iMer.length?iMer.map(p=>NAVN[p]).join(' · '):'(ingen)',
                marg, 'sum px':sum, 'klaring 320':A320-sum, 'klaring 402':A402-sum,
                'krav ≥12 @320':(A320-sum)>=12?'OK ✓':'nei' });
    }
  }
  return {bredder,toggleB,ut};
});
console.log('knappebredder:',JSON.stringify(res.bredder));
console.log('«Mer»-toggelen:',res.toggleB,'px');
console.log('tilgjengelig — 320: 272 px | 402: 354 px\n');
console.table(res.ut);
await browser.close(); server.close();
