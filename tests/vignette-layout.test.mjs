// Kontroll av vinjetternas placering (VIGNETTE_LAYOUT, DATA-blocket i js/vignettes.js) mot rutten (ROUTE i js/projects.js).
// Kör:  node tests/vignette-layout.test.mjs   (ingen webbläsare, bara Node)
//
// Varje vinjett ska
//   1. ha alla sina extent- och free-cirklar inne i stoppets fria fält (right [r + 3.5, r + 13.5],
//      down [-20, 5.5] på norra raden / [-20, 8] på södra raden),
//   2. ligga 1-3 enheter från sin EGEN skylt (närmaste extent-cirkelkant till skyltens eller fickans kant),
//   3. inte röra någon annan skylt eller ficka, några lyktor, vägen eller infarterna, andra vinjetter, och
//      inte heller de fasta föremålen i hubprops.js (bäddar, ängar, buskar, stenar, kiosk, bäck ...),
//   4. ligga på ritad mark (inom körradien + toningens första bit).
// Skyltarna är right +- 3.5 (SIGN_HALF), fickorna right +- 2.7 och 6.5 långa, 6 framför skylten (billboards.js).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const asModule = (src) => import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

// --- Rutten ---
const routeSrc = read('js/projects.js').replace(/^import .*$/m, "const WORLDS = { hub: 'hub', techart: 'techart', prog: 'prog', art: 'art' };");
const { ROUTE, routePath, routeDownAt, stopFor } = await asModule(routeSrc);

// --- DATA-blocket i vignettes.js (utan importer; framed / MODULE_ROT ligger i blocket) ---
const vignSrc = read('js/vignettes.js');
const START = vignSrc.indexOf('// ---- DATA START');
const END = vignSrc.indexOf('// ---- DATA END ----');
assert.ok(START > 0 && END > START, 'DATA START / DATA END saknas i js/vignettes.js');
const { VIGNETTE_LAYOUT, vignetteReserved } = await asModule(vignSrc.slice(START, END));

// --- Konstanter ur källfilerna (så att testet följer dem) ---
const num = (src, re, what) => {
  const m = src.match(re);
  assert.ok(m, `hittar inte ${what}`);
  return Number(m[1]);
};
const ROAD_WIDTH = num(read('js/roads.js'), /export const ROAD_WIDTH = ([\d.]+)/, 'ROAD_WIDTH');
const PAD_DISTANCE = num(read('js/billboards.js'), /export const PAD_DISTANCE = ([\d.]+)/, 'PAD_DISTANCE');
const BAY_WIDTH = num(read('js/billboards.js'), /export const BAY_WIDTH = ([\d.]+)/, 'BAY_WIDTH');
const BAY_LENGTH = num(read('js/billboards.js'), /export const BAY_LENGTH = ([\d.]+)/, 'BAY_LENGTH');
const LAMP_SIDE = ROAD_WIDTH / 2 + 1.2; // lamps.js: ROAD_WIDTH / 2 + 1.2
assert.match(read('js/lamps.js'), /export const LAMP_SIDE = ROAD_WIDTH \/ 2 \+ 1\.2/, 'LAMP_SIDE ändrad i lamps.js: uppdatera testet');
const SIGN_HALF = 3.5; // skyltens halva bredd
const SIGN_DEPTH = 0.6; // skyltens halva tjocklek i down (rent antagande, bara för kantavstånd)
const CENTER = { right: 22, down: 14.9 }; // hemvärldens mitt (som i tests/route-layout.test.mjs)
const DRIVE_RADIUS = 84;
const FADE_LIMIT = DRIVE_RADIUS + 6; // buildHubGrass: "Ute i kanttoningen"

// --- Små geometrihjälpare ---
const rectDist = (px, pz, r) => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.z0 - pz, 0, pz - r.z1));
const segDist = (px, pz, [ax, az], [bx, bz]) => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};
const polyDist = (px, pz, pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(px, pz, pts[i - 1], pts[i]));
  return best;
};

