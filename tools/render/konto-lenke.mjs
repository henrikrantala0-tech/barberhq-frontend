// Lenke-blokka i Konto (#pubLink) etter at den ble tilstandsstyrt av page_status.
// Tre tilstander skal falle ut av fem billing-svar:
//   live         → hele URL-en + kopi-ikonknapp (.pub-copy — lenkefeltet er delt med «Din side»)
//   forhandsvist → «Se forhåndsvisning» + note, INGEN kopier-knapp
//   nedtatt/draft→ ingenting
// Verifiserer også at det som havner på utklippstavla starter med https:// — uten protokoll
// autolinker verken Instagram eller SMS lenka, og da er den halvveis ubrukelig.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { gratis, prove, vekst } from './fixtures/billing.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../site');
const OUT  = path.resolve(import.meta.dirname, '../../.render-ut');
fs.mkdirSync(OUT,{recursive:true});

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css',
            '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(b); });
});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port;

const dager=n=>new Date(Date.now()-n*864e5).toISOString();

// Grenene i renderKonto, navngitt som i koden. Alle fem sender page_status — det er DET
// lenke-blokka leser, og poenget med testen er at billing-grenen ikke skal påvirke den.
const TILSTANDER=[
  // Billing fra den delte mocken (fixtures/billing.mjs, prismodellen 09.10). Myk periode og nedtaking
  // finnes ikke lenger: utløpt prøve = Gratis, og ingen side tas ned.
  ['B-live-prove',        prove({page_status:'live'}),
                          {lenke:true, kopier:true,  note:false}],
  ['C-live-prove-utlopt', gratis({page_status:'live',trial_start_at:dager(33),trial_days_left:0}),
                          {lenke:true, kopier:true,  note:false}],
  // Betalende barberer — sluttilstanden.
  ['F-active-live',       vekst({page_status:'live'}),
                          {lenke:true, kopier:true,  note:false}],
  ['A-forhandsvist',      gratis({page_status:'forhandsvist'}),
                          {lenke:true, kopier:false, note:true}],
  ['draft',               gratis({page_status:'draft'}),
                          {lenke:false,kopier:false, note:false}],
  // Samme tilstand som B, men uten navigator.clipboard — usikker kontekst eller avvist
  // tillatelse. Da går kopieringen via execCommand-fallbacken (kopierFallback), og haken skal
  // vises bare når den faktisk lyktes.
  ['B-uten-clipboard',    prove({page_status:'live'}),
                          {lenke:true, kopier:true,  note:false, utenClipboard:true}],
  // Live, men /profile svarer uten slug. Vi kjenner ikke adressen og skal derfor ikke tegne
  // noen — en gjettet URL er verre enn ingen. Testen finnes fordi vakten er ETT `if` som er
  // lett å flytte feil vei ved neste endring, og fordi den skal holde uten å kaste.
  ['live-uten-slug',      prove({page_status:'live'}),
                          {lenke:false,kopier:false, note:false, utenSlug:true}],
];

function ruter(page,billing,slug){
  return page.route('**/api/**',route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/dashboard/billing/status')
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(billing)});
    if(u.pathname==='/api/dashboard/profile'){
      // Sluggen utelates HELT (ikke tom streng) når den skal mangle — det er slik en
      // /profile-respons ser ut før barberen har fått en side.
      const p={hasPassword:true,name:'Henrik Rantala',shop:'Grand Barber',
               email:'henrik@grandbarber.no'};
      if(slug)p.slug=slug;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)});
    }
    if(u.pathname==='/api/dashboard/google/status')
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({connected:true,scope_ok:true,google_email:'henrik@grandbarber.no'})});
    if(u.pathname==='/api/dashboard/preview')
      return route.fulfill({status:200,contentType:'text/html',body:'<html><body></body></html>'});
    route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(/images|bookings|recent|services|hours/.test(u.pathname)?[]:{})});
  });
}

const browser=await chromium.launch();
const rapport=[];

