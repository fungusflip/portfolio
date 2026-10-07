// ============================================================================
// seasonfx.js — det som säsongen (season.js) lägger till i hemvärlden: smashbara pumpor, pumpalyktor,
// spindelnät, kusligt sken vid grottorna, dimma över dammen, fladdermöss och drivande partiklar
// (snö, kronblad, löv, gnistor). Allt byggs procedurellt, utan nedladdningar.
// ============================================================================
// Importeras av main.js BARA när någon regel ändrar något (seasonActive). Varje del bygger bara om dess
// nyckel finns i configen (props, caveTint, pondMist, particles), så utan säsong händer ingenting alls.
// Körs före hub.buildHubCollision, eftersom lyktornas knock() lindas in här innan kollisionen hämtar den.
import * as THREE from 'three';
import { WORLDS, BILLBOARD_FACING, CAMERA_PITCH, currentWorld, makeGlowMaterial } from './core.js';
import { CABIN_X, CABIN_Z, CABIN_SIZE, GARAGE_DEPTH, homeGroup, hubPoint } from './home.js';
import { PORTALS } from './portals.js';
import { addObstacles, overlapsObstacle } from './collision.js';
import { knockableObject } from './knockables.js';
import { markMoving } from './optimize.js';
import { getSeasonState, rampFactor } from './season.js';
import {
  hub, hubGroup, seededRandom, canvasTexture, updaters, spotOk, smashThing, shardGroup, blobTexture,
} from './seasonkit.js';

const DRIFT_AREA = 26;  // Halva sidan på lådan runt bilen där partiklarna finns.
const DRIFT_TOP = 14;   // Hur högt upp de börjar.

// ============================================================================
// Drivande partiklar: snö, kronblad, löv, gnistor. En InstancedMesh per sort (ett ritanrop var).
// ============================================================================
const driftGeometries = {
  flake: () => new THREE.CircleGeometry(0.5, 6),
  petal: () => new THREE.CircleGeometry(0.5, 8).scale(0.6, 1, 1),
  spark: () => new THREE.CircleGeometry(0.5, 5),
  leaf: () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.lineTo(0.32, 0);
    shape.lineTo(0, 0.5);
    shape.lineTo(-0.32, 0);
    return new THREE.ShapeGeometry(shape);
  },
};

