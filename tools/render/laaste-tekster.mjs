// Låste tekster i ny modell (Henrik 09.10.2026): support-FAQ, vanlige-sporsmal (synlig + FAQPage JSON-LD),
// vilkar (Pris → Hvis en betaling feiler + dato), Konto-finskriften og Vekst-fanens SMS-påminnelse.
// Måler at tekstene står ordrett, at synlig FAQ og JSON-LD er like, at det ikke er tankestreker i ny tekst,
// og at ingen gammel modell står igjen. Skjermbilder 320/375 til .render-ut/laaste-tekster/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut/laaste-tekster');
fs.mkdirSync(OUT,{recursive:true});
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const server=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{if(e){r.writeHead(404);r.end('404');return;}
    r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});r.end(b);});});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const SUPPORT='Gratis trenger du aldri si opp. Vekst sier du opp selv under Konto i dashbordet. Du beholder Vekst ut perioden du har betalt for, og deretter går du over til Gratis. Siden din blir stående.';
const FAQ={
  'Hva koster BarberHQ?':'Bookingsiden er gratis, uten kort. Vekst koster 179 kr/mnd eks. mva og har 100 SMS inkludert hver måned. Ingen binding og ingen etableringsgebyr.',
  'Er det gratis?':'Ja. Bookingsiden, kalenderen og dashbordet er gratis, og du trenger ikke legge inn kort. Vil du ha rebooking, vinn tilbake, verving og lojalitet, oppgraderer du til Vekst når du vil.',
  'Tar BarberHQ gebyr per booking?':'Nei. Vi tar aldri provisjon per booking. Gratis koster ingenting, og på Vekst betaler du den faste månedsprisen.',
  'Sender BarberHQ SMS til kundene?':'Ja, med SMS-pakke eller Vekst. Kunden får en påminnelse på SMS dagen før timen. Vekst har 100 SMS inkludert hver måned, og kunder som har sagt ja til SMS får også beskjed når det er tid for ny klipp. På Gratis kjøper du SMS-pakker som aldri utløper.',
  'Hva er forskjellen på Gratis og Vekst?':'Gratis gir deg bookingside, kalender, dashbord, Google Calendar-synk og «Lag story» med ledige timer. SMS-påminnelser kjøper du som SMS-pakker. Vekst legger til automatisk rebooking på SMS, vinn tilbake, verving med rabatt, lojalitetsprogram og oversikt over hvor kundene kommer fra, og har 100 SMS inkludert hver måned.',
  'Betaler kundene gjennom BarberHQ?':'Nei. Kundene betaler deg direkte, som før, og booking krever ikke kort.',
  'Kan jeg si opp når jeg vil?':'Ja. Gratis har ingenting å si opp. Vekst sier du opp fra Konto-fanen i dashbordet. Du beholder Vekst ut perioden du har betalt for, og så går du over til Gratis. Siden din blir stående.',
};
const META_OG='Svar på vanlige spørsmål om BarberHQ: pris, Gratis og Vekst, SMS-påminnelser, betaling og oppsigelse.';
const META_DESC='Svar på vanlige spørsmål om BarberHQ, bookingside for barbere i Norge: pris, Gratis og Vekst, SMS-påminnelser, betaling og oppsigelse.';
const INGRESS='Alt du lurer på om BarberHQ: pris, SMS, betaling og oppsigelse.';
const VILKAR={
  'Pris':['Gratis koster ingenting. Du trenger ikke legge inn betalingskort for å bruke Gratis.',
          'Vekst koster 179 kr per måned eks. mva. Vekst har 100 SMS inkludert hver måned. SMS utover de 100 koster 1,21 kr per SMS eks. mva og legges på neste faktura. Det er et tak på 400 kr i måneden for slike SMS.',
          'Ingen binding, ingen etableringsgebyr.'],
  'SMS-pakker':['På Gratis kan du kjøpe SMS-pakker. En SMS-pakke er et engangskjøp, ikke et abonnement. Kjøpte SMS utløper ikke. Prisen står i dashbordet før du kjøper. Kjøpte SMS følger kontoen din og beholdes hvis du bytter mellom Gratis og Vekst.'],
  'Betaling':['Betaling håndteres av Stripe. Vi lagrer aldri kortnummeret ditt. Vekst trekkes når du oppgraderer, og deretter månedlig. SMS utover det inkluderte legges på neste faktura. SMS-pakker betales når du kjøper dem.'],
  'Oppsigelse':['Du kan si opp Vekst når som helst fra Konto-fanen i dashbordet. Oppsigelsen gjelder fra slutten av perioden du har betalt for. Ut perioden beholder du Vekst. Deretter går du over til Gratis, og bookingsiden din blir stående. Vi ber ikke om en begrunnelse, og du trenger ikke kontakte oss først.'],
  'Hvis en betaling feiler':['Feiler et trekk for Vekst, ber vi deg oppdatere kortet. Til betalingen går gjennom, sendes ingen SMS. Bookingsiden blir stående, og innholdet ditt slettes ikke. Går betalingen ikke gjennom etter Stripes nye forsøk, avsluttes Vekst, og du går over til Gratis.'],
};
// vilkar «SMS»: avsnitt + listepunkter (li), låst 09.10. Vervevarsel-linja er sjekket mot backend
// (sweepVerveVarsler: til ververen når belønningen er klar, krever samtykke + ikke avmeldt, sperret på Gratis).
const VILKAR_SMS={ p:['BarberHQ sender tre typer meldinger til kundene dine på dine vegne:',
    'Kunden kan melde seg av rebooking og vervevarsler når som helst via lenken i meldingen. Avmelding gjelder umiddelbart og påvirker ikke påminnelser om timer kunden faktisk har bestilt.'],
  li:['Påminnelse dagen før en time som er booket. Den sendes når påminnelser er slått på og du har Vekst eller SMS igjen fra en SMS-pakke.',
    'Rebooking på Vekst: en melding når det er en stund siden sist, som du selv slår på og styrer intervallet for. Den sendes bare til kunder som har sagt ja, og aldri til noen som har meldt seg av.',
    'Vervevarsel på Vekst: en melding til en kunde som har vervet noen, når belønningen er klar.'] };
