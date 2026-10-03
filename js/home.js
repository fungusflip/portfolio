// ============================================================================
// home.js — "About me": garaget, stugan, namnskylten och brevlådan, plus
// hubPoint som hemvärldens andra delar använder för att placera saker.
// ============================================================================
import * as THREE from 'three';
import {
  PALETTE, WORLDS, BILLBOARD_FACING, CAMERA_PITCH, MAX_ANISOTROPY, SCREEN_TILT,
  towardCamera, toTheRight, worldGroup, postMaterial, paintMaterial, makeGlowMaterial,
} from './core.js';
import { PAD_DISTANCE, PAD_RADIUS, addParkingBay, lightPad } from './billboards.js';
import { PROJECTS } from './projects.js';
import { ROAD_DISTANCE } from './roads.js';
import { setParkedAt, leaveParking } from './ui.js';
import { ABOUT } from './projects.js';
import { markMoving } from './optimize.js';
import { makeSmoke } from './magic.js';

// Texten på namnskylten.
const HOME_NAME = 'Filip Renemark';
const HOME_ROLE = 'Technical Artist';

// Var tomten ligger (garagets mitt). ÄNDRA HÄR för att flytta allt på en gång.
// Tomten ligger i samma rad som projektskyltarna, längst ut till vänster på skärmen.
export const HOME_X = 31.5;
export const HOME_Z = -21.5;

// Allt läggs i en grupp som vrids mot kameran. Inne i gruppen gäller:
//   +x = åt höger på skärmen, +z = nedåt på skärmen (mot kameran).
export const homeGroup = new THREE.Group();
homeGroup.position.set(HOME_X, 0, HOME_Z);
homeGroup.rotation.y = BILLBOARD_FACING;
worldGroup(WORLDS.hub).add(homeGroup);

// emissive = färg som ytan "lyser" med själv, så att väggarna inte blir grå i skuggan.
const wallMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.sign, roughness: 0.9, emissive: PALETTE.sign, emissiveIntensity: 0.4 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#e0101f', roughness: 0.8, flatShading: true }); // Klarrött tak.

// --- Garaget: porten vetter mot kameran, bilen står parkerad framför ---
const GARAGE_WIDTH = 5.6;
export const GARAGE_DEPTH = 3.6;
const GARAGE_HEIGHT = 2.6;
export const GARAGE_Z = 0; // Garagets mitt. Större z = längre ner på skärmen.
const garageWallMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageWall, roughness: 1, emissive: PALETTE.garageWall, emissiveIntensity: 0.4 });
const garageRoofMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageRoof, roughness: 1 });
const garageWalls = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_WIDTH, GARAGE_HEIGHT, GARAGE_DEPTH), garageWallMaterial);
garageWalls.position.set(0, GARAGE_HEIGHT / 2, GARAGE_Z);
homeGroup.add(garageWalls);
const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_WIDTH + 0.5, 0.3, GARAGE_DEPTH + 0.5), garageRoofMaterial);
garageRoof.position.set(0, GARAGE_HEIGHT + 0.15, GARAGE_Z);
homeGroup.add(garageRoof);

// Garageporten: en ljus vikport med paneler och en rad små fönster, ritad i en canvas.
const GARAGE_DOOR_WIDTH = 4.4;
const GARAGE_DOOR_HEIGHT = 2.1;
const doorImage = document.createElement('canvas');
doorImage.width = 440;  // 100 pixlar per enhet.
doorImage.height = 210;
const doorPen = doorImage.getContext('2d');
doorPen.fillStyle = PALETTE.garageDoor;
doorPen.fillRect(0, 0, doorImage.width, doorImage.height);
doorPen.fillStyle = PALETTE.garageWall; // Skarvarna mellan panelerna.
for (const y of [42, 84, 126, 168]) doorPen.fillRect(0, y - 3, doorImage.width, 6);
doorPen.fillStyle = PALETTE.glass;      // Fyra små fönster i den översta panelen.
for (const x of [40, 140, 240, 340]) doorPen.fillRect(x, 10, 60, 22);
doorPen.fillStyle = PALETTE.frame;      // Handtag.
doorPen.fillRect(doorImage.width / 2 - 30, 184, 60, 10);
const doorTexture = new THREE.CanvasTexture(doorImage);
doorTexture.colorSpace = THREE.SRGBColorSpace;
export const garageDoor = new THREE.Mesh(new THREE.PlaneGeometry(GARAGE_DOOR_WIDTH, GARAGE_DOOR_HEIGHT), new THREE.MeshBasicMaterial({ map: doorTexture }));
garageDoor.position.set(0, GARAGE_DOOR_HEIGHT / 2, GARAGE_Z + GARAGE_DEPTH / 2 + 0.01); // 0.01 utanpå väggen, annars flimrar den.
homeGroup.add(garageDoor);
// Det mörka hålet bakom porten. Syns bara medan porten är "öppen" (gömd).
export const garageOpening = new THREE.Mesh(new THREE.PlaneGeometry(GARAGE_DOOR_WIDTH, GARAGE_DOOR_HEIGHT), new THREE.MeshBasicMaterial({ color: PALETTE.frame }));
garageOpening.position.set(0, GARAGE_DOOR_HEIGHT / 2, GARAGE_Z + GARAGE_DEPTH / 2 + 0.005);
homeGroup.add(garageOpening);

