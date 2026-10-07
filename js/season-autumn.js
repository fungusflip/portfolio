// ============================================================================
// season-autumn.js — höstens egna tillägg i hemvärlden (september–november). Hösten är spelets vanliga
// utseende, så allt här LÄGGS TILL ovanpå: morgondimma i lågpunkter, mer lövfall vid träden, löv som
// virvlar bakom bilen, lera och blöta löv vid vägkanterna, svamp vid trädrötter och stenar,
// flyttfåglar i V-formation, skördeprylar vid stugan och en varmare sol. Allt byggs procedurellt.
// ============================================================================
// Hämtas av seasonfx.js (hook-API) när configen har modules.autumn. Under Halloween (regeln 'halloween') gör
// den ingenting, om inte configen säger det: config.autumn = { duringHalloween: true } i en regel i
// season.js. Utanför hösten laddas filen aldrig. Rör inte Halloween-koden (seasonfx.js) och inte
// trädkronornas färg eller lövhögarna (de ligger i season.js / leaves.js).
// Allt som kan justeras ligger i AUTUMN nedan (och kan skrivas över med config.autumn).
import * as THREE from 'three';
import { BILLBOARD_FACING, DRIVE_RADIUS, HUB_X, HUB_Z, currentWorld, keyLight } from './core.js';
import { PROJECTS } from './projects.js';
import { PORTALS } from './portals.js';
import { ROAD_WIDTH, distanceToRoad } from './roads.js';
import { HOME_X, HOME_Z, CABIN_X, CABIN_Z, hubPoint, teaCupSpots } from './home.js';
import { distanceToWater } from './hubprops.js';
import { addObstacles, overlapsObstacle } from './collision.js';
import { markMoving } from './optimize.js';
import { wind } from './leaves.js';
import { car, speed } from './car.js';
import { getSeasonState } from './season.js';
import { hub, hubGroup, seededRandom, canvasTexture, addUpdater, spotOk } from './seasonkit.js';


// --- Inställningar (ÄNDRA HÄR) ---
const AUTUMN = {
  duringHalloween: false,   // true = kör även när Halloween-regeln gäller (default av).
  sunColor: '#ffa868',      // Solens färg dras en bit mot den här (varmare, lägre sol).
  sunWarmth: 0.28,          // 0 = ingen ändring, 1 = helt den färgen.
  fogBanks: 11,             // Antal dimbankar (tak).
  fogOpacity: 0.34,         // Hur tät dimman är som mest.
  fogLifetime: 150,         // Sekunder (spelad tid) tills dimman tunnats till ca en tredjedel.
  fogColor: '#dcd9cc',
  treeLeaves: 70,           // Fallande löv nära träden.
  swirlLeaves: 56,          // Löv som virvlar bakom bilen.
  mudPatches: 22,
  wetLeafPatches: 36,
  mushroomTrees: 24,        // Antal träd som får svampar vid foten.
  geese: 7,                 // Gäss i en V-formation.
  geeseFirstAfter: 12,      // Sekunder till första flocken.
  geeseEvery: [45, 90],     // Sekunder mellan flockarna (min, max).
  harvest: true,
};

const LEAF_COLORS = ['#c8501a', '#d88a22', '#e0b030', '#9a3a1a', '#8a6a2a', '#b8651e'];

let active = false;

// Ett löv: en ruta med spetsiga ändar (samma form som löven i seasonfx.js).
function leafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.lineTo(0.32, 0);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.32, 0);
  return new THREE.ShapeGeometry(shape);
}

// Ligger platsen på en väg (med lite marginal)?
function onRoad(x, z, roads, margin) {
  return roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + margin);
}
function insideWorld(x, z) {
  return Math.hypot(x - HUB_X, z - HUB_Z) < DRIVE_RADIUS - 6;
}
function nearPortalOrSign(x, z, gap) {
  if (PORTALS.some((portal) => portal.world === hub && Math.hypot(x - portal.door.x, z - portal.door.z) < gap + 4)) return true;
  return PROJECTS.some((project) => project.world === hub && Math.hypot(x - project.x, z - project.z) < gap);
}

// ============================================================================
// Varmare, lägre sol
// ============================================================================
function buildWarmSun() {
  keyLight.color.lerp(new THREE.Color(AUTUMN.sunColor), AUTUMN.sunWarmth);
}

