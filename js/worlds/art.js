// ============================================================================
// worlds/art.js — Art-världen: en målares skyddsduk med färgstänk, och två staffli
// med målningar vid teleportplattan. Byggs först när man reser hit.
// ============================================================================
import * as THREE from 'three';
import { PALETTE, WORLDS, TILE_PIXELS, BILLBOARD_FACING, worldGroup, postMaterial } from '../core.js';
import { buildWorldBasics, decorSpots } from './common.js';

const world = WORLDS.art;

// En målning med slumpade penseldrag i Art-världens färger – lite olika varje gång.
function makePaintingTexture() {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 320; // Samma proportioner som duken (2 x 2.5).
  const pen = image.getContext('2d');
  pen.fillStyle = PALETTE.sign;
  pen.fillRect(0, 0, image.width, image.height);
  pen.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    // Ett penseldrag: en tjock, böjd linje (quadraticCurveTo) mellan två slumpade punkter.
    pen.strokeStyle = PALETTE.artPaints[Math.floor(Math.random() * PALETTE.artPaints.length)];
    pen.lineWidth = 10 + Math.random() * 26;
    pen.beginPath();
    pen.moveTo(Math.random() * 256, Math.random() * 320);
    pen.quadraticCurveTo(Math.random() * 256, Math.random() * 320, Math.random() * 256, Math.random() * 320);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function build() {
  buildWorldBasics(world, (pen) => {
    pen.fillStyle = PALETTE.artGround;
    pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
    // Vävens trådar: tunna, svaga linjer. globalAlpha = hur täckande allt som ritas blir.
    pen.globalAlpha = 0.07;
    pen.fillStyle = PALETTE.signText;
    for (let i = 0; i < TILE_PIXELS; i += 6) {
      pen.fillRect(i, 0, 1, TILE_PIXELS);
      pen.fillRect(0, i, TILE_PIXELS, 1);
    }
    pen.globalAlpha = 1;
    // Färgstänk: en stor klick med små droppar runt omkring.
    const spot = () => 50 + Math.random() * (TILE_PIXELS - 100);
    for (let i = 0; i < 9; i++) {
      const x = spot();
      const y = spot();
      pen.fillStyle = PALETTE.artPaints[i % PALETTE.artPaints.length];
      pen.beginPath();
      pen.arc(x, y, 8 + Math.random() * 16, 0, Math.PI * 2);
      pen.fill();
      for (let j = 0; j < 10; j++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 14 + Math.random() * 30;
        pen.beginPath();
        pen.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 1.5 + Math.random() * 4, 0, Math.PI * 2);
        pen.fill();
      }
    }
  });

  // --- Två staffli, ett på var sida om plattan ---
  for (const at of decorSpots(world).slice(0, 2)) { // .slice(0, 2) = bara de två första platserna.
    const easel = new THREE.Group();
    // Tre ben: två fram som lutar ut åt sidorna, ett bak som lutar bakåt.
    for (const [x, z, tiltZ, tiltX] of [[-0.6, 0.2, -0.15, 0], [0.6, 0.2, 0.15, 0], [0, -0.7, 0, -0.35]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), postMaterial);
      leg.position.set(x, 1.6, z);
      leg.rotation.set(tiltX, 0, tiltZ);
      easel.add(leg);
    }
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.3), postMaterial); // Hyllan.
    ledge.position.set(0, 1.2, 0.35);
    easel.add(ledge);
    const painting = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), new THREE.MeshLambertMaterial({ map: makePaintingTexture() }));
    painting.position.set(0, 2.55, 0.42);
    painting.rotation.x = -0.15; // Lutar bakåt som skyltarna.
    easel.add(painting);
    easel.position.set(at.x, 0, at.z);
    easel.rotation.y = BILLBOARD_FACING;
    worldGroup(world).add(easel);
  }
}
