// Kontroll av rutten (ROUTE i js/projects.js): avstånd mellan stopp, vägens ankarpunkter, kartans gränser.
// Kör:  node tests/route-layout.test.mjs   (ingen webbläsare, bara Node)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../js/projects.js', import.meta.url), 'utf8')
  .replace(/^import .*$/m, "const WORLDS = { hub: 'hub', techart: 'techart', prog: 'prog', art: 'art' };");
const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
const { ROUTE, routePath, routeDownAt, routeStops, stopFor, stopsIn } = mod;

// Världens gränser (core.js): hemvärldens mitt i (right, down) och körradie.
const CENTER = { right: 22, down: 14.9 };
const RADIUS = 84;
const inside = (right, down, margin = 0) => Math.hypot(right - CENTER.right, down - CENTER.down) <= RADIUS - margin;

const stops = routeStops();
assert.equal(stops.length, 6);
const path = routePath(0.5);
const issues = [];
stops.forEach((stop, i) => {
  if (Math.abs(stop.down + 12.5 - stop.road) > 0.01) issues.push(`${stop.title}: road != down + 12.5`);
  if (Math.abs(routeDownAt(stop.right) - stop.road) > 0.01) issues.push(`${stop.title}: vägens ankare != road`);
  if (i % 2 === 0 ? stop.road >= 14 : stop.road < 14) issues.push(`${stop.title}: fel rad (udda = norr, jämna = söder)`);
  if (!inside(stop.right, stop.road, 4)) issues.push(`${stop.title}: för nära kartans kant`);
  if (!inside(stop.right + (i === stops.length - 1 ? 9 : 13.5), stop.road, 2)) issues.push(`${stop.title}: vinjettluckan utanför kartan`);
  assert.equal(stopFor(stop.title), stop);
  if (i) {
    const gap = stop.s - stops[i - 1].s;
    const dRight = stop.right - stops[i - 1].right;
    console.log(`${i} -> ${i + 1}: dRight ${dRight}, along road ${gap.toFixed(1)}`);
    if (gap < 25 || gap > 30) issues.push(`${stop.title}: sträcka ${gap.toFixed(1)} utanför 25-30`);
    if (dRight - 7 < 8 + 2 + 8) issues.push(`${stop.title}: för trångt mellan skyltarna`);
    if (stop.s <= stops[i - 1].s) issues.push('s inte stigande');
  }
});
for (const [right, down] of ROUTE.road) if (!inside(right, down, 3)) issues.push(`ankare (${right}, ${down}) utanför kartan`);
for (const p of path) if (!inside(p.right, p.down, 3)) issues.push(`vägpunkt (${p.right}, ${p.down}) utanför kartan`);
for (const [name, d] of Object.entries(ROUTE.districts)) {
  if (!inside(d.right, d.down, 3)) issues.push(`distrikt ${name} utanför`);
  if (d.portal && !inside(d.portal.right, d.portal.down, 3)) issues.push(`grotta ${name} utanför`);
}
assert.ok(inside(-44.5 - 2.6, 0, 1), 'garaget måste ligga innanför körradien');
assert.deepEqual(stopsIn('techart').map((s) => s.title), ['Water Shader', 'Foliage Generator', 'Mutation Protocol']);
for (const [right, down] of ROUTE.loop.via) {
  if (down < 20 && Math.abs(routeDownAt(right) - down) > 0.25) issues.push(`loop (${right}, ${down}) ligger inte på vägen (${routeDownAt(right).toFixed(2)})`);
}
if (issues.length) { console.error('FEL:\n' + issues.join('\n')); process.exit(1); }
console.log('Rutten OK');