// ============================================================================
// Morgondimma i lågpunkter (vid dammen och bäcken). Tunnas ut över tid och över förmiddagen.
// ============================================================================
function buildFogBanks() {
  const texture = canvasTexture(128, (pen, size) => {
    const gradient = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pen.fillStyle = gradient;
    pen.fillRect(0, 0, size, size);
  });
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const random = seededRandom(9021);
  const spots = [];
  const pond = hubPoint(-26.5, 29.2); // Dammen (hubprops.js).
  for (let i = 0; i < 4; i++) spots.push({ x: pond.x + (random() - 0.5) * 12, z: pond.z + (random() - 0.5) * 7 });
  for (let attempt = 0; attempt < 400 && spots.length < AUTUMN.fogBanks; attempt++) { // Resten längs vattnet.
    const spot = hubPoint(-58 + random() * 116, 2 + random() * 58);
    if (!insideWorld(spot.x, spot.z) || Math.hypot(spot.x - HOME_X, spot.z - HOME_Z) < 14) continue;
    if (distanceToWater(spot.x, spot.z) > 5) continue;
    spots.push(spot);
  }
  const banks = spots.map((spot, i) => {
    const material = new THREE.MeshBasicMaterial({ map: texture, color: AUTUMN.fogColor, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    const size = 10 + random() * 7;
    mesh.scale.set(size, 1, size * 0.75);
    mesh.position.set(spot.x, 0.5 + (i % 4) * 0.35, spot.z);
    mesh.rotation.y = random() * 6.3;
    mesh.renderOrder = 2;
    mesh.userData.noShadow = true;
    hubGroup().add(mesh);
    markMoving(mesh);
    return { mesh, material, base: spot, phase: random() * 6.3, drift: 0.8 + random() };
  });
  // Tätast på morgonen (klockan före 9), glesare mot lunch. Och tunnare ju längre man spelat.
  const hour = new Date().getHours();
  const morning = hour < 9 ? 1 : Math.max(0.55, 1 - ((hour - 9) / 3) * 0.45);
  let time = 0;
  addUpdater((delta, at) => {
    time += delta;
    const thin = 0.35 + 0.65 * Math.exp(-time / AUTUMN.fogLifetime);
    const strength = AUTUMN.fogOpacity * morning * thin;
    for (const bank of banks) {
      bank.mesh.visible = currentWorld === hub;
      if (!bank.mesh.visible) continue;
      bank.mesh.position.x = bank.base.x + Math.sin(time * 0.1 * bank.drift + bank.phase) * 1.8;
      bank.mesh.position.z = bank.base.z + Math.cos(time * 0.08 * bank.drift + bank.phase) * 1.1;
      // Glesare närmast bilen, så att den inte döljs.
      const near = THREE.MathUtils.smoothstep(Math.hypot(bank.mesh.position.x - at.x, bank.mesh.position.z - at.z), 4, 13);
      bank.material.opacity = strength * near;
    }
  });
}

// ============================================================================
// Mer lövfall nära träden (vindbyarna från leaves.js blåser dem)
// ============================================================================
function buildTreeLeaves(ctx) {
  const count = AUTUMN.treeLeaves;
  const mesh = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  const colors = LEAF_COLORS.map((hex) => new THREE.Color(hex));
  const items = [];
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, colors[i % colors.length]);
    items.push({ x: 0, y: -10, z: 0, speed: 0.7 + Math.random() * 0.7, phase: Math.random() * 6.3, spin: (Math.random() - 0.5) * 5, size: 0.3 + Math.random() * 0.15, fresh: true });
  }
  mesh.instanceColor.needsUpdate = true;
  hubGroup().parent.add(mesh);
  markMoving(mesh);
  let nearTrees = [];
  let refresh = 0;
  let time = 0;
  const dummy = new THREE.Object3D();
  const respawn = (leaf, startHigh) => {
    if (!nearTrees.length) { leaf.y = -10; return; }
    const tree = nearTrees[Math.floor(Math.random() * nearTrees.length)];
    const angle = Math.random() * 6.3;
    const reach = Math.random() * 2.4 * tree.scale;
    leaf.x = tree.x + Math.cos(angle) * reach;
    leaf.z = tree.z + Math.sin(angle) * reach;
    leaf.y = startHigh ? Math.random() * 6.5 : 5 + Math.random() * 2.2;
  };
  addUpdater((delta, at) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    time += delta;
    refresh -= delta;
    if (refresh <= 0) {
      refresh = 0.8;
      nearTrees = ctx.trees.filter((tree) => Math.hypot(tree.x - at.x, tree.z - at.z) < 32);
    }
    const gust = 1 + wind.strength * 3;
    items.forEach((leaf, i) => {
      if (leaf.fresh || leaf.y < 0.05 || Math.hypot(leaf.x - at.x, leaf.z - at.z) > 36) { respawn(leaf, leaf.fresh); leaf.fresh = false; }
      if (leaf.y > 0) {
        leaf.y -= (0.55 + 0.2 * Math.sin(time * 2 + leaf.phase)) * leaf.speed * delta;
        leaf.x += (Math.sin(time * 0.9 + leaf.phase) * 0.6 + wind.x * 1.2) * gust * delta * 0.6;
        leaf.z += (Math.cos(time * 0.7 + leaf.phase * 1.3) * 0.4 + wind.z * 1.2) * gust * delta * 0.6;
      }
      dummy.position.set(leaf.x, Math.max(leaf.y, -10), leaf.z);
      dummy.rotation.set(leaf.phase + time * leaf.spin, time * leaf.spin * 0.6, leaf.phase);
      dummy.scale.setScalar(leaf.y > 0 ? leaf.size : 0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// Vindpust bakom bilen: löv virvlar upp och snurrar iväg när man kör
// ============================================================================
function buildSwirl() {
  const count = AUTUMN.swirlLeaves;
  const mesh = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  const colors = LEAF_COLORS.map((hex) => new THREE.Color(hex));
  const items = [];
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, colors[(i * 5) % colors.length]);
    items.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, omega: 0, size: 0.3, spin: 0, phase: 0 });
  }
  mesh.instanceColor.needsUpdate = true;
  hubGroup().parent.add(mesh);
  markMoving(mesh);
  const dummy = new THREE.Object3D();
  let emit = 0;
  let cursor = 0;
  let time = 0;
  addUpdater((delta, at) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    time += delta;
    const move = Math.abs(speed);
    if (move > 5) {
      // Fler löv ju fortare man kör och ju kraftigare byn är.
      emit += delta * THREE.MathUtils.clamp(move / 20, 0.2, 1.2) * 26 * (1 + wind.strength * 1.5);
      const dir = Math.sign(speed);
      const forwardX = Math.sin(car.rotation.y) * dir;
      const forwardZ = Math.cos(car.rotation.y) * dir;
      while (emit >= 1) {
        emit -= 1;
        const leaf = items[cursor];
        cursor = (cursor + 1) % count;
        const side = (Math.random() - 0.5) * 1.6;
        leaf.x = at.x - forwardX * 1.5 - forwardZ * side;
        leaf.z = at.z - forwardZ * 1.5 + forwardX * side;
        leaf.y = 0.2 + Math.random() * 0.3;
        const push = move * (0.12 + Math.random() * 0.14);
        leaf.vx = -forwardX * push + (Math.random() - 0.5) * 2;
        leaf.vz = -forwardZ * push + (Math.random() - 0.5) * 2;
        leaf.vy = 2 + Math.random() * 3;
        leaf.omega = (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 3); // Åt vilket håll och hur fort den virvlar.
        leaf.max = leaf.life = 1.3 + Math.random() * 1.1;
        leaf.size = 0.28 + Math.random() * 0.16;
        leaf.spin = (Math.random() - 0.5) * 14;
        leaf.phase = Math.random() * 6.3;
      }
    }
    const drag = Math.exp(-1.1 * delta);
    items.forEach((leaf, i) => {
      if (leaf.life <= 0) {
        dummy.scale.setScalar(0.0001);
        dummy.position.set(0, -10, 0);
      } else {
        leaf.life -= delta;
        const turn = leaf.omega * delta; // Farten vrids runt: virveln.
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const vx = leaf.vx * cos - leaf.vz * sin;
        leaf.vz = (leaf.vx * sin + leaf.vz * cos) * drag;
        leaf.vx = vx * drag;
        leaf.vy -= 4 * delta;
        leaf.x += (leaf.vx + wind.x) * delta;
        leaf.z += (leaf.vz + wind.z) * delta;
        leaf.y = Math.max(0.08, leaf.y + leaf.vy * delta);
        if (leaf.y <= 0.08) leaf.vy = Math.max(leaf.vy, 0.6); // Studsar lätt längs marken.
        const fade = Math.min(1, leaf.life / 0.4, (leaf.max - leaf.life) / 0.1 + 0.2);
        dummy.position.set(leaf.x, leaf.y, leaf.z);
        dummy.rotation.set(leaf.phase + time * leaf.spin, time * leaf.spin * 0.6, leaf.phase);
        dummy.scale.setScalar(leaf.size * Math.max(0.0001, fade));
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// Lera och blöta löv vid vägkanterna (platta märken på marken, bilen kör rakt över)
// ============================================================================
function buildRoadLitter(ctx) {
  const roads = ctx.roads.filter((road) => Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z) > 6);
  if (!roads.length) return;
  const mudTexture = canvasTexture(128, (pen, n) => {
    pen.fillStyle = 'rgba(70, 50, 32, 0.9)';
    pen.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.15) {
      const r = n * (0.34 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2));
      pen[a === 0 ? 'moveTo' : 'lineTo'](n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r * 0.8);
    }
    pen.fill();
    pen.fillStyle = 'rgba(40, 28, 18, 0.55)'; // Blötare mitt i.
    pen.beginPath();
    pen.ellipse(n / 2, n / 2, n * 0.18, n * 0.13, 0.4, 0, Math.PI * 2);
    pen.fill();
  });
  const leavesTexture = canvasTexture(128, (pen, n) => {
    const random = seededRandom(515);
    pen.fillStyle = 'rgba(40, 30, 20, 0.22)'; // Våt fläck under.
    pen.beginPath();
    pen.ellipse(n / 2, n / 2, n * 0.42, n * 0.3, 0.2, 0, Math.PI * 2);
    pen.fill();
    const wet = ['#7a3a1a', '#8a5a1e', '#6a4a1e', '#8a2e14', '#7a6a2a'];
    for (let i = 0; i < 16; i++) { // Blöta löv: dämpade färger.
      pen.save();
      pen.translate(n * (0.2 + random() * 0.6), n * (0.28 + random() * 0.44));
      pen.rotate(random() * 6.3);
      pen.fillStyle = wet[i % wet.length];
      pen.beginPath();
      pen.moveTo(0, -n * 0.085);
      pen.lineTo(n * 0.045, 0);
      pen.lineTo(0, n * 0.085);
      pen.lineTo(-n * 0.045, 0);
      pen.fill();
      pen.restore();
    }
  });
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const random = seededRandom(4411);
  const totalLength = roads.reduce((sum, road) => sum + Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z), 0);
  const pickRoad = () => {
    let pick = random() * totalLength;
    for (const road of roads) {
      pick -= Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z);
      if (pick <= 0) return road;
    }
    return roads[roads.length - 1];
  };
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (texture, count, sizeMin, sizeMax, seedY) => {
    const spots = [];
    for (let attempt = 0; attempt < count * 40 && spots.length < count; attempt++) {
      const road = pickRoad();
      const dx = road.to.x - road.from.x;
      const dz = road.to.z - road.from.z;
      const length = Math.hypot(dx, dz);
      const t = random();
      const half = (road.width || ROAD_WIDTH) / 2;
      const offset = (random() < 0.5 ? -1 : 1) * (half - 0.15 + random() * 0.7); // Över kanten: halva på vägen, halva på gräset.
      const x = road.from.x + dx * t - (dz / length) * offset;
      const z = road.from.z + dz * t + (dx / length) * offset;
      if (!insideWorld(x, z) || distanceToWater(x, z) < 3 || nearPortalOrSign(x, z, 5)) continue;
      if (Math.hypot(x - HOME_X, z - HOME_Z) < 6) continue;
      spots.push({ x, z, yaw: Math.atan2(dx, dz) + (random() - 0.5) * 0.5, size: sizeMin + random() * (sizeMax - sizeMin), shade: 0.8 + random() * 0.2 });
    }
    if (!spots.length) return;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.InstancedMesh(plane, material, spots.length);
    spots.forEach((spot, i) => {
      quaternion.setFromAxisAngle(up, spot.yaw);
      matrix.compose(new THREE.Vector3(spot.x, 0.1 + seedY, spot.z), quaternion, new THREE.Vector3(spot.size * 1.3, 1, spot.size));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, new THREE.Color(spot.shade, spot.shade, spot.shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    mesh.renderOrder = 1;
    hubGroup().add(mesh);
  };
  place(mudTexture, AUTUMN.mudPatches, 1.2, 2.6, 0);
  place(leavesTexture, AUTUMN.wetLeafPatches, 1.6, 2.8, 0.015);
}

// ============================================================================
// Svamp vid trädrötter och stenar
// ============================================================================
function buildMushrooms(ctx) {
  const random = seededRandom(3303);
  const roads = ctx.roads;
  const spots = [];
  const addCluster = (cx, cz, reachMin, reachMax, n) => {
    for (let k = 0; k < n; k++) {
      const angle = random() * 6.3;
      const reach = reachMin + random() * (reachMax - reachMin);
      const x = cx + Math.cos(angle) * reach;
      const z = cz + Math.sin(angle) * reach;
      if (onRoad(x, z, roads, 0.8) || distanceToWater(x, z) < 1.5 || !insideWorld(x, z) || overlapsObstacle(x, z, 0.25)) continue;
      if (Math.hypot(x - HOME_X, z - HOME_Z) < 7) continue;
      spots.push({ x, z, s: 1 + random() * 0.8, yaw: random() * 6.3 });
    }
  };
  const step = Math.max(1, Math.floor(ctx.trees.length / AUTUMN.mushroomTrees));
  for (let i = 0; i < ctx.trees.length && i / step < AUTUMN.mushroomTrees; i += step) {
    const tree = ctx.trees[i];
    addCluster(tree.x, tree.z, 0.55 * tree.scale + 0.3, 1.4 * tree.scale + 0.3, 3 + Math.floor(random() * 2));
  }
  // Stenarna (hubprops.js buildRocks: [höger, ned, antal, storlek]).
  for (const [right, down, , size] of [[-49, 23, 3, 1.0], [-26, 53, 3, 0.9], [38, 44, 4, 1.0], [50, 30, 3, 0.9], [-4, 60, 3, 0.8]]) {
    const centre = hubPoint(right, down);
    addCluster(centre.x, centre.z, size * 1.5, size * 2.2, 4);
  }
  if (!spots.length) return;
  const stemGeometry = new THREE.CylinderGeometry(0.07, 0.1, 0.4, 6).translate(0, 0.2, 0);
  const capGeometry = new THREE.SphereGeometry(0.5, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const stems = new THREE.InstancedMesh(stemGeometry, new THREE.MeshLambertMaterial({ color: '#efe6cf' }), spots.length);
  const caps = new THREE.InstancedMesh(capGeometry, new THREE.MeshLambertMaterial({ color: '#ffffff' }), spots.length);
  const capColors = ['#b8452a', '#c9a56a', '#a8502e', '#d6c08a', '#9a3a28'].map((hex) => new THREE.Color(hex));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  spots.forEach((spot, i) => {
    quaternion.setFromAxisAngle(up, spot.yaw);
    matrix.compose(new THREE.Vector3(spot.x, 0, spot.z), quaternion, new THREE.Vector3(spot.s, spot.s, spot.s));
    stems.setMatrixAt(i, matrix);
    matrix.compose(new THREE.Vector3(spot.x, 0.36 * spot.s, spot.z), quaternion, new THREE.Vector3(spot.s * 0.62, spot.s * 0.42, spot.s * 0.62));
    caps.setMatrixAt(i, matrix);
    caps.setColorAt(i, capColors[Math.floor(random() * capColors.length)]);
  });
  stems.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  caps.instanceColor.needsUpdate = true;
  stems.frustumCulled = false;
  caps.frustumCulled = false;
  hubGroup().add(stems, caps);
}

// ============================================================================
// Flyttfåglar: en V av gäss som då och då drar förbi högt upp
// ============================================================================
function goseGeometry() {
  const vertices = [];
  const indices = [];
  for (const side of [-1, 1]) { // Vingar: lång och smal, lätt bakåtsvept.
    const base = vertices.length / 3;
    vertices.push(0, 0, 0.12, side * 0.9, 0.1, -0.05, side * 0.75, 0.05, -0.3, 0, 0, -0.2);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const base = vertices.length / 3; // Kropp med hals framåt.
  vertices.push(0, 0.02, 0.62, -0.1, 0.02, -0.3, 0.1, 0.02, -0.3);
  indices.push(base, base + 1, base + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildGeese() {
  const count = AUTUMN.geese;
  const mesh = new THREE.InstancedMesh(goseGeometry(), new THREE.MeshBasicMaterial({ color: '#3d3a38', side: THREE.DoubleSide }), count);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.visible = false;
  hubGroup().add(mesh);
  markMoving(mesh);
  // Platser i formationen: ledaren först, sedan par bakåt åt sidorna (V).
  const slots = [];
  for (let k = 0; slots.length < count; k++) {
    slots.push({ along: -Math.ceil(k / 2) * 2.4, across: (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.0 });
  }
  const rightX = Math.cos(BILLBOARD_FACING); // Skärmens "höger" i världen.
  const rightZ = -Math.sin(BILLBOARD_FACING);
  const downX = Math.sin(BILLBOARD_FACING);
  const downZ = Math.cos(BILLBOARD_FACING);
  const dummy = new THREE.Object3D();
  let wait = AUTUMN.geeseFirstAfter;
  let flight = null;
  let time = 0;
  addUpdater((delta, at) => {
    time += delta;
    if (!flight) {
      wait -= delta;
      if (wait > 0 || currentWorld !== hub) return;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const lateral = Math.random() * 10;
      flight = {
        dir, travelled: 0,
        x: at.x - rightX * dir * 95 + downX * lateral,
        z: at.z - rightZ * dir * 95 + downZ * lateral,
        y: 14 + Math.random() * 4,
        speed: 8 + Math.random() * 2,
        drift: (Math.random() - 0.5) * 0.12,
      };
      mesh.visible = true;
    }
    flight.travelled += flight.speed * delta;
    const hx = rightX * flight.dir + downX * flight.drift;
    const hz = rightZ * flight.dir + downZ * flight.drift;
    const length = Math.hypot(hx, hz);
    const fx = hx / length;
    const fz = hz / length;
    const lead = { x: flight.x + fx * flight.travelled, z: flight.z + fz * flight.travelled };
    slots.forEach((slot, i) => {
      dummy.position.set(lead.x + fx * slot.along - fz * slot.across, flight.y + Math.sin(time * 1.6 + i) * 0.25, lead.z + fz * slot.along + fx * slot.across);
      dummy.rotation.set(0, Math.atan2(fx, fz), Math.sin(time * 4 + i) * 0.1);
      dummy.scale.set(1.6 * (0.55 + 0.45 * Math.abs(Math.sin(time * 5 + i * 0.6))), 1.6, 1.6); // Vingslag: vingarnas bredd.
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (flight.travelled > 190) { // Borta ur bild.
      flight = null;
      mesh.visible = false;
      wait = AUTUMN.geeseEvery[0] + Math.random() * (AUTUMN.geeseEvery[1] - AUTUMN.geeseEvery[0]);
    }
  });
}

// ============================================================================
// Skördeprylar vid stugan: höbalar och några små pumpor (vanliga, inte Halloween-pumporna: de krossas inte)
// ============================================================================
// Hem-gruppens lokala plats -> världen (hem-gruppen står på HOME_X/HOME_Z och är vriden BILLBOARD_FACING).
function homeToWorld(lx, lz) {
  const a = BILLBOARD_FACING;
  return { x: HOME_X + Math.cos(a) * lx + Math.sin(a) * lz, z: HOME_Z - Math.sin(a) * lx + Math.cos(a) * lz };
}
// Är platsen fri från hinder (fasta och mjuka), tekoppar och vägar?
function harvestSpotFree(ctx, lx, lz) {
  const w = homeToWorld(lx, lz);
  if (overlapsObstacle(w.x, w.z, 2.2)) return false;
  if (teaCupSpots.some((cup) => Math.hypot(w.x - cup.x, w.z - cup.z) < 2.6)) return false;
  return !onRoad(w.x, w.z, ctx.roads, 1.5);
}

function buildHarvest(ctx) {
  // Första lediga plats vid stugan (hörnet till höger om dörren, sedan några alternativ). Ingen plats = inga skördeprylar.
  const candidates = [[CABIN_X + 4.0, CABIN_Z + 2.4], [CABIN_X + 4.4, CABIN_Z + 4.2], [CABIN_X + 5.5, CABIN_Z + 2.0], [CABIN_X + 4.0, CABIN_Z + 6]];
  const centre = candidates.find(([lx, lz]) => harvestSpotFree(ctx, lx, lz));
  if (!centre) return;
  const [cx, cz] = centre;
  const group = new THREE.Group();
  const baleMaterial = new THREE.MeshLambertMaterial({ color: '#d6b45a' });
  const strapMaterial = new THREE.MeshLambertMaterial({ color: '#8a6a2a' });
  const baleGeometry = new THREE.CylinderGeometry(0.55, 0.55, 1.0, 14).rotateZ(Math.PI / 2); // Liggande, axel längs x.
  const strapGeometry = new THREE.CylinderGeometry(0.565, 0.565, 0.08, 14).rotateZ(Math.PI / 2);
  const addBale = (x, y, z, yaw) => {
    const bale = new THREE.Group();
    bale.add(new THREE.Mesh(baleGeometry, baleMaterial));
    for (const sx of [-0.28, 0.28]) {
      const strap = new THREE.Mesh(strapGeometry, strapMaterial);
      strap.position.x = sx;
      bale.add(strap);
    }
    bale.position.set(x, y, z);
    bale.rotation.y = yaw;
    group.add(bale);
  };
  // Två bredvid varandra och en ovanpå.
  addBale(cx, 0.55, cz - 0.55, 0.1);
  addBale(cx, 0.55, cz + 0.55, -0.08);
  addBale(cx + 0.02, 1.5, cz, 0.05);
  // Små pumpor (ribbad kula, som Halloween-pumpan men mindre och i höstfärger).
  const pumpkinGeometry = new THREE.SphereGeometry(0.5, 14, 10);
  const position = pumpkinGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const rib = 1 + 0.09 * Math.cos(Math.atan2(z, x) * 8);
    position.setXYZ(i, x * rib, position.getY(i) * 0.82, z * rib);
  }
  pumpkinGeometry.computeVertexNormals();
  const stemGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.17, 6).translate(0, 0.44, 0);
  const stemMaterial = new THREE.MeshLambertMaterial({ color: '#5d6b2a' });
  const colors = ['#d9822b', '#e3a04a', '#c8cf9a', '#b8561e', '#dd9a3a'];
  [[1.1, -0.25, 0.8], [1.5, 0.45, 0.65], [1.0, 1.05, 0.5], [0.4, 1.4, 0.7], [1.6, -0.85, 0.55]].forEach(([dx, dz, s], i) => {
    const body = new THREE.Mesh(pumpkinGeometry, new THREE.MeshLambertMaterial({ color: colors[i % colors.length] }));
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    for (const part of [body, stem]) {
      part.scale.setScalar(s);
      part.position.set(cx + dx, 0.41 * s - 0.02, cz + dz);
      part.rotation.y = i * 1.3;
      group.add(part);
    }
  });
  hubGroup().add(group);
  group.position.set(HOME_X, 0, HOME_Z); // Gruppen sitter i hem-gruppens led.
  group.rotation.y = BILLBOARD_FACING;
  const w = homeToWorld(cx, cz);
  addObstacles([{ x: w.x, z: w.z, radius: 1.3 }, { x: homeToWorld(cx + 1.2, cz + 0.3).x, z: homeToWorld(cx + 1.2, cz + 0.3).z, radius: 1.0 }]);
}

// ============================================================================
// Ingången
// ============================================================================
function wanted() {
  const state = getSeasonState();
  if (!state.names.includes('autumn')) return false;
  const own = state.config.autumn || {};
  Object.assign(AUTUMN, own);
  if (state.names.includes('halloween') && !AUTUMN.duringHalloween) return false; // Halloween har sitt eget utseende.
  return true;
}

// Hook-API (seasonfx.js): build körs efter buildHubCollision, så mjuka hinder och prydnad finns att undvika.
export default {
  name: 'autumn',
  build(ctx) {
    if (active || !wanted()) return;
    active = true;
    buildWarmSun();
    if (AUTUMN.fogBanks > 0) buildFogBanks();
    if (ctx.trees && ctx.trees.length) {
      buildTreeLeaves(ctx);
      buildMushrooms(ctx);
    }
    buildSwirl();
    if (ctx.roads && ctx.roads.length) buildRoadLitter(ctx);
    buildGeese();
    if (AUTUMN.harvest) buildHarvest(ctx);
  },
};
