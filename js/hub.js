// ============================================================================
// hub.js — bygger hemvärlden: marken, skyltarna, vägarna, grottorna, vägskyltarna,
// gatlyktorna och träden. (Garaget och stugan byggs i home.js.)
// ============================================================================
import * as THREE from 'three';
import {
  PALETTE, WORLDS, GROUND_SIZE, TILE_PIXELS, TILE_UNITS, DRIVE_RADIUS, HUB_X, HUB_Z,
  towardCamera, worldGroup, makeEdgeFade, makeTileTexture,
} from './core.js';
import { PROJECTS, buildBillboards } from './billboards.js';
import { ROAD_WIDTH, ROAD_DISTANCE, buildRoads, billboardDriveways, distanceToRoad } from './roads.js';
import {
  HOME_X, HOME_Z, GARAGE_Z, GARAGE_DEPTH, CABIN_X, CABIN_Z, CABIN_SIZE,
  homeGroup, homeRoadPoint, hubPoint, homePoint,
} from './home.js';
import { PORTALS, techartCave, progCave, artCave, buildPortal } from './portals.js';
import { buildSignposts } from './signposts.js';
import { buildLamps, rowLamps, LAMP_SIDE, ARM_UP, ARM_LEFT } from './lamps.js';
import { makeTrees, randomTree, leafColors } from './trees.js';

const hub = WORLDS.hub;

// Den nedre vägen till Programming- och Art-grottan gör en U-sväng: den svänger av från
// huvudvägen en bit till höger, går ner förbi bergen och sedan åt vänster under dem.
// Talen är "right, down" som i hubPoint (se home.js).
const PROG_TURN_RIGHT = 12; // Var vägen svänger av från huvudvägen.
const PROG_LOOP_DOWN = 38;  // Hur långt ner den nedre vägen går (grottöppningarna sitter på 28).

// Delas upp i steg, så att laddningsmätaren kan röra sig mellan dem (se main.js).
export function buildHubGround() {
  // --- Marken: gyllengul med röda och orange löv, ritad i en osynlig canvas ---
  const tile = document.createElement('canvas');
  tile.width = TILE_PIXELS;
  tile.height = TILE_PIXELS;
  const pen = tile.getContext('2d');
  pen.fillStyle = PALETTE.ground;
  pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  // 160 små löv på slumpade platser. Det är "bruset" som gör att man ser att bilen rör sig.
  for (let i = 0; i < 160; i++) {
    const size = 7 + Math.random() * 9; // Lövets halva längd i pixlar.
    // Håll lövet helt innanför bilden, annars klipps det av i skarven mellan kopiorna.
    const x = size + Math.random() * (TILE_PIXELS - size * 2);
    const y = size + Math.random() * (TILE_PIXELS - size * 2);
    pen.fillStyle = PALETTE.fallenLeaves[i % PALETTE.fallenLeaves.length];
    pen.save();                              // Spara pennans läge ...
    pen.translate(x, y);                     // ... flytta "nollpunkten" till lövets mitt ...
    pen.rotate(Math.random() * Math.PI * 2); // ... och vrid allt som ritas efter det.
    pen.beginPath();                         // En spetsig oval: två bågar från spets till spets.
    pen.moveTo(0, -size);
    pen.quadraticCurveTo(size * 0.75, 0, 0, size);
    pen.quadraticCurveTo(-size * 0.75, 0, 0, -size);
    pen.fill();
    pen.strokeStyle = 'rgba(80, 20, 10, 0.35)'; // Mittnerven.
    pen.lineWidth = 1.5;
    pen.beginPath();
    pen.moveTo(0, -size * 0.8);
    pen.lineTo(0, size * 1.2);
    pen.stroke();
    pen.restore();                           // ... och återställ pennan.
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    // MeshLambertMaterial: enkelt och snabbt, blir ljusare/mörkare av lamporna och tar emot skuggor.
    new THREE.MeshLambertMaterial({ map: makeTileTexture(tile, GROUND_SIZE / TILE_UNITS) })
  );
  ground.rotation.x = -Math.PI / 2; // Ett plan skapas stående; lägg ner det.
  ground.renderOrder = -10;          // Marken ritas allra först (se roads.js).
  ground.position.set(HUB_X, 0, HUB_Z);
  worldGroup(hub).add(ground);
  makeEdgeFade(hub);
}

export function buildHubBillboards() {
  buildBillboards(hub);
}

