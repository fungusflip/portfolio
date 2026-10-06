// Kör: node tests/teacups.test.mjs   (rena tal, ingen webbläsare). Kollar att varje tekopp har luft till väggar, lister,
// stolpar, steg, gångväg och andra koppar, med måtten från home.js (ändrar du dem där: ändra dem här också).
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// js/-filerna är .js utan package.json: kopiera till en .mjs så att Node kör den som modul.
const here = dirname(fileURLToPath(import.meta.url));
const copy = join(mkdtempSync(join(tmpdir(), 'teacups-')), 'teacups.mjs');
copyFileSync(join(here, '..', 'js', 'teacups.js'), copy);
const T = await import(pathToFileURL(copy).href);

const CABIN_X = 5.6, CABIN_Z = 0, CABIN_SIZE = 5, DOOR_X = CABIN_X + 1.1;
const CABIN_FRONT = CABIN_Z + CABIN_SIZE / 2;
const curve = [[DOOR_X, CABIN_FRONT + 0.3], [DOOR_X, CABIN_FRONT + 2.4], [DOOR_X - 1.4, 5.7], [2.7, 5.5]];
const FOOTPATH = [];
for (let i = 0; i <= 16; i++) {
  const t = i / 16, u = 1 - t;
  const b = (k) => u * u * u * curve[0][k] + 3 * u * u * t * curve[1][k] + 3 * u * t * t * curve[2][k] + t * t * t * curve[3][k];
  FOOTPATH.push([b(0), b(1)]);
}
const c = {
  GARAGE_WIDTH: 5.6, GARAGE_DEPTH: 3.6, GARAGE_HEIGHT: 2.6, GARAGE_FRONT: 1.8,
  CABIN_X, CABIN_Z, CABIN_SIZE, CABIN_HEIGHT: 3.8, WINDOW_X: CABIN_X - 1, DOOR_X, SHED_X: CABIN_X + CABIN_SIZE / 2,
  PAD_Z: 6, PAD_HALF_W: 5.4 / 2, PAD_HALF_L: 6.5 / 2, PATH_WIDTH: 1.3, FOOTPATH,
  GROUND_CUPS: [
    [-5.1, -1.5, 1.3, 0.5, 'warm'], [-3.85, 1.7, 0.5, 0.5, 'hot'], [-3.5, 3.4, 0.45, 0, 'cold'],
    [3.5, 3.4, 0.45, 0.2, 'cold'], [9.1, 1.2, 0.55, 0.9, 'hot'], [10.5, -1.6, 0.45, 0, 'cold'], [1.4, -3.3, 0.5, 0.85, 'cold'],
  ],
};
const L = T.computeHomeCups(c);

let failures = 0;
const fail = (msg) => { failures++; console.log('FEL  ' + msg); };
const all = [];
L.up.forEach((cup, i) => all.push({ name: `upp#${i}`, ...cup }));
L.tableCups.forEach((cup, i) => all.push({ name: `bord#${i}`, ...cup, x: L.table.x + cup.dx, z: L.table.z + cup.dz }));
L.ground.forEach((cup, i) => all.push({ name: `mark#${i}`, ...cup }));

for (const cup of all) {
  if (!cup.ok) fail(`${cup.name}: ok=false (fick inte plats)`);
  if (cup.size < T.MIN_SIZE - 1e-9) fail(`${cup.name}: storlek ${cup.size} < ${T.MIN_SIZE}`);
  const others = all.filter((o) => o !== cup && Math.abs(o.y - cup.y) < 0.5).map((o) => ({ x: o.x, z: o.z, size: o.size }));
  const sc = T.saucerClearance(cup.x, cup.z, cup.size, cup.y, L.obstacles, others);
  const hc = T.handleClearance(cup.x, cup.z, cup.size, cup.yaw, cup.y, L.obstacles, others);
  console.log(`${cup.name.padEnd(8)} storlek ${cup.size.toFixed(3)} pos (${cup.x.toFixed(2)}, ${cup.y.toFixed(3)}, ${cup.z.toFixed(2)}) tefat-luft ${sc.toFixed(3)} handtag-luft ${hc.toFixed(3)}`);
  if (sc < T.GAP - 1e-6) fail(`${cup.name}: tefatets luft ${sc.toFixed(4)} < GAP`);
  if (hc < 0.005) fail(`${cup.name}: handtagets luft ${hc.toFixed(4)} < 0.005`);
}
// Hyllkopparna: mitten ska stå på hyllan, och tefatet får bara hänga ut OVERHANG.
const ledgeRects = [
  [L.up[0], L.garageSill.x0, L.garageSill.x1, L.garageSill.z0, L.garageSill.z1],
  [L.up[1], L.cabinSill.x0, L.cabinSill.x1, L.cabinSill.z0, L.cabinSill.z1],
  [L.up[2], L.cabinSill.x0, L.cabinSill.x1, L.cabinSill.z0, L.cabinSill.z1],
  [L.up[3], L.railPad.cx - L.railPad.w / 2, L.railPad.cx + L.railPad.w / 2, L.railPad.cz - L.railPad.d / 2, L.railPad.cz + L.railPad.d / 2],
  [L.up[4], L.step.x0, L.step.x1, L.step.z0, L.step.z1],
];
ledgeRects.forEach(([cup, x0, x1, z0, z1], i) => {
  const r = T.SAUCER * cup.size;
  if (cup.x < x0 || cup.x > x1 || cup.z < z0 || cup.z > z1) fail(`hylla#${i}: koppens mitt står utanför hyllan`);
  if (cup.x - r < x0 - T.OVERHANG - 1e-9 || cup.x + r > x1 + T.OVERHANG + 1e-9 || cup.z - r < z0 - T.OVERHANG - 1e-9 || cup.z + r > z1 + T.OVERHANG + 1e-9) fail(`hylla#${i}: tefatet hänger ut för mycket`);
});
// Bordet: tefatet inom skivan.
for (const cup of L.tableCups) if (Math.hypot(cup.dx, cup.dz) + T.SAUCER * cup.size > L.table.R) fail('bord: tefatet hänger över kanten');
// Hjälparens egna regler.
const near = (a, b) => Math.abs(a - b) < 1e-9;
if (!near(T.yawFor(1, 0), 0) || !near(Math.cos(T.yawFor(0, 1)), 0) || !near(-Math.sin(T.yawFor(0, 1)), 1)) fail('yawFor: handtaget pekar åt fel håll');
const tiny = T.placeOnLedge({ size: 0.5, o: { x: 0, z: 0 }, nx: 0, nz: 1, backClear: 0.1, uHi: 0.3, tLo: 0, tHi: 0.3 });
if (tiny.ok || tiny.size !== T.MIN_SIZE) fail('placeOnLedge: för liten hylla ska ge ok=false och MIN_SIZE');
const shrunk = T.placeOnLedge({ size: 0.4, o: { x: 0, z: 0 }, nx: 0, nz: 1, backClear: 0.1, uHi: 0.7, tLo: 0, tHi: 0.8 });
if (!shrunk.ok || shrunk.size > (0.7 + T.OVERHANG - 0.1 - T.GAP) / 2.7 + 1e-9) fail('placeOnLedge: koppen ska krympa så att den får plats');
const pushed = T.placeOnGround({ x: -2.5, z: 0, size: 0.5, obstacles: L.obstacles });
if (!pushed.ok || pushed.x > -2.89 - T.SAUCER * 0.5 + 1e-6) fail('placeOnGround: en kopp inne i garagevägg ska skjutas ut');
console.log(failures ? `\n${failures} FEL` : '\nAlla koppar har luft.');
process.exit(failures ? 1 : 0);
