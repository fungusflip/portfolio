// ============================================================================
// portals.js — ingångarna mellan världarna (grottor hemma, teleportplattor i de
// andra världarna) och själva resan. Här laddas också de andra världarna: en
// värld byggs först när man reser dit första gången.
// ============================================================================
import * as THREE from 'three';
import {
  renderer, scene, PALETTE, WORLDS, BILLBOARD_FACING, SCREEN_WIDTH, SIGN_HEIGHT, SCREEN_TILT,
  cameraOffset, cameraLead, currentWorld, setCurrentWorld, showWorld, worldGroup,
  towardCamera, note, postMaterial, makeTitleTexture,
} from './core.js';
import { keys, panelOpen, closePanel, setFade } from './ui.js';
import { car, speed, stopCar, setHeading, autoDrive, startAutoDrive, cancelAutoDrive } from './car.js';
import { hubPoint } from './home.js';
import { setWeather } from './leaves.js';
import { optimizeWorld, prepareWorld, markMoving } from './optimize.js';
import { makeSwirl } from './magic.js';

// ---------------------------------------------------------------------------
// INGÅNGARNA
// ---------------------------------------------------------------------------
// Hemma är ingången till en värld en GROTTA som vetter UPPÅT på skärmen (bort från kameran):
// vägen går ner till öppningen ovanifrån, bilen kör in nedåt och göms av berget. När man
// kommer tillbaka kör bilen ut ur grottan FRAMÅT, med nosen uppåt. I den andra världen kommer
// man upp ur en TELEPORTPLATTA på marken, också med nosen uppåt på skärmen.
//   world   – världen ingången står i.
//   leadsTo – världen den leder till.
//   style   – 'cave' (grotta) eller 'pad' (teleportplatta).
//   at      – grottöppningens/plattans mitt, { x, z }.
export const PORTALS = [
  // Alla tre grottor ligger NEDANFÖR huvudvägen på en rad, med öppningen uppåt mot vägen.
  // Tech Art: längst till höger, en bit bortom den sista skylten.
  { world: WORLDS.hub, leadsTo: WORLDS.techart, style: 'cave', at: hubPoint(42, 28) },
  // Programming: mitt under skyltraden.
  { world: WORLDS.hub, leadsTo: WORLDS.prog, style: 'cave', at: hubPoint(0, 28) },
  // Art: bredvid Programming-grottan, längre åt vänster.
  { world: WORLDS.hub, leadsTo: WORLDS.art, style: 'cave', at: hubPoint(-24, 28) },
  // I de andra världarna ligger plattan hem 8 enheter "nedåt på skärmen" från mitten.
  { world: WORLDS.techart, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(WORLDS.techart, 8) },
  { world: WORLDS.prog, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(WORLDS.prog, 8) },
  { world: WORLDS.art, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(WORLDS.art, 8) },
];
export const [techartCave, progCave, artCave] = PORTALS; // De tre första: grottorna hemma.
// Hur långt åt höger (från skyltradens mitt) varje grotta ligger. Vägarna ner till dem utgår
// från huvudvägen på samma sida.
techartCave.right = 42;
progCave.right = 0;
artCave.right = -24;
// Punkterna bilen kör mellan. För en grotta räknas de från öppningen: öppningen vetter uppåt,
// så "framför" den är uppåt på skärmen och berget ligger nedåt (mot kameran).
for (const portal of PORTALS) {
  if (portal.style === 'cave') {
    portal.door = towardCamera(portal.at, -1.5);   // Precis ovanför öppningen. Kör bilen hit startar resan.
    portal.inside = towardCamera(portal.at, 3.5);  // Inne i berget, där bilen är gömd.
    portal.outside = towardCamera(portal.at, -8);  // Där bilen stannar när den har kört ut (framåt, uppåt).
    portal.center = towardCamera(portal.at, 4.5);  // Bergets mitt (för att hålla träd och gräs borta).
  } else {
    portal.door = portal.at;    // Kör upp på mitten av plattan så startar resan.
    portal.outside = portal.at; // Bilen stiger upp mitt på plattan.
    portal.center = portal.at;
  }
}
// Ingången i den andra världen som man kommer ut ur.
for (const portal of PORTALS) {
  portal.exit = PORTALS.find((p) => p.world === portal.leadsTo && p.leadsTo === portal.world);
}
// Ingången i en viss värld (en platta per annan värld).
export function padIn(world) {
  return PORTALS.find((portal) => portal.world === world && portal.style === 'pad');
}