// Vägar, grottor, vägskyltar och lyktor. Returnerar vägarna, så att träden kan hålla sig borta.
export function buildHubRoads() {
  for (const portal of PORTALS) if (portal.world === hub) buildPortal(portal);

  const portalRoadPoint = towardCamera(techartCave.at, ROAD_DISTANCE); // Nedanför Tech Art-grottan.
  const progTurnOff = hubPoint(PROG_TURN_RIGHT, ROAD_DISTANCE);
  const progLoopRight = hubPoint(PROG_TURN_RIGHT, PROG_LOOP_DOWN);
  const progLoopLeft = hubPoint(0, PROG_LOOP_DOWN);   // Under Programming-grottan.
  const artLoopLeft = hubPoint(-24, PROG_LOOP_DOWN);  // Under Art-grottan, där vägen tar slut.
  // Gångvägen från parkeringen till stugans dörr: två smala bitar i vinkel.
  const PATH_WIDTH = 1.3;
  const DOOR_X = CABIN_X + 1.1;
  const DOOR_Z = CABIN_Z + CABIN_SIZE / 2;
  const PATH_TURN_Z = DOOR_Z + 2.6;
  // Varje rad är en rak väg från en punkt till en annan. ÄNDRA HÄR för fler eller färre vägar.
  const roads = [
    { from: homeRoadPoint, to: portalRoadPoint },        // Huvudvägen: från uppfarten förbi alla skyltar.
    { from: portalRoadPoint, to: techartCave.at },       // In i Tech Art-grottan.
    { from: progTurnOff, to: progLoopRight },            // Den nedre vägen: ner ...
    { from: progLoopRight, to: artLoopLeft },            // ... och åt vänster under grottorna ...
    { from: progLoopLeft, to: progCave.at },             // ... med en infart upp i varje grotta.
    { from: artLoopLeft, to: artCave.at },
    // Uppfarten: från garageporten ner till huvudvägen.
    { from: towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z + GARAGE_DEPTH / 2), to: homeRoadPoint },
    ...billboardDriveways(hub), // En kort infart till varje skylts ficka. ... = packa upp listan.
    { from: homePoint(DOOR_X, DOOR_Z + 0.3), to: homePoint(DOOR_X, PATH_TURN_Z), width: PATH_WIDTH },
    { from: homePoint(DOOR_X, PATH_TURN_Z), to: homePoint(2, PATH_TURN_Z), width: PATH_WIDTH },
  ];
  buildRoads(hub, roads);

  buildSignposts(hub, [
    // Mitt emot uppfarten: åt höger ligger projekten och Tech Art-grottan.
    { text: 'Tech Art', arrow: 'right', at: towardCamera(homeRoadPoint, 4.2) },
    // Där den nedre vägen svänger av: båda grottorna ligger åt det hållet.
    { text: 'Programming · Art', arrow: 'down', at: hubPoint(PROG_TURN_RIGHT + 5.5, ROAD_DISTANCE + 6) },
    // Under den nedre vägen: Art fortsätter åt vänster.
    { text: 'Art', arrow: 'left', at: hubPoint(-6, PROG_LOOP_DOWN + 5.5) },
  ]);

  const lamps = [
    ...rowLamps(hub),
    // Under den nedre vägen, mitt emellan Art- och Programming-grottan.
    { at: hubPoint(-12, PROG_LOOP_DOWN + LAMP_SIDE), arm: ARM_UP },
    // Till höger om backen ner från huvudvägen.
    { at: hubPoint(PROG_TURN_RIGHT + LAMP_SIDE, 25), arm: ARM_LEFT },
  ];
  buildLamps(hub, lamps);
  return { roads, lamps };
}

// Lönnar utspridda över marken, men inte där de är i vägen.
export function buildHubTrees({ roads, lamps }) {
  const TREE_TRIES = 270; // Många försök, eftersom de som hamnar på fel ställe hoppas över.
  const trees = [];
  const hubPortals = PORTALS.filter((portal) => portal.world === hub);
  for (let i = 0; i < TREE_TRIES; i++) {
    const x = HUB_X + (Math.random() - 0.5) * GROUND_SIZE;
    const z = HUB_Z + (Math.random() - 0.5) * GROUND_SIZE;
    // "continue" = hoppa över det här trädet. .some(...) = "stämmer det för minst en?".
    if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) continue;                          // Tomten.
    if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS + 5) continue;             // Ute i toningen.
    if (roads.some((road) => distanceToRoad(x, z, road) < ROAD_WIDTH / 2 + 2)) continue; // Vägarna.
    if (PROJECTS.some((project) => Math.hypot(x - project.x, z - project.z) < 12)) continue; // Skyltarna.
    if (hubPortals.some((portal) => Math.hypot(x - portal.at.x, z - portal.at.z) < 12)) continue; // Grottorna.
    if (lamps.some((lamp) => Math.hypot(x - lamp.at.x, z - lamp.at.z) < 3)) continue; // Lyktorna.
    trees.push(randomTree(x, z));
  }
  // Träd runt stugan på bestämda platser, så att tomten ser likadan ut varje gång.
  // [x, z, storlek, färgnummer], räknat inne i hem-gruppen.
  const HOME_TREES = [
    [-3, -5, 1.2, 1], [2.5, -6, 1.0, 0], [7, -5.5, 1.2, 2],   // Bakom garaget och stugan.
    [-6.5, -1, 1.1, 0], [-7, 4, 1.0, 1], [-6, 8, 0.9, 2],     // Till vänster om garaget och uppfarten.
  ];
  for (const [x, z, scale, colorIndex] of HOME_TREES) {
    const spot = homeGroup.localToWorld(new THREE.Vector3(x, 0, z));
    trees.push({ x: spot.x, z: spot.z, angle: Math.random() * Math.PI * 2, scale, color: leafColors[colorIndex] });
  }
  worldGroup(hub).add(...makeTrees(trees));
}