// --- Skyltar, fickor, vägar, lyktor ---
const stops = ROUTE.stops;
const signRect = (s) => ({ x0: s.right - SIGN_HALF, x1: s.right + SIGN_HALF, z0: s.down - SIGN_DEPTH, z1: s.down + SIGN_DEPTH });
const bayRect = (s) => ({
  x0: s.right - BAY_WIDTH / 2, x1: s.right + BAY_WIDTH / 2,
  z0: s.down + PAD_DISTANCE - BAY_LENGTH / 2, z1: s.down + PAD_DISTANCE + BAY_LENGTH / 2,
});
const mainRoad = routePath(0.5).map((p) => [p.right, p.down]);
const driveways = stops.map((s) => [[s.right, s.road], [s.right, s.down + PAD_DISTANCE]]);

// Lyktorna längs huvudvägen, som i hub.js (kontrolleras nedan mot källan).
const hubSrc = read('js/hub.js');
assert.ok(hubSrc.includes('...stopRights.map((right) => right - 6)'), 'hub.js: lyktorna vid skyltarna ändrade, uppdatera testet');
assert.ok(hubSrc.includes('stopRights[stopRights.length - 1] + 7.5'), 'hub.js: sista lyktan ändrad, uppdatera testet');
assert.ok(hubSrc.includes('(right + stopRights[i]) / 2'), 'hub.js: mittlyktorna ändrade, uppdatera testet');
const stopRights = stops.map((s) => s.right);
const lampRights = [
  ...stopRights.map((right) => right - 6),
  ...stopRights.slice(1).map((right, i) => (right + stopRights[i]) / 2),
  stopRights[stopRights.length - 1] + 7.5,
];
const lamps = lampRights.map((right) => {
  const slope = routeDownAt(right + 0.5) - routeDownAt(right - 0.5);
  return { right, down: routeDownAt(right) - LAMP_SIDE * Math.sqrt(1 + slope * slope) };
});

// --- Fasta föremål i hubprops.js / hub.js (läses ur källan, så att testet följer dem) ---
const propSrc = read('js/hubprops.js');
const consts = {};
for (const name of ['PLAZA', 'ART_ROAD', 'GAZEBO', 'KIOSK', 'SCULPTURE', 'RAIN_GARDEN']) {
  const m = propSrc.match(new RegExp(`const ${name} = (\\{[^}]*\\})`));
  assert.ok(m, `hittar inte ${name} i hubprops.js`);
  consts[name] = new Function(`return (${m[1]});`)();
}
const listOf = (re, what) => {
  const m = propSrc.match(re);
  assert.ok(m, `hittar inte ${what} i hubprops.js`);
  return new Function(`return (${m[1]});`)();
};
const fixed = []; // { what, right, down, radius }
for (const [right, down] of listOf(/buildShrubs\(local, (\[\[[^;]*?\]\])\);/, 'buskarna')) fixed.push({ what: 'buske', right, down, radius: 1.8 });
for (const [right, down, , size] of listOf(/buildRocks\(local, (\[\[[^;]*?\]\])\);/, 'stenarna')) fixed.push({ what: 'sten', right, down, radius: size * 2.2 });
for (const m of propSrc.matchAll(/^\s*bed\(([-\d.]+), ([-\d.]+), ([-\d.]+), ([-\d.]+)/gm)) {
  fixed.push({ what: 'gräsbädd', right: +m[1], down: +m[2], radius: Math.max(+m[3], +m[4]) + 0.5 });
}
for (const [right, down, a, b] of listOf(/\[cx, cz, a, b, count\] of (\[\[[^;]*?\]\])\) \{/, 'ängarna')) fixed.push({ what: 'äng', right, down, radius: Math.max(a, b) + 0.5 });
fixed.push({ what: 'kiosk', right: consts.KIOSK.right, down: consts.KIOSK.down, radius: 4 });
fixed.push({ what: 'skulptur', right: consts.SCULPTURE.right, down: consts.SCULPTURE.down, radius: 5 });
fixed.push({ what: 'torg', right: consts.PLAZA.right, down: consts.PLAZA.down, radius: consts.PLAZA.radius + 3 });
fixed.push({ what: 'paviljong', right: consts.GAZEBO.right, down: consts.GAZEBO.down, radius: 5 });
fixed.push({ what: 'regnträdgård', right: consts.RAIN_GARDEN.right, down: consts.RAIN_GARDEN.down, radius: Math.max(consts.RAIN_GARDEN.a, consts.RAIN_GARDEN.b) + 1 });
for (const [name, d] of Object.entries(ROUTE.districts)) fixed.push({ what: 'landmärke ' + name, right: d.right, down: d.down, radius: Math.hypot((d.w || 4) / 2, (d.d || 4) / 2) + 2 });
// Vägskyltarna (belowRoad i hub.js): { text, at: belowRoad(<uttryck>, <gap>) }.
for (const m of hubSrc.matchAll(/text: '([^']+)', arrow: '[a-z]+', at: belowRoad\(([^,]+), ([\d.]+)\)/g)) {
  const right = new Function('PLAZA', 'ART_ROAD', 'GAZEBO', 'TECH_ROAD_RIGHT', `return ${m[2]};`)(consts.PLAZA, consts.ART_ROAD, consts.GAZEBO, num(hubSrc, /const TECH_ROAD_RIGHT = ([\d.]+)/, 'TECH_ROAD_RIGHT'));
  fixed.push({ what: 'vägskylt ' + m[1], right, down: routeDownAt(right) + Number(m[3]), radius: 2.5 });
}
assert.ok(fixed.filter((f) => f.what.startsWith('vägskylt')).length >= 4, 'färre än fyra vägskyltar hittade i hub.js');
// Bäcken (STREAM_POINTS), ca 3.4 halv bredd med dammens bula.
const streamPts = listOf(/const STREAM_POINTS = (\[[\s\S]*?\]);/, 'STREAM_POINTS');
const STREAM_HALF = 3.4;
const CABIN_EAST = -36.4; // stugan sträcker sig right -41.4 ... -36.4 (väster om stopp 1)

