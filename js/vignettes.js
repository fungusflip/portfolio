// ============================================================================
// vignettes.js — små scener bredvid skyltarna, så att världen antyder vad projektet handlar om.
// ============================================================================
// Tre av de sex främsta projekten har en vinjett: Water Shader (en liten damm med brygga och roddbåt),
// Foliage Generator (ett lund där samma träd står i olika växtsteg) och SpookChester (en pixel-diner med
// flimrande neon). Vinjetterna är ren data i VIGNETTES nedan, nycklade på projektets titel (samma som i
// projects.js), så en ny vinjett läggs till med ett nytt objekt där: { place, build, solid, soft, free, ... }.
//
// KOORDINATER: som hubprops.js: "right, down" räknat från skyltradens mitt (hubPoint). Allt byggs i en
// grupp som är vriden som hubprops-gruppen, så en plats i gruppen är direkt (right, down). Varje vinjett
// har en egen liten grupp vars mitt (origin) ligger där `place` säger; måtten inne i den är enheter.
// Träd, gräs, säsongsprylar och kollisioner lär sig vinjetterna via hubPropObstacles / hubPropShadows /
// hubGrassFree (hubprops.js), så buildVignettes ska anropas direkt EFTER buildHubProps (före träden).
// Allt är sammanslaget per material (batch nedan), inget rör sig i JavaScript: vattnet och neonen drivs
// av shared.uTime i shadern, och kronorna gungar med samma addSway som träden.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, WORLDS, BILLBOARD_FACING, worldGroup, makeGlowMaterial } from './core.js';
import { hubPoint } from './home.js';
import { stopFor } from './projects.js';
import { ROAD_WIDTH, distanceToRoad } from './roads.js';
import { hubPropObstacles, hubPropShadows, hubGrassFree } from './hubprops.js';
import { shared, addSway } from './magic.js';
import { markMoving } from './optimize.js';
import { getSeasonConfig } from './season.js';

// ---- DATA START (läses också av kontrollskriptet; inga importerade namn får användas här) ----
// Layouten i "right, down". `place(stop)` ger vinjettens mitt. `side` på stoppet (+1 / -1) väljer åt vilket
// håll fri mark finns bredvid skylten; Water Shader står i stället under vägen (mitt för skylten ligger
// stugan och brevlådan på den sidan, så där finns ingen plats).
// solid: [dx, dz, radie] fasta cirklar (bilen krockar). soft: lågt, bilen kör över. free: [dx, dz, radie]
// där gräset inte ska växa. extent: [dx, dz, radie] som täcker hela det synliga bygget (för kontrollen).
export const VIGNETTE_LAYOUT = {
  'Water Shader': {
    place: (stop) => ({ right: stop.right + 2.0, down: stop.road + 8.6 }),
    pond: { a: 2.8, b: 2.2 }, // Dammens halvaxlar (right, down).
    solid: [[-1.6, 0.1, 1.2], [0, 0, 1.4], [1.6, 0.1, 1.2], [0, 1.2, 1.0], [0, -2.4, 0.6], [0, -3.2, 0.6]],
    soft: [],
    free: [[0, 0, 3.4], [0, -3.0, 1.3]],
    extent: [[-2.2, 0.1, 1.5], [2.2, 0.1, 1.5], [0, 0.2, 2.6], [0, -3.1, 1.0]], // Dammen, vassen och bryggans land.
    shadows: [],
  },
  'Foliage Generator': {
    place: (stop) => ({ right: stop.right + stop.side * 7.3, down: stop.down + 3.8 }),
    // Växtstegen från fröet längst fram till fullvuxet längst bak: [x, z, steg].
    plants: [[0, 5.8, 0], [0.25, 4.6, 1], [-0.2, 3.2, 2], [0.15, 1.7, 3], [-0.2, -0.3, 4], [0, -2.5, 5]],
    sign: [-2.0, 4.3],
    solid: [[0.15, 1.7, 0.2], [-0.2, -0.3, 0.26], [0, -2.5, 0.3], [-2.65, 4.3, 0.12], [-1.35, 4.3, 0.12]],
    soft: [[0, 5.8, 0.3], [0.25, 4.6, 0.25], [-0.2, 3.2, 0.25]],
    free: [[0, 5.8, 0.7], [0.25, 4.6, 0.7], [-0.2, 3.2, 0.8], [0.15, 1.7, 1.0], [-0.2, -0.3, 1.2], [0, -2.5, 1.5], [-2.0, 4.3, 1.2]],
    extent: [[0, 5.8, 0.5], [0.25, 4.6, 0.5], [-0.2, 3.2, 0.7], [0.15, 1.7, 1.0], [-0.2, -0.3, 1.3], [0, -2.5, 1.8], [-2.0, 4.3, 1.1]],
    shadows: [[0.15, 1.7, 1.2], [-0.2, -0.3, 1.5], [0, -2.5, 1.8]],
  },
  'SpookChester: Pixel Art Render': {
    place: (stop) => ({ right: stop.right + stop.side * 7.4, down: stop.down + 3.0 }),
    solid: [[-1.0, -0.25, 0.85], [0, -0.25, 0.85], [1.0, -0.25, 0.85], [-1.0, 0.45, 0.85], [0, 0.45, 0.85], [1.0, 0.45, 0.85]],
    soft: [[1.15, 1.55, 0.3]],
    free: [[0, 0.2, 2.5]],
    extent: [[0, 0.1, 2.15], [1.15, 1.55, 0.35]],
    shadows: [[0, 0.1, 2.7]],
  },
};
// ---- DATA END ----

