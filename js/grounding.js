// ============================================================================
// grounding.js — får träd, skyltar, lyktor och grottor att stå PÅ marken i stället för
// ovanpå den: en mjuk mörk kontaktskugga under dem och några stenar vid foten.
// ============================================================================
import * as THREE from 'three';
import { PALETTE, worldGroup } from './core.js';
import { ROAD_WIDTH, distanceToRoad, addStoneInstances } from './roads.js';
import { stoneTint } from './moss.js';

// --- Kontaktskuggan: en mjuk, mörk, rund fläck som tonar ut ---
const SHADOW_PIXELS = 128;
const shadowImage = document.createElement('canvas');
shadowImage.width = SHADOW_PIXELS;
shadowImage.height = SHADOW_PIXELS;
{
  const pen = shadowImage.getContext('2d');
  const half = SHADOW_PIXELS / 2;
  const gradient = pen.createRadialGradient(half, half, 0, half, half, half);
  // Mörkast under föremålet, och en mjuk, ojämn nedtoning (flera stopp = inte en rak ramp).
  gradient.addColorStop(0, 'rgba(24, 16, 8, 0.62)');
  gradient.addColorStop(0.35, 'rgba(24, 16, 8, 0.42)');
  gradient.addColorStop(0.7, 'rgba(24, 16, 8, 0.12)');
  gradient.addColorStop(1, 'rgba(24, 16, 8, 0)');
  pen.fillStyle = gradient;
  pen.fillRect(0, 0, SHADOW_PIXELS, SHADOW_PIXELS);
}
const shadowTexture = new THREE.CanvasTexture(shadowImage);
shadowTexture.colorSpace = THREE.SRGBColorSpace;
// depthTest: true (inte false som vägarna): ett genomskinligt lager ritas efter allt ogenomskinligt,
// och med depthTest false skulle det hamna ovanpå bilen. polygonOffset drar det lite närmare
// kameran, så att det inte flimrar mot marken.
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const shadowGeometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); // Radie 1, liggande på marken.

// spots: [{ x, z, radius }]. Alla fläckar är EN InstancedMesh.
export function addContactShadows(world, spots) {
  if (spots.length === 0) return;
  const mesh = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, spots.length);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  spots.forEach((spot, i) => {
    position.set(spot.x, 0.03, spot.z);
    scale.set(spot.radius, 1, spot.radius);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = -3; // Efter marken och vägarna, före allt annat genomskinligt.
  worldGroup(world).add(mesh);
}

// --- Stenar vid foten ---
// spots: [{ x, z, radius, count, inner }]. Stenarna sprids i en ring mellan inner * radius och
// radius (inner 0 = fylld cirkel). Platser som hamnar på en väg hoppas över.
const lightColor = new THREE.Color(PALETTE.gravelLight);
const darkColor = new THREE.Color(PALETTE.gravelDark);
const mossColor = new THREE.Color(PALETTE.grassRoot);
export function scatterStones(world, roads, spots) {
  const stones = [];
  for (const spot of spots) {
    for (let i = 0; i < spot.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const inner = spot.inner || 0;
      // sqrt: jämn spridning över ytan (annars samlas stenarna i mitten).
      const distance = spot.radius * Math.sqrt(inner * inner + Math.random() * (1 - inner * inner));
      const x = spot.x + Math.cos(angle) * distance;
      const z = spot.z + Math.sin(angle) * distance;
      if (roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + 0.55)) continue;
      const color = stoneTint(lightColor, darkColor, mossColor); // Några mossiga, ett fåtal helt gröna (moss.js).
      stones.push({ x, z, size: (0.07 + Math.random() * 0.14) * (spot.sizeScale || 1), color });
    }
  }
  addStoneInstances(worldGroup(world), stones);
}
