// ============================================================================
// hub.js — bygger hemvärlden: marken, skyltarna, vägarna, grottorna, vägskyltarna,
// gatlyktorna och träden. (Garaget och stugan byggs i home.js.)
// ============================================================================
import * as THREE from 'three';
import {
  PALETTE, WORLDS, GROUND_SIZE, TILE_PIXELS, TILE_UNITS, DRIVE_RADIUS, HUB_X, HUB_Z, BILLBOARD_FACING,
  towardCamera, worldGroup, makeEdgeFade, makeTileTexture,
} from './core.js';
import { buildBillboards, BAY_WIDTH, BAY_LENGTH, BAY_SKIRT } from './billboards.js';
import { PROJECTS } from './projects.js';
import { ROAD_WIDTH, ROAD_DISTANCE, buildRoads, billboardDriveways, distanceToRoad, bayFrames } from './roads.js';
import {
  HOME_X, HOME_Z, GARAGE_Z, GARAGE_DEPTH, CABIN_X, CABIN_Z, CABIN_SIZE,
  homeGroup, homeRoadPoint, hubPoint, homePoint, teaCupSpots,
} from './home.js';
import { PORTALS, techartCave, progCave, artCave, buildPortal } from './portals.js';
import { buildSignposts } from './signposts.js';
import { buildLamps, rowLamps, LAMP_SIDE, ARM_UP, ARM_DOWN, ARM_LEFT } from './lamps.js';
import {
  PLAZA, POND, TEAHOUSE, buildHubProps, plazaRoads, plazaVertex, distanceToWater, hubPropObstacles, hubPropShadows,
} from './hubprops.js';
import { makeTrees, randomTree, leafColors } from './trees.js';
import { makeGrass, addSaturation } from './magic.js';
import { addContactShadows, scatterStones } from './grounding.js';
import { addObstacles } from './collision.js';

const hub = WORLDS.hub;
// Armen på en lykta pekar åt (right, down) på skärmen. (0, 1) = nedåt, (-1, 0) = åt vänster.
const armToward = (right, down) => BILLBOARD_FACING + Math.atan2(right, down);
const ARM_RIGHT = armToward(1, 0);
let groundMap = null; // Markens kakelbild. Gräset läser av den för att ta markens färg (se buildHubGrass).