function buildDrift(options) {
  const { kind = 'flake', count = 100, colors = ['#ffffff'], fall = 1, sway = 0.5, size = 0.15 } = options;
  const additive = kind === 'spark';
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: additive,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.InstancedMesh((driftGeometries[kind] || driftGeometries.flake)(), material, count);
  mesh.frustumCulled = false; // De flyttar sig hela tiden.
  mesh.userData.noShadow = true;
  const palette = colors.map((hex) => new THREE.Color(hex));
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      x: (Math.random() - 0.5) * 2 * DRIFT_AREA,
      y: Math.random() * DRIFT_TOP,
      z: (Math.random() - 0.5) * 2 * DRIFT_AREA,
      speed: 0.6 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 4,
      scale: size * (0.7 + Math.random() * 0.6),
    });
    mesh.setColorAt(i, palette[i % palette.length]);
  }
  mesh.instanceColor.needsUpdate = true;
  hubGroup().parent.add(mesh); // Direkt i scenen (som löven i leaves.js), men syns bara hemma.
  const dummy = new THREE.Object3D();
  let time = 0;
  updaters.push((delta, car) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    time += delta;
    items.forEach((p, i) => {
      p.y -= fall * p.speed * delta;
      if (p.y < 0.1) p.y = DRIFT_TOP;
      else if (p.y > DRIFT_TOP) p.y = 0.1;
      p.x += Math.sin(time * 0.7 + p.phase) * sway * delta;
      p.z += Math.cos(time * 0.5 + p.phase * 1.3) * sway * 0.6 * delta;
      // Håll dem i lådan runt bilen: går de över kanten flyttas de till andra sidan.
      if (p.x - car.x > DRIFT_AREA) p.x -= 2 * DRIFT_AREA; else if (p.x - car.x < -DRIFT_AREA) p.x += 2 * DRIFT_AREA;
      if (p.z - car.z > DRIFT_AREA) p.z -= 2 * DRIFT_AREA; else if (p.z - car.z < -DRIFT_AREA) p.z += 2 * DRIFT_AREA;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.phase + time * p.spin, time * p.spin * 0.7, p.phase);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// Pumpor
// ============================================================================
// En pumpa: en klot med revben, hopplattad. Radie 0.5, höjd ca 0.82.
function makePumpkinGeometry() {
  const geometry = new THREE.SphereGeometry(0.5, 18, 12);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const rib = 1 + 0.09 * Math.cos(Math.atan2(z, x) * 8);
    position.setXYZ(i, x * rib, position.getY(i) * 0.82, z * rib);
  }
  geometry.computeVertexNormals();
  return geometry;
}
const pumpkinGeometry = makePumpkinGeometry();
const stemGeometry = new THREE.CylinderGeometry(0.05, 0.08, 0.17, 6).translate(0, 0.44, 0);
const pumpkinMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#3a1100' });
const stemMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
const STEM_COLOR = new THREE.Color('#5d6b2a');

const shardGeometry = new THREE.BoxGeometry(0.34, 0.09, 0.24);
const seedGeometry = new THREE.BoxGeometry(0.1, 0.03, 0.05);

function smashPumpkin(pumpkin, props, dirX, dirZ, strength) {
  pumpkin.hide();
  const shell = new THREE.MeshLambertMaterial({ color: pumpkin.color, side: THREE.DoubleSide });
  const pulp = new THREE.MeshLambertMaterial({ color: props.pulpColor || '#f4b04a' });
  const seed = new THREE.MeshLambertMaterial({ color: props.seedColor || '#f5ecc8' });
  const stem = new THREE.MeshLambertMaterial({ color: STEM_COLOR });
  const parts = [
    ...Array.from({ length: 6 }, () => ({ geometry: shardGeometry, material: shell, size: 0.7 + Math.random() * 0.5 })),
    ...Array.from({ length: 4 }, () => ({ geometry: shardGeometry, material: pulp, size: 0.4 + Math.random() * 0.3 })),
    ...Array.from({ length: 6 }, () => ({ geometry: seedGeometry, material: seed, size: 1, resting: 0.03 })),
    { geometry: stemGeometry, material: stem, size: 0.8, resting: 0.06 },
  ];
  smashThing({ x: pumpkin.x, z: pumpkin.z, s: pumpkin.s, dirX, dirZ, strength, parts, splat: { texture: blobTexture('#e8801e', '#f4b04a', 5), size: 2.1, opacity: 0.9 } });
}


function buildPumpkins(ctx, config, factor) {
  const props = config.props;
  const setup = props.pumpkins;
  const count = Math.max(3, Math.round(setup.count * factor));
  const random = seededRandom(1031);
  let placed = [];
  // Hälften nära träd (där löven ligger), resten ute på gräset.
  for (let attempt = 0; attempt < count * 60 && placed.length < count; attempt++) {
    let x;
    let z;
    if (placed.length % 2 === 0 && ctx.trees.length) {
      const tree = ctx.trees[Math.floor(random() * ctx.trees.length)];
      const angle = random() * Math.PI * 2;
      const reach = 2.4 + random() * 3;
      x = tree.x + Math.cos(angle) * reach;
      z = tree.z + Math.sin(angle) * reach;
    } else {
      const spot = hubPoint(-55 + random() * 110, 3 + random() * 54);
      x = spot.x;
      z = spot.z;
    }
    const s = 0.7 + random() * 0.65;
    const footprint = 0.45 + 0.25 * s; // Pumpans riktiga radie (samma som hindret).
    if (!spotOk(x, z, ctx, placed, setup.minGap, 1.7, footprint + 0.5)) continue;
    placed.push({ x, z, s, yaw: random() * 6.3, color: new THREE.Color(setup.colors[Math.floor(random() * setup.colors.length)]) });
  }
  // Sista kontrollen mot alla hinder med riktig radie (lyktor, skyltar, prydnad ...).
  placed = placed.filter((pumpkin) => !overlapsObstacle(pumpkin.x, pumpkin.z, 0.45 + 0.25 * pumpkin.s + 0.3));
  if (!placed.length) return;
  const bodies = new THREE.InstancedMesh(pumpkinGeometry, pumpkinMaterial, placed.length);
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, placed.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const spot = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const obstacles = [];
  placed.forEach((pumpkin, i) => {
    quaternion.setFromAxisAngle(up, pumpkin.yaw);
    matrix.compose(spot.set(pumpkin.x, 0.41 * pumpkin.s - 0.03, pumpkin.z), quaternion, scale.setScalar(pumpkin.s));
    bodies.setMatrixAt(i, matrix);
    stems.setMatrixAt(i, matrix);
    bodies.setColorAt(i, pumpkin.color);
    stems.setColorAt(i, STEM_COLOR);
    pumpkin.hide = () => {
      matrix.makeScale(0, 0, 0);
      bodies.setMatrixAt(i, matrix);
      stems.setMatrixAt(i, matrix);
      bodies.instanceMatrix.needsUpdate = true;
      stems.instanceMatrix.needsUpdate = true;
    };
    // Mjukt hinder (collision.js): bilen kör igenom, pumpan krossas och blir liggande.
    obstacles.push({
      x: pumpkin.x, z: pumpkin.z, radius: 0.45 + 0.25 * pumpkin.s, soft: true, kind: 'pumpkin', once: true,
      onHit: (dirX, dirZ, strength) => smashPumpkin(pumpkin, props, dirX, dirZ, strength),
    });
  });
  bodies.instanceMatrix.needsUpdate = true;
  stems.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = true;
  stems.instanceColor.needsUpdate = true;
  bodies.frustumCulled = false;
  stems.frustumCulled = false;
  hubGroup().add(bodies, stems);
  addObstacles(obstacles);
}

// ============================================================================
// Pumpalyktor: ett glödande ansikte på några lyktstolpar
// ============================================================================
function faceTexture() {
  return canvasTexture(128, (pen, n) => {
    pen.shadowColor = '#ffb030';
    pen.shadowBlur = 10;
    pen.fillStyle = '#ffe27a';
    for (const side of [-1, 1]) { // Två triangelögon.
      pen.beginPath();
      pen.moveTo(n / 2 + side * n * 0.2, n * 0.28);
      pen.lineTo(n / 2 + side * n * 0.34, n * 0.46);
      pen.lineTo(n / 2 + side * n * 0.08, n * 0.46);
      pen.fill();
    }
    pen.beginPath(); // Näsan.
    pen.moveTo(n / 2, n * 0.5);
    pen.lineTo(n / 2 + n * 0.05, n * 0.6);
    pen.lineTo(n / 2 - n * 0.05, n * 0.6);
    pen.fill();
    pen.beginPath(); // Munnen med tänder.
    pen.moveTo(n * 0.22, n * 0.66);
    for (let i = 0; i <= 6; i++) pen.lineTo(n * (0.22 + i * 0.093), n * (i % 2 ? 0.8 : 0.7));
    for (let i = 6; i >= 0; i--) pen.lineTo(n * (0.22 + i * 0.093), n * 0.74 + (i % 2 ? 0 : 0.0));
    pen.fill();
  });
}

function buildLampPumpkins(ctx, config, factor) {
  const lamps = ctx.lamps;
  const wanted = Math.min(lamps.length, Math.max(1, Math.ceil(config.props.lampPumpkins * factor)));
  const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false });
  const glowMaterial = makeGlowMaterial(0.8);
  glowMaterial.color.set('#ff9a2a');
  const faceGeometry = new THREE.PlaneGeometry(0.62, 0.62);
  const glowGeometry = new THREE.PlaneGeometry(2.2, 2.2);
  const towardX = Math.sin(BILLBOARD_FACING);
  const towardZ = Math.cos(BILLBOARD_FACING);
  const pumpkinColor = new THREE.MeshLambertMaterial({ color: '#e8731a', emissive: '#3a1100' });
  const stemColor = new THREE.MeshLambertMaterial({ color: STEM_COLOR });
  const HANG = 0.66; // Pumpans mitt från stolpens mitt: pumpans radie (0.48) + stolpen + lite luft.
  const bracketGeometry = new THREE.CylinderGeometry(0.03, 0.03, HANG, 6).rotateX(Math.PI / 2);
  for (let n = 0; n < wanted; n++) {
    const lamp = lamps[Math.floor(((n + 0.5) * lamps.length) / wanted)];
    // En grupp med foten i stolpens fot, så att den kan välta med stolpen (knockableObject).
    const group = new THREE.Group();
    group.position.set(lamp.at.x, 0, lamp.at.z);
    markMoving(group);
    const body = new THREE.Mesh(pumpkinGeometry, pumpkinColor);
    body.scale.setScalar(0.95);
    body.position.set(towardX * HANG, 2.3, towardZ * HANG);
    const stem = new THREE.Mesh(stemGeometry, stemColor);
    stem.scale.setScalar(0.95);
    stem.position.copy(body.position);
    const face = new THREE.Mesh(faceGeometry, faceMaterial);
    face.position.set(towardX * HANG, 2.3, towardZ * HANG).addScaledVector(new THREE.Vector3(towardX, 0, towardZ), 0.4);
    face.rotation.set(-CAMERA_PITCH, BILLBOARD_FACING, 0, 'YXZ');
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.copy(face.position);
    glow.rotation.copy(face.rotation);
    glow.userData.noShadow = true;
    face.userData.noShadow = true;
    const bracket = new THREE.Mesh(bracketGeometry, stemColor); // Fäste från stolpen, så att pumpan hänger bredvid den.
    bracket.position.set(towardX * HANG * 0.5, 2.3, towardZ * HANG * 0.5);
    bracket.rotation.y = BILLBOARD_FACING;
    group.add(body, stem, bracket, face, glow);
    hubGroup().add(group);
    const fall = knockableObject(group);
    lamp.onKnock = (dirX, dirZ) => fall(dirX, dirZ); // Pumpan följer med när lyktan välter (se prepareSeasonFx).
  }
  let time = 0;
  updaters.push((delta) => { // Levande sken: ett lugnt flimmer.
    time += delta;
    const flicker = 0.8 + 0.12 * Math.sin(time * 9) + 0.08 * Math.sin(time * 23.7);
    faceMaterial.opacity = flicker;
    glowMaterial.opacity = flicker;
  });
}

