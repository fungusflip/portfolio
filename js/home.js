// ============================================================================
// home.js — "About me": garaget, stugan, namnskylten och brevlådan, plus
// hubPoint som hemvärldens andra delar använder för att placera saker.
// ============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  PALETTE, WORLDS, BILLBOARD_FACING, CAMERA_PITCH, MAX_ANISOTROPY,
  towardCamera, toTheRight, worldGroup, postMaterial, paintMaterial, makeGlowMaterial,
} from './core.js';
import { PAD_DISTANCE, PAD_RADIUS, addParkingBay, lightPad } from './billboards.js';
import { PROJECTS } from './projects.js';
import { ROAD_DISTANCE } from './roads.js';
import { setParkedAt, leaveParking } from './ui.js';
import { ABOUT } from './projects.js';
import { markMoving } from './optimize.js';
import { makeSmoke, makeMatchaMaterial } from './magic.js';

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
// Detaljer som gör husen mindre lådiga. Platt skuggning (flatShading) som resten av världen.
const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#8d857a', roughness: 1, flatShading: true, emissive: '#8d857a', emissiveIntensity: 0.25 }); // Sockel och skorsten.
const trimMaterial = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 1, emissive: '#efe6d2', emissiveIntensity: 0.3 });             // Ljus list runt garageporten och dörren.
const shutterMaterial = new THREE.MeshStandardMaterial({ color: '#6b8f71', roughness: 1, flatShading: true });                                      // Salviagröna fönsterluckor.

// En låda i homeGroup: storlek (w, h, d), mittpunkt (x, y, z) och ev. rotation [x, y, z].
function addBox(material, w, h, d, x, y, z, rotation) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  homeGroup.add(mesh);
  return mesh;
}
// Avrundad låda (fasade hörn) i homeGroup.
function addSoftBox(material, w, h, d, radius, x, y, z) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, radius), material);
  mesh.position.set(x, y, z);
  homeGroup.add(mesh);
  return mesh;
}
// Sadeltak: ett prisma med nock längs x. span = takets bredd i z (inkl. takfot), rise = nockens höjd,
// apexShift = nockens avstånd från mitten i z (minus = bakåt, så att framsidan blir flackare),
// eave = takkantens tjocklek, length = längd i x. Underkanten ligger på y = 0.
function gablePrism(span, rise, apexShift, eave, length) {
  const h = span / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h, 0);
  shape.lineTo(-h, eave);
  shape.lineTo(apexShift, rise);
  shape.lineTo(h, eave);
  shape.lineTo(h, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(-Math.PI / 2); // Formens x blir z, och sträckan går längs x.
  return geometry;
}