// Bygger en ingång i en grupp. Inne i gruppen gäller för en grotta (som vetter uppåt på skärmen):
//   +x = höger på skärmen, +y = upp, +z = uppåt på skärmen (ut ur öppningen), -z = in i berget
//   (nedåt på skärmen, mot kameran). En platta vetter mot kameran: +z = mot kameran.
export function buildPortal(portal) {
  const group = new THREE.Group();
  if (portal.style === 'cave') buildCave(portal, group);
  else buildPad(portal, group);
  group.position.set(portal.at.x, 0, portal.at.z);
  // En grotta vänds ett halvt varv så att öppningen vetter bort från kameran.
  group.rotation.y = BILLBOARD_FACING + (portal.style === 'cave' ? Math.PI : 0);
  worldGroup(portal.world).add(group);
}

// --- Grottan ---
// Ett berg av kantiga stenar runt en mörk valvöppning. När bilen kört förbi öppningen
// ligger den inuti det stora berget, så kameran ser den inte längre.
const rockMaterials = [
  new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: PALETTE.rockDark, roughness: 1, flatShading: true }),
];
const rockGeometry = new THREE.IcosahedronGeometry(1, 1); // Varje sten är samma form, utdragen olika mycket.
// Varje sten: [x, y, z, bredd, höjd, djup (radier), material (0 = ljus, 1 = mörk)].
const CAVE_ROCKS = [
  [0, 1.5, -5, 4.8, 4.5, 4, 0],        // Det stora berget bakom öppningen. Bilen göms inuti det.
  [-3.7, 1.2, -1, 2, 2.4, 2, 1],       // Vänster sida av öppningen.
  [3.7, 1, -1, 2, 2.1, 2, 0],          // Höger sida.
  [0, 4.2, -0.8, 3, 1.4, 2, 1],        // Stenen över öppningen.
  [-2.6, 3.6, -3.2, 2.2, 2, 2.2, 0],   // Toppar ovanpå berget.
  [2.8, 3.2, -3.6, 2, 2.3, 2, 1],
  [-5.4, 0.4, 0.6, 0.9, 0.7, 0.9, 0],  // Småsten framför.
  [5.2, 0.3, 0.9, 0.7, 0.5, 0.7, 1],
  // Stenar som täcker portalens hörn: nere vid marken på båda sidor, och "axlarna" där valvet börjar.
  [-2.9, 0.4, 0.4, 1.2, 1.0, 1.1, 1],
  [3.0, 0.35, 0.5, 1.1, 0.9, 1.0, 0],
  [-2.7, 3.3, -0.2, 1.5, 1.3, 1.4, 0],
  [2.8, 3.1, -0.3, 1.4, 1.4, 1.3, 1],
];
const CAVE_MOUTH_WIDTH = 4.4;
// Hur djupt in i berget portalen sitter (minus = inåt) och hur mycket större än hålet den är.
// Stenarna runt öppningen når fram till ungefär z = 1, så kanterna göms bakom dem.
const PORTAL_DEPTH = -0.8;
const PORTAL_SCALE = 1.45;
const CAVE_MOUTH_HEIGHT = 3.4;
const caveMouthMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.caveMouth });
// Öppningens form: rakt upp, en halvcirkel över, rakt ner (en Shape ritas som med en penna).
const mouthShape = new THREE.Shape();
const archRadius = CAVE_MOUTH_WIDTH / 2;
const archCenterY = CAVE_MOUTH_HEIGHT - archRadius;
mouthShape.moveTo(-archRadius, 0);
mouthShape.lineTo(-archRadius, archCenterY);
mouthShape.absarc(0, archCenterY, archRadius, Math.PI, 0, true); // Över toppen, medsols.
mouthShape.lineTo(archRadius, 0);
const mouthGeometry = new THREE.ShapeGeometry(mouthShape, 24);

