// ============================================================================
// loading-scene.js — den lilla 3D-scenen som syns medan den riktiga världen byggs.
// ============================================================================
// En egen, mycket lätt scen: bilen kör på en höstväg medan träd och lyktor glider
// förbi och löv faller. Inga skuggor och nästan inga objekt, så att den går att rita
// även medan datorn är upptagen med att bygga hemvärlden. Samma renderer och samma
// kameravinkel som spelet, så att övergången känns naturlig.
// Bilen kör inte på riktigt: den står still och snurrar på hjulen, medan VÄGEN och
// sakerna runt omkring flyttas bakåt – som ett rullband.
import * as THREE from 'three';
import {
  renderer, camera, PALETTE, BILLBOARD_FACING, cameraOffset, cameraLead, toTheRight, towardCamera,
} from './core.js';
import { makeCarModel, WHEEL_RADIUS } from './car.js';
import { makeTrees, placeTrees, randomTree } from './trees.js';

const loadingScene = new THREE.Scene();
loadingScene.background = new THREE.Color(PALETTE.background);
// Dimma i bakgrundens färg: allt längre bort än 30 tonas mjukt bort. Billigare än en kanttoning.
loadingScene.fog = new THREE.Fog(PALETTE.background, 30, 55);
loadingScene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.3));
const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
sun.position.set(0.35, 0.6, -1.06); // Samma håll som spelets sol.
loadingScene.add(sun);

// Bilen kör åt höger på skärmen. FORWARD = den riktningen, som en punkt {x, z} en enhet bort.
const HEADING = BILLBOARD_FACING + Math.PI / 2;
const FORWARD = toTheRight({ x: 0, z: 0 }, 1);
const SPEED = 9;          // Hur fort vägen glider förbi, enheter per sekund.
const STRIP_LENGTH = 90;  // Hur lång bit väg och omgivning som finns (den börjar om i ett rullband).

// --- Marken och vägen ---
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
ground.rotation.x = -Math.PI / 2;
loadingScene.add(ground);
// Vägen: grus med en streckad mittlinje, ritad i en canvas. Texturen flyttas (offset)
// varje bild, så att strecken glider förbi.
const roadImage = document.createElement('canvas');
roadImage.width = 64;
roadImage.height = 256;
const roadPen = roadImage.getContext('2d');
roadPen.fillStyle = PALETTE.gravel;
roadPen.fillRect(0, 0, 64, 256);
roadPen.fillStyle = PALETTE.gravelDark;
roadPen.fillRect(0, 0, 4, 256); // Kantlinjer.
roadPen.fillRect(60, 0, 4, 256);
roadPen.fillStyle = PALETTE.sign;
roadPen.fillRect(30, 0, 4, 128); // Ett streck på halva bilden = streckad linje när den upprepas.
const roadTexture = new THREE.CanvasTexture(roadImage);
roadTexture.colorSpace = THREE.SRGBColorSpace;
roadTexture.wrapT = THREE.RepeatWrapping;
roadTexture.repeat.set(1, STRIP_LENGTH / 8); // En kopia var 8:e enhet.
const road = new THREE.Mesh(new THREE.PlaneGeometry(5, STRIP_LENGTH), new THREE.MeshLambertMaterial({ map: roadTexture }));
// Vägen läggs ner platt i en grupp som är vriden åt körriktningen.
road.rotation.x = -Math.PI / 2;
road.position.y = 0.02;
const roadHolder = new THREE.Group();
roadHolder.rotation.y = HEADING;
roadHolder.add(road);
loadingScene.add(roadHolder);

// --- Bilen ---
const { model: car, spinners } = makeCarModel();
car.rotation.y = HEADING;
loadingScene.add(car);

