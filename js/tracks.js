// ============================================================================
// tracks.js — däckspår i marken: nedtryckt gräs och uppriven jord, dammiga streck i gruset,
// gummimärken på asfalten. Bakhjulen drar ett band efter sig som tonar bort med tiden.
// ============================================================================
// Allt är EN enda mesh med en fast ringbuffert av fyrkanter (MAX_QUADS). Nya fyrkanter skrivs över de
// äldsta, så antalet ritanrop och minnet är konstant. CPU:n skriver bara vid födseln (läge, färg,
// födelsetid, livslängd); att tona bort gör shadern. Underlaget kommer från samma funktion som
// däckspuffarna (getSurface i magic.js): 0 gräs, 1 väg (grus), 2 parkeringsficka (asfalt).
// Marken är platt (y = 0, se grounding.js), så spåren ligger på en fast höjd strax över den.
import * as THREE from 'three';
import { scene, WORLDS, currentWorld } from './core.js';
import { shared, getSurface } from './magic.js';
import { HOME_X, HOME_Z, GARAGE_Z } from './home.js';
import { getSeasonConfig } from './season.js';

// --- Inställningar (ändra här) ---
const MAX_QUADS = 1600;       // Ringbuffertens storlek: så många bitar spår finns som mest (äldst skrivs över).
const STEP = 0.45;            // Så långt hjulet rullar mellan två bitar (mindre = jämnare spår, fler bitar).
const MIN_SPEED = 1.2;        // Under den här farten (enheter/s) lämnas inga spår.
const LIFE_NORMAL = 9;        // Sekunder tills ett vanligt spår är borta.
const LIFE_HEAVY = 16;        // ...och ett skid/drift-spår.
const BRAKE_DECEL = 14;       // Fartminskning (enheter/s²) som räknas som hård bromsning. Att släppa gasen ger ca 6.
const SLIP_ANGLE = 0.4;       // Radianer mellan nosen och rörelseriktningen som räknas som skid.
const HALF_WIDTH = 0.13;      // Halva spårbredden, vanlig körning.
const HALF_WIDTH_HEAVY = 0.18; // ...och vid skid (gräs: gånger 1.3, jorden rivs upp bredare).
const HEIGHT = 0.06;          // Höjd över marken (ovanför vägarnas lager, som ligger på 0.012+).
const WHEEL_BACK = 0.9;       // Bakhjulens läge: samma som däckspuffarna i magic.js.
const WHEEL_SIDE = 0.55;
const GARAGE_HALF_WIDTH = 2.8;
const GARAGE_HALF_DEPTH = 1.9;

// Färg och styrka per underlag: [vanligt: färg, alfa] och [skid: färg, alfa].
const color = (hex) => new THREE.Color(hex);
const SURFACES = {
  grass:  { normal: [color('#34431a'), 0.42], heavy: [color('#4a3120'), 0.7], wide: 1.3 }, // Nedtryckt gräs / uppriven jord.
  road:   { normal: [color('#d9c9b4'), 0.08], heavy: [color('#2a2420'), 0.24], wide: 1 },  // Dammstreck / gummi på grus.
  bay:    { normal: [color('#403a36'), 0.06], heavy: [color('#151413'), 0.3], wide: 1 },   // Asfalt i fickorna.
  techart: { normal: [color('#1a2638'), 0.12], heavy: [color('#0a1018'), 0.26], wide: 1 },
  prog:   { normal: [color('#0a1d12'), 0.14], heavy: [color('#040a07'), 0.28], wide: 1 },
  art:    { normal: [color('#c4b192'), 0.12], heavy: [color('#4a3b30'), 0.24], wide: 1 },
};

// Säsong (season.js, nyckeln tracks): { life: gånger-tal på livslängden, grass/road: { normal: [färg, alfa], heavy: [färg, alfa] } }.
const trackTheme = getSeasonConfig().tracks;
if (trackTheme) {
  for (const name of ['grass', 'road']) {
    const set = trackTheme[name];
    if (set) SURFACES[name] = { ...SURFACES[name], normal: [color(set.normal[0]), set.normal[1]], heavy: [color(set.heavy[0]), set.heavy[1]] };
  }
}
const LIFE_MUL = trackTheme && trackTheme.life ? trackTheme.life : 1;

