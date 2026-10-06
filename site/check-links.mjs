// Kör från repots rot:  node site/check-links.mjs
// Kollar att alla lokala länkar/bilder i site/index.html och i projects-data.js finns.
import fs from 'fs';
import path from 'path';
import { PROJECTS } from './js/projects-data.js';
const html = fs.readFileSync('site/index.html', 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)].map(m => m[1])
  .filter(r => !/^(https?:|mailto:|data:)/.test(r));
for (const p of PROJECTS) refs.push(...[p.poster, p.video, p.still, p.content].filter(Boolean));
let bad = 0;
for (const r of new Set(refs)) {
  if (r.startsWith('/')) { console.log('ABSOLUT:', r); bad++; continue; }
  const file = path.join('site', r.split('?')[0]);
  if (!fs.existsSync(file)) { console.log('SAKNAS:', r); bad++; }
}
// Kollar också att anchor-länkar har ett mål.
for (const m of html.matchAll(/href="#([\w-]+)"/g)) if (!html.includes(`id="${m[1]}"`)) { console.log('ANKARE SAKNAS:', m[1]); bad++; }
// Samma kontroll för index.html (3D-startsidan + webbplatsen): lokala filer räknas från repots rot.
const root = fs.readFileSync('index.html', 'utf8');
for (const m of root.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
  const r = m[1];
  if (/^(https?:|mailto:|data:)/.test(r)) continue;
  if (r.startsWith('/')) { console.log('ABSOLUT (index.html):', r); bad++; continue; }
  if (!fs.existsSync(r.split('?')[0])) { console.log('SAKNAS (index.html):', r); bad++; }
}
for (const m of root.matchAll(/href="#([\w-]+)"/g)) if (!root.includes(`id="${m[1]}"`)) { console.log('ANKARE SAKNAS (index.html):', m[1]); bad++; }
// Ankar-id:n får inte krocka med världsnamnen som main.js läser ur adressen (#art, #prog, #techart, #hub).
for (const w of ['art', 'prog', 'techart', 'hub']) if (root.includes(`id="${w}"`)) { console.log('ID KROCKAR MED VÄRLD:', w); bad++; }
console.log(new Set(refs).size, 'referenser,', bad, 'fel');
process.exit(bad ? 1 : 0);
