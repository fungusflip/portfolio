// ============================================================================
// optimize.js — gör en färdigbyggd värld lättare att rita, och förbereder den.
// ============================================================================
// Grafikkortet ritar snabbt, men varje separat objekt kostar tid för datorn att
// förbereda: ett "ritanrop" (draw call). Och scenen ritas ungefär tre gånger per
// bild: en gång för skärmen och en gång per lampa med skuggor. Knepen här minskar
// arbetet utan att något syns annorlunda:
//
//   1. SKUGGOR: allt tar emot skuggor; allt utom lagren på marken kastar dem.
//   2. BILLIGARE MATERIAL: MeshStandardMaterial ("fysiskt korrekt" blankhet och metall)
//      är tungt för VARJE pixel. Nästan allt i världen är matt, och där ser
//      MeshLambertMaterial likadant ut för en bråkdel av kostnaden.
//   3. SLÅ IHOP: saker som aldrig rör sig och har samma material (alla grusvägar,
//      alla stenar, alla trästolpar, ...) slås ihop till en enda form.
//   4. FRYS: three.js räknar om varje objekts plats varje bild, för säkerhets skull.
//      Det som aldrig flyttar sig räknas ut en gång och "fryses".
import * as THREE from 'three';
// Slår ihop flera former till en enda. 'three/addons/' slås upp i import-kartan i index.html.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { renderer, scene, camera, currentWorld, worldGroup, showWorld } from './core.js';

// Sådant som rör sig, eller byter material/synlighet medan programmet kör. Det får
// varken slås ihop eller frysas – och inte heller något som sitter i det.
// Filerna som bygger sådant anmäler det med markMoving(...).
const MOVING = new Set();
export function markMoving(...objects) { // ...objects = hur många objekt som helst.
  for (const object of objects) MOVING.add(object);
}

// Gammalt material → billigare, så att varje material bara byts en gång.
const cheaperMaterials = new Map();
function cheaperMaterial(material) {
  if (!material.isMeshStandardMaterial) return material;
  if (!cheaperMaterials.has(material)) {
    cheaperMaterials.set(material, new THREE.MeshLambertMaterial({
      color: material.color,
      map: material.map,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity,
      flatShading: material.flatShading,
      side: material.side,
      transparent: material.transparent,
      opacity: material.opacity,
    }));
  }
  return cheaperMaterials.get(material);
}

// Regeln för skuggor: allt TAR EMOT skuggor, och allt utom lagren på marken (mark,
// vägar, asfalt – de med renderOrder under 0) KASTAR också skuggor. Genomskinliga
// plan (ENTER-text, sken, kanttoning) är inte med.
export function setShadows(root) {
  root.traverse((object) => {
    if (!object.isMesh || object.material.transparent || object.userData.noShadow) return;
    object.receiveShadow = true;
    if (object.renderOrder >= 0) object.castShadow = true;
  });
}

// Kör alla knepen på en värld. Anropas när världen är färdigbyggd.
export function optimizeWorld(world) {
  const group = worldGroup(world);
  setShadows(group);
  group.updateMatrixWorld(true); // Se till att alla objekts platser i världen är uträknade.

  // Samla allt som står still i "hinkar", en per material.
  const buckets = new Map(); // material → lista med objekt.
  function collect(object) {
    if (MOVING.has(object)) return; // Hoppa över hela grenen.
    if (object.isMesh) object.material = cheaperMaterial(object.material);
    if (object.isMesh && !object.isInstancedMesh) {
      if (!buckets.has(object.material)) buckets.set(object.material, []);
      buckets.get(object.material).push(object);
    }
    for (const child of [...object.children]) collect(child); // En kopia av listan, den kan ändras.
  }
  collect(group);

  let mergedAway = 0;
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue; // Inget att slå ihop med.
    const geometries = meshes.map((mesh) => {
      // toNonIndexed gör om formen till en enkel lista av trianglar, så att alla former
      // är byggda på samma sätt. Bara läge, normal och uv behövs.
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      }
      // Flytta formens hörn dit objektet står i världen: då ligger hörnen redan rätt.
      geometry.applyMatrix4(mesh.matrixWorld);
      return geometry;
    });
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue; // Gick inte att slå ihop – låt dem vara.
    const mesh = new THREE.Mesh(merged, material);
    // Lagren på marken ritas i en viss ordning (se roads.js). Den lägsta ordningen i hinken
    // gäller för hela formen; inbördes ritas bitarna i samma ordning som förut.
    mesh.renderOrder = Math.min(...meshes.map((m) => m.renderOrder));
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    group.add(mesh);
    for (const old of meshes) old.removeFromParent();
    mergedAway += meshes.length - 1;
  }

  // Frys det som står still.
  function freeze(object) {
    if (MOVING.has(object)) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    for (const child of object.children) freeze(child);
  }
  freeze(group);
  group.updateMatrixWorld(true);
  console.log(`[optimize] ${world.title}: ${mergedAway} objects merged`);
}

// ---------------------------------------------------------------------------
// FÖRBERED – så att spelet inte fryser medan man kör.
// ---------------------------------------------------------------------------
// three.js är "lat": första gången ett material syns måste grafikkortet få ett eget
// program för det (en shader) som kompileras, och första gången en bild (textur) syns
// skickas den till grafikkortet. Under tiden står ALLT still – på en mobil eller en
// svag laptop i 0.2–1 sekund. Här görs det i förväg i stället.
//   extraTextures – texturer som inte syns än men kommer att bytas in (t.ex. tända skyltar).
//   onProgress(0–1) – anropas medan texturerna laddas upp, för laddningsmätaren.
export async function prepareWorld(world, extraTextures = [], onProgress = null) {
  showWorld(world); // compile tittar bara på det som syns.
  const textures = new Set(extraTextures);
  worldGroup(world).traverse((object) => {
    if (object.material && object.material.map) textures.add(object.material.map);
  });
  // compileAsync = kompilera i bakgrunden om webbläsaren klarar det. Vilka program som
  // behövs bestäms direkt när den anropas, så vi kan byta tillbaka synligheten efteråt.
  const compiling = renderer.compileAsync(scene, camera);
  showWorld(currentWorld);
  await compiling;
  const list = [...textures];
  for (let i = 0; i < list.length; i++) {
    renderer.initTexture(list[i]); // Ladda upp bilden till grafikkortet nu.
    // Med jämna mellanrum: berätta hur långt vi kommit och låt webbläsaren andas.
    if (onProgress && i % 8 === 7) {
      onProgress(i / list.length);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
}
