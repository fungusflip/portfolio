// ============================================================================
// roads.js — grusvägar. Alla världar bygger sina vägar med buildRoads.
// ============================================================================
import * as THREE from 'three';
import { PALETTE, MAX_ANISOTROPY, worldGroup, towardCamera } from './core.js';
import { billboards, PAD_DISTANCE } from './billboards.js';

export const ROAD_WIDTH = 5;  // Vägarnas bredd i enheter.
const ROAD_EDGE = 0.2;        // Hur mycket den mörka kantlinjen sticker ut på varje sida.
// Hur långt framför skyltraden huvudvägens mitt ligger (nedanför parkeringsfickorna).
export const ROAD_DISTANCE = PAD_DISTANCE + 6.5;

// --- Gruset: en liten bild som upprepas som kakelplattor ---
const GRAVEL_PIXELS = 256; // Bildens storlek i pixlar.
const GRAVEL_UNITS = 4;    // Hur stor en kopia av bilden blir på vägen, i enheter.
const gravelImage = document.createElement('canvas');
gravelImage.width = GRAVEL_PIXELS;
gravelImage.height = GRAVEL_PIXELS;
const gravelPen = gravelImage.getContext('2d');
gravelPen.fillStyle = PALETTE.gravel;
gravelPen.fillRect(0, 0, GRAVEL_PIXELS, GRAVEL_PIXELS);
// 260 småstenar, varannan ljus och varannan mörk.
for (let i = 0; i < 260; i++) {
  gravelPen.fillStyle = i % 2 === 0 ? PALETTE.gravelLight : PALETTE.gravelDark;
  const size = 3 + Math.random() * 6;
  // Håll stenen helt innanför bilden, annars klipps den av i skarven mellan kopiorna.
  gravelPen.fillRect(Math.random() * (GRAVEL_PIXELS - size), Math.random() * (GRAVEL_PIXELS - size), size, size);
}
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
const roadEdgeMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.gravelDark, depthTest: false, depthWrite: false });

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
    // Alla kantlinjer ligger lägst (samma färg, så de får gärna överlappa).
    addRoadLayer(group, road, width + ROAD_EDGE * 2, roadEdgeMaterial, 0.006, -9);
    // Gruset ovanpå. Varje väg ritas strax efter den förra (-8, -7.99, ...), så att det
    // alltid är samma väg som ligger överst där två korsar varandra.
    addRoadLayer(group, road, width, gravelMaterial, 0.012 + i * 0.003, -8 + i * 0.01);
  });
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
