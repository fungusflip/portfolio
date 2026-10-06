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
console.log(new Set(refs).size, 'referenser,', bad, 'fel');
process.exit(bad ? 1 : 0);
