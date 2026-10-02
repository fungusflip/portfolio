// ============================================================================
// main.js — startar allt: laddningsscenen, bygger hemvärlden steg för steg och
// kör sedan spelets renderloop.
// ============================================================================
// Filerna och vad de gör:
//   core.js          – renderer, scen, kamera, färger, ljus, världarna, hjälpfunktioner
//   ui.js            – tangentbord/touch, guiden, infopanelen, startskärmen
//   loading-scene.js – den lilla 3D-scenen som syns medan världen byggs
//   car.js           – bilen och körningen
//   billboards.js    – projekten och skyltarna (ÄNDRA projektlistan där)
//   roads.js, lamps.js, signposts.js, trees.js – byggklossar som alla världar använder
//   home.js          – garaget, stugan, brevlådan
//   hub.js           – bygger hemvärlden
//   portals.js       – grottor, teleportplattor, resor (och laddar de andra världarna)
//   worlds/*.js      – Tech Art, Programming och Art; hämtas först när man reser dit
//   leaves.js        – löv och vind
//   optimize.js      – gör världarna lättare att rita och förbereder dem
//   perf.js          – automatisk kvalitet och FPS-mätaren (tryck F)
//
// "import ... from" längst upp körs INNAN något annat i filen. Därför hämtas här bara
// det laddningsscenen behöver. Resten hämtas med await import(...) längre ner, en bit
// i taget, så att laddningsscenen syns direkt och mätaren kan röra sig mellan bitarna.
import * as THREE from 'three';
import {
  renderer, scene, camera, cameraOffset, cameraLead, keyLight, SUN_DIRECTION, SUN_DISTANCE,
  WORLDS, currentWorld, towardCamera, toTheRight,
} from './core.js';
import { introOpen, setLoadingProgress, setReady, setFade } from './ui.js';
import { renderLoadingScene, disposeLoadingScene } from './loading-scene.js';
// Projektlistan fungerar direkt, även under laddningen (den behöver bara projektdatan).
import { setWorldJumper } from './project-list.js';
import { startFromCode } from './ui.js';

// ---------------------------------------------------------------------------
// 1. LADDNINGSSCENEN – börjar rulla direkt
// ---------------------------------------------------------------------------
const timer = new THREE.Timer(); // Mäter tiden mellan bilderna.
renderer.setAnimationLoop((time) => {
  timer.update(time);
  renderLoadingScene(Math.min(timer.getDelta(), 0.1));
});

// Visar hur långt laddningen kommit och låter webbläsaren rita en bild innan nästa
// tunga steg (annars hinner varken mätaren eller laddningsscenen uppdateras).
async function step(fraction, text) {
  setLoadingProgress(fraction, text);
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// ---------------------------------------------------------------------------
// 2. BYGG HEMVÄRLDEN – en bit i taget
// ---------------------------------------------------------------------------
await step(0.1, 'Starting the engine');
const { car, beam, HEADLIGHT_STRENGTH, startAutoDrive, updateCar } = await import('./car.js');
const { billboards, padTextureActive, updateBillboards } = await import('./billboards.js');
await step(0.2, 'Building the garage');
const { HOME_X, HOME_Z, GARAGE_Z, home, garageDoor, updateHome } = await import('./home.js');
await step(0.3, 'Painting the ground');
const hub = await import('./hub.js'); // Hämtar också grottorna, löven och optimeringen.
hub.buildHubGround();
await step(0.4, 'Putting up the billboards');
hub.buildHubBillboards();
await step(0.5, 'Paving the roads');
const roadsAndLamps = hub.buildHubRoads();
await step(0.6, 'Planting trees');
hub.buildHubTrees(roadsAndLamps);
// OBS: portals.travel läses som portals.travel varje gång (inte "const { travel } = ..."),
// för då skulle vi bara få värdet det hade just nu – och det ändras när en resa startar.
const portals = await import('./portals.js');
const { fallingLeaves, fallingLeafMaterial, moteMaterial, updateLeaves } = await import('./leaves.js');
const { optimizeWorld, prepareWorld, setShadows } = await import('./optimize.js');
const { updateLamps } = await import('./lamps.js');
const perf = await import('./perf.js');

await step(0.7, 'Tidying up the town');
// Starta på kvalitetsnivån från förra besöket – före förberedelsen, eftersom skuggornas
// inställningar påverkar hur grafikkortets program ser ut.
perf.applySavedQuality();
optimizeWorld(WORLDS.hub);
setShadows(car); // Bilen kastar och tar emot skuggor.

await step(0.75, 'Warming up the shaders');
// Förbered allt i förväg, så att ingenting behöver kompileras eller laddas upp medan man kör.
// (De tända skyltarnas texturer syns inte än men byts in senare.)
const activeTextures = [padTextureActive, ...billboards.map((billboard) => billboard.titleTextureActive)];
await prepareWorld(WORLDS.hub, activeTextures, (fraction) => setLoadingProgress(0.8 + fraction * 0.15, 'Unpacking textures'));
// Gnistornas material (de andra världarna) förbereds också nu.
fallingLeaves.material = moteMaterial;
await renderer.compileAsync(scene, camera);
fallingLeaves.material = fallingLeafMaterial;

// ---------------------------------------------------------------------------
// 3. KLART – byt från laddningsscenen till spelet
// ---------------------------------------------------------------------------
// Bilen står inne i garaget med nosen in och porten öppen, så att man ser baklysena.
const carStart = towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z);
car.position.set(carStart.x, 0, carStart.z);
garageDoor.visible = false;