function surfaceNow(x, z) {
  if (currentWorld === WORLDS.techart) return SURFACES.techart;
  if (currentWorld === WORLDS.prog) return SURFACES.prog;
  if (currentWorld === WORLDS.art) return SURFACES.art;
  if (currentWorld === WORLDS.hub) {
    // Inne i garaget (betonggolvet) lämnas inga spår.
    if (Math.abs(x - HOME_X) < GARAGE_HALF_WIDTH && Math.abs(z - (HOME_Z + GARAGE_Z)) < GARAGE_HALF_DEPTH) return null;
  }
  const kind = getSurface(x, z);
  return kind === 0 ? SURFACES.grass : (kind === 2 ? SURFACES.bay : SURFACES.road);
}

// --- Geometrin: 4 hörn per bit, index skrivs en gång ---
const positions = new Float32Array(MAX_QUADS * 4 * 3);
const colors = new Float32Array(MAX_QUADS * 4 * 3);
const infos = new Float32Array(MAX_QUADS * 4 * 3).fill(0); // födelsetid, alfa, livslängd.
const uvs = new Float32Array(MAX_QUADS * 4 * 2);           // tvärs (-1..1), längs (meter).
for (let i = 0; i < MAX_QUADS * 4; i++) infos[i * 3] = -1000; // Aldrig född.
const indices = new Uint16Array(MAX_QUADS * 6);
for (let q = 0; q < MAX_QUADS; q++) {
  const v = q * 4;
  indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
}
const geometry = new THREE.BufferGeometry();
const attributes = [
  ['position', positions, 3], ['aColor', colors, 3], ['aInfo', infos, 3], ['aUv', uvs, 2],
].map(([name, array, size]) => {
  const attribute = new THREE.BufferAttribute(array, size);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
});
geometry.setIndex(new THREE.BufferAttribute(indices, 1));