// Lampan över porten: en lysande låda plus fejkat ljus (se addFakeLight).
const garageLampBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.25), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
garageLampBox.position.set(0, GARAGE_DOOR_HEIGHT + 0.22, GARAGE_Z + GARAGE_DEPTH / 2 + 0.12);
homeGroup.add(garageLampBox);

// Fejkat ljus: en ljuspöl på marken (x, z, bredd, djup) och, om haloY anges, ett sken
// runt lampan. Inga riktiga lampor – de kostar för varje pixel på skärmen. strength = 0..1.
function addFakeLight(x, z, width, depth, strength, haloY) {
  const poolMaterial = makeGlowMaterial(0.55);
  poolMaterial.color.set(PALETTE.warmLamp).multiplyScalar(strength);
  const poolGeometry = new THREE.PlaneGeometry(width, depth);
  poolGeometry.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeometry, poolMaterial);
  pool.position.set(x, 0.09, z);
  homeGroup.add(pool);
  if (haloY === undefined) return;
  const haloMaterial = makeGlowMaterial(0.8);
  haloMaterial.color.set(PALETTE.warmLamp).multiplyScalar(strength);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), haloMaterial);
  // Gruppen är redan vriden mot kameran i sidled; luta upp skenet mot kameran också.
  halo.position.set(x, haloY, GARAGE_Z + GARAGE_DEPTH / 2 + 0.3);
  halo.rotation.x = -CAMERA_PITCH;
  homeGroup.add(halo);
}
addFakeLight(0, GARAGE_Z + GARAGE_DEPTH / 2 + 2.6, 6.5, 5.5, 0.9, GARAGE_DOOR_HEIGHT + 0.2); // ÄNDRA 0.9 för starkare/svagare.