// --- Kontrollen ---
const issues = [];
const notes = [];
const circlesOf = (layout, origin, list) => layout[list].map(([dx, dz, r]) => ({ right: origin.right + dx, down: origin.down + dz, r }));
const placed = [];
for (const stop of stops) {
  const layout = VIGNETTE_LAYOUT[stop.title];
  if (!layout) { issues.push(`${stop.title}: ingen vinjett i VIGNETTE_LAYOUT`); continue; }
  assert.equal(stopFor(stop.title), stop);
  const origin = layout.place(stop);
  const extent = circlesOf(layout, origin, 'extent');
  const free = circlesOf(layout, origin, 'free');
  const all = [...extent, ...free];
  placed.push({ stop, origin, extent, free });
  const tag = (c) => `(${c.right.toFixed(1)}, ${c.down.toFixed(1)}, r ${c.r})`;

  // 1. Det fria fältet.
  const rect = { r0: stop.right + 3.5, r1: stop.right + 13.5, d0: -20, d1: stop.down < 0 ? 5.5 : 8 };
  for (const c of all) {
    if (c.right - c.r < rect.r0 - 1e-6 || c.right + c.r > rect.r1 + 1e-6 || c.down - c.r < rect.d0 || c.down + c.r > rect.d1 + 1e-6) {
      issues.push(`${stop.title}: cirkel ${tag(c)} ligger utanför fältet right ${rect.r0}..${rect.r1}, down ${rect.d0}..${rect.d1}`);
    }
  }
  // 2. Avståndet till den egna skylten (och fickan): närmaste kant 1-3.
  const own = [signRect(stop), bayRect(stop)];
  const nearest = Math.min(...extent.map((c) => Math.min(...own.map((r) => rectDist(c.right, c.down, r))) - c.r));
  if (nearest < 1 - 1e-6 || nearest > 3 + 1e-6) issues.push(`${stop.title}: ${nearest.toFixed(2)} från sin skylt (ska vara 1-3)`);
  notes.push(`${stop.title.padEnd(32)} place (${origin.right}, ${origin.down})  avstånd till skylten ${nearest.toFixed(2)}`);

  // 3. Andra skyltar och fickor, lyktor, vägen, infarter, fasta föremål.
  for (const other of stops) {
    if (other === stop) continue;
    for (const r of [signRect(other), bayRect(other)]) {
      for (const c of all) if (rectDist(c.right, c.down, r) - c.r < 1.5) issues.push(`${stop.title}: ${tag(c)} för nära ${other.title}s skylt eller ficka`);
    }
  }
  for (const c of all) {
    for (const lamp of lamps) if (Math.hypot(c.right - lamp.right, c.down - lamp.down) - c.r < 1.0) issues.push(`${stop.title}: ${tag(c)} för nära lykta (${lamp.right.toFixed(1)}, ${lamp.down.toFixed(1)})`);
    if (polyDist(c.right, c.down, mainRoad) - c.r < ROAD_WIDTH / 2 + 0.5) issues.push(`${stop.title}: ${tag(c)} för nära huvudvägen`);
    for (const d of driveways) if (segDist(c.right, c.down, d[0], d[1]) - c.r < ROAD_WIDTH / 2 + 0.5) issues.push(`${stop.title}: ${tag(c)} för nära en infart`);
    for (const f of fixed) if (Math.hypot(c.right - f.right, c.down - f.down) - c.r < f.radius) issues.push(`${stop.title}: ${tag(c)} överlappar ${f.what} (${f.right}, ${f.down})`);
    if (polyDist(c.right, c.down, streamPts) - c.r < STREAM_HALF) issues.push(`${stop.title}: ${tag(c)} vid bäcken`);
    if (c.right - c.r < CABIN_EAST + 1) issues.push(`${stop.title}: ${tag(c)} vid stugan`);
    // 4. Ritad mark.
    const fromCentre = Math.hypot(c.right - CENTER.right, c.down - CENTER.down) + c.r;
    if (fromCentre > FADE_LIMIT) issues.push(`${stop.title}: ${tag(c)} ${fromCentre.toFixed(1)} från världens mitt (max ${FADE_LIMIT})`);
  }
  const reach = Math.max(...extent.map((c) => Math.hypot(c.right - CENTER.right, c.down - CENTER.down) + c.r));
  if (reach > DRIVE_RADIUS) notes.push(`  (obs: ${stop.title} når ${reach.toFixed(1)} från mitten, bilen stoppas vid ${DRIVE_RADIUS}: yttersta delen går inte att köra till)`);
}