const material = new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime },
  vertexShader: `
    attribute vec3 aColor;
    attribute vec3 aInfo;
    attribute vec2 aUv;
    uniform float uTime;
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vAlpha;
    void main() {
      float age = (uTime - aInfo.x) / aInfo.z; // 0 = nytt, 1 = borta.
      float alive = step(0.0, age) * step(age, 1.0);
      vAlpha = aInfo.y * alive * (1.0 - age) * (1.0 - age * age * 0.5); // Mjuk nedtoning, lite kvar länge.
      vColor = aColor;
      vUv = aUv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vColor;
    varying vec2 vUv;
    varying float vAlpha;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      if (vAlpha < 0.003) discard;
      float edge = 1.0 - smoothstep(0.45, 1.0, abs(vUv.x));  // Mjuk kant åt sidorna.
      // Ojämnt mönster: bitar saknas (ojämnt tryck) och lite mönster från däcket.
      float n = valueNoise(vec2(vUv.x * 2.5, vUv.y * 1.8));
      float tread = 0.85 + 0.15 * step(0.5, fract(vUv.y * 3.0 + vUv.x * 0.8));
      float a = vAlpha * edge * (0.45 + 0.75 * n) * tread;
      gl_FragColor = vec4(vColor, a);
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.frustumCulled = false;
mesh.renderOrder = -2; // Efter vägarna (-8) och kontaktskuggorna (-3), före bilen och allt annat genomskinligt.
scene.add(mesh);

// --- Ett spår per bakhjul ---
const wheels = [-1, 1].map(() => ({ x: 0, z: 0, along: 0, valid: false, fresh: false, lx: 0, lz: 0, rx: 0, rz: 0 }));
let next = 0;
let lastSpot = null;
let lastSpeed = 0;
let dirty = false;

const quadCorners = new Array(8).fill(0); // Återanvänds (inga nya listor per bit).
const QUAD_ACROSS = [-1, 1, -1, 1];
function writeQuad(wheel, bLx, bLz, bRx, bRz, along, surface, heavy, alpha) {
  const set = heavy ? surface.heavy : surface.normal;
  const life = (heavy ? LIFE_HEAVY : LIFE_NORMAL) * LIFE_MUL;
  const now = shared.uTime.value;
  const v = next * 4;
  next = (next + 1) % MAX_QUADS;
  const corners = quadCorners;
  corners[0] = wheel.lx; corners[1] = wheel.lz; corners[2] = wheel.rx; corners[3] = wheel.rz;
  corners[4] = bLx; corners[5] = bLz; corners[6] = bRx; corners[7] = bRz;
  const across = QUAD_ACROSS;
  for (let c = 0; c < 4; c++) {
    const i = v + c;
    positions[i * 3] = corners[c * 2];
    positions[i * 3 + 1] = HEIGHT;
    positions[i * 3 + 2] = corners[c * 2 + 1];
    colors[i * 3] = set[0].r;
    colors[i * 3 + 1] = set[0].g;
    colors[i * 3 + 2] = set[0].b;
    infos[i * 3] = now;
    infos[i * 3 + 1] = alpha;
    infos[i * 3 + 2] = life;
    uvs[i * 2] = across[c];
    uvs[i * 2 + 1] = c < 2 ? wheel.along : along;
  }
  dirty = true;
}

// Körs varje bild (efter updateCar). signedSpeed = bilens fart (negativ = backar),
// skid = true vid drift/slirning/nitro.
export function updateTracks(delta, carPosition, carAngle, signedSpeed, skid) {
  if (delta <= 0) return;
  const lastWasSet = lastSpot !== null;
  const dx = lastWasSet ? carPosition.x - lastSpot.x : 0;
  const dz = lastWasSet ? carPosition.z - lastSpot.z : 0;
  if (!lastSpot) lastSpot = { x: 0, z: 0 };
  lastSpot.x = carPosition.x;
  lastSpot.z = carPosition.z;
  const speedNow = Math.hypot(dx, dz) / delta;
  const decel = (Math.abs(lastSpeed) - Math.abs(signedSpeed)) / delta;
  lastSpeed = signedSpeed;
  // Stilla, ett hopp (en resa) eller första bilden: avbryt spåren, så att inget band dras över kartan.
  if (!lastWasSet || speedNow < MIN_SPEED || speedNow > 40) {
    for (const wheel of wheels) wheel.valid = false;
    return;
  }

  const sinA = Math.sin(carAngle);
  const cosA = Math.cos(carAngle);
  // Skid: drift/slirning/nitro, hård bromsning eller att nosen pekar åt ett annat håll än färden (sladd).
  const moveAngle = Math.atan2(dx, dz);
  const slip = Math.abs(Math.atan2(Math.sin(moveAngle - carAngle - (signedSpeed < 0 ? Math.PI : 0)), Math.cos(moveAngle - carAngle - (signedSpeed < 0 ? Math.PI : 0))));
  const heavy = skid || (decel > BRAKE_DECEL && speedNow > 3) || slip > SLIP_ANGLE;
  const share = THREE.MathUtils.clamp(speedNow / 12, 0, 1.3);

  wheels.forEach((wheel, index) => {
    const side = index === 0 ? -1 : 1;
    const x = carPosition.x - sinA * WHEEL_BACK + cosA * WHEEL_SIDE * side;
    const z = carPosition.z - cosA * WHEEL_BACK - sinA * WHEEL_SIDE * side;
    const surface = surfaceNow(x, z);
    if (!surface) { wheel.valid = false; return; }
    if (!wheel.valid) {
      // Första punkten i ett nytt spår: bara minns var hjulet är.
      wheel.x = x; wheel.z = z; wheel.along = 0; wheel.valid = true;
      wheel.lx = x; wheel.lz = z; wheel.rx = x; wheel.rz = z; wheel.fresh = true;
      return;
    }
    const sx = x - wheel.x;
    const sz = z - wheel.z;
    const length = Math.hypot(sx, sz);
    if (length < STEP) return;
    if (length > 3) { wheel.valid = false; return; } // Hjulet hoppade (t.ex. över en kant).
    const halfWidth = (heavy ? HALF_WIDTH_HEAVY : HALF_WIDTH) * (heavy ? surface.wide : 1) * (0.9 + 0.1 * Math.min(share, 1));
    const px = (-sz / length) * halfWidth; // Vinkelrätt mot färdriktningen.
    const pz = (sx / length) * halfWidth;
    if (wheel.fresh) { // Första biten: startkanten får samma riktning som biten.
      wheel.lx = wheel.x + px; wheel.lz = wheel.z + pz;
      wheel.rx = wheel.x - px; wheel.rz = wheel.z - pz;
      wheel.fresh = false;
    }
    const set = heavy ? surface.heavy : surface.normal;
    // Vanlig körning: svagare vid låg fart. Skid: full styrka.
    const alpha = set[1] * (heavy ? 1 : 0.5 + 0.5 * Math.min(share, 1));
    const along = wheel.along + length;
    const bLx = x + px, bLz = z + pz, bRx = x - px, bRz = z - pz;
    writeQuad(wheel, bLx, bLz, bRx, bRz, along, surface, heavy, alpha);
    wheel.x = x; wheel.z = z; wheel.along = along;
    wheel.lx = bLx; wheel.lz = bLz; wheel.rx = bRx; wheel.rz = bRz;
  });

  if (dirty) {
    for (const attribute of attributes) attribute.needsUpdate = true;
    dirty = false;
  }
}
