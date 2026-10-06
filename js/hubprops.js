// ============================================================================
// hubprops.js — föremål som gör hemvärlden till ett "ställe": fontänen på torget, dammen med
// bron, kiosken vid första skylten, tehuset, ruinpelare, häckar och stenhögar.
// ============================================================================
// Allt byggs i en grupp som är vriden som hem-gruppen (se home.js): x = åt höger på skärmen,
// z = nedåt på skärmen, och (0, 0) = mitt i skyltraden. Samma "right, down" som hubPoint, så
// platserna nedan går att tänka sig direkt på skärmen. Varje sak lägger också sin yta i
// hubPropObstacles (världskoordinater), så att träd, gräs och kollisioner kan hålla sig borta.
import * as THREE from 'three';
import { PALETTE, WORLDS, BILLBOARD_FACING, worldGroup, makeGlowMaterial } from './core.js';
import { hubPoint } from './home.js';
import { ROAD_WIDTH, addStoneInstances } from './roads.js';

// --- Layouten (right, down). ÄNDRA HÄR för att flytta torget och dammen. ---
export const PLAZA = { right: 0, down: 36.5, radius: 9, width: 4.4 }; // Torgets ring: radien är till vägens mitt.
export const POND = { right: -16.5, down: 26.5, a: 8.5, b: 4.2 };     // Dammen: halva bredden (a) och halva höjden (b).
const BRIDGE_MARGIN = 1.2; // Hur långt bron går ut förbi vattnet på varje sida.

// Åtta raka bitar i en åttkant runt torget. Första hörnet ligger rakt ovanför mitten, där
// stickvägen från huvudvägen kommer in.
export function plazaVertex(index) {
  const angle = (index % 8) * Math.PI / 4;
  return hubPoint(PLAZA.right + Math.sin(angle) * PLAZA.radius, PLAZA.down - Math.cos(angle) * PLAZA.radius);
}
export function plazaRoads() {
  return Array.from({ length: 8 }, (_, i) => ({ from: plazaVertex(i), to: plazaVertex(i + 1), width: PLAZA.width }));
}

// --- Det som träd, gräs och kollisioner behöver veta ---
// Cirklar { x, z, radius } i världen. Fylls när buildHubProps körs.
export const hubPropObstacles = [];
// Större föremål som får en kontaktskugga och stenar vid foten ({ x, z, radius }).
export const hubPropShadows = [];

const origin = hubPoint(0, 0);
function toScreen(x, z) {
  const dx = x - origin.x;
  const dz = z - origin.z;
  return {
    right: dx * Math.cos(BILLBOARD_FACING) - dz * Math.sin(BILLBOARD_FACING),
    down: dx * Math.sin(BILLBOARD_FACING) + dz * Math.cos(BILLBOARD_FACING),
  };
}
// Ungefärligt avstånd från en punkt till dammens kant (minus = i vattnet).
export function distanceToWater(x, z) {
  const spot = toScreen(x, z);
  const k = Math.hypot((spot.right - POND.right) / POND.a, (spot.down - POND.down) / POND.b);
  return (k - 1) * Math.min(POND.a, POND.b);
}

function addObstacle(right, down, radius, shadow = 0) {
  const spot = hubPoint(right, down);
  hubPropObstacles.push({ x: spot.x, z: spot.z, radius });
  if (shadow) hubPropShadows.push({ x: spot.x, z: spot.z, radius: shadow });
}

// --- Material (delas av alla föremål) ---
function flat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
const stoneMaterial = flat('#b8ada0');
const stoneDarkMaterial = flat('#8d8478');
const mossMaterial = flat('#8c9a6e');
const rockMaterials = [flat(PALETTE.rock), flat(PALETTE.rockDark)];
const woodMaterial = flat('#8a5a34');
const woodDarkMaterial = flat('#5e3d24');
const creamMaterial = flat(PALETTE.sign);
const roofRedMaterial = flat('#c9402a');
const teaRoofMaterial = flat('#4f7d28');
const cushionMaterial = flat('#c1121f');
const darkOpeningMaterial = new THREE.MeshBasicMaterial({ color: '#2a1a14' });
const fountainWaterMaterial = new THREE.MeshBasicMaterial({ color: '#69b0e0' });
const spoutMaterial = new THREE.MeshBasicMaterial({ color: '#e4f5ff' });
const lanternMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow });
const teaMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.matchaFoam });
const hedgeMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }); // Färg per block.
const plankMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
const hedgeColors = ['#5b7a2f', '#6b8a35', '#4e6a2c', '#a8602a'].map((hex) => new THREE.Color(hex));

