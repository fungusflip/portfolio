// ============================================================================
// season-spring-summer.js — vår och sommar i hemvärlden (regler i season.js: spring, rainy-spring, summer).
// ============================================================================
// VÅR: vattenpuss på vägarna som skvätter när bilen kör igenom, blöta vägar, vildblommor och kronblad på gräset,
//      blommande träd (rosa kronblad som faller), mossfläckar, fjärilar, ibland en regnbåge. Regnig vår: regn,
//      ringar i vattnet och mörka, våta vägar.
// SOMMAR: damm på vägarna och dammoln bakom bilen, ljusare blommor, fjärilar, trollsländor vid dammen,
//      eldflugor och lite varmluft som dallrar.
// Utanför de säsongerna gör filen ingenting alls (buildSpringSummer återvänder direkt).
// Allt byggs procedurellt med begränsade antal. Inget ändrar trädens färger eller lövhögar (det sköter season.js).
// Hämtas av seasonfx.js via hook-API:t (config.modules['spring-summer'], se season.js).
import * as THREE from 'three';
import {
  scene, WORLDS, HUB_X, HUB_Z, DRIVE_RADIUS, BILLBOARD_FACING, CAMERA_PITCH, currentWorld, worldGroup,
} from './core.js';
import { PROJECTS } from './projects.js';
import { ROAD_WIDTH, distanceToRoad } from './roads.js';
import { HOME_X, HOME_Z, hubPoint } from './home.js';
import { PORTALS } from './portals.js';
import { hubPropObstacles, hubGrassFree, distanceToWater } from './hubprops.js';
import { markMoving } from './optimize.js';
import { car as carModel, speed } from './car.js';
import { hasRule } from './season.js';
import { seededRandom, canvasTexture } from './seasonkit.js';

const hub = WORLDS.hub;
const BOX = 22; // Halva sidan på lådan runt bilen där rörliga saker (regn, eldflugor, damm) finns.

let state = null; // { spring, rainy, summer, ctx, random, updaters }
const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(-CAMERA_PITCH, BILLBOARD_FACING, 0, 'YXZ')); // Vänd mot kameran.
const hubGroup = () => worldGroup(hub);

// --- Små hjälpmedel ---
const softTexture = () => canvasTexture(64, (pen, n) => { // Mjuk rund fläck, vit mitt.
  const g = pen.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  pen.fillStyle = g;
  pen.fillRect(0, 0, n, n);
});

// Står vi på gräs där inget annat står? (liknar pumpornas kontroll i seasonfx.js, men med mindre marginaler)
function grassSpotOk(x, z, ctx, roadMargin = 1.2) {
  if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS - 5) return false;
  if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) return false;
  if (ctx.roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + roadMargin)) return false;
  if (PORTALS.some((portal) => portal.world === hub && portal.style === 'cave' && (Math.hypot(x - portal.center.x, z - portal.center.z) < 12 || Math.hypot(x - portal.door.x, z - portal.door.z) < 8))) return false;
  if (PROJECTS.some((project) => project.world === hub && Math.hypot(x - project.x, z - project.z) < 6)) return false;
  if (hubPropObstacles.some((prop) => Math.hypot(x - prop.x, z - prop.z) < prop.radius + 0.8)) return false;
  if (hubGrassFree.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + 0.5)) return false;
  if (distanceToWater(x, z) < 1.5) return false;
  return !ctx.trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 1.1 * tree.scale);
}
function randomGrassSpot(random, ctx, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const spot = hubPoint(-55 + random() * 110, 3 + random() * 54);
    if (grassSpotOk(spot.x, spot.z, ctx)) return spot;
  }
  return null;
}