// Tona till bakgrundsfärgen, byt scen bakom toningen och tona tillbaka.
await step(1, 'Ready');
const FADE_TIME = 400; // Millisekunder.
const fadeStart = performance.now();
await new Promise((resolve) => {
  function fade() {
    const amount = Math.min(1, (performance.now() - fadeStart) / FADE_TIME);
    setFade(amount, WORLDS.hub.background);
    if (amount < 1) requestAnimationFrame(fade);
    else resolve();
  }
  fade();
});
disposeLoadingScene();
renderer.setAnimationLoop(gameFrame); // Från och med nu ritas spelet.
const fadeBack = performance.now();
(function unfade() {
  const amount = 1 - Math.min(1, (performance.now() - fadeBack) / FADE_TIME);
  setFade(amount);
  if (amount > 0) requestAnimationFrame(unfade);
})();

// Startknappen blir klickbar. När besökaren trycker backar bilen ut ur garaget av sig
// själv; framme stängs porten och strålkastarna tänds.
// Leder adressen till en viss värld (t.ex. .../#art) åker bilen i stället direkt dit.
const INTRO_SPEED = 4;
let jumpTarget = WORLDS[location.hash.slice(1)] || WORLDS[new URLSearchParams(location.search).get('goto')] || null;
if (jumpTarget === WORLDS.hub) jumpTarget = null; // #hub = vanlig start.
function carReady() {
  garageDoor.visible = true;
  beam.intensity = HEADLIGHT_STRENGTH;
}
setReady(() => {
  if (jumpTarget) {
    carReady();
    portals.jumpTo(jumpTarget);
    jumpTarget = null;
  } else {
    startAutoDrive({ x: home.padX, z: home.padZ }, true, INTRO_SPEED, carReady);
  }
}, jumpTarget ? `Start in ${jumpTarget.title}` : 'Start driving');

// TEST: ?autostart i adressen trycker på startknappen av sig själv (t.ex. ?autostart#art).
if (new URLSearchParams(location.search).has('autostart')) startFromCode();

// "Visit in 3D" i projektlistan: starta spelet om det inte redan är igång, och hoppa till världen.
setWorldJumper((world) => {
  if (world === WORLDS.hub) jumpTarget = null;
  else jumpTarget = world;
  if (!startFromCode()) {   // Spelet var redan igång: hoppa direkt.
    jumpTarget = null;
    portals.jumpTo(world);
  }
});