// Ljuset längst in i grottan: en mjuk fläck i färgen på världen grottan leder till.
function makeCaveLightTexture(color) {
  const image = document.createElement('canvas');
  image.width = 128;
  image.height = 128;
  const pen = image.getContext('2d');
  const glow = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, color + 'e0');
  glow.addColorStop(0.4, color + '60');
  glow.addColorStop(1, color + '00');
  pen.fillStyle = glow;
  pen.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildCave(portal, group) {
  for (const [x, y, z, width, height, depth, materialIndex] of CAVE_ROCKS) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterials[materialIndex]);
    rock.position.set(x, y, z);
    rock.scale.set(width, height, depth);
    group.add(rock);
  }
  // Öppningen, ljuset och virveln sitter en bit INNE i berget (PORTAL_DEPTH) och är större
  // än hålet. Då skymmer stenarna runt öppningen deras kanter, och det ser ut som att
  // virveln fyller grottan i stället för att vara en skiva som sitter framför den.
  const mouth = new THREE.Mesh(mouthGeometry, caveMouthMaterial);
  mouth.scale.setScalar(PORTAL_SCALE);
  mouth.position.z = PORTAL_DEPTH - 0.1;
  group.add(mouth);
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.8),
    new THREE.MeshBasicMaterial({ map: makeCaveLightTexture(portal.leadsTo.accent), transparent: true, depthWrite: false })
  );
  light.scale.setScalar(PORTAL_SCALE);
  light.position.set(0, 1.5, PORTAL_DEPTH - 0.05); // En aning framför den mörka öppningen, annars flimrar de.
  group.add(light);
  // Virveln: en snurrande spiral i världens färg, lite framför ljuset (se magic.js).
  const swirl = makeSwirl(mouthGeometry, { x: 0, y: 1.5 }, portal.leadsTo.accent);
  swirl.scale.setScalar(PORTAL_SCALE);
  swirl.position.z = PORTAL_DEPTH;
  group.add(swirl);
  // Öppningen vetter bort från kameran och syns inte, så namnskylten står på två stolpar framför
  // berget på kamerasidan (som skylten vid teleportplattorna), vänd mot kameran.
  const signHolder = new THREE.Group();
  signHolder.position.z = -10.4; // Berget når till ca z = -9 bakåt.
  signHolder.rotation.y = Math.PI; // Vänd mot kameran.
  group.add(signHolder);
  for (const x of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), postMaterial);
    post.position.set(x, 0.7, -0.15);
    signHolder.add(post);
  }
  addEntranceSign(portal, signHolder, 1.2, 0);
}

// Namnskylten vid en ingång: världen den leder till, med tänd text.
// y, z = var skyltens underkant sitter i gruppen. x = sidled (utelämnat = mitten).
function addEntranceSign(portal, group, y, z, x = 0) {
  const ENTRANCE_SIGN_WIDTH = 6;
  const height = SIGN_HEIGHT * (ENTRANCE_SIGN_WIDTH / SCREEN_WIDTH);
  const board = new THREE.Group();
  board.position.set(x, y, z);
  board.rotation.x = -SCREEN_TILT;
  group.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE_SIGN_WIDTH + 0.3, height + 0.3, 0.2), postMaterial);
  frame.position.set(0, height / 2 + 0.15, -0.11);
  board.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(ENTRANCE_SIGN_WIDTH, height), new THREE.MeshBasicMaterial({ map: makeTitleTexture(portal.leadsTo.title, true) }));
  face.position.set(0, height / 2 + 0.15, 0);
  board.add(face);
}