// En form på en plats i en grupp. rotation = [x, y, z] (valfri).
function part(parent, geometry, material, x, y, z, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylinder = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides);

// En lysande text på mörk botten (kioskens skylt). Ritas utan ljus, så den "lyser".
function makeSignTexture(text) {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 80;
  const pen = image.getContext('2d');
  pen.fillStyle = '#2a1a14';
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
// Randig markis: röda och gräddvita ränder.
function makeAwningTexture() {
  const image = document.createElement('canvas');
  image.width = 128;
  image.height = 64;
  const pen = image.getContext('2d');
  for (let i = 0; i < 8; i++) {
    pen.fillStyle = i % 2 ? '#fff3d6' : '#d6402a';
    pen.fillRect(i * 16, 0, 16, 64);
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// Ljusa ringar på dammen, så att vattnet inte är en enda platt färg.
function makeWaterTexture() {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 128;
  const pen = image.getContext('2d');
  const sheen = pen.createRadialGradient(128, 64, 0, 128, 64, 128);
  sheen.addColorStop(0, '#6aa6d6');
  sheen.addColorStop(1, '#3f78ad');
  pen.fillStyle = sheen;
  pen.fillRect(0, 0, 256, 128);
  pen.strokeStyle = 'rgba(220, 240, 255, 0.35)';
  pen.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const x = 20 + Math.random() * 216;
    const y = 16 + Math.random() * 96;
    const radius = 6 + Math.random() * 16;
    pen.beginPath();
    pen.ellipse(x, y, radius, radius * 0.45, 0, Math.PI * 0.1, Math.PI * 0.9);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Fontänen mitt på torget ---
function buildFountain(local) {
  const fountain = new THREE.Group();
  fountain.position.set(PLAZA.right, 0, PLAZA.down);
  // Stenläggning under bassängen.
  part(fountain, cylinder(4.7, 4.9, 0.1, 16), stoneDarkMaterial, 0, 0.05, 0);
  // Bassängens vägg, kantlist och vatten.
  part(fountain, cylinder(3.3, 3.5, 0.6, 12), stoneMaterial, 0, 0.35, 0);
  part(fountain, new THREE.TorusGeometry(3.3, 0.26, 5, 14), stoneMaterial, 0, 0.66, 0, [Math.PI / 2, 0, 0]);
  part(fountain, new THREE.CircleGeometry(3.05, 14), fountainWaterMaterial, 0, 0.62, 0, [-Math.PI / 2, 0, 0]);
  // Pelaren, den övre skålen och strålarna ner i bassängen.
  part(fountain, cylinder(0.4, 0.55, 1.7, 8), stoneMaterial, 0, 1.45, 0);
  part(fountain, cylinder(1.35, 0.55, 0.38, 10), stoneMaterial, 0, 2.4, 0);
  part(fountain, new THREE.CircleGeometry(1.15, 10), fountainWaterMaterial, 0, 2.6, 0, [-Math.PI / 2, 0, 0]);
  part(fountain, new THREE.ConeGeometry(0.16, 0.9, 6), spoutMaterial, 0, 3.05, 0);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    // En tunn lutande stråle från skålens kant ner i vattnet.
    const stream = part(fountain, cylinder(0.05, 0.05, 2.0, 4), spoutMaterial, Math.sin(angle) * 1.7, 1.5, Math.cos(angle) * 1.7);
    stream.rotation.set(Math.cos(angle) * 0.35, 0, -Math.sin(angle) * 0.35);
  }
  local.add(fountain);
  addObstacle(PLAZA.right, PLAZA.down, 3.7, 4.8);
}

// --- Ruinpelare ---
// En pelare av staplade skivor, avbruten på höjden. skew = hur snett översta biten sitter.
function buildColumn(local, right, down, drums, mossy = false, skew = 0) {
  const column = new THREE.Group();
  column.position.set(right, 0, down);
  const material = mossy ? mossMaterial : stoneMaterial;
  part(column, box(1.4, 0.3, 1.4), stoneDarkMaterial, 0, 0.15, 0);
  for (let i = 0; i < drums; i++) {
    const drum = part(column, cylinder(0.5, 0.56, 0.7, 7), material, 0, 0.3 + 0.35 + i * 0.7, 0);
    if (i === drums - 1) { drum.rotation.z = skew; drum.scale.y = 0.7 + (skew ? 0 : 0.2); } // Den översta är bruten.
  }
  local.add(column);
  addObstacle(right, down, 0.75, 1.6);
}
// En pelare som ligger omkullvält, i två delar.
function buildFallenColumn(local, right, down, angle) {
  const fallen = new THREE.Group();
  fallen.position.set(right, 0, down);
  fallen.rotation.y = angle;
  part(fallen, cylinder(0.5, 0.5, 1.6, 7), stoneMaterial, 0, 0.48, 0, [0, 0, Math.PI / 2]);
  part(fallen, cylinder(0.46, 0.5, 1.1, 7), mossMaterial, 1.9, 0.44, 0.25, [0, 0.25, Math.PI / 2]);
  local.add(fallen);
  addObstacle(right, down, 1.0, 1.9);
  addObstacle(right + Math.cos(angle) * 1.9, down - Math.sin(angle) * 1.9, 0.7);
}

// --- Dammen med bron ---
// Vattnet ritas som vägarna (utan djuptest, i en egen ordning efter marken, före gruset), så att
// det inte flimrar mot marken och vägen över ligger ovanpå.
function buildPond(local) {
  const waterTexture = makeWaterTexture();
  const rimMaterial = new THREE.MeshBasicMaterial({ color: '#2c5a4e', depthTest: false, depthWrite: false });
  const waterMaterial = new THREE.MeshBasicMaterial({ map: waterTexture, depthTest: false, depthWrite: false });
  const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const rim = part(local, disc, rimMaterial, POND.right, 0.02, POND.down);
  rim.scale.set(POND.a + 0.6, 1, POND.b + 0.5);
  rim.renderOrder = -9.02;
  const water = part(local, disc, waterMaterial, POND.right, 0.022, POND.down);
  water.scale.set(POND.a, 1, POND.b);
  water.renderOrder = -9.01;

  // Kantstenar runt dammen (inte där bron går ut över vattnet).
  const stones = [];
  const lightColor = new THREE.Color(PALETTE.gravelLight);
  const darkColor = new THREE.Color(PALETTE.gravelDark);
  const mossColor = new THREE.Color(PALETTE.grassRoot);
  for (let i = 0; i < 70; i++) {
    const angle = (i / 70) * Math.PI * 2 + Math.random() * 0.05;
    const grow = 1.04 + Math.random() * 0.1;
    const right = POND.right + Math.cos(angle) * (POND.a + 0.35) * grow;
    const down = POND.down + Math.sin(angle) * (POND.b + 0.3) * grow;
    if (Math.abs(right - POND.right) < ROAD_WIDTH / 2 + 0.9) continue;
    const color = lightColor.clone().lerp(darkColor, Math.random());
    if (Math.random() < 0.35) color.lerp(mossColor, 0.5);
    stones.push({ x: right, z: down, size: 0.28 + Math.random() * 0.28, color });
  }
  addStoneInstances(local, stones);

  // Näckrosblad: små gröna skivor på vattnet.
  const padMaterial = new THREE.MeshBasicMaterial({ color: '#5f8f3a', depthTest: false, depthWrite: false });
  const padGeometry = new THREE.CircleGeometry(0.4, 7).rotateX(-Math.PI / 2);
  [[-5.2, 0.8, 1], [-4.2, 1.6, 0.7], [4.8, -0.9, 1.1], [5.9, 0.4, 0.8], [3.6, 1.8, 0.7], [-6.4, -1.0, 0.8]].forEach(([dx, dz, size], i) => {
    const pad = part(local, padGeometry, padMaterial, POND.right + dx, 0.024, POND.down + dz);
    pad.scale.setScalar(size);
    pad.rotation.y = i;
    pad.renderOrder = -9.005;
  });

  // Vattnet är ett hinder för bilen utom där bron går: cirklar på var sida om bron.
  for (const side of [-1, 1]) {
    addObstacle(POND.right + side * 5.7, POND.down, 2.8);
    addObstacle(POND.right + side * 7.6, POND.down, 1.5);
  }

  // Bron: ett plant däck strax över marken (bilen kör kvar på y = 0), med räcken bara på sidorna.
  const bridge = new THREE.Group();
  const from = POND.down - POND.b - BRIDGE_MARGIN;
  const to = POND.down + POND.b + BRIDGE_MARGIN;
  const length = to - from;
  const plankStep = 0.62;
  const planks = Math.ceil(length / plankStep);
  const deck = new THREE.InstancedMesh(box(ROAD_WIDTH, 0.1, plankStep - 0.07), plankMaterial, planks);
  const matrix = new THREE.Matrix4();
  const woodColor = new THREE.Color('#8a5a34');
  for (let i = 0; i < planks; i++) {
    matrix.makeTranslation(POND.right, 0.005, from + (i + 0.5) * (length / planks));
    deck.setMatrixAt(i, matrix);
    deck.setColorAt(i, woodColor.clone().multiplyScalar(0.8 + Math.random() * 0.4));
  }
  deck.instanceMatrix.needsUpdate = true;
  deck.instanceColor.needsUpdate = true;
  deck.frustumCulled = false;
  bridge.add(deck);
  const railX = ROAD_WIDTH / 2 + 0.55; // Utanför vägkantens stenar: räcket stör aldrig körfältet.
  for (const side of [-1, 1]) {
    const x = POND.right + side * railX;
    part(bridge, box(0.16, 0.16, length), woodDarkMaterial, x, 0.95, (from + to) / 2);
    part(bridge, box(0.12, 0.12, length), woodDarkMaterial, x, 0.5, (from + to) / 2);
    const posts = Math.round(length / 2.3) + 1;
    for (let i = 0; i < posts; i++) part(bridge, box(0.2, 1.1, 0.2), woodMaterial, x, 0.5, from + 0.1 + (i / (posts - 1)) * (length - 0.2));
  }
  local.add(bridge);
}

// --- Kiosken (drive-in) vid första skylten ---
export const KIOSK = { right: -21.2, down: 3.6 };
function buildKiosk(local) {
  const kiosk = new THREE.Group();
  kiosk.position.set(KIOSK.right, 0, KIOSK.down);
  part(kiosk, box(3.2, 0.25, 2.3), woodDarkMaterial, 0, 0.12, 0); // Sockel.
  part(kiosk, box(3.0, 2.0, 2.1), creamMaterial, 0, 1.25, 0);     // Huset.
  part(kiosk, box(3.5, 0.18, 2.6), roofRedMaterial, 0, 2.34, 0.1); // Taket.
  part(kiosk, box(2.2, 0.85, 0.08), darkOpeningMaterial, 0, 1.55, 1.07); // Luckan.
  part(kiosk, box(2.8, 0.1, 0.55), woodMaterial, 0, 1.08, 1.3);          // Disken.
  // Markisen: ett randigt plan som lutar ner framåt (mot kameran).
  const awning = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 1.4),
    new THREE.MeshLambertMaterial({ map: makeAwningTexture(), side: THREE.DoubleSide })
  );
  awning.position.set(0, 1.95, 1.75);
  awning.rotation.x = -1.107;
  kiosk.add(awning);
  // Den lysande skylten ovanpå, på två stolpar.
  for (const side of [-1, 1]) part(kiosk, box(0.1, 0.8, 0.1), woodDarkMaterial, side * 1.1, 2.7, 0.2);
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.85), new THREE.MeshBasicMaterial({ map: makeSignTexture('SNACKS') }));
  signBoard.position.set(0, 3.15, 0.3);
  signBoard.rotation.x = -0.45; // Lutar bakåt, som skyltarna (se SCREEN_TILT).
  kiosk.add(signBoard);
  // Två pallar framför disken.
  for (const side of [-1, 1]) {
    part(kiosk, cylinder(0.24, 0.24, 0.12, 8), cushionMaterial, side * 1.0, 0.55, 2.6);
    part(kiosk, cylinder(0.05, 0.05, 0.5, 5), woodDarkMaterial, side * 1.0, 0.27, 2.6);
  }
  // Det varma skenet på marken framför (fejkat ljus, se lamps.js).
  const glowMaterial = makeGlowMaterial(0.55);
  glowMaterial.color.set(PALETTE.warmLamp);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 6).rotateX(-Math.PI / 2), glowMaterial);
  glow.position.set(0, 0.1, 2.3);
  glow.userData.noShadow = true;
  kiosk.add(glow);
  local.add(kiosk);
  for (const dx of [-1, 0, 1]) addObstacle(KIOSK.right + dx * 1.0, KIOSK.down, 1.4, dx === 0 ? 2.6 : 0);
}