// --- Stugan, till höger om garaget ---
export const CABIN_X = 5.6;
export const CABIN_Z = 0;
export const CABIN_SIZE = 5;
const CABIN_HEIGHT = 3.8; // Högre än garaget, så att det röda taket reser sig över garagets.
const cabinWalls = new THREE.Mesh(new THREE.BoxGeometry(CABIN_SIZE, CABIN_HEIGHT, CABIN_SIZE), wallMaterial);
cabinWalls.position.set(CABIN_X, CABIN_HEIGHT / 2, CABIN_Z);
homeGroup.add(cabinWalls);
// Tak: en "kon" med 4 sidor = en pyramid, vriden 45° så att sidorna ligger längs väggarna.
const cabinRoof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), roofMaterial);
cabinRoof.rotation.y = Math.PI / 4;
cabinRoof.position.set(CABIN_X, CABIN_HEIGHT + 1, CABIN_Z);
homeGroup.add(cabinRoof);
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), postMaterial);
chimney.position.set(CABIN_X - 1.2, CABIN_HEIGHT + 1, CABIN_Z - 0.8);
homeGroup.add(chimney);
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.1), postMaterial);
door.position.set(CABIN_X + 1.1, 0.95, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(door);
// Fönstret lyser varmt: någon är hemma.
const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
cabinWindow.position.set(CABIN_X - 1, 1.6, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(cabinWindow);
addFakeLight(CABIN_X - 1, CABIN_Z + CABIN_SIZE / 2 + 2, 3.4, 4, 0.7); // Ljuset ut genom fönstret.

// Parkeringsfickan utanför garaget. Här startar bilen.
const HOME_PAD_Z = PAD_DISTANCE;
const homePadMaterial = addParkingBay(homeGroup, HOME_PAD_Z);

// --- Namnskylten på garagets tak ---
const NAME_WIDTH = 5.4;
const NAME_HEIGHT = 1.98;
const nameImage = document.createElement('canvas');
nameImage.width = 960;
nameImage.height = 352; // Samma proportioner som skylten.
const namePen = nameImage.getContext('2d');
namePen.fillStyle = PALETTE.sign;
namePen.fillRect(0, 0, nameImage.width, nameImage.height);
namePen.textAlign = 'center';
namePen.textBaseline = 'middle';
namePen.fillStyle = PALETTE.signText;
namePen.font = 'bold 124px system-ui, sans-serif';
namePen.fillText(HOME_NAME, nameImage.width / 2, 130);
namePen.fillStyle = PALETTE.signGlow;
namePen.font = 'bold 76px system-ui, sans-serif';
namePen.fillText(HOME_ROLE, nameImage.width / 2, 258);
const nameTexture = new THREE.CanvasTexture(nameImage);
nameTexture.colorSpace = THREE.SRGBColorSpace;
nameTexture.anisotropy = MAX_ANISOTROPY;
// Brädan lutar bakåt runt sin underkant, så att kameran ser texten rakt.
const nameBoard = new THREE.Group();
nameBoard.position.set(0, GARAGE_HEIGHT + 0.3, GARAGE_Z + GARAGE_DEPTH / 2 - 0.3);
nameBoard.rotation.x = -SCREEN_TILT;
homeGroup.add(nameBoard);
const nameFrame = new THREE.Mesh(new THREE.BoxGeometry(NAME_WIDTH + 0.3, NAME_HEIGHT + 0.3, 0.2), postMaterial);
nameFrame.position.set(0, NAME_HEIGHT / 2 + 0.15, -0.11);
nameBoard.add(nameFrame);
const nameFace = new THREE.Mesh(new THREE.PlaneGeometry(NAME_WIDTH, NAME_HEIGHT), new THREE.MeshBasicMaterial({ map: nameTexture }));
nameFace.position.set(0, NAME_HEIGHT / 2 + 0.15, 0);
nameBoard.add(nameFace);
// Ett varmt, stilla sken bakom namnskylten, som en upplyst butiksskylt. Starkare när bilen
// står i fickan (se updateHome).
const nameGlow = new THREE.Mesh(new THREE.PlaneGeometry(NAME_WIDTH + 4, NAME_HEIGHT + 3), makeGlowMaterial(0.9));
nameGlow.position.set(0, NAME_HEIGHT / 2 + 0.15, -0.35);
nameGlow.userData.noShadow = true;
const NAME_GLOW_COLOR = new THREE.Color(PALETTE.bulbs);
nameGlow.material.color.copy(NAME_GLOW_COLOR).multiplyScalar(0.45);
nameBoard.add(nameGlow);
markMoving(nameGlow); // Byter styrka: får inte slås ihop.

// --- En stor kopp grönt te bredvid garaget, som ångar ---
// Samma kopp som på startskärmen: gräddvit kopp, matchagrönt te, ett fat under.
const teaCup = new THREE.Group();
teaCup.position.set(-4.5, 0, GARAGE_Z + 1.6); // Till vänster om garaget, lite framför.
teaCup.scale.setScalar(1.3);
homeGroup.add(teaCup);
// emissive = lyser lite av sig själv (som stugans väggar), så att koppen syns även i garagets skugga.
const cupMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.sign, roughness: 0.5, emissive: PALETTE.sign, emissiveIntensity: 0.4 });
const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.25, 0.14, 24), cupMaterial);
saucer.position.y = 0.07;
teaCup.add(saucer);
const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.68, 1.35, 24), cupMaterial); // Bredare upptill.
cupBody.position.y = 0.14 + 1.35 / 2;
teaCup.add(cupBody);
const tea = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshStandardMaterial({ color: PALETTE.matcha, roughness: 0.3, emissive: PALETTE.matcha, emissiveIntensity: 0.6 }));
tea.rotation.x = -Math.PI / 2;
tea.position.y = 0.14 + 1.35 - 0.08; // Strax under kanten.
teaCup.add(tea);
const cupHandle = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.1, 8, 20), cupMaterial);
cupHandle.position.set(0.98, 0.85, 0);
teaCup.add(cupHandle);

// --- Korsningen och hubPoint ---
// Mitt emellan första och sista skylten hemma, flyttat ner till huvudvägen.
const hubProjects = PROJECTS.filter((project) => project.world === WORLDS.hub);
const firstProject = hubProjects[0];
const lastProject = hubProjects[hubProjects.length - 1];
const junction = towardCamera(
  { x: (firstProject.x + lastProject.x) / 2, z: (firstProject.z + lastProject.z) / 2 },
  ROAD_DISTANCE
);
// Där uppfarten möter huvudvägen: rakt nedanför garaget.
export const homeRoadPoint = towardCamera({ x: HOME_X, z: HOME_Z }, ROAD_DISTANCE);