// ============================================================================
// Spindelnät i hörnen på stugan och garaget
// ============================================================================
function buildCobwebs() {
  const texture = canvasTexture(128, (pen, n) => {
    pen.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    pen.lineWidth = 1.6;
    const rays = [0.05, 0.3, 0.55, 0.8, 1.05, 1.3, 1.5].map((a) => a * 1.0);
    for (const angle of rays) { // Trådar ut från hörnet uppe till vänster.
      pen.beginPath();
      pen.moveTo(1, 1);
      pen.lineTo(1 + Math.cos(angle) * n * 1.05, 1 + Math.sin(angle) * n * 1.05);
      pen.stroke();
    }
    for (let ring = 1; ring <= 5; ring++) { // Hängande bågar mellan trådarna.
      pen.beginPath();
      rays.forEach((angle, i) => {
        const r = ring * n * 0.19 * (1 - 0.1 * Math.sin(i * 2));
        const px = 1 + Math.cos(angle) * r;
        const py = 1 + Math.sin(angle) * r;
        if (i === 0) pen.moveTo(px, py);
        else pen.quadraticCurveTo(1 + Math.cos((angle + rays[i - 1]) / 2) * r * 0.82, 1 + Math.sin((angle + rays[i - 1]) / 2) * r * 0.82, px, py);
      });
      pen.stroke();
    }
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const geometry = new THREE.PlaneGeometry(1, 1);
  // [hörnets x, hörnets y, väggens z, storlek, spegelvänd]: i hemgruppens led (home.js).
  const cabinFront = CABIN_Z + CABIN_SIZE / 2 + 0.12;
  const garageFront = GARAGE_DEPTH / 2 + 0.12;
  const webs = [
    [CABIN_X - CABIN_SIZE / 2 + 0.05, 3.7, cabinFront, 1.0, false],
    [CABIN_X + CABIN_SIZE / 2 - 0.05, 3.7, cabinFront, 0.8, true],
    [-2.75, 2.5, garageFront, 0.9, false],
    [2.75, 2.5, garageFront, 0.9, true],
  ];
  for (const [x, y, z, size, mirror] of webs) {
    const web = new THREE.Mesh(geometry, material);
    web.scale.set(mirror ? -size : size, size, 1);
    web.position.set(x + (mirror ? -size / 2 : size / 2), y - size / 2, z);
    web.userData.noShadow = true;
    homeGroup.add(web);
  }
}

// ============================================================================
// Kusligt sken vid grottöppningarna
// ============================================================================
function buildCaveTint(config, factor) {
  const { color, strength } = config.caveTint;
  const amount = strength * (0.4 + 0.6 * factor);
  const tint = new THREE.Color(color);
  const haloMaterial = makeGlowMaterial(0.9);
  const poolMaterial = makeGlowMaterial(0.7);
  const haloGeometry = new THREE.PlaneGeometry(7, 7);
  const poolGeometry = new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2);
  for (const portal of PORTALS) {
    if (portal.world !== hub || portal.style !== 'cave') continue;
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.set(portal.door.x, 2.2, portal.door.z);
    halo.rotation.set(-CAMERA_PITCH, BILLBOARD_FACING, 0, 'YXZ');
    const pool = new THREE.Mesh(poolGeometry, poolMaterial);
    pool.position.set(portal.door.x, 0.1, portal.door.z);
    halo.userData.noShadow = true;
    pool.userData.noShadow = true;
    hubGroup().add(halo, pool);
  }
  let time = 0;
  updaters.push((delta) => {
    time += delta;
    const pulse = amount * (0.7 + 0.3 * Math.sin(time * 1.3));
    haloMaterial.color.copy(tint).multiplyScalar(pulse * 0.55);
    poolMaterial.color.copy(tint).multiplyScalar(pulse * 0.7);
  });
}

// ============================================================================
// Lätt dimma över dammen: stora mjuka fläckar som sakta glider
// ============================================================================
function buildPondMist(config, factor) {
  const { count, color, opacity } = config.pondMist;
  const n = Math.max(2, Math.ceil(count * factor));
  const texture = canvasTexture(128, (pen, size) => {
    const gradient = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pen.fillStyle = gradient;
    pen.fillRect(0, 0, size, size);
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false });
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const centre = hubPoint(-26.5, 29.2); // Dammen (hubprops.js: POND_X).
  const random = seededRandom(77);
  const sprites = [];
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    const size = 7 + random() * 4;
    mesh.scale.set(size, 1, size * 0.8);
    mesh.userData.noShadow = true;
    mesh.renderOrder = 2;
    const base = { x: centre.x + (random() - 0.5) * 11, z: centre.z + (random() - 0.5) * 6, phase: random() * 6.3, y: 0.5 + i * 0.03 };
    mesh.position.set(base.x, base.y, base.z);
    hubGroup().add(mesh);
    sprites.push({ mesh, base });
  }
  let time = 0;
  updaters.push((delta) => {
    time += delta;
    for (const { mesh, base } of sprites) {
      mesh.position.x = base.x + Math.sin(time * 0.15 + base.phase) * 1.6;
      mesh.position.z = base.z + Math.cos(time * 0.12 + base.phase) * 0.9;
      mesh.rotation.y = time * 0.03 + base.phase;
    }
  });
}

