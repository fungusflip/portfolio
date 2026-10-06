// ============================================================================
// roads.js — grusvägar. Alla världar bygger sina vägar med buildRoads.
// ============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE, MAX_ANISOTROPY, worldGroup, towardCamera } from './core.js';
import { billboards, PAD_DISTANCE, BAY_WIDTH, BAY_LENGTH } from './billboards.js';
import { makeGravelImage } from './gravel.js';

export const ROAD_WIDTH = 5;  // Vägarnas bredd i enheter.
const ROAD_EDGE = 0.5;        // Marginal runt en väg (kantsten + lite luft) där inga stenar läggs.
// Hur långt framför skyltraden huvudvägens mitt ligger (nedanför parkeringsfickorna).
export const ROAD_DISTANCE = PAD_DISTANCE + 6.5;

// --- Gruset: en liten bild som upprepas som kakelplattor ---
const GRAVEL_PIXELS = 256; // Bildens storlek i pixlar.
const GRAVEL_UNITS = 4;    // Hur stor en kopia av bilden blir på vägen, i enheter.
const gravelImage = makeGravelImage(GRAVEL_PIXELS);
const gravelTexture = new THREE.CanvasTexture(gravelImage);
gravelTexture.colorSpace = THREE.SRGBColorSpace;
gravelTexture.wrapS = THREE.RepeatWrapping;
gravelTexture.wrapT = THREE.RepeatWrapping;
gravelTexture.anisotropy = MAX_ANISOTROPY;

// --- Lager på marken (mot flimmer) ---
// Mark, vägar och parkeringsfickor ligger nästan på samma höjd. Då kan grafikkortet
// inte avgöra vilken som är överst, och de flimrar ("z-fighting"). Lösningen:
//   renderOrder = i vilken ordning saker ritas. Lägre tal ritas först.
//   depthTest: false på lagren ovanpå = "rita alltid över det som redan finns".
// Marken ritas först (-10), sedan vägkanter (-9), grus (-8) och asfalt (-5). Allt annat
// (bil, träd, hus) har renderOrder 0, ritas efteråt och hamnar ovanpå som vanligt.
const gravelMaterial = new THREE.MeshLambertMaterial({ map: gravelTexture, depthTest: false, depthWrite: false });

// Bygger ett lager av en väg: en rak bit och en rund platta i varje ände, så att ändarna
// blir runda och vägar som möts får en mjuk skarv.
// height = höjd över marken, order = renderOrder.
function addRoadLayer(group, road, width, material, height, order) {
  const dx = road.to.x - road.from.x;
  const dz = road.to.z - road.from.z;
  const length = Math.hypot(dx, dz);
  const strip = new THREE.PlaneGeometry(width, length);
  strip.rotateX(-Math.PI / 2); // Lägg ner formen på marken. Längden går nu längs Z.
  const cap = new THREE.CircleGeometry(width / 2, 24);
  cap.rotateX(-Math.PI / 2);
  // uv = vilken del av texturen varje hörn visar. Gångrar man talen upprepas texturen,
  // så att stenarna blir lika stora på alla vägar.
  for (const [geometry, across, along] of [[strip, width, length], [cap, width, width]]) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (across / GRAVEL_UNITS), uv.getY(i) * (along / GRAVEL_UNITS));
    }
  }
  const stripMesh = new THREE.Mesh(strip, material);
  stripMesh.position.set((road.from.x + road.to.x) / 2, height, (road.from.z + road.to.z) / 2);
  stripMesh.rotation.y = Math.atan2(dx, dz); // Längden pekar från start till mål.
  stripMesh.renderOrder = order;
  group.add(stripMesh);
  for (const end of [road.from, road.to]) {
    const capMesh = new THREE.Mesh(cap, material);
    capMesh.position.set(end.x, height, end.z);
    // Ändarna ritas alltid strax EFTER den raka biten, annars kan de flimra om vartannat.
    capMesh.renderOrder = order + 0.001;
    group.add(capMesh);
  }
}

// Bygger en lista med vägar i en värld. Varje väg: { from: {x, z}, to: {x, z}, width? }.
// width utelämnad = ROAD_WIDTH.
export function buildRoads(world, roads) {
  const group = worldGroup(world);
  roads.forEach((road, i) => {
    const width = road.width || ROAD_WIDTH;
    // Gruset ovanpå. Varje väg ritas strax efter den förra (-8, -7.99, ...), så att det
    // alltid är samma väg som ligger överst där två korsar varandra.
    addRoadLayer(group, road, width, gravelMaterial, 0.012 + i * 0.003, -8 + i * 0.01);
  });
  buildCurbs(world, group, roads);
  buildEdgeStones(world, group, roads);
}