// --- Garaget: porten vetter mot kameran, bilen står parkerad framför ---
const GARAGE_WIDTH = 5.6;
export const GARAGE_DEPTH = 3.6;
const GARAGE_HEIGHT = 2.6;
export const GARAGE_Z = 0; // Garagets mitt. Större z = längre ner på skärmen.
const garageWallMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageWall, roughness: 1, emissive: PALETTE.garageWall, emissiveIntensity: 0.4 });
const garageRoofMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageRoof, roughness: 1, flatShading: true });
// Ett öppet garageskal i stället för en massiv låda: golv, bakvägg, två sidoväggar och två hörnpelare vid porten.
// Taket ligger ALLTID kvar (porten öppen eller stängd), se takkonstruktionen längre ner.
const GARAGE_FRONT = GARAGE_Z + GARAGE_DEPTH / 2; // Främre väggens yta (z).
const GARAGE_WALL = 0.2;                           // Pelarnas och bjälkens tjocklek (väggarna: 0.12 ytterskal + 0.08 innerskal).
const garageInnerMaterial = new THREE.MeshStandardMaterial({ color: '#6c665e', roughness: 1, emissive: '#6c665e', emissiveIntensity: 0.45 }); // Mörkare insida.
const garageFloorMaterial = new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 1, emissive: '#77736c', emissiveIntensity: 0.35 }); // Betonggolv.
const garageWoodMaterial = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 1, emissive: '#8a6a45', emissiveIntensity: 0.3 });   // Hyllor och arbetsbänk.
const garageMetalMaterial = new THREE.MeshStandardMaterial({ color: '#4d5158', roughness: 1, emissive: '#4d5158', emissiveIntensity: 0.3 });  // Verktyg, plåt.
const garageRedMaterial = new THREE.MeshStandardMaterial({ color: '#b3342b', roughness: 1, emissive: '#b3342b', emissiveIntensity: 0.3 });    // Dunkar.
const garageRubberMaterial = new THREE.MeshStandardMaterial({ color: '#25262a', roughness: 1 });                                               // Däck.
// Golvet ligger i nivå med uppfarten (ingen tröskel) och sticker lite ut genom porten.
addBox(garageFloorMaterial, GARAGE_WIDTH - 0.2, 0.06, GARAGE_DEPTH + 0.1, 0, 0.0, GARAGE_Z + 0.05);
// Bakvägg och sidor: yttre skal i utsidans färg, inre skal i mörkare färg.
addBox(garageWallMaterial, GARAGE_WIDTH, GARAGE_HEIGHT, 0.12, 0, GARAGE_HEIGHT / 2, GARAGE_Z - GARAGE_DEPTH / 2 + 0.06);
addBox(garageInnerMaterial, GARAGE_WIDTH - 0.24, GARAGE_HEIGHT, 0.08, 0, GARAGE_HEIGHT / 2, GARAGE_Z - GARAGE_DEPTH / 2 + 0.16);
for (const side of [-1, 1]) {
  addBox(garageWallMaterial, 0.12, GARAGE_HEIGHT, GARAGE_DEPTH, side * (GARAGE_WIDTH / 2 - 0.06), GARAGE_HEIGHT / 2, GARAGE_Z);
  addBox(garageInnerMaterial, 0.08, GARAGE_HEIGHT, GARAGE_DEPTH - 0.2, side * (GARAGE_WIDTH / 2 - 0.16), GARAGE_HEIGHT / 2, GARAGE_Z + 0.05);
  // Pelaren vid porten (bredd 0.6 = fram till portlisten) i hela väggens höjd.
  addBox(garageWallMaterial, 0.6, GARAGE_HEIGHT, GARAGE_WALL, side * (GARAGE_WIDTH / 2 - 0.3), GARAGE_HEIGHT / 2, GARAGE_FRONT - GARAGE_WALL / 2);
}
// Bjälken över porten: bara en smal list överst (en stående vägg ovanför öppningen skulle skymma bilen, se taket).
// Väggstycket mellan listen och portens överkant (y 2.1-2.5) hör till själva porten (garageDoor, se längre ner):
// det syns bara när porten är stängd.
addBox(garageWallMaterial, GARAGE_WIDTH - 1.2, 0.12, GARAGE_WALL, 0, GARAGE_HEIGHT - 0.06, GARAGE_FRONT - GARAGE_WALL / 2);
// TAKET: flackt sadeltak med takfot (nocken lite bakåt, så att framsidan lutar mot kameran) och en nockbräda.
// Kameran tittar snett uppifrån (lutning ca 52.7 grader rakt framifrån i hemgruppens led): en punkt på höjd h
// syns bara om inget massivt ligger i z-intervallet (z_p, z_p + (H - h) / 1.313) ovanför den, H = takhöjd.
// Ett massivt tak över bilen skulle alltså alltid skymma den. Bilen är bara 1.2 bred, och kameran tittar
// precis längs z (ingen sidovinkel), så taket görs massivt på sidorna (|x| > BAY_HALF) och mitt över bilen
// är det ett glasband av tunna sparrar och mycket svagt glas som man ser rakt igenom.
const GARAGE_ROOF_RISE = 0.75;
const GARAGE_ROOF_SPAN = GARAGE_DEPTH + 0.9;   // Takets bredd i z (inkl. takfot).
const GARAGE_ROOF_APEX = -0.1;                 // Nockens z.
const GARAGE_ROOF_EAVE = 0.16;                 // Takkantens tjocklek.
const GARAGE_ROOF_LENGTH = GARAGE_WIDTH + 0.5; // Takets längd i x.
const BAY_HALF = 0.95;                         // Glasbandets halva bredd: bilen är 0.6 på varje sida av mitten.
const roofSideLength = GARAGE_ROOF_LENGTH / 2 - BAY_HALF;
for (const side of [-1, 1]) {
  const garageRoof = new THREE.Mesh(gablePrism(GARAGE_ROOF_SPAN, GARAGE_ROOF_RISE, GARAGE_ROOF_APEX, GARAGE_ROOF_EAVE, roofSideLength), garageRoofMaterial);
  garageRoof.position.set(side * (BAY_HALF + roofSideLength / 2), GARAGE_HEIGHT, GARAGE_Z);
  homeGroup.add(garageRoof);
}
addBox(postMaterial, GARAGE_WIDTH + 0.6, 0.1, 0.16, 0, GARAGE_HEIGHT + GARAGE_ROOF_RISE + 0.02, GARAGE_Z + GARAGE_ROOF_APEX); // Nockbrädan går över glasbandet också.
// Glasbandet: två plana glasrutor längs takets båda sluttningar (nock -> takfot) med trälist längs sidorna och
// några tvärsparrar. Glaset är nästan osynligt (opacity 0.14, skriver inget djup), så bilen syns genom det.
const glassMaterial = new THREE.MeshBasicMaterial({ color: '#cfe8f0', transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
for (const slope of [1, -1]) { // 1 = framsidan (mot kameran), -1 = baksidan.
  const runZ = slope === 1 ? GARAGE_ROOF_SPAN / 2 - GARAGE_ROOF_APEX : GARAGE_ROOF_SPAN / 2 + GARAGE_ROOF_APEX; // Sluttningens längd i z.
  const drop = GARAGE_ROOF_RISE - GARAGE_ROOF_EAVE;                                                              // Och hur mycket den sjunker.
  const tilt = Math.atan2(drop, runZ);
  const length = Math.hypot(runZ, drop);
  const centerZ = GARAGE_Z + GARAGE_ROOF_APEX + slope * runZ / 2;
  const centerY = GARAGE_HEIGHT + (GARAGE_ROOF_RISE + GARAGE_ROOF_EAVE) / 2 + 0.02; // 0.02 ovanpå, så att listerna inte flimrar.
  const glass = new THREE.Mesh(new THREE.BoxGeometry(BAY_HALF * 2, 0.02, length), glassMaterial);
  glass.userData.noShadow = true;
  glass.renderOrder = 2;
  const pitch = new THREE.Group();                            // Lutad runt sin mitt: sluttningen sjunker utåt (+z fram, -z bak).
  pitch.position.set(0, centerY, centerZ);
  pitch.rotation.x = slope * tilt;
  pitch.add(glass);
  homeGroup.add(pitch);
  // Listerna (längs sluttningen, i glasbandets kanter) och tvärsparrar på två ställen per sida.
  for (const edge of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, length), postMaterial);
    beam.position.set(edge * BAY_HALF, 0.0, 0.0);
    pitch.add(beam);
  }
  for (const along of [-0.3, 0.32]) {
    const rafter = new THREE.Mesh(new THREE.BoxGeometry(BAY_HALF * 2, 0.07, 0.07), postMaterial);
    rafter.position.set(0, 0.0, along * length);
    pitch.add(rafter);
  }
}
// Sockel av sten på sidorna och vid porthörnen. Inte framför porten: bilen kör rakt igenom där.
for (const side of [-1, 1]) {
  addBox(stoneMaterial, 0.14, 0.3, GARAGE_DEPTH + 0.14, side * (GARAGE_WIDTH / 2 + 0.02), 0.15, GARAGE_Z);
  addBox(stoneMaterial, 0.66, 0.3, 0.14, side * 2.5, 0.15, GARAGE_Z + GARAGE_DEPTH / 2 + 0.02);
}

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
// Väggstycket ovanför porten (y 2.1-2.48) och listen över den följer med porten: stängd port = tät fasad, öppen port =
// fri insyn, så att bilen syns. (En stående vägg där skulle skymma bilen, se taket ovan.)
const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_WIDTH - 1.2, 0.38, GARAGE_WALL), garageWallMaterial);
doorHeader.position.set(0, 2.29 - garageDoor.position.y, GARAGE_FRONT - GARAGE_WALL / 2 - garageDoor.position.z);
garageDoor.add(doorHeader);
const doorTrimTop = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_DOOR_WIDTH + 0.4, 0.16, 0.1), trimMaterial);
doorTrimTop.position.set(0, GARAGE_DOOR_HEIGHT + 0.1 - garageDoor.position.y, 0.02);
garageDoor.add(doorTrimTop);
// Förr en grå platta bakom porten; nu är det ett riktigt garage bakom (se skalet ovan). Namnet finns kvar
// för andra filer, men gruppen är tom.
export const garageOpening = new THREE.Group();
homeGroup.add(garageOpening);
// Ljus list runt porten: två stolpar. Överliggaren och väggstycket ovanför porten sitter på själva porten (nedan).
for (const side of [-1, 1]) addBox(trimMaterial, 0.2, GARAGE_DOOR_HEIGHT + 0.06, 0.1, side * (GARAGE_DOOR_WIDTH / 2 + 0.1), (GARAGE_DOOR_HEIGHT + 0.06) / 2, GARAGE_Z + GARAGE_DEPTH / 2 + 0.03);

