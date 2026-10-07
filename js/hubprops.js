// ============================================================================
// hubprops.js — föremål som gör hemvärlden till en MODERN park: fontänen på det öppna torget,
// den slingrande bäcken med dammen och två breda broar, kiosken med grönt tak, paviljongen,
// skulpturerna, bänkar, planteringar, ängsblommor, regnträdgården och stenar.
// ============================================================================
// Allt byggs i en grupp som är vriden som hem-gruppen (se home.js): x = åt höger på skärmen,
// z = nedåt på skärmen, och (0, 0) = mitt i skyltraden. Samma "right, down" som hubPoint, så
// platserna nedan går att tänka sig direkt på skärmen. Varje sak lägger också sin yta i
// hubPropObstacles (världskoordinater), så att träd, gräs och kollisioner kan hålla sig borta.
// Låga saker (bänkar, krukor, pollare) har radie <= 0.5 och soft: true, så att bilen kör över dem.
// Vattnet rör sig på grafikkortet (shared.uTime från magic.js), så ingen JavaScript körs per bild.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, WORLDS, BILLBOARD_FACING, worldGroup, makeGlowMaterial } from './core.js';
import { hubPoint } from './home.js';
import { ROAD_WIDTH, addStoneInstances, distanceToRoad } from './roads.js';
import { shared } from './magic.js';
import { markMoving } from './optimize.js';
import { getSeasonConfig } from './season.js';
import { addAnimation, knockableObject } from './knockables.js';

// --- Layouten (right, down). ÄNDRA HÄR för att flytta torget, bäcken och paviljongen. ---
export const PLAZA = { right: 0, down: 38, radius: 11, width: 4.4 }; // Torgets ring: radien är till vägens mitt.
export const ART_ROAD = { right: -13 };    // Art-vägen rakt ner från huvudvägen, över bäcken.
export const GAZEBO = { right: -38, down: 40 }; // Paviljongen, med en egen väg över bron.
export const GAZEBO_ROAD_END = 33;          // Där paviljongvägen slutar (rakt ovanför paviljongen).
export const KIOSK = { right: -21.2, down: 3.6 };
const SCULPTURE = { right: 24, down: 21 };  // Ringskulpturen på ön mellan huvudvägen och Tech Art-vägen.
const RAIN_GARDEN = { right: -45.5, down: 35.2, a: 3.4, b: 2.2 };
const DECK_HALF = 3.5; // Brons halva bredd: vägen (5) plus marginal. Räckena står utanför.

// Tolv raka bitar runt torget (nästan en cirkel). Första hörnet ligger rakt ovanför mitten, där
// stickvägen från huvudvägen kommer in.
export function plazaVertex(index) {
  const angle = (index % 12) * Math.PI / 6;
  return hubPoint(PLAZA.right + Math.sin(angle) * PLAZA.radius, PLAZA.down - Math.cos(angle) * PLAZA.radius);
}
export function plazaRoads() {
  return Array.from({ length: 12 }, (_, i) => ({ from: plazaVertex(i), to: plazaVertex(i + 1), width: PLAZA.width }));
}

// --- Bäcken: kontrollpunkter (right, down), från källan i öster till dammen och ut i väster ---
const STREAM_POINTS = [
  [-7.5, 22.2], [-10.5, 23.8], [-13, 25.2], [-17, 26.6], [-21.5, 28.4], [-26, 29.6], [-31, 28.8],
  [-35, 26.8], [-38, 25.4], [-42, 25.8], [-46, 28], [-47.2, 31.8],
];
const POND_X = -26.5; // Där bäcken vidgar sig till en damm.
const STREAM_SAMPLES = 90;
const streamCurve = new THREE.CatmullRomCurve3(STREAM_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
// Halva bredden längs bäcken: smal, med en bula vid dammen, och spetsig i ändarna.
function streamHalfWidth(x, t) {
  const bump = 2.0 * Math.exp(-(((x - POND_X) / 4.6) ** 2));
  return (1.2 + bump) * THREE.MathUtils.clamp(Math.min(t / 0.05, (1 - t) / 0.07), 0.2, 1);
}
// Punkter längs bäcken: { x, z, hw, s } där s = sträcka från källan (enheter).
export const streamSamples = []; // Exporteras för säsongsmodulerna (is på bäcken).
{
  const points = streamCurve.getSpacedPoints(STREAM_SAMPLES);
  let along = 0;
  points.forEach((point, i) => {
    if (i) along += Math.hypot(point.x - points[i - 1].x, point.z - points[i - 1].z);
    streamSamples.push({ x: point.x, z: point.z, hw: streamHalfWidth(point.x, i / STREAM_SAMPLES), s: along });
  });
}
// Bäckens z där den är vid x (broarna står på bäcken).
function streamZAt(x) {
  for (let i = 1; i < streamSamples.length; i++) {
    const a = streamSamples[i - 1];
    const b = streamSamples[i];
    if ((a.x - x) * (b.x - x) <= 0) return a.z + (b.z - a.z) * ((x - a.x) / ((b.x - a.x) || 1));
  }
  return streamSamples[streamSamples.length - 1].z;
}
const BRIDGES = [
  { right: ART_ROAD.right, down: streamZAt(ART_ROAD.right), length: 8 },
  { right: GAZEBO.right, down: streamZAt(GAZEBO.right), length: 8 },
];

// --- Det som träd, gräs och kollisioner behöver veta ---
// Cirklar { x, z, radius, soft? } i världen. Fylls när buildHubProps körs.
export const hubPropObstacles = [];
// Större föremål som får en kontaktskugga och stenar vid foten ({ x, z, radius }).
export const hubPropShadows = [];
// Ytor där gräset inte ska växa (torgets stenläggning, regnträdgården): { x, z, radius }.
export const hubGrassFree = [];

const origin = hubPoint(0, 0);
function toScreen(x, z) {
  const dx = x - origin.x;
  const dz = z - origin.z;
  return {
    right: dx * Math.cos(BILLBOARD_FACING) - dz * Math.sin(BILLBOARD_FACING),
    down: dx * Math.sin(BILLBOARD_FACING) + dz * Math.cos(BILLBOARD_FACING),
  };
}
// Ungefärligt avstånd från en punkt (världen) till närmaste vatten: bäcken, dammen och
// regnträdgårdens våta mitt (minus = i vattnet).
export function distanceToWater(x, z) {
  const spot = toScreen(x, z);
  let best = Infinity;
  for (const sample of streamSamples) best = Math.min(best, Math.hypot(spot.right - sample.x, spot.down - sample.z) - sample.hw);
  const k = Math.hypot((spot.right - RAIN_GARDEN.right) / RAIN_GARDEN.a, (spot.down - RAIN_GARDEN.down) / RAIN_GARDEN.b);
  return Math.min(best, (k - 1) * Math.min(RAIN_GARDEN.a, RAIN_GARDEN.b));
}

function addObstacle(right, down, radius, shadow = 0, soft = false) {
  const spot = hubPoint(right, down);
  const entry = soft ? { x: spot.x, z: spot.z, radius, soft: true } : { x: spot.x, z: spot.z, radius };
  hubPropObstacles.push(entry);
  if (shadow) hubPropShadows.push({ x: spot.x, z: spot.z, radius: shadow });
  return entry; // Byggaren kan lägga till kind / onHit / once (se hub.js) så att något händer när bilen kör över.
}

// --- Skräp som flyger när bilen kör över något (löv, jordklumpar) ---
// Små plana bitar som flyger iväg i färdriktningen, faller, ligger kvar en stund och tonas bort.
// Bor i en egen grupp (markMoving) som är vriden som hubprops-gruppen, så att koordinaterna är "right, down".
let debrisGroup = null;
const debrisColors = (getSeasonConfig().foliage || {}).debris || []; // Vinter: snö och jord i stället för gröna och orange löv.
const debrisGeometry = new THREE.PlaneGeometry(1, 1);
const DEBRIS_GRAVITY = 14;
function burst(x, y, z, color, count, size, dirX, dirZ, strength) {
  if (!debrisGroup) return;
  // Färdriktningen i gruppens led (gruppen är vriden BILLBOARD_FACING).
  const cos = Math.cos(BILLBOARD_FACING);
  const sin = Math.sin(BILLBOARD_FACING);
  const hx = cos * dirX - sin * dirZ;
  const hz = sin * dirX + cos * dirZ;
  const bits = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(debrisGeometry, material);
    const s = size * (0.6 + Math.random() * 0.8);
    mesh.scale.set(s, s, s);
    mesh.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.6);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    debrisGroup.add(mesh);
    bits.push({
      mesh, material,
      vx: hx * (1.5 + 3 * strength) * Math.random() + (Math.random() - 0.5) * 2.2,
      vz: hz * (1.5 + 3 * strength) * Math.random() + (Math.random() - 0.5) * 2.2,
      vy: 2.5 + Math.random() * 3.5, spin: (Math.random() - 0.5) * 12, landed: false,
    });
  }
  let time = 0;
  addAnimation((delta) => {
    time += delta;
    for (const bit of bits) {
      if (!bit.landed) {
        bit.vy -= DEBRIS_GRAVITY * delta;
        bit.mesh.position.x += bit.vx * delta;
        bit.mesh.position.y += bit.vy * delta;
        bit.mesh.position.z += bit.vz * delta;
        bit.mesh.rotation.x += bit.spin * delta;
        bit.mesh.rotation.y += bit.spin * 0.7 * delta;
        if (bit.mesh.position.y <= 0.05) { bit.mesh.position.y = 0.05; bit.landed = true; bit.mesh.rotation.x = -Math.PI / 2; }
      }
      bit.material.opacity = Math.min(1, Math.max(0, (2.4 - time) / 0.9)); // Ligger kvar ca 1,5 s, tonar sedan bort.
    }
    if (time < 2.4) return false;
    for (const bit of bits) { debrisGroup.remove(bit.mesh); bit.material.dispose(); }
    return true;
  });
}
function addGrassFree(right, down, radius) {
  const spot = hubPoint(right, down);
  hubGrassFree.push({ x: spot.x, z: spot.z, radius });
}