// --- Hjälpare ---
const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const seasonWinter = () => (getSeasonConfig().winter || {});

// En samling former som slås ihop till en enda mesh per material: add(material, geometri, x, y, z, rotation, skala).
function makeBatch() {
  const buckets = new Map();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  return {
    add(material, geometry, x, y, z, rotation = [0, 0, 0], size = [1, 1, 1]) {
      euler.set(rotation[0], rotation[1], rotation[2]);
      quaternion.setFromEuler(euler);
      matrix.compose(position.set(x, y, z), quaternion, scale.set(size[0], size[1], size[2]));
      const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      for (const name of Object.keys(copy.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
      }
      copy.applyMatrix4(matrix);
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(copy);
    },
    flush(parent) {
      for (const [material, list] of buckets) {
        const merged = mergeGeometries(list);
        for (const geometry of list) geometry.dispose();
        if (merged) parent.add(new THREE.Mesh(merged, material));
      }
      buckets.clear();
    },
  };
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylinder = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides);
const blob = (radius) => new THREE.IcosahedronGeometry(radius, 0);

// En liten pixelbild (nearest, inga mipmaps) ur en ritfunktion.
function pixelTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
// Ritar en bitmapp ur strängar ('.' = tomt, annat tecken = nyckel i `colors`) med övre vänstra hörnet i (x, y).
function drawBitmap(pen, rows, x, y, colors) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const color = colors[row[i]];
      if (!color) continue;
      pen.fillStyle = color;
      pen.fillRect(x + i, y + j, 1, 1);
    }
  });
}

// --- Registrering mot resten av världen (samma form som addObstacle / addGrassFree i hubprops.js) ---
function addObstacle(origin, dx, dz, radius, { soft = false, kind = null } = {}) {
  const spot = hubPoint(origin.right + dx, origin.down + dz);
  const entry = { x: spot.x, z: spot.z, radius, soft };
  if (kind) entry.kind = kind;
  hubPropObstacles.push(entry);
  return entry;
}
function register(origin, layout) {
  for (const [dx, dz, radius] of layout.solid) addObstacle(origin, dx, dz, radius); // soft:false = alltid fast (isSoftProp i hub.js).
  for (const [dx, dz, radius] of layout.soft) addObstacle(origin, dx, dz, radius, { soft: true, kind: 'decor' });
  for (const [dx, dz, radius] of layout.free) {
    const spot = hubPoint(origin.right + dx, origin.down + dz);
    hubGrassFree.push({ x: spot.x, z: spot.z, radius });
  }
  for (const [dx, dz, radius] of layout.shadows) {
    const spot = hubPoint(origin.right + dx, origin.down + dz);
    hubPropShadows.push({ x: spot.x, z: spot.z, radius });
  }
}