// Lampan över porten: en lysande låda plus fejkat ljus (se addFakeLight).
const garageLampBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.25), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
garageLampBox.position.set(0, GARAGE_DOOR_HEIGHT + 0.22, GARAGE_Z + GARAGE_DEPTH / 2 + 0.12);
homeGroup.add(garageLampBox);

// --- Insidan: lampa, hylla, verktygstavla, arbetsbänk, däck och en upprullad port. Allt står längs väggarna ---
// så att bilen (1.2 bred, 2.4 lång, mitt i garaget) har fri väg rakt ut genom porten.
const GARAGE_BACK = GARAGE_Z - GARAGE_DEPTH / 2 + 0.2; // Bakväggens insida (z).
// Lampan: en glödlampa på en arm från bakväggen, ett sken och en ljuspöl på golvet.
addBox(garageMetalMaterial, 0.06, 0.06, 0.4, 0, 2.2, GARAGE_BACK + 0.2);
const garageBulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
garageBulb.position.set(0, 2.12, GARAGE_BACK + 0.4);
homeGroup.add(garageBulb);
const garageGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), makeGlowMaterial(0.8));
garageGlow.material.color.set(PALETTE.warmLamp).multiplyScalar(0.8);
garageGlow.position.set(0, 1.9, GARAGE_BACK + 0.6);
garageGlow.rotation.x = -CAMERA_PITCH;
garageGlow.userData.noShadow = true;
homeGroup.add(garageGlow);
// Hylla på bakväggen (vänster): tre plank med lådor och dunkar. Djup 0.3; bilens nos slutar ca 0.4 från väggen.
const SHELF_X = -1.5;
for (const y of [0.55, 1.1, 1.65]) addBox(garageWoodMaterial, 1.5, 0.05, 0.3, SHELF_X, y, GARAGE_BACK + 0.15);
for (const side of [-1, 1]) addBox(garageWoodMaterial, 0.05, 1.7, 0.3, SHELF_X + side * 0.72, 0.85, GARAGE_BACK + 0.15);
addBox(garageWoodMaterial, 0.28, 0.26, 0.24, SHELF_X - 0.45, 0.7, GARAGE_BACK + 0.15);  // Lådor.
addBox(garageWoodMaterial, 0.34, 0.2, 0.24, SHELF_X + 0.1, 0.68, GARAGE_BACK + 0.15);
addBox(garageMetalMaterial, 0.3, 0.3, 0.22, SHELF_X + 0.5, 1.28, GARAGE_BACK + 0.15);
addBox(garageWoodMaterial, 0.4, 0.3, 0.24, SHELF_X - 0.4, 1.28, GARAGE_BACK + 0.15);
addBox(garageRedMaterial, 0.26, 0.34, 0.16, SHELF_X - 0.1, 1.84, GARAGE_BACK + 0.15);   // Dunkar.
addBox(garageRedMaterial, 0.26, 0.34, 0.16, SHELF_X + 0.25, 1.84, GARAGE_BACK + 0.15);
addBox(garageRedMaterial, 0.26, 0.34, 0.16, SHELF_X + 0.55, 0.74, GARAGE_BACK + 0.15);
// Verktygstavla på bakväggen (höger): en träplatta med hammare, skruvnyckel och såg.
const BOARD_X = 1.5;
addBox(garageWoodMaterial, 1.3, 0.9, 0.04, BOARD_X, 1.35, GARAGE_BACK + 0.02);
addBox(garageMetalMaterial, 0.07, 0.45, 0.04, BOARD_X - 0.4, 1.4, GARAGE_BACK + 0.06);              // Hammarens skaft…
addBox(garageMetalMaterial, 0.26, 0.1, 0.05, BOARD_X - 0.4, 1.65, GARAGE_BACK + 0.06);              // …och huvud.
addBox(garageMetalMaterial, 0.06, 0.55, 0.04, BOARD_X - 0.1, 1.35, GARAGE_BACK + 0.06, [0, 0, 0.3]); // Skruvnyckel.
addBox(garageRedMaterial, 0.4, 0.14, 0.04, BOARD_X + 0.3, 1.45, GARAGE_BACK + 0.06, [0, 0, -0.15]);  // Såg (rött handtag)…
addBox(garageMetalMaterial, 0.45, 0.08, 0.03, BOARD_X + 0.35, 1.22, GARAGE_BACK + 0.06);            // …och blad.
// Arbetsbänk vid högra väggen: skiva på fyra ben, med ett skruvstycke och en verktygslåda.
const BENCH_X = 1.9;
addBox(garageWoodMaterial, 0.6, 0.07, 1.4, BENCH_X, 0.85, -0.45);
for (const dx of [-0.25, 0.25]) for (const dz of [-1.1, 0.2]) addBox(garageWoodMaterial, 0.06, 0.82, 0.06, BENCH_X + dx, 0.41, dz);
addBox(garageMetalMaterial, 0.16, 0.14, 0.2, BENCH_X, 0.95, -1.0);
addBox(garageRedMaterial, 0.3, 0.16, 0.5, BENCH_X + 0.02, 0.96, -0.3);
// Däck: en stapel i vänstra främre hörnet och ett lutat mot sidoväggen.
const tyreGeometry = new THREE.TorusGeometry(0.24, 0.11, 8, 14);
tyreGeometry.rotateX(Math.PI / 2);
for (let i = 0; i < 3; i++) {
  const tyre = new THREE.Mesh(tyreGeometry, garageRubberMaterial);
  tyre.position.set(-1.9, 0.11 + i * 0.22, 0.9);
  homeGroup.add(tyre);
}
const leaningTyre = new THREE.Mesh(tyreGeometry, garageRubberMaterial);
leaningTyre.position.set(-1.9, 0.33, 0.2);
leaningTyre.rotation.z = 0.3;
homeGroup.add(leaningTyre);
// Den upprullade garageporten: en rulle högt upp på bakväggen, på två fästen.
const doorRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 12), garageMetalMaterial);
doorRoll.rotation.z = Math.PI / 2;
doorRoll.position.set(0, 2.38, GARAGE_BACK + 0.2);
homeGroup.add(doorRoll);
for (const side of [-1, 1]) addBox(garageMetalMaterial, 0.06, 0.3, 0.1, side * 1.85, 2.26, GARAGE_BACK + 0.08);

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
const CABIN_FRONT = CABIN_Z + CABIN_SIZE / 2; // Främre väggens yta (z).
// Väggar med fasade hörn, stensockel och en träbalk runt toppen.
addSoftBox(wallMaterial, CABIN_SIZE, CABIN_HEIGHT, CABIN_SIZE, 0.14, CABIN_X, CABIN_HEIGHT / 2, CABIN_Z);
addSoftBox(stoneMaterial, CABIN_SIZE + 0.16, 0.45, CABIN_SIZE + 0.16, 0.06, CABIN_X, 0.225, CABIN_Z);
addSoftBox(postMaterial, CABIN_SIZE + 0.14, 0.2, CABIN_SIZE + 0.14, 0.05, CABIN_X, CABIN_HEIGHT - 0.1, CABIN_Z);
// Knutbrädor i hörnen (timmerkänsla).
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) addBox(postMaterial, 0.26, CABIN_HEIGHT - 0.45, 0.26, CABIN_X + sx * (CABIN_SIZE / 2 - 0.04), 0.45 + (CABIN_HEIGHT - 0.45) / 2, CABIN_Z + sz * (CABIN_SIZE / 2 - 0.04));
}
// Sadeltak i stället för pyramid: nocken längs x, lite bakåt, med takfot (0.45 fram/bak, 0.35 på gavlarna) och nockbräda.
const CABIN_ROOF_RISE = 1.9;
const CABIN_ROOF_SHIFT = -0.25;
const cabinRoof = new THREE.Mesh(gablePrism(CABIN_SIZE + 0.9, CABIN_ROOF_RISE, CABIN_ROOF_SHIFT, 0.16, CABIN_SIZE + 0.7), roofMaterial);
cabinRoof.position.set(CABIN_X, CABIN_HEIGHT, CABIN_Z);
homeGroup.add(cabinRoof);
addBox(postMaterial, CABIN_SIZE + 0.9, 0.18, 0.22, CABIN_X, CABIN_HEIGHT + CABIN_ROOF_RISE + 0.03, CABIN_Z + CABIN_ROOF_SHIFT);
// Skorsten av sten med en platta överst. Stiger över nocken. Röken startar ovanför plattan (se längst ner).
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 0.6), stoneMaterial);
chimney.position.set(CABIN_X - 1.2, CABIN_HEIGHT + 1.4, CABIN_Z - 0.8);
homeGroup.add(chimney);
addBox(postMaterial, 0.84, 0.14, 0.84, CABIN_X - 1.2, CABIN_HEIGHT + 2.67, CABIN_Z - 0.8);
// Dörr med ljus list, en liten veranda (platta + trappsteg) och ett skärmtak på två stolpar.
const DOOR_X_LOCAL = CABIN_X + 1.1;
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.1), postMaterial);
door.position.set(DOOR_X_LOCAL, 0.95, CABIN_FRONT);
homeGroup.add(door);
addBox(trimMaterial, 1.3, 0.14, 0.14, DOOR_X_LOCAL, 2.0, CABIN_FRONT);          // Överliggare.
for (const side of [-1, 1]) addBox(trimMaterial, 0.14, 1.95, 0.14, DOOR_X_LOCAL + side * 0.57, 0.975, CABIN_FRONT);
addBox(postMaterial, 1.8, 0.16, 1.0, DOOR_X_LOCAL, 0.08, CABIN_FRONT + 0.5);       // Verandans platta.
addBox(postMaterial, 1.4, 0.08, 0.35, DOOR_X_LOCAL, 0.04, CABIN_FRONT + 1.17);     // Trappsteget.
addBox(roofMaterial, 2.2, 0.1, 1.35, DOOR_X_LOCAL, 2.55, CABIN_FRONT + 0.6, [0.25, 0, 0]); // Skärmtaket lutar utåt.
for (const side of [-1, 1]) addBox(postMaterial, 0.12, 2.35, 0.12, DOOR_X_LOCAL + side * 0.95, 1.18, CABIN_FRONT + 1.2);
// Fönstret lyser varmt: någon är hemma.
const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
cabinWindow.position.set(CABIN_X - 1, 1.6, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(cabinWindow);
// Fönsterkarm med spröjs, en bräda under (fönsterbänk) och gröna luckor på sidorna.
const WINDOW_X = CABIN_X - 1;
addBox(postMaterial, 1.7, 0.12, 0.16, WINDOW_X, 2.2, CABIN_FRONT);
addBox(postMaterial, 1.8, 0.1, 0.5, WINDOW_X, 1.0, CABIN_FRONT + 0.18);
for (const side of [-1, 1]) {
  addBox(postMaterial, 0.12, 1.2, 0.16, WINDOW_X + side * 0.76, 1.6, CABIN_FRONT);
  addBox(shutterMaterial, 0.5, 1.2, 0.08, WINDOW_X + side * 1.15, 1.6, CABIN_FRONT + 0.02);
}
addBox(postMaterial, 0.06, 1.1, 0.14, WINDOW_X, 1.6, CABIN_FRONT);
addBox(postMaterial, 1.4, 0.06, 0.14, WINDOW_X, 1.6, CABIN_FRONT);
// Vedbod vid husets högra sida: pulttak på två stolpar och en trave vedträn (ändarna syns från kameran).
const SHED_X = CABIN_X + CABIN_SIZE / 2; // Husväggen.
addBox(roofMaterial, 1.35, 0.1, 2.1, SHED_X + 0.55, 2.0, CABIN_Z - 1.1, [0, 0, -0.35]);
for (const z of [-1.95, -0.25]) addBox(postMaterial, 0.1, 1.75, 0.1, SHED_X + 1.0, 0.875, CABIN_Z + z);
const logGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1.7, 7).rotateX(Math.PI / 2);
for (const [x, y] of [[0.28, 0.12], [0.53, 0.12], [0.78, 0.12], [0.4, 0.34], [0.65, 0.34], [0.53, 0.56]]) {
  const log = new THREE.Mesh(logGeometry, postMaterial);
  log.position.set(SHED_X + x, y, CABIN_Z - 1.1);
  homeGroup.add(log);
}
addFakeLight(CABIN_X - 1.3, CABIN_Z + CABIN_SIZE / 2 + 1.2, 3, 2.2, 0.55); // Ljuset ut genom fönstret (kort, så att det inte lägger sig på gångvägen).
// En liten lykta vid stugdörren: stolpe, lysande glas och en liten ljuspöl. Den enda lampan vid stugan.
const lanternPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), postMaterial);
lanternPost.position.set(CABIN_X + 2.6, 0.55, CABIN_Z + CABIN_SIZE / 2 + 0.5);
homeGroup.add(lanternPost);
const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
lanternGlass.position.set(CABIN_X + 2.6, 1.28, CABIN_Z + CABIN_SIZE / 2 + 0.5);
homeGroup.add(lanternGlass);
addFakeLight(CABIN_X + 2.6, CABIN_Z + CABIN_SIZE / 2 + 0.5, 2.4, 2.4, 0.5);

