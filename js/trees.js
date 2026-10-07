// ============================================================================
// trees.js — låga lönnar i höstfärger, ritade med instancing.
// ============================================================================
// Alla träd ritas med "instancing": grafikkortet får EN stam-form och EN lövboll-form
// och ritar dem på många platser i ett enda svep. Mycket snabbare än hundratals objekt.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from './core.js';
import { addSway, addSaturation } from './magic.js';
import { getSeasonConfig } from './season.js';

// --- Stammen: breddar ut sig nertill och går över i rotknölar, så att trädet växer UR marken ---
// Stammen är en sjusidig cylinder med fem ringar. De nedersta ringarna blir bredare (rotfoten),
// hörnen puffas lite ojämnt, och fem platta "rötter" kryper ut över marken. Hörnfärgen är mörkare
// och lite mossig nertill (färgen gångras ovanpå vitt material; se trunkMaterial).
const TRUNK_HALF = 0.9; // Stammen är 1.8 hög och står med mitten på halva höjden.
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function makeTrunkGeometry() {
  const body = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 7, 4);
  const flare = [1, 1, 1, 1.12, 1.55]; // Breddning per ring, uppifrån och ner.
  const position = body.attributes.position;
  const bumps = new Map(); // Samma knuff för hörn på samma plats, annars spricker formen (sömmen).
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const ring = Math.round((TRUNK_HALF - y) / 0.45);
    const key = ring + ',' + x.toFixed(3) + ',' + z.toFixed(3);
    if (!bumps.has(key)) bumps.set(key, 1 + (flare[ring] - 1) * (0.75 + Math.random() * 0.5));
    const scale = bumps.get(key);
    position.setXYZ(i, x * scale, y, z * scale);
  }
  const parts = [body.toNonIndexed()];
  // Rotknölar: utdragna, tillplattade fasetterade former som sticker ut och sjunker ner i marken.
  const roots = 5;
  const matrix = new THREE.Matrix4();
  for (let k = 0; k < roots; k++) {
    const angle = (k / roots) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    const length = 0.26 + Math.random() * 0.14;
    const root = new THREE.IcosahedronGeometry(1, 0);
    matrix.makeRotationY(-angle)
      .multiply(new THREE.Matrix4().makeTranslation(0.4 + Math.random() * 0.08, -TRUNK_HALF + 0.03, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(-0.15))
      .multiply(new THREE.Matrix4().makeScale(length, 0.1 + Math.random() * 0.05, 0.1 + Math.random() * 0.05));
    root.applyMatrix4(matrix);
    parts.push(root);
  }
  for (const part of parts) part.deleteAttribute('uv'); // Ingen bild på stammen.
  const geometry = mergeGeometries(parts);
  geometry.computeVertexNormals(); // Utan delade hörn: en platt normal per triangel.
  // Färg per hörn: mörkt och fuktigt nertill, mossigt i fläckar, lite ljusare uppåt.
  const base = new THREE.Color(PALETTE.trunk);
  const moss = new THREE.Color(PALETTE.grassRoot);
  const color = new THREE.Color();
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const t = (geometry.attributes.position.getY(i) + TRUNK_HALF) / 1.8; // 0 = foten, 1 = toppen.
    color.copy(base).multiplyScalar(0.45 + 0.7 * smooth(0, 0.7, t));
    // Mossa upp till ca en femtedel av höjden, i fläckar (olika per hörn).
    const mossy = (1 - smooth(0.04, 0.28, t)) * (Math.random() < 0.55 ? 0.5 : 0.1);
    color.lerp(moss, mossy);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
const trunkGeometry = makeTrunkGeometry();
// Vitt material + hörnfärger. Lambert direkt, så att optimize.js inte byter ut det.
const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true });
// IcosahedronGeometry(radie, detalj): en boll av 20 trianglar. Detalj 0 = kantig "low poly".
const leafGeometry = new THREE.IcosahedronGeometry(1.3, 0);
// Vitt material: varje lövboll får sin egen färg (vitt gånger färg = färgen).
// flatShading: varje triangel får en egen jämn nyans, så kanterna syns tydligt.
// Lambert direkt (inte Standard), så att optimize.js inte byter ut det och tappar gungningen.
const leafMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
addSway(leafMaterial); // Kronorna gungar i vinden (se magic.js).
addSaturation(leafMaterial, 1.2); // Lite starkare röda och orange kronor, men skyltarna ska synas mest.
export const leafColors = PALETTE.leaves.map((hex) => new THREE.Color(hex));
// En lönn har en bred, rund krona: tre kantiga bollar [x, y, z, storlek] som överlappar.
const CROWN_BLOBS = [[0, 2.8, 0, 1], [0.9, 2.3, 0.3, 0.7], [-0.8, 2.4, -0.4, 0.75]];