// Delas upp i steg, så att laddningsmätaren kan röra sig mellan dem (se main.js).
export function buildHubGround() {
  // --- Marken: gyllengul med röda och orange löv, ritad i en osynlig canvas ---
  const tile = document.createElement('canvas');
  tile.width = TILE_PIXELS;
  tile.height = TILE_PIXELS;
  const pen = tile.getContext('2d');
  pen.fillStyle = PALETTE.ground;
  pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  // Stora mjuka fläckar av mörkare och torrare gräs, så att marken inte är en enda platt färg.
  // Varje fläck ritas tre gånger: där den hamnar och "runt hörnet" på andra sidan bilden,
  // så att skarven mellan kopiorna inte syns.
  for (let i = 0; i < 14; i++) {
    const radius = 40 + Math.random() * 70;
    const x = Math.random() * TILE_PIXELS;
    const y = Math.random() * TILE_PIXELS;
    const color = i % 2 ? PALETTE.groundDark : PALETTE.groundDry;
    for (const dx of [-TILE_PIXELS, 0, TILE_PIXELS]) {
      for (const dy of [-TILE_PIXELS, 0, TILE_PIXELS]) {
        const blob = pen.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        blob.addColorStop(0, color + 'aa'); // aa = ganska täckande i mitten ...
        blob.addColorStop(1, color + '00'); // ... och helt genomskinlig i kanten.
        pen.fillStyle = blob;
        pen.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
  }
  // Små grässtrån: korta streck i mörkt och ljust. Ger marken struktur på nära håll.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * TILE_PIXELS;
    const y = Math.random() * TILE_PIXELS;
    pen.strokeStyle = i % 2 ? 'rgba(40, 50, 20, 0.25)' : 'rgba(220, 210, 140, 0.2)';
    pen.lineWidth = 1.5;
    pen.beginPath();
    pen.moveTo(x, y);
    pen.lineTo(x + (Math.random() - 0.5) * 4, y - 4 - Math.random() * 4);
    pen.stroke();
  }
  // 70 små löv på slumpade platser. Det är "bruset" som gör att man ser att bilen rör sig.
  for (let i = 0; i < 70; i++) {
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
    new THREE.MeshLambertMaterial({ map: (groundMap = makeTileTexture(tile, GROUND_SIZE / TILE_UNITS)) })
  );
  addSaturation(ground.material, 1.2); // Lite starkare gräsfärg.
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
  buildHubProps(); // Fontän, damm och bro, kiosk, tehus, pelare, häckar och stenar (hubprops.js).

  // Gångvägen från stugans dörr till sidan av parkeringen: en mjuk kurva (kubisk Bezier) av
  // åtta korta, raka och smala bitar. Ingen kantsten (noCurb), bara stenar längs kanten.
  const PATH_WIDTH = 1.3;
  const TECH_ROAD_RIGHT = 35.5;   // Där Tech Art-vägen lämnar huvudvägen.
  const TEAHOUSE_PATH_RIGHT = TEAHOUSE.right; // Tehusets gångstig.
  const PATH_SEGMENTS = 8;
  const DOOR_X = CABIN_X + 1.1;
  const DOOR_Z = CABIN_Z + CABIN_SIZE / 2;
  const pathCurve = [[DOOR_X, DOOR_Z + 0.3], [DOOR_X, DOOR_Z + 2.4], [DOOR_X - 1.4, 5.7], [2.7, 5.5]]; // Start, två styrpunkter, slut.
  const pathAt = (t) => {
    const u = 1 - t;
    const [a, b, c, d] = pathCurve;
    const bezier = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
    return homePoint(bezier(0), bezier(1));
  };
  const footpath = [];
  for (let i = 0; i < PATH_SEGMENTS; i++) {
    footpath.push({ from: pathAt(i / PATH_SEGMENTS), to: pathAt((i + 1) / PATH_SEGMENTS), width: PATH_WIDTH, noCurb: true });
  }
  // Varje rad är en rak väg från en punkt till en annan. ÄNDRA HÄR för fler eller färre vägar.
  const roads = [
    // Huvudvägen: från uppfarten förbi alla skyltar, till avfarten mot Tech Art-grottan.
    { from: homeRoadPoint, to: hubPoint(TECH_ROAD_RIGHT, ROAD_DISTANCE) },
    // Tech Art: en mjuk S-kurva ner från huvudvägen, och de sista 6.5 enheterna rakt in i öppningen.
    { from: hubPoint(TECH_ROAD_RIGHT, ROAD_DISTANCE), to: hubPoint(38.5, 17) },
    { from: hubPoint(38.5, 17), to: hubPoint(35.5, 22.5) },
    { from: hubPoint(35.5, 22.5), to: techartCave.at },
    // Torget: en stickväg rakt ner från huvudvägen (siktlinje mot fontänen) och en åttkantig ring.
    { from: hubPoint(PLAZA.right, ROAD_DISTANCE), to: plazaVertex(0) },
    ...plazaRoads(),
    // Programming: från torgets ring, en lätt böj åt höger och sedan rakt ner i öppningen.
    { from: plazaVertex(1), to: hubPoint(14, 31.2) },
    { from: hubPoint(14, 31.2), to: hubPoint(21, 33.5) },
    { from: hubPoint(21, 33.5), to: progCave.at },
    // Art: rakt ner över bron över dammen, sedan en kurva åt vänster och rakt in i öppningen.
    { from: hubPoint(POND.right, ROAD_DISTANCE), to: hubPoint(POND.right, 33.3) },
    { from: hubPoint(POND.right, 33.3), to: hubPoint(-18.6, 36) },
    { from: hubPoint(-18.6, 36), to: hubPoint(-22.5, 38.5) },
    { from: hubPoint(-22.5, 38.5), to: artCave.at },
    { from: plazaVertex(6), to: hubPoint(-18.6, 36) }, // Från torgets vänstra sida in på Art-vägen.
    // Gångstig från huvudvägen till tehuset.
    { from: hubPoint(TEAHOUSE_PATH_RIGHT, 13), to: hubPoint(TEAHOUSE_PATH_RIGHT, 23.3), width: PATH_WIDTH },
    // Uppfarten: från garageporten ner till huvudvägen.
    { from: towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z + GARAGE_DEPTH / 2), to: homeRoadPoint },
    ...billboardDriveways(hub), // En kort infart till varje skylts ficka. ... = packa upp listan.
    ...footpath,
  ];
  buildRoads(hub, roads);

  const signposts = [
    // Mitt emot uppfarten: åt höger ligger projekten och Tech Art-grottan.
    { text: 'Tech Art', arrow: 'right', at: towardCamera(homeRoadPoint, 4.2) },
    // Vid avfarterna ner till grottorna: Programming via torget, Art via bron, Tech Art till höger.
    { text: 'Programming', arrow: 'down', at: hubPoint(PLAZA.right + 5.5, ROAD_DISTANCE + 4.7) },
    { text: 'Art', arrow: 'down', at: hubPoint(POND.right + 5.5, ROAD_DISTANCE + 4.7) },
    { text: 'Tech Art', arrow: 'down', at: hubPoint(TECH_ROAD_RIGHT - 4.5, ROAD_DISTANCE + 5) },
  ];
  buildSignposts(hub, signposts);

  const lamps = [
    ...rowLamps(hub),
    // Stickvägen till torget, och fem runt torgets ring (pekar in mot fontänen).
    { at: hubPoint(PLAZA.right + LAMP_SIDE, 21), arm: ARM_LEFT },
    { at: hubPoint(PLAZA.right - LAMP_SIDE, 17.5), arm: ARM_RIGHT },
    ...[112.5, 157.5, 202.5, 247.5, 292.5].map((degrees) => {
      const angle = degrees * Math.PI / 180;
      const reach = PLAZA.radius + 3.6;
      return {
        at: hubPoint(PLAZA.right + Math.sin(angle) * reach, PLAZA.down - Math.cos(angle) * reach),
        arm: armToward(-Math.sin(angle), Math.cos(angle)),
      };
    }),
    // Bredvid vägarna till grottorna och vid bron.
    { at: hubPoint(techartCave.right + LAMP_SIDE, 25.5), arm: ARM_LEFT },
    { at: hubPoint(progCave.right - 4.5, 28.7), arm: ARM_DOWN },
    { at: hubPoint(progCave.right + LAMP_SIDE, 36), arm: ARM_LEFT },
    { at: hubPoint(POND.right + LAMP_SIDE, 19.8), arm: ARM_LEFT },
    { at: hubPoint(artCave.right - LAMP_SIDE, 42), arm: ARM_RIGHT },
  ];
  buildLamps(hub, lamps);
  return { roads, lamps, signposts };
}

