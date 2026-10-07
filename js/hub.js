// ============================================================================
// hub.js — bygger hemvärlden: marken, skyltarna, vägarna, grottorna, vägskyltarna,
// gatlyktorna och träden. (Garaget och stugan byggs i home.js.)
// ============================================================================
import * as THREE from 'three';
import {
  PALETTE, WORLDS, GROUND_SIZE, TILE_PIXELS, TILE_UNITS, DRIVE_RADIUS, HUB_X, HUB_Z, BILLBOARD_FACING,
  towardCamera, worldGroup, makeEdgeFade, makeTileTexture,
} from './core.js';
import { billboards, buildBillboards, BAY_WIDTH, BAY_LENGTH, BAY_SKIRT } from './billboards.js';
import { PROJECTS } from './projects.js';
import { ROAD_WIDTH, ROAD_DISTANCE, buildRoads, billboardDriveways, distanceToRoad, bayFrames } from './roads.js';
import {
  HOME_X, HOME_Z, GARAGE_Z, GARAGE_DEPTH, CABIN_X, CABIN_Z, CABIN_SIZE,
  homeGroup, homeRoadPoint, hubPoint, homePoint, teaCupSpots, teaCups, mailbox,
} from './home.js';
import { PORTALS, techartCave, progCave, artCave, buildPortal } from './portals.js';
import { buildSignposts } from './signposts.js';
import { buildLamps, rowLamps, LAMP_SIDE, ARM_DOWN, ARM_LEFT } from './lamps.js';
import {
  PLAZA, ART_ROAD, GAZEBO, GAZEBO_ROAD_END, buildHubProps, plazaRoads, plazaVertex, distanceToWater,
  hubPropObstacles, hubPropShadows, hubGrassFree,
} from './hubprops.js';
import { getSeasonConfig } from './season.js';
import { makeTrees, randomTree, leafColors } from './trees.js';
import { makeGrass, addSaturation } from './magic.js';
import { addContactShadows, scatterStones } from './grounding.js';
import { addObstacles } from './collision.js';
import { knockableInstances, knockableObject, wobbler } from './knockables.js';

const hub = WORLDS.hub;
// Armen på en lykta pekar åt (right, down) på skärmen. (0, 1) = nedåt, (-1, 0) = åt vänster.
const armToward = (right, down) => BILLBOARD_FACING + Math.atan2(right, down);
const ARM_RIGHT = armToward(1, 0);
let groundMap = null; // Markens kakelbild. Gräset läser av den för att ta markens färg (se buildHubGrass).