// --- Tehuset: ett öppet paviljongtak med matchagrönt tak och en låg tebord ---
export const TEAHOUSE = { right: -36, down: 26 };
function buildTeaHouse(local) {
  const house = new THREE.Group();
  house.position.set(TEAHOUSE.right, 0, TEAHOUSE.down);
  part(house, box(5.6, 0.25, 4.6), woodMaterial, 0, 0.125, 0); // Golvet.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(house, box(0.24, 2.4, 0.24), woodDarkMaterial, sx * 2.4, 1.45, sz * 1.9);
  part(house, box(5.2, 0.18, 0.2), woodDarkMaterial, 0, 2.55, 1.9);
  part(house, box(5.2, 0.18, 0.2), woodDarkMaterial, 0, 2.55, -1.9);
  part(house, box(0.2, 0.18, 4.2), woodDarkMaterial, 2.4, 2.55, 0);
  part(house, box(0.2, 0.18, 4.2), woodDarkMaterial, -2.4, 2.55, 0);
  // Taket: en fyrsidig kon, vriden så att sidorna följer huset.
  const roof = part(house, new THREE.ConeGeometry(4.3, 1.7, 4), teaRoofMaterial, 0, 3.5, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.85;
  part(house, new THREE.ConeGeometry(0.28, 0.5, 6), woodDarkMaterial, 0, 4.55, 0);
  // Bordet, kuddarna, tekannan och kopparna.
  part(house, box(1.7, 0.32, 1.0), woodDarkMaterial, 0, 0.42, 0);
  for (const [x, z] of [[-1.5, 0], [1.5, 0], [0, 1.2], [0, -1.2]]) part(house, box(0.7, 0.14, 0.7), cushionMaterial, x, 0.32, z);
  part(house, new THREE.SphereGeometry(0.28, 7, 5), teaRoofMaterial, 0.1, 0.74, 0);
  for (const x of [-0.55, 0.65]) part(house, cylinder(0.14, 0.1, 0.16, 7), teaMaterial, x, 0.66, 0.15);
  // Lyktor i framhörnen.
  for (const sx of [-1, 1]) part(house, box(0.3, 0.4, 0.3), lanternMaterial, sx * 2.4, 2.1, 2.1);
  local.add(house);
  for (const dx of [-1.7, 0, 1.7]) addObstacle(TEAHOUSE.right + dx, TEAHOUSE.down, 1.6, dx === 0 ? 3.4 : 0);
}

// --- Häckar: rader av lågpoly-block i höstfärger ---
const hedgeGeometry = new THREE.BoxGeometry(1.5, 0.95, 1.1);
function buildHedges(local, hedges) {
  const blocks = [];
  for (const [right, down, length, angle] of hedges) {
    const count = Math.max(1, Math.round(length / 1.4));
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5 - count / 2) * (length / count);
      blocks.push({ x: right + Math.cos(angle) * along, z: down - Math.sin(angle) * along, angle, wobble: Math.random() });
    }
    for (let along = -length / 2 + 0.7; along <= length / 2 - 0.7 + 0.01; along += 2.0) {
      addObstacle(right + Math.cos(angle) * along, down - Math.sin(angle) * along, 0.85);
    }
  }
  const mesh = new THREE.InstancedMesh(hedgeGeometry, hedgeMaterial, blocks.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  blocks.forEach((block, i) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), block.angle + (block.wobble - 0.5) * 0.12);
    const height = 0.85 + block.wobble * 0.4;
    scale.set(1.04, height, 1);
    spot.set(block.x, 0.475 * height, block.z);
    matrix.compose(spot, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, hedgeColors[Math.floor(Math.random() * 3.99)]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  local.add(mesh);
}

