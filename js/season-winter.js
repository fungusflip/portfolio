// ============================================================================
// js/season-winter.js — vinterns extra saker: snö på allt som vetter uppåt, snödrivor längs vägarna, is på dammen
// och bäcken, julbelysning, smashbara snögubbar, ånga ur avgasröret, snöpuffar och norrsken.
// ============================================================================
// Hämtas av seasonfx.js bara när configen har modules.winter (se RULES i season.js). Inställningar kommer från
// config.winter ({ snowmen, drifts, ice, aurora, lights }). Marken, vägarna, kronorna och däckspåren får sin
// snö av paletten, foliage och tracks i season.js; här finns det som behöver egen kod. Allt är instancing eller
// ett enda materialbyte, med begränsade antal.
import * as THREE from 'three';
import { scene, camera, currentWorld, BILLBOARD_FACING } from './core.js';
import { ROAD_WIDTH, distanceToRoad } from './roads.js';
import { HOME_X, HOME_Z, CABIN_X, CABIN_Z, CABIN_SIZE, GARAGE_DEPTH, homeGroup, hubPoint } from './home.js';
import { PORTALS } from './portals.js';
import { PLAZA, streamSamples, ribbonGeometry } from './hubprops.js';
import { addObstacles } from './collision.js';
import { markMoving } from './optimize.js';
import {
  hub, hubGroup, seededRandom, canvasTexture, blobTexture, addUpdater, spotOk, smashThing,
} from './seasonkit.js';

const SNOW = '#f3f7fd';