// ---------------------------------------------------------------------------
// KAMERAN
// ---------------------------------------------------------------------------
// På en smal skärm (mobil på höjden) flyttas kameran längre bort så att världen ryms.
let cameraZoom = 1;
function updateCameraZoom() {
  cameraZoom = THREE.MathUtils.clamp(1.6 / (window.innerWidth / window.innerHeight), 1, 2.2);
}
updateCameraZoom();
window.addEventListener('resize', () => {
  updateCameraZoom();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Startskärmen: siktpunkten flyttas så att bilen syns BREDVID texten (dator: till höger,
// mobil: under). När spelet startat glider förskjutningen mjukt till 0.
let introShift = 1;
const INTRO_SHIFT_SIDE = 9;
const INTRO_SHIFT_UP = 7;
function introCameraShift() {
  const origin = { x: 0, z: 0 };
  return window.innerWidth <= 600
    ? towardCamera(origin, -INTRO_SHIFT_UP * introShift)
    : toTheRight(origin, -INTRO_SHIFT_SIDE * introShift);
}

// Kameran tittar FRAMÅT dit bilen kör: siktpunkten flyttas en bit i bilens färdriktning,
// längre ju fortare den kör. Då ser man vart man är på väg även när man kör nedåt på
// skärmen (förut tittade kameran alltid lika mycket uppåt, så bilen hamnade i nederkanten).
// Farten räknas ut från hur långt bilen flyttat sig, så det fungerar även med autopiloten.
const LOOK_AHEAD = 0.3;     // Sekunder framåt kameran "tittar": 0.3 s × toppfart 12 = ca 3.6 enheter. ÄNDRA för mer/mindre. (Var 0.6 – kändes för mycket.)
const LOOK_AHEAD_MAX = 4;   // Aldrig längre än så här, i enheter.
const LOOK_SMOOTHING = 1.2; // Hur mjukt kameran glider dit (mindre = mjukare och långsammare).
const lookAhead = new THREE.Vector3();       // Hur långt framför bilen kameran tittar just nu.
const lookAheadGoal = new THREE.Vector3();   // Dit den är på väg.
const lastCarPosition = new THREE.Vector3().copy(car.position);
function updateLookAhead(delta) {
  lookAheadGoal.subVectors(car.position, lastCarPosition); // Hur långt bilen flyttat sig den här bilden.
  lookAheadGoal.y = 0;
  // Ett hopp på mer än 2 enheter är en resa till en annan värld, inte körning.
  if (delta > 0 && lookAheadGoal.length() < 2) lookAheadGoal.multiplyScalar(LOOK_AHEAD / delta); // Fart × tid.
  else lookAheadGoal.set(0, 0, 0);
  lookAheadGoal.clampLength(0, LOOK_AHEAD_MAX);
  lastCarPosition.copy(car.position);
  // damp för x och z var för sig: glid mjukt mot målet i stället för att hoppa.
  lookAhead.x = THREE.MathUtils.damp(lookAhead.x, lookAheadGoal.x, LOOK_SMOOTHING, delta);
  lookAhead.z = THREE.MathUtils.damp(lookAhead.z, lookAheadGoal.z, LOOK_SMOOTHING, delta);
}

// ---------------------------------------------------------------------------
// RENDERLOOPEN – hjärtat i programmet. Körs en gång per skärmuppdatering.
// ---------------------------------------------------------------------------
const cameraTarget = new THREE.Vector3(); // Återanvänds varje bild (nya objekt blir skräp att städa).
function gameFrame(time) {
  if (perf.skipFrame(time)) return; // 30-låset (se perf.js).
  const frameStart = performance.now();
  timer.update(time);
  // Sekunder sedan förra bilden. Taket på 0.1: om fliken legat i bakgrunden ska bilen
  // inte göra ett jättehopp efteråt.
  const rawDelta = timer.getDelta();
  const delta = Math.min(rawDelta, 0.1);
  perf.checkHitch(rawDelta);
  renderer.info.reset(); // Börja räkna ritanropen för den här bilden från 0.

  updateCar(delta, portals.travel !== null);
  portals.updateTravel(delta);
  updateBillboards(delta, car.position);
  if (currentWorld === WORLDS.hub) updateHome(car.position);
  portals.updateWorldExtras(delta);
  updateLamps(delta);
  perf.updateQuality(rawDelta);
  const afterGame = performance.now();

  // Kameran följer bilen: siktpunkten = bilen + försprånget, kameran = siktpunkten + avståndet.
  updateLookAhead(delta);
  const target = cameraTarget.copy(car.position).add(cameraLead).add(lookAhead);
  if (!introOpen) introShift = THREE.MathUtils.damp(introShift, 0, 2.5, delta);
  if (introShift > 0.001) {
    const shift = introCameraShift();
    target.x += shift.x;
    target.z += shift.z;
  }
  camera.position.copy(target).addScaledVector(cameraOffset, cameraZoom);
  camera.lookAt(target);
  updateLeaves(delta, target); // Löven hålls i en låda runt samma punkt.
  const afterLeaves = performance.now();

  // Solen (och rutan där skuggor räknas ut) följer med bilen.
  keyLight.position.copy(target).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
  keyLight.target.position.copy(target);

  const gpuQuery = perf.startGpuTimer();
  renderer.render(scene, camera);
  const afterRender = performance.now();
  // Teleportplattornas levande bilder ritas efteråt, när skuggorna redan är uträknade.
  portals.updatePortals(delta);
  perf.endGpuTimer(gpuQuery);
  const afterPreviews = performance.now();

  perf.recordFrame({
    game: afterGame - frameStart,
    leaves: afterLeaves - afterGame,
    render: afterRender - afterLeaves,
    previews: afterPreviews - afterRender,
  }, afterPreviews - frameStart);
  perf.updateStats(rawDelta);
}