// Parkeringsfickan utanför garaget. Här startar bilen.
const HOME_PAD_Z = PAD_DISTANCE;
const homePadMaterial = addParkingBay(homeGroup, HOME_PAD_Z);

// --- Namnskylten på stugans framsida (takets framsluttning) ---
// Väggen ovanför dörren/fönstret går inte att använda: skärmtaket och takfoten skymmer allt utom en smal remsa.
// Takets framsluttning (28.5 graders lutning) vetter däremot nästan rakt mot kameran (ca 9 graders vinkel).
const NAME_WIDTH = 4.2;
const NAME_HEIGHT = 1.54;
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
// Brädan ligger platt på takets framsluttning. Sluttningen går från takfoten (z = CABIN_SIZE/2 + 0.45, y = taklinjen + eave)
// upp till nocken (z = CABIN_ROOF_SHIFT, y = + CABIN_ROOF_RISE). Samma mått som gablePrism(CABIN_SIZE + 0.9, ...) ovan.
const ROOF_EAVE_Z = (CABIN_SIZE + 0.9) / 2;
const ROOF_EAVE_Y = CABIN_HEIGHT + 0.16;
const roofRunZ = ROOF_EAVE_Z - CABIN_ROOF_SHIFT;           // Sluttningens längd i z …
const roofRunY = CABIN_ROOF_RISE - 0.16;                   // … och i y.
const roofSlope = Math.atan2(roofRunY, roofRunZ);          // Lutning (ca 28.5 grader).
const roofUp = { z: -roofRunZ / Math.hypot(roofRunZ, roofRunY), y: roofRunY / Math.hypot(roofRunZ, roofRunY) }; // Uppför sluttningen.
const SIGN_ALONG = 1.85;                                   // Skyltens mitt: så långt från takfoten uppför sluttningen.
const nameBoard = new THREE.Group();
nameBoard.position.set(CABIN_X, ROOF_EAVE_Y + roofUp.y * SIGN_ALONG, ROOF_EAVE_Z + roofUp.z * SIGN_ALONG);
nameBoard.rotation.x = -(Math.PI / 2 - roofSlope); // Skyltens normal = takets normal; lokal y pekar uppför sluttningen.
homeGroup.add(nameBoard);
const nameFrame = new THREE.Mesh(new THREE.BoxGeometry(NAME_WIDTH + 0.3, NAME_HEIGHT + 0.3, 0.14), postMaterial);
nameFrame.position.set(0, 0, 0.07);
nameBoard.add(nameFrame);
const nameFace = new THREE.Mesh(new THREE.PlaneGeometry(NAME_WIDTH, NAME_HEIGHT), new THREE.MeshBasicMaterial({ map: nameTexture }));
nameFace.position.set(0, 0, 0.15);
nameBoard.add(nameFace);
// Ett varmt, stilla sken runt namnskylten, som en upplyst butiksskylt. Starkare när bilen
// står i fickan (se updateHome). Ligger precis ovanpå taket och bakom ramen, så att bara skenet runt kanten syns.
const nameGlow = new THREE.Mesh(new THREE.PlaneGeometry(NAME_WIDTH + 2.4, NAME_HEIGHT + 2.0), makeGlowMaterial(0.9));
nameGlow.position.set(0, 0, 0.04);
nameGlow.userData.noShadow = true;
const NAME_GLOW_COLOR = new THREE.Color(PALETTE.bulbs);
nameGlow.material.color.copy(NAME_GLOW_COLOR).multiplyScalar(0.45);
nameBoard.add(nameGlow);
markMoving(nameGlow); // Byter styrka: får inte slås ihop.
// En liten lampa ovanför skylten: en arm från taket, en skärm och en glödande lampa som lyser nedåt, plus ett sken.
const signLampUp = NAME_HEIGHT / 2 + 0.55;
const signLampArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), garageMetalMaterial);
signLampArm.position.set(0, signLampUp, 0.25);
nameBoard.add(signLampArm);
const signLampShade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.26), garageMetalMaterial);
signLampShade.position.set(0, signLampUp, 0.55);
nameBoard.add(signLampShade);
const signLampBulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.16), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
signLampBulb.position.set(0, signLampUp - 0.06, 0.55);
nameBoard.add(signLampBulb);
const signLampGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), makeGlowMaterial(0.7));
signLampGlow.material.color.set(PALETTE.warmLamp).multiplyScalar(0.55);
signLampGlow.position.set(0, signLampUp - 0.3, 0.6);
signLampGlow.userData.noShadow = true;
nameBoard.add(signLampGlow);