// En plats i hemvärlden räknad från skyltraden, så att den är lätt att tänka sig på skärmen:
//   right – enheter åt höger från skyltradens mitt (minus = vänster).
//   down  – enheter nedåt på skärmen från skyltraden (huvudvägen ligger på ROAD_DISTANCE).
export function hubPoint(right, down) {
  return towardCamera(toTheRight(junction, right), down - ROAD_DISTANCE);
}
// Gör om en plats inne i hem-gruppen (x = sidled, z = nedåt på skärmen) till världen.
export function homePoint(x, z) {
  const world = homeGroup.localToWorld(new THREE.Vector3(x, 0, z));
  return { x: world.x, z: world.z };
}

// --- Brevlådan: i hörnet mellan uppfarten och huvudvägen ---
const mailbox = new THREE.Group();
mailbox.position.set(3.9, 0, ROAD_DISTANCE - 3.9);
mailbox.scale.setScalar(1.4); // Lite överdrivet stor, så att den syns från kameran.
homeGroup.add(mailbox);
const mailPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), postMaterial);
mailPost.position.y = 0.6;
mailbox.add(mailPost);
const mailBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.1), paintMaterial); // Samma röda lack som bilen.
mailBox.position.y = 1.5;
mailbox.add(mailBox);
// Flaggan sitter i en egen grupp vid sitt fäste, så att den fälls runt den punkten.
export const mailFlag = new THREE.Group();
mailFlag.position.set(-0.4, 1.5, 0.2);
mailbox.add(mailFlag);
const flagMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.signText });
const flagArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.12), flagMaterial);
flagArm.position.y = 0.45;
mailFlag.add(flagArm);
const flagTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.45), flagMaterial);
flagTip.position.set(0, 0.72, -0.2);
mailFlag.add(flagTip);
const FLAG_DOWN = Math.PI / 2; // Vriden 90° = ligger ner längs lådan.
mailFlag.rotation.x = FLAG_DOWN;
const MAILBOX_RADIUS = 6; // Hur nära bilen måste vara för att flaggan ska fällas upp.
// Flaggan fälls, och porten och hålet bakom den göms och visas: de får inte slås ihop (se optimize.js).
markMoving(mailFlag, garageDoor, garageOpening);

// Fickans och brevlådans platser i världen.
worldGroup(WORLDS.hub).updateMatrixWorld(true);
const homePadWorld = homeGroup.localToWorld(new THREE.Vector3(0, 0, HOME_PAD_Z));
const mailboxWorld = mailbox.getWorldPosition(new THREE.Vector3());
// Rök ur skorstenen. Pufferna räknar själva ut var de är, från skorstenens topp i världen.
worldGroup(WORLDS.hub).add(makeSmoke(chimney.localToWorld(new THREE.Vector3(0, 0.8, 0))));
// Ånga ur tekoppen: samma puffar, men vita.
worldGroup(WORLDS.hub).add(makeSmoke(tea.localToWorld(new THREE.Vector3(0, 0, 0)), PALETTE.steam));
export const home = {
  padX: homePadWorld.x,
  padZ: homePadWorld.z,
  active: false,   // Står bilen i fickan utanför garaget just nu?
  mailNear: false, // Är bilen nära brevlådan just nu?
};

// Körs en gång per bild (bara hemma): brevlådans flagga och fickan utanför garaget.
export function updateHome(carPosition) {
  // Fönstret fladdrar svagt, som levande ljus där inne. Två sinusvågar i olika takt
  // gör att det aldrig ser ut att upprepa sig.
  const time = performance.now() / 1000;
  const flicker = 0.85 + 0.15 * Math.sin(time * 7.3) * Math.sin(time * 3.1 + 1);
  cabinWindow.material.color.set(PALETTE.windowGlow).multiplyScalar(flicker);
  const mailNear = Math.hypot(carPosition.x - mailboxWorld.x, carPosition.z - mailboxWorld.z) < MAILBOX_RADIUS;
  if (mailNear !== home.mailNear) {
    home.mailNear = mailNear;
    mailFlag.rotation.x = mailNear ? 0 : FLAG_DOWN;
    flagMaterial.color.set(mailNear ? PALETTE.signGlow : PALETTE.signText);
  }
  const padDistance = Math.hypot(carPosition.x - home.padX, carPosition.z - home.padZ);
  // Fickans kant lyser starkare ju närmare bilen är (som vid skyltarna).
  homePadMaterial.userData.near.value = 1 - THREE.MathUtils.smoothstep(padDistance, PAD_RADIUS, 18);
  const near = padDistance < PAD_RADIUS;
  if (near === home.active) return; // Inget har ändrats.
  home.active = near;
  nameGlow.material.color.copy(NAME_GLOW_COLOR).multiplyScalar(near ? 0.8 : 0.45);
  lightPad(homePadMaterial, near);
  if (near) setParkedAt(ABOUT);
  else leaveParking(ABOUT);
}
