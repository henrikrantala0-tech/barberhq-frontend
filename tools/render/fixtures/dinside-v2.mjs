// tools/render/fixtures/dinside-v2.mjs — mock av backendens v2-ruter for «Din side» (redesign-v2).
//
//   const m = await installerDinSideMock(page, { ... });   // alt mot /api/** og api.trybarberhq.com mockes
//   m.kall                 hver request: { metode, sti, body }
//   m.prod                 antall request som IKKE ble fanget (skal være 0)
//   m.tilstand             serverens «database» (profil/utseende/kontakt/bilder) — PUT oppdaterer den
//
// Formene følger backend-branchen redesign-v2 (src/lib/dinSide.js, routes/dashboard.js): GET/PUT /din-side,
// POST /preview (text/html), GET/POST/DELETE /images, PUT /images/rekkefolge, GET /fonts/*.woff2.
// Skriv mot prod er forbudt: ALT under api.trybarberhq.com og /api/ fanges her (CLAUDE.md, Playwright-regelen).
import fs from 'node:fs';
import path from 'node:path';
import { v2, gratis } from './billing.mjs';

const HER = import.meta.dirname;
const BILDER = ['layout-showcase.webp', 'layout-profil.webp', 'layout-hero.webp', 'layout-direkte.webp', 'preview-grand-barber.webp']
  .map(f => path.resolve(HER, '../../../site/no/images', f));

export const FONTER = [
  { key: 'jakarta',  navn: 'Plus Jakarta Sans', family: "'PlusJakartaSans'", url: 'https://api.trybarberhq.com/fonts/PlusJakartaSans.woff2', vekt: 700 },
  { key: 'bebas',    navn: 'Bebas Neue',        family: "'BebasNeue'",       url: 'https://api.trybarberhq.com/fonts/BebasNeue.woff2',       vekt: 400 },
  { key: 'fraunces', navn: 'Fraunces',          family: "'Fraunces'",        url: 'https://api.trybarberhq.com/fonts/Fraunces.woff2',        vekt: 600 },
  { key: 'oswald',   navn: 'Oswald',            family: "'Oswald'",          url: 'https://api.trybarberhq.com/fonts/Oswald.woff2',          vekt: 600 },
  { key: 'josefin',  navn: 'Josefin Sans',      family: "'JosefinSans'",     url: 'https://api.trybarberhq.com/fonts/JosefinSans.woff2',     vekt: 600 },
  { key: 'jost',     navn: 'Jost',              family: "'Jost'",            url: 'https://api.trybarberhq.com/fonts/Jost.woff2',            vekt: 600 },
];
// Filene til de tre nye fontene finnes ikke i backend ennå: stand-in (annen skrift) slik at listen kan vurderes i full lengde.
const STANDIN = { 'Oswald.woff2': 'BebasNeue.woff2', 'JosefinSans.woff2': 'PlusJakartaSans.woff2', 'Jost.woff2': 'PlusJakartaSans.woff2' };

export const MAKS = { shop: 100, tagline: 60, address: 200, bio: 2000, om: 4000, bilder: { portrett: 1, hero: 1, galleri: 10 } };
const AKSENTER = [{ key: 'blaa', hex: '#0071e3' }, { key: 'gull', hex: '#b08c32' }, { key: 'roed', hex: '#b83a42' }, { key: 'egen', hex: null }];

export function startTilstand(o = {}) {
  return {
    profil: { shop: 'Grand Barber', tagline: 'Fades og skjeggtrim', address: 'Storgata 33, 0184 Oslo',
              bio: 'Sitter i sentrum og har klippet siden 2019.', om: 'Jeg har klippet i over ti år. Kom innom for en rolig time uten stress.' },
    utseende: { aksent: 'blaa', custom_accent: null, color_mode: 'mork', font: 'jakarta' },
    kontakt: { instagram: 'grandbarber', tiktok: '', snapchat: '', contact_phone: '91 23 45 67' },
    // Publiseringskravene backend sjekker ved publiser:true (sjekklisteV2 → mangler[]). Ingen sjekkliste i svarene.
    krav: { tjeneste_med_pris: true, apen_dag: true },
    bilder: [
      { id: 'b1', slot: 'portrett', sort_order: 0, fil: 0 },
      { id: 'g1', slot: 'galleri', sort_order: 0, fil: 0 }, { id: 'g2', slot: 'galleri', sort_order: 1, fil: 1 },
      { id: 'g3', slot: 'galleri', sort_order: 2, fil: 2 },
    ],
    ...o,
  };
}
export function tomTilstand() {
  return startTilstand({
    profil: { shop: 'Grand Barber', tagline: '', address: '', bio: '', om: '' },
    kontakt: { instagram: '', tiktok: '', snapchat: '', contact_phone: '' },
    krav: { tjeneste_med_pris: false, apen_dag: false },
    bilder: [],
  });
}