// --- Tekoppar runt huset ---
// En stor kopp matcha uppe till vänster om garaget, och små koppar utspridda runt huset:
// några fulla och varma (ångar), några halvdruckna, några kalla och några tomma.
// Koppen är ett rör utan lock (openEnded), så att man ser ner i den: teet är en grön
// skiva på rätt höjd inuti, och botten en gräddvit skiva.
// emissive = lyser lite av sig själv (som stugans väggar), så att kopparna syns även i skugga.
const cupMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.sign, roughness: 0.5, emissive: PALETTE.sign, emissiveIntensity: 0.4, side: THREE.DoubleSide });
// Teets yta: en egen shader med skum, virvel och glans (se makeMatchaMaterial i magic.js).
const hotTeaMaterial = makeMatchaMaterial(true);
const coldTeaMaterial = makeMatchaMaterial(false);
const CUP_HEIGHT = 1.35;
const CUP_TOP = 0.9;     // Radie upptill.
const CUP_BOTTOM = 0.68; // Radie nertill.
const saucerGeometry = new THREE.CylinderGeometry(1.35, 1.25, 0.14, 24);
const cupBodyGeometry = new THREE.CylinderGeometry(CUP_TOP, CUP_BOTTOM, CUP_HEIGHT, 24, 1, true);
const cupBottomGeometry = new THREE.CircleGeometry(CUP_BOTTOM, 24).rotateX(-Math.PI / 2);
const cupHandleGeometry = new THREE.TorusGeometry(0.36, 0.1, 8, 20);
// Kopparna på marken: [x, z (i hem-gruppen), storlek, hur full (0 = tom, 1 = full), värme]. ÄNDRA HÄR.
// Värme: 'hot' = ångar, 'warm' = färskt grönt men ingen ånga, 'cold' = mörkare grönt, ingen ånga.
// De ligger tätt intill husen (garagets vägg är x = -2.8, stugans x = 3.1 .. 8.1).
const TEA_CUPS = [
  [-4.9, -1.5, 1.3, 0.5, 'warm'],  // Den stora, bredvid garagets vänstra vägg: halvdrucken, ljummen.
  [-3.7, 1.7, 0.5, 0.5, 'hot'],    // Halvdrucken, fortfarande varm. Tätt intill garagets hörn.
  [-3.5, 3.4, 0.45, 0, 'cold'],    // Tom.
  [3.5, 3.4, 0.45, 0.2, 'cold'],   // Nästan slut, kall. Mellan garaget och stugan.
  [9.1, 1.2, 0.55, 0.9, 'hot'],    // Full och varm, intill stugans högra vägg.
  [10.5, -1.6, 0.45, 0, 'cold'],   // Tom. Flyttad utåt för vedboden.
  [1.4, -3.3, 0.5, 0.85, 'cold'],  // Bakom garaget: full men kall (bortglömd).
];
// Kopparna uppe på huset: [x, y (höjden på underlaget), z, storlek, fylld, värme, förälder]. Dekoration: de är
// inte hinder och står inte i teaCups/teaCupSpots (föräldern är homeGroup om inget annat anges).
const WINDOW_SILL_Y = 1.05;
const TEA_CUPS_UP = [
  [-2.74, 1.03, GARAGE_FRONT + 0.25, 0.2, 0.7, 'hot'],           // Garagets fönsterbräda (vid porten, vänster).
  [WINDOW_X - 0.45, WINDOW_SILL_Y, CABIN_FRONT + 0.18, 0.22, 0.8, 'hot'],  // Stugans fönsterbräda.
  [WINDOW_X + 0.45, WINDOW_SILL_Y, CABIN_FRONT + 0.18, 0.2, 0.4, 'cold'],
  [DOOR_X_LOCAL - 0.95, 0.99, CABIN_FRONT + 0.65, 0.2, 0.6, 'hot'],       // Verandans räcke.
  [DOOR_X_LOCAL + 0.4, 0.08, CABIN_FRONT + 1.18, 0.18, 0.3, 'cold'],      // Trappsteget.
];
export const teaCups = []; // [{ cup, x, z, radius }]: kopparna gungar till när bilen kör över dem (hub.js).
const steamSpots = []; // Var ångan ska komma ut ur de varma kopparna, och hur stor den är.
// Bygger en kopp i parent (x, y, z = mitten av tefatets undersida) och lägger till ånga om den är varm.
function addTeaCup(parent, x, y, z, size, fill, heat) {
  const cup = new THREE.Group();
  cup.position.set(x, y, z);
  cup.rotation.y = Math.random() * Math.PI * 2; // Handtaget åt olika håll.
  cup.scale.setScalar(size);
  parent.add(cup);
  const saucer = new THREE.Mesh(saucerGeometry, cupMaterial);
  saucer.position.y = 0.07;
  cup.add(saucer);
  const body = new THREE.Mesh(cupBodyGeometry, cupMaterial);
  body.position.y = 0.14 + CUP_HEIGHT / 2;
  cup.add(body);
  const bottom = new THREE.Mesh(cupBottomGeometry, cupMaterial);
  bottom.position.y = 0.16;
  cup.add(bottom);
  const handle = new THREE.Mesh(cupHandleGeometry, cupMaterial);
  handle.position.set(0.98, 0.85, 0);
  cup.add(handle);
  if (fill > 0) {
    // Teets yta: på höjden fill, och lika bred som koppen är just där.
    const radius = THREE.MathUtils.lerp(CUP_BOTTOM, CUP_TOP, fill) - 0.03;
    const tea = new THREE.Mesh(new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2), heat === 'cold' ? coldTeaMaterial : hotTeaMaterial);
    tea.position.y = 0.16 + fill * (CUP_HEIGHT - 0.1);
    cup.add(tea);
  }
  // Ångan börjar strax ovanför teets yta, utspridd över hela ytan.
  if (heat === 'hot') steamSpots.push({ cup, height: 0.16 + fill * CUP_HEIGHT + 0.15, size });
  return cup;
}
for (const [x, z, size, fill, heat] of TEA_CUPS) {
  const cup = addTeaCup(homeGroup, x, 0, z, size, fill, heat);
  markMoving(cup); // Gungar till vid körning över: får inte slås ihop.
  teaCups.push({ cup, x, z, radius: 1.3 * size });
}
for (const [x, y, z, size, fill, heat] of TEA_CUPS_UP) addTeaCup(homeGroup, x, y, z, size, fill, heat);
// Ett litet runt bord till vänster om verandan, under fönstret, med två koppar. Bordet är en mjuk prydnad
// (gungar till, kopparna följer med) och står därför i teaCups, men inte i teaCupSpots.
const TABLE_X = DOOR_X_LOCAL - 1.7;
const TABLE_Z = CABIN_FRONT + 0.95;
const teaTable = new THREE.Group();
teaTable.position.set(TABLE_X, 0, TABLE_Z);
homeGroup.add(teaTable);
markMoving(teaTable);
const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 14), postMaterial);
tableTop.position.y = 0.66;
teaTable.add(tableTop);
const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.62, 8), postMaterial);
tableLeg.position.y = 0.31;
teaTable.add(tableLeg);
const tableFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 10), postMaterial);
tableFoot.position.y = 0.025;
teaTable.add(tableFoot);
addTeaCup(teaTable, -0.28, 0.695, 0.02, 0.24, 0.75, 'hot');
addTeaCup(teaTable, 0.3, 0.695, -0.08, 0.2, 0.2, 'cold');
teaCups.push({ cup: teaTable, x: TABLE_X, z: TABLE_Z, radius: 0.6 });