// ---------------------------------------------------------------------------
// WATER SHADER: en liten damm med brygga, roddbåt och vass. Vattnet är en egen liten shader.
// ---------------------------------------------------------------------------
const pondGeometry = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
let pondMaterial = null;
function getPondMaterial(frozen) {
  if (pondMaterial) return pondMaterial;
  // Ritas som bäcken i hubprops.js: utan djuptest, i egen ordning efter marken men före gruset.
  pondMaterial = new THREE.MeshBasicMaterial({ color: frozen ? '#c9deec' : '#3f93bd', side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  if (frozen) return pondMaterial; // Is: stilla och blek.
  pondMaterial.customProgramCacheKey = () => 'vignette-pond';
  pondMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPondUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPondUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vPondUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vPondUv * 2.0 - 1.0;                     // -1..1 över dammen
          float r = length(q);
          float shore = smoothstep(0.15, 0.95, r);          // 0 = djupt i mitten, 1 = strand
          // Vågkammar som glider över ytan (som ett toon-vatten) ...
          float bands = sin(q.x * 9.0 + sin(q.y * 5.0 + uTime * 0.8) * 1.2 - uTime * 1.3);
          float crest = smoothstep(0.86, 1.0, bands) * (1.0 - shore * 0.6);
          // ... ringar från där båten ligger ...
          float d = length(q - vec2(0.42, 0.1));
          float ring = smoothstep(0.8, 1.0, sin(d * 16.0 - uTime * 2.4)) * (1.0 - smoothstep(0.1, 0.55, d));
          // ... och skum längs kanten.
          float foam = smoothstep(0.78, 0.98, r) * (0.55 + 0.45 * sin(atan(q.y, q.x) * 9.0 + uTime * 0.7));
          diffuseColor.rgb *= mix(0.72, 1.05, shore);
          diffuseColor.rgb += vec3(0.55, 0.72, 0.82) * (crest * 0.35 + ring * 0.45 + foam * 0.5);
        }`);
  };
  return pondMaterial;
}

function buildWater(parent, layout) {
  const frozen = !!seasonWinter().ice;
  const { a, b } = layout.pond;
  const group = new THREE.Group();
  parent.add(group);

  // Kanten (mörkare, lite bredare) och vattnet.
  const rim = new THREE.Mesh(pondGeometry, new THREE.MeshBasicMaterial({ color: '#2f6a62', depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  rim.scale.set(a + 0.32, 1, b + 0.28);
  rim.position.y = 0.02;
  rim.renderOrder = -9.02;
  rim.userData.noShadow = true;
  group.add(rim);
  const water = new THREE.Mesh(pondGeometry, getPondMaterial(frozen));
  water.scale.set(a, 1, b);
  water.position.y = 0.022;
  water.renderOrder = -9.01;
  water.userData.noShadow = true;
  markMoving(water);
  group.add(water);

  const timber = flat('#c98b4e');
  const timberDark = flat('#8a5a34');
  const batch = makeBatch();
  // Bryggan: från stranden i norr (z -3.5) ut över vattnet; plank tvärs, två bärlinor och sex pålar.
  for (let i = 0; i < 10; i++) batch.add(timber, box(1.15, 0.06, 0.36), 0, 0.34, -3.3 + i * 0.44);
  for (const x of [-0.5, 0.5]) batch.add(timberDark, box(0.1, 0.14, 4.7), x, 0.26, -1.1);
  for (const x of [-0.6, 0.6]) for (const z of [-3.2, -1.1, 1.0]) batch.add(timberDark, cylinder(0.07, 0.09, 0.8, 6), x, 0.4, z);
  // Tidmätaren (ränder) och en liten lykta på bryggans yttersta påle.
  const white = flat('#f2efe8');
  const orange = flat('#e0662a');
  [white, orange, white, orange].forEach((material, i) => batch.add(material, cylinder(0.055, 0.055, 0.34, 6), 0.6, 0.97 + i * 0.34, 1.0));
  batch.add(new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }), new THREE.SphereGeometry(0.1, 8, 6), -0.6, 0.9, 1.0);

  // Roddbåten: ett skrov (pekat i båda ändar) med ljus insida, en bänk och två åror. Den ligger på vattnet.
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.95, 0);
  hullShape.quadraticCurveTo(-0.2, 0.9, 0.95, 0); // Kontrollpunkten är dubbelt så långt ut som skrovets bredd.
  hullShape.quadraticCurveTo(-0.2, -0.9, -0.95, 0);
  const hull = new THREE.ExtrudeGeometry(hullShape, { depth: 0.28, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
  const inner = new THREE.ExtrudeGeometry(hullShape, { depth: 0.04, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
  const boat = new THREE.Group();
  boat.position.set(1.45, 0.05, 0.15);
  boat.rotation.y = 0.35;
  parent.add(boat);
  const boatBatch = makeBatch();
  boatBatch.add(flat('#b8452e'), hull, 0, 0, 0);
  boatBatch.add(flat('#e8d9b8'), inner, 0, 0.27, 0, [0, 0, 0], [0.82, 1, 0.78]);
  boatBatch.add(timber, box(0.16, 0.05, 0.62), 0.1, 0.36, 0);
  for (const side of [-1, 1]) { // Åror: ett skaft över relingen och ett blad i änden.
    boatBatch.add(timberDark, cylinder(0.025, 0.025, 1.2, 5), 0.1, 0.5, side * 0.8, [Math.PI / 2, 0, 0]);
    boatBatch.add(timberDark, box(0.14, 0.02, 0.32), 0.1, 0.5, side * 1.4);
  }
  boatBatch.flush(boat);

  // Vass runt stranden (inte där bryggan går) och några näckrosblad.
  const random = rng(4711);
  const reed = flat(PALETTE.grassRoot);
  const cattail = flat('#5a3a22');
  for (let i = 0; i < 17; i++) {
    const angle = (i / 17) * Math.PI * 2 + random() * 0.25;
    if (Math.sin(angle) < -0.82) continue; // Bryggans sida (norr).
    const reach = 1.0 + random() * 0.12;
    const x = Math.cos(angle) * (a + 0.35) * reach;
    const z = Math.sin(angle) * (b + 0.3) * reach;
    for (let k = 0; k < 3; k++) {
      const h = 1.0 + random() * 0.6;
      const dx = (random() - 0.5) * 0.35;
      const dz = (random() - 0.5) * 0.35;
      const tiltX = (random() - 0.5) * 0.3;
      const tiltZ = (random() - 0.5) * 0.3;
      batch.add(reed, new THREE.ConeGeometry(0.04, h, 5), x + dx, h / 2, z + dz, [tiltX, 0, tiltZ]);
      if (k === 0 && i % 2 === 0) batch.add(cattail, cylinder(0.06, 0.06, 0.3, 6), x + dx + tiltZ * -0.35, h + 0.05, z + dz + tiltX * 0.35, [tiltX, 0, tiltZ]);
    }
  }
  if (!frozen) {
    const lily = flat('#5f8f3a');
    for (const [x, z] of [[-1.3, 0.5], [-0.7, 1.2], [1.0, -0.8], [-1.7, -0.3], [0.2, 1.45]]) batch.add(lily, cylinder(0.24, 0.24, 0.02, 8), x, 0.04, z);
  }
  // Stenar vid kanten.
  const rocks = [flat('#8d8478'), flat('#a69b8d')];
  [[-3.1, -0.9, 0.4], [3.2, 0.9, 0.35], [-2.6, 1.8, 0.3], [2.5, -1.6, 0.42], [3.5, -0.3, 0.25]].forEach(([x, z, size], i) => {
    batch.add(rocks[i % 2], blob(size), x, size * 0.45, z, [i, i * 1.7, 0], [1.2, 0.7, 1]);
  });
  batch.flush(group);
}

// ---------------------------------------------------------------------------
// FOLIAGE GENERATOR: ett lund där samma träd står i olika växtsteg, och en nodgraf på en skylt.
// ---------------------------------------------------------------------------
// Steg 0 frö, 1 grodd, 2 planta, 3 ungt, 4 vuxet, 5 fullvuxet. [stamhöjd, stamradie, kronor [x, y, z, radie]].
const GROWTH = [
  { trunk: 0, radius: 0, crowns: [] },
  { trunk: 0.45, radius: 0.025, crowns: [[0.09, 0.5, 0, 0.13], [-0.09, 0.45, 0.04, 0.12]] },
  { trunk: 0.9, radius: 0.05, crowns: [[0, 1.0, 0, 0.4]] },
  { trunk: 1.4, radius: 0.09, crowns: [[0, 1.75, 0, 0.7], [0.4, 1.5, 0.1, 0.45]] },
  { trunk: 1.7, radius: 0.14, crowns: [[0, 2.25, 0, 0.98], [0.65, 1.95, 0.2, 0.65], [-0.55, 2.0, -0.3, 0.7]] },
  { trunk: 1.9, radius: 0.2, crowns: [[0, 2.85, 0, 1.15], [0.95, 2.35, 0.3, 0.8], [-0.85, 2.45, -0.4, 0.85], [0.1, 3.45, 0.2, 0.6]] },
];

// Skylten: en nodgraf i Houdini-stil (rutor med färgad list, trådar emellan).
function nodeGraphTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 288;
  canvas.height = 180;
  const pen = canvas.getContext('2d');
  pen.fillStyle = '#16202c';
  pen.fillRect(0, 0, 288, 180);
  pen.strokeStyle = '#2c3e55';
  pen.lineWidth = 1;
  for (let x = 0; x < 288; x += 24) { pen.beginPath(); pen.moveTo(x, 0); pen.lineTo(x, 180); pen.stroke(); }
  for (let y = 0; y < 180; y += 24) { pen.beginPath(); pen.moveTo(0, y); pen.lineTo(288, y); pen.stroke(); }
  pen.fillStyle = PALETTE.techGridMain;
  pen.font = 'bold 15px monospace';
  pen.fillText('/obj/foliage_gen', 10, 20);
  const nodes = {
    seed: { x: 12, y: 44, color: '#6fcf5a', label: 'scatter' },
    grow: { x: 118, y: 44, color: '#f48c06', label: 'grow' },
    prune: { x: 118, y: 112, color: '#6f93c4', label: 'prune' },
    out: { x: 212, y: 78, color: '#ff5d8f', label: 'instance' },
  };
  const NODE_W = 74;
  const NODE_H = 30;
  const wire = (from, to) => {
    const x0 = from.x + NODE_W;
    const y0 = from.y + NODE_H / 2;
    const x1 = to.x;
    const y1 = to.y + NODE_H / 2;
    pen.strokeStyle = '#cfe0ff';
    pen.lineWidth = 3;
    pen.beginPath();
    pen.moveTo(x0, y0);
    pen.bezierCurveTo(x0 + 20, y0, x1 - 20, y1, x1, y1);
    pen.stroke();
  };
  wire(nodes.seed, nodes.grow);
  wire(nodes.seed, nodes.prune);
  wire(nodes.grow, nodes.out);
  wire(nodes.prune, nodes.out);
  for (const node of Object.values(nodes)) {
    pen.fillStyle = '#2b2d33';
    pen.fillRect(node.x, node.y, NODE_W, NODE_H);
    pen.fillStyle = node.color;
    pen.fillRect(node.x, node.y, 8, NODE_H);
    pen.fillStyle = '#f2efe8';
    pen.font = 'bold 14px monospace';
    pen.fillText(node.label, node.x + 14, node.y + 20);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFoliage(parent, layout) {
  const trunkMaterial = flat(PALETTE.trunk);
  const leafMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.leaves[Math.min(1, PALETTE.leaves.length - 1)], flatShading: true });
  addSway(leafMaterial); // Kronorna gungar i vinden, som träden.
  const soil = flat('#4a3a2c');
  const stakeMaterial = flat('#8a5a34');
  const stoneMaterial = flat('#a69b8d');
  const batch = makeBatch();
  const trunkGeometries = GROWTH.map((stage) => (stage.trunk ? new THREE.CylinderGeometry(stage.radius * 0.6, stage.radius, stage.trunk, 6) : null));

  layout.plants.forEach(([x, z, step]) => {
    const stage = GROWTH[step];
    batch.add(soil, cylinder(0.45 + 0.1 * step, 0.5 + 0.1 * step, 0.06, 10), x, 0.03, z);   // Planteringsbädd.
    if (step === 0) {
      batch.add(soil, new THREE.SphereGeometry(0.3, 7, 5), x, 0.02, z, [0, 0, 0], [1, 0.45, 1]); // Jordhög med två gryende blad.
      for (const side of [-1, 1]) batch.add(leafMaterial, new THREE.ConeGeometry(0.07, 0.24, 4), x + side * 0.07, 0.22, z, [0, 0, -side * 0.5]);
      return;
    }
    batch.add(trunkMaterial, trunkGeometries[step], x, stage.trunk / 2, z);
    for (const [cx, cy, cz, radius] of stage.crowns) batch.add(leafMaterial, blob(radius), x + cx, cy, z + cz, [cx * 3, cy, cz * 2]);
    if (step === 2) batch.add(stakeMaterial, cylinder(0.025, 0.025, 1.05, 5), x + 0.2, 0.52, z + 0.05);  // Stödkäppen.
    if (step <= 3) batch.add(stoneMaterial, cylinder(0.14, 0.17, 0.12, 7), x - 0.55, 0.06, z + 0.25);   // Stegmarkering.
  });

  // Skylten på två smala stolpar, lutad bakåt som skyltarna (SCREEN_TILT).
  const [signX, signZ] = layout.sign;
  const board = flat('#2b2d33');
  for (const dx of [-0.65, 0.65]) batch.add(trunkMaterial, cylinder(0.04, 0.045, 1.45, 6), signX + dx, 0.72, signZ);
  batch.add(board, box(1.9, 1.2, 0.07), signX, 1.5, signZ - 0.03, [-0.3, 0, 0]);
  batch.flush(parent);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.1), new THREE.MeshBasicMaterial({ map: nodeGraphTexture() }));
  face.position.set(signX, 1.5, signZ + 0.012);
  face.rotation.x = -0.3;
  face.userData.noShadow = true;
  parent.add(face);
}

// ---------------------------------------------------------------------------
// SPOOKCHESTER: en pixel-diner av kuber med flimrande neon, pixelaffischer och ett voxelspöke på taket.
// ---------------------------------------------------------------------------
const GLYPHS = { // 5x5 bokstäver till neonskylten.
  S: ['.####', '#....', '.###.', '....#', '####.'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  K: ['#..#.', '#.#..', '##...', '#.#..', '#..#.'],
};
const GHOST = ['..###..', '.#####.', '#######', '##o#o##', '#######', '#######', '#.#.#.#'];
const PUMPKIN = ['...g...', '.#####.', '#######', '#o###o#', '#######', '.#####.'];
const BAT = ['#.....#', '##.#.##', '#######', '.#####.', '..#.#..'];

let neonMaterial = null;
function getNeonMaterial() {
  if (neonMaterial) return neonMaterial;
  const word = ['S', 'P', 'O', 'O', 'K'];
  const texture = pixelTexture(36, 9, (pen) => {
    pen.fillStyle = '#14091f';
    pen.fillRect(0, 0, 36, 9);
    pen.fillStyle = '#ff4fa0';
    pen.fillRect(0, 0, 36, 1);
    pen.fillRect(0, 8, 36, 1);
    word.forEach((letter, i) => {
      drawBitmap(pen, GLYPHS[letter], 3 + i * 6, 2, { '#': i % 2 ? '#ff9a3c' : '#ff4fa0' });
    });
  });
  neonMaterial = new THREE.MeshBasicMaterial({ map: texture });
  neonMaterial.customProgramCacheKey = () => 'vignette-neon';
  neonMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vNeonUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNeonUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vNeonUv;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // Lätt pulsning, och sista bokstaven (K) som då och då slocknar en stund: trasig neon.
          float tick = floor(uTime * 9.0);
          float h = fract(sin(tick * 12.9898) * 43758.5453);
          float cut = step(0.88, h) * step(0.78, vNeonUv.x);
          float slow = 0.9 + 0.1 * sin(uTime * 2.1);
          diffuseColor.rgb *= slow * mix(1.0, 0.18, cut);
        }`);
  };
  return neonMaterial;
}