// ============================================================================
// Fladdermöss som kretsar över några träd
// ============================================================================
function batGeometry() {
  const vertices = [];
  const indices = [];
  for (const side of [-1, 1]) { // Varje vinge: en fyrkant med spetsen uppåt (V-form sett framifrån).
    const base = vertices.length / 3;
    vertices.push(0, 0, 0.14, side * 0.62, 0.14, 0.2, side * 0.46, 0.04, -0.16, 0, 0, -0.12);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const base = vertices.length / 3; // Kroppen.
  vertices.push(0, 0.02, 0.26, -0.07, 0.02, -0.14, 0.07, 0.02, -0.14);
  indices.push(base, base + 1, base + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildBats(ctx, config, factor) {
  const setup = config.particles.bats;
  const treeCount = Math.max(1, Math.ceil(setup.trees * factor));
  const spread = ctx.trees.filter((tree, i) => i % Math.max(1, Math.floor(ctx.trees.length / treeCount)) === 0).slice(0, treeCount);
  const bats = [];
  const random = seededRandom(1013);
  for (const tree of spread) {
    for (let k = 0; k < setup.perTree; k++) {
      bats.push({ tree, radius: 3 + random() * 2.5, angle: random() * 6.3, speed: (0.5 + random() * 0.5) * (random() < 0.5 ? -1 : 1), height: 6.2 + random() * 1.6, flap: random() * 6.3 });
    }
  }
  if (!bats.length) return;
  const mesh = new THREE.InstancedMesh(batGeometry(), new THREE.MeshBasicMaterial({ color: setup.color, side: THREE.DoubleSide }), bats.length);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  hubGroup().add(mesh);
  markMoving(mesh);
  const dummy = new THREE.Object3D();
  let time = 0;
  updaters.push((delta) => {
    if (currentWorld !== hub) return;
    time += delta;
    bats.forEach((bat, i) => {
      bat.angle += (bat.speed / bat.radius) * 2.4 * delta;
      dummy.position.set(
        bat.tree.x + Math.cos(bat.angle) * bat.radius,
        bat.height + Math.sin(time * 1.3 + bat.flap) * 0.5,
        bat.tree.z + Math.sin(bat.angle) * bat.radius
      );
      dummy.rotation.set(0, -bat.angle + (bat.speed > 0 ? 0 : Math.PI), Math.sin(time * 1.3 + bat.flap) * 0.2);
      dummy.scale.set(0.55 + 0.45 * Math.abs(Math.sin(time * 14 + bat.flap)), 1, 1); // Vingslag: vingarnas bredd.
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// Hook-API för säsongsmoduler
// ============================================================================
// Varje säsongs extra saker ligger i en EGEN fil som seasonfx.js bara hämtar när den gällande configen ber om det:
//   config.modules = { winter: true }          -> js/season-winter.js
//   config.modules = { 'spring-summer': true } -> js/season-spring-summer.js
//   config.modules = { autumn: true }          -> js/season-autumn.js
// (modules slås ihop mellan regler som övriga nycklar, så flera kan vara på samtidigt.) En modulfil exporterar
// som default (eller anropar registerSeasonModule själv) ett objekt, alla fält valfria:
//   { name,
//     prepare(ctx, config)       - före buildHubCollision (t.ex. haka på lamp.onKnock),
//     build(ctx, config)         - efter buildHubCollision: lägg ut saker, addObstacles, addUpdater ...,
//     afterOptimize(config)      - efter optimizeWorld(hub): byt skuggare på färdiga material (snö på det som vetter uppåt),
//     update(delta, car, config) - varje bild (car = bilens position) }
// ctx = { roads, lamps, signposts, trees }. Gemensamma verktyg (platsprov, krossa-animation, uppdateringslista,
// slumptal, texturer) finns i js/seasonkit.js. Halloween ligger kvar här i seasonfx.js.
const MODULE_FILES = {
  winter: () => import('./season-winter.js'),
  'spring-summer': () => import('./season-spring-summer.js'),
  autumn: () => import('./season-autumn.js'),
};
const modules = [];
export function registerSeasonModule(module) {
  if (module && !modules.includes(module)) modules.push(module);
}

// Steg 1, före hub.buildHubCollision: hämtar modulerna, lindar in lyktornas knock och låter modulerna förbereda sig.
export async function prepareSeasonFx(ctx) {
  const config = getSeasonState().config;
  hubGroup().add(shardGroup);
  for (const lamp of ctx.lamps) { // collision.js hämtar lamp.knock när hindren byggs: andra moduler hakar på lamp.onKnock.
    const original = lamp.knock;
    lamp.knock = (dirX, dirZ, strength) => {
      if (original) original(dirX, dirZ, strength);
      if (lamp.onKnock) lamp.onKnock(dirX, dirZ, strength);
    };
  }
  for (const name of Object.keys(config.modules || {})) {
    if (!config.modules[name] || !MODULE_FILES[name]) continue;
    registerSeasonModule((await MODULE_FILES[name]()).default);
  }
  for (const module of modules) if (module.prepare) module.prepare(ctx, config);
}

// Steg 2, efter hub.buildHubCollision (alla hinder finns, så platsprov kan titta på dem).
// ctx = { roads, lamps, signposts, trees } (det hub.buildHubRoads/buildHubTrees lämnar).
export function buildSeasonFx(ctx) {
  const state = getSeasonState();
  const config = state.config;
  const factor = rampFactor(); // Växande händelse (Halloween): 0.25 vecka 1 ... 1 vecka 4.
  const drift = config.particles && config.particles.drift;
  if (drift) for (const name of Object.keys(drift)) buildDrift(drift[name]);
  if (config.particles && config.particles.bats) buildBats(ctx, config, factor);
  if (config.props && config.props.pumpkins) buildPumpkins(ctx, config, factor);
  if (config.props && config.props.lampPumpkins) buildLampPumpkins(ctx, config, factor);
  if (config.props && config.props.cobwebs && factor >= 0.5) buildCobwebs();
  if (config.caveTint) buildCaveTint(config, factor);
  if (config.pondMist) buildPondMist(config, factor);
  for (const module of modules) if (module.build) module.build(ctx, config);
}

// Steg 3, efter optimizeWorld(hub) och före prepareWorld.
export function afterOptimizeSeasonFx() {
  const config = getSeasonState().config;
  for (const module of modules) if (module.afterOptimize) module.afterOptimize(config);
}

// Körs en gång per bild (main.js).
export function updateSeasonFx(delta, carPosition) {
  for (const update of updaters) update(delta, carPosition);
  const config = getSeasonState().config;
  for (const module of modules) if (module.update) module.update(delta, carPosition, config);
}