// Garagets lilla fönster på pelaren vänster om porten: karm, lysande ruta, fönsterbräda (koppen står på den).
const garageWindowX = -2.6;
const garageWindow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.05), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
garageWindow.position.set(garageWindowX, 1.6, GARAGE_FRONT + 0.02);
homeGroup.add(garageWindow);
for (const dy of [-0.43, 0.43]) addBox(postMaterial, 0.36, 0.06, 0.1, garageWindowX, 1.6 + dy, GARAGE_FRONT + 0.04);
for (const dx of [-0.15, 0.15]) addBox(postMaterial, 0.05, 0.92, 0.1, garageWindowX + dx, 1.6, GARAGE_FRONT + 0.04);
addBox(postMaterial, 0.08, 0.7, 0.04, garageWindowX, 1.6, GARAGE_FRONT + 0.06); // Spröjs.
addBox(postMaterial, 0.7, 0.06, 0.5, -2.72, 1.0, GARAGE_FRONT + 0.25);            // Fönsterbrädan (x -3.07 .. -2.37, y 1.0).
// Porträcket på verandans vänstra sida: ledstång, undre list och tre spjälor (koppen står på ledstången).
addBox(postMaterial, 0.1, 0.07, 1.15, DOOR_X_LOCAL - 0.95, 0.95, CABIN_FRONT + 0.62);
addBox(postMaterial, 0.08, 0.05, 1.15, DOOR_X_LOCAL - 0.95, 0.2, CABIN_FRONT + 0.62);
for (const dz of [0.25, 0.6, 0.95]) addBox(postMaterial, 0.04, 0.78, 0.04, DOOR_X_LOCAL - 0.95, 0.57, CABIN_FRONT + dz);

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
export const mailbox = new THREE.Group(); // Exporteras så att hub.js kan låta den välta (knockables.js).
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
markMoving(mailFlag, mailbox, garageDoor, garageOpening); // mailbox välter när bilen kör över den; porten (med överstycket) göms/visas.

