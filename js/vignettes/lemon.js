// ============================================================================
// vignettes/lemon.js — vinjetten vid Lemon Lagoon: en solig citronkiosk på stranden med
// randig markis, två citronträd med jättefrukter, lådor med citroner, parasoll, solstol
// och en liten grund lagun med en uppblåsbar badring som guppar.
// ============================================================================
// Byggs i LOKALA koordinater (ingen scen här): origo = mitten av framkanten, +x = bakåt in i vinjetten (kiosken),
// +z = åt sidan, y = upp. Allt ryms i ca 9 x 9 enheter (x 0.9..9.2, z -4.4..4.3). Kopplaren (vignettes.js,
// moduleBuilder) vrider gruppen ett kvarts varv (ingen spegling), så att +x pekar uppåt på skärmen (MODULRAMEN).
// Alla former slås ihop per (föremål, material), så det blir ~23 meshar med delad geometri/material.
// Ljust och sommarigt med flit: citrongult, turkos, grädde och korall – raka motsatsen till de andra stoppen.
//
//   const { group, obstacles, shadows } = buildLemon(THREE, PALETTE);
//   obstacles = [{ x, z, r, soft }]   – kollisionscirklar (soft = bilen får köra igenom med en duns)
//   shadows   = [{ x, z, r }]         – kontaktskuggor
//   group.userData.update(t)          – badringen guppar (t = sekunder). Det enda som rör sig.

// Färgerna. Ändra här.
const C = {
  lemon: '#ffe03a',       // Citrongult: markisen, frukten, parasollets ena sida.
  cream: '#fff6dc',       // Grädde: markisens vita ränder, disken, parasollets andra sida.
  coral: '#ff6f61',       // Korall: accenter, parasoll, solstol, badring.
  turquoise: '#26c6c0',   // Turkos: diskens front, solstolens ram.
  wood: '#d9a066',        // Ljust trä: lådor, trädstammar, kioskens stolpar.
  woodDark: '#8d5b34',    // Mörkare trä: lådornas band, parasollstången.
  leaf: '#4fae3b',        // Lövverkets bas.
  leafLight: '#8fd14f',   // Ljusare löv på toppen.
  sand: '#f3e2b0',        // Sandplattan under allt.
  lagoon: '#22c3cc',      // Lagunens djupa kant.
  lagoonShallow: '#8ff0df', // Det grunda, ljusa vattnet i mitten.
  iceDeep: '#c9deec',     // Vinter med is: lagunen (samma som dammen i vignettes.js).
  iceShallow: '#e2eef6',  // ... och den ljusare mitten.
};

// Lagunen och badringen ligger här (lokalt).
const LAGOON = { x: 3.3, z: 0.6, rx: 1.35, rz: 1.75 };
const KIOSK = { x: 6.4, z: -1.4 }; // Mitten på kioskens golv.
const TREE_A = { x: 2.3, z: -3.0 };
const TREE_B = { x: 2.3, z: 2.7 };

