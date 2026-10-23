/* «Din side» — fire steg: Profil → Utseende → Bilder → Kontakt.
   Lastes av dashboard.html etter hovedskriptet og bruker dets globale hjelpere (apiFetch, settBilling, showToast,
   erBillingShape, kontaktFeil, _openCropModal, CONFIG, loadProfil).

   Kontrakt (backend):
     GET  /api/dashboard/din-side          → { profil{shop,tagline,address,bio,om}, utseende{aksent,custom_accent,
                                               color_mode,font}, kontakt{instagram,tiktok,snapchat,contact_phone}, publisert_at,
                                               valg{aksenter[{key,hex}], fonter[{key,navn,family,url,vekt}], maks{…,bilder{…}}} }
     POST /api/dashboard/preview           → text/html. Body { side:'forside'|'book', profil?, utseende?, kontakt? }
     POST /api/dashboard/din-side/preview  → text/html. Multipart (draft + bildeutkast)
     POST /api/dashboard/din-side/lagre    → ALLTID 200 når lagret: { lagret:true, publisering{publisert, melding?, …}, …billing }
                                              | 400 { error, felt } (ingenting skrevet). JSON uten bilder, multipart med.
   Utkastet holdes i minnet på tvers av steg. «Lagre endringer» sender ALT i ett kall; mens siden ikke er live sendes
   publiser:true, og samme kall publiserer. v2 kaller aldri PUT /page-status og har ingen sjekkliste. */