// Fickans och brevlådans platser i världen.
worldGroup(WORLDS.hub).updateMatrixWorld(true);
// Tekopparnas platser i världen (gräset växer inte under dem, se hub.js).
export const teaCupSpots = TEA_CUPS.map(([x, z]) => homeGroup.localToWorld(new THREE.Vector3(x, 0, z)));
const homePadWorld = homeGroup.localToWorld(new THREE.Vector3(0, 0, HOME_PAD_Z));
const mailboxWorld = mailbox.getWorldPosition(new THREE.Vector3());
// Rök ur skorstenen. Pufferna räknar själva ut var de är, från skorstenens topp i världen.
worldGroup(WORLDS.hub).add(makeSmoke(chimney.localToWorld(new THREE.Vector3(0, 1.45, 0)), { color: PALETTE.smoke }));
// Ånga ur de varma kopparna. Inte som skorstensröken: små, tunna slingor utspridda över
// teytan, som lever kort (speed 0.5), stiger lite (rise 2.2) och bleknar nästan direkt (fade 2.5).
for (const { cup, height, size } of steamSpots) {
  worldGroup(WORLDS.hub).add(makeSmoke(cup.localToWorld(new THREE.Vector3(0, height, 0)), {
    color: PALETTE.steam, scale: size * 0.8, spread: CUP_TOP * size * 0.8, opacity: 0.3, speed: 0.5, rise: 2.2, fade: 2.5,
  }));
}
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
