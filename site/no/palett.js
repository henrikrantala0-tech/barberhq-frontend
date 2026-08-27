// MÅ holdes i synk med barberhq-backend/fyll.cjs — samme paletter og buildPalette-logikk
(function(){
  var PALETTE_DATA={
    mint:     {light:'#ffffff',accent:'#10b981',dark:'#0a0a0a'},
    klassisk: {light:'#0a0a0a',accent:'#0071e3',dark:'#ffffff'},
    purple:   {light:'#ffffff',accent:'#6b3df0',dark:'#0a0a0a'},
    krem:     {light:'#ffffff',accent:'#b08c32',dark:'#0a0a0a'},
    minimal:  {light:'#ffffff',accent:'#86868b',dark:'#0a0a0a'},
    oransje:  {light:'#ffffff',accent:'#e8590c',dark:'#0a0a0a'},
    // Visningsnavn utad: «Sand» (nøkkelen 'krem' er opptatt av «Krem & Gull»). KUN lys modus —
    // mørk sand forkastet (espresso-aksent mot mørk bg = brunt-på-brunt). Se PALETTE_MODES.
    sand:     {light:'#efe7d8',accent:'#38312a',dark:'#2a241e'},
  };
  // Hvilke moduser hver palett støtter. Sand finnes KUN i lys; de øvrige seks i begge. Speiler
  // backend PALETTE_MODES (fyll.cjs, commit c877b08) — MÅ holdes i synk med den.
  var PALETTE_MODES={
    mint:     ['lys','mork'],
    klassisk: ['lys','mork'],
    purple:   ['lys','mork'],
    krem:     ['lys','mork'],
    minimal:  ['lys','mork'],
    oransje:  ['lys','mork'],
    sand:     ['lys'],
  };
  function modeneFor(key){ return PALETTE_MODES[key]||['lys']; } // ukjent → fail-closed: kun lys
  // Dempet/mørkere aksent, ≥4.5:1 som liten tekst mot bg. Lik accent der accent
  // alt er mørk/lys nok. MÅ holdes i synk med barberhq-backend/fyll.cjs.
  var ACCENT_TEXT={
    mint:     {lys:'#0b7a55',mork:'#10b981'},
    klassisk: {lys:'#0068d1',mork:'#1f82e6'},
    purple:   {lys:'#6b3df0',mork:'#8c68f3'},
    krem:     {lys:'#826825',mork:'#b08c32'},
    minimal:  {lys:'#6b6b6f',mork:'#86868b'},
    oransje:  {lys:'#b54509',mork:'#e8590c'},
    sand:     {lys:'#38312a'},   // kun lys — mørk sand finnes ikke (se PALETTE_MODES)
  };
  var PALETTES_DISPLAY=[
    {key:"mint",     t:"Street Mint",       d:"Friskt grønt",        sw:["#ffffff","#10b981","#0a0a0a"]},
    {key:"klassisk", t:"BarberHQ",           d:"Sort/hvit + blå",     sw:["#0a0a0a","#ffffff","#0071e3"]},
    {key:"purple",   t:"Modern Purple",     d:"Dyp lilla",                sw:["#ffffff","#6b3df0","#0a0a0a"]},
    {key:"krem",     t:"Krem & Gull",       d:"Varm, klassisk",           sw:["#ffffff","#b08c32","#0a0a0a"]},
    {key:"minimal",  t:"Minimalistisk",     d:"Svart, hvitt, grått", sw:["#ffffff","#86868b","#0a0a0a"]},
    {key:"oransje",  t:"Burnt Orange",      d:"Brent oransje, sort",      sw:["#ffffff","#e8590c","#0a0a0a"]},
    {key:"sand",     t:"Sand",              d:"Sand og varm sort",        sw:["#efe7d8","#38312a","#2a241e"]},
  ];
  function hx(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  function lum(h){var v=hx(h);return(0.299*v[0]+0.587*v[1]+0.114*v[2])/255;}
  function mix(h,w,a){var A=hx(h),B=hx(w);return'#'+[0,1,2].map(function(i){return Math.round(A[i]+(B[i]-A[i])*a).toString(16).padStart(2,'0');}).join('');}
  function buildPalette(key,mode){
    var p=PALETTE_DATA[key]||PALETTE_DATA.krem;
    var dk=(mode==='mork'||mode==='mørk'||mode==='dark');
    var bg=dk?p.dark:p.light,ink=dk?p.light:p.dark;
    if(!dk&&lum(bg)<lum(ink)){var t=bg;bg=ink;ink=t;}
    if(dk&&lum(bg)>lum(ink)){var t=bg;bg=ink;ink=t;}
    // Samme accent i begge moduser. (Sand hadde tidligere en accentDark-snu i mørk modus —
    // fjernet da sand ble lys-only; ingen palett bruker det lenger.) Synk med backend/fyll.cjs.
    var accent=p.accent;
    return{bg:bg,surface:mix(bg,ink,dk?0.06:0.045),ink:ink,inkSoft:mix(ink,bg,0.42),accent:accent,accentInk:lum(accent)>0.6?'#141210':'#ffffff',accentText:(ACCENT_TEXT[key]||ACCENT_TEXT.krem)[dk?'mork':'lys'],line:mix(bg,ink,dk?0.16:0.12)};
  }
  window.PALETTE_DATA=PALETTE_DATA;
  window.PALETTE_MODES=PALETTE_MODES;
  window.modeneFor=modeneFor;
  window.PALETTES_DISPLAY=PALETTES_DISPLAY;
  window.buildPalette=buildPalette;
})();