for(const bredde of [320,402]){
  for(const [navn,billing,vent] of TILSTANDER){
    // Eget context per tilstand: clipboard-tillatelsene må stå FØR sida laster, og en frisk
    // context hindrer at utklippstavla fra forrige tilstand leses som denne tilstandens svar.
    const ctx=await browser.newContext({viewport:{width:bredde,height:900},deviceScaleFactor:2,
                                        permissions:['clipboard-read','clipboard-write']});
    const page=await ctx.newPage();
    const errs=[]; page.on('pageerror',e=>errs.push(e.message));
    // Må kjøre FØR sidas script: kopierLenke leser navigator.clipboard ved klikk, men
    // stubben skal ligge der fra første byte så ingenting rekker å cache referansen.
    if(vent.utenClipboard)
      await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});});
    await ruter(page,billing,vent.utenSlug?null:'grand-barber');
    await page.goto(`http://localhost:${PORT}/no/dashboard.html`,{waitUntil:'networkidle'});
    await page.$eval('button[data-panel="abonnement"]',b=>b.click());
    await page.waitForTimeout(1200);

    const m=await page.evaluate(()=>{
      const boks=document.querySelector('#pubLink');
      const synlig=!!boks&&boks.style.display!=='none'&&!!boks.offsetParent;
      const a=boks&&boks.querySelector('a');              // live: .pub-field>a.pub-url · forhandsvist: lenka rett i boksen
      const k=boks&&boks.querySelector('button.pub-copy');
      // Visningsteksten midt-forkortes (midtForkort) — den fulle visnings-URL-en står i data-full.
      return { lenke:synlig&&!!a, lenkeTekst:a?(a.dataset.full||a.textContent):'—', href:a?a.href:'—',
               // Begge lenkene (live-URL og forhåndsvisning) er SAMME node — men testen
               // sjekker dem per tilstand, ikke på antakelsen om at de deler kode.
               mal:a?(a.target+'/'+a.rel):'—',
               kopier:synlig&&!!k, kopierKlasse:k?k.className:'—',
               note:!!(boks&&boks.querySelector('.pub-note')) };
    });

    // Kopier-knappen: klikk, les utklippstavla, sjekk kvitteringen i knappen.
    // Uten clipboard leses MARKERINGEN i stedet — det er den som gjør manuell kopiering mulig.
    let kopiert='—', kvittering='—';
    if(m.kopier){
      await page.click('#pubLink button.pub-copy');
      await page.waitForTimeout(150);
      // Kvitteringen er haken i knappen selv (.ok i ~1,5 s), ikke tekst. Uten navigator.clipboard går kopieringen
      // via execCommand('copy') (kopierFallback) og gir samme hake; utklippstavla kan da ikke leses herfra.
      kvittering=await page.$eval('#pubLink button.pub-copy',b=>b.classList.contains('ok')?'ok':'ingen hake');
      kopiert=vent.utenClipboard ? '—' : await page.evaluate(()=>navigator.clipboard.readText());
    }

    await page.locator('#abonnement').screenshot({path:`${OUT}/${bredde}-lenke-${navn}.png`});

    const overflow=await page.evaluate(w=>document.documentElement.scrollWidth>w,bredde);
    const feil=[];
    if(m.lenke!==vent.lenke)   feil.push(`lenke=${m.lenke} (ventet ${vent.lenke})`);
    if(m.kopier!==vent.kopier) feil.push(`kopier=${m.kopier} (ventet ${vent.kopier})`);
    if(m.note!==vent.note)     feil.push(`note=${m.note} (ventet ${vent.note})`);
    if(m.lenke&&m.mal!=='_blank/noopener') feil.push(`target/rel="${m.mal}"`);
    if(m.lenke&&!/^https:\/\//.test(m.href)) feil.push(`href="${m.href}" mangler https://`);
    if(m.kopier&&!vent.utenClipboard&&!/^https:\/\//.test(kopiert)) feil.push('kopiert URL mangler https://');
    if(m.kopier&&kvittering!=='ok') feil.push(`kvittering="${kvittering}" (ventet hake .ok)`);
    if(m.kopier&&m.kopierKlasse!=='pub-copy') feil.push(`kopier-knapp er .${m.kopierKlasse}, ikke .pub-copy`);

    rapport.push({bredde,tilstand:navn,lenke:m.lenke?'ja':'nei',kopier:m.kopier?'ja':'nei',
      note:m.note?'ja':'nei',tekst:m.lenkeTekst.slice(0,30),'target/rel':m.mal,
      kopiert:kopiert.slice(0,30),
      overflow:overflow?'JA ✗':'nei', jsfeil:errs.length?errs.join('; '):'ingen',
      avvik:feil.length?feil.join(' · '):'—'});
    await ctx.close();
  }
}

console.table(rapport);
console.log('avvik fra forventet tilstand:', rapport.some(r=>r.avvik!=='—')?'JA ✗':'nei');
console.log('overflow:', rapport.some(r=>r.overflow!=='nei')?'JA ✗':'nei');
console.log('jsfeil:',   rapport.some(r=>r.jsfeil!=='ingen')?'JA ✗':'ingen');
// Rød = exit 1, så suiten ser det. (Før avsluttet testen med 0 også ved avvik — den sto rød i ukevis uten at noen så det.)
if(rapport.some(r=>r.avvik!=='—'||r.overflow!=='nei'||r.jsfeil!=='ingen')) process.exitCode=1;
await browser.close(); server.close();