// --- Kantsten: en rad rundade stenblock runt ALLA vägkanter ---
// Ersätter den platta mörka kantlinjen med en riktig 3D-form som fångar ljus och skugga.
//  * Längs varje väg, hela vägen. I en korsning fortsätter blocken ända fram till den andra
//    vägens grus och möts med dess kantsten i ett hörn (inga glipor och inga hårda kanter).
//  * Runt vägens runda, döda ände (och tonar ut till marken sista biten).
//  * Runt hela parkeringsfickan: två långsidor, de rundade hörnen och kortsidan.
const CURB_WIDTH = 0.34;   // Blockets bredd (tvärs över kanten).
const CURB_HEIGHT = 0.17;  // Hur högt blocket står.
const CURB_LENGTH = 0.72;  // Blockets längd längs kanten.
const CURB_STEP = 0.74;    // Avstånd mellan blockens mitt (lite större än längden = en tunn fog).
const curbGeometry = new RoundedBoxGeometry(CURB_WIDTH, CURB_HEIGHT, CURB_LENGTH, 2, 0.045);
const curbMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });

// En bit kantsten är en linje av punkter [{ x, z }, ...] där blocken ska stå. curbRun lägger bara
// upp biten; fixCorners räknar ut hörnen mellan bitarna och placeRun sätter sedan ut blocken.
function curbRun(points, runs, fade, thin) {
  if (points.length >= 2) runs.push({ points, fade, thin, startExtend: 0, endExtend: 0 });
}

// Där två bitar möts i ett hörn (nästan 90 grader) går blocken över varandra. Ett av dem får fylla
// hörnet (biten förlängs CURB_WIDTH / 2 förbi hörnpunkten) och det andra förkortas lika mycket, så
// att det stannar mot det första blockets sida. Vilket som fyller avgörs av riktningen, så det blir
// alltid samma val. Blocken fördelas sedan jämnt över den justerade biten (inga glipor).
function fixCorners(runs) {
  const half = CURB_WIDTH / 2;
  const direction = (from, to) => {
    const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    return { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
  };
  const ends = [];
  for (const run of runs) {
    const p = run.points;
    ends.push({ run, key: 'startExtend', point: p[0], out: direction(p[1], p[0]) });
    ends.push({ run, key: 'endExtend', point: p[p.length - 1], out: direction(p[p.length - 2], p[p.length - 1]) });
  }
  const used = new Set();
  for (let i = 0; i < ends.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < ends.length; j++) {
      if (used.has(j) || ends[j].run === ends[i].run) continue;
      const a = ends[i];
      const b = ends[j];
      if (Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z) > 0.2) continue;
      if (Math.abs(a.out.x * b.out.z - a.out.z * b.out.x) < 0.5) continue; // Inte ett hörn (nästan parallella).
      const aFills = Math.atan2(a.out.z, a.out.x) > Math.atan2(b.out.z, b.out.x);
      (aFills ? a : b).run[(aFills ? a : b).key] = half;
      (aFills ? b : a).run[(aFills ? b : a).key] = -half;
      used.add(i);
      used.add(j);
      break;
    }
  }
}

// Sätter ut blocken längs en bit: lika långt mellan dem, första och sista blocket i bitens (justerade)
// ändar. Ett hörn förlänger (+) eller förkortar (-) biten i en ände (se fixCorners).
function placeRun(run, blocks) {
  const points = run.points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const total = lengths[lengths.length - 1];
  const begin = -run.startExtend;       // Var på biten blocken börjar (minus = före första punkten).
  const finish = total + run.endExtend; // ...och var de slutar (över total = förbi sista punkten).
  const span = finish - begin;
  const distances = [];
  const usable = span - CURB_LENGTH;
  if (usable <= 0.05) {
    distances.push(begin + span / 2); // En kort bit: ett enda block mitt på.
  } else {
    const count = Math.max(1, Math.ceil(usable / (CURB_LENGTH * 0.95))); // Aldrig glesare än blockets längd.
    for (let k = 0; k <= count; k++) distances.push(begin + CURB_LENGTH / 2 + (usable * k) / count);
  }
  let segment = 0;
  for (const at of distances) {
    while (segment < points.length - 2 && lengths[segment + 1] < at) segment++;
    const from = points[segment];
    const to = points[segment + 1];
    const length = lengths[segment + 1] - lengths[segment] || 1;
    const k = (at - lengths[segment]) / length; // Utan begränsning: förbi ändarna räknas linjen vidare.
    blocks.push({
      x: from.x + (to.x - from.x) * k,
      z: from.z + (to.z - from.z) * k,
      yaw: Math.atan2(to.x - from.x, to.z - from.z) + (Math.random() - 0.5) * 0.05,
      fade: run.fade,
      thin: run.thin,
    });
  }
}