// --- Teleportplattan ---
// En lysande ring platt på marken, med en LEVANDE bild av hemvärlden i mitten – som
// att titta ner genom ett hål. Bilden kommer från en andra kamera som ritar till en
// "render target" (en osynlig bild) i stället för till skärmen.
const PAD_RADIUS_SIZE = 3;       // Plattans radie.
const PAD_RING_THICKNESS = 0.25; // Ringens tjocklek.
const PAD_BEAM_HEIGHT = 4;       // Hur högt ljuspelaren når.
const PREVIEW_PIXELS = 256;      // Bildens storlek i pixlar. Större = skarpare men tyngre.
const PREVIEW_RADIUS = 16;       // Bilden uppdateras bara när bilen är så här nära plattan.
const PREVIEW_TIME = 1 / 10;     // Och då högst 10 gånger per sekund (varje gång ritas hela scenen en gång till).
const previewCamera = new THREE.PerspectiveCamera(30, 1, 5, 400); // Kvadratisk, eftersom skivan är rund.

function buildPad(portal, group) {
  portal.renderTarget = new THREE.WebGLRenderTarget(PREVIEW_PIXELS, PREVIEW_PIXELS);
  portal.previewWait = 0;
  portal.previewDrawn = false;
  // Skivan med den levande bilden: ett "lager på marken" som inte skriver något djup,
  // så att bilen fortfarande skyms av MARKEN när den sjunker ner – den åker ner i hålet.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(PAD_RADIUS_SIZE, 64),
    new THREE.MeshBasicMaterial({ map: portal.renderTarget.texture, depthTest: false, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  disc.renderOrder = -5;
  group.add(disc);
  // Ringen: en "munk" (TorusGeometry) som ligger ner. MeshBasicMaterial = ser ut att lysa.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(PAD_RADIUS_SIZE, PAD_RING_THICKNESS, 12, 64), new THREE.MeshBasicMaterial({ color: portal.world.accent }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  // Ljuspelaren: ett genomskinligt rör utan lock som "lägger till" ljus.
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(PAD_RADIUS_SIZE, PAD_RADIUS_SIZE, PAD_BEAM_HEIGHT, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color: portal.world.accent, transparent: true, opacity: 0.15, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })
  );
  pillar.position.y = PAD_BEAM_HEIGHT / 2;
  group.add(pillar);
  // Gnistor: små lysande lådor i en cirkel. Hela gruppen snurrar (se updatePortals).
  portal.sparks = new THREE.Group();
  portal.sparks.position.y = 0.6;
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), sparkMaterial);
    spark.position.set(Math.cos(angle) * (PAD_RADIUS_SIZE + 0.5), 0, Math.sin(angle) * (PAD_RADIUS_SIZE + 0.5));
    portal.sparks.add(spark);
  }
  group.add(portal.sparks);
  markMoving(portal.sparks); // Snurrar: får inte slås ihop eller frysas.
  // Namnskylten till vänster om plattan, på två stolpar.
  const signX = -(PAD_RADIUS_SIZE + 4.2);
  for (const x of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), postMaterial);
    post.position.set(signX + x, 0.7, -0.15);
    group.add(post);
  }
  addEntranceSign(portal, group, 1.2, 0, signX);
}

// Ritar den levande bilden på en teleportplatta: från där spelkameran kommer att stå
// när bilen kört ut på andra sidan.
const previewTarget = new THREE.Vector3();
function renderPortalPreview(portal) {
  const exit = portal.exit;
  previewTarget.set(exit.outside.x, 0, exit.outside.z).add(cameraLead);
  previewCamera.position.copy(previewTarget).add(cameraOffset);
  previewCamera.lookAt(previewTarget);
  scene.background.set(portal.leadsTo.background);
  // Skuggorna räknas inte om för previewbilden (det skulle kosta en hel extra ritning).
  renderer.shadowMap.autoUpdate = false;
  showWorld(portal.leadsTo); // Bara en värld syns åt gången – visa tillfälligt den plattan leder till.
  note('portal preview');
  renderer.setRenderTarget(portal.renderTarget);
  renderer.render(scene, previewCamera);
  renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = true;
  scene.background.set(currentWorld.background);
  showWorld(currentWorld);
}

