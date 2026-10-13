// tools/render/logg-inn-redirect.mjs — redirect-vakten for kodefeltet i no/logg-inn.html (tryggMaal).
// Lokal fil serveres SOM https://trybarberhq.com/no/logg-inn.html (prod-origin), og /api/login-kode
// mockes med hver redirect-verdi. Alt annet avbrytes/fanges — ingen trafikk forlater maskinen.
// Forventet: bare trybarberhq.com / www.trybarberhq.com (https) og relative stier slipper gjennom;
// alt annet (evil-, .evil.no, //, javascript:, data:, http:, underdomener, user@host, tom/null) → dashbordet.
//
//   node tools/render/logg-inn-redirect.mjs
import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const FIL = path.resolve(import.meta.dirname, '../../site/no/logg-inn.html');
const DASH = 'https://trybarberhq.com/no/dashboard.html';
const CASES = [
  ['https://evil-trybarberhq.com/x', DASH],
  ['https://trybarberhq.com.evil.no/x', DASH],
  ['//evil.no/x', DASH],
  ['javascript:alert(1)', DASH],
  ['JaVaScRiPt:alert(1)', DASH],
  ['data:text/html,<p>x</p>', DASH],
  ['http://trybarberhq.com/no/dashboard.html', DASH],        // ikke https på annen origin → dashbordet
  ['https://sub.trybarberhq.com/x', DASH],                     // underdomener er ikke på lista
  ['https://trybarberhq.com@evil.no/x', DASH],                 // brukerinfo-triks: hostname = evil.no
  ['', DASH], [null, DASH],
  ['https://trybarberhq.com/no/dashboard.html', DASH],
  ['https://www.trybarberhq.com/no/dashboard.html', 'https://www.trybarberhq.com/no/dashboard.html'],
  ['https://trybarberhq.com/no/opprett-passord.html?bytt=1', 'https://trybarberhq.com/no/opprett-passord.html?bytt=1'],
  ['/no/opprett-passord.html', 'https://trybarberhq.com/no/opprett-passord.html'],
  ['opprett-passord.html?bytt=1', 'https://trybarberhq.com/no/opprett-passord.html?bytt=1'],
];
await (async () => {
  const b = await chromium.launch(); let feil = 0;
  for (const [redirect, forventet] of CASES) {
    const p = await b.newPage(); let navigert = null, dialog = false, ut = [];
    p.on('dialog', d => { dialog = true; d.dismiss(); });
    await p.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith('https://trybarberhq.com/no/logg-inn.html')) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(FIL) });
      if (u === 'https://api.trybarberhq.com/api/send-magic-link') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      if (u === 'https://api.trybarberhq.com/api/login-kode') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, redirect }) });
      if (r.request().resourceType() === 'document') { navigert = u; return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>fanget</p>' }); }
      ut.push(u); return r.abort();
    });
    await p.goto('https://trybarberhq.com/no/logg-inn.html', { waitUntil: 'domcontentloaded' });
    await p.fill('#email', 'test@example.com'); await p.click('#magic-submit'); await p.waitForTimeout(200);
    await p.fill('#loginKode', '123456'); await p.waitForTimeout(700);
    const ok = navigert === forventet && !dialog;
    if (!ok) feil++;
    console.log((ok ? 'OK   ' : 'FEIL ') + JSON.stringify(redirect).padEnd(58) + ' → ' + navigert + (dialog ? '  (DIALOG!)' : ''));
    await p.close();
  }
  await b.close(); console.log(feil ? feil + ' FEIL' : 'Alt grønt'); process.exit(feil ? 1 : 0);
})();