// Vinjetterna sinsemellan.
for (let i = 0; i < placed.length; i++) {
  for (let j = i + 1; j < placed.length; j++) {
    for (const a of [...placed[i].extent, ...placed[i].free]) {
      for (const b of [...placed[j].extent, ...placed[j].free]) {
        if (Math.hypot(a.right - b.right, a.down - b.down) < a.r + b.r) issues.push(`${placed[i].stop.title} och ${placed[j].stop.title} överlappar`);
      }
    }
  }
}

// vignetteReserved (hub.js skickar den till buildHubProps): samma cirklar, i (right, down).
const reserved = vignetteReserved(stopFor);
const expected = placed.reduce((n, p) => n + p.extent.length + p.free.length, 0);
if (reserved.length !== expected) issues.push(`vignetteReserved ger ${reserved.length} cirklar, väntade ${expected}`);
for (const r of reserved) if (![r.right, r.down, r.radius].every(Number.isFinite)) issues.push('vignetteReserved: ogiltig cirkel ' + JSON.stringify(r));
// Kopplingen: hub.js ska skicka listan till buildHubProps, som ska lägga den i gräs-/plantkontrollen.
if (!/buildHubProps\(roads, vignetteReserved\(stopFor\)\)/.test(hubSrc)) issues.push('hub.js skickar inte vignetteReserved(stopFor) till buildHubProps');
if (!/export function buildHubProps\(roads = \[\], reserved = \[\]\)/.test(propSrc)) issues.push('hubprops.js buildHubProps tar inte emot reserved');

console.log(notes.join('\n'));
if (issues.length) {
  console.error('FEL:\n' + [...new Set(issues)].join('\n'));
  process.exit(1);
}
console.log('Vinjettlayouten OK (' + placed.length + ' vinjetter, ' + fixed.length + ' fasta föremål, ' + lamps.length + ' lyktor)');