// Vintermarken (foliage.groundStyle 'snow'): inga löv. Snötäcke med bara fläckar av frusen jord och gräs som tittar upp,
// ljusa snöhögar och glitter. Allt ritas "runt hörnet" (tre gånger), så att kakelskarven inte syns.
function paintSnowGround(pen) {
  const T = TILE_PIXELS;
  // En ojämn klutt (polygon med slumpad radie). soft = antal lager som tonar ut kanten.
  const lump = (x, y, radius, rgb, alpha, soft = 4, squash = 0.75) => {
    const phase = Math.random() * 6.28;
    const lobes = 3 + Math.floor(Math.random() * 3);
    const turn = Math.random() * 6.28;
    for (const dx of [-T, 0, T]) {
      for (const dy of [-T, 0, T]) {
        if (x + dx < -radius * 1.6 || x + dx > T + radius * 1.6 || y + dy < -radius * 1.6 || y + dy > T + radius * 1.6) continue;
        for (let layer = 0; layer < soft; layer++) {
          const grow = 1 + (soft - 1 - layer) * 0.16;
          pen.fillStyle = `rgba(${rgb}, ${alpha / soft * (layer === soft - 1 ? 1.6 : 1)})`;
          pen.beginPath();
          for (let a = 0; a <= 6.4; a += 0.2) {
            const r = radius * grow * (0.72 + 0.2 * Math.sin(a * lobes + phase) + 0.1 * Math.sin(a * (lobes * 2 + 1) + phase * 2));
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r * squash;
            const sx = px * Math.cos(turn) - py * Math.sin(turn);
            const sy = px * Math.sin(turn) + py * Math.cos(turn);
            if (a === 0) pen.moveTo(x + dx + sx, y + dy + sy); else pen.lineTo(x + dx + sx, y + dy + sy);
          }
          pen.closePath();
          pen.fill();
        }
      }
    }
  };
  // Frusen jord och gräs som tittar fram: tunnare snö på kullarna, tydligast i fläckar med hård kant.
  for (let i = 0; i < 26; i++) {
    const r = 18 + Math.random() * 40;
    const x = Math.random() * T;
    const y = Math.random() * T;
    const earth = Math.random() < 0.45;
    lump(x, y, r, earth ? '96, 88, 84' : '112, 128, 112', 0.5, 3);
    lump(x, y, r * 0.62, earth ? '78, 70, 68' : '92, 108, 92', 0.4, 2); // Mörkare mitt.
    lump(x, y, r * 1.25, '236, 242, 250', 0.35, 2); // Ljus snörand runt fläcken.
  }
  // Stora mjuka snövågor, ljusare och blåare, så att täcket inte är en platt färg.
  for (let i = 0; i < 22; i++) lump(Math.random() * T, Math.random() * T, 40 + Math.random() * 60, i % 3 ? '244, 248, 255' : '170, 190, 222', 0.3, 4, 0.5);
  // Små snöklumpar och skuggade gropar (ersätter "lövbruset": det som visar att marken rör sig när man kör).
  for (let i = 0; i < 70; i++) {
    const r = 4 + Math.random() * 9;
    const x = Math.random() * T;
    const y = Math.random() * T;
    lump(x + 1.5, y + 2, r, '120, 138, 170', 0.35, 2, 0.7); // Skugga.
    lump(x, y, r, '250, 252, 255', 0.9, 2, 0.7);
  }
  // Glitter.
  for (let i = 0; i < 160; i++) {
    pen.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.random() * 0.5})`;
    pen.fillRect(Math.random() * T, Math.random() * T, 1.5, 1.5);
  }
}

// Vår- och sommarmarken (foliage.groundStyle 'petals' | 'meadow'): inga löv. Grästuvor, klöver, småblommor och (på våren) kronblad.
// Allt ritas helt innanför bilden (marginal), så att inget klipps i skarven mellan kopiorna.
function paintMeadowGround(pen, spring) {
  const T = TILE_PIXELS;
  const at = (margin) => margin + Math.random() * (T - margin * 2);
  // Grästuvor: en solfjäder av korta, lätt böjda strån, i mörkare och ljusare grönt (på sommaren även torrt gult).
  const tuftColors = spring ? ['rgba(48,92,32,0.5)', 'rgba(122,180,70,0.5)', 'rgba(160,210,100,0.4)'] : ['rgba(54,84,26,0.5)', 'rgba(136,168,60,0.5)', 'rgba(214,196,110,0.5)', 'rgba(188,160,80,0.45)'];
  for (let i = 0; i < (spring ? 110 : 150); i++) {
    const x = at(14);
    const y = at(14);
    pen.strokeStyle = tuftColors[i % tuftColors.length];
    pen.lineWidth = 1.4 + Math.random() * 0.8;
    pen.lineCap = 'round';
    const blades = 4 + Math.floor(Math.random() * 4);
    for (let b = 0; b < blades; b++) {
      const lean = (b - (blades - 1) / 2) * 0.28 + (Math.random() - 0.5) * 0.15;
      const length = 6 + Math.random() * 8;
      pen.beginPath();
      pen.moveTo(x, y);
      pen.quadraticCurveTo(x + Math.sin(lean) * length * 0.5, y - length * 0.6, x + Math.sin(lean) * length, y - Math.cos(lean) * length);
      pen.stroke();
    }
  }
  // Klöver: tre små runda blad (och ibland en vit blomma).
  for (let i = 0; i < 46; i++) {
    const x = at(12);
    const y = at(12);
    const r = 3 + Math.random() * 2;
    pen.fillStyle = spring ? 'rgba(70,140,56,0.75)' : 'rgba(86,132,48,0.7)';
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * 0.4 + k * 2.09;
      pen.beginPath();
      pen.arc(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r, 0, 6.3);
      pen.fill();
    }
    if (Math.random() < 0.3) { pen.fillStyle = 'rgba(255,255,255,0.9)'; pen.beginPath(); pen.arc(x, y - r * 1.6, r * 0.7, 0, 6.3); pen.fill(); }
  }
  // Småblommor: fem små kronblad runt en mitt. Våren pastell, sommaren starkare.
  const flowerColors = spring ? ['#ffffff', '#ffd9e4', '#fff2a0', '#d4c0ff', '#ffc4d8'] : ['#ffe14a', '#ffffff', '#fff2a0', '#ff9ad0', '#9ac0ff'];
  for (let i = 0; i < (spring ? 70 : 60); i++) {
    const x = at(10);
    const y = at(10);
    const r = 2.2 + Math.random() * 2.2;
    pen.fillStyle = flowerColors[i % flowerColors.length];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.2566 + Math.random() * 0.2;
      pen.beginPath();
      pen.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, 6.3);
      pen.fill();
    }
    pen.fillStyle = '#e8a010';
    pen.beginPath();
    pen.arc(x, y, r * 0.55, 0, 6.3);
    pen.fill();
  }
  if (spring) { // Nedfallna kronblad: små ovala, rosa och vita, med en svag skugga.
    const petalColors = ['#ffc4d8', '#ffe0ea', '#ffffff', '#ffb0c8', '#fff0f4'];
    for (let i = 0; i < 90; i++) {
      const x = at(8);
      const y = at(8);
      const w = 2.6 + Math.random() * 2.2;
      pen.save();
      pen.translate(x, y);
      pen.rotate(Math.random() * 6.3);
      pen.fillStyle = 'rgba(40, 60, 20, 0.18)';
      pen.beginPath(); pen.ellipse(0.8, 1.2, w * 0.7, w * 1.1, 0, 0, 6.3); pen.fill();
      pen.fillStyle = petalColors[i % petalColors.length];
      pen.beginPath(); pen.ellipse(0, 0, w * 0.7, w * 1.1, 0, 0, 6.3); pen.fill();
      pen.restore();
    }
  } else { // Sommar: maskrosfluff (vit boll av små frön).
    for (let i = 0; i < 18; i++) {
      const x = at(10);
      const y = at(10);
      pen.fillStyle = 'rgba(255,255,255,0.7)';
      pen.beginPath(); pen.arc(x, y, 4.5, 0, 6.3); pen.fill();
      pen.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 7; k++) { const a = k * 0.9; pen.fillRect(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 1.2, 1.2); }
    }
  }
}

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
  const groundStyle = (getSeasonConfig().foliage || {}).groundStyle; // 'leaves' (höst, standard) | 'petals' | 'meadow' | 'snow'
  if (groundStyle === 'snow') {
    paintSnowGround(pen);
  } else if (groundStyle === 'petals' || groundStyle === 'meadow') {
    paintMeadowGround(pen, groundStyle === 'petals');
  } else {
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

  // Gångvägen från stugans dörr till sidan av parkeringen: en mjuk kurva (kubisk Bezier) av
  // åtta korta, raka och smala bitar. Ingen kantsten (noCurb), bara stenar längs kanten.
  const PATH_WIDTH = 1.3;
  const TECH_ROAD_RIGHT = 35.5;   // Där Tech Art-vägen lämnar huvudvägen.
  const LAST_SIGN_ROAD_END = 46;  // Huvudvägen slutar här: lite förbi sjätte skylten (3 x 14.14 = 42.4 åt höger om mitten).
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
    // Förlängning förbi Tech Art-avfarten, så att den sjätte skyltens (Lemon Lagoon) infart når en väg.
    { from: hubPoint(TECH_ROAD_RIGHT, ROAD_DISTANCE), to: hubPoint(LAST_SIGN_ROAD_END, ROAD_DISTANCE) },
    // Tech Art: en mjuk S-kurva ner från huvudvägen, och de sista 6.5 enheterna rakt in i öppningen.
    { from: hubPoint(TECH_ROAD_RIGHT, ROAD_DISTANCE), to: hubPoint(38.5, 17) },
    { from: hubPoint(38.5, 17), to: hubPoint(35.5, 22.5) },
    { from: hubPoint(35.5, 22.5), to: techartCave.at },
    // Torget: en stickväg rakt ner från huvudvägen (siktlinje mot fontänen) och en ring av tolv bitar
    // (nästan en cirkel). Innanför ringen är det öppen stenläggning att köra runt på.
    { from: hubPoint(PLAZA.right, ROAD_DISTANCE), to: plazaVertex(0) },
    ...plazaRoads(),
    // Programming: från torgets ring (hörn 2), en mjuk kurva och sedan rakt ner i öppningen.
    { from: plazaVertex(2), to: hubPoint(14.5, 31.9) },
    { from: hubPoint(14.5, 31.9), to: hubPoint(18.8, 32.6) },
    { from: hubPoint(18.8, 32.6), to: hubPoint(21, 34) },
    { from: hubPoint(21, 34), to: progCave.at },
    // Art: rakt ner över den breda bron över bäcken, en mjuk kurva åt vänster och rakt in i öppningen.
    { from: hubPoint(ART_ROAD.right, ROAD_DISTANCE), to: hubPoint(ART_ROAD.right, 30) },
    { from: hubPoint(ART_ROAD.right, 30), to: hubPoint(-16, 33.5) },
    { from: hubPoint(-16, 33.5), to: hubPoint(-20, 36.5) },
    { from: hubPoint(-20, 36.5), to: hubPoint(-22.5, 38.5) },
    { from: hubPoint(-22.5, 38.5), to: artCave.at },
    { from: plazaVertex(10), to: hubPoint(-14.8, 32.1) }, // Från torgets vänstra sida in på Art-vägen.
    // Paviljongen: rakt ner från huvudvägen över den andra bron.
    { from: hubPoint(GAZEBO.right, ROAD_DISTANCE), to: hubPoint(GAZEBO.right, GAZEBO_ROAD_END) },
    // Uppfarten: från garageporten ner till huvudvägen.
    { from: towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z + GARAGE_DEPTH / 2), to: homeRoadPoint },
    ...billboardDriveways(hub), // En kort infart till varje skylts ficka. ... = packa upp listan.
    ...footpath,
  ];
  buildHubProps(roads); // Torg, bäck och broar, kiosk, paviljong, skulpturer, bänkar, växter (hubprops.js).
  buildRoads(hub, roads);

  const signposts = [
    // Mitt emot uppfarten: åt höger ligger projekten och Tech Art-grottan.
    { text: 'Tech Art', arrow: 'right', at: towardCamera(homeRoadPoint, 4.2) },
    // Vid avfarterna ner till grottorna: Programming via torget, Art via bron, Tech Art till höger.
    { text: 'Programming', arrow: 'down', at: hubPoint(PLAZA.right + 5.5, ROAD_DISTANCE + 4.7) },
    { text: 'Art', arrow: 'down', at: hubPoint(ART_ROAD.right + 5.5, ROAD_DISTANCE + 4.7) },
    { text: 'Gazebo', arrow: 'down', at: hubPoint(GAZEBO.right + 5.5, ROAD_DISTANCE + 4.7) },
    { text: 'Tech Art', arrow: 'down', at: hubPoint(TECH_ROAD_RIGHT - 4.5, ROAD_DISTANCE + 5) },
  ];
  buildSignposts(hub, signposts);

  const lamps = [
    ...rowLamps(hub),
    // Stickvägen till torget, och tre runt torgets ring (pekar in mot fontänen).
    { at: hubPoint(PLAZA.right + LAMP_SIDE, 21), arm: ARM_LEFT },
    { at: hubPoint(PLAZA.right - LAMP_SIDE, 17.5), arm: ARM_RIGHT },
    ...[105, 165, 225].map((degrees) => {
      const angle = degrees * Math.PI / 180;
      const reach = PLAZA.radius + 3.9;
      return {
        at: hubPoint(PLAZA.right + Math.sin(angle) * reach, PLAZA.down - Math.cos(angle) * reach),
        arm: armToward(-Math.sin(angle), Math.cos(angle)),
      };
    }),
    // Bredvid vägarna till grottorna och vid bron.
    { at: hubPoint(techartCave.right + LAMP_SIDE, 25.5), arm: ARM_LEFT },
    { at: hubPoint(progCave.right - 4.5, 28.7), arm: ARM_DOWN },
    { at: hubPoint(progCave.right + LAMP_SIDE, 36), arm: ARM_LEFT },
    { at: hubPoint(ART_ROAD.right + LAMP_SIDE, 19.8), arm: ARM_LEFT },
    { at: hubPoint(GAZEBO.right + LAMP_SIDE, 19.8), arm: ARM_LEFT },
    { at: hubPoint(artCave.right - LAMP_SIDE, 42), arm: ARM_RIGHT },
  ];
  buildLamps(hub, lamps);
  return { roads, lamps, signposts };
}

// ÄNDRA HÄR: true = bilen kör över träden (de välter och blockerar inte), false = fasta stammar.
const TREES_DRIVEABLE = false;
let treeMeshes = null; // [stammar, kronor] när träden är byggda.

// Lönnar på genomtänkta platser: grupper som ramar in vägarna, torget och dammen, en tät vägg bakom
// skyltraden (så att bakgrunden får djup och världens kant göms), och slumpade träd längst ut.
export function buildHubTrees({ roads, lamps, signposts }) {
  const trees = [];
  const hubPortals = PORTALS.filter((portal) => portal.world === hub);
  // Får ett träd stå här? projectReach = hur långt från skyltarna det ska vara (12 för slumpade träd).
  // "return false" = hoppa över det här trädet. .some(...) = "stämmer det för minst en?".
  function fits(x, z, projectReach = 12, group = null) {
    if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) return false;                          // Tomten.
    if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS + 5) return false;             // Ute i toningen.
    if (roads.some((road) => distanceToRoad(x, z, road) < (road.width || ROAD_WIDTH) / 2 + 3.4)) return false; // Vägarna: minst 3.4 gräs på var sida.
    if (PROJECTS.some((project) => Math.hypot(x - project.x, z - project.z) < projectReach)) return false; // Skyltarna.
    if (hubPortals.some((portal) => Math.hypot(x - portal.center.x, z - portal.center.z) < 13)) return false; // Grottorna (bergets mitt).
    if (lamps.some((lamp) => Math.hypot(x - lamp.at.x, z - lamp.at.z) < 3)) return false; // Lyktorna.
    // Vägskyltarna: brädan är 4.2 bred, och en trädkrona är upp till ca 2 i radie.
    if (signposts.some((sign) => Math.hypot(x - sign.at.x, z - sign.at.z) < 5)) return false;
    // Fontänen, kiosken, paviljongen, skulpturerna, stenarna, bänkarna (hubprops.js), bäcken och dammen.
    if (hubPropObstacles.some((prop) => Math.hypot(x - prop.x, z - prop.z) < prop.radius + 2.4)) return false;
    if (distanceToWater(x, z) < 3) return false;
    if (hubGrassFree.some((spot) => Math.hypot(x - spot.x, z - spot.z) < spot.radius + 1.5)) return false; // Torgets stenläggning, bäddar.
    if (trees.some((tree) => { const d = Math.hypot(x - tree.x, z - tree.z); return d < 1.6 || (tree.group !== group && d < 6.5); })) return false; // Inte krona i krona, och minst 6.5 gräs mellan olika grupper.
    return true;
  }
  // a) Små grupper om tre till fem träd. [right, down, antal] räknat från skyltradens mitt.
  const CLUSTERS = [
    [-52, 20, 4], [-53, 37, 4], [-47, 49, 4], [-28, 58, 4], [-12, 61, 4], [5, 63, 4], [24, 60, 4], [40, 56, 3], // Längs kanten nere till vänster, nedtill och till höger.
    [52, 20, 4], [53, 36, 4], [47, 46, 3],                                                                     // Högerkanten.
    [-31, 17.5, 3], [40, 36, 3], [30, 46, 3], [-18, 52, 3], [14, 19.5, 3],                                      // Några avsiktliga grupper mellan föremålen, minst 7 enheter från allt.
  ];

  let clusterId = -1;
  for (const [right, down, count] of CLUSTERS) {
    clusterId++;
    const centre = hubPoint(right, down);
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.sqrt(Math.random()) * 2.6;
      const x = centre.x + Math.cos(angle) * reach;
      const z = centre.z + Math.sin(angle) * reach;
      if (!fits(x, z, 12, 'c' + clusterId)) continue;
      trees.push(Object.assign(randomTree(x, z), { group: 'c' + clusterId }));
      placed++;
    }
  }
  // b) Väggen bakom skyltraden: tre rader som tätnar bakgrunden uppåt på skärmen.
  [[-7.5, 1.3], [-13, 1.5], [-19, 1.6]].forEach(([down, scale], row) => {
    for (let right = -58 + (row % 2) * 1.9; right < 58; right += 3.7) {
      const spot = hubPoint(right + (Math.random() - 0.5) * 1.6, down + (Math.random() - 0.5) * 2.2);
      if (row === 0 && ((right + 60) % 19) < 8) continue; // Luckor på minst 8 enheter i främsta raden, så att man kan köra bakom skyltarna.
      if (!fits(spot.x, spot.z, 5.5, 'wall')) continue;
      const tree = randomTree(spot.x, spot.z);
      tree.scale = scale * (0.85 + Math.random() * 0.3);
      tree.group = 'wall'; trees.push(tree);
    }
  });
  // c) Slumpade träd bara långt ute (mer än 46 från mitten), annars blir det kaos mellan föremålen.
  const middle = hubPoint(-2, 15);
  for (let i = 0; i < 360; i++) {
    const x = HUB_X + (Math.random() - 0.5) * GROUND_SIZE;
    const z = HUB_Z + (Math.random() - 0.5) * GROUND_SIZE;
    if (Math.hypot(x - middle.x, z - middle.z) < 46) continue;
    if (fits(x, z, 12, 'r' + i)) trees.push(Object.assign(randomTree(x, z), { group: 'r' + i }));
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
  treeMeshes = makeTrees(trees); // [stammar, kronor], sparas så att träden kan välta (buildHubCollision).
  worldGroup(hub).add(...treeMeshes);
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
    // Fontänen, kiosken, paviljongen, skulpturerna, stenarna, bänkarna och bäcken (hubprops.js).
    for (const prop of hubPropObstacles) room = Math.min(room, Math.hypot(x - prop.x, z - prop.z) - prop.radius * 0.9);
    for (const spot of hubGrassFree) room = Math.min(room, Math.hypot(x - spot.x, z - spot.z) - spot.radius); // Stenläggning, bäddar, regnträdgård.
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
    ...hubPropShadows, // Fontän, kiosk, paviljong, skulpturer och stenblock.
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

// Slag av hubprops-föremål som alltid är mjuka (hubprops.js kan sätta entry.kind eller entry.soft).
const SOFT_PROP_KINDS = new Set(['hedge', 'rock', 'lily', 'decor', 'flower', 'bush', 'cup', 'planter']);
// Låga saker som hubprops ännu inte märkt: häckarna (radie exakt 0.85) och stenklungorna (enstaka
// cirkel 1.1-1.6 långt från dammen och utan grannar; kiosk, tehus, pelare och damm har grannar eller andra mått).
function isLowProp(prop) {
  if (prop.radius === 0.85) return true;
  if (prop.radius < 1.1 || prop.radius > 1.6) return false;
  if (distanceToWater(prop.x, prop.z) < 8) return false;
  return !hubPropObstacles.some((other) => other !== prop && Math.hypot(other.x - prop.x, other.z - prop.z) < prop.radius + other.radius + 1.2);
}
function isSoftProp(prop) {
  if (prop.soft === true) return true;
  if (prop.soft === false) return false;
  if (prop.kind) return SOFT_PROP_KINDS.has(prop.kind); // Annat uttryckligt slag (fountain, pond ...): fast.
  return prop.radius <= 0.55 || isLowProp(prop);
}

// Fasta saker som bilen krockar med (se collision.js): träd, lyktor, vägskyltarnas stolpar,
// skyltarnas stolpar, grottornas berg samt garaget och stugan. Cirklar { x, z, radius }.
// Vägar, parkeringsfickor, grottdörrar, garagets port, gräs, löv och stenar blockerar inte.
export function buildHubCollision({ roads = [], lamps, signposts, trees = [] }) {
  const obstacles = [];
  // En plats inne i en grupp som står på (origin) och är vriden angle runt Y, räknad till världen.
  // Samma matte som towardCamera/toTheRight: lokal +x = (cos, -sin), lokal +z = (sin, cos).
  function placed(origin, angle, x, z) {
    return {
      x: origin.x + Math.cos(angle) * x + Math.sin(angle) * z,
      z: origin.z - Math.sin(angle) * x + Math.cos(angle) * z,
    };
  }
  function add(spot, radius, extra) {
    obstacles.push({ x: spot.x, z: spot.z, radius, ...extra });
  }
  // Mjukt hinder: bilen kör igenom och föremålet reagerar (se collision.js, knockables.js).
  // once = välter och ligger kvar; annars gungar det och kan träffas igen.
  function soft(spot, radius, kind, onHit, once) {
    add(spot, radius, { soft: true, kind, onHit, once });
  }

  trees.forEach((tree, i) => {
    const radius = 0.3 * tree.scale; // Bara stammen (lite mindre än den syns, det förlåter); kronan är högt över bilen.
    if (!TREES_DRIVEABLE || !treeMeshes) return add(tree, radius);
    const [trunks, crowns] = treeMeshes;
    const parts = [{ mesh: trunks, index: i }];
    for (let j = 0; j < 3; j++) parts.push({ mesh: crowns, index: i * 3 + j }); // 3 kronbollar per träd (trees.js).
    soft(tree, radius, 'tree', knockableInstances(tree, parts, null, 1.3), true);
  });
  for (const lamp of lamps) soft(lamp.at, 0.3, 'lamp', lamp.knock, true);
  // Vägskyltarna: bara stolpen. Brädan sitter över bilens tak.
  for (const sign of signposts) soft(placed(sign.at, BILLBOARD_FACING, 0, -0.14), 0.25, 'signpost', sign.knock, true);

  // Biodukarna: två stolpar (x = +-3, se DISPLAYS.cinema), mobilskyltarna står direkt på marken.
  for (const project of PROJECTS) {
    if (project.world !== hub) continue;
    if (project.phone) {
      for (const x of [-1.4, 0, 1.4]) add(placed(project, BILLBOARD_FACING, x, -0.2), 0.45);
    } else {
      // Biostolparna är mjuka: skärmen gungar till när bilen kör genom en stolpe.
      const entry = billboards.find((billboard) => billboard.project === project);
      const wobble = entry ? wobbler(entry.panel) : null;
      for (const x of [-3, 3]) soft(placed(project, BILLBOARD_FACING, x, -0.16), 0.3, 'billboard', wobble, false);
    }
  }

  // Grottorna: berget bakom öppningen och stenarna på var sida (grottans lokala +z = uppåt på
  // skärmen, ut ur öppningen). Mitten framför öppningen (|x| < ca 1.7) lämnas fri ända fram till
  // dörren, annars går det inte att köra in. [x, z, radie] i grottans egna mått (ur CAVE_ROCKS).
  const CAVE_BLOCKS = [
    [0, -5.2, 3.2], [-3, -4.6, 1.7], [3, -4.6, 1.7], [0, -8.2, 2.0],  // Det stora berget.
    [-3.9, -1, 1.4], [3.9, -1, 1.4],                                  // Öppningens sidor.
    [-3.1, 0.4, 0.65], [3.1, 0.5, 0.65],                              // Hörnstenarna.
    [-5.4, 0.6, 0.45], [5.3, 0.9, 0.4],                               // Småstenarna framför.
  ];
  for (const portal of hubPortalsOf()) {
    for (const [x, z, radius] of CAVE_BLOCKS) add(placed(portal.at, BILLBOARD_FACING + Math.PI, x, z), radius);
  }

  // Garaget (hemgruppens mått): bakväggen och sidorna, men inte fronten: porten och bilplatsen
  // framför är fria. Stugan är en helt fast ruta (cirklar i rutnät). Brevlådan: en stolpe.
  for (let x = -2.4; x <= 2.41; x += 0.8) add(homePoint(x, -1.4), 0.45);
  for (const side of [-2.55, 2.55]) {
    for (let z = -1.4; z <= 1.51; z += 0.8) add(homePoint(side, z), 0.45);
  }
  const HALF = CABIN_SIZE / 2 - 0.65; // Cirklarnas mittpunkter ligger lite innanför väggen.
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      add(homePoint(CABIN_X - HALF + (i / 4) * HALF * 2, CABIN_Z - HALF + (j / 4) * HALF * 2), 0.6);
    }
  }
  for (const z of [-1.8, -1.1, -0.4]) add(homePoint(CABIN_X + 3.0, CABIN_Z + z), 0.5); // Vedboden på stugans högra sida.
  // Brevlådan är mjuk: den välter åt det håll bilen kör (knockableObject räknar i hemgruppens egna led).
  const knockMailbox = knockableObject(mailbox);
  soft(homePoint(3.9, ROAD_DISTANCE - 3.9), 0.45, 'mailbox', (dirX, dirZ, strength) => {
    const cos = Math.cos(BILLBOARD_FACING);
    const sin = Math.sin(BILLBOARD_FACING);
    knockMailbox(cos * dirX - sin * dirZ, sin * dirX + cos * dirZ, strength); // Värld → hemgruppens led (omvänd placed).
  }, true);
  // Tekopparna är mjuka: koppar på marken krossas (entry.smash, home.js) och ligger kvar; bordet gungar bara till.
  for (const entry of teaCups) {
    if (entry.smash) soft(homePoint(entry.x, entry.z), entry.radius, 'teacup', entry.smash, true);
    else soft(homePoint(entry.x, entry.z), entry.radius, 'teacup', wobbler(entry.cup), false);
  }

  // Allt som level design lagt till (fontän, pelare, damm, bro, kiosk, tehus, häckar, stenar): hubprops.js.
  // Mjukt: entry.soft === true, entry.kind i SOFT_PROP_KINDS, en liten prydnad (radie <= 0.55) eller en
  // låg sak som hubprops inte märkt (isLowProp). entry.soft === false tvingar fast.
  for (const prop of hubPropObstacles) {
    if (isSoftProp(prop)) add(prop, prop.radius, { soft: true, kind: prop.kind || 'decor', onHit: prop.onHit, once: prop.once });
    else add(prop, prop.radius);
  }

  // Varning i konsolen om en fast cirkel ligger på en väg (borde aldrig hända): då kan bilen fastna.
  for (const obstacle of obstacles) {
    if (obstacle.soft) continue;
    if (roads.some((road) => distanceToRoad(obstacle.x, obstacle.z, road) < (road.width || ROAD_WIDTH) / 2 - 0.2)) {
      console.warn('Fast hinder på en väg:', obstacle);
    }
  }

  addObstacles(obstacles);
  return obstacles;
}

function hubPortalsOf() {
  return PORTALS.filter((portal) => portal.world === hub && portal.style === 'cave');
}