// --- Träd och lyktor längs vägen: ett "rullband" av platser längs körriktningen ---
// along = hur långt fram längs vägen, side = hur långt åt sidan (minus = upp på skärmen).
const roadside = [];
for (let i = 0; i < 16; i++) {
  roadside.push({
    along: (i / 16) * STRIP_LENGTH - STRIP_LENGTH / 2,
    side: (i % 2 === 0 ? -1 : 1) * (5 + Math.random() * 6), // Varannan på var sida.
    tree: randomTree(0, 0),
  });
}
// Räknar ut trädens platser i världen från deras plats längs vägen.
function updateRoadsideTrees() {
  for (const spot of roadside) {
    const sideways = towardCamera({ x: 0, z: 0 }, spot.side); // Åt sidan från vägen (upp/ner på skärmen).
    spot.tree.x = FORWARD.x * spot.along + sideways.x;
    spot.tree.z = FORWARD.z * spot.along + sideways.z;
  }
}
updateRoadsideTrees();
const roadsideTrees = roadside.map((spot) => spot.tree);
// Träden byggs EN gång; varje bild flyttas de bara (placeTrees), så att inget nytt skapas.
const [trunks, crowns] = makeTrees(roadsideTrees);
loadingScene.add(trunks, crowns);

// --- Fallande löv: en handfull, enkla ---
const LEAF_COUNT = 40;
const leafGeometry = new THREE.PlaneGeometry(0.3, 0.2);
const leafMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, LEAF_COUNT);
leaves.frustumCulled = false;
const leafData = [];
for (let i = 0; i < LEAF_COUNT; i++) {
  leafData.push({ x: (Math.random() - 0.5) * 40, y: Math.random() * 12, z: (Math.random() - 0.5) * 40, spin: Math.random() * 6 });
  leaves.setColorAt(i, new THREE.Color(PALETTE.fallenLeaves[i % PALETTE.fallenLeaves.length]));
}
loadingScene.add(leaves);
const leafHelper = new THREE.Object3D();

// --- Kameran: samma vinkel som i spelet. Bilen står till höger om texten (vänster på mobil: under). ---
const target = new THREE.Vector3();
function placeCamera() {
  const shift = window.innerWidth <= 600 ? towardCamera({ x: 0, z: 0 }, -7) : toTheRight({ x: 0, z: 0 }, -9);
  target.set(shift.x, 0, shift.z).add(cameraLead);
  camera.position.copy(target).add(cameraOffset);
  camera.lookAt(target);
}

// Ritar en bild av laddningsscenen. delta = sekunder sedan förra bilden.
let roadOffset = 0;
export function renderLoadingScene(delta) {
  const step = SPEED * delta;
  // Vägens streck glider bakåt. offset räknas i "kopior av bilden"; en kopia = 8 enheter.
  roadOffset = (roadOffset + step / 8) % 1;
  roadTexture.offset.y = roadOffset;
  for (const spinner of spinners) spinner.rotation.x += step / WHEEL_RADIUS;
  // Träden glider bakåt och börjar om längst fram när de försvunnit bakom.
  for (const spot of roadside) {
    spot.along -= step;
    if (spot.along < -STRIP_LENGTH / 2) spot.along += STRIP_LENGTH;
  }
  updateRoadsideTrees();
  placeTrees(trunks, crowns, roadsideTrees);
  // Löven faller, snurrar och glider bakåt med vägen. Under marken: börja om högst upp.
  leafData.forEach((leaf, i) => {
    leaf.y -= 1.4 * delta;
    leaf.x -= FORWARD.x * step;
    leaf.z -= FORWARD.z * step;
    if (leaf.y < 0) {
      leaf.y = 12;
      leaf.x = (Math.random() - 0.5) * 40 + FORWARD.x * 15; // Nya löv kommer in framifrån.
      leaf.z = (Math.random() - 0.5) * 40 + FORWARD.z * 15;
    }
    leaf.spin += 3 * delta;
    leafHelper.position.set(leaf.x, leaf.y, leaf.z);
    leafHelper.rotation.set(leaf.spin, leaf.spin * 0.7, 0);
    leafHelper.updateMatrix();
    leaves.setMatrixAt(i, leafHelper.matrix);
  });
  leaves.instanceMatrix.needsUpdate = true;
  placeCamera();
  renderer.render(loadingScene, camera);
}

// Släpp laddningsscenen ur grafikkortets minne när spelet har tagit över.
export function disposeLoadingScene() {
  loadingScene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
  });
  roadTexture.dispose();
}