function buildDiner(parent) {
  const batch = makeBatch();
  // Sockel, kropp och tak. Framsidan är en pixelbild (lysande fönster, dörr, rutigt band).
  batch.add(flat('#3b3d43'), box(3.3, 0.12, 2.3), 0, 0.06, 0);
  batch.add(flat('#3a2a55'), box(3.0, 1.5, 2.0), 0, 0.87, 0);
  batch.add(flat('#1f1a2e'), box(3.4, 0.2, 2.4), 0, 1.72, 0);
  // Kuberna: stuprör av enstaka kuber längs takkanten (varannan), ett par trappsteg vid dörren.
  const cube = flat('#ff5d8f');
  for (let x = -1.6; x <= 1.61; x += 0.4) batch.add(cube, box(0.2, 0.2, 0.2), x, 1.92, 1.1);
  for (let z = 0.7; z >= -1.11; z -= 0.4) for (const x of [-1.6, 1.6]) batch.add(cube, box(0.2, 0.2, 0.2), x, 1.92, z);
  batch.add(flat('#d9d2c3'), box(0.6, 0.1, 0.4), -0.16, 0.17, 1.2);
  // Neonskylten på två stolpar över taket.
  const post = flat('#2b2d33');
  for (const x of [-1.05, -0.05]) batch.add(post, cylinder(0.035, 0.035, 0.7, 6), x, 2.17, 0.05);
  // Spöket av kuber på taket (voxel 0.12), ögonen mörka.
  const ghostMaterial = flat('#f2efe8');
  const eyeMaterial = flat('#1b1226');
  const voxel = 0.12;
  GHOST.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '.') continue;
      const x = 0.95 + (i - row.length / 2 + 0.5) * voxel;
      const y = 1.82 + (GHOST.length - j - 0.5) * voxel;
      batch.add(row[i] === 'o' ? eyeMaterial : ghostMaterial, box(voxel, voxel, voxel), x, y, -0.15);
    }
  });
  // Pumpan framför, av kuber.
  const pumpkinMaterial = flat('#e8731a');
  batch.add(pumpkinMaterial, box(0.3, 0.25, 0.3), 1.15, 0.125, 1.55);
  batch.add(flat('#3f8f2a'), box(0.07, 0.1, 0.07), 1.15, 0.3, 1.55);
  batch.flush(parent);

  // Framsidan: pixelbild 48x24 (16 px per enhet).
  const frontTexture = pixelTexture(48, 24, (pen) => {
    pen.fillStyle = '#3a2a55';
    pen.fillRect(0, 0, 48, 24);
    pen.fillStyle = '#ff5d8f';
    pen.fillRect(0, 0, 48, 2);
    for (let i = 0; i < 24; i++) { // Rutigt band nertill.
      pen.fillStyle = i % 2 ? '#f2efe8' : '#1e1e20';
      pen.fillRect(i * 2, 22, 2, 2);
      pen.fillStyle = i % 2 ? '#1e1e20' : '#f2efe8';
      pen.fillRect(i * 2, 20, 2, 2);
    }
    pen.fillStyle = '#1b1226'; // Fönstret till vänster: ram, ljus insida, spröjs.
    pen.fillRect(2, 5, 16, 11);
    pen.fillStyle = '#ffd27a';
    pen.fillRect(3, 6, 14, 9);
    pen.fillStyle = '#1b1226';
    pen.fillRect(10, 6, 1, 9);
    pen.fillStyle = '#ffb45e'; // En silhuett i fönstret: ett hängande "OPEN"-streck.
    pen.fillRect(5, 9, 4, 1);
    pen.fillStyle = '#1b1226'; // Dörren.
    pen.fillRect(20, 5, 9, 15);
    pen.fillStyle = '#e0662a';
    pen.fillRect(21, 6, 7, 14);
    pen.fillStyle = '#ffd27a';
    pen.fillRect(22, 8, 5, 4);
    pen.fillStyle = '#1b1226';
    pen.fillRect(26, 14, 1, 2);
    pen.fillStyle = '#2b1f45'; // Väggfält till höger (affischerna hänger här).
    pen.fillRect(31, 5, 16, 14);
  });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), new THREE.MeshBasicMaterial({ map: frontTexture }));
  front.position.set(0, 0.87, 1.012);
  front.userData.noShadow = true;
  parent.add(front);

  // Tre pixelaffischer (12x16 px) i en atlas, plan för plan med egen del av bilden.
  const posterTexture = pixelTexture(36, 16, (pen) => {
    const sets = [
      { rows: GHOST, bg: '#4a2d6b', colors: { '#': '#f2efe8', o: '#1b1226' } },
      { rows: PUMPKIN, bg: '#1f3a2a', colors: { '#': '#e8731a', o: '#1b1226', g: '#7fd04a' } },
      { rows: BAT, bg: '#7a2430', colors: { '#': '#1b1226' } },
    ];
    sets.forEach((set, i) => {
      pen.fillStyle = '#f2efe8';
      pen.fillRect(i * 12, 0, 12, 16);
      pen.fillStyle = set.bg;
      pen.fillRect(i * 12 + 1, 1, 10, 14);
      drawBitmap(pen, set.rows, i * 12 + 2, 3 + (i === 2 ? 1 : 0), set.colors);
      pen.fillStyle = '#f2efe8'; // Texten under bilden: två streck.
      pen.fillRect(i * 12 + 3, 11, 6, 1);
      pen.fillRect(i * 12 + 4, 13, 4, 1);
    });
  });
  const posterMaterial = new THREE.MeshBasicMaterial({ map: posterTexture });
  const posterBatch = makeBatch();
  [0.4, 0.82, 1.24].forEach((x, i) => {
    const plane = new THREE.PlaneGeometry(0.36, 0.48);
    const uv = plane.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 3);
    posterBatch.add(posterMaterial, plane, x, 0.86 + (i === 1 ? 0.04 : 0), 1.02, [0, 0, (i - 1) * 0.04]);
  });
  posterBatch.flush(parent);

  // Neonskylten (pixeltext, flimrar) med ett varmt sken bakom, och ett sken på marken framför.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), getNeonMaterial());
  sign.position.set(-0.55, 2.48, 0.1);
  sign.rotation.x = -0.25;
  sign.userData.noShadow = true;
  parent.add(sign);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.3), makeGlowMaterial(0.7));
  halo.material.color.set('#ff4fa0');
  halo.position.set(-0.55, 2.5, -0.05);
  halo.rotation.x = -0.25;
  halo.userData.noShadow = true;
  parent.add(halo);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.6).rotateX(-Math.PI / 2), makeGlowMaterial(0.5));
  ground.material.color.set('#ff4fa0');
  ground.position.set(0, 0.1, 2.0);
  ground.userData.noShadow = true;
  parent.add(ground);
}