// En pool av små kameravända partiklar i EN InstancedMesh. emit() startar en, update() flyttar dem.
function makeParticlePool(count, geometry, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const items = Array.from({ length: count }, () => ({ life: 0 }));
  items.forEach((_, i) => mesh.setMatrixAt(i, zero));
  scene.add(mesh);
  let next = 0;
  return {
    mesh,
    emit(x, y, z, vx, vy, vz, life, size) {
      const p = items[next];
      next = (next + 1) % count;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.size = size;
    },
    update(delta, gravity) {
      mesh.visible = currentWorld === hub;
      if (!mesh.visible) return;
      items.forEach((p, i) => {
        if (p.life <= 0) { mesh.setMatrixAt(i, zero); return; }
        p.life -= delta;
        p.vy -= gravity * delta;
        p.x += p.vx * delta; p.y += p.vy * delta; p.z += p.vz * delta;
        if (p.y < 0.05) { p.y = 0.05; p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; }
        dummy.position.set(p.x, p.y, p.z);
        dummy.quaternion.copy(facing);
        dummy.scale.setScalar(Math.max(0.001, p.size * Math.min(1, (p.life / p.max) * 1.6)));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Håller en punkt i lådan runt bilen: går den över kanten flyttas den till andra sidan.
function wrapAround(p, car, area = BOX) {
  while (p.x - car.x > area) p.x -= 2 * area;
  while (p.x - car.x < -area) p.x += 2 * area;
  while (p.z - car.z > area) p.z -= 2 * area;
  while (p.z - car.z < -area) p.z += 2 * area;
}

// Bilens bakkant och framåtriktning (heading: PI/4 = uppåt på skärmen, se car.js).
function carFrame(car) {
  const fx = Math.sin(carModel.rotation.y);
  const fz = Math.cos(carModel.rotation.y);
  return { fx, fz, rx: car.x - fx * 1.4, rz: car.z - fz * 1.4 };
}
const onRoad = (ctx, x, z) => ctx.roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2);

// ============================================================================
// VÅR: vattenpuss, våta vägar, skvätt
// ============================================================================
function puddleTexture() {
  return canvasTexture(128, (pen, n) => {
    pen.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.1) {
      const r = n * (0.4 + 0.05 * Math.sin(a * 3 + 1) + 0.03 * Math.sin(a * 7));
      pen[a === 0 ? 'moveTo' : 'lineTo'](n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r);
    }
    const g = pen.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n * 0.45);
    g.addColorStop(0, 'rgba(150,180,215,0.95)');
    g.addColorStop(0.8, 'rgba(95,120,155,0.9)');
    g.addColorStop(1, 'rgba(70,90,120,0.55)');
    pen.fillStyle = g;
    pen.fill();
    pen.strokeStyle = 'rgba(255,255,255,0.4)'; // Ett ljust streck: himlen som speglar sig.
    pen.lineWidth = 3;
    pen.beginPath();
    pen.moveTo(n * 0.3, n * 0.42);
    pen.lineTo(n * 0.55, n * 0.36);
    pen.stroke();
  });
}

function buildPuddles(ctx, rainy) {
  const random = seededRandom(404);
  const roads = ctx.roads.filter((road) => Math.hypot(road.to.x - road.from.x, road.to.z - road.from.z) > 8);
  const count = rainy ? 26 : 14;
  const texture = puddleTexture();
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: rainy ? 0.95 : 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const haloMaterial = new THREE.MeshBasicMaterial({ map: softTexture(), color: '#000000', transparent: true, opacity: rainy ? 0.35 : 0.28, depthWrite: false });
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const puddles = [];
  for (let i = 0; i < count && roads.length; i++) {
    const road = roads[Math.floor(random() * roads.length)];
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    const t = 0.1 + random() * 0.8;
    const side = (random() - 0.5) * ((road.width || ROAD_WIDTH) - 2.4);
    const x = road.from.x + dx * t + (-dz / length) * side;
    const z = road.from.z + dz * t + (dx / length) * side;
    if (Math.hypot(x - HOME_X, z - HOME_Z) < 6 || puddles.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
    const radius = 0.9 + random() * 0.9;
    const puddle = new THREE.Mesh(geometry, material);
    puddle.scale.set(radius * 2.2, 1, radius * 1.6);
    puddle.rotation.y = Math.atan2(dx, dz) + (random() - 0.5) * 0.4;
    puddle.position.set(x, 0.05, z);
    puddle.renderOrder = -4;
    const halo = new THREE.Mesh(geometry, haloMaterial); // Våt, mörk kant runt vattnet.
    halo.scale.set(radius * 4.2, 1, radius * 3.4);
    halo.rotation.y = puddle.rotation.y;
    halo.position.set(x, 0.045, z);
    halo.renderOrder = -4.1;
    for (const mesh of [puddle, halo]) { mesh.userData.noShadow = true; markMoving(mesh); }
    hubGroup().add(halo, puddle);
    puddles.push({ x, z, radius: radius * 0.95 });
  }
  // Skvätt: vattendroppar som flyger upp och faller.
  const drops = makeParticlePool(110, new THREE.CircleGeometry(0.5, 6), new THREE.MeshBasicMaterial({ color: '#d6e8ff', transparent: true, opacity: 0.85, depthWrite: false }));
  let cooldown = 0;
  state.updaters.push((delta, car) => {
    drops.update(delta, 16);
    cooldown -= delta;
    if (cooldown > 0 || Math.abs(speed) < 2.5 || currentWorld !== hub) return;
    const frame = carFrame(car);
    for (const puddle of puddles) {
      if (Math.hypot(car.x - puddle.x, car.z - puddle.z) > puddle.radius + 0.6) continue;
      cooldown = 0.04;
      const power = Math.min(1, Math.abs(speed) / 14);
      for (let k = 0; k < 4; k++) { // Från båda sidorna av bilen, mest framåt-utåt.
        const side = k % 2 ? 1 : -1;
        const sx = -frame.fz * side;
        const sz = frame.fx * side;
        drops.emit(
          car.x + sx * 0.8, 0.2, car.z + sz * 0.8,
          sx * (1.5 + Math.random() * 2.5) + frame.fx * speed * 0.15, (2 + Math.random() * 3) * (0.5 + power), sz * (1.5 + Math.random() * 2.5) + frame.fz * speed * 0.15,
          0.5 + Math.random() * 0.4, 0.1 + Math.random() * 0.1
        );
      }
      break;
    }
  });
}

// Hela vägnätet mörkare och blankt när det regnar.
function buildWetRoads(ctx) {
  const material = new THREE.MeshBasicMaterial({ color: '#0a1020', transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  ctx.roads.forEach((road) => {
    const width = (road.width || ROAD_WIDTH) - 0.3;
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
    strip.position.set((road.from.x + road.to.x) / 2, 0.04, (road.from.z + road.to.z) / 2);
    strip.rotation.y = Math.atan2(dx, dz);
    strip.renderOrder = -4.5;
    strip.userData.noShadow = true;
    markMoving(strip);
    hubGroup().add(strip);
  });
}

// ============================================================================
// Regn: streck runt bilen + ringar på marken
// ============================================================================
function buildRain() {
  const COUNT = 420;
  const HEIGHT = 18;
  const positions = new Float32Array(COUNT * 6);
  const drops = Array.from({ length: COUNT }, () => ({ x: (Math.random() - 0.5) * 2 * BOX, y: Math.random() * HEIGHT, z: (Math.random() - 0.5) * 2 * BOX, v: 24 + Math.random() * 8 }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#c4d4ff', transparent: true, opacity: 0.45, depthWrite: false }));
  lines.frustumCulled = false;
  lines.userData.noShadow = true;
  scene.add(lines);
  // Ringar där dropparna slår i marken.
  const ringTexture = canvasTexture(64, (pen, n) => {
    pen.strokeStyle = '#ffffff';
    pen.lineWidth = 3;
    pen.beginPath();
    pen.arc(n / 2, n / 2, n * 0.4, 0, Math.PI * 2);
    pen.stroke();
  });
  const RIPPLES = 40;
  const ripples = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: ringTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    RIPPLES
  );
  ripples.frustumCulled = false;
  ripples.userData.noShadow = true;
  scene.add(ripples);
  const rippleItems = Array.from({ length: RIPPLES }, () => ({ x: (Math.random() - 0.5) * 2 * BOX, z: (Math.random() - 0.5) * 2 * BOX, age: Math.random() }));
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  state.updaters.push((delta, car) => {
    const here = currentWorld === hub;
    lines.visible = here;
    ripples.visible = here;
    if (!here) return;
    for (let i = 0; i < COUNT; i++) {
      const d = drops[i];
      d.y -= d.v * delta;
      if (d.y < 0) d.y += HEIGHT;
      wrapAround(d, car);
      const o = i * 6;
      positions[o] = d.x; positions[o + 1] = d.y; positions[o + 2] = d.z;
      positions[o + 3] = d.x - 0.12; positions[o + 4] = d.y + 0.9; positions[o + 5] = d.z;
    }
    geometry.attributes.position.needsUpdate = true;
    rippleItems.forEach((r, i) => {
      r.age += delta * 1.6;
      if (r.age > 1) { r.age = 0; r.x = car.x + (Math.random() - 0.5) * 2 * BOX; r.z = car.z + (Math.random() - 0.5) * 2 * BOX; }
      dummy.position.set(r.x, 0.07, r.z);
      dummy.scale.setScalar(0.2 + r.age * 1.1);
      dummy.updateMatrix();
      ripples.setMatrixAt(i, dummy.matrix);
      ripples.setColorAt(i, tint.setScalar(0.45 * (1 - r.age)));
    });
    ripples.instanceMatrix.needsUpdate = true;
    ripples.instanceColor.needsUpdate = true;
  });
}

// ============================================================================
// Blommor och kronblad på gräset (vår: pastell, sommar: starkare färger)
// ============================================================================
function buildFlowers(ctx, summer) {
  const random = seededRandom(summer ? 612 : 321);
  const count = summer ? 260 : 220;
  const colors = summer
    ? ['#ffd21a', '#ff5a3c', '#ffffff', '#ff8ad0', '#5a9bff', '#ffa31a', '#c85aff']
    : ['#ffc4d8', '#ffffff', '#fff2a0', '#d4c0ff', '#ffb0a0', '#bfe0ff'];
  const spots = [];
  for (let i = 0; i < count; i++) {
    let spot;
    if (i % 3 === 0 && ctx.trees.length) { // Var tredje vid ett träd.
      const tree = ctx.trees[Math.floor(random() * ctx.trees.length)];
      const a = random() * 6.3;
      const r = 1.6 + random() * 3;
      spot = { x: tree.x + Math.cos(a) * r, z: tree.z + Math.sin(a) * r };
      if (!grassSpotOk(spot.x, spot.z, ctx, 0.8)) spot = null;
    } else {
      spot = randomGrassSpot(random, ctx, 6);
    }
    if (spot) spots.push(spot);
  }
  if (!spots.length) return;
  const headGeometry = new THREE.CircleGeometry(0.5, 7);
  const heads = new THREE.InstancedMesh(headGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), spots.length);
  const centres = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 6), new THREE.MeshBasicMaterial({ color: summer ? '#ff9a00' : '#f2c030', side: THREE.DoubleSide }), spots.length);
  const stems = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 1, 0.05), new THREE.MeshBasicMaterial({ color: summer ? '#3f8a2a' : '#5fa042' }), spots.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const toCamera = new THREE.Vector3(Math.sin(BILLBOARD_FACING), 0, Math.cos(BILLBOARD_FACING));
  spots.forEach((spot, i) => {
    const height = 0.28 + random() * 0.22;
    const size = (summer ? 0.34 : 0.28) * (0.8 + random() * 0.6);
    dummy.position.set(spot.x, height, spot.z);
    dummy.quaternion.copy(facing);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, color.set(colors[Math.floor(random() * colors.length)]));
    dummy.position.addScaledVector(toCamera, 0.03);
    dummy.scale.setScalar(size * 0.4);
    dummy.updateMatrix();
    centres.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, height / 2, spot.z);
    dummy.quaternion.identity();
    dummy.scale.set(1, height, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
  });
  for (const mesh of [heads, centres, stems]) { mesh.frustumCulled = false; mesh.userData.noShadow = true; hubGroup().add(mesh); }
}

// Nedfallna kronblad som ligger platt på marken, mest runt träden.
function buildPetalScatter(ctx) {
  const random = seededRandom(555);
  const spots = [];
  for (let i = 0; i < 320; i++) {
    let spot;
    if (i % 2 === 0 && ctx.trees.length) {
      const tree = ctx.trees[Math.floor(random() * ctx.trees.length)];
      const a = random() * 6.3;
      const r = 0.8 + random() * 3.2 * tree.scale;
      spot = { x: tree.x + Math.cos(a) * r, z: tree.z + Math.sin(a) * r };
      if (onRoad(ctx, spot.x, spot.z)) spot = null;
    } else {
      spot = randomGrassSpot(random, ctx, 3);
    }
    if (spot) spots.push(spot);
  }
  if (!spots.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 6).rotateX(-Math.PI / 2).scale(0.65, 1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), spots.length);
  const colors = ['#ffc4d8', '#ffe0ea', '#fff0f4', '#ffb0c8'].map((hex) => new THREE.Color(hex));
  const dummy = new THREE.Object3D();
  spots.forEach((spot, i) => {
    dummy.position.set(spot.x, 0.07, spot.z);
    dummy.rotation.set(0, random() * 6.3, 0);
    dummy.scale.setScalar(0.16 + random() * 0.14);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, colors[i % colors.length]);
  });
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  hubGroup().add(mesh);
}