// Lönnar på genomtänkta platser: grupper som ramar in vägarna, torget och dammen, en tät vägg bakom
// skyltraden (så att bakgrunden får djup och världens kant göms), och slumpade träd längst ut.
export function buildHubTrees({ roads, lamps, signposts }) {
  const trees = [];
  const hubPortals = PORTALS.filter((portal) => portal.world === hub);
  // Får ett träd stå här? projectReach = hur långt från skyltarna det ska vara (12 för slumpade träd).
  // "return false" = hoppa över det här trädet. .some(...) = "stämmer det för minst en?".
  function fits(x, z, projectReach = 12) {
    if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) return false;                          // Tomten.
    if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS + 5) return false;             // Ute i toningen.
    if (roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + 2)) return false; // Vägarna.
    if (PROJECTS.some((project) => Math.hypot(x - project.x, z - project.z) < projectReach)) return false; // Skyltarna.
    if (hubPortals.some((portal) => Math.hypot(x - portal.center.x, z - portal.center.z) < 13)) return false; // Grottorna (bergets mitt).
    if (lamps.some((lamp) => Math.hypot(x - lamp.at.x, z - lamp.at.z) < 3)) return false; // Lyktorna.
    // Vägskyltarna: brädan är 4.2 bred, och en trädkrona är upp till ca 2 i radie.
    if (signposts.some((sign) => Math.hypot(x - sign.at.x, z - sign.at.z) < 5)) return false;
    // Fontänen, kiosken, tehuset, pelarna, häckarna och stenarna (hubprops.js), och dammen.
    if (hubPropObstacles.some((prop) => Math.hypot(x - prop.x, z - prop.z) < prop.radius + 1.9)) return false;
    if (distanceToWater(x, z) < 2.4) return false;
    if (trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 1.6)) return false; // Inte krona i krona.
    return true;
  }
  // a) Små grupper om tre till fem träd. [right, down, antal] räknat från skyltradens mitt.
  const CLUSTERS = [
    [-28, 19, 4], [-6.5, 20, 4], [10, 19.5, 4], [21, 19, 4], [46, 19, 3],     // Nedanför huvudvägen.
    [-9, 21.5, 3], [-27, 27, 4], [-9, 32, 4], [-25, 33.5, 3],                  // Runt dammen.
    [13.5, 25.5, 4], [-13, 45, 4], [3, 53, 4], [13, 48, 3], [-4, 52, 3],       // Runt torget.
    [30, 24, 3], [-44, 29, 4], [-41, 36, 4], [-32, 38, 3], [41, 40, 3],        // Vid tehuset och Tech Art.
  ];
  for (const [right, down, count] of CLUSTERS) {
    const centre = hubPoint(right, down);
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.sqrt(Math.random()) * 2.6;
      const x = centre.x + Math.cos(angle) * reach;
      const z = centre.z + Math.sin(angle) * reach;
      if (!fits(x, z)) continue;
      trees.push(randomTree(x, z));
      placed++;
    }
  }
  // b) Väggen bakom skyltraden: tre rader som tätnar bakgrunden uppåt på skärmen.
  [[-7.5, 1.3], [-13, 1.5], [-19, 1.6]].forEach(([down, scale], row) => {
    for (let right = -58 + (row % 2) * 1.9; right < 58; right += 3.7) {
      const spot = hubPoint(right + (Math.random() - 0.5) * 1.6, down + (Math.random() - 0.5) * 2.2);
      if (!fits(spot.x, spot.z, 5.5)) continue;
      const tree = randomTree(spot.x, spot.z);
      tree.scale = scale * (0.85 + Math.random() * 0.3);
      trees.push(tree);
    }
  });
  // c) Slumpade träd bara långt ute (mer än 40 från mitten), annars blir det kaos mellan föremålen.
  const middle = hubPoint(-2, 15);
  for (let i = 0; i < 420; i++) {
    const x = HUB_X + (Math.random() - 0.5) * GROUND_SIZE;
    const z = HUB_Z + (Math.random() - 0.5) * GROUND_SIZE;
    if (Math.hypot(x - middle.x, z - middle.z) < 40) continue;
    if (fits(x, z)) trees.push(randomTree(x, z));
  }
  // Träd runt stugan på bestämda platser, så att tomten ser likadan ut varje gång.
  // [x, z, storlek, färgnummer], räknat inne i hem-gruppen.
  const HOME_TREES = [
    [-2, -6.5, 1.2, 1], [2.5, -6, 1.0, 0], [7, -5.5, 1.2, 2],  // Bakom garaget och stugan.
    [-7.6, -0.6, 1.1, 0], [-7.4, 4.6, 1.0, 1], [-6, 8, 0.9, 2], // Till vänster om garaget (plats för tekopparna).
  ];
  for (const [x, z, scale, colorIndex] of HOME_TREES) {
    const spot = homeGroup.localToWorld(new THREE.Vector3(x, 0, z));
    trees.push({ x: spot.x, z: spot.z, angle: Math.random() * Math.PI * 2, scale, color: leafColors[colorIndex] });
  }
  worldGroup(hub).add(...makeTrees(trees));
  return trees; // Gräset och marken runt träden (se buildHubGrass/buildHubGrounding) behöver platserna.
}

