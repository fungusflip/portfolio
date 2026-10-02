// ============================================================================
// trees.js — låga lönnar i höstfärger, ritade med instancing.
// ============================================================================
// Alla träd ritas med "instancing": grafikkortet får EN stam-form och EN lövboll-form
// och ritar dem på många platser i ett enda svep. Mycket snabbare än hundratals objekt.
import * as THREE from 'three';
import { PALETTE, postMaterial } from './core.js';

const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 7);
// IcosahedronGeometry(radie, detalj): en boll av 20 trianglar. Detalj 0 = kantig "low poly".
const leafGeometry = new THREE.IcosahedronGeometry(1.3, 0);
// Vitt material: varje lövboll får sin egen färg (vitt gånger färg = färgen).
// flatShading: varje triangel får en egen jämn nyans, så kanterna syns tydligt.
const leafMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
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

// Gör två InstancedMesh (stammar och kronor) av en lista med träd { x, z, angle, scale, color }.
export function makeTrees(trees) {
  const trunks = new THREE.InstancedMesh(trunkGeometry, postMaterial, trees.length);
  const crowns = new THREE.InstancedMesh(leafGeometry, leafMaterial, trees.length * CROWN_BLOBS.length);
  placeTrees(trunks, crowns, trees);
  return [trunks, crowns];
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
      crowns.setColorAt(slot, tree.color);
    });
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
}
