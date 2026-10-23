// tools/render/fixtures/testbilder.mjs — testfoto for render-testene (flyttet ut av site/no/images 23.10.2026: de het
// layout-*.webp etter v1-layoutene, ble aldri brukt av en publisert side, og skal ikke publiseres).
//   import { TESTBILDER, rutTestbilder } from './fixtures/testbilder.mjs';
//   TESTBILDER[0]                 → absolutt filsti (for fs.readFileSync / setInputFiles)
//   await rutTestbilder(page)     → /testbilder/bilde-N.webp svarer med fila (for <img src> og mock-url-er)
import fs from 'node:fs'; import path from 'node:path';
const MAPPE = path.resolve(import.meta.dirname, 'bilder');
export const TESTBILDER = [1, 2, 3, 4].map(n => path.join(MAPPE, `bilde-${n}.webp`));
export async function rutTestbilder(page) {
  await page.route(u => new URL(u).pathname.startsWith('/testbilder/'), r => {
    const f = path.join(MAPPE, path.basename(new URL(r.request().url()).pathname));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'image/webp', body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
  });
}