// Körs efter att bilden ritats: plattornas bilder och gnistor i världen bilen är i.
export function updatePortals(delta) {
  for (const portal of PORTALS) {
    if (portal.world !== currentWorld || !portal.renderTarget) continue;
    portal.sparks.rotation.y += 1.2 * delta;
    // Första gången direkt, sedan bara när bilen är nära och högst PREVIEW_TIME ofta.
    if (portal.previewDrawn && Math.hypot(car.position.x - portal.at.x, car.position.z - portal.at.z) > PREVIEW_RADIUS) continue;
    portal.previewWait -= delta;
    if (portal.previewDrawn && portal.previewWait > 0) continue;
    portal.previewWait = PREVIEW_TIME;
    portal.previewDrawn = true;
    renderPortalPreview(portal);
  }
}

// ---------------------------------------------------------------------------
// ATT LADDA EN VÄRLD (första gången man reser dit)
// ---------------------------------------------------------------------------
// Hemvärlden byggs när sidan laddas. De andra världarnas kod ligger i egna filer
// (worlds/techart.js osv., se WORLDS i core.js) och hämtas med import() först när
// man kör in i grottan dit. Det sker medan skärmen är helt tonad, så det syns inte.
// Varje världsfil har en build()-funktion och kan ha en update(delta) för det som rör sig.
const loadedWorlds = new Map(); // värld → världens fil (modul), när den är byggd.
const loadingWorlds = new Map(); // värld → pågående laddning (ett "löfte", Promise).

export function loadWorld(world) {
  if (!world.module || loadedWorlds.has(world)) return Promise.resolve();
  if (!loadingWorlds.has(world)) {
    // async-funktionen körs direkt och ger ett löfte om att bli klar.
    loadingWorlds.set(world, (async () => {
      note('world loading');
      const module = await import(world.module); // Hämta filen från servern.
      module.build();                             // Bygg världen.
      optimizeWorld(world);                       // Slå ihop och frys (se optimize.js).
      await prepareWorld(world);                  // Förbered shaders och texturer.
      loadedWorlds.set(world, module);
    })());
  }
  return loadingWorlds.get(world);
}

// Det som rör sig i den värld bilen är i (t.ex. testformerna i Tech Art).
export function updateWorldExtras(delta) {
  const module = loadedWorlds.get(currentWorld);
  if (module && module.update) module.update(delta);
}

// ---------------------------------------------------------------------------
// RESAN – i steg, som i en film
// ---------------------------------------------------------------------------
//   'in'      – bilen kör av sig själv in i grottan, eller upp på mitten av plattan.
//   'sink'    – (bara platta) bilen sjunker ner genom plattan.
//   'fadeOut' – bilden tonas till den nya världens färg.
//   'loading' – (bara första gången) världen byggs medan skärmen är täckt.
//   'fadeIn'  – toningen försvinner medan bilen kör ut ur grottan / stiger upp ur plattan.
const PORTAL_RADIUS = 3;  // Hur nära öppningen/plattans mitt bilen måste komma.
const PORTAL_SPEED = 7;   // Hur fort bilen kör in och ut.
const SINK_DEPTH = 2.5;   // Hur långt under marken bilen sjunker.
const SINK_SPEED = 3;     // Hur fort den sjunker och stiger.
const FADE_SPEED = 2.5;   // Hur fort toningen går: 2.5 = 0.4 sekunder.
export let travel = null; // Pågående resa: { portal, stage }. null = ingen resa.
let fadeAmount = 0;       // 0 = ingen toning, 1 = helt täckt.
// Plattan bilen nyss steg upp ur. Den fungerar igen först när bilen har kört av den.
let justArrivedOn = null;

function startTravel(portal) {
  travel = { portal, stage: 'in' };
  if (panelOpen) closePanel();
  keys.clear(); // Bilen kör själv nu.
  const backingIn = speed < 0; // Backade bilen in? Då backar den in hela vägen.
  stopCar();
  setFade(fadeAmount, portal.leadsTo.background);
  // Börja hämta världen redan nu, medan bilen kör in – då är den ofta klar när skärmen är täckt.
  loadWorld(portal.leadsTo);
  const target = portal.style === 'cave' ? portal.inside : portal.at;
  startAutoDrive(target, backingIn, PORTAL_SPEED, () => {
    travel.stage = portal.style === 'cave' ? 'fadeOut' : 'sink';
  });
}