// Gräs överallt där det får plats: inte på vägarna, tomten, skyltarnas fickor eller i grottorna.
// grassAmount räknar ut hur långt det är till närmaste hinder. Nära ett hinder blir gräset
// kortare, och på hindret finns inget (0). Så får gräset mjuka kanter mot vägarna.
export function buildHubGrass({ roads, lamps, signposts, trees = [] }) {
  const hubPortals = PORTALS.filter((portal) => portal.world === hub);
  const bays = bayFrames(hub, roads);
  function grassAmount(x, z) {
    let room = DRIVE_RADIUS + 6 - Math.hypot(x - HUB_X, z - HUB_Z); // Ute i kanttoningen.
    room = Math.min(room, Math.hypot(x - HOME_X, z - HOME_Z) - 8.5); // Garaget och stugan.
    for (const cup of teaCupSpots) room = Math.min(room, Math.hypot(x - cup.x, z - cup.z) - 2.2); // Tekopparna.
    for (const road of roads) room = Math.min(room, distanceToRoad(x, z, road) - (road.width || ROAD_WIDTH) / 2 - 0.3);
    // Parkeringsfickorna: gräset växer ända fram till fickans skört (rektangeln är öppen mot vägen).
    for (const bay of bays) {
      const dx = x - bay.x;
      const dz = z - bay.z;
      const along = dx * bay.ux + dz * bay.uz;        // Mot vägen (+) eller bakåt (-).
      const across = dx * -bay.uz + dz * bay.ux;      // Åt sidan.
      const outside = Math.hypot(Math.max(-along - BAY_LENGTH / 2, 0), Math.max(Math.abs(across) - BAY_WIDTH / 2, 0));
      // Inom fickan och skörtet: inget gräs. Sedan växer det fram över en enhet.
      room = Math.min(room, (outside - BAY_SKIRT * 0.6) * 1.5);
    }
    for (const project of PROJECTS) {
      // Längre, mjukare nedtoning runt skyltarna (2.5 enheter i stället för 1.5): gräset trappas ner.
      if (project.world === hub) room = Math.min(room, (Math.hypot(x - project.x, z - project.z) - 3.5) * 0.6);
    }
    // Grottorna: gräset tonas ner över 4 enheter (11 ut fullt) i stället för att sluta tvärt.
    for (const portal of hubPortals) room = Math.min(room, (Math.hypot(x - portal.center.x, z - portal.center.z) - 8) * 0.375);
    // Träden: bart precis runt stammen, sedan allt högre gräs.
    for (const tree of trees) room = Math.min(room, (Math.hypot(x - tree.x, z - tree.z) - 0.4 * tree.scale) * 0.75);
    for (const lamp of lamps) room = Math.min(room, Math.hypot(x - lamp.at.x, z - lamp.at.z) - 0.6);
    // Fontänen, kiosken, tehuset, pelarna, häckarna, stenarna och dammen (hubprops.js).
    for (const prop of hubPropObstacles) room = Math.min(room, Math.hypot(x - prop.x, z - prop.z) - prop.radius * 0.9);
    room = Math.min(room, distanceToWater(x, z) - 0.9);
    for (const sign of signposts) room = Math.min(room, Math.hypot(x - sign.at.x, z - sign.at.z) - 2.4);
    return THREE.MathUtils.clamp(room / 1.5, 0, 1); // 1.5 enheter från hindret är gräset fullt.
  }
  // Bränt, torrt gräs närmast vägarna (0 = grönt, 1 = brunt). Lite ojämnt, så att det blir fläckar.
  function grassBurn(x, z) {
    let near = Infinity;
    for (const road of roads) near = Math.min(near, distanceToRoad(x, z, road) - (road.width || ROAD_WIDTH) / 2);
    near = Math.min(near, distanceToWater(x, z) + 0.6); // Torrt gräs även närmast dammen.
    const patchy = 0.7 + 0.3 * Math.sin(x * 0.9) * Math.sin(z * 1.3);
    return THREE.MathUtils.clamp(1 - (near - 0.2) / 2.6, 0, 1) * patchy;
  }
  makeGrass(hub, grassAmount, { x: HUB_X, z: HUB_Z, size: GROUND_SIZE, groundMap, groundUnits: TILE_UNITS }, grassBurn);
}