// --- Material (delas av alla föremål) ---
function flat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
const concreteMaterial = flat('#d9d2c3');
const charcoalMaterial = flat('#3b3d43');
const concreteDoubleMaterial = new THREE.MeshLambertMaterial({ color: '#d9d2c3', flatShading: true, side: THREE.DoubleSide });
const steelMaterial = flat('#f2efe8');
const timberMaterial = flat('#c98b4e');
const timberDarkMaterial = flat('#8a5a34');
const sedumMaterial = flat('#8a9a4a');
const soilMaterial = flat('#4a3a2c');
const glassMaterial = new THREE.MeshLambertMaterial({ color: '#2c3a46', flatShading: true });
const orangeMaterial = flat('#e0662a');
const rockMaterials = [flat('#8d8478'), flat('#a69b8d')];
const mossMaterial = flat('#7d8f45');
const cushionMaterial = flat('#e0662a');
const bollardCapMaterial = new THREE.MeshBasicMaterial({ color: '#ffd98a' });

// En form på en plats i en grupp. rotation = [x, y, z] (valfri).
function part(parent, geometry, material, x, y, z, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
// En mjukt avfasad låda: inga vassa kuber i parken.
const round = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
const cylinder = (top, bottom, h, sides = 10) => new THREE.CylinderGeometry(top, bottom, h, sides);

// En lysande text på mörk botten (kioskens skylt). Ritas utan ljus, så den "lyser".
function makeSignTexture(text) {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 80;
  const pen = image.getContext('2d');
  pen.fillStyle = '#2a2d33';
  pen.fillRect(0, 0, 256, 80);
  pen.strokeStyle = PALETTE.signGlow;
  pen.lineWidth = 5;
  pen.strokeRect(5, 5, 246, 70);
  pen.fillStyle = '#ffd27a';
  pen.font = 'bold 46px system-ui, sans-serif';
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.fillText(text, 128, 43);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// Torgets stenläggning: ljusa plattor i ringar med gräsfogar emellan (genomsläppligt, som i en regnpark).
function makePaverTexture() {
  const size = 512;
  const image = document.createElement('canvas');
  image.width = size;
  image.height = size;
  const pen = image.getContext('2d');
  const half = size / 2;
  pen.fillStyle = '#8b9650'; // Fogen: gräs.
  pen.fillRect(0, 0, size, size);
  const shades = ['#d6cebe', '#cfc6b5', '#dcd5c6', '#c8bfae'];
  for (let inner = 70, row = 0; inner < half - 4; row++) {
    const outer = Math.min(inner + 26, half - 3);
    const count = Math.max(6, Math.round(Math.PI * (inner + outer) / 30));
    for (let i = 0; i < count; i++) {
      const a0 = ((i + (row % 2) * 0.5) / count) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / count;
      const gap = 2.2;
      pen.fillStyle = shades[(i * 7 + row * 3) % shades.length];
      pen.beginPath();
      pen.arc(half, half, outer - gap, a0 + gap / outer, a1 - gap / outer);
      pen.arc(half, half, inner + gap, a1 - gap / inner, a0 + gap / inner, true);
      pen.closePath();
      pen.fill();
    }
    inner = outer;
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Vattnets skuggare: ringar, gnistor och strömmar, drivna av shared.uTime ---
// still: ringar från en mittpunkt (fontänen) + glittrande gnistor (dammen). flow: ränder som
// rinner längs bäcken (uv.y = sträcka nedströms) och glimtar.
function makeWaterMaterial(color, { flow = false, center = null, radius = 0 } = {}) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => (flow ? 'hub-water-flow' : 'hub-water-still');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uCenter = { value: new THREE.Vector2(center ? center.x : 0, center ? center.z : 0) };
    shader.uniforms.uRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWP;\nvarying vec2 vWUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xz;\nvWUV = uv;');
    const stillCode = `
      vec2 p = vWP;
      float d = length(p - uCenter);
      float rings = smoothstep(0.78, 1.0, sin(d * 4.2 - uTime * 2.2)) * (1.0 - smoothstep(0.4 * uRadius, uRadius, d)) * step(0.5, uRadius);
      float n = sin(p.x * 2.3 + uTime * 0.9) * sin(p.y * 2.9 - uTime * 0.7) + sin((p.x + p.y) * 4.1 + uTime * 1.7) * 0.6;
      float glint = smoothstep(1.1, 1.5, n);
      diffuseColor.rgb *= 0.92 + 0.08 * sin(p.x * 0.8 + uTime * 0.5) * sin(p.y * 0.9 - uTime * 0.4);
      diffuseColor.rgb += vec3(0.55, 0.7, 0.8) * (rings * 0.45 + glint * 0.5);`;
    const flowCode = `
      float edge = sin(vWUV.x * 3.14159);
      float along = vWUV.y;
      diffuseColor.rgb *= 0.72 + 0.28 * edge;
      float s = sin(along * 2.2 - uTime * 1.5 + sin(vWUV.x * 9.0 + along * 0.7) * 1.3);
      float streak = smoothstep(0.82, 1.0, s) * (0.35 + 0.65 * edge);
      float n = sin(along * 3.7 - uTime * 2.4 + vWUV.x * 17.0) * sin(vWUV.x * 13.0 - along * 1.3);
      float glint = smoothstep(0.75, 0.95, n) * edge;
      diffuseColor.rgb += vec3(0.5, 0.68, 0.78) * (streak * 0.35 + glint * 0.5);`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uCenter;\nuniform float uRadius;\nvarying vec2 vWP;\nvarying vec2 vWUV;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n{${flow ? flowCode : stillCode}\n}`);
  };
  return material;
}

// Ett band längs en lista punkter [{ x, z, hw, s }]: x på tvären 0..1, y = sträckan. extra = marginal.
export function ribbonGeometry(samples, extra = 0) {
  const positions = [];
  const uvs = [];
  const normals = [];
  const indices = [];
  samples.forEach((point, i) => {
    const before = samples[Math.max(i - 1, 0)];
    const after = samples[Math.min(i + 1, samples.length - 1)];
    const tx = after.x - before.x;
    const tz = after.z - before.z;
    const length = Math.hypot(tx, tz) || 1;
    const nx = -tz / length;
    const nz = tx / length;
    const width = point.hw + extra;
    positions.push(point.x + nx * width, 0, point.z + nz * width, point.x - nx * width, 0, point.z - nz * width);
    uvs.push(0, point.s, 1, point.s);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i) {
      const k = i * 2;
      indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// --- Växter: ornamentgräs, ängsblommor och vass. Allt är instancing (en form, många platser) ---
const tuftItems = [];   // { x, y, z, h, color }
const flowerItems = []; // { x, y, z, h, color }
const GRASS_COLORS = ['#a7b05a', '#c9c46e', '#e39a3f', '#8f9a45', '#d8b65a', '#b58a3c'].map((hex) => new THREE.Color(hex));
const PLUME_COLORS = ['#f2e3b0', '#e8c97a', '#d9a04a'].map((hex) => new THREE.Color(hex));
const FLOWER_COLORS = ['#fff1c9', '#f48c06', '#8e63c9', '#fff1c9', '#e85d04', '#a77bdc'].map((hex) => new THREE.Color(hex));
const stemColor = new THREE.Color('#6d7a3c');
let roadsForPlanting = [];
// Får något växa här (local-koordinater)? Inte på vägar, i vatten eller på fasta föremål.
function plantOk(x, z, margin = 0.9) {
  const spot = hubPoint(x, z);
  if (roadsForPlanting.some((road) => distanceToRoad(spot.x, spot.z, road) < (road.width || ROAD_WIDTH) / 2 + margin)) return false;
  if (distanceToWater(spot.x, spot.z) < 0.5) return false;
  return !hubPropObstacles.some((prop) => !prop.soft && Math.hypot(spot.x - prop.x, spot.z - prop.z) < prop.radius + 0.3);
}
function scatterIn(cx, cz, a, b, rotation, count, place, margin) {
  for (let placed = 0, tries = 0; placed < count && tries < count * 6; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = Math.sqrt(Math.random());
    const ex = Math.cos(angle) * reach * a;
    const ez = Math.sin(angle) * reach * b;
    const x = cx + ex * Math.cos(rotation) - ez * Math.sin(rotation);
    const z = cz + ex * Math.sin(rotation) + ez * Math.cos(rotation);
    if (!plantOk(x, z, margin)) continue;
    place(x, z, reach);
    placed++;
  }
}
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function tuft(x, z, h, color, y = 0) { const item = { x, y, z, h, color }; tuftItems.push(item); return item; }
function flower(x, z, h, color, y = 0) { const item = { x, y, z, h, color }; flowerItems.push(item); return item; }

// Ornamentgräsbädd: höga tuvor med ljusa vippor i mitten, lägre ut mot kanten.
function bed(cx, cz, a, b, rotation, count) {
  scatterIn(cx, cz, a, b, rotation, count, (x, z, reach) => {
    tuft(x, z, (0.5 + Math.random() * 0.5) * (1.25 - 0.5 * reach), Math.random() < 0.3 ? pick(PLUME_COLORS) : pick(GRASS_COLORS));
    if (Math.random() < 0.18) flower(x, z, 0.5 + Math.random() * 0.3, pick(FLOWER_COLORS));
  });
  addGrassFree(cx, cz, Math.max(a, b) * 0.55);
}
// Ängsfläck: gräs med kräm-, orange- och violetta blommor.
function meadow(cx, cz, a, b, count) {
  scatterIn(cx, cz, a, b, Math.random() * 3, count, (x, z) => {
    if (Math.random() < 0.65) flower(x, z, 0.45 + Math.random() * 0.45, pick(FLOWER_COLORS));
    else tuft(x, z, 0.35 + Math.random() * 0.4, pick(GRASS_COLORS));
  }, 1.3);
}

// En tuva = fem smala strån som lutar åt olika håll (en enda form).
const tuftGeometry = (() => {
  const blades = [];
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.ConeGeometry(0.07, 1, 3);
    blade.translate(0, 0.5, 0);
    blade.rotateZ(0.12 + (i % 3) * 0.1);
    blade.rotateY((i / 5) * Math.PI * 2 + 0.4);
    blades.push(blade);
  }
  return mergeGeometries(blades);
})();
const stemGeometry = new THREE.ConeGeometry(0.03, 1, 3).translate(0, 0.5, 0);
const headGeometry = new THREE.OctahedronGeometry(0.24, 0).scale(1, 0.7, 1).translate(0, 1, 0);
// Plantorna gungar i vinden: toppen (position.y) rör sig mest, fasen kommer från platsen.
function swayMaterial(amount) {
  const material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  material.customProgramCacheKey = () => 'hub-plant-sway' + amount;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6;
        transformed.x += sin(uTime * 1.7 + ph) * ${amount.toFixed(2)} * position.y;
        transformed.z += cos(uTime * 1.3 + ph * 1.3) * ${(amount * 0.7).toFixed(2)} * position.y;`);
  };
  return material;
}
function instanced(geometry, material, items, colorOf) {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((item, i) => {
    quaternion.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    scale.set(item.h * 0.9, item.h, item.h * 0.9);
    spot.set(item.x, item.y, item.z);
    matrix.compose(spot, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, colorOf(item));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  return mesh;
}
function buildPlants(local) {
  const sway = swayMaterial(0.14);
  const stemSway = swayMaterial(0.14);
  const meshes = [
    instanced(tuftGeometry, sway, tuftItems, (item) => item.color),
    instanced(stemGeometry, stemSway, flowerItems, () => stemColor),
    instanced(headGeometry, sway, flowerItems, (item) => item.color),
  ];
  for (const mesh of meshes) if (mesh) local.add(mesh);
  plantMeshes.tuft = meshes[0];
  plantMeshes.stem = meshes[1];
  plantMeshes.head = meshes[2];
}
// De instansierade växterna (sätts i buildPlants). hidePlant tar bort en planterad tuva/blomma ur bilden.
const plantMeshes = { tuft: null, stem: null, head: null };
const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
function hidePlant(item) {
  const hide = (mesh, list) => {
    const index = list.indexOf(item);
    if (!mesh || index < 0) return;
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.instanceMatrix.needsUpdate = true;
  };
  hide(plantMeshes.tuft, tuftItems);
  hide(plantMeshes.stem, flowerItems);
  hide(plantMeshes.head, flowerItems);
}

// --- Fontänen mitt på torget: en låg, rund bassäng med strålar som pulserar och droppar som flyger ---
function buildFountain(local) {
  const fountain = new THREE.Group();
  fountain.position.set(PLAZA.right, 0, PLAZA.down);
  const centre = hubPoint(PLAZA.right, PLAZA.down);
  // Bassängens vägg: avfasad betongring med en slank kantlist och en mörk fog.
  part(fountain, new THREE.CylinderGeometry(2.55, 2.7, 0.46, 24, 1, true), concreteDoubleMaterial, 0, 0.23, 0); // Öppen vägg: vattnet syns innanför.
  part(fountain, new THREE.TorusGeometry(2.6, 0.1, 5, 28), steelMaterial, 0, 0.48, 0, [Math.PI / 2, 0, 0]);
  part(fountain, cylinder(2.62, 2.62, 0.05, 24), charcoalMaterial, 0, 0.1, 0);
  // Vattnet: en cirkel med rörliga ringar och gnistor (skuggaren ovan).
  const water = part(fountain, new THREE.CircleGeometry(2.4, 28).rotateX(-Math.PI / 2), makeWaterMaterial('#5aa6d0', { center: centre, radius: 2.4 }), 0, 0.4, 0);
  water.userData.noShadow = true;
  // Mittpelaren: en slank stålpelare med en skål, och en sprutande kon som pulserar.
  part(fountain, cylinder(0.1, 0.16, 1.3, 8), steelMaterial, 0, 1.05, 0);
  part(fountain, cylinder(0.5, 0.12, 0.16, 12), steelMaterial, 0, 1.72, 0);
  const jet = part(fountain, new THREE.ConeGeometry(0.1, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#e4f5ff' }), 0, 1.78, 0);
  jet.userData.noShadow = true;
  jet.material.customProgramCacheKey = () => 'hub-jet';
  jet.material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y *= 1.2 + 0.7 * (0.5 + 0.5 * sin(uTime * 2.3)) + 0.25 * sin(uTime * 5.1);\ntransformed.xz *= 1.0 + 0.15 * sin(uTime * 3.7);');
  };
  // Dropparna: åtta bågar från skålen ut i bassängen och en gejser i mitten. Banan räknas ut på
  // grafikkortet av en tid (uTime) och ett frö per droppe (aSeed: riktning, fas, räckvidd, sort).
  const drops = [];
  for (let arc = 0; arc < 8; arc++) {
    for (let k = 0; k < 9; k++) drops.push([(arc / 8) * Math.PI * 2, k / 9 + Math.random() * 0.05, 0.9 + Math.random() * 0.2, 0]);
  }
  for (let k = 0; k < 16; k++) drops.push([Math.random() * Math.PI * 2, k / 16, 0.6 + Math.random() * 0.8, 1]);
  const dropGeometry = new THREE.IcosahedronGeometry(0.07, 0);
  dropGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(drops.flat()), 4));
  const dropMaterial = new THREE.MeshBasicMaterial({ color: '#eaf8ff' });
  dropMaterial.customProgramCacheKey = () => 'hub-drops';
  dropMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSeed;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float t = fract(uTime * 0.62 + aSeed.y);
        float pulse = 0.9 + 0.1 * sin(uTime * 1.9 + aSeed.x * 3.0);
        vec3 o;
        if (aSeed.w < 0.5) {
          float reach = 2.0 * aSeed.z;
          o = vec3(sin(aSeed.x) * reach * t, 1.8 + 0.9 * pulse * 4.0 * t * (1.0 - t) - 1.4 * t * t, cos(aSeed.x) * reach * t);
        } else {
          float spread = 0.9 * aSeed.z;
          o = vec3(sin(aSeed.x) * spread * t, 1.9 + 2.3 * pulse * aSeed.z * 4.0 * t * (1.0 - t) - 1.5 * t * t, cos(aSeed.x) * spread * t);
        }
        transformed = transformed * (1.0 - 0.35 * t) + o;`);
  };
  const dropMesh = new THREE.InstancedMesh(dropGeometry, dropMaterial, drops.length);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < drops.length; i++) dropMesh.setMatrixAt(i, identity);
  dropMesh.frustumCulled = false;
  dropMesh.userData.noShadow = true;
  fountain.add(dropMesh);
  markMoving(water, jet, dropMesh);
  local.add(fountain);
  addObstacle(PLAZA.right, PLAZA.down, 2.9, 3.3);
  addGrassFree(PLAZA.right, PLAZA.down, PLAZA.radius - 0.4); // Stenläggningen täcker hela insidan.
}
// Torgets stenläggning: en cirkel med plattor, under gruset på ringvägen.
function buildPlazaPaving(local) {
  const material = new THREE.MeshLambertMaterial({ map: makePaverTexture(), depthTest: false, depthWrite: false });
  const paving = part(local, new THREE.CircleGeometry(PLAZA.radius - 0.9, 48).rotateX(-Math.PI / 2), material, PLAZA.right, 0.014, PLAZA.down);
  paving.renderOrder = -8.5;
}

// --- Bäcken och dammen ---
function buildStream(local) {
  // Först en mörkare kant (lite bredare), sedan vattnet. Ritas som vägarna: utan djuptest, i en egen
  // ordning efter marken men före gruset, så att det inte flimrar och vägen över ligger ovanpå.
  const rimMaterial = new THREE.MeshBasicMaterial({ color: '#2f6a62', depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const rim = part(local, ribbonGeometry(streamSamples, 0.4), rimMaterial, 0, 0.02, 0);
  rim.renderOrder = -9.02;
  const waterMaterial = makeWaterMaterial('#4f9fc4', { flow: true });
  waterMaterial.depthTest = false;
  waterMaterial.depthWrite = false;
  const water = part(local, ribbonGeometry(streamSamples, 0), waterMaterial, 0, 0.022, 0);
  water.renderOrder = -9.01;
  water.userData.noShadow = true;
  markMoving(water);

  // Stenar längs båda kanterna (inte där broarna går) och vass bakom dem.
  const stones = [];
  const lightColor = new THREE.Color(PALETTE.gravelLight);
  const darkColor = new THREE.Color(PALETTE.gravelDark);
  const mossColor = new THREE.Color(PALETTE.grassRoot);
  const nearBridge = (x, margin) => BRIDGES.some((bridge) => Math.abs(x - bridge.right) < DECK_HALF + margin);
  streamSamples.forEach((point, i) => {
    if (i === 0 || i === streamSamples.length - 1) return;
    const before = streamSamples[i - 1];
    const after = streamSamples[i + 1];
    const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    const nx = -(after.z - before.z) / length;
    const nz = (after.x - before.x) / length;
    for (const side of [-1, 1]) {
      if (nearBridge(point.x, 0.4)) continue;
      const out = point.hw + 0.25 + Math.random() * 0.15;
      const color = lightColor.clone().lerp(darkColor, Math.random());
      if (Math.random() < 0.35) color.lerp(mossColor, 0.5);
      stones.push({ x: point.x + nx * out * side, z: point.z + nz * out * side, size: 0.22 + Math.random() * 0.26, color });
      if (Math.random() < 0.5 && !nearBridge(point.x, 1.2)) {
        const reedAt = out + 0.5 + Math.random() * 0.4;
        tuft(point.x + nx * reedAt * side, point.z + nz * reedAt * side, 0.8 + Math.random() * 0.6, pick(GRASS_COLORS));
      }
    }
  });
  addStoneInstances(local, stones);

  // Trappstenar tvärs över bäcken längst i väster.
  const stepX = -43.8;
  const stepZ = streamZAt(stepX);
  for (let i = 0; i < 5; i++) {
    const stone = part(local, cylinder(0.42, 0.46, 0.1, 7), concreteMaterial, stepX + (i % 2) * 0.25, 0.05, stepZ + (i - 2) * 0.8);
    stone.rotation.y = i;
  }

  // Vattnet är ett hinder för bilen utom där broarna går: cirklar längs bäckens mitt, och en
  // cirkel vid varje brokant så att vattnet närmast däcket också är stängt.
  const reachAt = (point) => point.hw + 0.25;
  let lastS = -Infinity;
  for (const point of streamSamples) {
    if (point.s - lastS < 1.0) continue;
    if (BRIDGES.some((bridge) => Math.abs(point.x - bridge.right) < DECK_HALF + reachAt(point))) continue;
    lastS = point.s;
    addObstacle(point.x, point.z, reachAt(point));
  }
  for (const bridge of BRIDGES) {
    const radius = 1.2 + 0.25;
    for (const side of [-1, 1]) {
      const x = bridge.right + side * (DECK_HALF + radius + 0.05);
      addObstacle(x, streamZAt(x), radius);
    }
  }
}

// --- Bron: ett brett, plant däck (bilen kör kvar på y = 0). Vägen plus marginal; räckena står utanför. ---
function buildBridge(local, bridge) {
  const group = new THREE.Group();
  group.position.set(bridge.right, 0, bridge.down);
  const length = bridge.length;
  const plankStep = 0.56;
  const planks = Math.ceil((length - 0.8) / plankStep);
  const deckWidth = (DECK_HALF - 0.4) * 2;
  const deck = new THREE.InstancedMesh(round(deckWidth, 0.09, plankStep - 0.07, 0.03), flat('#ffffff'), planks);
  const matrix = new THREE.Matrix4();
  const woodColor = new THREE.Color('#c98b4e');
  for (let i = 0; i < planks; i++) {
    matrix.makeTranslation(0, 0.045, -(length - 0.8) / 2 + (i + 0.5) * ((length - 0.8) / planks));
    deck.setMatrixAt(i, matrix);
    deck.setColorAt(i, woodColor.clone().multiplyScalar(0.82 + Math.random() * 0.3));
  }
  deck.instanceMatrix.needsUpdate = true;
  deck.instanceColor.needsUpdate = true;
  deck.frustumCulled = false;
  group.add(deck);
  for (const side of [-1, 1]) {
    // Kantbalk av betong, och ett lågt räcke av slanka stålstolpar utanför körfältet.
    part(group, round(0.4, 0.14, length, 0.05), concreteMaterial, side * (DECK_HALF - 0.2), 0.07, 0);
    const x = side * (DECK_HALF + 0.05);
    const posts = Math.round(length / 1.6) + 1;
    for (let i = 0; i < posts; i++) {
      part(group, cylinder(0.04, 0.05, 0.62, 6), steelMaterial, x, 0.31, -length / 2 + 0.1 + (i / (posts - 1)) * (length - 0.2));
    }
    part(group, cylinder(0.04, 0.04, length, 6), steelMaterial, x, 0.62, 0, [Math.PI / 2, 0, 0]);
  }
  // Brofästen: ljusa plattor i ändarna, så att däcket möter marken mjukt.
  for (const side of [-1, 1]) part(group, round(DECK_HALF * 2 + 0.4, 0.1, 0.5, 0.04), concreteMaterial, 0, 0.05, side * (length / 2 + 0.05));
  local.add(group);
}

// --- Regnträdgården: en nedsänkt bädd som tar emot bäckens vatten, med stenar, starr och blommor ---
function buildRainGarden(local) {
  const { right, down, a, b } = RAIN_GARDEN;
  const earth = new THREE.MeshBasicMaterial({ color: '#6b5a40', depthTest: false, depthWrite: false });
  const bedMesh = part(local, new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), earth, right, 0.02, down);
  bedMesh.scale.set(a + 0.5, 1, b + 0.4);
  bedMesh.renderOrder = -9.03;
  const wetMaterial = makeWaterMaterial('#4a8aa8', { center: hubPoint(right, down), radius: 0 });
  wetMaterial.depthTest = false;
  wetMaterial.depthWrite = false;
  const wet = part(local, new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), wetMaterial, right, 0.022, down);
  wet.scale.set(a * 0.6, 1, b * 0.55);
  wet.renderOrder = -9.0;
  wet.userData.noShadow = true;
  markMoving(wet);
  const stones = [];
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.1;
    const color = new THREE.Color(PALETTE.gravelLight).lerp(new THREE.Color(PALETTE.gravelDark), Math.random());
    stones.push({ x: right + Math.cos(angle) * (a * 0.62 + Math.random() * 0.15), z: down + Math.sin(angle) * (b * 0.62 + Math.random() * 0.15), size: 0.2 + Math.random() * 0.18, color });
  }
  addStoneInstances(local, stones);
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 0.78 + Math.random() * 0.4;
    const x = right + Math.cos(angle) * a * reach;
    const z = down + Math.sin(angle) * b * reach;
    if (Math.random() < 0.3) flower(x, z, 0.5 + Math.random() * 0.4, Math.random() < 0.5 ? FLOWER_COLORS[2] : FLOWER_COLORS[1]);
    else tuft(x, z, 0.6 + Math.random() * 0.6, pick(GRASS_COLORS));
  }
  addGrassFree(right - a * 0.5, down, 2.6);
  addGrassFree(right + a * 0.5, down, 2.6);
  addGrassFree(right, down, 2.4);
}

// --- Kiosken (drive-in) vid första skylten: vit volym, stor glasruta, grönt sedumtak ---
function buildKiosk(local) {
  const kiosk = new THREE.Group();
  kiosk.position.set(KIOSK.right, 0, KIOSK.down);
  part(kiosk, round(3.4, 0.2, 2.5, 0.05), charcoalMaterial, 0, 0.1, 0);        // Sockel.
  part(kiosk, round(3.0, 2.0, 2.1, 0.1), steelMaterial, 0, 1.2, 0);            // Huset.
  part(kiosk, round(2.3, 0.95, 0.08, 0.03), glassMaterial, 0, 1.6, 1.06);      // Stora glasrutan ...
  part(kiosk, round(0.06, 0.95, 0.1, 0.02), charcoalMaterial, 0, 1.6, 1.08);   // ... med en spröjs ...
  part(kiosk, round(2.4, 0.06, 0.1, 0.02), charcoalMaterial, 0, 1.6, 1.08);    // ... åt vardera hållet.
  part(kiosk, round(2.8, 0.1, 0.55, 0.04), timberMaterial, 0, 1.08, 1.3);      // Disken i trä.
  // Taket: mörk kant och ett grönt sedumtak med tuvor och blommor.
  part(kiosk, round(3.5, 0.16, 2.6, 0.06), charcoalMaterial, 0, 2.28, 0.05);
  part(kiosk, round(3.2, 0.1, 2.3, 0.05), sedumMaterial, 0, 2.4, 0.05);
  // Ett lutande skärmtak av trä över disken på två slanka stålstolpar.
  part(kiosk, round(3.2, 0.07, 1.1, 0.03), timberMaterial, 0, 2.05, 1.75, [0.1, 0, 0]);
  for (const side of [-1, 1]) part(kiosk, cylinder(0.04, 0.04, 2.0, 6), steelMaterial, side * 1.5, 1.02, 2.2);
  // Den lysande skylten ovanpå, på två slanka stolpar.
  for (const side of [-1, 1]) part(kiosk, cylinder(0.035, 0.035, 0.9, 6), charcoalMaterial, side * 1.1, 2.9, 0.2);
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.85), new THREE.MeshBasicMaterial({ map: makeSignTexture('SNACKS') }));
  signBoard.position.set(0, 3.2, 0.3);
  signBoard.rotation.x = -0.45; // Lutar bakåt, som skyltarna (se SCREEN_TILT).
  kiosk.add(signBoard);
  // Två runda pallar framför disken.
  for (const side of [-1, 1]) {
    part(kiosk, cylinder(0.24, 0.22, 0.1, 10), cushionMaterial, side * 1.0, 0.58, 2.6);
    part(kiosk, cylinder(0.04, 0.04, 0.52, 6), charcoalMaterial, side * 1.0, 0.27, 2.6);
  }
  // Det varma skenet på marken framför (fejkat ljus, se lamps.js).
  const glowMaterial = makeGlowMaterial(0.55);
  glowMaterial.color.set(PALETTE.warmLamp);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 6).rotateX(-Math.PI / 2), glowMaterial);
  glow.position.set(0, 0.1, 2.3);
  glow.userData.noShadow = true;
  kiosk.add(glow);
  local.add(kiosk);
  // Växter på taket (kioskens egna koordinater + dess plats).
  for (let i = 0; i < 26; i++) {
    const x = KIOSK.right + (Math.random() - 0.5) * 2.9;
    const z = KIOSK.down + 0.05 + (Math.random() - 0.5) * 2.0;
    if (Math.random() < 0.3) flower(x, z, 0.3 + Math.random() * 0.25, pick(FLOWER_COLORS), 2.45);
    else tuft(x, z, 0.22 + Math.random() * 0.25, pick(GRASS_COLORS), 2.45);
  }
  for (const dx of [-1, 0, 1]) addObstacle(KIOSK.right + dx * 1.0, KIOSK.down, 1.4, dx === 0 ? 2.6 : 0);
}

// --- Paviljongen: slanka vita stålstolpar, ett lätt lutande tak av ribbor, en bänk och ett grönt takfält ---
function buildGazebo(local) {
  const gazebo = new THREE.Group();
  gazebo.position.set(GAZEBO.right, 0, GAZEBO.down);
  const span = 2.7;
  part(gazebo, round(6.6, 0.16, 6.6, 0.05), concreteMaterial, 0, 0.08, 0); // Golvet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(gazebo, cylinder(0.09, 0.11, 2.8, 8), steelMaterial, sx * span, 1.56, sz * span);
  // Taket lutar lite bakåt (mot -z). Ramen av stålbalkar, ribborna av trä, takfältet i sedum.
  const roof = new THREE.Group();
  roof.position.set(0, 2.98, 0);
  roof.rotation.x = -0.07;
  for (const s of [-1, 1]) {
    part(roof, round(6.2, 0.14, 0.14, 0.04), steelMaterial, 0, 0, s * (span + 0.2));
    part(roof, round(0.14, 0.14, 6.2, 0.04), steelMaterial, s * (span + 0.2), 0, 0);
  }
  for (let i = 0; i < 14; i++) part(roof, round(5.6, 0.08, 0.14, 0.03), timberMaterial, 0, 0.1, -2.7 + i * 0.415);
  part(roof, round(2.7, 0.12, 5.4, 0.05), sedumMaterial, -1.4, 0.2, 0);
  gazebo.add(roof);
  // Bänken inuti, längs högra sidan och vänd inåt: bakre kanten är där paviljongvägen kommer in, den ska vara fri.
  addBench(gazebo, 1.9, 0, -Math.PI / 2, 0.16, 2.1);
  // Ett litet lysande lampfält under taket.
  part(gazebo, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }), 0, 2.86, 0.3);
  local.add(gazebo);
  for (let i = 0; i < 24; i++) {
    const x = GAZEBO.right - 0.4 - Math.random() * 2.3;
    const z = GAZEBO.down + (Math.random() - 0.5) * 5.0;
    const y = 3.22 + 0.07 * (z - GAZEBO.down); // Följer takets lutning.
    if (Math.random() < 0.3) flower(x, z, 0.3 + Math.random() * 0.25, pick(FLOWER_COLORS), y);
    else tuft(x, z, 0.22 + Math.random() * 0.25, pick(GRASS_COLORS), y);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addObstacle(GAZEBO.right + sx * span, GAZEBO.down + sz * span, 0.6, 0);
  hubPropShadows.push({ x: hubPoint(GAZEBO.right, GAZEBO.down).x, z: hubPoint(GAZEBO.right, GAZEBO.down).z, radius: 4.4 });
  addGrassFree(GAZEBO.right, GAZEBO.down, 3.4);
}

// --- Skulpturer: två sammanflätade ringar på en sockel, och två lutande plattor ---
function buildSculptures(local) {
  const ring = new THREE.Group();
  ring.position.set(SCULPTURE.right, 0, SCULPTURE.down);
  part(ring, cylinder(0.7, 0.85, 0.4, 10), charcoalMaterial, 0, 0.2, 0);
  part(ring, new THREE.TorusGeometry(1.25, 0.17, 8, 28), steelMaterial, 0, 1.75, 0);
  part(ring, new THREE.TorusGeometry(0.9, 0.12, 8, 24), orangeMaterial, 0, 1.75, 0, [0, 1.25, 0]);
  part(ring, new THREE.IcosahedronGeometry(0.3, 0), orangeMaterial, 0, 1.75, 0);
  local.add(ring);
  addObstacle(SCULPTURE.right, SCULPTURE.down, 0.95, 1.8);
  addGrassFree(SCULPTURE.right, SCULPTURE.down, 1.6);

  const slabs = new THREE.Group();
  slabs.position.set(2, 0, 57.5);
  part(slabs, round(0.5, 2.9, 1.5, 0.1), concreteMaterial, -0.8, 1.42, 0, [0, 0.45, 0.04]);
  part(slabs, round(0.5, 2.1, 1.3, 0.1), orangeMaterial, 0.7, 1.02, 0.4, [0, -0.3, -0.05]);
  part(slabs, cylinder(1.9, 2.0, 0.08, 14), concreteMaterial, 0, 0.04, 0.1);
  local.add(slabs);
  addObstacle(1.2, 57.5, 0.8, 2.6);
  addObstacle(2.7, 57.9, 0.75);
}

// --- Bänkar (soft: bilen kör över dem) och planteringskrukor ---
const benchSlat = round(1.9, 0.05, 0.14, 0.02);
const benchLeg = round(0.05, 0.46, 0.5, 0.02);
function addBench(parent, x, z, angle, y = 0, length = 1.9) {
  const bench = new THREE.Group();
  bench.position.set(x, y, z);
  bench.rotation.y = angle;
  for (const dz of [-0.17, 0, 0.17]) part(bench, benchSlat, timberMaterial, 0, 0.46, dz).scale.x = length / 1.9;
  for (const dy of [0.74, 0.88]) part(bench, benchSlat, timberMaterial, 0, dy, -0.26, [-0.2, 0, 0]).scale.x = length / 1.9;
  for (const side of [-1, 1]) part(bench, benchLeg, steelMaterial, side * (length / 2 - 0.15), 0.23, 0);
  parent.add(bench);
}
// Står bänken eller krukan på en väg (även infarter, parkeringsfickor och gångvägar) eller i vatten?
// Då flyttas den till närmaste fria plats.
const BENCH_ROAD_MARGIN = 1.3;
function benchOk(right, down) {
  const spot = hubPoint(right, down);
  if (roadsForPlanting.some((road) => distanceToRoad(spot.x, spot.z, road) < (road.width || ROAD_WIDTH) / 2 + BENCH_ROAD_MARGIN)) return false;
  return distanceToWater(spot.x, spot.z) > 1;
}
function freeSpot(right, down) {
  if (benchOk(right, down)) return [right, down];
  for (let reach = 0.5; reach <= 8; reach += 0.5) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = right + Math.cos(angle) * reach;
      const d = down + Math.sin(angle) * reach;
      if (benchOk(r, d)) return [r, d];
    }
  }
  return [right, down];
}
function buildBenches(local, benches) {
  for (const [wantRight, wantDown, faceX, faceZ] of benches) {
    const [right, down] = freeSpot(wantRight, wantDown);
    addBench(local, right, down, Math.atan2(faceX, faceZ));
    addObstacle(right, down, 0.5, 0, true);
  }
}
const planterGeometry = round(1.7, 0.6, 0.85, 0.12);
const soilGeometry = round(1.5, 0.05, 0.65, 0.02);
function buildPlanters(local, planters) {
  for (const [wantRight, wantDown, angle] of planters) {
    const [right, down] = freeSpot(wantRight, wantDown);
    const planter = new THREE.Group();
    planter.position.set(right, 0, down);
    planter.rotation.y = angle;
    part(planter, planterGeometry, concreteMaterial, 0, 0.3, 0);
    part(planter, soilGeometry, soilMaterial, 0, 0.6, 0);
    local.add(planter);
    markMoving(planter); // Välter när bilen kör över: får inte slås ihop eller frysas.
    const plants = [];
    for (let i = 0; i < 7; i++) {
      const x = right + Math.cos(angle) * (Math.random() - 0.5) * 1.3 + Math.sin(angle) * (Math.random() - 0.5) * 0.4;
      const z = down - Math.sin(angle) * (Math.random() - 0.5) * 1.3 + Math.cos(angle) * (Math.random() - 0.5) * 0.4;
      if (i < 5) plants.push(tuft(x, z, 0.6 + Math.random() * 0.5, Math.random() < 0.4 ? pick(PLUME_COLORS) : pick(GRASS_COLORS), 0.6));
      else plants.push(flower(x, z, 0.55 + Math.random() * 0.3, pick(FLOWER_COLORS), 0.6));
    }
    // Körs bilen över krukan välter den, växterna flyger bort som löv och jord yr.
    const topple = knockableObject(planter);
    const obstacle = addObstacle(right, down, 0.5, 0, true);
    obstacle.kind = 'planter';
    obstacle.once = true;
    obstacle.onHit = (dirX, dirZ, strength) => {
      topple(dirX, dirZ);
      for (const item of plants) hidePlant(item);
      burst(right, 0.7, down, '#4a3a2c', 10, 0.18, dirX, dirZ, strength);
      burst(right, 0.7, down, debrisColors[1] || '#6b8a35', 10, 0.22, dirX, dirZ, strength);
    };
  }
}
// Pollare: låga stolpar med ett varmt sken i toppen, runt torgets ytterkant.
function buildBollards(local, spots) {
  const body = new THREE.InstancedMesh(cylinder(0.11, 0.14, 0.75, 8), charcoalMaterial, spots.length);
  const cap = new THREE.InstancedMesh(cylinder(0.12, 0.12, 0.07, 8), bollardCapMaterial, spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach(([right, down], i) => {
    matrix.makeTranslation(right, 0.375, down);
    body.setMatrixAt(i, matrix);
    matrix.makeTranslation(right, 0.79, down);
    cap.setMatrixAt(i, matrix);
    addObstacle(right, down, 0.2, 0, true);
  });
  for (const mesh of [body, cap]) {
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    local.add(mesh);
  }
}

// --- Buskar och stenblock ---
const shrubGeometry = new THREE.IcosahedronGeometry(1, 0);
const SHRUB_COLORS = ['#5b7a2f', '#6b8a35', '#7d8f45', '#a8602a', '#c78b2a'].map((hex) => new THREE.Color(hex));
function buildShrubs(local, clusters) {
  const blobs = [];
  const bushes = []; // { right, down, first, count } per buske: vilka blobbar som hör ihop.
  for (const [right, down] of clusters) {
    const count = 3 + Math.floor(Math.random() * 2);
    bushes.push({ right, down, first: blobs.length, count });
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const reach = i === 0 ? 0 : 0.55 + Math.random() * 0.3;
      blobs.push({ x: right + Math.cos(angle) * reach, z: down + Math.sin(angle) * reach, s: 0.45 + Math.random() * 0.35, color: pick(SHRUB_COLORS) });
    }
  }
  const mesh = new THREE.InstancedMesh(shrubGeometry, flat('#ffffff'), blobs.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  blobs.forEach((blob, i) => {
    quaternion.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6.3, Math.random()));
    scale.set(blob.s * 1.2, blob.s * 0.8, blob.s * 1.1);
    spot.set(blob.x, blob.s * 0.5, blob.z);
    matrix.compose(spot, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, blob.color);
    blob.quaternion = quaternion.clone();
  });
  // Körs bilen över busken trycks den ihop och fjädrar tillbaka (en studsande sinuskurva), och löv yr upp. Kan träffas igen.
  for (const bush of bushes) {
    let squash = null;
    const obstacle = addObstacle(bush.right, bush.down, 0.5, 0, true);
    obstacle.kind = 'bush';
    obstacle.onHit = (dirX, dirZ, strength) => {
      if (squash) return;
      burst(bush.right, 0.5, bush.down, debrisColors[1] || '#6b8a35', 7, 0.2, dirX, dirZ, strength);
      burst(bush.right, 0.5, bush.down, debrisColors[0] || '#c78b2a', 4, 0.2, dirX, dirZ, strength);
      let time = 0;
      squash = true;
      addAnimation((delta) => {
        time += delta;
        const u = Math.min(1, time / 0.9);
        const k = 1 - 0.55 * strength * Math.pow(1 - u, 2) * Math.cos(u * Math.PI * 3); // 1 = oskadd, <1 = hoptryckt.
        for (let i = bush.first; i < bush.first + bush.count; i++) {
          const blob = blobs[i];
          scale.set(blob.s * 1.2 / Math.sqrt(k), blob.s * 0.8 * k, blob.s * 1.1 / Math.sqrt(k));
          spot.set(blob.x, blob.s * 0.5 * k, blob.z);
          matrix.compose(spot, blob.quaternion, scale);
          mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (u >= 1) squash = null;
        return u >= 1;
      });
    };
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  local.add(mesh);
}

// Stenblock: tre olika kantiga former (ikosaedrar med förskjutna hörn), några med mossa ovanpå.
const boulderGeometries = [0, 1, 2].map((variant) => {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const offsets = new Map();
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    if (!offsets.has(key)) offsets.set(key, 0.78 + ((Math.sin(variant * 12.9 + i * 0.37) * 43758.5453) % 1 + 1) % 1 * 0.4);
    position.setXYZ(i, position.getX(i) * offsets.get(key), position.getY(i) * offsets.get(key), position.getZ(i) * offsets.get(key));
  }
  geometry.computeVertexNormals();
  return geometry;
});
function buildRocks(local, clusters) {
  for (const [right, down, count, size] of clusters) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + right;
      const reach = i === 0 ? 0 : size * (0.9 + (i % 2) * 0.3);
      const s = size * (i === 0 ? 1 : 0.5 + 0.35 * ((i * 37) % 3) / 2);
      const x = right + Math.cos(angle) * reach;
      const z = down + Math.sin(angle) * reach;
      const rock = part(local, boulderGeometries[i % 3], rockMaterials[i % 2], x, s * 0.4, z);
      rock.scale.set(s, s * 0.7, s * 0.9);
      rock.rotation.y = i * 1.7 + right;
      if (i % 2 === 0) { // Mossa på toppen.
        const moss = part(local, boulderGeometries[(i + 1) % 3], mossMaterial, x, s * 0.4 + s * 0.38, z);
        moss.scale.set(s * 0.62, s * 0.22, s * 0.55);
        moss.rotation.y = i;
      }
    }
    addObstacle(right, down, size * 1.4, size * 2.2);
  }
}

// Bygger allt i hemvärlden. roads = vägarna (för att hålla växter borta från dem).
// Körs före optimizeWorld (se main.js), så att allt slås ihop.
export function buildHubProps(roads = []) {
  hubPropObstacles.length = 0;
  hubPropShadows.length = 0;
  hubGrassFree.length = 0;
  tuftItems.length = 0;
  flowerItems.length = 0;
  roadsForPlanting = roads;
  const local = new THREE.Group();
  const base = hubPoint(0, 0);
  local.position.set(base.x, 0, base.z);
  local.rotation.y = BILLBOARD_FACING;
  worldGroup(WORLDS.hub).add(local);
  // Skräpet (löv, jord) bor i en egen grupp på samma plats och med samma vridning, som inte slås ihop.
  debrisGroup = new THREE.Group();
  debrisGroup.position.copy(local.position);
  debrisGroup.rotation.y = BILLBOARD_FACING;
  markMoving(debrisGroup);
  worldGroup(WORLDS.hub).add(debrisGroup);

  buildPlazaPaving(local);
  buildFountain(local);
  buildStream(local);
  for (const bridge of BRIDGES) buildBridge(local, bridge);
  buildRainGarden(local);
  buildKiosk(local);
  buildGazebo(local);
  buildSculptures(local);

  // Bänkar runt torgets kant (vända in mot fontänen), vid skulpturen, dammen och på ängen.
  const ringAt = (degrees, radius) => {
    const angle = degrees * Math.PI / 180;
    return [PLAZA.right + Math.sin(angle) * radius, PLAZA.down - Math.cos(angle) * radius];
  };
  const toCentre = ([right, down]) => [PLAZA.right - right, PLAZA.down - down];
  buildBenches(local, [
    ...[135, 195, 255].map((degrees) => {
      const spot = ringAt(degrees, 15.6);
      return [...spot, ...toCentre(spot)];
    }),
    [SCULPTURE.right, SCULPTURE.down + 3.4, 0, -1],
    [-26, 35.2, 0, -1],
    [-18, 33, -1, 0],
  ]);
  buildPlanters(local, [
    [SCULPTURE.right - 3.4, SCULPTURE.down - 1.2, 0], [SCULPTURE.right + 3.4, SCULPTURE.down - 1.2, 0],
    [GAZEBO.right - 3.9, GAZEBO_ROAD_END + 1.8, 0], [GAZEBO.right + 3.9, GAZEBO_ROAD_END + 1.8, 0],
    [KIOSK.right + 5.2, KIOSK.down + 2.6, 0.3],
  ]);
  buildBollards(local, [90, 120, 150, 180, 210, 240, 270].map((degrees) => ringAt(degrees, 14.2)));
  buildShrubs(local, [[-22.8, 0.9], [-19.6, 0.9], [-41.8, 45], [-34.2, 45], [-49, 39.5], [26.5, 17.6], [21.5, 17.8]]);
  buildRocks(local, [[-49, 23, 3, 1.0], [-26, 53, 3, 0.9], [38, 44, 4, 1.0], [50, 30, 3, 0.9], [-4, 60, 3, 0.8]]);

  // Ornamentgräsbäddar och ängsfläckar (bara utseende: bilen kör rakt över).
  bed(22, 25, 3.2, 1.4, 0.3, 36);
  bed(-21, 19.5, 3.0, 1.3, -0.2, 30);
  bed(9, 52.5, 3.5, 1.4, 0.1, 36);
  bed(-10, 54, 3, 1.3, -0.1, 30);
  bed(-31, 46, 2.8, 1.3, 0.2, 26);
  bed(44, 26, 2.5, 1.2, 0.5, 24);
  for (const [cx, cz, a, b, count] of [[28, 50, 7, 4.5, 90], [-36, 52, 6, 4, 70], [45, 40, 5, 6, 60], [12, 57.5, 6, 3, 55], [14, 21, 5, 3.2, 50], [-47, 17, 4, 3, 40], [-2, 20, 4, 2.4, 36]]) {
    meadow(cx, cz, a, b, count);
  }
  buildPlants(local);
}
