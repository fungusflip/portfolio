// ============================================================================
// seasonkit.js — gemensamma verktyg för säsongsmodulerna (seasonfx.js, seasonworld.js, seasonair.js).
// ============================================================================
// Slumptal med frö, canvas-texturer, platsprov ("får något stå här?"), uppdateringslistan och den
// gemensamma "krossa något"-animationen (pumpor, snögubbar). Ingen byggkod för själva säsongerna här.
import * as THREE from 'three';
import { WORLDS, DRIVE_RADIUS, HUB_X, HUB_Z, worldGroup } from './core.js';
import { PROJECTS } from './projects.js';
import { ROAD_WIDTH, distanceToRoad } from './roads.js';
import { HOME_X, HOME_Z } from './home.js';
import { PORTALS } from './portals.js';
import { hubPropObstacles, hubGrassFree, distanceToWater } from './hubprops.js';
import { addAnimation } from './knockables.js';
import { overlapsObstacle } from './collision.js';
import { markMoving } from './optimize.js';

export const hub = WORLDS.hub;
export const hubGroup = () => worldGroup(hub);

// Samma slumptal varje gång (mulberry32), så att föremålen hamnar på samma ställen vid varje besök.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// En mjuk, ojämn fläck (för stänk, pölar, lövhögar ...): ytterfärg, innerfärg, antal kluttar.
const blobCache = new Map();
export function blobTexture(outer, inner, lumps = 5) {
  const key = outer + inner + lumps;
  if (!blobCache.has(key)) {
    blobCache.set(key, canvasTexture(128, (pen, n) => {
      pen.fillStyle = outer;
      pen.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.12) {
        const r = n * (0.34 + 0.08 * Math.sin(a * lumps + 1) + 0.06 * Math.sin(a * (lumps * 2 + 1)));
        pen[a === 0 ? 'moveTo' : 'lineTo'](n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r);
      }
      pen.fill();
      pen.fillStyle = inner;
      pen.beginPath();
      pen.arc(n / 2, n / 2, n * 0.16, 0, Math.PI * 2);
      pen.fill();
    }));
  }
  return blobCache.get(key);
}

// --- Uppdateringslistan: (delta, carPosition, time) varje bild ---
export const updaters = [];
export const addUpdater = (fn) => updaters.push(fn);

// --- Platsprov ---
// Ligger platsen fri från vägar, hus, grottor, skyltar, träd, vatten och andra föremål?
// ctx = { roads, lamps, signposts, trees }. placed = [{ x, z }] redan utlagda (minGap emellan).
// clearance = fri yta runt punkten mot ALLA hinder i collision.js (lyktor, skyltar, stolpar, prydnad ...), efter att de byggts.
export function spotOk(x, z, ctx, placed = [], minGap = 0, roadMargin = 1.7, clearance = 0.9) {
  if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS - 6) return false;
  if (Math.hypot(x - HOME_X, z - HOME_Z) < 13) return false;                                       // Garaget och stugan.
  if (ctx.roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + roadMargin)) return false; // Vägar.
  if (PORTALS.some((portal) => portal.world === hub && portal.style === 'cave' && (Math.hypot(x - portal.center.x, z - portal.center.z) < 14 || Math.hypot(x - portal.door.x, z - portal.door.z) < 9))) return false; // Grottorna.
  if (PROJECTS.some((project) => project.world === hub && Math.hypot(x - project.x, z - project.z) < 8)) return false; // Skyltarna.
  if (ctx.lamps.some((lamp) => Math.hypot(x - lamp.at.x, z - lamp.at.z) < 2.5)) return false;
  if (ctx.signposts.some((sign) => Math.hypot(x - sign.at.x, z - sign.at.z) < 3.5)) return false;
  if (hubPropObstacles.some((prop) => Math.hypot(x - prop.x, z - prop.z) < prop.radius + 1.8)) return false;
  if (hubGrassFree.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + 1)) return false;
  if (distanceToWater(x, z) < 2.5) return false;
  if (ctx.trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 1.8 + 0.5 * tree.scale)) return false;
  if (overlapsObstacle(x, z, clearance)) return false;
  return !placed.some((other) => Math.hypot(x - other.x, z - other.z) < minGap);
}

// En slumpad plats ute på marken (right/down räknat från skyltradens mitt, se hubPoint i home.js).
// Hämtas av anroparen (hubPoint) för att slippa en cirkel mellan filerna.

// --- Krossa något: skärvor som flyger, studsar en gång och blir liggande, plus en växande fläck ---
const SHARD_GRAVITY = 16;
export const shardGroup = new THREE.Group();
markMoving(shardGroup); // Får inte slås ihop: bitarna flyger.
// parts: [{ geometry, material, size, resting }]; splat: { texture, size, opacity }.
export function smashThing({ x, z, s = 1, dirX, dirZ, strength, parts, splat }) {
  const pieces = [];
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.scale.setScalar(part.size * s);
    mesh.position.set(x + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.5 * s, z + (Math.random() - 0.5) * 0.4);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    const spread = 2 + 4 * strength;
    const angle = Math.random() * Math.PI * 2;
    pieces.push({
      mesh, resting: part.resting || 0.05,
      vx: dirX * spread * (0.5 + Math.random()) + Math.cos(angle) * 1.8,
      vz: dirZ * spread * (0.5 + Math.random()) + Math.sin(angle) * 1.8,
      vy: 3 + Math.random() * 3.5 * (0.5 + strength),
      spinX: (Math.random() - 0.5) * 16, spinZ: (Math.random() - 0.5) * 16, landed: false,
    });
    shardGroup.add(mesh);
  }
  const fleck = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: splat.texture, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  fleck.position.set(x, 0.06, z);
  fleck.rotation.y = Math.random() * 6;
  fleck.userData.noShadow = true;
  shardGroup.add(fleck);
  let time = 0;
  addAnimation((delta) => {
    time += delta;
    let moving = false;
    for (const piece of pieces) {
      if (piece.landed) continue;
      const { mesh } = piece;
      piece.vy -= SHARD_GRAVITY * delta;
      mesh.position.x += piece.vx * delta;
      mesh.position.y += piece.vy * delta;
      mesh.position.z += piece.vz * delta;
      mesh.rotation.x += piece.spinX * delta;
      mesh.rotation.z += piece.spinZ * delta;
      if (mesh.position.y <= piece.resting) {
        mesh.position.y = piece.resting;
        if (piece.vy < -2.5) { // Studsar en gång.
          piece.vy *= -0.3; piece.vx *= 0.5; piece.vz *= 0.5; piece.spinX *= 0.4; piece.spinZ *= 0.4;
        } else {
          piece.landed = true;
          mesh.rotation.x = (Math.random() - 0.5) * 0.4;
          mesh.rotation.z = (Math.random() - 0.5) * 0.4;
        }
      } else {
        moving = true;
      }
    }
    const grow = Math.min(1, time / 0.5);
    fleck.material.opacity = (splat.opacity || 0.9) * grow;
    fleck.scale.setScalar(s * splat.size * (0.35 + 0.65 * (1 - Math.pow(1 - grow, 3))));
    return !moving && time > 0.6;
  });
}