// Kontaktskuggor och stenar vid foten av träd, skyltar, vägskyltar, lyktor och grottor, så att
// de binds ihop med marken. Körs efter att träd och vägar är byggda.
export function buildHubGrounding({ roads, lamps, signposts, trees = [] }) {
  const hubPortals = PORTALS.filter((portal) => portal.world === hub);
  const hubProjects = PROJECTS.filter((project) => project.world === hub);
  const shadows = [
    ...trees.map((tree) => ({ x: tree.x, z: tree.z, radius: 1.5 * tree.scale })),
    ...hubProjects.map((project) => ({ x: project.x, z: project.z, radius: 3.4 })),
    ...signposts.map((sign) => ({ x: sign.at.x, z: sign.at.z, radius: 1.5 })),
    ...lamps.map((lamp) => ({ x: lamp.at.x, z: lamp.at.z, radius: 1 })),
    ...hubPortals.map((portal) => ({ x: portal.center.x, z: portal.center.z, radius: 8 })),
    ...hubPropShadows, // Fontän, kiosk, tehus, pelare och stenhögar.
  ];
  addContactShadows(hub, shadows);
  const stones = [
    ...trees.map((tree) => ({ x: tree.x, z: tree.z, radius: 1.1 * tree.scale, inner: 0.25, count: 5, sizeScale: tree.scale })),
    ...hubProjects.map((project) => ({ x: project.x, z: project.z, radius: 3, inner: 0.3, count: 18 })),
    ...signposts.map((sign) => ({ x: sign.at.x, z: sign.at.z, radius: 1.3, inner: 0.3, count: 7 })),
    ...hubPortals.map((portal) => ({ x: portal.center.x, z: portal.center.z, radius: 10.5, inner: 0.5, count: 70, sizeScale: 1.4 })),
    ...hubPropShadows.map((prop) => ({ x: prop.x, z: prop.z, radius: prop.radius * 0.9, inner: 0.5, count: 10 })),
  ];
  scatterStones(hub, roads, stones);
}