// ============================================================================
// Snö på allt som vetter uppåt: ett materialbyte (skuggaren), inga extra föremål.
// ============================================================================
// Körs EFTER optimizeWorld, så att det är de färdiga materialen som ändras. Markens och vägarnas lager (renderOrder
// under 0) får sin snö av paletten och hoppas över. Inne i garaget (under taket) läggs ingen snö.
function applySnowSurfaces() {
  const color = new THREE.Color(SNOW);
  const cos = Math.cos(BILLBOARD_FACING).toFixed(5);
  const sin = Math.sin(BILLBOARD_FACING).toFixed(5);
  const rgb = `vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)})`;
  const done = new Set();
  hubGroup().traverse((object) => {
    if (!object.isMesh || object.renderOrder < 0) return;
    const material = object.material;
    if (!material || done.has(material)) return;
    done.add(material);
    if (material.transparent || !(material.isMeshLambertMaterial || material.isMeshStandardMaterial)) return;
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = function patch(shader, renderer) {
      before.call(this, shader, renderer);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vSnowAmt;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec3 snowN = objectNormal;
          #ifdef USE_INSTANCING
          snowN = mat3(instanceMatrix) * snowN;
          #endif
          vSnowAmt = smoothstep(0.45, 0.8, normalize(mat3(modelMatrix) * snowN).y);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 snowP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          snowP = instanceMatrix * snowP;
          #endif
          snowP = modelMatrix * snowP;
          vec2 snowD = snowP.xz - vec2(${HOME_X.toFixed(3)}, ${HOME_Z.toFixed(3)});
          float snowLx = ${cos} * snowD.x - ${sin} * snowD.y;
          float snowLz = ${sin} * snowD.x + ${cos} * snowD.y;
          vSnowAmt *= 1.0 - step(abs(snowLx), 2.75) * step(abs(snowLz), 1.7) * step(snowP.y, 2.4);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSnowAmt;')
        .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, ${rgb}, vSnowAmt * 0.9);`);
    };
    material.customProgramCacheKey = () => key + '|snow';
    material.needsUpdate = true;
  });
}

// ============================================================================
// Snödrivor längs vägkanterna: avlånga vita kullar, en InstancedMesh.
// ============================================================================
function buildDrifts(ctx, max) {
  const items = [];
  const random = seededRandom(2024);
  for (const road of ctx.roads) {
    if (road.noCurb) continue; // Gångvägen har ingen kant.
    const dx = road.to.x - road.from.x;
    const dz = road.to.z - road.from.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const ux = dx / length;
    const uz = dz / length;
    const half = (road.width || ROAD_WIDTH) / 2;
    for (let t = 1 + random() * 1.5; t < length - 0.8 && items.length < max; t += 2.2 + random() * 1.6) {
      for (const side of [-1, 1]) {
        if (random() < 0.3) continue; // Luckor.
        const offset = half + 0.25 + random() * 0.35;
        const x = road.from.x + ux * t - uz * offset * side;
        const z = road.from.z + uz * t + ux * offset * side;
        if (ctx.roads.some((other) => other !== road && distanceToRoad(x, z, other) < (other.width || ROAD_WIDTH) / 2 + 0.6)) continue; // Inte över korsningar och infarter.
        if (PORTALS.some((portal) => portal.world === hub && portal.style === 'cave' && Math.hypot(x - portal.door.x, z - portal.door.z) < 6)) continue;
        items.push({ x, z, yaw: Math.atan2(ux, uz), sx: 0.7 + random() * 0.6, sy: 0.18 + random() * 0.12, sz: 1.6 + random() * 1.2 });
      }
    }
  }
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial({ color: SNOW }), items.length);
  const dummy = new THREE.Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.x, 0.02, item.z);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  hubGroup().add(mesh);
}

// ============================================================================
// Is: dammen och bäcken är frusna (stilla, ingen vattenrörelse), med snökanter. Fontänen får ett istäcke.
// ============================================================================
function buildIce() {
  const texture = canvasTexture(128, (pen, n) => {
    pen.fillStyle = '#c4dcee';
    pen.fillRect(0, 0, n, n);
    const random = seededRandom(31);
    pen.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    pen.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { // Sprickor: korta, böjda streck.
      let x = random() * n;
      let y = random() * n;
      pen.beginPath();
      pen.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (random() - 0.5) * 40;
        y += (random() - 0.2) * 30;
        pen.lineTo(x, y);
      }
      pen.stroke();
    }
    pen.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let i = 0; i < 6; i++) pen.fillRect(random() * n, random() * n, 20 + random() * 30, 3);
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 0.25); // uv.y = sträckan längs bäcken i enheter.
  const group = new THREE.Group(); // Som hubprops-gruppen: x = åt höger på skärmen, z = nedåt.
  const base = hubPoint(0, 0);
  group.position.set(base.x, 0, base.z);
  group.rotation.y = BILLBOARD_FACING;
  // Samma sätt som vattnet ritas (hubprops.js): utan djuptest, i egen ordning efter marken men före vägarna.
  const flat = (material, geometry, y, order) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.renderOrder = order;
    mesh.userData.noShadow = true;
    group.add(mesh);
  };
  const bank = new THREE.MeshBasicMaterial({ color: '#dfe8f4', depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const ice = new THREE.MeshBasicMaterial({ map: texture, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  flat(bank, ribbonGeometry(streamSamples, 0.5), 0.021, -9.0);
  flat(ice, ribbonGeometry(streamSamples, 0.02), 0.023, -8.99);
  // Fontänens vatten ligger i en bassäng (y 0.4): ett istäcke strax över.
  const cover = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: texture, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  cover.position.set(PLAZA.right, 0.43, PLAZA.down);
  cover.userData.noShadow = true;
  group.add(cover);
  hubGroup().add(group);
}

// ============================================================================
// Julbelysning på stugan, garaget och lyktorna: små glödlampor som tindrar. Lyktans lampor släcks när den välter.
// ============================================================================
const LIGHT_COLORS = ['#ff4a3a', '#ffd24a', '#4ad07a', '#4aa8ff', '#fff2d0'].map((hex) => new THREE.Color(hex));

function buildXmasLights(ctx) {
  const festoon = (list, x0, x1, y, z, step) => { // En girlang: lamporna hänger lite i mitten.
    const n = Math.max(1, Math.round((x1 - x0) / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      list.push([x0 + (x1 - x0) * u, y - 0.14 * Math.sin(u * Math.PI * 3 % Math.PI), z]);
    }
  };
  const home = []; // I hemgruppens led (home.js).
  const cabinEave = (CABIN_SIZE + 0.9) / 2 + 0.02;      // Takfoten fram (samma mått som taket i home.js).
  const doorX = CABIN_X + 1.1;
  festoon(home, CABIN_X - 2.8, CABIN_X + 2.8, 3.74, cabinEave, 0.34);
  for (let y = 0.15; y <= 2.05; y += 0.3) home.push([doorX - 0.62, y, CABIN_Z + CABIN_SIZE / 2 + 0.1], [doorX + 0.62, y, CABIN_Z + CABIN_SIZE / 2 + 0.1]);
  festoon(home, doorX - 0.62, doorX + 0.62, 2.08, CABIN_Z + CABIN_SIZE / 2 + 0.1, 0.3);
  festoon(home, -2.9, 2.9, 2.52, GARAGE_DEPTH / 2 + 0.47, 0.34);

  const world = []; // Lyktorna, i världen. first/count per lykta.
  const poles = [];
  for (const lamp of ctx.lamps.slice(0, 20)) {
    const first = world.length;
    const hx = lamp.at.x + Math.sin(lamp.arm) * 1.3;
    const hz = lamp.at.z + Math.cos(lamp.arm) * 1.3;
    for (let k = 0; k < 8; k++) { // Krans runt lampskärmen.
      const a = (k / 8) * Math.PI * 2;
      world.push([hx + Math.cos(a) * 0.4, 3.72, hz + Math.sin(a) * 0.4]);
    }
    for (let k = 0; k < 9; k++) { // Spiral ned längs stolpen.
      const a = k * 1.1;
      world.push([lamp.at.x + Math.cos(a) * 0.12, 0.7 + k * 0.33, lamp.at.z + Math.sin(a) * 0.12]);
    }
    poles.push({ lamp, first, count: world.length - first });
  }

  const geometry = new THREE.SphereGeometry(0.07, 6, 5);
  const make = (spots, parent) => {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffffff' }), Math.max(1, spots.length));
    const dummy = new THREE.Object3D();
    spots.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, LIGHT_COLORS[i % LIGHT_COLORS.length]);
    });
    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const homeMesh = make(home, homeGroup);
  const worldMesh = world.length ? make(world, hubGroup()) : null;
  markMoving(homeMesh);
  if (worldMesh) markMoving(worldMesh);

  const out = new Set(); // Lyktor som välts: lamporna släcks.
  for (const entry of poles) {
    const original = entry.lamp.onKnock;
    entry.lamp.onKnock = (dirX, dirZ, strength) => {
      if (original) original(dirX, dirZ, strength);
      out.add(entry);
    };
  }
  const tint = new THREE.Color();
  let time = 0;
  let wait = 0;
  addUpdater((delta) => {
    wait -= delta;
    if (wait > 0) return;
    wait = 0.12;
    time += 0.12;
    const set = (mesh, count, bright) => {
      for (let i = 0; i < count; i++) {
        const level = bright(i) ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 2.4 + i * 1.7)) : 0;
        mesh.setColorAt(i, tint.copy(LIGHT_COLORS[i % LIGHT_COLORS.length]).multiplyScalar(level));
      }
      mesh.instanceColor.needsUpdate = true;
    };
    set(homeMesh, home.length, () => true);
    if (worldMesh) {
      set(worldMesh, world.length, (i) => ![...out].some((entry) => i >= entry.first && i < entry.first + entry.count));
    }
  });
}

// ============================================================================
// Snögubbar: smashbara, som pumporna. Några runt torget och resten utspridda.
// ============================================================================
function buildSnowmen(ctx, wanted) {
  const random = seededRandom(1224);
  const placed = [];
  const plaza = hubPoint(PLAZA.right, PLAZA.down);
  for (let attempt = 0; attempt < wanted * 120 && placed.length < wanted; attempt++) {
    let x;
    let z;
    if (placed.length < 3) { // De tre första står på gräset runt torget.
      const angle = random() * Math.PI * 2;
      const reach = 17 + random() * 7;
      x = plaza.x + Math.cos(angle) * reach;
      z = plaza.z + Math.sin(angle) * reach;
    } else {
      const spot = hubPoint(-55 + random() * 110, 3 + random() * 54);
      x = spot.x;
      z = spot.z;
    }
    if (!spotOk(x, z, ctx, placed, 6, 1.7, 1.2)) continue; // 1.2 fri yta mot alla hinder (collision.js).
    placed.push({ x, z, s: 0.85 + random() * 0.4 });
  }
  if (!placed.length) return;
  const n = placed.length;
  const ballGeometry = new THREE.IcosahedronGeometry(1, 1);
  const snowMaterial = new THREE.MeshLambertMaterial({ color: SNOW });
  const coalMaterial = new THREE.MeshLambertMaterial({ color: '#25232a' });
  const woodMaterial = new THREE.MeshLambertMaterial({ color: '#6b4a2e' });
  const noseGeometry = new THREE.ConeGeometry(0.05, 0.3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.1);
  const noseMaterial = new THREE.MeshLambertMaterial({ color: '#f08a24' });
  const hatGeometry = new THREE.CylinderGeometry(0.17, 0.2, 0.3, 8).translate(0, 0.15, 0);
  const scarfGeometry = new THREE.TorusGeometry(0.27, 0.07, 6, 12).rotateX(Math.PI / 2);
  const scarfMaterial = new THREE.MeshLambertMaterial({ color: '#c8281e' });
  const armGeometry = new THREE.CylinderGeometry(0.025, 0.035, 0.8, 5);
  const coalGeometry = new THREE.SphereGeometry(0.035, 5, 4);
  const parts = {
    balls: new THREE.InstancedMesh(ballGeometry, snowMaterial, n * 3),
    noses: new THREE.InstancedMesh(noseGeometry, noseMaterial, n),
    hats: new THREE.InstancedMesh(hatGeometry, coalMaterial, n),
    scarves: new THREE.InstancedMesh(scarfGeometry, scarfMaterial, n),
    arms: new THREE.InstancedMesh(armGeometry, woodMaterial, n * 2),
    coals: new THREE.InstancedMesh(coalGeometry, coalMaterial, n * 5),
  };
  const meshes = Object.values(parts);
  const dummy = new THREE.Object3D();
  const yawQ = new THREE.Quaternion();
  const tiltQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const fx = Math.sin(BILLBOARD_FACING); // Framåt (mot kameran).
  const fz = Math.cos(BILLBOARD_FACING);
  const rx = Math.cos(BILLBOARD_FACING); // Åt höger.
  const rz = -Math.sin(BILLBOARD_FACING);
  // Lägger en del på (sidled, höjd, framåt) från snögubbens fot.
  const put = (mesh, index, man, side, height, forward, scale, tilt = 0) => {
    dummy.position.set(man.x + rx * side * man.s + fx * forward * man.s, height * man.s, man.z + rz * side * man.s + fz * forward * man.s);
    yawQ.setFromAxisAngle(Y, BILLBOARD_FACING);
    dummy.quaternion.copy(yawQ).multiply(tiltQ.setFromAxisAngle(Z, tilt));
    dummy.scale.setScalar(scale * man.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  const hide = (i) => {
    dummy.position.set(0, -10, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let k = 0; k < 3; k++) parts.balls.setMatrixAt(i * 3 + k, dummy.matrix);
    for (let k = 0; k < 2; k++) parts.arms.setMatrixAt(i * 2 + k, dummy.matrix);
    for (let k = 0; k < 5; k++) parts.coals.setMatrixAt(i * 5 + k, dummy.matrix);
    parts.noses.setMatrixAt(i, dummy.matrix);
    parts.hats.setMatrixAt(i, dummy.matrix);
    parts.scarves.setMatrixAt(i, dummy.matrix);
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
  const obstacles = [];
  placed.forEach((man, i) => {
    [[0.5, 0.5], [1.2, 0.36], [1.72, 0.26]].forEach(([y, r], k) => put(parts.balls, i * 3 + k, man, 0, y, 0, r));
    put(parts.noses, i, man, 0, 1.72, 0.24, 1);
    put(parts.hats, i, man, 0, 1.93, 0, 1);
    put(parts.scarves, i, man, 0, 1.46, 0, 1);
    for (const side of [-1, 1]) put(parts.arms, i * 2 + (side + 1) / 2, man, side * 0.66, 1.42, 0, 1, -side * 1.0);
    [[-0.09, 1.78, 0.22], [0.09, 1.78, 0.22], [0, 1.33, 0.34], [0, 1.2, 0.36], [0, 1.07, 0.34]]
      .forEach(([side, y, forward], k) => put(parts.coals, i * 5 + k, man, side, y, forward, 1));
    obstacles.push({
      x: man.x, z: man.z, radius: 0.35 + 0.3 * man.s, soft: true, kind: 'snowman', once: true,
      onHit: (dirX, dirZ, strength) => {
        hide(i);
        const lumps = [0.5, 0.36, 0.26].flatMap((r) => [0, 1].map(() => ({ geometry: ballGeometry, material: snowMaterial, size: r * (0.55 + Math.random() * 0.4), resting: 0.12 })));
        smashThing({
          x: man.x, z: man.z, s: man.s, dirX, dirZ, strength,
          parts: [...lumps,
            { geometry: hatGeometry, material: coalMaterial, size: 1, resting: 0.1 },
            { geometry: noseGeometry, material: noseMaterial, size: 1, resting: 0.05 },
            { geometry: scarfGeometry, material: scarfMaterial, size: 1, resting: 0.08 },
            { geometry: armGeometry, material: woodMaterial, size: 1, resting: 0.04 },
            { geometry: armGeometry, material: woodMaterial, size: 1, resting: 0.04 }],
          splat: { texture: blobTexture('#f4f8fd', '#ffffff', 6), size: 2.4, opacity: 0.95 },
        });
      },
    });
  });
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    hubGroup().add(mesh);
  }
  addObstacles(obstacles);
}

// ============================================================================
// Avgasånga och snöpuffar: de befintliga puffsystemen i magic.js får vinterfärger och längre liv.
// ============================================================================
// Systemen är Points direkt i scenen med uniformerna uColor0..3 (magic.js, makePuffSystem). Däckspuffarna har
// storlek 1.25 som mest, avgaserna 0.7. Hittas inget som stämmer görs ingenting.
function tunePuffs() {
  for (const object of scene.children) {
    const uniforms = object.isPoints && object.material.uniforms;
    if (!uniforms || !uniforms.uColor0 || !uniforms.uSize1 || !uniforms.uLife) continue;
    if (uniforms.uSize1.value > 1) { // Däcken: puffar av snö.
      uniforms.uColor0.value.set('#f4f8ff');
      uniforms.uColor1.value.set('#e6ecf6');
      uniforms.uColor2.value.set('#d9e0ec');
      uniforms.uAlpha.value *= 1.5;
      uniforms.uLife.value *= 1.4;
    } else { // Avgaserna: tjock, vit ånga i kylan.
      uniforms.uColor3.value.set('#ffffff');
      uniforms.uAlpha.value *= 2;
      uniforms.uLife.value *= 1.6;
      uniforms.uRise.value *= 1.4;
      uniforms.uSize1.value *= 1.4;
    }
  }
}

// ============================================================================
// Norrsken: två vågiga ljusridåer över bildens överkant, som ett lager framför kameran (himlen syns annars aldrig).
// ============================================================================
function buildAurora(strength) {
  const uniforms = { uTime: { value: 0 }, uStrength: { value: strength } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float x = vUv.x;
        float total = 0.0;
        vec3 color = vec3(0.0);
        for (int k = 0; k < 2; k++) {
          float f = float(k);
          float y0 = 0.80 + 0.05 * f + 0.05 * sin(x * (5.0 + f * 2.0) + uTime * 0.15 + f * 2.0) + 0.025 * sin(x * 11.0 - uTime * 0.3);
          float d = vUv.y - y0;
          float curtain = smoothstep(-0.16, 0.0, d) * (1.0 - smoothstep(0.0, 0.2, d));
          float rays = 0.55 + 0.45 * sin(x * (55.0 + f * 13.0) + sin(x * 7.0 + uTime * 0.4) * 4.0 + uTime * 0.6);
          float a = curtain * rays;
          color += mix(vec3(0.25, 1.0, 0.55), vec3(0.65, 0.35, 1.0), smoothstep(0.0, 0.2, d)) * a;
          total += a;
        }
        gl_FragColor = vec4(color / max(total, 0.001), total * 0.5 * uStrength);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  mesh.userData.noShadow = true;
  scene.add(mesh);
  const forward = new THREE.Vector3();
  const DISTANCE = 20;
  addUpdater((delta) => {
    mesh.visible = currentWorld === hub;
    if (!mesh.visible) return;
    uniforms.uTime.value += delta;
    camera.getWorldDirection(forward);
    mesh.position.copy(camera.position).addScaledVector(forward, DISTANCE);
    mesh.quaternion.copy(camera.quaternion);
    const height = 2 * DISTANCE * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
    mesh.scale.set(height * camera.aspect, height, 1);
  });
}

export default {
  name: 'winter',
  build(ctx, config) {
    const setup = config.winter || {};
    if (setup.drifts) buildDrifts(ctx, setup.drifts);
    if (setup.ice) buildIce();
    if (setup.lights) buildXmasLights(ctx);
    if (setup.snowmen) buildSnowmen(ctx, setup.snowmen);
    if (setup.aurora) buildAurora(setup.aurora);
    tunePuffs();
  },
  afterOptimize() {
    applySnowSurfaces();
  },
};