const PRIS_UNDER='Bookingsiden, kalenderen og dashbordet koster ingenting.';
const KONTO_GRATIS='Bookingsiden, kalenderen og dashbordet er gratis.';
const FIN='Etter 100 SMS: 1,21 kr per SMS på neste faktura. Maks 400 kr i måneden.';
const PAAM='Kunden får én SMS dagen før timen. Færre glemte avtaler.';
const GAMMEL=/uten tidsfrist|depositum|30 dager gratis|gratis prøveperiode|prøveperiode\b|Basis|89 kr|med mindre du endrer det|kvelden før|tas bookingsiden ned/i;

const browser=await chromium.launch();
let prodForsok=0, prodAvbrutt=0;
const rapport=[]; const push=(navn,f,errs)=>rapport.push({sjekk:navn,resultat:f.length?'✗ '+f.join(' | '):'OK ✓',jsfeil:errs&&errs.length?errs.join('; '):'ingen'});
async function aapne(side,b,billing){
  const page=await browser.newPage({viewport:{width:b,height:900},deviceScaleFactor:2});
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  page.on('request',q=>{ if(new URL(q.url()).hostname==='api.trybarberhq.com') prodForsok++; });
  await page.route(u=>u.hostname==='api.trybarberhq.com',r=>{ prodAvbrutt++; return r.abort(); });
  await page.route('**/api/**',r=>{ const p=new URL(r.request().url()).pathname;
    if(new URL(r.request().url()).hostname==='api.trybarberhq.com') prodAvbrutt++;
    const body=p.endsWith('/billing/status')&&billing?billing:p.endsWith('/profile')?{hasPassword:true,slug:'grand-barber',shop:'Grand Barber'}
      :p.endsWith('/settings')?{sms_paaminnelse_enabled:true,sms_rebooking_enabled:false,rebooking_interval_days:35}
      :/images|bookings|recent|services|hours|referrals|winback|rebooking/.test(p)?[]:{};
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)}); });
  await page.goto(`http://localhost:${PORT}/no/${side}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in','vis','visible')));
  await page.waitForTimeout(500);
  return {page,errs};
}
const norm=t=>String(t||'').replace(/ /g,' ').replace(/\s+/g,' ').trim();

for(const b of [320,375]){
  { // support.html
    const {page,errs}=await aapne('support.html',b);
    const item=page.locator('.faq-item',{hasText:'Hvordan sier jeg opp?'});
    const svar=norm(await item.locator('p').textContent());
    const f=[]; if(svar!==SUPPORT) f.push(`svar «${svar}»`); if(svar.includes('—')) f.push('tankestrek');
    if(b===375) push('support: «Hvordan sier jeg opp?»',f,errs);
    await item.scrollIntoViewIfNeeded(); await item.screenshot({path:path.join(OUT,`${b}-support-oppsigelse.png`)});
    await page.close();
  }
  { // vanlige-sporsmal.html
    const {page,errs}=await aapne('vanlige-sporsmal.html',b);
    const m=await page.evaluate(()=>{
      const vis={}; document.querySelectorAll('.faq-q').forEach(h=>{ const p=h.nextElementSibling; vis[h.textContent.trim()]=p?p.textContent.trim():''; });
      let ld=null, feil=null; try{ ld=JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); }catch(e){ feil=e.message; }
      return { vis, ld, feil, og:document.querySelector('meta[property="og:description"]').content,
        tw:document.querySelector('meta[name="twitter:description"]').content, desc:document.querySelector('meta[name="description"]').content,
        ingress:(document.querySelector('header p, .ph-hero p, main p')||{}).textContent||'', helTekst:document.body.innerText };
    });
    const f=[];
    if(m.feil) f.push(`JSON-LD ugyldig: ${m.feil}`);
    else {
      if(m.ld['@type']!=='FAQPage') f.push('JSON-LD er ikke FAQPage');
      const ldMap={}; m.ld.mainEntity.forEach(q=>{ ldMap[q.name]=q.acceptedAnswer.text; });
      if(Object.keys(ldMap).length!==m.ld.mainEntity.length) f.push('dupliserte spørsmål i JSON-LD');
      if(JSON.stringify(Object.keys(ldMap))!==JSON.stringify(Object.keys(m.vis))) f.push('spørsmålene i JSON-LD ≠ synlige');
      for(const q of Object.keys(m.vis)) if(norm(m.vis[q])!==norm(ldMap[q])) f.push(`ulik synlig/JSON-LD: «${q}»`);
      for(const [q,a] of Object.entries(FAQ)){ if(norm(m.vis[q])!==a) f.push(`synlig «${q}»`); if(norm(ldMap[q])!==a) f.push(`JSON-LD «${q}»`); if(a.includes('—')) f.push('tankestrek i låst tekst'); }
    }
    if(m.og!==META_OG||m.tw!==META_OG) f.push('og/twitter-description'); if(m.desc!==META_DESC) f.push('description');
    if(!m.helTekst.includes(INGRESS)) f.push('ingress');
    const g=m.helTekst.match(GAMMEL); if(g) f.push(`gammel modell: «${g[0]}»`);
    if(b===375) push('vanlige-sporsmal: synlig + JSON-LD + meta',f,errs);
    for(const [i,q] of ['Hva koster BarberHQ?','Er det gratis?','Tar BarberHQ gebyr per booking?','Sender BarberHQ SMS til kundene?','Hva er forskjellen på Gratis og Vekst?','Betaler kundene gjennom BarberHQ?','Kan jeg si opp når jeg vil?'].entries()){
      const h=page.locator('.faq-q',{hasText:q}).first(); const blokk=h.locator('xpath=..');
      await blokk.scrollIntoViewIfNeeded(); await blokk.screenshot({path:path.join(OUT,`${b}-faq-${i+1}.png`)});
    }
    const top=page.locator('header, .ph-hero').first(); await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(OUT,`${b}-faq-ingress.png`),clip:{x:0,y:0,width:b,height:520}});
    await page.close();
  }
  { // priser.html: undertekst under «Gratis booking. Betal for vekst.» + betalings-FAQ (likt vanlige-sporsmal)
    const {page,errs}=await aapne('priser.html',b);
    const under=norm(await page.$eval('.ph-hero p',e=>e.textContent));
    const linjer=await page.$eval('.ph-hero p',e=>{ const out=[]; let y=null; const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT); let n;
      while((n=w.nextNode())){ const re=/\S+/g; let m; while((m=re.exec(n.data))){ const r=document.createRange(); r.setStart(n,m.index); r.setEnd(n,m.index+m[0].length);
        const top=Math.round(r.getBoundingClientRect().top); if(y===null||Math.abs(top-y)>4){out.push([]);y=top;} out.at(-1).push(m[0]); } }
      return out.map(l=>l.join(' ')); });
    const item=page.locator('.faq-item',{hasText:'Betaler kundene gjennom BarberHQ?'});
    const qa=norm(await item.locator('h4').textContent())+' | '+norm(await item.locator('p').textContent());
    const hel=await page.evaluate(()=>document.body.innerText);
    const f=[];
    if(under!==PRIS_UNDER) f.push(`undertekst «${under}»`);
    if(linjer.length>1&&!linjer.at(-1).includes(' ')) f.push(`enkeltord alene: ${linjer.map(x=>'«'+x+'»').join(' / ')}`);
    if(qa!=='Betaler kundene gjennom BarberHQ? | '+FAQ['Betaler kundene gjennom BarberHQ?']) f.push(`FAQ «${qa}»`);
    const g=hel.match(/uten tidsfrist|depositum/i); if(g) f.push(`gammel tekst «${g[0]}»`);
    push(`priser @${b}: undertekst (${linjer.map(x=>'«'+x+'»').join(' / ')}) + betalings-FAQ`,f,errs);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(OUT,`${b}-priser-undertekst.png`),clip:{x:0,y:0,width:b,height:420}});
    await item.scrollIntoViewIfNeeded(); await item.screenshot({path:path.join(OUT,`${b}-priser-faq-betaling.png`)});
    await page.close();
  }
  { // vilkar.html
    const {page,errs}=await aapne('vilkar.html',b);
    const m=await page.evaluate((navn)=>{ const ut={};
      document.querySelectorAll('h2').forEach(h=>{ if(!navn.includes(h.textContent.trim()))return; const ps=[]; let e=h.nextElementSibling;
        while(e&&e.tagName!=='H2'){ if(e.tagName==='P')ps.push(e.textContent.trim()); e=e.nextElementSibling; } ut[h.textContent.trim()]=ps; });
      return {seksjoner:ut, dato:(document.querySelector('.oppdatert')||{}).textContent||''}; }, Object.keys(VILKAR));
    const f=[];
    for(const [h,ps] of Object.entries(VILKAR)){ const v=(m.seksjoner[h]||[]).map(norm);
      if(JSON.stringify(v)!==JSON.stringify(ps)) f.push(`«${h}»: ${JSON.stringify(v)}`); if(ps.join(' ').includes('—')) f.push(`tankestrek i «${h}»`); }
    if(m.dato.trim()!=='Sist oppdatert: 9. oktober 2026') f.push(`dato «${m.dato}»`);
    const sms=await page.evaluate(()=>{ const h=[...document.querySelectorAll('h2')].find(x=>x.textContent.trim()==='SMS'); const p=[],li=[]; let e=h.nextElementSibling;
      while(e&&e.tagName!=='H2'){ if(e.tagName==='P')p.push(e.textContent.trim()); if(e.tagName==='UL')e.querySelectorAll('li').forEach(l=>li.push(l.textContent.trim())); e=e.nextElementSibling; }
      return {p,li}; });
    if(JSON.stringify(sms.p.map(norm))!==JSON.stringify(VILKAR_SMS.p)) f.push(`«SMS» avsnitt ${JSON.stringify(sms.p)}`);
    if(JSON.stringify(sms.li.map(norm))!==JSON.stringify(VILKAR_SMS.li)) f.push(`«SMS» punkter ${JSON.stringify(sms.li)}`);
    if([...sms.p,...sms.li].join(' ').includes('—')) f.push('tankestrek i «SMS»');
    if(/tidsfrist|sendes uansett/.test(await page.evaluate(()=>document.body.innerText))) f.push('«tidsfrist»/«sendes uansett» står igjen');
    if(b===375) push('vilkar: Pris → Hvis en betaling feiler + dato',f,errs);
    const clip=await page.evaluate(()=>{ const hs=[...document.querySelectorAll('h2')]; const a=hs.find(h=>h.textContent.trim()==='Pris'), z=hs.find(h=>h.textContent.trim()==='Angrerett');
      return {y:a.getBoundingClientRect().top+scrollY-16, h:z.getBoundingClientRect().top-a.getBoundingClientRect().top+8}; });
    await page.addStyleTag({content:'nav{visibility:hidden!important}'});
    await page.screenshot({path:path.join(OUT,`${b}-vilkar-pris-til-betaling-feiler.png`),clip:{x:0,y:clip.y,width:b,height:clip.h},fullPage:true});
    const smsClip=await page.evaluate(()=>{ const hs=[...document.querySelectorAll('h2')]; const a=hs.find(h=>h.textContent.trim()==='SMS'), z=a.nextElementSibling&&hs[hs.indexOf(a)+1];
      return {y:a.getBoundingClientRect().top+scrollY-16, h:z.getBoundingClientRect().top-a.getBoundingClientRect().top+8}; });
    await page.screenshot({path:path.join(OUT,`${b}-vilkar-sms.png`),clip:{x:0,y:smsClip.y,width:b,height:smsClip.h},fullPage:true});
    await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(150);
    await page.screenshot({path:path.join(OUT,`${b}-vilkar-dato.png`),clip:{x:0,y:0,width:b,height:420}});
    await page.close();
  }
  { // dashboard: Konto-finskrift (Gratis-boksen) + Vekst-fanens SMS-påminnelse
    const gratis={subscription_status:null,page_status:'live',plan:null,effective_plan:'basis',effective_plan_grunn:'gratis',trial_days_left:null,
      needs_attention:false,attention_grunn:null,cancel_at_period_end:false,current_period_end:null,sms_saldo:0,sms_pakke_kan_kjopes:false};
    const {page,errs}=await aapne('dashboard.html',b,gratis);
    await page.$eval('button[data-panel="abonnement"]',x=>x.click());
    await page.evaluate(()=>{ const h=document.querySelector('#accAbonnement .acc-head'); if(h.getAttribute('aria-expanded')!=='true')h.click(); });
    await page.waitForTimeout(400);
    const fin=norm(await page.$eval('#kontoOppFin',e=>e.textContent));
    const gratisTekst=norm(await page.$eval('#kontoTekst',e=>e.textContent));
    await page.locator('#accAbonnement').screenshot({path:path.join(OUT,`${b}-konto-gratis.png`)});
    await page.locator('#kontoOpp').screenshot({path:path.join(OUT,`${b}-konto-finskrift.png`)});
    await page.$eval('button[data-panel="vekst"]',x=>x.click()); await page.waitForTimeout(600);
    const paam=norm(await page.$eval('#accPaam .acc-sub',e=>e.textContent));
    await page.locator('#accPaam').screenshot({path:path.join(OUT,`${b}-vekst-sms-paaminnelse.png`)});
    if(b===375) push('dashboard: Konto Gratis-tekst + finskrift + Vekst-påminnelse',[...(gratisTekst===KONTO_GRATIS?[]:[`Gratis-tekst «${gratisTekst}»`]),...(fin===FIN?[]:[`finskrift «${fin}»`]),...(paam===PAAM?[]:[`påminnelse «${paam}»`]),...(paam.includes('—')?['tankestrek']:[])],errs);
    await page.close();
  }
}
push('ingen request til prod', prodForsok===prodAvbrutt?[]:[`${prodForsok} forsøk, ${prodAvbrutt} avbrutt`]);
console.table(rapport);
const feilet=rapport.filter(r=>r.resultat!=='OK ✓'||r.jsfeil!=='ingen');
console.log(feilet.length?`\n${feilet.length} FEIL`:'\nAlt grønt','— bilder i',OUT);
await browser.close(); server.close();
process.exit(feilet.length?1:0);