// Parkeringsfickorna i en värld: var de ligger och åt vilket håll vägen är (u, enhetsvektor från fickan
// ut mot uppfarten). Används av kantstenen här och av gräset (hub.js).
export function bayFrames(world, roads) {
  const bays = [];
  for (const billboard of billboards.filter((entry) => entry.project.world === world)) {
    const driveway = roads.find((road) => Math.hypot(road.to.x - billboard.padX, road.to.z - billboard.padZ) < 0.05);
    if (!driveway) continue;
    const ux = driveway.from.x - billboard.padX;
    const uz = driveway.from.z - billboard.padZ;
    const length = Math.hypot(ux, uz);
    bays.push({ x: billboard.padX, z: billboard.padZ, ux: ux / length, uz: uz / length });
  }
  return bays;
}

function buildCurbs(world, group, roads) {
  const bays = bayFrames(world, roads);
  const inBay = (x, z) => bays.some((bay) => Math.hypot(x - bay.x, z - bay.z) < BAY_LENGTH / 2 + 0.2);
  // Hela vägnätets yttre kontur. Varje väg är en "kapsel" (rak bit med runda ändar). Kantstenens
  // mittlinje är kapselns omkrets en bit utanför gruset. En punkt på omkretsen räknas bara om den
  // inte ligger inne i någon annan vägs kapsel, så får man exakt unionens yttre kant: kantstenen
  // går runt hörn, korsningar och runda ändar utan glipor. (En punkt som ligger exakt på en
  // tidigare vägs omkrets, t.ex. en delad rund skarv, tas bara med en gång.)
  const CURB_OFFSET = CURB_WIDTH / 2 - 0.02;
  const SAMPLE = 0.06;
  const blocks = [];
  const runs = []; // Alla bitar av kantsten. Hörnen lagas (fixCorners) innan blocken sätts ut (placeRun).
  roads.forEach((road, i) => {
    const width = road.width || ROAD_WIDTH;
    const thin = width < ROAD_WIDTH; // Gångvägen får lägre, smalare kantsten.
    const radius = width / 2 + CURB_OFFSET;
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    const heading = Math.atan2(dz, dx); // Vinkel i x/z-planet: x = cos, z = sin.
    // Kapselns hela omkrets som tätt tuggade punkter, medsols.
    const outline = [];
    const at = (center, angle) => ({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
    const sideSteps = Math.max(1, Math.ceil(length / SAMPLE));
    const arcSteps = Math.max(8, Math.ceil(Math.PI * radius / SAMPLE));
    for (let k = 0; k <= sideSteps; k++) { // Ena sidan: från start till mål.
      const t = k / sideSteps;
      outline.push(at({ x: road.from.x + dx * t, z: road.from.z + dz * t }, heading + Math.PI / 2));
    }
    for (let k = 1; k < arcSteps; k++) outline.push(at(road.to, heading + Math.PI / 2 - (k / arcSteps) * Math.PI)); // Änden vid målet.
    for (let k = 0; k <= sideSteps; k++) { // Andra sidan: från mål tillbaka till start.
      const t = 1 - k / sideSteps;
      outline.push(at({ x: road.from.x + dx * t, z: road.from.z + dz * t }, heading - Math.PI / 2));
    }
    for (let k = 1; k < arcSteps; k++) outline.push(at(road.from, heading - Math.PI / 2 - (k / arcSteps) * Math.PI)); // Änden vid start.
    // Vilka punkter är en del av den yttre konturen?
    const kept = outline.map((point) => {
      if (inBay(point.x, point.z)) return false;
      for (let j = 0; j < roads.length; j++) {
        if (j === i) continue;
        const otherRadius = (roads[j].width || ROAD_WIDTH) / 2 + CURB_OFFSET;
        const distance = distanceToRoad(point.x, point.z, roads[j]);
        if (distance < otherRadius - 0.01) return false;                 // Inne i en annan väg.
        if (j < i && Math.abs(distance - otherRadius) < 0.02) return false; // Samma kant som en tidigare väg har redan.
      }
      return true;
    });
    // Dela upp i sammanhängande bitar. Börja efter en bortvald punkt, så att en bit inte klipps
    // mitt i där omkretsen "går runt" från slutet till början.
    let origin = kept.indexOf(false);
    if (origin === -1) origin = 0; // Hela kapseln syns (en ensam väg): börja var som helst.
    let run = [];
    for (let step = 0; step <= outline.length; step++) {
      const index = (origin + step) % outline.length;
      if (step < outline.length && kept[index]) {
        run.push(outline[index]);
      } else {
        curbRun(run, runs, 1, thin);
        run = [];
      }
    }
  });

  fixCorners(runs);
  for (const run of runs) placeRun(run, blocks);
  // Uppfartens kantsten slutar i en "sista backe": höjden sjunker mjukt ner till marken och är noll vid
  // fickans mynning (3.3 enheter från fickans mitt), full höjd 6.3 enheter ut. Inga stenar runt själva fickan.
  for (const block of blocks) {
    for (const bay of bays) {
      const k = THREE.MathUtils.clamp((Math.hypot(block.x - bay.x, block.z - bay.z) - 3.3) / 3, 0, 1);
      block.fade = Math.min(block.fade, k * k * (3 - 2 * k)); // Mjuk S-kurva.
    }
  }
  for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].fade < 0.12) blocks.splice(i, 1);

  // Gallra: behåll bara block som ligger minst CURB_MIN_GAP från ett redan behållet. Annars går
  // stenar över varandra där två bitar möts (hörn, skarvar, fickans hopp mot uppfarten).
  // Ett rutnät med rutor lika stora som avståndet gör sökningen snabb.
  const CURB_MIN_GAP = 0.36;
  const grid = new Map();
  const keptBlocks = [];
  for (const block of blocks) {
    const cellX = Math.floor(block.x / CURB_MIN_GAP);
    const cellZ = Math.floor(block.z / CURB_MIN_GAP);
    let crowded = false;
    for (let gx = cellX - 1; gx <= cellX + 1 && !crowded; gx++) {
      for (let gz = cellZ - 1; gz <= cellZ + 1 && !crowded; gz++) {
        for (const other of grid.get(gx + ',' + gz) || []) {
          if (Math.hypot(other.x - block.x, other.z - block.z) >= CURB_MIN_GAP) continue;
          // Bara block som pekar åt ungefär samma håll är dubbletter. Block som möts i ett
          // hörn (t.ex. 90 grader) ska båda stå kvar, annars blir det ett hack i hörnet.
          const turn = Math.abs(Math.atan2(Math.sin(other.yaw - block.yaw), Math.cos(other.yaw - block.yaw)));
          if (turn < 0.35 || turn > Math.PI - 0.35) { crowded = true; break; }
        }
      }
    }
    if (crowded) continue;
    const key = cellX + ',' + cellZ;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(block);
    keptBlocks.push(block);
  }
  blocks.length = 0;
  blocks.push(...keptBlocks);

  if (blocks.length === 0) return;
  const mesh = new THREE.InstancedMesh(curbGeometry, curbMaterial, blocks.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const stone = new THREE.Color();
  const base = new THREE.Color(PALETTE.gravelDark);
  blocks.forEach((block, index) => {
    quaternion.setFromAxisAngle(up, block.yaw);
    const height = (0.85 + Math.random() * 0.3) * block.fade * (block.thin ? 0.7 : 1);
    scale.set(block.thin ? 0.75 : 1, height, 1);
    // Nedsänkt så att botten ligger under marken (inga glipor).
    spot.set(block.x, CURB_HEIGHT * height / 2 - 0.03, block.z);
    matrix.compose(spot, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    stone.copy(base).multiplyScalar(0.95 + Math.random() * 0.3); // Olika nyans för varje block.
    mesh.setColorAt(index, stone);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
}

// --- Stenar längs vägkanterna: ger vägen en riktig kant som går över i gräset ---
// Små, halvt nedgrävda stenar i två rader: några större precis vid kanten och en spridning
// av småsten längre ut. Allt är EN InstancedMesh (en form som ritas på tusentals platser).
const STONE_SPACING = 0.42;   // Ungefärligt avstånd mellan stenplatserna längs vägen.
const STONE_DEAD_END = 4.2;   // Inga stenar så här nära en vägs döda ände (parkeringsfickor, grottor, garage).
const stoneGeometry = new THREE.IcosahedronGeometry(1, 1);
{
  // Knuffa varje hörn lite åt ett slumpat håll, så att stenen inte blir en perfekt boll.
  // Hörnen delas av flera trianglar, så förskjutningen sparas per plats (annars spricker formen).
  const offsets = new Map();
  const position = stoneGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => v.toFixed(3)).join(',');
    if (!offsets.has(key)) offsets.set(key, 0.82 + Math.random() * 0.3);
    const scale = offsets.get(key);
    position.setXYZ(i, position.getX(i) * scale, position.getY(i) * scale, position.getZ(i) * scale);
  }
  stoneGeometry.computeVertexNormals();
}
const stoneMaterial = new THREE.MeshLambertMaterial({ flatShading: true });

function buildEdgeStones(world, group, roads) {
  const pads = billboards.filter((billboard) => billboard.project.world === world).map((billboard) => ({ x: billboard.padX, z: billboard.padZ }));
  // En väg som slutar mitt i en annan är en korsning. Alla andra ändar är döda ändar.
  const deadEnds = [];
  roads.forEach((road, i) => {
    for (const end of [road.from, road.to]) {
      const joined = roads.some((other, j) => j !== i && distanceToRoad(end.x, end.z, other) < 0.6);
      if (!joined) deadEnds.push(end);
    }
  });
  const stones = [];
  const lightColor = new THREE.Color(PALETTE.gravelLight);
  const darkColor = new THREE.Color(PALETTE.gravelDark);
  const mossColor = new THREE.Color(PALETTE.grassRoot);
  roads.forEach((road, i) => {
    const width = road.width || ROAD_WIDTH;
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    const alongX = dx / length;
    const alongZ = dz / length;
    const scaleFactor = Math.min(1, 0.4 + width / ROAD_WIDTH * 0.6); // Smala gångvägar får mindre stenar.
    for (let t = 0; t < length; t += STONE_SPACING * (0.6 + Math.random() * 0.8)) {
      for (const side of [-1, 1]) {
        // Två rader: stora vid kanten (ofta) och småsten längre ut (ibland).
        for (const row of [0, 1]) {
          if (Math.random() > (row === 0 ? 0.6 : 0.45)) continue;
          const offset = width / 2 + (row === 0 ? 0.42 + Math.random() * 0.3 : 0.6 + Math.random() * 0.9);
          const x = road.from.x + alongX * t - alongZ * offset * side;
          const z = road.from.z + alongZ * t + alongX * offset * side;
          // Hoppa över platser som hamnar på en annan väg, vid en parkeringsficka eller en död ände.
          if (roads.some((other, j) => j !== i && distanceToRoad(x, z, other) < (other.width || ROAD_WIDTH) / 2 + ROAD_EDGE + 0.15)) continue;
          if (pads.some((pad) => Math.hypot(x - pad.x, z - pad.z) < STONE_DEAD_END)) continue;
          if (deadEnds.some((end) => Math.hypot(x - end.x, z - end.z) < STONE_DEAD_END)) continue;
          const size = (row === 0 ? 0.11 + Math.random() * 0.12 : 0.05 + Math.random() * 0.07) * scaleFactor;
          const color = lightColor.clone().lerp(darkColor, Math.random());
          if (Math.random() < 0.18) color.lerp(mossColor, 0.5); // Några mossiga.
          stones.push({ x, z, size, color });
        }
      }
    }
  });
  addStoneInstances(group, stones);
}

// Ritar en lista med stenar { x, z, size, color } som EN InstancedMesh i gruppen.
// Används också av grounding.js (stenar vid träd, skyltar och grottor).
export function addStoneInstances(group, stones) {
  if (stones.length === 0) return;
  const mesh = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stones.length);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const spot = new THREE.Vector3();
  stones.forEach((stone, index) => {
    rotation.set(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI);
    quaternion.setFromEuler(rotation);
    // Tillplattad (y mindre) och halvt nedsjunken i marken.
    scale.set(stone.size * (0.9 + Math.random() * 0.5), stone.size * (0.5 + Math.random() * 0.35), stone.size * (0.9 + Math.random() * 0.5));
    spot.set(stone.x, stone.size * 0.12, stone.z);
    matrix.compose(spot, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, stone.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  group.add(mesh);
}

// En kort infart från huvudvägen in till varje skylts parkeringsficka i en värld.
export function billboardDriveways(world) {
  return billboards
    .filter((billboard) => billboard.project.world === world)
    .map((billboard) => ({
      from: towardCamera(billboard.project, ROAD_DISTANCE),
      to: { x: billboard.padX, z: billboard.padZ },
    }));
}

// Avståndet från en punkt (x, z) till närmaste ställe på en väg (för att hålla träd borta).
export function distanceToRoad(x, z, road) {
  const dx = road.to.x - road.from.x;
  const dz = road.to.z - road.from.z;
  // t = hur långt längs vägen den närmaste punkten ligger: 0 = starten, 1 = målet.
  const t = THREE.MathUtils.clamp(((x - road.from.x) * dx + (z - road.from.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (road.from.x + dx * t), z - (road.from.z + dz * t));
}