const dinSideShape = t => ({
  profil: { ...t.profil }, utseende: { ...t.utseende }, kontakt: { ...t.kontakt },
});

// Serverens validering, forenklet men med samme feltnavn/feilretur som validerDinSide().
function valider(body, t) {
  const p = body.profil || {}, u = body.utseende || {}, k = body.kontakt || {};
  for (const f of ['tagline', 'address', 'bio', 'om']) if (typeof p[f] === 'string' && p[f].trim().length > MAKS[f])
    return { felt: f, error: `${{ tagline: 'Spesialiteten', address: 'Adressen', bio: 'Beskrivelsen', om: 'Om-teksten' }[f]} kan være maks ${MAKS[f]} tegn.` };
  if (u.custom_accent && !/^#[0-9a-f]{6}$/i.test(u.custom_accent)) return { felt: 'custom_accent', error: 'Egen farge må være en fargekode på formen #rrggbb.' };
  if (k.contact_phone && /^0+$/.test(k.contact_phone.trim())) return { felt: 'contact_phone', error: 'Telefonnummeret er ikke gyldig. Sjekk sifrene – utenlandske nummer må starte med landskode (f.eks. +46).' };
  return null;
}

function previewHtml(t, b) {
  const p = { ...t.profil, ...(b.profil || {}) }, u = { ...t.utseende, ...(b.utseende || {}) };
  const hex = u.aksent === 'egen' ? (u.custom_accent || '#0071e3') : ({ blaa: '#0071e3', gull: '#b08c32', roed: '#b83a42' })[u.aksent] || '#0071e3';
  const mork = u.color_mode !== 'lys';
  const bg = mork ? '#0c0c0c' : '#fafafa', ink = mork ? '#f5f5f5' : '#171717', mut = mork ? '#a3a3a3' : '#626262', line = mork ? '#2a2a2a' : '#e3e3e3';
  const gal = t.bilder.filter(x => x.slot === 'galleri').length;
  const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  if (b.side === 'book') return `<!DOCTYPE html><html><body style="margin:0;font-family:system-ui;background:${bg};color:${ink};padding:22px"><h2>Velg tidspunkt</h2><p style="color:${mut}">Bookingside (mock)</p><div style="margin-top:20px;padding:14px;border-radius:10px;background:${hex};color:#fff;text-align:center">Bekreft time</div></body></html>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:system-ui;background:${bg};color:${ink};padding:22px;min-height:1400px">
  <p style="font-size:11px;color:${mut}">BOOK TIME</p><h1 style="font-size:30px;margin:18px 0 6px;overflow-wrap:anywhere">${esc(t.profil.shop)}</h1>
  <p style="margin:0 0 6px">${esc(p.tagline)}</p><p style="margin:0 0 6px;color:${mut}">${esc(p.bio)}</p><p style="color:${mut};font-size:13px">${esc(p.address)}</p>
  <div style="margin:22px 0;border-bottom:1px solid ${line}"><b style="border-bottom:2px solid ${hex};padding-bottom:8px;display:inline-block">Bestill</b></div>
  <div style="padding:16px 0;border-bottom:1px solid ${line}">Skinfade · 30 min <span style="float:right">1 000 kr</span></div>
  <div style="margin-top:20px;padding:14px;border-radius:10px;background:${hex};color:#fff;text-align:center">Velg dato og tid →</div>
  <p style="color:${mut};font-size:12px">${gal} galleribilder</p></body></html>`;
}

// Minimal multipart-parser for utkast-rutene: { felt:{navn:tekst}, filer:[{navn, filnavn, str}] }.
function parseMultipart(req) {
  const ct = req.headers()['content-type'] || '', grense = (ct.match(/boundary=(?:"([^"]+)"|([^;]+))/) || [])[1] || (ct.match(/boundary=([^;]+)/) || [])[1];
  const buf = req.postDataBuffer(); const ut = { felt: {}, filer: [] };
  if (!grense || !buf) return ut;
  const deler = buf.toString('latin1').split('--' + grense).slice(1, -1);
  for (const d of deler) {
    const i = d.indexOf('\r\n\r\n'); if (i < 0) continue;
    const hode = d.slice(0, i), innhold = d.slice(i + 4, d.length - 2);
    const navn = (hode.match(/name="([^"]*)"/) || [])[1], filnavn = (hode.match(/filename="([^"]*)"/) || [])[1];
    if (filnavn != null) ut.filer.push({ navn, filnavn, str: innhold.length });
    else ut.felt[navn] = Buffer.from(innhold, 'latin1').toString('utf8');
  }
  return ut;
}
// Samme streng som backend imageVersion(): id:v:slot:sort_order (v = ?v= i GET /images-url-en).
// b.v = updated_at-ms (standard 1). ?? og ikke ||: v=0 betyr updated_at null og skal stå som 0, som i backend.
export const bildeVersjon = bilder => bilder.filter(b => b.slot === 'portrett' || b.slot === 'galleri').map(b => `${b.id}:${b.v ?? 1}:${b.slot}:${b.sort_order}`).sort().join('|');

// opts: { tilstand, billing, fontModus:'ok'|'sen'|'feil', putFeil:{felt,error,status?}, previewTreg:ms, sidemal:'v2'|'v1',
//         billingForsinkelse:ms, billingStatus:500 (billing-kallet feiler), bilderForsinkelse:ms (GET /images),
//         tjenester:{hoved,tillegg} (GET /services; ellers tom),
//         lagreFeil:{status,error,felt?} | 'nett' (utkast-lagringen feiler / avbrytes), konflikt:true (bildene endret i annen fane → 409) }
// m.utkast: hvert multipart-kall { action:'lagre'|'preview', draft, filer }
export async function installerDinSideMock(page, opts = {}) {
  const t = opts.tilstand || startTilstand();
  const m = { tilstand: t, kall: [], prod: 0, fontForesp: 0, previewHtml: [], utkast: [] };
  const fontModus = opts.fontModus || 'ok';
  const billing = opts.billing || (opts.sidemal === 'v1' ? gratis({ page_status: 'live' }) : v2());
  const PROFIL = { slug: 'grand-barber', email: 'g@b.no', hasPassword: true, name: 'Henrik', shop: t.profil.shop, address: t.profil.address,
                   tagline: t.profil.tagline, bio: t.profil.bio, booking_horizon_days: 28 };
  let nyId = 0;
  const handler = async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, metode = req.method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    let body = null; try { body = req.postDataJSON(); } catch (_) { body = null; }
    if (!/\.(webp|woff2)$/.test(p) && !p.startsWith('/images/raw/')) m.kall.push({ metode, sti: p, body });

    // Bilder + fonter fra «api»-verten
    if (p.startsWith('/images/raw/')) { const b = t.bilder.find(x => x.id === p.split('/').pop()); return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(BILDER[(b ? b.fil : 0) % BILDER.length]) }); }
    if (p.startsWith('/fonts/')) {
      m.fontForesp++;
      if (fontModus === 'feil') return route.fulfill({ status: 404, body: 'finnes ikke' });
      if (fontModus === 'sen') await new Promise(r => setTimeout(r, opts.fontForsinkelse || 1800));
      const f = path.join(HER, 'fonts', STANDIN[path.basename(p)] || path.basename(p));
      return fs.existsSync(f) ? route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : route.fulfill({ status: 404, body: '' });
    }

    if (p === '/api/dashboard/profile')         return json(PROFIL);
    if (p === '/api/dashboard/services' && metode === 'GET' && opts.tjenester) return json(opts.tjenester);
    if (p === '/api/dashboard/billing/status') {
      if (opts.billingForsinkelse) await new Promise(r => setTimeout(r, opts.billingForsinkelse));
      if (opts.billingStatus && opts.billingStatus !== 200) return json({ error: 'feil' }, opts.billingStatus);
      return json(billing);
    }
    if (p === '/api/dashboard/din-side') {
      if (billing.sidemal !== 'v2') return json({ error: 'Denne siden bruker den gamle malen (v1). Bruk de gamle rutene.', sidemal: 'v1' }, 409);
      if (metode === 'GET') return json({ sidemal: 'v2', ...dinSideShape(t), profil: { ...t.profil }, publisert_at: billing.publisert_at,
        valg: { aksenter: AKSENTER, fonter: FONTER, maks: MAKS } });
      if (opts.putFeil) return json({ error: opts.putFeil.error, felt: opts.putFeil.felt }, opts.putFeil.status || 400);
      const f = valider(body || {}, t); if (f) return json(f, 400);
      const b = body || {};
      Object.assign(t.profil, b.profil || {}); Object.assign(t.utseende, b.utseende || {}); Object.assign(t.kontakt, b.kontakt || {});
      for (const k of ['instagram', 'tiktok', 'snapchat']) if (typeof t.kontakt[k] === 'string') t.kontakt[k] = t.kontakt[k].replace(/^https?:\/\/(www\.)?[^/]+\//, '').replace(/^@/, '').replace(/\/$/, '').trim();
      return json({ ok: true, sidemal: 'v2', ...dinSideShape(t), ...billing });
    }
    if (p === '/api/dashboard/preview' && metode === 'POST') {
      if (opts.previewTreg) await new Promise(r => setTimeout(r, opts.previewTreg));
      const f = valider(body || {}, t); if (f) return json(f, 400);
      m.previewHtml.push(body);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'no-store' }, body: previewHtml(t, body || {}) });
    }
    // POST /din-side/lagre | /din-side/preview (backend saveImageDraft). Multipart (`draft`-feltet) når bilder følger med,
    // ren JSON ellers. Lagring er alt-eller-ingenting. Kontrakt for lagre (22.10.2026): body kan ha publiser:true; svaret
    // er ALLTID 200 når lagringen gikk gjennom: { ok, lagret:true, publisering:{ bedt_om, publisert, forste_gang, page_status,
    // grunn, mangler[], melding? }, …din-side, …billing }. grunn: allerede_live | kan_ikke_publiseres | krav_mangler | null.
    const ua = p.match(/^\/api\/dashboard\/din-side\/(lagre|preview)$/);
    if (ua && metode === 'POST') {
      const erJson = /application\/json/.test(req.headers()['content-type'] || '');
      const mp = erJson ? { felt: {}, filer: [] } : parseMultipart(req);
      let draft = null; try { draft = erJson ? req.postDataJSON() : JSON.parse(mp.felt.draft); } catch (_) {}
      m.utkast.push({ action: ua[1], draft, filer: mp.filer });
      if (!draft) return json({ error: 'Ugyldig utkast' }, 400);
      const f = valider(draft, t); if (f) return json(f, 400);
      const filnavn = new Set(mp.filer.map(x => x.filnavn));
      for (const e of draft.images || []) {
        if (e.id && !t.bilder.some(b => b.id === e.id)) return json({ error: 'Bildet finnes ikke i ditt utkast.' }, 400);
        if (!e.id && !e.file) return json({ error: 'Mangler bildefil.' }, 400);
        for (const k of ['file', 'original']) if (e[k] && !filnavn.has(e[k])) return json({ error: 'Mangler bildefil.' }, 400);
      }
      if (ua[1] === 'preview') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'cache-control': 'no-store' },
        body: previewHtml({ ...t, bilder: (draft.images || []).map(e => ({ slot: e.slot })) }, draft) });
      if (opts.lagreFeil === 'nett') return route.abort('failed');
      if (opts.lagreFeil) return json({ error: opts.lagreFeil.error, ...(opts.lagreFeil.felt ? { felt: opts.lagreFeil.felt } : {}) }, opts.lagreFeil.status || 500);
      if (draft.publiser !== undefined && typeof draft.publiser !== 'boolean') return json({ error: 'publiser må være true eller false', felt: 'publiser' }, 400);
      const medBilder = Array.isArray(draft.images);   // uten images (ren JSON) røres ikke bildene, og versjonen sjekkes ikke
      if (medBilder && (opts.konflikt || draft.imageVersion !== bildeVersjon(t.bilder))) return json({ error: 'Bildene er endret i en annen fane. Last siden på nytt før du lagrer.' }, 409);
      if (medBilder) t.bilder = draft.images.map((e, i) => {
        const gml = e.id && t.bilder.find(b => b.id === e.id);
        if (gml) return { ...gml, slot: e.slot, sort_order: i, v: e.file ? (gml.v ?? 1) + 1 : (gml.v ?? 1), cropRect: e.file ? e.cropRect : gml.cropRect };
        return { id: 'n' + (++nyId), slot: e.slot, sort_order: i, fil: nyId, v: 1, cropRect: e.cropRect };
      });
      Object.assign(t.profil, draft.profil || {}); Object.assign(t.utseende, draft.utseende || {}); Object.assign(t.kontakt, draft.kontakt || {});
      for (const k of ['instagram', 'tiktok', 'snapchat']) if (typeof t.kontakt[k] === 'string') t.kontakt[k] = t.kontakt[k].replace(/^https?:\/\/(www\.)?[^/]+\//, '').replace(/^@/, '').replace(/\/$/, '').trim();
      // Publisering — samme regler som backend: allerede live / kan ikke publiseres / krav mangler / går live nå.
      const publisering = { bedt_om: draft.publiser === true, publisert: false, forste_gang: false, page_status: billing.page_status, grunn: null, mangler: [] };
      if (draft.publiser === true) {
        const krav = t.krav || {};
        if (billing.page_status === 'live') publisering.grunn = 'allerede_live';
        else if (!['forhandsvist', 'draft'].includes(billing.page_status)) { publisering.grunn = 'kan_ikke_publiseres'; publisering.melding = 'Endringene er lagret, men denne siden kan ikke publiseres.'; }
        else {
          publisering.mangler = ['tjeneste_med_pris', 'apen_dag'].filter(k => !krav[k]);
          if (publisering.mangler.length) {
            publisering.grunn = 'krav_mangler';
            const tj = publisering.mangler.includes('tjeneste_med_pris'), dag = publisering.mangler.includes('apen_dag');
            publisering.melding = `Endringene er lagret, men siden kan ikke publiseres før du har lagt inn ${tj && dag ? 'en tjeneste med pris og åpningstid på minst én dag' : tj ? 'minst én tjeneste med pris' : 'åpningstid på minst én dag'}.`;
          } else {
            publisering.forste_gang = !billing.publisert_at; billing.page_status = 'live'; billing.publisert_at = billing.publisert_at || new Date().toISOString();
            publisering.publisert = true; publisering.page_status = 'live';
          }
        }
      }
      return json({ ok: true, lagret: true, publisering, sidemal: 'v2', ...dinSideShape(t), ...billing });
    }
    if (p === '/api/dashboard/images' && metode === 'GET') {
      if (opts.bilderForsinkelse) await new Promise(r => setTimeout(r, opts.bilderForsinkelse));
      return json(t.bilder.slice().sort((a, b) => a.sort_order - b.sort_order).map(b => ({ id: b.id, title: null, slot: b.slot, sort_order: b.sort_order, url: `/images/raw/${b.id}?v=${b.v ?? 1}`, originalUrl: `/api/dashboard/images/${b.id}/original`, cropRect: b.cropRect || null })));
    }
    if (/^\/api\/dashboard\/images\/[^/]+\/original$/.test(p)) { const b = t.bilder.find(x => x.id === p.split('/')[4]); return route.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(BILDER[(b ? b.fil : 0) % BILDER.length]) }); }
    if (p === '/api/dashboard/images' && metode === 'POST') {
      const slot = 'galleri'; const id = 'n' + (++nyId);
      t.bilder.push({ id, slot: (req.postData() || '').includes('portrett') ? 'portrett' : slot, sort_order: t.bilder.length, fil: nyId });
      return json({ id }, 201);
    }
    if (p === '/api/dashboard/images/rekkefolge' && metode === 'PUT') { (body.ids || []).forEach((id, i) => { const b = t.bilder.find(x => x.id === id); if (b) b.sort_order = i; }); return json({ slot: body.slot, bilder: [] }); }
    if (p.startsWith('/api/dashboard/images/') && metode === 'DELETE') { const id = p.split('/').pop(); t.bilder = t.bilder.filter(b => b.id !== id); return json({ ok: true }); }
    return json(/images|bookings|recent|services|hours|stats|attribution|winback|referrals|sms-logg|ledige/.test(p) ? [] : {});
  };
  // Alt under /api/ (uansett vert) og alt mot api.trybarberhq.com (bilder/fonter) fanges. Resten (localhost-sider) slippes gjennom.
  await page.route(u => { const x = new URL(u); return x.pathname.startsWith('/api/') || x.hostname === 'api.trybarberhq.com'; }, handler);
  // Sikkerhetsnett: andre trybarberhq.com-verter avbrytes og telles.
  await page.route(u => { const x = new URL(u); return /trybarberhq\.com$/.test(x.hostname) && x.hostname !== 'api.trybarberhq.com'; }, r => { m.prod++; return r.abort(); });
  return m;
}