// ---------------------------------------------------------------------------
// REGISTRET: titel → bygge. Fler vinjetter läggs till här (och i VIGNETTE_LAYOUT ovan).
// ---------------------------------------------------------------------------
export const VIGNETTES = {
  'Water Shader': { build: buildWater },
  'Foliage Generator': { build: buildFoliage },
  'SpookChester: Pixel Art Render': { build: buildDiner },
};

// Bygger alla vinjetter. roads = samma lista som buildHubProps får (för en kontroll i konsolen).
export function buildVignettes(roads = []) {
  const local = new THREE.Group();
  const base = hubPoint(0, 0);
  local.position.set(base.x, 0, base.z);
  local.rotation.y = BILLBOARD_FACING;
  worldGroup(WORLDS.hub).add(local);

  for (const [title, vignette] of Object.entries(VIGNETTES)) {
    const stop = stopFor(title);
    const layout = VIGNETTE_LAYOUT[title];
    if (!stop || !layout) {
      console.warn('Vinjetten saknar stopp eller layout:', title);
      continue;
    }
    const origin = layout.place(stop);
    const group = new THREE.Group();
    group.position.set(origin.right, 0, origin.down);
    local.add(group);
    vignette.build(group, layout);
    register(origin, layout);

    // Kontroll (som "Fast hinder på en väg" i hub.js): inget av bygget får ligga på en väg.
    for (const [dx, dz, radius] of layout.extent) {
      const spot = hubPoint(origin.right + dx, origin.down + dz);
      if (roads.some((road) => distanceToRoad(spot.x, spot.z, road) < (road.width || ROAD_WIDTH) / 2 + radius - 0.2)) console.warn('Vinjett nära en väg:', title);
    }
  }
}