// --- Stenhögar: tre till fem kantiga stenar ihop ---
const boulderGeometry = new THREE.IcosahedronGeometry(1, 0);
function buildRocks(local, clusters) {
  for (const [right, down, count, size] of clusters) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + right;
      const reach = i === 0 ? 0 : size * (0.9 + (i % 2) * 0.3);
      const s = size * (i === 0 ? 1 : 0.5 + 0.35 * ((i * 37) % 3) / 2);
      const rock = part(local, boulderGeometry, rockMaterials[i % 2], right + Math.cos(angle) * reach, s * 0.45, down + Math.sin(angle) * reach);
      rock.scale.set(s, s * 0.75, s * 0.9);
      rock.rotation.y = i * 1.7 + right;
    }
    addObstacle(right, down, size * 1.5, size * 2.2);
  }
}

// Bygger allt i hemvärlden. Körs före optimizeWorld (se main.js), så att allt slås ihop.
export function buildHubProps() {
  hubPropObstacles.length = 0;
  hubPropShadows.length = 0;
  const local = new THREE.Group();
  const base = hubPoint(0, 0);
  local.position.set(base.x, 0, base.z);
  local.rotation.y = BILLBOARD_FACING;
  worldGroup(WORLDS.hub).add(local);

  buildFountain(local);
  // Fyra pelare på torgets ö, en grind av två vid stickvägen och en omkullvält.
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 8 + (i * Math.PI) / 2;
    buildColumn(local, PLAZA.right + Math.sin(angle) * 4.8, PLAZA.down - Math.cos(angle) * 4.8, 2 + (i % 2), i % 2 === 1, i * 0.05);
  }
  buildColumn(local, 4.6, 24.6, 4);
  buildColumn(local, -4.6, 24.6, 2, true, 0.12);
  buildFallenColumn(local, -8.2, 22, 0.5);
  buildPond(local);
  buildKiosk(local);
  buildTeaHouse(local);
  buildHedges(local, [
    [-39, 32.5, 12, 0],      // Bakom tehuset.
    [-8.5, -4.6, 6.4, 0],    // Bakom skyltraden, i luckorna mellan skyltarna.
    [5.6, -4.6, 6.4, 0],
    [19.8, -4.6, 6.4, 0],
    [-22.6, -4.6, 6.4, 0],
    [14.5, 21, 8, 0],        // Vid Programming-vägen.
    [-9.5, 49.5, 9, 0.15],   // Nedanför torget.
    [10.5, 48.5, 7, -0.15],
  ]);
  buildRocks(local, [
    [29, 20, 4, 0.9], [-30, 38, 5, 1.0], [-43, 21, 3, 0.8], [8, 53, 4, 0.9],
    [44, 20, 4, 1.0], [-24, 55, 3, 0.8], [30, 47, 4, 0.9],
  ]);
}
