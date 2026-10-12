// ============================================================================
// vignettes/angame.js — vinjetten vid "AnGame: Procedural Environment": en liten MÅNBELYST TERRASS.
// En mörk stenmur (som ett fragment ur en procedurell värld) med en stor lysande månskära på,
// svävande runstenar som gungar, ett blått/violett sken i marken och tre körsbärsträd i rosa.
// Avsiktligt kall och nattlig: de andra stoppen är varma höstfärger, den här är blå, lila och månguld.
// ============================================================================
// GRÄNSSNITT: buildAngame(THREE, palette) -> { group, obstacles, shadows }.
//   group     – THREE.Group i LOKALA koordinater: origo = marken bredvid skyltfickan, +x = bort från
//               vägen (fria sidan), +z = längs vägen, y upp. Allt ryms i 9 x 9 enheter (x 0.2..9, z ±4.5).
//   obstacles – [{ x, z, r, soft }] kollisionscirklar (lokala), soft = bilen får köra igenom med en duns.
//   shadows   – [{ x, z, r }] kontaktskuggor (lokala).
// Ingen scen, inga ljus: sken är MeshBasicMaterial. Enda animationen är group.userData.update(t).
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Nattens färger. `palette` (PALETTE från core.js) används bara för bakgrunden, resten är medvetet egna.
const COLOR = {
  stone: ['#262b4a', '#2f3558', '#222744', '#383e66'],
  stoneTop: '#4d4d86',   // Översta stenvarvet fångar månskenet: ljusare violett.
  platform: '#1f2340',
  platformEdge: '#3a4272',
  trunk: '#2a2036',
  blossom: ['#ff9fc8', '#ff7fb4', '#ffc2dc', '#f58bd0'],
  petal: '#ffd0e6',
  moon: '#fff1b0',       // Blek månguld.
  moonGhost: '#2a3f78',  // Månens hela skiva bakom skäran.
  rune: '#5ff2e2',       // Teal.
  rimBlue: '#4d7bff',
  rimViolet: '#9b6bff',
  halo: '#ffe9a0',
  rock: '#3a3f6a',
};

