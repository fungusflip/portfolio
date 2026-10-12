// ============================================================================
// vignettes/mutation.js — vinjetten vid Mutation Protocol: en cyberpunk-verkstad / vapenförråd.
// ============================================================================
// Mörk metall + het magenta + cyan + syragul. Skiljer sig från de andra stoppen (brygga, lund,
// diner, terrass) genom hårda kanter och neon. Fyra vapen byggda av SAMMA funktion med olika
// parametrar ("samma HDA, olika värden"), en mutantråtta som rigg-docka med ledmarkörer,
// en neonram som flimrar och en varningsrandig matta.
// Lokala koordinater: origo = marken bredvid skyltfickan, +x = bort från vägen (mot bakväggen),
// +z = längs vägen (åt sidan på skärmen), y upp. Ryms i 9 x 9 enheter (x 1..8, z -4..4).
// Allt slås ihop per material vid bygget (15 meshes), så inget kostar per bild utom flimret.
// Ingen scenåtkomst här: wire-koden lägger group i världen och obstacles/shadows i hubprops-listorna.

// Hela vinjetten flyttas så här i x (ändra om den ska närmare / längre från vägen).
const SHIFT_X = -0.5;

export function buildMutation(THREE, palette = {}) { // palette används inte: vinjettens neonfärger är egna.
  const MAGENTA = '#ff2fa8';
  const CYAN = '#18e8ff';
  const YELLOW = '#d8ff2a'; // Syragult.

  // --- Material (delas av alla delar) ---
  const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const glow = (color) => new THREE.MeshBasicMaterial({ color });
  const M = {
    wall: flat('#1c1f27'),
    steel: flat('#4b5565'),
    black: flat('#0b0c11'),
    mat: flat('#050507'),
    flesh: flat('#3a2347'), // Mutantens "hud": mörkt lila.
    gunMagenta: flat('#c21c82'),
    gunCyan: flat('#12a9bd'),
    gunYellow: flat('#a9c91a'),
    gunBone: flat('#c9cfd8'),
    neonMagenta: glow(MAGENTA), // Flimrar (update).
    neonCyan: glow(CYAN),       // Flimrar i annan takt.
    magenta: glow(MAGENTA),     // Fasta accenter: lyser jämnt.
    cyan: glow(CYAN),
    yellow: glow(YELLOW),
    beam: new THREE.MeshBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  };

  M.mat.userData.noSnow = true; // Mattan är inomhusgolv: vintern (season-winter.js, applySnowSurfaces) lägger ingen snö på den.

  // --- Små byggare: samla geometri per material, slå ihop sist ---
  const buckets = new Map(); // material -> [geometri]
  const tmpQuat = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  function put(material, geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x + SHIFT_X, y, z),
      tmpQuat.setFromEuler(new THREE.Euler(rx, ry, rz)).clone(),
      new THREE.Vector3(1, 1, 1),
    ));
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(geometry);
  }
  const box = (material, w, h, d, x, y, z, rx, ry, rz) => put(material, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const ball = (material, r, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const geometry = new THREE.IcosahedronGeometry(r, 0);
    geometry.scale(sx, sy, sz);
    put(material, geometry, x, y, z);
  };
  // En stav mellan två punkter (benen i riggen, svansen).
  function bone(material, a, b, radius = 0.07) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dy, dz);
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 5);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).divideScalar(length));
    geometry.applyQuaternion(q);
    put(material, geometry, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }

  // --- Mattan: svart med gul kant och en varningsrandig remsa närmast vägen ---
  box(M.mat, 4.8, 0.1, 7.8, 3.9, 0.05, 0);
  for (const x of [1.5, 6.3]) box(M.yellow, 0.2, 0.03, 7.8, x, 0.105, 0);
  for (const z of [-3.9, 3.9]) box(M.yellow, 4.8, 0.03, 0.2, 3.9, 0.105, z);
  for (let z = -3.3; z <= 3.31; z += 0.66) box(M.yellow, 0.2, 0.03, 0.95, 2.1, 0.105, z, 0, Math.PI / 4, 0);

  // --- Bakvägg, tak och stolpar: "alkoven" ---
  box(M.wall, 0.6, 5.6, 8, 8.2, 2.8, 0);
  box(M.wall, 2.4, 0.22, 8.2, 6.9, 5.7, 0);   // Taket.
  for (const z of [-3.9, 3.9]) box(M.steel, 0.22, 5.6, 0.22, 5.8, 2.8, z);
  box(M.black, 0.1, 0.4, 8.2, 5.7, 5.5, 0);   // Kantlist under taket.
  box(M.black, 1.4, 0.2, 8, 7.2, 0.1, 0);     // Golvplatta under väggen.

  // --- Neonramen på väggen (flimrar) ---
  const NX = 7.82;
  box(M.neonMagenta, 0.12, 0.14, 7.5, NX, 5.25, 0);
  box(M.neonMagenta, 0.12, 0.14, 7.5, NX, 0.45, 0);
  for (const z of [-3.75, 3.75]) box(M.neonMagenta, 0.12, 4.94, 0.14, NX, 2.85, z);
  box(M.neonCyan, 0.12, 0.1, 7.1, NX, 4.9, 0);          // Cyanlist under toppen.
  box(M.neonCyan, 0.12, 4.4, 0.1, NX, 2.65, 0.15);      // Delare mellan vapnen och mutanten.
  box(M.magenta, 0.5, 0.5, 0.06, 5.58, 5.5, -3.6);      // Liten fast "statuslampa" på kantlisten.

  // --- Vapenstället: platta med fyra hyllor (varje vapen byggs av gun()) ---
  box(M.black, 0.3, 3.3, 3.8, 7.6, 2.85, -2.05);
  for (const y of [3.45, 1.95]) box(M.steel, 0.24, 0.1, 3.5, 7.45, y, -2.05);
  // Ett vapen: len = kropp, bar = pipa, stock = kolv, mag = magasin, scope = kikare, drum = trumma.
  // Ligger i z-y-planet (pipan åt +z), centrerat på (cz, cy), x = djupet från väggen.
  function gun(cz, cy, p, body, accent) {
    const total = p.len + p.bar + p.stock;
    const z0 = cz - total / 2 + p.stock; // Kroppens början.
    const x = 7.3;
    box(body, 0.3, 0.42, p.len, x, cy, z0 + p.len / 2);
    box(accent, 0.33, 0.08, p.len * 0.7, x, cy + 0.1, z0 + p.len * 0.45);
    // Pipan: cylinder lagd längs z.
    put(body, new THREE.CylinderGeometry(0.09, 0.09, p.bar, 6).rotateX(Math.PI / 2), x, cy + 0.07, z0 + p.len + p.bar / 2);
    box(accent, 0.22, 0.22, 0.16, x, cy + 0.07, z0 + p.len + p.bar - 0.04);
    box(body, 0.24, 0.5, 0.22, x, cy - 0.4, z0 + p.len * 0.2, 0.28, 0, 0);          // Pistolgrepp.
    if (p.mag) box(accent, 0.2, p.mag, 0.2, x, cy - 0.21 - p.mag / 2, z0 + p.len * 0.58, -0.12, 0, 0);
    if (p.stock) box(body, 0.26, 0.36, p.stock, x, cy - 0.04, z0 - p.stock / 2);
    if (p.scope) {
      put(accent, new THREE.CylinderGeometry(0.1, 0.1, p.scope, 6).rotateX(Math.PI / 2), x, cy + 0.42, z0 + p.len * 0.5);
      box(M.black, 0.16, 0.16, 0.1, x, cy + 0.42, z0 + p.len * 0.5 + p.scope / 2);
    }
    if (p.drum) put(accent, new THREE.CylinderGeometry(0.3, 0.3, 0.28, 8).rotateZ(Math.PI / 2), x, cy - 0.38, z0 + p.len * 0.55);
  }
  gun(-2.95, 3.95, { len: 0.8, bar: 0.4, stock: 0, mag: 0.45, scope: 0, drum: 0 }, M.gunMagenta, M.cyan);    // Pistol.
  gun(-1.2, 3.95, { len: 0.7, bar: 0.5, stock: 0.35, mag: 0.55, scope: 0, drum: 0 }, M.gunCyan, M.yellow);  // SMG.
  gun(-2.95, 2.45, { len: 0.85, bar: 0.5, stock: 0.35, mag: 0.3, scope: 0.6, drum: 0 }, M.gunYellow, M.magenta); // Gevär.
  gun(-1.2, 2.45, { len: 0.8, bar: 0.4, stock: 0.35, mag: 0, scope: 0, drum: 1 }, M.gunBone, M.magenta);    // Trumkanon.

  // --- Arbetsbänken framför stället med två lådor ---
  box(M.steel, 1.2, 0.14, 3.8, 6.55, 0.95, -2.05);
  for (const z of [-3.6, -0.5]) box(M.wall, 1.0, 0.88, 0.16, 6.55, 0.44, z);
  box(M.black, 0.55, 0.4, 0.7, 6.5, 1.22, -3.0);
  box(M.yellow, 0.57, 0.06, 0.72, 6.5, 1.42, -3.0);
  box(M.black, 0.5, 0.3, 0.55, 6.5, 1.17, -1.4);
  box(M.cyan, 0.52, 0.05, 0.57, 6.5, 1.32, -1.4);

  // --- Mutantråttan: riggdocka på en sockel, ledmarkörer i färg ---
  const CX = 4.9;
  const CZ = 2.15;
  const BASE = 0.3;
  box(M.steel, 2.4, 0.22, 2.9, CX, 0.21, CZ);
  box(M.magenta, 2.46, 0.04, 2.96, CX, 0.12, CZ);
  const J = (dx, y, dz) => [CX + dx, BASE + y, CZ + dz];
  const pelvis = J(0, 1.6, 0);
  const chest = J(-0.15, 2.6, 0);
  const neck = J(-0.35, 3.1, 0);
  const head = J(-0.6, 3.35, 0);
  const kneeL = J(-0.3, 0.95, -0.55);
  const kneeR = J(-0.3, 0.95, 0.55);
  const footL = J(-0.45, 0, -0.7);
  const footR = J(-0.45, 0, 0.7);
  const shoulderL = J(-0.1, 2.55, -0.55);
  const shoulderR = J(-0.1, 2.55, 0.55);
  const elbowL = J(-0.35, 2.15, -1.05);
  const elbowR = J(-0.35, 2.15, 1.05);
  const handL = J(-0.7, 2.75, -1.35);
  const handR = J(-0.7, 2.75, 1.35);
  const tail = [pelvis, J(0.5, 1.3, 0.1), J(1.1, 0.95, 0.5), J(1.7, 0.85, 0.35), J(2.2, 1.15, -0.1), J(2.4, 1.6, -0.3)];
  // Stavarna (riggens ben och armar).
  const sticks = [[pelvis, chest], [chest, neck], [neck, head], [pelvis, kneeL], [kneeL, footL], [pelvis, kneeR], [kneeR, footR],
    [chest, shoulderL], [shoulderL, elbowL], [elbowL, handL], [chest, shoulderR], [shoulderR, elbowR], [elbowR, handR]];
  for (const [a, b] of sticks) bone(M.steel, a, b, 0.06);
  for (let i = 1; i < tail.length; i++) bone(M.flesh, tail[i - 1], tail[i], 0.11 - i * 0.015);
  // Kroppen: tung bringa, spetsig råttskalle med öron, fötter och klor.
  ball(M.flesh, 0.62, chest[0], chest[1] - 0.2, chest[2], 0.75, 1.0, 0.85);
  ball(M.flesh, 0.5, pelvis[0], pelvis[1] - 0.05, pelvis[2], 0.8, 0.8, 0.8);
  ball(M.flesh, 0.42, head[0], head[1], head[2], 1.0, 0.8, 0.8);
  put(M.flesh, new THREE.ConeGeometry(0.24, 0.9, 5).rotateZ(Math.PI / 2 + 0.25), head[0] - 0.62, head[1] - 0.08, head[2]); // Nosen pekar åt vägen/kameran.
  for (const dz of [-0.32, 0.32]) {
    put(M.flesh, new THREE.ConeGeometry(0.2, 0.5, 4), head[0] + 0.1, head[1] + 0.5, head[2] + dz, 0, 0, dz * 0.8);
    ball(M.yellow, 0.08, head[0] - 0.38, head[1] + 0.12, head[2] + dz * 0.6); // Ögon.
  }
  box(M.flesh, 0.7, 0.14, 0.45, footL[0], footL[1] + 0.07, footL[2]);
  box(M.flesh, 0.7, 0.14, 0.45, footR[0], footR[1] + 0.07, footR[2]);
  // Ryggtaggar i magenta: syns som en kam på höjden.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    put(M.magenta, new THREE.ConeGeometry(0.1, 0.4 - t * 0.1, 4), pelvis[0] + 0.5 - t * 0.45, pelvis[1] + 0.25 + t * 1.15, pelvis[2], 0, 0, -0.9);
  }
  // Ledmarkörerna: cyan = stora leder, magenta = ryggraden, gult = ändpunkter (händer, fötter, svansspets).
  for (const p of [kneeL, kneeR, shoulderL, shoulderR, elbowL, elbowR]) ball(M.cyan, 0.14, p[0], p[1], p[2]);
  for (const p of [pelvis, chest, neck]) ball(M.magenta, 0.16, p[0], p[1], p[2]);
  for (const p of [handL, handR, footL, footR, tail[tail.length - 1]]) ball(M.yellow, 0.15, p[0], p[1], p[2]);
  // Skannerstrålen från en lampa i taket, och armen den hänger i.
  box(M.black, 1.3, 0.12, 0.14, 5.45, 5.55, CZ);
  put(M.beam, new THREE.CylinderGeometry(0.12, 1.5, 5.1, 12, 1, true), CX, 2.85, CZ);

  // --- Slå ihop per material till en mesh ---
  const group = new THREE.Group();
  group.name = 'vignette-mutation';
  for (const [material, geometries] of buckets) {
    const merged = geometries.length === 1 ? geometries[0] : mergeIndexed(THREE, geometries);
    const mesh = new THREE.Mesh(merged, material);
    if (material === M.beam) { mesh.userData.noShadow = true; mesh.renderOrder = 2; }
    group.add(mesh);
    for (const g of geometries) if (g !== merged) g.dispose();
  }

  // --- Hinder (lokala cirklar) och kontaktskuggor ---
  const at = (x, z) => ({ x: x + SHIFT_X, z });
  const obstacles = [
    ...[-3.3, -1.65, 0, 1.65, 3.3].map((z) => ({ ...at(7.5, z), r: 1.0, soft: false })), // Bakväggen med stället.
    { ...at(6.5, -2.05), r: 1.0, soft: false },  // Bänken.
    { ...at(6.5, -0.8), r: 0.6, soft: false },
    { ...at(CX, CZ), r: 1.25, soft: false },     // Mutantens sockel.
    { ...at(5.8, -3.9), r: 0.3, soft: false },   // Takstolparna.
    { ...at(5.8, 3.9), r: 0.3, soft: false },
  ];
  const shadows = [
    { ...at(7.0, 0), r: 4.4 },
    { ...at(CX, CZ), r: 1.9 },
    { ...at(3.9, 0), r: 3.6 },
  ];

  // --- Flimret: bara färgen på två neonmaterial och strålens opacitet ändras ---
  const baseMagenta = new THREE.Color(MAGENTA);
  const baseCyan = new THREE.Color(CYAN);
  const flicker = (t, speed, phase) => {
    const wob = 0.88 + 0.12 * Math.sin(t * 17 * speed + phase) * Math.sin(t * 5.3 * speed);
    const cycle = (t * 0.33 * speed + phase) % 1;
    return cycle > 0.93 && cycle < 0.96 ? 0.25 : cycle > 0.975 ? 0.55 : wob; // Ibland ett kort bortfall.
  };
  group.userData.update = (t) => {
    const a = flicker(t, 1, 0);
    const b = flicker(t, 0.8, 0.41);
    M.neonMagenta.color.copy(baseMagenta).multiplyScalar(a);
    M.neonCyan.color.copy(baseCyan).multiplyScalar(b);
    M.beam.opacity = 0.07 + 0.05 * a;
  };
  group.userData.update(0);
  group.userData.materials = M;

  return { group, obstacles, shadows };
}

// mergeGeometries ligger i three/addons och modulen tar THREE som argument, så sammanslagningen
// (position + normal + uv, indexerad eller inte) görs för hand.
function mergeIndexed(THREE, geometries) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  for (const g of geometries) {
    const count = g.attributes.position.count;
    position.set(g.attributes.position.array, v * 3);
    normal.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    const n = g.index ? g.index.count : count; // Icosaedern är oindexerad.
    for (let k = 0; k < n; k++) index[i + k] = (g.index ? g.index.array[k] : k) + v;
    v += count;
    i += n;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}
