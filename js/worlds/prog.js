// ============================================================================
// worlds/prog.js — Programming-världen: ett kretskort, och tre serverrack med
// blinkande lysdioder vid teleportplattan. Byggs först när man reser hit.
// ============================================================================
import * as THREE from 'three';
import { PALETTE, WORLDS, TILE_PIXELS, BILLBOARD_FACING, worldGroup, frameMaterial } from '../core.js';
import { buildWorldBasics, decorSpots } from './common.js';

const world = WORLDS.prog;
// Alla 72 lysdioder är EN InstancedMesh: ett ritanrop i stället för 72. En diod
// "blinkar" genom att dess färg byts mellan tänd och släckt (setColorAt).
const ledOnColor = new THREE.Color(PALETTE.progTrace);
const ledOffColor = new THREE.Color(PALETTE.progTraceDim);
let leds = null;
const ledOn = []; // true/false per diod: är den tänd?

export function build() {
  // Ledningar som går en bit rakt och sedan svänger 90°, med en lödpunkt i varje ände.
  buildWorldBasics(world, (pen) => {
    pen.fillStyle = PALETTE.progGround;
    pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
    const spot = () => 40 + Math.random() * (TILE_PIXELS - 80); // Inte för nära kanten (skarven).
    pen.lineWidth = 8;
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    for (let i = 0; i < 14; i++) {
      const [x1, y1, x2, y2] = [spot(), spot(), spot(), spot()];
      pen.strokeStyle = PALETTE.progTraceDim; // Först vågrätt till x2, sedan lodrätt till y2.
      pen.beginPath();
      pen.moveTo(x1, y1);
      pen.lineTo(x2, y1);
      pen.lineTo(x2, y2);
      pen.stroke();
      for (const [x, y] of [[x1, y1], [x2, y2]]) { // Lödpunkterna: en lysande ring med hål.
        pen.fillStyle = PALETTE.progTrace;
        pen.beginPath();
        pen.arc(x, y, 10, 0, Math.PI * 2);
        pen.fill();
        pen.fillStyle = PALETTE.progGround;
        pen.beginPath();
        pen.arc(x, y, 4, 0, Math.PI * 2);
        pen.fill();
      }
    }
  });

  // --- Serverracken ---
  const ledMatrices = [];
  const ledHelper = new THREE.Object3D(); // Flyttas till varje diod för att läsa av dess matris.
  for (const at of decorSpots(world)) {
    const rack = new THREE.Group();
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 1.6), frameMaterial);
    cabinet.position.y = 1.8;
    rack.add(cabinet);
    rack.position.set(at.x, 0, at.z);
    rack.rotation.y = BILLBOARD_FACING;
    rack.add(ledHelper);
    // Sex rader med fyra lysdioder på framsidan (+z vetter mot kameran).
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 4; column++) {
        ledHelper.position.set(-0.6 + column * 0.4, 0.6 + row * 0.5, 0.81);
        rack.updateMatrixWorld(true);
        ledMatrices.push(ledHelper.matrixWorld.clone()); // Diodens plats och vridning i världen.
      }
    }
    rack.remove(ledHelper);
    worldGroup(world).add(rack);
  }
  leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: '#ffffff' }), ledMatrices.length);
  ledMatrices.forEach((matrix, i) => {
    leds.setMatrixAt(i, matrix);
    ledOn.push(Math.random() < 0.5); // Hälften tända från början.
    leds.setColorAt(i, ledOn[i] ? ledOnColor : ledOffColor);
  });
  worldGroup(world).add(leds);
}

// Körs varje bild medan bilen är i världen: med jämna mellanrum byter en slumpad diod läge.
const LED_BLINK_TIME = 0.08;
let ledWait = 0;
export function update(delta) {
  ledWait -= delta;
  if (ledWait > 0) return;
  ledWait = LED_BLINK_TIME;
  const i = Math.floor(Math.random() * leds.count);
  ledOn[i] = !ledOn[i];
  leds.setColorAt(i, ledOn[i] ? ledOnColor : ledOffColor);
  leds.instanceColor.needsUpdate = true; // Skicka de nya färgerna till grafikkortet.
}
