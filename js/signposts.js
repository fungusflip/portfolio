// ============================================================================
// signposts.js — små träskyltar med en pil och en text.
// ============================================================================
import * as THREE from 'three';
import { markMoving } from './optimize.js';
import { knockableObject } from './knockables.js';
import { PALETTE, BILLBOARD_FACING, MAX_ANISOTROPY, SCREEN_TILT, worldGroup, postMaterial } from './core.js';

const SIGNPOST_WIDTH = 4.2;
const SIGNPOST_HEIGHT = 1.2;

// Bygger skyltar i en värld. Varje skylt:
//   text  – det som står på skylten.
//   arrow – åt vilket håll pilen pekar på skärmen: 'up', 'down', 'left', 'right' eller 'none'.
//   at    – var skylten står, { x, z }.
export function buildSignposts(world, signposts) {
  for (const signpost of signposts) {
    const image = document.createElement('canvas');
    image.width = 700;
    image.height = 200; // Samma proportioner som brädan (4.2 x 1.2).
    const brush = image.getContext('2d');
    brush.fillStyle = PALETTE.sign;
    brush.fillRect(0, 0, image.width, image.height);
    brush.fillStyle = PALETTE.signText;
    brush.textAlign = 'center';
    brush.textBaseline = 'middle';
    // Pilen är ett vanligt tecken. Vänsterpil står före texten, de andra efter.
    let label = `${signpost.text} ↑`;
    if (signpost.arrow === 'left') label = `← ${signpost.text}`;
    if (signpost.arrow === 'right') label = `${signpost.text} →`;
    if (signpost.arrow === 'down') label = `${signpost.text} ↓`;
    if (signpost.arrow === 'none') label = signpost.text;
    // Börja med stor text och krymp tills den får plats.
    let fontSize = 110;
    brush.font = `bold ${fontSize}px system-ui, sans-serif`;
    while (brush.measureText(label).width > image.width - 50) {
      fontSize -= 4;
      brush.font = `bold ${fontSize}px system-ui, sans-serif`;
    }
    brush.fillText(label, image.width / 2, image.height / 2 + 6);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = MAX_ANISOTROPY;

    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.6, 0.25), postMaterial);
    post.position.set(0, 0.8, -0.14);
    group.add(post);
    // Brädan lutar bakåt runt sin underkant, som alla andra skyltar.
    const board = new THREE.Group();
    board.position.y = 1.4;
    board.rotation.x = -SCREEN_TILT;
    group.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SIGNPOST_WIDTH + 0.25, SIGNPOST_HEIGHT + 0.25, 0.2), postMaterial);
    frame.position.set(0, SIGNPOST_HEIGHT / 2 + 0.12, -0.11);
    board.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(SIGNPOST_WIDTH, SIGNPOST_HEIGHT), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(0, SIGNPOST_HEIGHT / 2 + 0.12, 0);
    board.add(face);
    group.position.set(signpost.at.x, 0, signpost.at.z);
    group.rotation.y = BILLBOARD_FACING; // Vänd mot kameran.
    worldGroup(world).add(group);
    // Bilen kan köra över skylten: den välter runt foten (signpost.knock, se hub.js).
    // markMoving: en grupp som rör sig får inte slås ihop eller frysas av optimize.js.
    markMoving(group);
    signpost.knock = knockableObject(group);
  }
}