// Fasta saker som bilen krockar med (se collision.js): träd, lyktor, vägskyltarnas stolpar,
// skyltarnas stolpar, grottornas berg samt garaget och stugan. Cirklar { x, z, radius }.
// Vägar, parkeringsfickor, grottdörrar, garagets port, gräs, löv och stenar blockerar inte.
export function buildHubCollision({ lamps, signposts, trees = [] }) {
  const obstacles = [];
  // En plats inne i en grupp som står på (origin) och är vriden angle runt Y, räknad till världen.
  // Samma matte som towardCamera/toTheRight: lokal +x = (cos, -sin), lokal +z = (sin, cos).
  function placed(origin, angle, x, z) {
    return {
      x: origin.x + Math.cos(angle) * x + Math.sin(angle) * z,
      z: origin.z - Math.sin(angle) * x + Math.cos(angle) * z,
    };
  }
  function add(spot, radius) {
    obstacles.push({ x: spot.x, z: spot.z, radius });
  }

  for (const tree of trees) add(tree, 0.35 * tree.scale); // Bara stammen; kronan är högt över bilen.
  for (const lamp of lamps) add(lamp.at, 0.3);
  // Vägskyltarna: bara stolpen. Brädan sitter över bilens tak.
  for (const sign of signposts) add(placed(sign.at, BILLBOARD_FACING, 0, -0.14), 0.25);

  // Biodukarna: två stolpar (x = +-3, se DISPLAYS.cinema), mobilskyltarna står direkt på marken.
  for (const project of PROJECTS) {
    if (project.world !== hub) continue;
    if (project.phone) {
      for (const x of [-1.4, 0, 1.4]) add(placed(project, BILLBOARD_FACING, x, -0.2), 0.45);
    } else {
      for (const x of [-3, 3]) add(placed(project, BILLBOARD_FACING, x, -0.16), 0.3);
    }
  }

  // Grottorna: berget bakom öppningen och stenarna på var sida (grottans lokala +z = uppåt på
  // skärmen, ut ur öppningen). Mitten framför öppningen (|x| < ca 1.7) lämnas fri ända fram till
  // dörren, annars går det inte att köra in. [x, z, radie] i grottans egna mått (ur CAVE_ROCKS).
  const CAVE_BLOCKS = [
    [0, -5.2, 3.4], [-3, -4.6, 1.9], [3, -4.6, 1.9], [0, -8.2, 2.2],  // Det stora berget.
    [-3.9, -1, 1.6], [3.9, -1, 1.6],                                  // Öppningens sidor.
    [-3.1, 0.4, 0.8], [3.1, 0.5, 0.8],                                // Hörnstenarna.
    [-5.4, 0.6, 0.6], [5.3, 0.9, 0.5],                                // Småstenarna framför.
  ];
  for (const portal of hubPortalsOf()) {
    for (const [x, z, radius] of CAVE_BLOCKS) add(placed(portal.at, BILLBOARD_FACING + Math.PI, x, z), radius);
  }

  // Garaget (hemgruppens mått): bakväggen och sidorna, men inte fronten: porten och bilplatsen
  // framför är fria. Stugan är en helt fast ruta (cirklar i rutnät). Brevlådan: en stolpe.
  for (let x = -2.4; x <= 2.41; x += 0.8) add(homePoint(x, -1.4), 0.5);
  for (const side of [-2.55, 2.55]) {
    for (let z = -1.4; z <= 1.51; z += 0.8) add(homePoint(side, z), 0.5);
  }
  const HALF = CABIN_SIZE / 2 - 0.65; // Cirklarnas mittpunkter ligger lite innanför väggen.
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      add(homePoint(CABIN_X - HALF + (i / 4) * HALF * 2, CABIN_Z - HALF + (j / 4) * HALF * 2), 0.75);
    }
  }
  add(homePoint(3.9, ROAD_DISTANCE - 3.9), 0.3);

  // Allt som level design lagt till (fontän, pelare, damm, bro, kiosk, tehus, häckar, stenar): hubprops.js.
  for (const prop of hubPropObstacles) add(prop, prop.radius);

  addObstacles(obstacles);
  return obstacles;
}

function hubPortalsOf() {
  return PORTALS.filter((portal) => portal.world === hub && portal.style === 'cave');
}
