// ============================================================================
// worlds/art.js — Art-världen: en målares skyddsduk med färgstänk, och färgburkar
// och en jättepensel vid teleportplattan. Byggs först när man reser hit.
// ============================================================================
import * as THREE from 'three';
import { PALETTE, WORLDS, TILE_PIXELS, BILLBOARD_FACING, worldGroup, postMaterial } from '../core.js';
import { buildWorldBasics, decorSpots } from './common.js';

const world = WORLDS.art;

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

  // --- Dekoration vid plattan: färgburkar och en jättepensel ---
  // (Projekten står redan på staffli, så här blir det målarens verktyg i stället.)
  const [left, right, rightLow] = decorSpots(world);
  const group = worldGroup(world);
  const tinMaterial = new THREE.MeshStandardMaterial({ color: '#b8bcc2', roughness: 0.4, metalness: 0.6 }); // Plåt.
  // En färgburk: plåtburk, färgyta upptill och en droppe färg som runnit ner längs sidan.
  function paintPot(at, color, scale) {
    const pot = new THREE.Group();
    const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 20), tinMaterial);
    tin.position.y = 0.6;
    pot.add(tin);
    const paintMaterial = new THREE.MeshLambertMaterial({ color });
    const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.05, 20), paintMaterial);
    paint.position.y = 1.2;
    pot.add(paint);
    const drip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.6, 0.06), paintMaterial); // Rinner ner mot kameran.
    drip.position.set(0.1, 0.95, 0.69);
    pot.add(drip);
    const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.03, 16), paintMaterial); // Pölen vid foten.
    puddle.position.set(0.4, 0.02, 0.9);
    pot.add(puddle);
    pot.scale.setScalar(scale);
    pot.position.set(at.x, 0, at.z);
    pot.rotation.y = BILLBOARD_FACING;
    group.add(pot);
  }
  // Tre burkar i en klunga till vänster, en ensam till höger.
  paintPot(left, PALETTE.artPaints[0], 1.4);
  paintPot({ x: left.x + 1.6, z: left.z - 1.2 }, PALETTE.artPaints[1], 1.1);
  paintPot({ x: left.x - 1.2, z: left.z + 1.5 }, PALETTE.artPaints[2], 0.9);
  paintPot(rightLow, PALETTE.artPaints[3], 1.2);

  // Jättepenseln, liggande på marken till höger: skaft i trä, plåthylsa och borst med rosa färg i spetsen.
  const brush = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 4.5, 12), postMaterial);
  handle.position.y = 2.25;
  brush.add(handle);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1, 12), tinMaterial);
  ferrule.position.y = 5;
  brush.add(ferrule);
  const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.6, 12), new THREE.MeshLambertMaterial({ color: '#efe2cc' }));
  bristles.position.y = 6.3;
  brush.add(bristles);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 12), new THREE.MeshLambertMaterial({ color: PALETTE.artAccent }));
  tip.position.y = 6.75;
  brush.add(tip);
  for (const part of brush.children) part.position.y -= 3.5; // Penseln är ca 7 lång: centrera den på sin plats.
  brush.rotation.set(0, BILLBOARD_FACING + 0.6, Math.PI / 2); // Lägg den ner på sidan, snett.
  brush.position.set(right.x, 0.4, right.z);
  group.add(brush);
}