// Ett slumpat träd på platsen (x, z).
export function randomTree(x, z) {
  return {
    x,
    z,
    angle: Math.random() * Math.PI * 2,  // Slumpad vridning.
    scale: 0.8 + Math.random() * 0.6,    // 0.8 till 1.4 gånger.
    color: leafColors[Math.floor(Math.random() * leafColors.length)],
  };
}

// --- Marken vid foten: en mörk jordfläck med löv och moss, plus små bitar som ligger ovanpå ---
// Fläcken är en mjuk, ojämn bild (en InstancedMesh) som tonar ut i gräset. Ovanpå ligger några
// små bitar (en InstancedMesh till): stenar, mosstuvor och löv i en ring runt stammen.
const SOIL_PIXELS = 128;
const soilImage = document.createElement('canvas');
soilImage.width = SOIL_PIXELS;
soilImage.height = SOIL_PIXELS;
{
  const pen = soilImage.getContext('2d');
  const half = SOIL_PIXELS / 2;
  // Flera överlappande mjuka kluttar i stället för en perfekt cirkel (max 54 från mitten: tonar ut före kanten).
  for (let i = 0; i < 9; i++) {
    const cx = half + (Math.random() - 0.5) * 20;
    const cy = half + (Math.random() - 0.5) * 20;
    const radius = i === 0 ? 46 : 26 + Math.random() * 18;
    const blob = pen.createRadialGradient(cx, cy, 0, cx, cy, radius);
    blob.addColorStop(0, i === 0 ? 'rgba(34, 22, 12, 0.78)' : 'rgba(40, 26, 14, 0.4)');
    blob.addColorStop(0.55, 'rgba(46, 30, 16, 0.22)');
    blob.addColorStop(1, 'rgba(46, 30, 16, 0)');
    pen.fillStyle = blob;
    pen.fillRect(0, 0, SOIL_PIXELS, SOIL_PIXELS);
  }
  // Lövbitar och mossa i jorden (små vridna rutor).
  const flecks = [...PALETTE.fallenLeaves, PALETTE.grassRoot, PALETTE.grassRoot, '#3b2a18'];
  for (let i = 0; i < 26; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 12 + Math.random() * 36;
    pen.save();
    pen.translate(half + Math.cos(angle) * distance, half + Math.sin(angle) * distance);
    pen.rotate(Math.random() * Math.PI);
    pen.globalAlpha = 0.45 + Math.random() * 0.4;
    pen.fillStyle = flecks[Math.floor(Math.random() * flecks.length)];
    pen.fillRect(-3, -2, 4 + Math.random() * 4, 3 + Math.random() * 2);
    pen.restore();
  }
}
const soilTexture = new THREE.CanvasTexture(soilImage);
soilTexture.colorSpace = THREE.SRGBColorSpace;
// Som kontaktskuggorna (grounding.js): depthTest true + polygonOffset, så att fläcken aldrig ritas över bilen.
const soilMaterial = new THREE.MeshBasicMaterial({
  map: soilTexture,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
});
const soilGeometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2); // Radie 1, liggande.
const litterGeometry = new THREE.IcosahedronGeometry(1, 0);
const litterMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
const LITTER_PER_TREE = 8;
// Säsong (season.js, nyckeln foliage): leafLitter = andel av småbitarna som är löv (0 = inga löv, snö/frost i stället,
// i färgen litterAlt), soilAlpha = hur tydlig den mörka jordfläcken under trädet är.
const foliage = getSeasonConfig().foliage || {};
const LEAF_SHARE = foliage.leafLitter === undefined ? 1 : foliage.leafLitter;
const LITTER_ALT = new THREE.Color(foliage.litterAlt || '#eef3f8');
if (foliage.soilAlpha !== undefined) soilMaterial.opacity = foliage.soilAlpha;
const stoneLight = new THREE.Color(PALETTE.gravelLight);
const stoneDark = new THREE.Color(PALETTE.gravelDark);
const mossColor = new THREE.Color(PALETTE.grassRoot);
const leafLitter = PALETTE.fallenLeaves.map((hex) => new THREE.Color(hex));

