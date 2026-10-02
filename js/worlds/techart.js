// ============================================================================
// worlds/techart.js — Tech Art-världen: ett rutnät som i ett 3D-program, och en
// provbänk med tre testformer vid teleportplattan. Hämtas och byggs först när man
// reser hit första gången (se loadWorld i portals.js).
// ============================================================================
import * as THREE from 'three';
import { PALETTE, WORLDS, TILE_PIXELS, worldGroup, frameMaterial } from '../core.js';
import { markMoving } from '../optimize.js';
import { buildWorldBasics, decorSpots } from './common.js';

const world = WORLDS.techart;
const labShapes = []; // Formerna sparas här, så att de kan snurras i update.

export function build() {
  buildWorldBasics(world, (pen) => {
    pen.fillStyle = PALETTE.techGround;
    pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
    // Tunna linjer var 64:e pixel (= varannan enhet på marken), åt båda hållen.
    pen.fillStyle = PALETTE.techGrid;
    for (let i = 0; i < TILE_PIXELS; i += 64) {
      pen.fillRect(i, 0, 3, TILE_PIXELS);
      pen.fillRect(0, i, TILE_PIXELS, 3);
    }
    // En tjock linje längs två kanter: när bilden upprepas blir det en stor ruta var 16:e enhet.
    pen.fillStyle = PALETTE.techGridMain;
    pen.fillRect(0, 0, 6, TILE_PIXELS);
    pen.fillRect(0, 0, TILE_PIXELS, 6);
  });

  // --- Provbänken: de klassiska sakerna man testar en shader på ---
  // Ett schackrutigt "UV-test", som man lägger på en modell för att se om texturen sträcks ut.
  const checkerImage = document.createElement('canvas');
  checkerImage.width = 256;
  checkerImage.height = 256;
  const checkerPen = checkerImage.getContext('2d');
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      checkerPen.fillStyle = (row + column) % 2 === 0 ? PALETTE.sign : PALETTE.signGlow;
      checkerPen.fillRect(column * 32, row * 32, 32, 32);
    }
  }
  const checkerTexture = new THREE.CanvasTexture(checkerImage);
  checkerTexture.colorSpace = THREE.SRGBColorSpace;
  const [left, right, rightLow] = decorSpots(world);
  const LAB_SHAPES = [
    // MeshNormalMaterial färgar varje yta efter åt vilket håll den pekar – ett felsökningsläge.
    { geometry: new THREE.SphereGeometry(1.1, 32, 16), material: new THREE.MeshNormalMaterial(), at: left },
    // wireframe: true ritar bara kanterna mellan trianglarna, så man ser hur formen är byggd.
    { geometry: new THREE.TorusKnotGeometry(0.8, 0.28, 96, 12), material: new THREE.MeshBasicMaterial({ color: PALETTE.techGridMain, wireframe: true }), at: right },
    { geometry: new THREE.BoxGeometry(1.6, 1.6, 1.6), material: new THREE.MeshLambertMaterial({ map: checkerTexture }), at: rightLow },
  ];
  for (const shape of LAB_SHAPES) {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), frameMaterial);
    plinth.position.set(shape.at.x, 0.5, shape.at.z);
    worldGroup(world).add(plinth);
    const mesh = new THREE.Mesh(shape.geometry, shape.material);
    mesh.position.set(shape.at.x, 2.4, shape.at.z);
    worldGroup(world).add(mesh);
    labShapes.push(mesh);
    markMoving(mesh); // Snurrar: får inte slås ihop eller frysas.
  }
}

// Körs varje bild medan bilen är i världen: testformerna snurrar långsamt.
export function update(delta) {
  for (const shape of labShapes) {
    shape.rotation.y += 0.6 * delta;
    shape.rotation.x += 0.25 * delta;
  }
}