// Liten pseudoslump med frö: samma terrass varje gång, ingen Math.random.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildAngame(THREE, palette = {}) { // palette används inte: nattfärgerna är medvetet egna.
  const rand = rng(0xa11c0de);
  const group = new THREE.Group();
  group.name = 'angame-vignette';
  const obstacles = [];
  const shadows = [];

  // --- Geometri-hjälpare: allt som ska slås ihop görs icke-indexerat och får vertexfärg ---
  const parts = { stone: [], platform: [], blossom: [], glow: [], halo: [], rim: [] };
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  function put(list, geometry, color, x = 0, y = 0, z = 0, rot = null, scale = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (rot) euler.set(rot[0], rot[1], rot[2]); else euler.set(0, 0, 0);
    quat.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(x, y, z), quat, scale ? new THREE.Vector3(scale[0], scale[1], scale[2]) : one);
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
  }
  const merged = (list) => mergeGeometries(list, false);

  // --- Material (delas) ---
  const stoneMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const platformMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  platformMat.userData.noSnow = true; // Terrassplattan (egen hink, så att muren och stammarna får snö): månljus, ingen snö (season-winter.js).
  const blossomMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const rimMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const haloMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
  const rockMat = new THREE.MeshLambertMaterial({ color: COLOR.rock, flatShading: true });
  const coreMat = new THREE.MeshBasicMaterial({ color: COLOR.rune });

  // --- Terrassen: en låg åttkantig platta med ljus kant ---
  const CX = 4.6;      // Plattans mitt (x). Radie 3.7 + sken till 4.35 ryms i x 0.25..8.95, z ±4.35.
  const PLAT_R = 3.7;
  put(parts.platform, new THREE.CylinderGeometry(PLAT_R, PLAT_R + 0.12, 0.26, 10), COLOR.platform, CX, 0.13, 0, [0, 0.16, 0]);
  put(parts.platform, new THREE.CylinderGeometry(PLAT_R - 0.35, PLAT_R - 0.3, 0.06, 10), COLOR.platformEdge, CX, 0.28, 0, [0, 0.16, 0]);

  // --- Muren: kolumner av stenblock i olika höjd, trasig i toppen. Tjocklek 1.2 runt x = WALL_X ---
  const WALL_X = 7.5;
  const WALL_T = 1.2;
  // [z-mitt, bredd, höjd]: den höga delen bär månen, sedan trappas den ned som ett raserat fragment.
  const columns = [
    [-3.5, 1.0, 5.2], [-2.55, 0.95, 7.4], [-1.6, 0.95, 8.0], [-0.65, 0.95, 7.6], [0.3, 0.95, 6.5],
    [1.25, 0.95, 5.0], [2.2, 0.95, 3.9], [3.15, 0.95, 2.6], [3.95, 0.7, 1.5],
  ];
  const COURSE = 0.8;
  for (const [zc, w, h] of columns) {
    let y = 0.26;
    while (y < h - 0.01) {
      const block = Math.min(COURSE * (0.85 + rand() * 0.3), h - y);
      const top = y + block >= h - 0.01;
      const color = top ? COLOR.stoneTop : COLOR.stone[Math.floor(rand() * COLOR.stone.length)];
      const jx = (rand() - 0.5) * 0.12;
      put(parts.stone, new THREE.BoxGeometry(WALL_T + (rand() - 0.5) * 0.1, block * 0.97, w * (0.96 + rand() * 0.05)), color, WALL_X + jx, y + block / 2, zc + (rand() - 0.5) * 0.06);
      y += block;
    }
  }

  // --- Månen: tre lager på båda sidorna av muren (skylt ser vägen från -x, men säkert från båda hållen) ---
  const MOON_Y = 5.1;
  const MOON_Z = -1.55;
  const MOON_R = 1.75;
  // Skäran: yttre cirkel minus en förskjuten cirkel. Två bågar som möts i skärningspunkterna.
  function crescentShape() {
    const R = MOON_R;
    const r = R * 0.82;
    const phi = 0.6; // Åt vilket håll hålet ligger (skärans öppning).
    const d = R * 0.52;
    const alpha = Math.acos((d * d + R * R - r * r) / (2 * d * R));
    const beta = Math.acos((d * d + r * r - R * R) / (2 * d * r));
    const cx = Math.cos(phi) * d;
    const cy = Math.sin(phi) * d;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(phi + alpha) * R, Math.sin(phi + alpha) * R);
    shape.absarc(0, 0, R, phi + alpha, phi - alpha + Math.PI * 2, false);
    shape.absarc(cx, cy, r, phi + Math.PI + beta, phi + Math.PI - beta, true);
    return shape;
  }
  const crescent = new THREE.ShapeGeometry(crescentShape(), 28);
  const ghost = new THREE.CircleGeometry(MOON_R, 28);
  const halo = new THREE.RingGeometry(MOON_R * 1.05, MOON_R * 1.55, 28);
  const face = WALL_T / 2 + 0.02;
  for (const side of [-1, 1]) {
    const rot = [0, side * Math.PI / 2, 0]; // -1: normal mot -x (vägen), +1: baksidan.
    const sx = WALL_X + side * face;
    put(parts.glow, ghost, COLOR.moonGhost, sx, MOON_Y, MOON_Z, rot);
    put(parts.glow, crescent, COLOR.moon, sx + side * 0.03, MOON_Y, MOON_Z, rot);
    put(parts.halo, halo, COLOR.halo, sx + side * 0.01, MOON_Y, MOON_Z, rot);
  }
  // Runor: smala lysande streck på murens nedre del, under månen.
  const runes = [
    [-3.2, 1.3, 0.1, 0.5], [-2.6, 1.9, 0.5, 0.1], [-2.2, 1.2, 0.1, 0.7], [-1.5, 2.1, 0.6, 0.1], [-1.5, 1.5, 0.1, 0.4],
    [-0.8, 1.2, 0.4, 0.1], [-0.5, 2.0, 0.1, 0.6], [0.2, 1.4, 0.1, 0.45], [0.2, 2.5, 0.5, 0.1], [-3.0, 3.1, 0.1, 0.4],
  ];
  for (const [z, y, w, h] of runes) {
    put(parts.glow, new THREE.BoxGeometry(0.05, h, w), COLOR.rune, WALL_X - face - 0.03, y, z);
  }

  // --- Skenet i marken: dekaler (ringar) som ligger platt, ingen riktig ljuskälla ---
  const rimOuter = new THREE.RingGeometry(PLAT_R + 0.12, PLAT_R + 0.62, 40);
  const rimInner = new THREE.RingGeometry(PLAT_R - 0.9, PLAT_R - 0.35, 40);
  const pool = new THREE.CircleGeometry(PLAT_R - 0.95, 32);
  put(parts.rim, rimOuter, COLOR.rimBlue, CX, 0.04, 0, [-Math.PI / 2, 0, 0]);
  put(parts.rim, rimInner, COLOR.rimViolet, CX, 0.32, 0, [-Math.PI / 2, 0, 0]);
  put(parts.rim, pool, '#2a2f7a', CX, 0.31, 0, [-Math.PI / 2, 0, 0]);

  // --- Körsbärsträd: sned stam, tre-fyra rosa kupor (flatskuggade ikosaedrar), kronblad på marken ---
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 6);
  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const trees = [
    { x: 2.5, z: 3.0, h: 3.0, lean: 0.12 },
    { x: 3.4, z: -2.6, h: 3.6, lean: -0.1 },
    { x: 5.6, z: 2.9, h: 3.3, lean: 0.08 },
  ];
  for (const tree of trees) {
    put(parts.stone, trunkGeo, COLOR.trunk, tree.x, tree.h * 0.5, tree.z, [0, 0, tree.lean], [1, tree.h, 1]);
    const topX = tree.x - Math.sin(tree.lean) * tree.h * 0.5;
    const blobs = [[0, 0, 0, 1.3], [0.85, -0.45, 0.3, 0.95], [-0.8, -0.5, -0.35, 0.9], [0.1, 0.55, -0.6, 0.85]];
    blobs.forEach(([bx, by, bz, s], i) => {
      put(parts.blossom, blobGeo, COLOR.blossom[(i + Math.floor(rand() * 4)) % 4], topX + bx, tree.h + 0.45 + by, tree.z + bz,
        [rand() * 3, rand() * 3, 0], [s, s * 0.82, s]);
    });
    obstacles.push({ x: tree.x, z: tree.z, r: 0.4, soft: false });
    shadows.push({ x: tree.x, z: tree.z, r: 1.2 });
    // Kronblad som fallit: små platta femhörningar runt foten.
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const rr = 0.7 + rand() * 1.1;
      const px = tree.x + Math.cos(a) * rr;
      const pz = tree.z + Math.sin(a) * rr;
      const dist = Math.hypot(px - CX, pz); // Ovanpå plattan (0.32 / 0.27) eller på gräset (0.04).
      const py = dist < PLAT_R - 0.35 ? 0.33 : dist < PLAT_R ? 0.28 : 0.04;
      put(parts.blossom, new THREE.CircleGeometry(0.11 + rand() * 0.06, 5), COLOR.petal, px, py, pz, [-Math.PI / 2, 0, rand() * 6]);
    }
  }

  // --- Murens kollision (hård) och kontaktskuggor ---
  for (const z of [-3.2, -1.85, -0.5, 0.85, 2.2, 3.4]) obstacles.push({ x: WALL_X, z, r: 0.95, soft: false });
  for (const z of [-2.2, 0.4, 2.7]) shadows.push({ x: WALL_X - 0.4, z, r: 1.7 });

  // --- Svävande stenar (varje en egen mesh, gungar i update) ---
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const shardGeo = new THREE.OctahedronGeometry(0.5, 0);
  const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
  const floaters = [];
  // [x, y, z, storlek, fas]
  const rocks = [[4.4, 3.6, -0.4, 0.8, 0.0], [5.9, 4.6, -3.0, 0.55, 1.7], [3.6, 5.3, 1.5, 0.62, 3.1]];
  for (const [x, y, z, s, phase] of rocks) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, y, z);
    rock.scale.set(s, s * 0.78, s * 0.9);
    rock.rotation.set(rand() * 2, rand() * 2, rand());
    // Lysande kristall som hänger under stenen: barn, så den följer med. Skala ut ur stenens skala.
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.scale.set(1 / s, 1 / (s * 0.78), 1 / (s * 0.9));
    core.position.set(0, -1.05, 0);
    rock.add(core);
    group.add(rock);
    floaters.push({ mesh: rock, baseY: y, phase, amp: 0.22 + s * 0.12, spin: 0.25 + rand() * 0.2 });
    shadows.push({ x, z, r: 0.7 + s * 0.5 });
  }
  // Småsten utan kristall: fler delar att gunga, billigt (delad form + material).
  for (const [x, y, z, s, phase] of [[7.7, 1.5, -3.9, 0.3, 5.0], [1.6, 2.4, -1.2, 0.34, 0.9]]) {
    const pebble = new THREE.Mesh(rockGeo, rockMat);
    pebble.position.set(x, y, z);
    pebble.scale.set(s, s * 0.8, s);
    group.add(pebble);
    floaters.push({ mesh: pebble, baseY: y, phase, amp: 0.18, spin: 0.5 });
  }
  const shards = [[2.7, 4.2, 0.2, 0.9, 2.2], [6.1, 2.7, 2.1, 0.7, 4.4]];
  for (const [x, y, z, s, phase] of shards) {
    const shard = new THREE.Mesh(shardGeo, coreMat);
    shard.position.set(x, y, z);
    shard.scale.set(s * 0.6, s * 1.5, s * 0.6);
    group.add(shard);
    floaters.push({ mesh: shard, baseY: y, phase, amp: 0.3, spin: 0.7 });
  }

  // --- Slå ihop och lägg i gruppen ---
  const addMerged = (list, material, name) => {
    const mesh = new THREE.Mesh(merged(list), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  addMerged(parts.stone, stoneMat, 'angame-stone');
  addMerged(parts.platform, platformMat, 'angame-platform');
  addMerged(parts.blossom, blossomMat, 'angame-blossom');
  addMerged(parts.glow, glowMat, 'angame-glow');
  addMerged(parts.rim, rimMat, 'angame-rim').renderOrder = 1;
  const haloMesh = addMerged(parts.halo, haloMat, 'angame-halo');
  haloMesh.renderOrder = 2;
  for (const list of Object.values(parts)) for (const g of list) g.dispose();

  // --- Enda animationen: stenarna gungar och roterar sakta, månens sken andas lite ---
  group.userData.update = (t) => {
    for (const f of floaters) {
      f.mesh.position.y = f.baseY + Math.sin(t * 0.9 + f.phase) * f.amp;
      f.mesh.rotation.y = t * f.spin + f.phase;
    }
    haloMat.opacity = 0.3 + 0.08 * Math.sin(t * 1.3);
  };
  group.userData.update(0);
  group.userData.footprint = { x0: 0.25, x1: 8.95, z0: -4.35, z1: 4.35 };

  return { group, obstacles, shadows };
}