// Mjuka mossfläckar vid trädens fötter (marken blir grönare).
function buildMoss(ctx) {
  const random = seededRandom(808);
  const patches = [];
  ctx.trees.forEach((tree) => {
    for (let k = 0; k < 2; k++) {
      const a = random() * 6.3;
      const r = (0.7 + random() * 1.4) * tree.scale;
      const x = tree.x + Math.cos(a) * r;
      const z = tree.z + Math.sin(a) * r;
      if (!onRoad(ctx, x, z) && distanceToWater(x, z) > 1) patches.push({ x, z, size: (1.6 + random() * 1.8) * tree.scale });
    }
  });
  if (!patches.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), patches.length);
  const greens = ['#4f9a3a', '#5fb046', '#3f8a38'].map((hex) => new THREE.Color(hex));
  const dummy = new THREE.Object3D();
  patches.forEach((patch, i) => {
    dummy.position.set(patch.x, 0.035, patch.z);
    dummy.rotation.set(0, random() * 6.3, 0);
    dummy.scale.set(patch.size, 1, patch.size * (0.7 + random() * 0.4));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, greens[i % greens.length]);
  });
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.renderOrder = -3;
  markMoving(mesh);
  hubGroup().add(mesh);
}

// ============================================================================
// Blommande träd: rosa tuvor i kronan + kronblad som faller
// ============================================================================
function buildBlossom(ctx) {
  const trees = ctx.trees.slice(0, 60);
  if (!trees.length) return;
  const random = seededRandom(1234);
  const PER_TREE = 9;
  const clumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial(), trees.length * PER_TREE);
  const pinks = ['#ffb8d0', '#ffd6e4', '#ffffff', '#ff9ec0'].map((hex) => new THREE.Color(hex));
  const dummy = new THREE.Object3D();
  trees.forEach((tree, t) => {
    for (let k = 0; k < PER_TREE; k++) {
      const a = random() * 6.3;
      const up = 0.15 + random() * 0.85; // Mest på ovansidan av kronan.
      const flat = Math.sqrt(1 - up * up);
      const radius = 1.25 * tree.scale;
      dummy.position.set(tree.x + Math.cos(a) * flat * radius, 2.8 * tree.scale + up * radius, tree.z + Math.sin(a) * flat * radius);
      dummy.rotation.set(random() * 3, random() * 3, 0);
      dummy.scale.setScalar(tree.scale * (0.8 + random() * 1.0));
      dummy.updateMatrix();
      clumps.setMatrixAt(t * PER_TREE + k, dummy.matrix);
      clumps.setColorAt(t * PER_TREE + k, pinks[(t + k) % pinks.length]);
    }
  });
  clumps.frustumCulled = false;
  clumps.userData.noShadow = true;
  hubGroup().add(clumps);
  // Kronblad som faller från kronan.
  const PETALS = 5;
  const petals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 7).scale(0.6, 1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), trees.length * PETALS);
  const items = [];
  trees.forEach((tree, t) => {
    for (let k = 0; k < PETALS; k++) {
      items.push({ tree, a: random() * 6.3, r: random() * 1.5 * tree.scale, y: random() * 3 * tree.scale, v: 0.4 + random() * 0.4, phase: random() * 6.3, spin: (random() - 0.5) * 5 });
      petals.setColorAt(t * PETALS + k, pinks[(t + k + 1) % pinks.length]);
    }
  });
  petals.frustumCulled = false;
  petals.userData.noShadow = true;
  scene.add(petals);
  let time = 0;
  state.updaters.push((delta) => {
    petals.visible = currentWorld === hub;
    if (!petals.visible) return;
    time += delta;
    items.forEach((p, i) => {
      p.y -= p.v * delta;
      if (p.y < 0.08) { p.y = (2.4 + random() * 1.4) * p.tree.scale; p.a = random() * 6.3; p.r = random() * 1.5 * p.tree.scale; }
      dummy.position.set(p.tree.x + Math.cos(p.a) * p.r + Math.sin(time * 0.8 + p.phase) * 0.5, p.y, p.tree.z + Math.sin(p.a) * p.r + Math.cos(time * 0.6 + p.phase) * 0.4);
      dummy.rotation.set(p.phase + time * p.spin, time * p.spin * 0.7, p.phase);
      dummy.scale.setScalar(0.2);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    });
    petals.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// Regnbåge: dyker upp ibland, tonar in och ut
// ============================================================================
function buildRainbow() {
  const texture = canvasTexture(256, (pen, n) => {
    const bands = ['#ff4a4a', '#ff9a3a', '#ffe14a', '#5ad26a', '#4aa8ff', '#6a5aff', '#b05aff'];
    bands.forEach((band, i) => {
      pen.strokeStyle = band;
      pen.lineWidth = n * 0.028;
      pen.beginPath();
      pen.arc(n / 2, n * 0.95, n * (0.46 - i * 0.03), Math.PI, 0);
      pen.stroke();
    });
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.scale.set(90, 90, 1);
  mesh.quaternion.copy(facing);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  scene.add(mesh);
  // Bort från kameran (kameran står på -x,-z sidan av bilen) och högt upp.
  const awayX = -Math.sin(BILLBOARD_FACING);
  const awayZ = -Math.cos(BILLBOARD_FACING);
  let clock = 20 + Math.random() * 30; // Sekunder till nästa.
  let shown = 0;                       // Hur länge den varit framme.
  const SHOW = 28;
  state.updaters.push((delta, car) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    if (shown > 0) {
      shown += delta;
      if (shown > SHOW) { shown = 0; clock = 60 + Math.random() * 90; }
    } else {
      clock -= delta;
      if (clock <= 0) shown = 0.001;
    }
    const k = shown > 0 ? Math.min(1, shown / 4, (SHOW - shown) / 4) : 0;
    material.opacity = 0.42 * Math.max(0, k);
    mesh.position.set(car.x + awayX * 60, 12, car.z + awayZ * 60);
  });
}

// ============================================================================
// Fjärilar (vår och sommar)
// ============================================================================
function wingGeometry() {
  const vertices = [];
  const indices = [];
  for (const side of [-1, 1]) {
    const base = vertices.length / 3;
    vertices.push(0, 0, 0.08, side * 0.3, 0.1, 0.16, side * 0.28, 0.06, -0.14, 0, 0, -0.08);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function buildButterflies(ctx, summer) {
  const random = seededRandom(summer ? 90 : 91);
  const colors = (summer ? ['#ff9a1a', '#ffe14a', '#ffffff', '#ff5a8a', '#6ab0ff'] : ['#ffe14a', '#ffffff', '#ffb0d0', '#c8b0ff', '#ffd0a0']).map((hex) => new THREE.Color(hex));
  const items = [];
  for (let i = 0; i < (summer ? 16 : 14); i++) {
    const spot = randomGrassSpot(random, ctx, 10);
    if (!spot) continue;
    items.push({ hx: spot.x, hz: spot.z, rx: 2 + random() * 3, rz: 2 + random() * 3, sx: 0.25 + random() * 0.3, sz: 0.2 + random() * 0.3, phase: random() * 6.3, height: 0.8 + random() * 0.8, flap: random() * 6.3 });
  }
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(wingGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), items.length);
  items.forEach((_, i) => mesh.setColorAt(i, colors[i % colors.length]));
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  let time = 0;
  state.updaters.push((delta) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    time += delta;
    items.forEach((b, i) => {
      const a = time * b.sx + b.phase;
      const c = time * b.sz + b.phase * 1.7;
      const vx = Math.cos(a) * b.rx * b.sx;
      const vz = -Math.sin(c) * b.rz * b.sz;
      dummy.position.set(b.hx + Math.sin(a) * b.rx, b.height + Math.sin(time * 1.7 + b.flap) * 0.3, b.hz + Math.cos(c) * b.rz);
      dummy.rotation.set(0, Math.atan2(vx, vz), 0);
      dummy.scale.set(0.2 + 0.8 * Math.abs(Math.sin(time * 11 + b.flap)), 1, 1).multiplyScalar(1.3);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
}

// ============================================================================
// SOMMAR: damm, dammoln, trollsländor, eldflugor, varmluft
// ============================================================================
function buildDust(ctx) {
  // Ett ljust dammlager på vägarna (mycket svagt) ...
  const material = new THREE.MeshBasicMaterial({ color: '#e8d4a0', transparent: true, opacity: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  ctx.roads.forEach((road) => {
    const width = (road.width || ROAD_WIDTH) - 0.3;
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) return;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
    strip.position.set((road.from.x + road.to.x) / 2, 0.04, (road.from.z + road.to.z) / 2);
    strip.rotation.y = Math.atan2(dx, dz);
    strip.renderOrder = -4.5;
    strip.userData.noShadow = true;
    markMoving(strip);
    hubGroup().add(strip);
  });
  // ... och dammoln bakom bilen när den kör på väg. Egna material per moln, så att de kan tona ut.
  const texture = softTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const puffs = Array.from({ length: 30 }, () => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, color: '#e0c890', transparent: true, opacity: 0, depthWrite: false }));
    mesh.quaternion.copy(facing);
    mesh.visible = false;
    mesh.userData.noShadow = true;
    scene.add(mesh);
    return { mesh, life: 0, max: 1, vx: 0, vz: 0 };
  });
  let next = 0;
  let cooldown = 0;
  state.updaters.push((delta, car) => {
    cooldown -= delta;
    if (cooldown <= 0 && Math.abs(speed) > 4 && currentWorld === hub) {
      const frame = carFrame(car);
      if (onRoad(ctx, frame.rx, frame.rz)) {
        cooldown = 0.07;
        const p = puffs[next];
        next = (next + 1) % puffs.length;
        p.life = p.max = 1.1 + Math.random() * 0.5;
        p.mesh.position.set(frame.rx + (Math.random() - 0.5) * 0.8, 0.4, frame.rz + (Math.random() - 0.5) * 0.8);
        p.vx = (Math.random() - 0.5) * 1.2 - frame.fx * 0.8;
        p.vz = (Math.random() - 0.5) * 1.2 - frame.fz * 0.8;
        p.mesh.visible = true;
      }
    }
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= delta;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      const age = 1 - p.life / p.max;
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.z += p.vz * delta;
      p.mesh.position.y += 0.5 * delta;
      p.mesh.scale.setScalar(1.2 + age * 3.4);
      p.mesh.material.opacity = 0.42 * (1 - age) * Math.min(1, age * 8);
    }
  });
}

function buildDragonflies(ctx) {
  const pond = hubPoint(-26.5, 29.2); // Dammen (hubprops.js).
  const random = seededRandom(7);
  const flies = [];
  for (let i = 0; i < 7; i++) {
    const near = i < 5;
    const spot = near ? { x: pond.x + (random() - 0.5) * 12, z: pond.z + (random() - 0.5) * 7 } : (randomGrassSpot(random, ctx, 10) || pond);
    flies.push({ cx: spot.x, cz: spot.z, x: spot.x, z: spot.z, y: 1.3, tx: spot.x, tz: spot.z, ty: 1.3, wait: random() * 2, yaw: 0, spread: near ? 5 : 4 });
  }
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), new THREE.MeshBasicMaterial(), flies.length);
  const wingGeo = new THREE.PlaneGeometry(0.5, 0.12).rotateX(-Math.PI / 2);
  const wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), flies.length * 2);
  const colors = ['#2ab8c8', '#3a6ae0', '#38b868', '#c83ad0'].map((hex) => new THREE.Color(hex));
  flies.forEach((_, i) => bodies.setColorAt(i, colors[i % colors.length]));
  for (const mesh of [bodies, wings]) { mesh.frustumCulled = false; mesh.userData.noShadow = true; scene.add(mesh); }
  const dummy = new THREE.Object3D();
  let time = 0;
  state.updaters.push((delta) => {
    const here = currentWorld === hub;
    bodies.visible = here;
    wings.visible = here;
    if (!here) return;
    time += delta;
    flies.forEach((f, i) => {
      f.wait -= delta;
      if (f.wait <= 0) { // Ett snabbt språng till en ny punkt, sedan hovrar den en stund.
        f.tx = f.cx + (Math.random() - 0.5) * 2 * f.spread;
        f.tz = f.cz + (Math.random() - 0.5) * 2 * f.spread;
        f.ty = 0.9 + Math.random() * 1.2;
        f.wait = 0.6 + Math.random() * 2;
      }
      const dx = f.tx - f.x;
      const dz = f.tz - f.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, 9 * delta);
      if (dist > 0.05) { f.x += (dx / dist) * step; f.z += (dz / dist) * step; f.yaw = Math.atan2(dx, dz); }
      f.y += (f.ty - f.y) * Math.min(1, 4 * delta);
      const hover = Math.sin(time * 9 + i) * 0.03;
      dummy.position.set(f.x, f.y + hover, f.z);
      dummy.rotation.set(0, f.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      const buzz = 0.5 + 0.5 * Math.sin(time * 70 + i * 2);
      for (let w = 0; w < 2; w++) { // Två vingpar, fram och bak.
        dummy.position.set(f.x, f.y + hover + 0.03, f.z);
        dummy.rotation.set(0, f.yaw, 0);
        dummy.translateZ(w ? -0.1 : 0.12);
        dummy.scale.set(1, 1, 0.6 + buzz * 0.5);
        dummy.updateMatrix();
        wings.setMatrixAt(i * 2 + w, dummy.matrix);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  });
}

// Mjuka kameravända ljuspunkter som blinkar (eldflugor) eller dallrar (varmluft). Additiv blandning.
function makeGlowSwarm({ count, size, color, rise, height, blink, spread }) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: softTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    count
  );
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  scene.add(mesh);
  const base = new THREE.Color(color);
  const tint = new THREE.Color();
  const items = Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 2 * BOX, y: height[0] + Math.random() * (height[1] - height[0]), z: (Math.random() - 0.5) * 2 * BOX,
    phase: Math.random() * 6.3, rate: blink * (0.6 + Math.random() * 0.8), scale: size * (0.7 + Math.random() * 0.6), drift: Math.random() * 6.3,
  }));
  const dummy = new THREE.Object3D();
  let time = 0;
  return (delta, car) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    time += delta;
    items.forEach((p, i) => {
      p.x += Math.sin(time * 0.6 + p.drift) * spread * delta;
      p.z += Math.cos(time * 0.5 + p.drift * 1.3) * spread * delta;
      p.y += rise * delta;
      if (p.y > height[1]) p.y = height[0]; else if (p.y < height[0]) p.y = height[1];
      wrapAround(p, car);
      dummy.position.set(p.x, p.y, p.z);
      dummy.quaternion.copy(facing);
      dummy.scale.set(p.scale, p.scale * (rise > 0.2 ? 3 : 1), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const pulse = Math.pow(Math.max(0, Math.sin(time * p.rate + p.phase)), 2);
      mesh.setColorAt(i, tint.copy(base).multiplyScalar(pulse));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };
}

// ============================================================================
// Ingångarna (anropas från seasonfx.js)
// ============================================================================
// ctx = { roads, lamps, signposts, trees } (det hub.buildHubRoads/buildHubTrees lämnar).
function buildSpringSummer(ctx) {
  const spring = hasRule('spring');
  const summer = hasRule('summer');
  if (!spring && !summer) { state = null; return; }
  const rainy = hasRule('rainy-spring');
  state = { spring, summer, rainy, ctx, updaters: [] };
  try {
    if (spring) {
      buildPuddles(ctx, rainy);
      buildFlowers(ctx, false);
      buildPetalScatter(ctx);
      buildMoss(ctx);
      buildBlossom(ctx);
      buildButterflies(ctx, false);
      buildRainbow();
      if (rainy) { buildWetRoads(ctx); buildRain(); }
    }
    if (summer) {
      buildDust(ctx);
      buildFlowers(ctx, true);
      buildButterflies(ctx, true);
      buildDragonflies(ctx);
      state.updaters.push(makeGlowSwarm({ count: 70, size: 0.55, color: '#d8ff5a', rise: 0.05, height: [0.4, 3], blink: 2.2, spread: 0.9 })); // Eldflugor.
      state.updaters.push(makeGlowSwarm({ count: 14, size: 3.2, color: '#4a4232', rise: 0.5, height: [0.5, 4.5], blink: 0.7, spread: 0.3 })); // Varmluft (svag, dallrande).
    }
  } catch (error) {
    console.warn('[season-spring-summer]', error); // Ett fel här ska aldrig stoppa spelet.
  }
}

// car = bilens position (Vector3). Körs en gång per bild.
function updateSpringSummer(delta, car) {
  if (!state) return;
  for (const update of state.updaters) update(delta, car);
}

export default {
  name: 'spring-summer',
  build: (ctx) => buildSpringSummer(ctx),
  update: (delta, car) => updateSpringSummer(delta, car),
};