// Jordfläck + smådelar för varje träd. Returnerar [fläckar, småbitar]; stannar kvar där träden
// stod (om ett träd välter ligger fläcken kvar, som en fläck där det växte).
function makeTreeBases(trees) {
  const soil = new THREE.InstancedMesh(soilGeometry, soilMaterial, trees.length);
  const litter = new THREE.InstancedMesh(litterGeometry, litterMaterial, trees.length * LITTER_PER_TREE);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const spot = new THREE.Vector3();
  const size = new THREE.Vector3();
  const color = new THREE.Color();
  trees.forEach((tree, i) => {
    // Fläcken: lite större än kronans mittdel, vriden slumpmässigt (ojämn kant).
    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2);
    spot.set(tree.x, 0.04, tree.z);
    size.set(tree.scale * 1.05, 1, tree.scale * 1.05);
    matrix.compose(spot, quaternion, size);
    soil.setMatrixAt(i, matrix);
    for (let j = 0; j < LITTER_PER_TREE; j++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = tree.scale * (0.5 + Math.random() * 0.5); // Utanför rotfoten.
      const roll = Math.random();
      let width;
      let height;
      if (roll < 0.35) { // Liten sten.
        width = 0.07 + Math.random() * 0.07;
        height = width * 0.6;
        color.copy(stoneLight).lerp(stoneDark, Math.random());
        if (Math.random() < 0.4) color.lerp(mossColor, 0.4);
      } else if (roll < 0.7) { // Mosstuva, tätt intill stammen.
        width = 0.1 + Math.random() * 0.08;
        height = width * 0.7;
        color.copy(mossColor).multiplyScalar(0.7 + Math.random() * 0.6);
      } else if (Math.random() >= LEAF_SHARE) { // Inga löv denna säsong: en liten snö- eller frostklump.
        width = 0.1 + Math.random() * 0.08;
        height = width * 0.45;
        color.copy(LITTER_ALT).multiplyScalar(0.88 + Math.random() * 0.12);
      } else { // Fallet löv: platt.
        width = 0.11 + Math.random() * 0.05;
        height = 0.025;
        color.copy(leafLitter[Math.floor(Math.random() * leafLitter.length)]).multiplyScalar(0.55 + Math.random() * 0.25); // Mörka, fuktiga.
      }
      euler.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
      quaternion.setFromEuler(euler);
      spot.set(tree.x + Math.cos(angle) * distance, 0.045 + height * 0.1, tree.z + Math.sin(angle) * distance);
      size.set(width * tree.scale, height * tree.scale, width * tree.scale * (0.6 + Math.random() * 0.5));
      matrix.compose(spot, quaternion, size);
      litter.setMatrixAt(i * LITTER_PER_TREE + j, matrix);
      litter.setColorAt(i * LITTER_PER_TREE + j, color);
    }
  });
  soil.instanceMatrix.needsUpdate = true;
  litter.instanceMatrix.needsUpdate = true;
  litter.instanceColor.needsUpdate = true;
  soil.frustumCulled = false;
  litter.frustumCulled = false;
  soil.renderOrder = -2;   // Efter marken och kontaktskuggorna (-3), före allt annat genomskinligt.
  litter.renderOrder = -1; // Under 0: kastar ingen skugga (setShadows), men tar emot.
  return [soil, litter];
}

// Gör InstancedMesh av en lista med träd { x, z, angle, scale, color }: [stammar, kronor, jordfläckar,
// småbitar]. De två sista är bara grafik vid foten; den som kör fysik/välter träd använder de två första.
export function makeTrees(trees) {
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const crowns = new THREE.InstancedMesh(leafGeometry, leafMaterial, trees.length * CROWN_BLOBS.length);
  placeTrees(trunks, crowns, trees);
  // Färgerna sätts bara en gång här (placeTrees kan köras varje bild i laddningsscenen).
  trees.forEach((tree, i) => {
    for (let j = 0; j < CROWN_BLOBS.length; j++) crowns.setColorAt(i * CROWN_BLOBS.length + j, tree.color);
  });
  return [trunks, crowns, ...makeTreeBases(trees)];
}

// Ställer träden på sina platser (används också när träden flyttas, i laddningsscenen).
// Varje kopia får en "matris" (plats + vridning + storlek i ett paket). Enklast är att
// ställa in ett osynligt hjälpobjekt och kopiera dess matris.
const helper = new THREE.Object3D();
export function placeTrees(trunks, crowns, trees) {
  trees.forEach((tree, i) => {
    helper.position.set(tree.x, 0.9 * tree.scale, tree.z); // Stammens mitt på halva höjden.
    helper.rotation.set(0, tree.angle, 0);
    helper.scale.setScalar(tree.scale);
    helper.updateMatrix();
    trunks.setMatrixAt(i, helper.matrix);
    const cos = Math.cos(tree.angle);
    const sin = Math.sin(tree.angle);
    CROWN_BLOBS.forEach(([bx, by, bz, size], j) => {
      // Bollens plats vrids med trädet (att vrida en punkt runt Y-axeln).
      const turnedX = bx * cos + bz * sin;
      const turnedZ = -bx * sin + bz * cos;
      helper.position.set(tree.x + turnedX * tree.scale, by * tree.scale, tree.z + turnedZ * tree.scale);
      helper.scale.setScalar(size * tree.scale);
      helper.updateMatrix();
      const slot = i * CROWN_BLOBS.length + j; // Träd i använder platserna i*3, i*3+1, i*3+2.
      crowns.setMatrixAt(slot, helper.matrix);
    });
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
}