(function () {
  'use strict';

  var STEG = [
    { id: 'profil',   navn: 'Profil' },
    { id: 'utseende', navn: 'Utseende' },
    { id: 'bilder',   navn: 'Bilder' },
    { id: 'kontakt',  navn: 'Kontakt' },
  ];
  // Hvilket steg hvert felt fra 400-svaret ligger i (felt = backendens feltnavn).
  var FELT_STEG = { shop: 0, tagline: 0, address: 0, bio: 0, om: 0,
                    aksent: 1, custom_accent: 1, color_mode: 1, font: 1,
                    instagram: 3, tiktok: 3, snapchat: 3, contact_phone: 3, slot: 2, ids: 2 };
  var STEG_FELT = { tagline: '#dv2Tagline', address: '#dv2Address', bio: '#dv2Bio', om: '#dv2Om',
                    custom_accent: '#dv2Hex', instagram: '#dv2Instagram', tiktok: '#dv2Tiktok', snapchat: '#dv2Snapchat',
                    contact_phone: '#dv2Telefon' };
  var AKSENT_NAVN = { blaa: 'Blå', gull: 'Gull', roed: 'Rød', egen: 'Din egen' };
  var BILDE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,image/svg+xml,.svg';   // BILDE_MIME (dashboard.js:100) + SVG, som konverteres til PNG i klienten
  var STANDARD_MAKS = { tagline: 60, address: 200, bio: 2000, om: 4000, bilder: { portrett: 1, galleri: 10 } };

  var S = {
    aktiv: false, byggd: false,
    laster: false, lastFeilet: false,
    valg: null, lagret: null, utkast: null, shop: '', publisertAt: null,
    hsv: { h: 212, s: 1, v: 0.89 },   // fargevelgerens posisjon («Din egen»); utkastet lagrer hex
    steg: 0, side: 'forside',
    pvApen: false, pvSeq: 0, pvTimer: null, pvStale: true, pvScroll: 0, pvScrollY: 0,
    redigeringScrollY: 0,
    bilderDirty:false, bilderLastet:false, imageVersion:'', bilderLagret:[], bilder: [], bilderFeil: '', valgtBilde: null, opplaster: '',
    fontStatus: {},
    feil: null,            // { felt, tekst }
    lagrer: false, statusTekst: '', statusType: '',
    tillatBytte: false,
  };
  var el = {};            // cachede noder

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function lagEl(tag, attrs, tekst) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (attrs[k] === true) e.setAttribute(k, ''); else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    if (tekst != null) e.textContent = tekst;
    return e;
  }
  function kopi(o) { return JSON.parse(JSON.stringify(o)); }
  function maks() { return Object.assign({}, STANDARD_MAKS, (S.valg && S.valg.maks) || {}); }
  function bildeMaks() { return Object.assign({}, STANDARD_MAKS.bilder, (maks().bilder) || {}); }
  function ervBilling() { return typeof _billing !== 'undefined' ? _billing : null; }
  function skrivefeil(e) { return (typeof kontaktFeil === 'function') ? kontaktFeil(e) : 'Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.'; }

  /* ── Hex og kontrast (speiler backend knappTekst: hvit eller #141210, den med best kontrast) ── */
  function normHex(v) {
    if (v == null) return null;
    v = String(v).trim();
    if (v && v[0] !== '#') v = '#' + v;
    if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }
  function lum(hex) {
    var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function kontrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  // Sidens bakgrunn per modus (backend v2-css.cjs LYS/MORK .bg).
  var SIDE_BG = { lys: '#fafafa', mork: '#0c0c0c' };
  // Kontrastvarselet for «Din egen» farge: bare når fargen nesten forsvinner mot bakgrunnen (nær svart i mørk modus,
  // nær hvit i lys). 1,25 gir varsel for #21084f (1,13) mot mørk og #f0f0f0 (1,09) mot lys, ikke for #481b9f (1,80)
  // eller #33264d (1,42). Juster her.
  var KONTRAST_VARSEL = 1.25;
  function knappMotBakgrunn(hex, modus) { return kontrast(hex, SIDE_BG[modus] || SIDE_BG.mork); }

  /* ── Skjema ↔ utkast ── */
  function formFra(d) {
    var p = d.profil || {}, u = d.utseende || {}, k = d.kontakt || {};
    return {
      profil:   { tagline: p.tagline || '', address: p.address || '', bio: p.bio || '', om: p.om || '' },
      utseende: { aksent: u.aksent || 'blaa', custom_accent: u.custom_accent || '', color_mode: u.color_mode || 'mork', font: u.font || 'jakarta' },
      kontakt:  { instagram: k.instagram || '', tiktok: k.tiktok || '', snapchat: k.snapchat || '', contact_phone: k.contact_phone || '' },
    };
  }
  function norm(f) {
    var n = kopi(f);
    ['profil', 'kontakt'].forEach(function (g) { Object.keys(n[g]).forEach(function (k) { n[g][k] = String(n[g][k]).replace(/\r\n?/g, '\n').trim(); }); });
    n.utseende.custom_accent = n.utseende.aksent === 'egen' ? (normHex(n.utseende.custom_accent) || String(n.utseende.custom_accent).trim().toLowerCase()) : '';
    return n;
  }
  function ulagret() { return S.bilderDirty || !!(S.utkast && S.lagret && JSON.stringify(norm(S.utkast)) !== JSON.stringify(norm(S.lagret))); }
  function bodyFra(forPreview) {
    var u = S.utkast, b = { profil: { tagline: u.profil.tagline, address: u.profil.address, bio: u.profil.bio, om: u.profil.om },
                            utseende: { color_mode: u.utseende.color_mode, font: u.utseende.font }, kontakt: {} };
    var hex = normHex(u.utseende.custom_accent);
    if (u.utseende.aksent === 'egen') {
      if (hex) { b.utseende.aksent = 'egen'; b.utseende.custom_accent = hex; }
      else if (!forPreview) { b.utseende.aksent = 'egen'; }   // lagring avvises lokalt før kallet
    } else b.utseende.aksent = u.utseende.aksent;
    ['instagram', 'tiktok', 'snapchat'].forEach(function (k) { b.kontakt[k] = u.kontakt[k]; });
    // Telefonen vises bare i bookingbekreftelsen, aldri i forhåndsvisningen — og et halvskrevet nummer
    // ville gitt 400 på hver tastetrykk. Den sendes derfor bare ved lagring.
    if (!forPreview) b.kontakt.contact_phone = u.kontakt.contact_phone;
    return b;
  }

  /* ══ Grein og livssyklus ═══════════════════════════════════════════════════════════════════════════ */
  // Kalles av settBilling (hver gang billing lander): bygger flaten og tegner det som avhenger av page_status.
  function billing(b) {
    if (b) { S.publisertAt = b.publisert_at || S.publisertAt; ensureByggd(); }
    tegnFullfor(b);
    if (S.byggd && S.utkast) { tegnSteg(); tegnKnapper(); }   // live/ikke live styrer lagreknappen og hjelpelinja
  }

  // Billing kunne ikke hentes: uten page_status vet vi ikke om lagring skal publisere. Si det rett ut.
  function billingFeilet() {
    var st = $('#dv2Start'); if (st && !S.byggd) { st.classList.add('feil'); st.textContent = 'Kunne ikke laste Din side. Last siden på nytt.'; }
  }

  function ensureByggd() {
    if (S.byggd) return;
    var rot = $('#dinsideV2'); if (!rot) return;
    bygg(rot);
    S.byggd = true;
  }

  // Kalles når «Din side»-fanen åpnes.
  async function last() {
    ensureByggd();
    S.aktiv = true;
    nullstillLagreStatus(); nullstillBilderFeil();
    // Ulagret utkast beholdes urørt — bare bildene hentes på nytt (de er alltid serverens sannhet).
    if (S.utkast && ulagret()) { hentBilder(); planleggPreview(0); return; }
    if (S.laster) return;
    S.laster = true; S.lastFeilet = false; visLasting();
    var d = null, r;
    try { r = await apiFetch('/api/dashboard/din-side'); if (r && r.ok) d = await r.json(); }
    catch (e) { d = null; }
    S.laster = false;
    if (r === null) return;                                    // 401 → apiFetch har sendt til innlogging
    if (!d) { S.lastFeilet = true; visLasting(); return; }
    tilordneData(d);
    visInnhold();
    hentBilder();
    planleggPreview(0);
  }

  function tilordneData(d) {
    S.valg = d.valg || null;
    S.shop = (d.profil && d.profil.shop) || '';
    S.publisertAt = d.publisert_at || null;
    S.lagret = formFra(d);
    S.utkast = kopi(S.lagret);
    S.hsv = hexTilHsv(normHex(S.lagret.utseende.custom_accent));
    S.feil = null; S.statusTekst = ''; S.statusType = '';
    (S.valg && S.valg.fonter || []).forEach(lastFont);
  }

  function forlat() { S.aktiv = false; nullstillLagreStatus(); nullstillBilderFeil(); }
  // «✓ Lagret …» og «lagret, men ikke publisert» er svar på ÉN lagring og gjelder bare der og da (Kontakt, rett etter Lagre).
  // Baren med statusen er felles for alle steg, så uten dette sto meldingen igjen på neste steg og ved neste besøk.
  // Feilstatus (feil felt / lagring feilet) beholdes: den peker til noe barbereren må rette.
  function nullstillLagreStatus() {
    if (S.statusType !== 'ok' && S.statusType !== 'info') return;
    S.statusTekst = ''; S.statusType = ''; if (el.status) tegnStatus();
  }

  /* ══ Bygg markup (én gang) ═════════════════════════════════════════════════════════════════════════
     Godkjent 22.10.2026 (prototype tools/render/prototyper/dinside-v2-oppsett.html): fast topp med tittel + «Forhåndsvis»
     (mobil) og en segmentert kontroll med fire like celler; steginnhold = tittel + én hjelpelinje, etiketter over feltene,
     hårlinjer mellom delene; fast bunnbar i én rad. Ingen sjekkliste og ingen egen publiser-knapp: «Lagre endringer»
     publiserer når siden ikke er live (POST /din-side/lagre med publiser:true). */
  function bygg(rot) {
    rot.innerHTML =
      '<div id="dv2Varsler"></div>' +
      '<div class="dv2-lasting" id="dv2Lasting" role="status">Laster …</div>' +
      '<div class="dv2-grid" id="dv2Grid" hidden>' +
        '<div class="dv2-edit">' +
          '<div class="dv2-fast">' +
            // «Forhåndsvis»: øye + tekst; under 400 px bare øyet (teksten står igjen som aria-navn), så tittelen får plassen.
            '<div class="dv2-tittelrad"><h2 id="dv2Tittel">Din side</h2><button type="button" class="dv2-btn liten dv2-pvknapp" id="dv2SeSiden"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span class="dv2-pvtekst">Forhåndsvis</span></button></div>' +
            '<div class="dv2-steg" id="dv2Steg" role="tablist" aria-label="Steg">' +
              STEG.map(function (s, i) { return '<button type="button" role="tab" id="dv2Tab' + i + '" data-steg="' + i + '" aria-controls="dv2Sek' + i + '">' + s.navn + '<span class="feilpunkt" hidden></span></button>'; }).join('') +
            '</div>' +
          '</div>' +
          '<div class="dv2-innhold">' +
          '<section class="dv2-sek" id="dv2Sek0" data-sek="0" aria-labelledby="dv2Tab0">' +
            '<p class="ingress">Det kundene leser om deg.</p>' +
            felt('Spesialitet', 'dv2Tagline', 'tagline', '<input id="dv2Tagline" type="text" autocomplete="off" aria-describedby="dv2TaglineT">') +
            felt('Adresse', 'dv2Address', 'address', '<input id="dv2Address" type="text" autocomplete="street-address" aria-describedby="dv2AddressT">') +
            felt('Kort beskrivelse', 'dv2Bio', 'bio', '<textarea id="dv2Bio" rows="3" aria-describedby="dv2BioT"></textarea>') +
            // «Mer info» = barbers.om → Om-fanen på siden (sammen med åpningstidene). Etikett/plassholder godkjent 22.10.
            felt('Mer info', 'dv2Om', 'om', '<p class="dv2-felthjelp" id="dv2OmHjelp">Vises i Om-fanen på siden din.</p>' +
              '<textarea id="dv2Om" rows="6" placeholder="F.eks. priser, parkering, hvordan du jobber" aria-describedby="dv2OmHjelp dv2OmT"></textarea>') +
          '</section>' +
          '<section class="dv2-sek" id="dv2Sek1" data-sek="1" aria-labelledby="dv2Tab1" hidden>' +
            '<p class="ingress">Farge og skrift på siden din.</p>' +
            '<fieldset class="dv2-gruppe dv2-del"><legend>Bakgrunn</legend><div class="dv2-brikker" id="dv2Modus" role="radiogroup" aria-label="Bakgrunn"></div></fieldset>' +
            '<fieldset class="dv2-gruppe dv2-del" id="dv2AksentGr" data-felt="aksent"><legend id="dv2AksentEtikett">Aksentfarge</legend><div class="dv2-prover" id="dv2Aksenter" role="radiogroup" aria-labelledby="dv2AksentEtikett"></div>' +
              // «Din egen»: fargefelt (metning × lysstyrke), fargebånd (kulør) og HEX-felt. Peker + berøring + tastatur.
              '<div class="dv2-velger" id="dv2Velger" hidden>' +
                '<div class="dv2-sv" id="dv2Sv" role="slider" tabindex="0" aria-label="Metning og lysstyrke" aria-valuemin="0" aria-valuemax="100"><span class="dv2-tommel" id="dv2SvTommel"></span></div>' +
                '<div class="dv2-hue" id="dv2Hue" role="slider" tabindex="0" aria-label="Fargetone" aria-valuemin="0" aria-valuemax="360"><span class="dv2-tommel" id="dv2HueTommel"></span></div>' +
                '<div><label class="dv2-etikett" for="dv2Hex">Fargekode (HEX)</label>' +
                  '<div class="dv2-hexrad"><span class="smak" aria-hidden="true"></span><input type="text" id="dv2Hex" class="dv2-hex" inputmode="text" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="7" placeholder="#1e40af" aria-describedby="dv2HexFeil dv2Kontrast"></div></div>' +
                '<p class="dv2-feil" id="dv2HexFeil" role="alert" hidden></p><p class="dv2-varsel" id="dv2Kontrast" role="status" hidden></p>' +
              '</div></fieldset>' +
            '<fieldset class="dv2-gruppe dv2-del" id="dv2FontGr" data-felt="font"><legend>Skrift</legend><select class="dv2-fontvalg" id="dv2Fonter" aria-label="Skrift"></select><div class="dv2-fontprove" id="dv2FontProve" aria-label="Forhåndsvisning av sjappenavn"></div><p class="dv2-fontstatus" id="dv2FontStatus" role="status"></p></fieldset>' +
          '</section>' +
          '<section class="dv2-sek" id="dv2Sek2" data-sek="2" aria-labelledby="dv2Tab2" hidden>' +
            '<p class="ingress">Valgfritt. Siden er ferdig uten.</p>' +
            '<div class="dv2-fld dv2-del"><span class="etikett">Portrett eller logo</span><div id="dv2Portrett"></div><p class="dv2-feil" id="dv2PortrettFeil" role="alert" hidden></p></div>' +
            '<div class="dv2-fld dv2-del"><div class="dv2-teller-rad"><span class="etikett">Arbeidene dine</span><span id="dv2GalleriTeller"></span></div><div id="dv2Galleri"></div><p class="dv2-feil" id="dv2BilderFeil" role="alert" hidden></p></div>' +
            '<input type="file" id="dv2FilPortrett" accept="' + BILDE_ACCEPT + '" hidden><input type="file" id="dv2FilGalleri" accept="' + BILDE_ACCEPT + '" multiple hidden><input type="file" id="dv2FilBytt" accept="' + BILDE_ACCEPT + '" hidden>' +
          '</section>' +
          '<section class="dv2-sek" id="dv2Sek3" data-sek="3" aria-labelledby="dv2Tab3" hidden>' +
            '<p class="ingress">Hvor kundene finner deg.</p>' +
            handle('Instagram', 'dv2Instagram', 'instagram') + handle('TikTok', 'dv2Tiktok', 'tiktok') + handle('Snapchat', 'dv2Snapchat', 'snapchat') +
            '<div class="dv2-fld dv2-del" data-felt="contact_phone"><label for="dv2Telefon">Telefon</label><p class="dv2-felthjelp" id="dv2TelefonHjelp">Vises bare i bookingbekreftelsen.</p><input id="dv2Telefon" aria-describedby="dv2TelefonHjelp" type="tel" inputmode="tel" autocomplete="tel" maxlength="32" placeholder="91 23 45 67"><p class="dv2-feil" role="alert" hidden></p></div>' +
          '</section>' +
          '</div>' +
          // Fast bunnbar: én rad. Steg 1–3 «← Tilbake» + «Neste →»; siste steg «← Tilbake» + «Lagre endringer».
          '<div class="dv2-bar" id="dv2Bar"><div class="dv2-bar-inn">' +
            '<p class="dv2-status" id="dv2Status" role="status" aria-live="polite"></p>' +
            '<div class="dv2-bar-rad"><button type="button" class="dv2-btn" id="dv2Tilbake">← Tilbake</button>' +
              '<button type="button" class="dv2-btn prim hoved" id="dv2Neste">Neste →</button>' +
              '<button type="button" class="dv2-btn prim hoved" id="dv2Lagre" hidden>Lagre endringer</button></div>' +
            '<p class="dv2-hjelpelinje" id="dv2Hjelpelinje" hidden>Når du lagrer, går siden live og kundene kan booke.</p>' +
          '</div></div>' +
        '</div>' +
        '<aside class="dv2-pv" id="dv2Pv" aria-label="Forhåndsvisning av siden din">' +
          '<div class="dv2-pv-topp"><button type="button" class="dv2-btn liten dv2-pv-lukk" id="dv2PvLukk">← Tilbake</button><span class="dv2-pv-tittel">Forhåndsvisning</span>' +
            '<div class="dv2-visning" role="group" aria-label="Hva skal vises"><button type="button" data-side="forside" aria-pressed="true">Forside</button><button type="button" data-side="book" aria-pressed="false">Bookingside</button></div></div>' +
          '<div class="dv2-ramme" id="dv2Ramme"><iframe id="dv2Iframe" title="Forhåndsvisning av siden din" sandbox="allow-scripts"></iframe></div>' +
        '</aside>' +
      '</div>' +
      // Etter første lagring som publiserer: enkel bekreftelse, så Oversikt (der «Få din første booking» tar over).
      '<section class="dv2-bekreft" id="dv2Bekreft" hidden aria-labelledby="dv2BekreftH">' +
        '<div class="dv2-hake" aria-hidden="true">✓</div><h2 id="dv2BekreftH" tabindex="-1">Siden din er live</h2>' +
        '<p class="ingress">Kundene kan booke nå. Del lenken der de finner deg.</p>' +
        '<div class="dv2-lenkerad"><span id="dv2Lenke"></span></div>' +
        '<div class="dv2-bar-rad"><button type="button" class="dv2-btn" id="dv2Kopier">Kopier lenke</button><button type="button" class="dv2-btn prim hoved" id="dv2TilOversikt">Gå til Oversikt</button></div>' +
        '<p class="dv2-status" id="dv2Kopiert" role="status" aria-live="polite"></p>' +
      '</section>';
    el.lasting = $('#dv2Lasting'); el.grid = $('#dv2Grid'); el.lagre = $('#dv2Lagre'); el.status = $('#dv2Status');
    el.tilbake = $('#dv2Tilbake'); el.neste = $('#dv2Neste'); el.pv = $('#dv2Pv'); el.iframe = $('#dv2Iframe'); el.ramme = $('#dv2Ramme');
    el.bar = $('#dv2Bar');
    // «Ideer & ønsker» (dashbordets .ideacard i #design, samme felt-id-er og sending) flyttes inn under Lagre-knappen.
    var ide = document.querySelector('#design > .ideacard'); if (ide) $('.dv2-edit', rot).appendChild(ide);
    bind();
  }
  function felt(etikett, id, nokkel, kontroll) {
    return '<div class="dv2-fld dv2-del" data-felt="' + nokkel + '"><label for="' + id + '">' + etikett + '<span class="dv2-teller" id="' + id + 'T" aria-hidden="true"></span></label>' +
      kontroll + '<p class="dv2-feil" role="alert" hidden></p></div>';
  }
  function handle(etikett, id, nokkel) {
    return '<div class="dv2-fld dv2-del" data-felt="' + nokkel + '"><label for="' + id + '">' + etikett + '</label>' +
      '<div class="dv2-handle"><span aria-hidden="true">@</span><input id="' + id + '" name="' + nokkel + '-handle" type="text" placeholder="brukernavn" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other"></div>' +
      '<p class="dv2-feil" role="alert" hidden></p></div>';
  }

  function visLasting() {
    if (!el.lasting) return;
    el.grid.hidden = true; el.lasting.hidden = false;
    el.lasting.classList.toggle('feil', S.lastFeilet);
    el.lasting.textContent = S.lastFeilet ? 'Kunne ikke hente Din side. Last siden på nytt.' : 'Laster …';
  }
  function visInnhold() {
    el.lasting.hidden = true; el.grid.hidden = false; $('#dv2Bekreft').hidden = true;
    fyllFelter(); tegnUtseende(); tegnSteg(); tegnKnapper(); tegnStatus(); tegnPortrettOgGalleri();
  }

  /* ══ Binding ═══════════════════════════════════════════════════════════════════════════════════════ */
  function bind() {
    $('#dv2Steg').addEventListener('click', function (e) { var b = e.target.closest('[data-steg]'); if (b) gaaTilSteg(+b.dataset.steg, true); });
    $('#dv2Steg').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); gaaTilSteg((S.steg + (e.key === 'ArrowRight' ? 1 : STEG.length - 1)) % STEG.length, true);
      var a = $('#dv2Steg [aria-selected="true"]'); if (a) a.focus();
    });
    el.tilbake.addEventListener('click', function () { gaaTilSteg(S.steg - 1, true); });
    el.neste.addEventListener('click', function () { gaaTilSteg(S.steg + 1, true); });
    el.lagre.addEventListener('click', lagre);
    $('#dv2SeSiden').addEventListener('click', apnePv);
    $('#dv2PvLukk').addEventListener('click', lukkPv);
    $('#dv2Kopier').addEventListener('click', kopierLenke);
    $('#dv2TilOversikt').addEventListener('click', tilOversikt);
    el.pv.addEventListener('click', function (e) { var b = e.target.closest('[data-side]'); if (!b) return; S.side = b.dataset.side; $$('[data-side]', el.pv).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.side === S.side)); }); planleggPreview(0); });
    // Fullskjerm (mobil): Escape lukker; fokus holdes i flaten. Tastetrykk INNE i iframen når ikke dashbordet — derfor
    // sender iframen Escape videre (lagScript), og fokusfella er en focusin-vakt i stedet for en Tab-lytter.
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.pvApen && !erDesktop() && !$('.dv2-dialog-bak')) lukkPv(); });
    document.addEventListener('focusin', function (e) { if (S.pvApen && !erDesktop() && !el.pv.contains(e.target) && !$('.dv2-dialog-bak')) $('#dv2PvLukk').focus(); });
    window.addEventListener('message', function (e) {
      if (!el.iframe || e.source !== el.iframe.contentWindow || !e.data) return;
      if (e.data.bhq === 'scroll') S.pvScroll = e.data.y || 0;
      if (e.data.bhq === 'escape' && S.pvApen && !erDesktop()) lukkPv();
    });
    window.addEventListener('beforeunload', function (e) { if (ulagret()) { e.preventDefault(); e.returnValue = ''; } });
    // Bunnbaren er fast bare i oppsettet (fokusmodus). Der får PANELET bunnluft lik barens FAKTISKE høyde (status og
    // hjelpelinje gjør den høyere), så ingenting i panelet — heller ikke det som står etter stegene — havner bak baren.
    if (window.ResizeObserver) new ResizeObserver(function () { var p = $('#design'); if (p && el.bar.offsetHeight) p.style.setProperty('--dv2-bar-h', el.bar.offsetHeight + 'px'); }).observe(el.bar);

    // Tekstfelt → utkast
    [['#dv2Tagline', 'profil', 'tagline'], ['#dv2Address', 'profil', 'address'], ['#dv2Bio', 'profil', 'bio'], ['#dv2Om', 'profil', 'om'],
     ['#dv2Instagram', 'kontakt', 'instagram'], ['#dv2Tiktok', 'kontakt', 'tiktok'], ['#dv2Snapchat', 'kontakt', 'snapchat'], ['#dv2Telefon', 'kontakt', 'contact_phone']].forEach(function (f) {
      $(f[0]).addEventListener('input', function (e) { S.utkast[f[1]][f[2]] = e.target.value; endret(f[2]); });
    });
    // Utseende
    $('#dv2Modus').addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (!b) return; S.utkast.utseende.color_mode = b.dataset.mode; tegnUtseende(); endret('color_mode'); });
    $('#dv2Aksenter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-aksent]'); if (!b) return;
      S.utkast.utseende.aksent = b.dataset.aksent;
      if (b.dataset.aksent === 'egen' && !normHex(S.utkast.utseende.custom_accent)) S.utkast.utseende.custom_accent = normHex(S.lagret.utseende.custom_accent) || hsvTilHex(S.hsv.h, S.hsv.s, S.hsv.v);
      if (b.dataset.aksent === 'egen') S.hsv = hexTilHsv(normHex(S.utkast.utseende.custom_accent));
      tegnUtseende(); endret('aksent');
    });
    // Fargevelgeren: peker/berøring (setPointerCapture) + tastatur (piltaster, Shift = større steg) + HEX-felt.
    function settFraHsv() { S.utkast.utseende.custom_accent = hsvTilHex(S.hsv.h, S.hsv.s, S.hsv.v); tegnUtseende(); endret('custom_accent'); }
    function dra(node, fn) { node.addEventListener('pointerdown', function (e) { node.setPointerCapture(e.pointerId); fn(e); node.focus({ preventScroll: true });
      function flytt(ev) { fn(ev); } function slipp() { node.removeEventListener('pointermove', flytt); node.removeEventListener('pointerup', slipp); node.removeEventListener('pointercancel', slipp); }
      node.addEventListener('pointermove', flytt); node.addEventListener('pointerup', slipp); node.addEventListener('pointercancel', slipp); }); }
    function klem(x) { return Math.max(0, Math.min(1, x)); }
    dra($('#dv2Sv'), function (e) { var r = $('#dv2Sv').getBoundingClientRect(); S.hsv.s = klem((e.clientX - r.left) / r.width); S.hsv.v = 1 - klem((e.clientY - r.top) / r.height); settFraHsv(); });
    dra($('#dv2Hue'), function (e) { var r = $('#dv2Hue').getBoundingClientRect(); S.hsv.h = klem((e.clientX - r.left) / r.width) * 360; settFraHsv(); });
    $('#dv2Sv').addEventListener('keydown', function (e) { var t = e.shiftKey ? 0.1 : 0.02, m = { ArrowLeft: ['s', -t], ArrowRight: ['s', t], ArrowUp: ['v', t], ArrowDown: ['v', -t] }[e.key];
      if (!m) return; e.preventDefault(); S.hsv[m[0]] = klem(S.hsv[m[0]] + m[1]); settFraHsv(); });
    $('#dv2Hue').addEventListener('keydown', function (e) { var t = e.shiftKey ? 30 : 5, m = { ArrowLeft: -t, ArrowDown: -t, ArrowRight: t, ArrowUp: t }[e.key];
      if (m == null) return; e.preventDefault(); S.hsv.h = (S.hsv.h + m + 360) % 360; settFraHsv(); });
    $('#dv2Hex').addEventListener('input', function (e) {
      S.utkast.utseende.custom_accent = e.target.value;
      var h = normHex(e.target.value); if (h) S.hsv = hexTilHsv(h);
      tegnUtseende(true); endret('custom_accent');
    });
    $('#dv2Fonter').addEventListener('change', function (e) { S.utkast.utseende.font = e.target.value; tegnUtseende(); endret('font'); });
    // Piltaster i radiogrupper
    ['#dv2Modus', '#dv2Aksenter'].forEach(function (s) {
      $(s).addEventListener('keydown', function (e) {
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].indexOf(e.key) < 0) return;
        var rb = $$('[role=radio]', this); var i = rb.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); var n = rb[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : rb.length - 1)) % rb.length]; n.focus(); n.click();
      });
    });
    // Bilder
    $('#dv2FilPortrett').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) lastOpp('portrett', [f]); });
    $('#dv2FilGalleri').addEventListener('change', function (e) { var fs = Array.prototype.slice.call(e.target.files); e.target.value = ''; if (fs.length) lastOpp('galleri', fs); });
    $('#dv2FilBytt').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; if (f && S.bytteSlot) lastOpp(S.bytteSlot, [f]); });
    $('#dv2Portrett').addEventListener('click', portrettKlikk);
    $('#dv2Galleri').addEventListener('click', galleriKlikk);
  }

  function endret(feltNavn) {
    if (S.feil && (!feltNavn || S.feil.felt === feltNavn)) fjernFeil();
    S.statusTekst = ''; S.statusType = '';
    tegnTellere(); tegnKnapper(); tegnStatus(); tegnFeilpunkt();
    planleggPreview(300);
  }

  /* ══ Tegning ═══════════════════════════════════════════════════════════════════════════════════════ */
  function erLive() { var b = ervBilling(); return !!(b && b.page_status === 'live'); }
  function erFokus() { return document.body.classList.contains('fokus'); }
  function fyllFelter() {
    var u = S.utkast;
    $('#dv2Tagline').value = u.profil.tagline; $('#dv2Address').value = u.profil.address; $('#dv2Bio').value = u.profil.bio; $('#dv2Om').value = u.profil.om;
    $('#dv2Instagram').value = u.kontakt.instagram; $('#dv2Tiktok').value = u.kontakt.tiktok; $('#dv2Snapchat').value = u.kontakt.snapchat; $('#dv2Telefon').value = u.kontakt.contact_phone;
    var m = maks();
    $('#dv2Tagline').maxLength = m.tagline; $('#dv2Address').maxLength = m.address; $('#dv2Bio').maxLength = m.bio; $('#dv2Om').maxLength = m.om;
    tegnTellere();
  }
  function tegnTellere() {
    var m = maks(), u = S.utkast.profil;
    [['#dv2TaglineT', u.tagline, m.tagline], ['#dv2AddressT', u.address, m.address], ['#dv2BioT', u.bio, m.bio], ['#dv2OmT', u.om, m.om]].forEach(function (t) {
      var n = t[1].length, e = $(t[0]); if (!e) return;
      e.textContent = n >= t[2] * 0.7 ? n + ' / ' + t[2] : '';
      e.className = 'dv2-teller' + (n > t[2] ? ' over' : n >= t[2] * 0.9 ? ' nær' : '');
    });
  }
  function tegnSteg() {
    // Oppsettet (fokusmodus, siden ikke publisert ennå) og vanlig Din side har samme steg — bare tittelen skiller.
    var t = $('#dv2Tittel'); if (t) t.textContent = erFokus() ? 'Sett opp siden din' : 'Din side';
    $$('#dv2Steg [data-steg]').forEach(function (b) { var i = +b.dataset.steg; b.setAttribute('aria-selected', String(i === S.steg)); b.tabIndex = i === S.steg ? 0 : -1; });
    $$('.dv2-sek').forEach(function (s) { s.hidden = +s.dataset.sek !== S.steg; });
    var rot = $('#dinsideV2'); if (rot) rot.classList.toggle('dv2-siste', S.steg === STEG.length - 1);   // «Ideer & ønsker» bare på Kontakt
    tegnFeilpunkt(); tegnKnapper();
  }
  function tegnFeilpunkt() {
    $$('#dv2Steg [data-steg]').forEach(function (b) { var p = $('.feilpunkt', b); if (p) p.hidden = !(S.feil && FELT_STEG[S.feil.felt] === +b.dataset.steg); });
  }
  // Bunnbar: én rad. Steg 1–3: «← Tilbake» + «Neste →». Siste steg: «← Tilbake» + «Lagre endringer».
  // «Lagre endringer» er aktiv ved endringer — og alltid mens siden ikke er live (lagringen publiserer da).
  function tegnKnapper() {
    if (!el.lagre) return;
    var sist = S.steg === STEG.length - 1, live = erLive(), skitten = ulagret();
    if (el.grid) el.grid.inert = S.lagrer;
    el.tilbake.hidden = S.steg === 0;
    el.neste.hidden = sist; el.lagre.hidden = !sist;
    el.lagre.disabled = (live && !skitten) || S.lagrer || !!S.opplaster;
    el.lagre.textContent = S.lagrer ? 'Lagrer …' : 'Lagre endringer';
    var h = $('#dv2Hjelpelinje'); if (h) h.hidden = !(sist && !live);
  }
  function tegnStatus() {
    el.status.textContent = S.statusTekst; el.status.className = 'dv2-status' + (S.statusType ? ' ' + S.statusType : '');
  }
  var HAKE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  function hakeFarge(hex) { return kontrast(hex, '#ffffff') >= kontrast(hex, '#141210') ? '#ffffff' : '#141210'; }
  function aksentHexFor(u) {
    if (u.aksent === 'egen') return normHex(u.custom_accent) || '#0071e3';
    var a = ((S.valg && S.valg.aksenter) || []).filter(function (x) { return x.key === u.aksent; })[0];
    return (a && a.hex) || '#0071e3';
  }

  // Farge: hex ↔ hsv (fargevelgeren jobber i hsv; utkastet lagrer hex).
  function tilHex(r, g, b) { return '#' + [r, g, b].map(function (x) { return Math.round(x).toString(16).padStart(2, '0'); }).join(''); }
  function hsvTilHex(h, s, v) { function f(n) { var k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); } return tilHex(f(5) * 255, f(3) * 255, f(1) * 255); }
  function hexTilHsv(hex) {
    hex = normHex(hex) || '#0071e3';
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }

  // Lys/mørk: to små forhåndsvisningsbrikker. Bygges én gang (fokus bevares ved piltaster), oppdateres i stedet for å tegnes på nytt.
  function tegnModus() {
    var u = S.utkast.utseende, box = $('#dv2Modus'), aks = aksentHexFor(u);
    if (!box.children.length) {
      box.innerHTML = ['lys', 'mork'].map(function (m) {
        return '<button type="button" role="radio" data-mode="' + m + '"><span class="brikke" data-m="' + m + '"><i class="b1"></i><i class="b2"></i><i class="b3"></i></span><span class="navn">' + (m === 'lys' ? 'Lys' : 'Mørk') + '</span></button>';
      }).join('');
    }
    $$('[data-mode]', box).forEach(function (b) {
      var på = b.dataset.mode === u.color_mode; b.setAttribute('aria-checked', String(på)); b.tabIndex = på ? 0 : -1;
      $('.brikke', b).style.setProperty('--aks', aks);
    });
  }

  // Aksent: fire brikker på én rad (fra valg.aksenter — aldri hardkodet hex). «Din egen» uten farge = fargehjul.
  function tegnAksenter() {
    var u = S.utkast.utseende, box = $('#dv2Aksenter'), aks = (S.valg && S.valg.aksenter) || [];
    if (box.dataset.bygd !== String(aks.length)) {
      box.innerHTML = aks.map(function (a) {
        var stil = a.hex ? ' style="--prove-aksent:' + a.hex + ';color:' + hakeFarge(a.hex) + '"' : '';
        return '<button type="button" role="radio" data-aksent="' + a.key + '"><span class="prove"' + stil + '>' + HAKE + '</span><span class="navn">' + (AKSENT_NAVN[a.key] || a.key) + '</span></button>';
      }).join('');
      box.dataset.bygd = String(aks.length);
    }
    var hx = normHex(u.custom_accent), egen = u.aksent === 'egen';
    $$('[data-aksent]', box).forEach(function (b) {
      var på = b.dataset.aksent === u.aksent; b.setAttribute('aria-checked', String(på)); b.tabIndex = på ? 0 : -1;
      var p = $('.prove', b);
      if (b.dataset.aksent === 'egen') {
        var vis = egen && hx;
        p.classList.toggle('egen-tom', !vis);
        if (vis) { p.style.setProperty('--prove-aksent', hx); p.style.color = hakeFarge(hx); }
        b.style.setProperty('--ring', vis ? hx : 'var(--ink)');
      } else {
        var def = aks.filter(function (a) { return a.key === b.dataset.aksent; })[0];
        b.style.setProperty('--ring', (def && def.hex) || 'var(--ink)');
      }
    });
  }

  function tegnUtseende(medHex) {
    var u = S.utkast.utseende;
    tegnModus(); tegnAksenter();
    var egen = u.aksent === 'egen', velger = $('#dv2Velger');
    velger.hidden = !egen;
    if (egen) {
      var hx = normHex(u.custom_accent), vis = hx || hsvTilHex(S.hsv.h, S.hsv.s, S.hsv.v);
      velger.style.setProperty('--valgt', vis); $('#dv2Sv').style.setProperty('--hue', Math.round(S.hsv.h));
      $('#dv2SvTommel').style.left = (S.hsv.s * 100) + '%'; $('#dv2SvTommel').style.top = ((1 - S.hsv.v) * 100) + '%';
      $('#dv2HueTommel').style.left = (S.hsv.h / 360 * 100) + '%';
      $('#dv2Sv').setAttribute('aria-valuenow', Math.round(S.hsv.s * 100));
      $('#dv2Sv').setAttribute('aria-valuetext', 'Metning ' + Math.round(S.hsv.s * 100) + ' %, lysstyrke ' + Math.round(S.hsv.v * 100) + ' %');
      $('#dv2Hue').setAttribute('aria-valuenow', Math.round(S.hsv.h)); $('#dv2Hue').setAttribute('aria-valuetext', Math.round(S.hsv.h) + ' grader');
      if (!medHex) $('#dv2Hex').value = hx || u.custom_accent || '';
      var ugyldig = !!u.custom_accent && !hx;
      $('#dv2Hex').setAttribute('aria-invalid', String(ugyldig));
      var hf = $('#dv2HexFeil'); hf.hidden = !ugyldig; hf.textContent = ugyldig ? 'Skriv en gyldig fargekode, for eksempel #1e40af.' : '';
      var kk = hx ? knappMotBakgrunn(hx, u.color_mode) : null, v = $('#dv2Kontrast');
      // Svak kontrast varsles, men valget nektes ikke (låst designmodell 19.10).
      if (hx && kk < KONTRAST_VARSEL) { v.hidden = false; v.textContent = 'Knappene kan bli vanskelige å se mot ' + (u.color_mode === 'lys' ? 'den lyse' : 'den mørke') + ' bakgrunnen (kontrast ' + kk.toFixed(1).replace('.', ',') + '). Du kan bruke fargen likevel.'; }
      else { v.hidden = true; v.textContent = ''; }
    } else { $('#dv2Kontrast').hidden = true; $('#dv2HexFeil').hidden = true; }
    tegnFonter();
  }

  /* ── Fonter (fra valg.fonter — nye fonter legges inn i backend, ikke her) ── */
  function famNavn(f) { return String(f.family || f.navn || '').replace(/^['"]|['"]$/g, ''); }
  function lastFont(f) {
    if (!f || S.fontStatus[f.key]) return;
    S.fontStatus[f.key] = 'laster';
    if (typeof FontFace === 'undefined' || !document.fonts || !f.url) { S.fontStatus[f.key] = 'feil'; return; }
    var ff;
    try { ff = new FontFace(famNavn(f), 'url(' + f.url + ')', { weight: String(f.vekt || 400), display: 'swap' }); }
    catch (e) { S.fontStatus[f.key] = 'feil'; return; }
    ff.load().then(function (face) { document.fonts.add(face); S.fontStatus[f.key] = 'klar'; tegnFonter(); },
                   function () { S.fontStatus[f.key] = 'feil'; tegnFonter(); });
  }
  function tegnFonter() {
    var liste = (S.valg && S.valg.fonter) || [], u = S.utkast.utseende, box = $('#dv2Fonter');
    if (!box) return;
    if (box.options.length !== liste.length) {
      box.innerHTML = '';
      liste.forEach(function (f) { box.appendChild(lagEl('option', { value: f.key }, f.navn)); });
    }
    box.value = u.font;
    var f = liste.find(function (font) { return font.key === u.font; });
    var navn = $('#dv2FontProve'), st = f && S.fontStatus[f.key];
    navn.textContent = S.shop || 'Sjappenavnet ditt';
    navn.style.fontFamily = st === 'klar' ? "'" + famNavn(f) + "', Inter, system-ui, sans-serif" : '';
    navn.style.fontWeight = st === 'klar' ? String(f.vekt || 400) : '';
    $('#dv2FontStatus').textContent = st === 'laster' ? 'Laster skrift …' : st === 'feil' ? 'Skriften kunne ikke lastes. Forhåndsvisningen bruker standardskriften.' : '';
  }


  /* ══ Steg-navigasjon ═══════════════════════════════════════════════════════════════════════════════ */
  function gaaTilSteg(n, rull) {
    n = Math.max(0, Math.min(STEG.length - 1, n));
    if (n !== S.steg) { nullstillLagreStatus(); nullstillBilderFeil(); }
    S.steg = n; tegnSteg();
    if (rull) { var nav = $('#dv2Steg'); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start' }); }
    if (n === 2) hentBilder();
  }

  /* ══ Feil ved riktig felt ══════════════════════════════════════════════════════════════════════════ */
  function visFeil(feltNavn, tekst, hopp) {
    fjernFeil();
    S.feil = { felt: feltNavn, tekst: tekst };
    var s = FELT_STEG[feltNavn];
    if (s == null) { S.statusTekst = tekst; S.statusType = 'feil'; tegnStatus(); return; }
    if (hopp) { S.steg = s; tegnSteg(); }
    if (feltNavn === 'custom_accent') { var hf = $('#dv2HexFeil'); hf.hidden = false; hf.textContent = tekst; }
    else if (feltNavn === 'font' || feltNavn === 'aksent' || feltNavn === 'color_mode') { var g = $('#dv2' + (feltNavn === 'font' ? 'FontGr' : 'AksentGr')); if (g) { var p = lagEl('p', { class: 'dv2-feil', role: 'alert' }, tekst); p.dataset.dv2Feil = '1'; g.appendChild(p); } }
    else if (feltNavn === 'slot' || feltNavn === 'ids') { S.bilderFeil = tekst; tegnBilderFeil(); }
    else {
      var w = $('[data-felt="' + feltNavn + '"]');
      if (w) { w.classList.add('har-feil'); var pe = $('.dv2-feil', w); if (pe) { pe.hidden = false; pe.textContent = tekst; } }
    }
    S.statusTekst = 'Ikke lagret. Se feltet som er markert' + (hopp ? ' under «' + STEG[s].navn + '».' : '.'); S.statusType = 'feil';
    tegnStatus(); tegnFeilpunkt();
    if (hopp) {
      var inp = STEG_FELT[feltNavn] ? $(STEG_FELT[feltNavn]) : null;
      setTimeout(function () { if (inp) { inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'center' }); } }, 30);
    }
  }
  function fjernFeil() {
    S.feil = null;
    $$('.dv2-fld.har-feil').forEach(function (w) { w.classList.remove('har-feil'); var p = $('.dv2-feil', w); if (p) { p.hidden = true; p.textContent = ''; } });
    $$('[data-dv2-feil]').forEach(function (p) { p.remove(); });
    var hf = $('#dv2HexFeil'); if (hf && !(S.utkast && S.utkast.utseende.custom_accent && !normHex(S.utkast.utseende.custom_accent))) { hf.hidden = true; hf.textContent = ''; }
    S.bilderFeil = ''; tegnBilderFeil();
    tegnFeilpunkt();
  }

  /* ══ Lagre ═════════════════════════════════════════════════════════════════════════════════════════
     Kontrakt (backend redesign-v2): POST /api/dashboard/din-side/lagre — ren JSON uten bildeendring, multipart (draft +
     filer) med bildeutkast. Body bærer publiser: !live. Svaret er ALLTID 200 når lagringen gikk gjennom:
       { lagret:true, publisering:{ publisert, forste_gang, page_status, grunn, mangler[], melding? }, …din-side, …billing }
     publisert:true → bekreftelsen «Siden din er live». publisert:false med melding → meldingen vises som den er.
     400 { error, felt } = valideringsfeil (ingenting skrevet). v2 kaller ALDRI PUT /page-status. */
  function lokalValider() {
    var u = S.utkast.utseende;
    if (u.aksent === 'egen' && !normHex(u.custom_accent)) return { felt: 'custom_accent', tekst: 'Skriv en gyldig fargekode, for eksempel #1e40af.' };
    var m = maks(), p = S.utkast.profil;
    var g = [['tagline', 'Spesialiteten', m.tagline], ['address', 'Adressen', m.address], ['bio', 'Beskrivelsen', m.bio], ['om', 'Teksten i Mer info', m.om]];
    for (var i = 0; i < g.length; i++) { var n = p[g[i][0]].trim().length; if (n > g[i][2]) return { felt: g[i][0], tekst: g[i][1] + ' kan være maks ' + g[i][2] + ' tegn. Den er ' + n + ' tegn. Kort ned og prøv igjen.' }; }
    return null;
  }
  async function lagre() {
    if (S.lagrer) return;
    var live = erLive();
    if (live && !ulagret()) return;
    fjernFeil();
    var lf = lokalValider();
    if (lf) { visFeil(lf.felt, lf.tekst, true); return; }
    S.lagrer = true; S.statusTekst = ''; S.statusType = ''; tegnKnapper(); tegnStatus();
    var sendt = JSON.stringify(norm(S.utkast)), ekstra = { publiser: !live }, r, d = {};
    try {
      r = S.bilderDirty
        ? await apiFetch('/api/dashboard/din-side/lagre', { method: 'POST', body: await draftForm(false, ekstra), timeout: 120000 })
        : await apiFetch('/api/dashboard/din-side/lagre', { method: 'POST', body: JSON.stringify(Object.assign(bodyFra(false), ekstra)) });
    }
    catch (e) { S.lagrer = false; S.statusTekst = skrivefeil(e) + ' Vi kunne ikke bekrefte lagringen. Behold utkastet og prøv igjen eller last siden på nytt for å sjekke.'; S.statusType = 'feil'; tegnKnapper(); tegnStatus(); return; }
    S.lagrer = false;
    if (!r) return;                                           // 401 → innlogging
    try { d = await r.json(); } catch (e) { d = {}; }
    if (r.ok && d && d.lagret) {
      if (S.bilderDirty) { var gamle = S.bilder; S.bilderDirty = false; await hentBilder(); slippUrler(gamle); }
      S.lagret = formFra(d);
      S.shop = (d.profil && d.profil.shop) || S.shop;
      if (JSON.stringify(norm(S.utkast)) === sendt) { S.utkast = kopi(S.lagret); fyllFelter(); tegnUtseende(); }
      if (typeof erBillingShape === 'function' && erBillingShape(d) && typeof settBilling === 'function') settBilling(d);
      if (typeof loadProfil === 'function') loadProfil();     // Konto → «Lagre navn» sender lagrede verdier: ikke la dem bli utdatert
      var p = d.publisering || {};
      if (p.publisert) { tegnKnapper(); visBekreftelse(); return; }
      if (p.melding) { S.statusTekst = p.melding; S.statusType = 'info'; }          // lagret, men ikke publisert — som backend skriver den
      else { S.statusTekst = '✓ Lagret. Kundene ser endringene nå.'; S.statusType = 'ok'; }
      tegnKnapper(); tegnStatus(); tegnFeilpunkt();
      return;
    }
    if (r.status === 400 && d && d.felt) { tegnKnapper(); visFeil(d.felt, d.error || 'Ugyldig verdi.', true); return; }
    S.statusTekst = (d && d.error) || ('Kunne ikke lagre (feil ' + r.status + '). Ingenting er endret. Prøv igjen.'); S.statusType = 'feil';
    tegnKnapper(); tegnStatus();
  }

  /* ── Etter første lagring som publiserer: «Siden din er live» → «Kopier lenke» → Oversikt ── */
  function sideLenke() { return (typeof CONFIG !== 'undefined' && CONFIG.BARBER_SLUG) ? CONFIG.SITE_BASE + '/' + CONFIG.BARBER_SLUG : ''; }
  function visBekreftelse() {
    if (erFokus() && typeof avsluttFokus === 'function') avsluttFokus();   // oppsettet er ferdig
    el.grid.hidden = true; $('#dv2Bekreft').hidden = false; $('#dv2Kopiert').textContent = '';
    $('#dv2Lenke').textContent = sideLenke().replace(/^https?:\/\//, '');
    window.scrollTo(0, 0); $('#dv2BekreftH').focus({ preventScroll: true });
  }
  async function kopierLenke() {
    var url = sideLenke(), ut = $('#dv2Kopiert');
    try { await navigator.clipboard.writeText(url); ut.textContent = 'Lenken er kopiert.'; }
    catch (e) { var rng = document.createRange(); rng.selectNodeContents($('#dv2Lenke')); var s = getSelection(); s.removeAllRanges(); s.addRange(rng); ut.textContent = 'Lenken er markert. Kopier den med Ctrl+C.'; }
  }
  function tilOversikt() {
    $('#dv2Bekreft').hidden = true; el.grid.hidden = false; S.statusTekst = ''; S.statusType = ''; tegnStatus();
    if (typeof switchPanel === 'function') switchPanel('oversikt');
  }

  /* ── Oppsettet (fokusmodus): X og «Fullfør siden din» ──
     X: ulagrede endringer → «Forkast» / «Bli her»; ellers lukkes oppsettet og hele dashbordet vises (Oversikt).
     «Fullfør siden din» (Oversikt, bare mens siden ikke er live): en lenke tilbake til oppsettet — ingen publiser-knapp. */
  function forkastUtkast() {
    if (S.bilderDirty) { var gamle = S.bilder; S.bilderDirty = false; settBilderFraServer(S.bilderLagret); slippUrler(gamle); }
    S.utkast = kopi(S.lagret); S.hsv = hexTilHsv(normHex(S.lagret.utseende.custom_accent)); S.statusTekst = ''; S.statusType = ''; fjernFeil();
    if (S.byggd) { fyllFelter(); tegnUtseende(); tegnPortrettOgGalleri(); tegnKnapper(); tegnStatus(); }
  }
  function lukkOppsett() {
    function lukk() { if (typeof settOppsettLukket === 'function') settOppsettLukket(true); if (typeof avsluttFokus === 'function') avsluttFokus(); S.tillatBytte = true; try { if (typeof switchPanel === 'function') switchPanel('oversikt'); } finally { S.tillatBytte = false; } }
    if (!ulagret()) { lukk(); return; }
    dialog({ tittel: 'Du har ulagrede endringer', tekst: 'Endringene på siden din er ikke lagret. Lukker du nå, forsvinner de.', ja: 'Forkast', nei: 'Bli her', farlig: true })
      .then(function (forkast) { if (forkast) { forkastUtkast(); lukk(); } });
  }
  function startOppsett() {
    if (typeof settOppsettLukket === 'function') settOppsettLukket(false);
    if (typeof settFokusFlagg === 'function') settFokusFlagg(true);
    document.body.classList.add('fokus');
    if (typeof switchPanel === 'function') switchPanel('design');
    if (S.byggd) tegnSteg();
  }
  function tegnFullfor(b) {
    var k = $('#dv2Fullfor'); if (!k) return;
    k.hidden = !(b && (b.page_status === 'forhandsvist' || b.page_status === 'draft'));   // samme to som backend kan publisere
  }

  /* ══ Forhåndsvisning ═══════════════════════════════════════════════════════════════════════════════ */
  function erDesktop() { return window.matchMedia && window.matchMedia("(min-width:1024px)").matches; }   // fast telefonramme fra 1024 px (CSS)
  function planleggPreview(ms) {
    S.pvStale = true;
    if (!el.iframe) return;
    clearTimeout(S.pvTimer);
    if (!S.aktiv || !S.utkast) return;
    if (!erDesktop() && !S.pvApen) return;                    // mobil: bare når flaten er åpen
    S.pvTimer = setTimeout(hentPreview, ms);
  }
  function lagScript(y) {
    return '<script>(function(){var y=' + (+y || 0) + ';function s(){scrollTo(0,y)}s();addEventListener("load",s);' +
      'addEventListener("scroll",function(){parent.postMessage({bhq:"scroll",y:scrollY},"*")},{passive:true});' +
      'addEventListener("keydown",function(e){if(e.key==="Escape")parent.postMessage({bhq:"escape"},"*")})})()<\/script>';
  }
  function pvMelding(tekst) {
    var m = $('.dv2-ramme-melding', el.ramme);
    if (!tekst) { if (m) m.remove(); return; }
    if (!m) { m = lagEl('div', { class: 'dv2-ramme-melding', role: 'status' }); el.ramme.appendChild(m); }
    m.textContent = tekst;
  }
  async function hentPreview() {
    if (!S.aktiv || !S.utkast) return;
    var mitt = ++S.pvSeq, b = bodyFra(true); b.side = S.side;
    var lin = $('.dv2-lastelinje', el.ramme); if (!lin) el.ramme.appendChild(lagEl('div', { class: 'dv2-lastelinje' }));
    var r, html = null, feil = null;
    try {
      r = S.bilderDirty && S.side!=='book' ? await apiFetch('/api/dashboard/din-side/preview',{method:'POST',body:await draftForm(true),timeout:60000}) : await apiFetch('/api/dashboard/preview', { method: 'POST', body: JSON.stringify(b) });
      if (r && r.ok) html = await r.text();
      else if (r) { var j = await r.json().catch(function () { return {}; }); feil = (j && j.error) || ('Forhåndsvisningen feilet (' + r.status + ').');
        // Avviste bilder i utkastet: meldingen hører til Bilder-steget («Legg til bilder»), ikke over forhåndsvisningen.
        if (S.bilderDirty && (r.status === 415 || r.status === 413 || r.status === 400)) { S.bilderFeil = feil; S.bilderFeilSlot = 'galleri'; tegnBilderFeil(); feil = ''; } }
    } catch (e) { feil = skrivefeil(e); }
    if (mitt !== S.pvSeq) return;                              // et nyere kall har overtatt
    var l2 = $('.dv2-lastelinje', el.ramme); if (l2) l2.remove();
    if (r === null) return;
    if (html != null) {
      pvMelding('');
      var med = html.indexOf('</body>') >= 0 ? html.replace('</body>', lagScript(S.pvScroll) + '</body>') : html + lagScript(S.pvScroll);
      el.iframe.srcdoc = med; S.pvStale = false;
    } else if (feil === '') pvMelding('');
    else pvMelding(feil || 'Kunne ikke laste forhåndsvisningen.');
  }
  function apnePv() {
    S.redigeringScrollY = window.scrollY;
    S.pvApen = true; el.pv.classList.add('apen'); document.body.classList.add('dv2-pv-laas');
    if (S.pvStale || !el.iframe.srcdoc) planleggPreview(0);
    $('#dv2PvLukk').focus({ preventScroll: true });
  }
  function lukkPv() {
    S.pvApen = false; el.pv.classList.remove('apen'); document.body.classList.remove('dv2-pv-laas');
    window.scrollTo(0, S.redigeringScrollY);
    var b = $('#dv2SeSiden'); if (b && b.offsetParent) b.focus({ preventScroll: true });
  }

  // Siste inndata: tastatur eller peker (mus/berøring). Styrer hvor dialogen legger fokus.
  var sistTastatur = false;
  document.addEventListener('keydown', function (e) { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.indexOf('Arrow') === 0) sistTastatur = true; }, true);
  document.addEventListener('pointerdown', function () { sistTastatur = false; }, true);

  /* ══ Dialog ════════════════════════════════════════════════════════════════════════════════════════ */
  function dialog(o) {
    return new Promise(function (resolve) {
      var forrige = document.activeElement;
      var bak = lagEl('div', { class: 'dv2-dialog-bak' });
      var d = lagEl('div', { class: 'dv2-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dv2DlgT', 'aria-describedby': 'dv2DlgP' });
      d.tabIndex = -1;
      d.appendChild(lagEl('h4', { id: 'dv2DlgT' }, o.tittel)); d.appendChild(lagEl('p', { id: 'dv2DlgP' }, o.tekst));
      var rad = lagEl('div', { class: 'rad' });
      var ja = lagEl('button', { type: 'button', class: 'dv2-btn' + (o.farlig ? ' farlig' : ' prim') }, o.ja);
      var nei = lagEl('button', { type: 'button', class: 'dv2-btn' }, o.nei);
      rad.appendChild(ja); rad.appendChild(nei); d.appendChild(rad); bak.appendChild(d); document.body.appendChild(bak);
      function lukk(v) { document.removeEventListener('keydown', tast, true); bak.remove(); if (forrige && forrige.focus) forrige.focus({ preventScroll: true }); resolve(v); }
      function tast(e) {
        if (e.key === 'Escape') { e.stopPropagation(); lukk(false); }
        else if (e.key === 'Tab') { var f = [ja, nei], i = f.indexOf(document.activeElement); e.preventDefault(); (i < 0 ? nei : f[(i + 1) % 2]).focus(); }   // to knapper: Tab og Shift+Tab bytter begge; fra dialogen først «Bli her»
      }
      ja.addEventListener('click', function () { lukk(true); }); nei.addEventListener('click', function () { lukk(false); });
      bak.addEventListener('click', function (e) { if (e.target === bak) lukk(false); });
      document.addEventListener('keydown', tast, true);
      // Fokusring bare ved tastatur: åpnet med trykk får selve dialogen fokus (skjermleseren er inne, ingen ring på en knapp);
      // åpnet med tastatur får «Bli her» fokus og ringen vises (:focus-visible).
      if (sistTastatur) nei.focus(); else d.focus({ preventScroll: true });
    });
  }

  // Fanebytte med ulagrede endringer. Kalles først i nav-klikk-handleren; true = bytte stoppet (dialog vises).
  function fangBytte(knapp) {
    if (S.tillatBytte || !ulagret()) return false;
    var panel = knapp && knapp.dataset && knapp.dataset.panel;
    if (!panel || panel === 'design') return false;
    if (typeof aktivtPanel === 'function' && aktivtPanel() !== 'design') return false;
    dialog({ tittel: 'Du har ulagrede endringer', tekst: 'Endringene på Din side er ikke lagret. Hvis du går videre nå, forsvinner de.', ja: 'Forkast endringene', nei: 'Bli her', farlig: true }).then(function (forkast) {
      if (forkast) {
        forkastUtkast();
        S.tillatBytte = true; try { knapp.click(); } finally { S.tillatBytte = false; }
      } else if (location.hash.replace('#', '') !== 'dinside') { location.hash = 'dinside'; }
    });
    return true;
  }

  /* ══ Bilder ════════════════════════════════════════════════════════════════════════════════════════ */
  async function hentBilder() {
    if(S.bilderDirty)return;
    var r, d = null;
    try { r = await apiFetch('/api/dashboard/images'); if (r && r.ok) d = await r.json(); } catch (e) { d = null; }
    if (r === null || S.bilderDirty) return;
    if (!Array.isArray(d)) { S.bilderFeil = 'Kunne ikke hente bildene dine. Prøv igjen om litt.'; tegnBilderFeil(); return; }
    S.bilderFeil = ''; tegnBilderFeil();
    S.bilderLastet=true;S.bilderLagret=kopi(d);
    // Samme streng som backend imageVersion(): id:updated_at-ms:slot:sort_order. ?v= i url-en ER updated_at-ms (GET /images).
    S.imageVersion=bildeVersjon(d);
    settBilderFraServer(d);
    tegnPortrettOgGalleri();
  }
  // Versjonsstempel for konfliktvernet. MÅ være byte-likt backend imageVersion() (src/lib/imageDraft.js):
  //   portrett+galleri, «id:updated_at-ms:slot:sort_order», sortert, slått sammen med «|».
  // updated_at-ms leses av ?v= i url-en fra GET /images (backend setter ?v=0 når updated_at er null, som new Date(0)).
  function bildeVersjon(liste) {
    return (liste || []).filter(function (b) { return b.slot === 'portrett' || b.slot === 'galleri'; })
      .map(function (b) { var v = Number((String(b.url || '').split('?v=')[1] || '0')); return b.id + ':' + v + ':' + b.slot + ':' + b.sort_order; })
      .sort().join('|');
  }
  // ÉN setter for S.bilder fra serverens liste (henting og «Forkast»). Kopi, så utkastet aldri endrer bilderLagret.
  function settBilderFraServer(liste) {
    S.bilder = kopi(liste).sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    if (typeof imgs !== 'undefined') imgs = S.bilder;          // crop-modalen leser originalUrl/cropRect herfra
    if (S.valgtBilde && !S.bilder.some(function (b) { return b.id === S.valgtBilde; })) S.valgtBilde = null;
  }
  // Frigjør blob-URL-er fra et utkast som er forkastet eller lagret (ellers blir filene liggende i minnet til fanen lukkes).
  function slippUrler(liste) {
    var iBruk = {}; S.bilder.forEach(function (b) { iBruk[b.url] = 1; iBruk[b.originalUrl] = 1; });
    (liste || []).forEach(function (b) { [b.url, b.originalUrl].forEach(function (u) { if (u && u.indexOf('blob:') === 0 && !iBruk[u]) { try { URL.revokeObjectURL(u); } catch (e) {} } }); });
  }
  function bildeUrl(b) { return /^(blob:|data:|https?:)/.test(b.url)?b.url:(typeof CONFIG !== 'undefined' ? CONFIG.API_BASE : '') + b.url; }
  function iSlot(slot) { return S.bilder.filter(function (b) { return b.slot === slot; }); }
  // Bildefeilen står ETT sted: ved knappen den gjelder (portrett-knappene eller «Legg til bilder»). S.bilderFeilSlot sier hvilken.
  function tegnBilderFeil() {
    var p = $('#dv2PortrettFeil'), g = $('#dv2BilderFeil'), iPortrett = S.bilderFeilSlot === 'portrett';
    if (p) { p.hidden = !(S.bilderFeil && iPortrett); p.textContent = iPortrett ? S.bilderFeil : ''; }
    if (g) { g.hidden = !(S.bilderFeil && !iPortrett); g.textContent = iPortrett ? '' : S.bilderFeil; }
  }
  // Nullstilles som Lagret-meldingen: ved stegbytte, fanebytte og ny inngang — følger aldri med til et annet steg.
  function nullstillBilderFeil() { if (!S.bilderFeil) return; S.bilderFeil = ''; tegnBilderFeil(); }

  function tegnPortrettOgGalleri() {
    if (!S.byggd) return;
    // Portrett / logo
    var p = iSlot('portrett')[0], box = $('#dv2Portrett'); box.innerHTML = '';
    var rad = lagEl('div', { class: 'dv2-bildeboks' });
    var ring = lagEl('div', { class: 'dv2-portrett' });
    if (p) { var im = lagEl('img', { src: bildeUrl(p), alt: 'Portrett' }); ring.appendChild(im); } else ring.textContent = 'Ingen';
    rad.appendChild(ring);
    var t = lagEl('div', { class: 'tekst' });
    t.appendChild(lagEl('span', null, p ? 'Vises som en sirkel ved sjappenavnet.' : 'Et lite bilde ved navnet ditt. Vises som en sirkel.'));
    var h = lagEl('div', { class: 'dv2-handl' });
    if (p) {
      h.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'beskjaer', 'data-id': p.id }, 'Beskjær'));
      h.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'bytt' }, 'Bytt bilde'));
      h.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten farlig', 'data-h': 'slett', 'data-id': p.id }, 'Fjern'));
    } else h.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'legg-til' }, 'Legg til bilde'));
    rad.appendChild(t); box.appendChild(rad); box.appendChild(h);

    // Galleri
    var g = iSlot('galleri'), n = g.length, mx = bildeMaks().galleri;
    $('#dv2GalleriTeller').textContent = n + ' av ' + mx; $('#dv2GalleriTeller').style.cssText = 'font-size:13px;color:var(--mut)';
    var gb = $('#dv2Galleri'); gb.innerHTML = '';
    if (!n) gb.appendChild(lagEl('div', { class: 'dv2-tomt' }, 'Ingen arbeidsbilder ennå. Kunden åpner dem via «Bilder» på siden din.'));
    else {
      var ramme = lagEl('div', { class: 'dv2-galleri-ramme' }), grid = lagEl('div', { class: 'dv2-galleri' });   // ingen role=list: listitem på <button> overstyrer knapperollen for skjermlesere
      g.forEach(function (b, i) {
        var kol = i % 2, over = i - 2 >= 0, under = i + 2 < n, venstre = kol === 1, hoyre = kol === 0 && i + 1 < n;
        var kl = 'flis' + (!over && !venstre ? ' hjørne-tv' : '') + (!over && !hoyre ? ' hjørne-th' : '') + (!under && !venstre ? ' hjørne-bv' : '') + (!under && !hoyre ? ' hjørne-bh' : '');
        var f = lagEl('button', { type: 'button', class: kl, 'data-id': b.id, 'aria-pressed': String(S.valgtBilde === b.id), 'aria-label': 'Bilde ' + (i + 1) + ' av ' + n + '. Velg for å flytte, beskjære eller slette.' });
        f.appendChild(lagEl('img', { src: bildeUrl(b), alt: '' })); f.appendChild(lagEl('span', { class: 'nr' }, String(i + 1)));
        grid.appendChild(f);
      });
      ramme.appendChild(grid); gb.appendChild(ramme);
      var valgt = g.filter(function (b) { return b.id === S.valgtBilde; })[0];
      var v = lagEl('div', { class: 'dv2-verktoy' });
      if (valgt) {
        var idx = g.indexOf(valgt);
        v.appendChild(lagEl('p', null, 'Bilde ' + (idx + 1) + ' av ' + n + ' er valgt. Rekkefølgen er slik kunden ser den, rad for rad.'));
        var hh = lagEl('div', { class: 'dv2-handl' });
        var tidl = lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'tidligere' }, '← Tidligere'); tidl.disabled = idx === 0;
        var sen = lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'senere' }, 'Senere →'); sen.disabled = idx === n - 1;
        hh.appendChild(tidl); hh.appendChild(sen);
        hh.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten', 'data-h': 'beskjaer', 'data-id': valgt.id }, 'Beskjær'));
        hh.appendChild(lagEl('button', { type: 'button', class: 'dv2-btn liten farlig', 'data-h': 'slett', 'data-id': valgt.id }, 'Slett'));
        v.appendChild(hh);
      } else v.appendChild(lagEl('p', { style: 'margin:0' }, 'Trykk på et bilde for å flytte, beskjære eller slette det.'));
      gb.appendChild(v);
    }
    var add = lagEl('div', { class: 'dv2-handl' });
    var legg = lagEl('button', { type: 'button', class: 'dv2-btn', 'data-h': 'legg-til-galleri' }, 'Legg til bilder');
    legg.disabled = n >= mx || !!S.opplaster; add.appendChild(legg); gb.appendChild(add);
    if (n >= mx) gb.appendChild(lagEl('p', { class: 'dv2-hjelp' }, 'Du har lagt til alle ' + mx + ' bildene du kan ha. Slett et bilde for å legge til et nytt.'));
    if (S.opplaster) gb.appendChild(lagEl('p', { class: 'dv2-opplast', role: 'status' }, S.opplaster));
  }

  function portrettKlikk(e) {
    var b = e.target.closest('[data-h]'); if (!b) return;
    if (b.dataset.h === 'legg-til') $('#dv2FilPortrett').click();
    else if (b.dataset.h === 'bytt') { S.bytteSlot = 'portrett'; $('#dv2FilBytt').click(); }
    else if (b.dataset.h === 'beskjaer') beskjaer(b.dataset.id, 'portrett');
    else if (b.dataset.h === 'slett') slettBilde(b.dataset.id, 'portrett');
  }
  function galleriKlikk(e) {
    var fl = e.target.closest('.flis');
    if (fl) { S.valgtBilde = S.valgtBilde === fl.dataset.id ? null : fl.dataset.id; tegnPortrettOgGalleri(); return; }
    var b = e.target.closest('[data-h]'); if (!b || b.disabled) return;
    var h = b.dataset.h;
    if (h === 'legg-til-galleri') $('#dv2FilGalleri').click();
    else if (h === 'tidligere') flytt(-1); else if (h === 'senere') flytt(1);
    else if (h === 'beskjaer') beskjaer(b.dataset.id, 'galleri');
    else if (h === 'slett') slettBilde(b.dataset.id, 'galleri');
  }
  function beskjaer(id, slot) {
    var b = S.bilder.filter(function (x) { return x.id === id; })[0]; if (!b || typeof _openCropModal !== 'function') return;
    _openCropModal(id, slot, bildeUrl(b));
  }
  function draftChanged(){S.bilderDirty=true;if(typeof imgs!=='undefined')imgs=S.bilder;tegnPortrettOgGalleri();endret('slot');planleggPreview(0);}
  async function slettBilde(id,slot){
    var ok=await dialog({tittel:'Fjerne bildet?',tekst:'Bildet fjernes fra kundesiden først når du lagrer.',ja:'Fjern fra utkast',nei:'Behold',farlig:true});if(!ok)return;
    S.bilder=S.bilder.filter(function(b){return b.id!==id;});S.valgtBilde=null;draftChanged();
  }
  async function flytt(retning){var g=iSlot('galleri'),i=g.findIndex(function(b){return b.id===S.valgtBilde;}),j=i+retning;if(i<0||j<0||j>=g.length)return;var t=g[i];g[i]=g[j];g[j]=t;g.forEach(function(b,n){b.sort_order=n;});S.bilder.sort(function(a,b){return a.sort_order-b.sort_order;});draftChanged();}
  function stageCrop(id,blob,rect){var b=S.bilder.find(function(x){return x.id===id;});if(!b)return false;if(b._new&&b._file&&!b._original)b._original=b._file;b._file=blob;b.url=URL.createObjectURL(blob);b.cropRect=rect;draftChanged();return true;}
  // Forhåndsvisningen trenger ikke fullt bilde: backend skalerer uansett ned til 600 px (din-side/preview). Uten dette gikk
  // alle nye bilder (opptil 2000 px) over nettet på hvert tastetrykk i Profil. Kopien lages én gang per fil og gjenbrukes.
  var PV_KANT = 600;
  async function pvFil(b) {
    if (b._pvFor !== b._file) { b._pv = await nedskaler(b._file, PV_KANT); b._pvFor = b._file; }
    return b._pv;
  }
  // Multipart-utkastet. preview=true: små kopier og ingen original (preview bruker den ikke). Lagring: full fil + original.
  async function draftForm(preview, ekstra){
    var fd=new FormData(),body=Object.assign(bodyFra(!!preview),ekstra||{});body.imageVersion=S.imageVersion;
    var liste=S.bilder.filter(function(b){return b.slot==='portrett'||b.slot==='galleri';});
    body.images=[];
    for(var i=0;i<liste.length;i++){
      var b=liste[i],item={slot:b.slot,cropRect:b.cropRect||null};
      if(!b._new)item.id=b.id;
      if(b._file){item.file='image'+i;fd.append('images',preview?await pvFil(b):b._file,item.file);}
      if(b._original&&!preview){item.original='original'+i;fd.append('images',b._original,item.original);}
      body.images.push(item);
    }
    fd.append('draft',JSON.stringify(body));return fd;
  }

  /* ── Bildeformater og størrelse — SAMME regler som backend ──
     backend src/routes/dashboard.js:100 (multer fileFilter: image/jpeg|png|webp|heic|heif) og :96 (fileSize 20 MB).
     GET /din-side sender ikke lista, så den står her; endres backend, endres disse. Teksten skal være den samme som
     backendens 415-melding (formatAvvist, dashboard.js:107). Endelsen sjekkes også: HEIC fra Windows/Chrome har ofte tom MIME-type. */
  var BILDE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  var BILDE_ENDELSE = /\.(jpe?g|png|webp|heic|heif)$/i;
  var BILDE_MAKS_BYTE = 20 * 1024 * 1024;
  var BILDE_FORMAT_TEKST = 'Bruk JPG, PNG, WebP eller HEIC.';
  function erSvg(fil) { return String(fil.type || '').toLowerCase() === 'image/svg+xml' || /\.svg$/i.test(fil.name || ''); }
  function godtattFormat(fil) { return erSvg(fil) || BILDE_MIME.indexOf(String(fil.type || '').toLowerCase()) >= 0 || (!fil.type && BILDE_ENDELSE.test(fil.name || '')); }
  var SVG_FEIL_TEKST = 'Logoen kunne ikke tegnes. Lagre den som PNG eller JPG og prøv igjen.';

  /* ── SVG → PNG i nettleseren. Backend avviser SVG med vilje (kan inneholde script), så SVG sendes aldri dit.
     Fila tegnes som <img> (et SVG-bilde kjører aldri script og henter aldri eksterne ressurser) på et canvas og eksporteres
     som PNG med gjennomsiktig bakgrunn. Størrelse: width/height, ellers viewBox; lengste kant skaleres til maksKant. */
  async function svgTilPng(fil, maksKant) {
    var tekst = await fil.text();
    var doc = new DOMParser().parseFromString(tekst, 'image/svg+xml'), rot = doc.documentElement;
    if (!rot || rot.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('svg');
    Array.prototype.slice.call(rot.querySelectorAll('script, foreignObject')).forEach(function (n) { n.remove(); });   // følger ikke med uansett, men ut
    function px(v) { var m = String(v || '').trim().match(/^([\d.]+)(px)?$/); return m ? parseFloat(m[1]) : 0; }
    var vb = String(rot.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    var w = px(rot.getAttribute('width')), h = px(rot.getAttribute('height'));
    if (!(w > 0 && h > 0) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
    if (!(w > 0 && h > 0)) throw new Error('svg');                                   // ingen størrelse å regne ut av
    if (!rot.getAttribute('viewBox')) rot.setAttribute('viewBox', '0 0 ' + w + ' ' + h);   // så den skalerer når width/height byttes
    var s = maksKant / Math.max(w, h), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    rot.setAttribute('width', cw); rot.setAttribute('height', ch);
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(rot)], { type: 'image/svg+xml' }));
    try {
      var im = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('svg')); }; i.src = url; });
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      cv.getContext('2d').drawImage(im, 0, 0, cw, ch);                                 // tomt canvas = gjennomsiktig bakgrunn
      var blob = await new Promise(function (res) { try { cv.toBlob(res, 'image/png'); } catch (e) { res(null); } });
      if (!blob) throw new Error('svg');
      return new File([blob], (fil.name || 'logo').replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
    } finally { URL.revokeObjectURL(url); }
  }

  /* ── Opplasting med nedskalering i nettleseren ── */
  function lesBilde(fil) {
    return new Promise(function (res, rej) {
      if (window.createImageBitmap) { createImageBitmap(fil).then(res, function () { viaImg(); }); } else viaImg();
      function viaImg() { var u = URL.createObjectURL(fil), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('avkoding')); }; im.src = u; }
    });
  }
  async function nedskaler(fil, maksKant) {
    // Små filer og bilder som nettleseren ikke kan lese (f.eks. HEIC) sendes som de er — serveren avgjør.
    var bm; try { bm = await lesBilde(fil); } catch (e) { return fil; }
    var w = bm.width || bm.naturalWidth, h = bm.height || bm.naturalHeight, lengst = Math.max(w, h);
    if (lengst <= maksKant && fil.size < 1.5 * 1024 * 1024) { if (bm.close) bm.close(); return fil; }
    var s = Math.min(1, maksKant / lengst), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bm, 0, 0, cw, ch); if (bm.close) bm.close();
    var png = fil.type === 'image/png';                          // logo med gjennomsiktighet beholdes som PNG
    var blob = await new Promise(function (res) { cv.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.9); });
    if (!blob || blob.size >= fil.size && lengst <= maksKant) return fil;
    var navn = (fil.name || 'bilde').replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
    return new File([blob], navn, { type: blob.type });
  }
  async function lastOpp(slot, filer) {
    if (S.opplaster || S.lagrer) return;
    // Utkastet bygger på serverens bildeliste (imageVersion + eksisterende id-er). Er den ikke hentet ennå, hent den først —
    // ellers ville lagringen sendt en tom versjon og et utkast uten de eksisterende bildene.
    if (!S.bilderLastet) {
      S.opplaster = 'Henter bildene dine …'; tegnPortrettOgGalleri();
      await hentBilder(); S.opplaster = '';
      if (!S.bilderLastet) { tegnPortrettOgGalleri(); tegnKnapper(); return; }   // hentBilder har satt feilmeldingen
    }
    var mx = bildeMaks().galleri, ledig = slot === 'galleri' ? Math.max(0, mx - iSlot('galleri').length) : 1;
    // Avvis andre formater FØR opplasting (samme regel som backend). Godkjente filer i samme valg går videre.
    S.bilderFeilSlot = slot;
    var godtatt = filer.filter(godtattFormat), avvist = filer.length - godtatt.length;
    var valgt = godtatt.slice(0, ledig);
    if (filer.length && !godtatt.length) { S.bilderFeil = (filer.length > 1 ? 'Ingen av bildene kunne brukes. ' : 'Bildet kunne ikke brukes. ') + BILDE_FORMAT_TEKST; tegnBilderFeil(); return; }
    var melding = [];
    if (avvist) melding.push((avvist === 1 ? 'Ett bilde' : avvist + ' bilder') + ' ble ikke lagt til. ' + BILDE_FORMAT_TEKST);
    if (slot === 'galleri' && godtatt.length > ledig) melding.push('Du kan ha ' + mx + ' bilder. Bare de første ' + ledig + ' ble lastet opp.');
    S.bilderFeil = melding.join(' ');
    var feilTekst = '';
    for (var i = 0; i < valgt.length; i++) {
      S.opplaster = valgt.length > 1 ? 'Laster opp ' + (i + 1) + ' av ' + valgt.length + ' …' : 'Laster opp …'; tegnPortrettOgGalleri();
      try {
        var maksKant = slot === 'portrett' ? 1200 : 2000, fil;
        if (erSvg(valgt[i])) {
          try { fil = await svgTilPng(valgt[i], maksKant); }
          catch (e) { S.bilderFeil = (S.bilderFeil ? S.bilderFeil + ' ' : '') + SVG_FEIL_TEKST; continue; }   // aldri lagt til i utkastet
        } else fil = await nedskaler(valgt[i], maksKant);
        // Sendes fila urørt (nettleseren kunne ikke lese/skalere den, typisk HEIC), gjelder backendens grense på 20 MB.
        if (fil === valgt[i] && fil.size > BILDE_MAKS_BYTE) {
          S.bilderFeil = (S.bilderFeil ? S.bilderFeil + ' ' : '') + 'Bildet er større enn 20 MB. Velg et mindre bilde, eller ta det på nytt med lavere oppløsning.';
          continue;
        }
        if(slot==='portrett')S.bilder=S.bilder.filter(function(b){return b.slot!=='portrett';});
        var url=URL.createObjectURL(fil);
        S.bilder.push({id:'draft-'+Date.now()+'-'+i,slot:slot,sort_order:S.bilder.length,url:url,originalUrl:url,_file:fil,_new:true});draftChanged();
      } catch (e) { feilTekst = skrivefeil(e); break; }
    }
    // «Laster opp …» tegnes bort HER: hentBilder() under returnerer tidlig når utkastet er endret, og tegnet før aldri på nytt.
    S.opplaster = ''; tegnKnapper(); tegnPortrettOgGalleri(); if (feilTekst) S.bilderFeil = (S.bilderFeil ? S.bilderFeil + ' ' : '') + feilTekst;
    // hentBilder() nullstiller feilmeldingen når hentingen lykkes. Ble ingenting lagt til (alt avvist), er utkastet urørt og
    // den henter — meldingen om avviste bilder skal likevel stå. En hentefeil (egen melding) vinner.
    var beholde = S.bilderFeil; await hentBilder(); if (beholde && !S.bilderFeil) S.bilderFeil = beholde;
    tegnBilderFeil(); planleggPreview(0);
  }
  // Kalles fra dashbordets bilderEndret() etter beskjæring.
  async function bilderEndret() { await hentBilder(); planleggPreview(0); }

  // Modulen lastes etter hovedskriptet: ble Din side åpnet under oppstart og billing allerede er kjent, last nå.
  setTimeout(function () { if (typeof _ventDinSide !== 'undefined' && _ventDinSide && typeof _billingKjent !== 'undefined' && _billingKjent) { _ventDinSide = false; if (typeof lastDinSide === 'function') lastDinSide(); } }, 0);

  window.DinSideV2 = {
    billing: billing, billingFeilet: billingFeilet, last: last, lukkOppsett: lukkOppsett, startOppsett: startOppsett, fokusEndret: function () { if (S.byggd && S.utkast) tegnSteg(); }, tegnFullfor: tegnFullfor, forlat: forlat, fangBytte: fangBytte, bilderEndret: bilderEndret,
    // Test-/innsyn
    stageCrop:stageCrop, bildeVersjon: bildeVersjon, _S: S,
    ulagret: ulagret,
    publisertAt: function () { return S.publisertAt; },
  };
})();