// Hoppar direkt till en värld, utan att köra dit: skärmen tonas, världen laddas och bilen
// kommer fram som vanligt (kör ut ur grottan hemma, stiger upp ur plattan i de andra).
// Används av länkar som .../#art och av "Visit in 3D" i projektlistan.
export function jumpTo(world) {
  if (travel || world === currentWorld) return;
  // Var bilen ska komma ut: hemma ur grottan som leder till världen den kommer ifrån
  // (eller Tech Art-grottan), annars ur teleportplattan i den nya världen.
  const exit = world === WORLDS.hub
    ? PORTALS.find((p) => p.world === WORLDS.hub && p.leadsTo === currentWorld) || techartCave
    : padIn(world);
  if (panelOpen) closePanel();
  keys.clear();
  stopCar();
  cancelAutoDrive();
  // En påhittad "ingång" som bara säger vart resan går. Resan börjar direkt med toningen.
  travel = { portal: { leadsTo: world, exit }, stage: 'fadeOut' };
  setFade(fadeAmount, world.background);
  loadWorld(world);
}

// Reser till en värld direkt, genom ingången dit i världen bilen är i (används av
// test-adressen ?goto=art, se main.js).
export function travelTo(world) {
  const portal = PORTALS.find((p) => p.world === currentWorld && p.leadsTo === world);
  if (portal && !travel) startTravel(portal);
}

// Flyttar bilen till den nya världen. Körs när toningen är helt täckande och världen finns.
function arrive() {
  note('world switch');
  const exit = travel.portal.exit;
  console.log(`[travel] arrived in ${exit.world.title}`);
  setCurrentWorld(exit.world);
  setWeather(exit.world); // Löv hemma, gnistor i de andra världarna.
  // Nosen pekar "uppåt på skärmen" när man får styra själv, så att styrningen känns rätt.
  setHeading(BILLBOARD_FACING + Math.PI);
  travel.stage = 'fadeIn';
  if (exit.style === 'cave') {
    car.position.set(exit.inside.x, 0, exit.inside.z); // Inne i berget: kör ut framåt (nosen uppåt).
    startAutoDrive(exit.outside, false, PORTAL_SPEED);
  } else {
    car.position.set(exit.at.x, -SINK_DEPTH, exit.at.z); // Under plattan: stig upp.
    justArrivedOn = exit;
  }
}

function isAtDoor(portal, extra = 0) {
  return Math.hypot(car.position.x - portal.door.x, car.position.z - portal.door.z) < PORTAL_RADIUS + extra;
}

// Körs en gång per bild.
export function updateTravel(delta) {
  if (!travel) {
    if (justArrivedOn && !isAtDoor(justArrivedOn, 1)) justArrivedOn = null;
    if (autoDrive) return; // Inte medan bilen kör själv (t.ex. ut ur garaget).
    for (const portal of PORTALS) {
      if (portal.world !== currentWorld || portal === justArrivedOn) continue;
      if (isAtDoor(portal)) {
        startTravel(portal);
        break;
      }
    }
    return;
  }
  if (travel.stage === 'sink') {
    car.position.y = Math.max(-SINK_DEPTH, car.position.y - SINK_SPEED * delta);
    if (car.position.y === -SINK_DEPTH) travel.stage = 'fadeOut';
  } else if (travel.stage === 'fadeOut') {
    fadeAmount = Math.min(1, fadeAmount + FADE_SPEED * delta);
    if (fadeAmount === 1) {
      // Vänta på världen om den inte är klar än (första besöket). Skärmen är täckt under tiden.
      travel.stage = 'loading';
      const journey = travel;
      loadWorld(journey.portal.leadsTo).then(() => {
        if (travel === journey) arrive();
      });
    }
  } else if (travel.stage === 'fadeIn') {
    fadeAmount = Math.max(0, fadeAmount - FADE_SPEED * delta);
    car.position.y = Math.min(0, car.position.y + SINK_SPEED * delta); // Stig upp ur marken.
    if (fadeAmount === 0 && !autoDrive && car.position.y === 0) travel = null;
  }
  setFade(fadeAmount);
}
