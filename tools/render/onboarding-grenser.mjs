// tools/render/onboarding-grenser.mjs — kom-i-gang sjekker backendens grenser FØR innsending (14.10.2026).
// Onboarding har 3 innsendinger/time per IP, telt før validering — en feil skal aldri koste et forsøk.
//   • Tjenester: rad med feil forsvinner ALDRI stille. Mangler pris/varighet/navn, pris > 100 000, varighet > 600
//     → melding i #svcErr, rødt felt, fokus, INGEN POST. Navn har maxlength 80. Helt tomme rader hoppes over.
//   • Bilder: kun jpeg/png/webp/heic/heif ≤ 20 MB, maks 10. Avviste filer listes med grunn i #imgErr.
//   • Åpningstider: åpning 23:45 → lukketid 23:59 finnes og sendes (før: tom liste → 18:00 → 400).
//   • Salongnavn maxlength 100. Gyldig skjema → nøyaktig ÉN POST.
// POST /api/onboarding mockes (400 uten slug → ingen redirect); alt mot api.trybarberhq.com fanges.
//   node tools/render/onboarding-grenser.mjs   → .render-ut/onboarding-grenser/*.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/onboarding-grenser');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;
const PNG1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

let prodForsok=0, prodFanget=0;
const browser=await chromium.launch();
async function steg2(bredde){
  const page=await browser.newPage({viewport:{width:bredde,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('dialog',d=>d.dismiss());
  const poster=[];
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',async r=>{ prodFanget++;
    const req=r.request();
    if(new URL(req.url()).pathname==='/api/onboarding'&&req.method()==='POST'){ poster.push(req.postDataBuffer()?.toString('latin1')||''); return r.fulfill({status:400,contentType:'application/json',body:'{"error":"mock"}'}); }
    return r.fulfill({status:200,contentType:'application/json',body:'{}'}); });
  await page.goto(`http://localhost:${PORT}/no/kom-i-gang.html`,{waitUntil:'networkidle'});
  await page.fill('#o-name','Sander Saxe'); await page.fill('#o-shop','Saxe Cuts'); await page.fill('#o-email','s@saxe.no');
  await page.evaluate(()=>submitOb()); await page.waitForTimeout(300);
  return {page,errs,poster};
}
const tjenester=async(page,rader)=>page.evaluate(rader=>{
  const list=document.getElementById('svcList'); list.innerHTML='';
  for(const [n,p,m] of rader){ list.appendChild(svcRow(n,p,m)); }
},rader);
const svcErr=page=>page.$eval('#svcErr',e=>e.textContent.trim());
const rapport=[]; const bilder=[];
const push=(n,f,errs)=>rapport.push({sjekk:n,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs.length?errs.join('; '):'ingen'});
const bilde=async(page,navn,sel)=>{ await page.waitForTimeout(700); await page.$eval(sel,e=>e.scrollIntoView({block:'center'})); await page.waitForTimeout(400);  // 700 ms: la den myke rullingen fra innsendingen bli ferdig først
  const fil=path.join(OUT,navn+'.png'); await page.screenshot({path:fil}); bilder.push(fil); };

// ── Tjenester ──
const SVC_CASES=[
  {id:'uten-pris',      rader:[['Hårklipp','450','30'],['Skjegg','','20']], msg:'«Skjegg» mangler pris.', felt:'.svc-price', rad:1, bilde:true},
  {id:'uten-varighet',  rader:[['Hårklipp','450','']], msg:'«Hårklipp» mangler varighet i minutter.', felt:'.svc-min', rad:0},
  {id:'uten-navn',      rader:[['Hårklipp','450','30'],['','300','20']], msg:'Gi tjenesten et navn, eller fjern raden.', felt:'.svc-name', rad:1, bilde:true},
  {id:'pris-for-hoy',   rader:[['Pakke','150000','60']], msg:'Prisen kan være maks 100 000 kr.', felt:'.svc-price', rad:0},
  {id:'varighet-for-lang',rader:[['Kur','900','700']], msg:'Varigheten kan være maks 600 minutter.', felt:'.svc-min', rad:0},
  {id:'tom-rad-ok',     rader:[['Hårklipp','450','30'],['','','']], msg:'', post:1},
];
for(const w of [320,375]){
  for(const c of SVC_CASES){
    if(w===320&&!c.bilde) continue;
    const {page,errs,poster}=await steg2(w);
    await tjenester(page,c.rader);
    await page.click('#finalBtn'); await page.waitForTimeout(500);
    const f=[];
    const t=await svcErr(page); if(t!==c.msg) f.push(`svcErr «${t}»`);
    if(poster.length!==(c.post||0)) f.push(`POST=${poster.length}`);
    if(c.felt){
      const m=await page.evaluate(({felt,rad})=>{ const el=document.querySelectorAll('#svcList .svc-row')[rad].querySelector(felt);
        return {rod:getComputedStyle(el).borderColor, fokus:document.activeElement===el}; },{felt:c.felt,rad:c.rad});
      if(m.rod!=='rgb(192, 89, 74)') f.push(`felt ikke rødt (${m.rod})`);
      if(!m.fokus) f.push('fokus ikke i feltet');
    }
    if(c.bilde) await bilde(page,`tjeneste-${c.id}-${w}`,'#svcErr');
    push(`${w} tjeneste ${c.id}`,f,errs); await page.close();
  }
}
// ── Tjenesteradene: ×-knappen flukter med pris/min (samme høyde + bunnlinje), plassholder er ikke et tall ──
for(const w of [320,375]){
  const {page,errs}=await steg2(w);
  await tjenester(page,[['Hårklipp','450','30'],['Skjegg','','']]);
  const f=[];
  const m=await page.evaluate(()=>[...document.querySelectorAll('#svcList .svc-row')].map(r=>{
    const b=s=>r.querySelector(s).getBoundingClientRect();
    return {pris:b('.svc-price'),min:b('.svc-min'),rm:b('.svc-rm'),ph:[r.querySelector('.svc-price').placeholder,r.querySelector('.svc-min').placeholder]};
  }));
  m.forEach((r,i)=>{
    if(Math.abs(r.rm.bottom-r.pris.bottom)>0.5||Math.abs(r.rm.bottom-r.min.bottom)>0.5) f.push(`rad ${i}: bunn × ${r.rm.bottom} ≠ felt ${r.pris.bottom}`);
    if(Math.abs(r.rm.height-r.pris.height)>0.5) f.push(`rad ${i}: høyde × ${r.rm.height} ≠ felt ${r.pris.height}`);
    if(r.ph.join()!=='Pris,Min') f.push(`rad ${i}: plassholder ${r.ph.join()}`);
  });
  await bilde(page,`tjenesterader-${w}`,'#svcList');
  push(`${w} tjenesterader: × flukter, plassholder`,f,errs); await page.close();
}
// ── Bilder ──
for(const w of [320,375]){
  const {page,errs}=await steg2(w);
  const f=[];
  await page.setInputFiles('#fileInput',[
    {name:'klipp.png',mimeType:'image/png',buffer:PNG1},
    {name:'animasjon.gif',mimeType:'image/gif',buffer:Buffer.from('GIF89a')},
    {name:'logo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')},
    {name:'stort.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(20*1024*1024+1,0xff)},
    {name:'fade.heic',mimeType:'image/heic',buffer:PNG1},
  ]);
  await page.waitForTimeout(300);
  const n=await page.$$eval('#thumbs .thumb',t=>t.length); if(n!==2) f.push(`${n} bilder lagt til (ventet 2: png + heic)`);
  const t=await page.$eval('#imgErr',e=>e.textContent.trim());
  const VENT='Ikke lagt til: animasjon.gif (filtypen støttes ikke), logo.svg (filtypen støttes ikke), stort.jpg (over 20 MB). Bruk JPG, PNG, WebP eller HEIC under 20 MB.';
  if(t!==VENT) f.push(`imgErr «${t}»`);
  await bilde(page,`bilder-${w}`,'#imgErr');
  if(w===375){
    // Maks 10: 9 til → 1 avvist med grunn
    await page.setInputFiles('#fileInput',Array.from({length:9},(_,i)=>({name:`b${i}.png`,mimeType:'image/png',buffer:PNG1})));
    await page.waitForTimeout(200);
    const n2=await page.$$eval('#thumbs .thumb',t=>t.length); if(n2!==10) f.push(`${n2} bilder etter 9 til (ventet 10)`);
    const t2=await page.$eval('#imgErr',e=>e.textContent.trim()); if(!t2.includes('b8.png (maks 10 bilder)')) f.push(`maks-melding «${t2}»`);
  }
  push(`${w} bilder`,f,errs); await page.close();
}
// ── Åpningstider 23:45 + gyldig innsending (ÉN POST) ──
{
  const {page,errs,poster}=await steg2(375);
  await tjenester(page,[['Hårklipp','450','30']]);
  const f=[];
  const r=await page.evaluate(()=>{ const row=document.querySelector('#hrsList .hrs-row'); const o=row.querySelector('.hrs-open'), c=row.querySelector('.hrs-close');
    row.querySelector('.hrs-on').checked=true; row.classList.remove('off');
    o.value='23:45'; o.dispatchEvent(new Event('change',{bubbles:true}));
    return {valg:[...c.options].map(x=>x.value), verdi:c.value, wd:row.dataset.weekday}; });
  if(r.valg.join()!=='23:59'||r.verdi!=='23:59') f.push(`lukketid-valg ${JSON.stringify(r.valg)} verdi ${r.verdi}`);
  // Vanlig dag: 23:59 er siste valg også der
  const siste=await page.evaluate(()=>{ const c=document.querySelectorAll('#hrsList .hrs-close')[1]; return c.options[c.options.length-1].value; });
  if(siste!=='23:59') f.push(`siste lukketid ${siste}`);
  // Åpningstid-lista får IKKE 23:59 (ville gitt tom lukketid igjen)
  if(await page.evaluate(()=>[...document.querySelector('.hrs-open').options].some(x=>x.value==='23:59'))) f.push('23:59 i åpningstid-lista');
  await page.click('#finalBtn'); await page.waitForTimeout(600);
  if(poster.length!==1) f.push(`POST=${poster.length} (ventet 1)`);
  else{
    const m=poster[0].match(/name="hours"\r\n\r\n([^\r]*)/); const hours=m?JSON.parse(m[1]):[];
    const dag=hours.find(h=>String(h.weekday)===r.wd);
    if(!dag||dag.open_time!=='23:45'||dag.close_time!=='23:59'||dag.is_closed) f.push(`sendt ${JSON.stringify(dag)}`);
  }
  if(await page.$eval('#o-shop',e=>e.maxLength)!==100) f.push('salongnavn maxlength ≠ 100');
  if(await page.$eval('#svcList .svc-name',e=>e.maxLength)!==80) f.push('tjenestenavn maxlength ≠ 80');
  push('åpning 23:45 → 23:59 sendes, én POST, maxlength',f,errs); await page.close();
}

await browser.close(); server.close();
rapport.push({sjekk:'ingen request når prod',resultat:prodForsok===prodFanget?'OK ✓':`✗ ${prodForsok} forsøk, ${prodFanget} fanget`,jsfeil:'—'});
console.table(rapport);
console.log('Bilder:\n'+bilder.join('\n'));
process.exit(rapport.some(r=>r.resultat.startsWith('✗')||(r.jsfeil!=='ingen'&&r.jsfeil!=='—'))?1:0);