export function buildLemon(THREE, palette, options = {}) {
  const frozen = !!options.frozen; // Vintern med is: lagunen är en frusen, blek skiva (samma färg som dammen i vignettes.js).
  const group = new THREE.Group();
  group.name = 'LemonVignette';
  void palette; // Vinjetten har en egen sommarpalett (se C ovan); PALETTE är kvällsfärger.

  // --- Material (delas av alla föremål) ---
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const M = {
    lemon: lambert(C.lemon),
    cream: lambert(C.cream, { side: THREE.DoubleSide }),
    coral: lambert(C.coral, { side: THREE.DoubleSide }),
    turquoise: lambert(C.turquoise),
    wood: lambert(C.wood),
    woodDark: lambert(C.woodDark),
    leaf: lambert(C.leaf),
    leafLight: lambert(C.leafLight),
  };
  // Marklager (samma knep som hubprops: ritas utan djuptest, med negativ renderOrder = ingen skugga).
  const layer = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const G = { sand: layer(C.sand), lagoon: layer(frozen ? C.iceDeep : C.lagoon), shallow: layer(frozen ? C.iceShallow : C.lagoonShallow) };

  // --- Hopslagning: samla geometri per (föremål, material), bygg en mesh per hink ---
  // Egen liten sammanslagning (bakar in matrisen, ingen import behövs): allt blir icke-indexerat.
  const buckets = new Map(); // "föremål|material" → { object, key, parts: [geometry] }
  const frames = [new THREE.Matrix4()]; // Stack med ramar (parasollet lutar, solstolen är vriden).
  const tmp = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  function add(object, key, geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    quat.setFromEuler(euler.set(rx, ry, rz));
    tmp.compose(new THREE.Vector3(x, y, z), quat, sx === 1 && sy === 1 && sz === 1 ? one : new THREE.Vector3(sx, sy, sz));
    const baked = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(frames[frames.length - 1], tmp));
    const id = `${object}|${key}`;
    if (!buckets.has(id)) buckets.set(id, { object, key, parts: [] });
    buckets.get(id).parts.push(baked);
    geometry.dispose();
  }
  // Kör något inuti en ram: plats + vridning runt y + lutning runt z (kring (x, 0, z)).
  function inFrame(x, z, yaw, tilt, fn) {
    const f = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt)), one);
    frames.push(new THREE.Matrix4().multiplyMatrices(frames[frames.length - 1], f));
    fn();
    frames.pop();
  }
  function merged(parts) {
    const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    let at = 0;
    for (const g of parts) {
      position.set(g.attributes.position.array, at * 3);
      normal.set(g.attributes.normal.array, at * 3);
      at += g.attributes.position.count;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    return geometry;
  }

  // Småformer (nya geometrier skapas per anrop och slängs efter sammanslagningen).
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides);
  const ball = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  // En citron: sträckt sfär med en liten spets i änden. Axeln pekar längs lokala x innan rotationen.
  function lemon(object, x, y, z, size, rx = 0, ry = 0, rz = 0) {
    inFrame(x, z, ry, rz, () => {
      add(object, 'lemon', ball(size, 8, 6), 0, y, 0, rx, 0, 0, 1.3, 1, 1);
      add(object, 'lemon', ball(size * 0.3, 5, 4), size * 1.25, y, 0);
      add(object, 'lemon', ball(size * 0.3, 5, 4), -size * 1.25, y, 0);
    });
  }

  // ===== Sandplattan och lagunen (flata marklager) =====
  const disc = (r) => new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2);
  const groundMeshes = [];
  const groundLayer = (material, x, z, rx, rz, y, order) => {
    const mesh = new THREE.Mesh(disc(1), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(rx, 1, rz);
    mesh.renderOrder = order;
    mesh.userData.noShadow = true;
    group.add(mesh);
    groundMeshes.push(mesh);
  };
  groundLayer(G.sand, 5.3, 0, 3.9, 4.25, 0.03, -8.6);
  groundLayer(G.lagoon, LAGOON.x, LAGOON.z, LAGOON.rx, LAGOON.rz, 0.04, -8.58);
  groundLayer(G.shallow, LAGOON.x - 0.1, LAGOON.z + 0.1, LAGOON.rx * 0.68, LAGOON.rz * 0.66, 0.05, -8.56);

  // ===== Kiosken: golv, stolpar, randig markis, disk, bakvägg, jätteciron på taket =====
  const K = 'kiosk';
  inFrame(KIOSK.x, KIOSK.z, 0, 0, () => {
    // Golv av ljusa brädor (x = djup, z = bredd).
    add(K, 'wood', box(2.5, 0.12, 3.4), 0, 0.06, 0);
    // Fyra stolpar.
    for (const px of [-1.1, 1.1]) for (const pz of [-1.55, 1.55]) add(K, 'wood', cyl(0.07, 0.07, 2.6, 6), px, 1.4, pz);
    // Bakvägg (grädde) med en stor citronskiva (gul kant, grädde kärna, gula klyftor).
    add(K, 'cream', box(0.1, 1.7, 3.2), 1.15, 1.0, 0);
    add(K, 'lemon', cyl(0.62, 0.62, 0.06, 20), 1.07, 1.35, 0, 0, 0, Math.PI / 2);
    add(K, 'cream', cyl(0.5, 0.5, 0.08, 20), 1.05, 1.35, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) { // Sex klyftor som små gula kilar.
      const a = (i / 6) * Math.PI * 2 + 0.3;
      add(K, 'lemon', box(0.1, 0.08, 0.4), 1.02, 1.35 + Math.sin(a) * 0.24, Math.cos(a) * 0.24, a, 0, 0);
    }
    // Hyllor med flaskor och glas (turkos/korall) på bakväggen.
    add(K, 'wood', box(0.3, 0.06, 2.2), 1.0, 0.75, 0);
    for (let i = 0; i < 5; i++) add(K, i % 2 ? 'coral' : 'turquoise', cyl(0.1, 0.12, 0.34, 8), 1.0, 0.95, -0.9 + i * 0.45);
    // Disken: träkropp, turkos front, gräddfärgad platta, två korallrandiga fotstöd.
    add(K, 'wood', box(0.8, 0.9, 3.2), -0.95, 0.5, 0);
    add(K, 'turquoise', box(0.08, 0.7, 3.0), -1.38, 0.5, 0);
    add(K, 'cream', box(1.0, 0.1, 3.4), -0.95, 1.0, 0);
    add(K, 'coral', box(0.1, 0.1, 3.4), -1.45, 1.0, 0);
    // På disken: tillbringare, tre glas, citroner.
    add(K, 'lemon', cyl(0.2, 0.17, 0.5, 8), -0.95, 1.3, -0.2);
    add(K, 'cream', cyl(0.1, 0.09, 0.2, 8), -0.95, 1.15, 0.5);
    add(K, 'coral', cyl(0.1, 0.09, 0.2, 8), -0.85, 1.15, 0.85);
    add(K, 'turquoise', cyl(0.1, 0.09, 0.2, 8), -1.05, 1.15, 1.2);
    lemon(K, -0.7, 1.15, -1.0, 0.14, 0, 0.4);
    lemon(K, -0.9, 1.15, -1.3, 0.14, 0, 1.2);
    // Markisen: åtta lutande ränder (gul / grädde), högre bak än fram.
    for (let i = 0; i < 8; i++) {
      add(K, i % 2 ? 'cream' : 'lemon', box(2.9, 0.07, 0.45), -0.05, 2.78, -1.575 + i * 0.45, 0, 0, 0.22);
    }
    // Frontkant: korallbalk + rundade "scallops" som hänger ner (alternerande gult/grädde).
    add(K, 'coral', box(0.1, 0.12, 3.6), -1.42, 2.55, 0);
    for (let i = 0; i < 8; i++) {
      add(K, i % 2 ? 'cream' : 'lemon', cyl(0.225, 0.225, 0.06, 10), -1.47, 2.4, -1.575 + i * 0.45, 0, 0, Math.PI / 2);
    }
    // Jättecitronen på taket (stor sfär + spetsar + ett löv).
    lemon(K, 0.1, 3.4, 0, 0.5, 0, 0.3, 0);
    add(K, 'leaf', box(0.5, 0.04, 0.22), 0.62, 3.95, 0, 0, 0.4, 0.3);
    add(K, 'wood', cyl(0.05, 0.05, 0.5, 6), 0.1, 3.0, 0);
  });

  // ===== Två citronträd med oversize frukt =====
  const T = 'trees';
  function tree(x, z, scale, spin, lemons) {
    inFrame(x, z, spin, 0, () => {
      add(T, 'wood', cyl(0.14 * scale, 0.22 * scale, 1.8 * scale, 7), 0, 0.9 * scale, 0);
      add(T, 'wood', cyl(0.05 * scale, 0.08 * scale, 0.7 * scale, 5), 0.15 * scale, 1.9 * scale, 0.05, 0, 0, -0.5);
      const cy = 2.9 * scale;
      add(T, 'leaf', ball(1.25 * scale, 9, 7), 0, cy, 0);
      add(T, 'leaf', ball(0.9 * scale, 8, 6), 0.75 * scale, cy - 0.3 * scale, 0.45 * scale);
      add(T, 'leaf', ball(0.85 * scale, 8, 6), -0.7 * scale, cy - 0.2 * scale, -0.5 * scale);
      add(T, 'leafLight', ball(0.75 * scale, 8, 6), 0.1 * scale, cy + 0.85 * scale, -0.15 * scale);
      add(T, 'leafLight', ball(0.5 * scale, 7, 5), -0.55 * scale, cy + 0.55 * scale, 0.45 * scale);
      // Frukten sitter på lövverkets yta: [vinkel runt, höjdvinkel, storlek].
      for (const [a, e, s] of lemons) {
        const reach = 1.15 * scale;
        const fx = Math.cos(a) * Math.cos(e) * reach;
        const fz = Math.sin(a) * Math.cos(e) * reach;
        lemon(T, fx, cy + Math.sin(e) * reach * 0.9, fz, s * scale, 0, -a, 0.35);
      }
    });
  }
  tree(TREE_A.x, TREE_A.z, 1.0, 0.4, [[0.3, -0.2, 0.3], [1.5, -0.35, 0.28], [2.6, 0.0, 0.32], [3.7, -0.3, 0.3], [4.6, 0.1, 0.27], [5.5, -0.15, 0.3], [0.9, 0.5, 0.25]]);
  tree(TREE_B.x, TREE_B.z, 1.05, 2.1, [[0.2, -0.25, 0.3], [1.2, 0.1, 0.28], [2.3, -0.3, 0.32], [3.3, -0.1, 0.3], [4.2, -0.35, 0.28], [5.2, 0.05, 0.3], [5.9, -0.2, 0.27], [2.8, 0.55, 0.25]]);

  // ===== Lådor med citroner =====
  const R = 'crates';
  function crate(x, y, z, yaw) {
    inFrame(x, z, yaw, 0, () => {
      add(R, 'wood', box(0.9, 0.8, 0.9), 0, y + 0.4, 0);
      for (const sy of [0.12, 0.68]) add(R, 'woodDark', box(0.94, 0.1, 0.94), 0, y + sy, 0);
      for (const cx of [-0.38, 0.38]) add(R, 'woodDark', box(0.1, 0.8, 0.94), cx, y + 0.4, 0);
    });
  }
  crate(8.15, 0, -3.65, 0.15);
  crate(8.2, 0, -2.7, -0.1);
  crate(8.15, 0.8, -3.2, 0.3);
  // Citronhög på översta lådan + två som rullat ner på sanden.
  const pile = [[0, 0.1], [0.28, -0.1], [-0.25, 0.2], [0.05, -0.32], [0.22, 0.3]];
  pile.forEach(([px, pz], i) => lemon(R, 8.15 + px, 1.72 + (i === 0 ? 0.15 : 0), -3.2 + pz, 0.2, 0, i * 1.3));
  lemon(R, 6.9, 0.2, -4.0, 0.2, 0, 0.8);
  lemon(R, 7.3, 0.2, -4.1, 0.2, 0, 2.1);

  // ===== Parasoll (lutar lite) =====
  const U = 'umbrella';
  inFrame(6.0, 2.6, 0.2, 0.13, () => {
    add(U, 'woodDark', cyl(0.05, 0.05, 2.7, 6), 0, 1.35, 0);
    // Tolv kilar, växelvis korall/grädde. Öppna koner med en enda segment per kil.
    for (let i = 0; i < 12; i++) {
      const wedge = new THREE.CylinderGeometry(0.02, 1.55, 0.55, 1, 1, true, (i / 12) * Math.PI * 2, Math.PI * 2 / 12);
      add(U, i % 2 ? 'cream' : 'coral', wedge, 0, 2.7, 0);
    }
    add(U, 'lemon', ball(0.12, 6, 5), 0, 3.02, 0);
    add(U, 'woodDark', cyl(0.12, 0.2, 0.1, 6), 0, 0.05, 0); // Fot.
  });

  // ===== Solstol (randigt tyg på turkos ram), vänd mot lagunen =====
  const S = 'chair';
  inFrame(4.1, -2.4, 0.5, 0, () => {
    // Ram: två sidoskenor + ben (z = framåt mot lagunen).
    for (const sx of [-0.4, 0.4]) {
      add(S, 'turquoise', box(0.06, 0.06, 1.3), sx, 0.36, 0, 0.12);
      add(S, 'turquoise', box(0.06, 0.45, 0.06), sx, 0.2, 0.55);
      add(S, 'turquoise', box(0.06, 0.55, 0.06), sx, 0.27, -0.2, -0.45);
    }
    // Sits och ryggstöd: tre ränder (korall/grädde/korall) tvärs över.
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 0.26;
      const key = i === 1 ? 'cream' : 'coral';
      add(S, key, box(0.25, 0.04, 0.85), sx, 0.36, 0.2, 0.15);
      add(S, key, box(0.25, 0.04, 1.0), sx, 0.78, -0.55, 1.0);
    }
    // Ett citronklyfta-kuddväsen på stolen.
    lemon(S, 0, 0.5, 0.15, 0.1, 0, 0.3);
  });

  // --- Bygg meshar av hinkarna ---
  const staticMeshes = [];
  for (const { key, parts } of buckets.values()) {
    const mesh = new THREE.Mesh(merged(parts), M[key]);
    group.add(mesh);
    staticMeshes.push(mesh);
  }

  // ===== Badringen som guppar i lagunen (det enda som rör sig) =====
  const ring = new THREE.Group();
  ring.position.set(LAGOON.x, 0.14, LAGOON.z);
  const inner = new THREE.Group();
  inner.rotation.x = Math.PI / 2; // Torusen ligger i xy-planet: lägg den platt.
  const body = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.2, 7, 18), M.coral);
  const stripeParts = [];
  for (let i = 0; i < 4; i++) { // Fyra gräddvita fält runt ringen.
    const g = new THREE.TorusGeometry(0.6, 0.215, 7, 5, Math.PI / 4).rotateZ(i * Math.PI / 2 + 0.2);
    stripeParts.push(g.index ? g.toNonIndexed() : g);
  }
  const stripes = new THREE.Mesh(merged(stripeParts), M.cream);
  inner.add(body, stripes);
  ring.add(inner);
  group.add(ring);

  group.userData.update = (t) => {
    ring.position.y = 0.14 + Math.sin(t * 1.4) * 0.05;
    ring.rotation.z = Math.sin(t * 0.9) * 0.05;
    ring.rotation.x = Math.sin(t * 1.1 + 1) * 0.05;
    ring.rotation.y = t * 0.12;
  };

  // --- Kollision och blobskuggor (lokala koordinater) ---
  const obstacles = [
    // Kiosken: tre fasta cirklar längs disken/baksidan.
    { x: KIOSK.x - 0.3, z: KIOSK.z - 1.1, r: 0.95, soft: false },
    { x: KIOSK.x - 0.3, z: KIOSK.z, r: 0.95, soft: false },
    { x: KIOSK.x - 0.3, z: KIOSK.z + 1.1, r: 0.95, soft: false },
    // Trädstammarna.
    { x: TREE_A.x, z: TREE_A.z, r: 0.42, soft: false },
    { x: TREE_B.x, z: TREE_B.z, r: 0.45, soft: false },
    // Lådorna.
    { x: 8.15, z: -3.2, r: 1.0, soft: false },
    // Parasollstången, solstolen och badringen: bilen får köra på dem med en duns.
    { x: 6.0, z: 2.6, r: 0.35, soft: true },
    { x: 4.1, z: -2.4, r: 0.55, soft: true },
    { x: LAGOON.x, z: LAGOON.z, r: 0.65, soft: true },
  ];
  const shadows = [
    { x: KIOSK.x, z: KIOSK.z, r: 2.1 },
    { x: TREE_A.x, z: TREE_A.z, r: 1.2 },
    { x: TREE_B.x, z: TREE_B.z, r: 1.3 },
    { x: 8.15, z: -3.2, r: 1.1 },
    { x: 6.1, z: 2.6, r: 1.2 },
    { x: 4.1, z: -2.4, r: 0.75 },
  ];

  return { group, obstacles, shadows };
}
