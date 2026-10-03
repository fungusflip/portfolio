// ============================================================================
// core.js — grunden som nästan alla andra filer behöver: renderer, scen, kamera,
// färger, ljus, världarna och några små hjälpfunktioner.
//
// Grundidén i three.js är alltid samma tre saker:
//   1. en SCEN     (scene)    – en behållare med alla objekt och lampor
//   2. en KAMERA   (camera)   – varifrån vi tittar på scenen
//   3. en RENDERER (renderer) – ritar det kameran ser till en <canvas> i HTML
// Sedan ritar vi om bilden ~60 gånger per sekund och flyttar saker lite
// mellan varje bild. Det är det som blir rörelse.
//
// Koordinatsystemet: X = åt sidan, Y = uppåt, Z = framåt/bakåt.
// Enheterna är påhittade, men här tänker vi ungefär "1 enhet = 1 meter".
// Vinklar mäts i radianer: Math.PI = 180°, Math.PI / 2 = 90°.
//
// OM FILERNA: koden är uppdelad i flera filer ("moduler"). Varje fil säger själv vad
// den behöver från andra filer (import) och vad den lämnar ut (export). En fil som
// importerar ett värde får LÄSA det men inte ändra det – därför finns små "set"-
// funktioner (t.ex. setCurrentWorld) när en annan fil behöver ändra något här.
// ============================================================================

// Hämtar allt i three.js och samlar det under namnet THREE.
// 'three' är inget filnamn – webbläsaren slår upp det i import-kartan i index.html.
import * as THREE from 'three';

// Letar upp <canvas id="scene"> i index.html. '#scene' betyder "elementet med id scene".
const canvas = document.querySelector('#scene');

// ---------------------------------------------------------------------------
// RENDERER – pratar med grafikkortet (via WebGL) och ritar pixlarna.
// ---------------------------------------------------------------------------
// TEST: lägg till ?noaa i adressen (t.ex. .../index.html?noaa#stats) för att stänga av
// kantutjämningen. Den kan bara väljas när sidan startar, därför en adress i stället för en tangent.
// URLSearchParams läser det som står efter ? i adressen.
const NO_ANTIALIAS = new URLSearchParams(location.search).has('noaa');

// Kantutjämningen (antialias) görs av grafikkortet i ett extra steg när bilden lämnas
// över till webbläsaren. Det är dyrt på svaga grafikkretsar (t.ex. Intel i äldre laptops)
// och gör att bilderna kommer ojämnt. Den stängs därför av när:
//   - grafikkretsen är en känt svag sort (namnet innehåller t.ex. "Intel"), eller
//   - sidan fick sänka kvaliteten förra besöket (se quality.js).
// Kanterna blir lite taggigare, men allt flyter jämnare.
function isWeakGpu() {
  try {
    // En tillfällig, osynlig canvas bara för att fråga vad grafikkretsen heter.
    const test = document.createElement('canvas').getContext('webgl2');
    if (!test) return true;
    const info = test.getExtension('WEBGL_debug_renderer_info');
    const name = info ? test.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    test.getExtension('WEBGL_lose_context')?.loseContext(); // Släpp den direkt. ?. = bara om den finns.
    return /intel|swiftshader|llvmpipe|mali|adreno|powervr/i.test(name);
  } catch (error) {
    return false;
  }
}
export const QUALITY_STORAGE_KEY = 'portfolio-quality'; // Namnet i webbläsarens minne (localStorage), se quality.js.
let loweredLastVisit = false;
try {
  loweredLastVisit = Number(localStorage.getItem(QUALITY_STORAGE_KEY)) > 0;
} catch (error) {
  // localStorage spärrat (privat läge): räkna som att det inte fanns något sparat.
}
export const USE_ANTIALIAS = !NO_ANTIALIAS && !isWeakGpu() && !loweredLastVisit;
// { canvas } är kortform för { canvas: canvas }: "rita i just den här canvasen".
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: USE_ANTIALIAS });

// devicePixelRatio = hur många riktiga pixlar skärmen har per "CSS-pixel"
// (2 på en retina-skärm). Math.min(..., 1) sätter ett tak på 1: på en
// retina-skärm ritas då en fjärdedel så många pixlar som vid 2. Det är det som
// avlastar grafikkortet mest. Bilden blir lite mjukare i kanterna.
export const BASE_PIXEL_RATIO = Math.min(window.devicePixelRatio, 1);
renderer.setPixelRatio(BASE_PIXEL_RATIO);
// Ritytan ska vara lika stor som webbläsarfönstrets insida.
renderer.setSize(window.innerWidth, window.innerHeight);
// Skuggor. (three.js har bara en sorts mjuka skuggor numera, PCFShadowMap.)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Mindre hjälp: hur skarp en textur får vara när den ses snett (används av många texturer).
export const MAX_ANISOTROPY = renderer.capabilities.getMaxAnisotropy();

// ---------------------------------------------------------------------------
// SCEN – behållaren. Allt som ska synas måste läggas till med scene.add(...).
// ---------------------------------------------------------------------------
export const scene = new THREE.Scene();

// PALETT – sidans alla färger på ett ställe. Höstfärger: gult, orange, rött.
// Hex-kod: #RRGGBB, två tecken var för rött, grönt, blått (00 = inget, ff = max).
export const PALETTE = {
  background: '#3d3358', // Skymningslila: det som syns utanför marken.
  sun: '#ffb37a',        // Den låga kvällssolen: varmt orange.
  skyLight: '#b9b4ff',   // Ljuset från himlen: svalt blålila. Det färgar skuggorna.
  groundLight: '#ff9d6b', // Ljus som studsar upp från marken: varmt.
  headlightBeam: '#fff1c4', // Ljuskäglorna från bilens strålkastare.
  screenGlow: '#cfe0ff',    // Skenet från en projektskärm som är igång: svalt vitt, som en bioduk.
  warmLamp: '#ffb45e',      // Lampan över garageporten och ljuset ur stugfönstret: varmt gult.
  windowGlow: '#ffd27a',    // Själva fönsterrutan när det lyser inne.
  ground: '#9ba257',     // Marken: höstgräs, dovt olivgrönt. Gör att de röda och orange träden syns.
  groundDark: '#7b8646', // Mörkare gräsfläckar.
  groundDry: '#bdb066',  // Torra, ljusare gräsfläckar.
  grassRoot: '#6d7a3c',      // Grässtråna vid roten: som de mörka fläckarna, så att de smälter in.
  grassTip: '#c9c46e',       // Grässtrånas toppar: ljust, torrt.
  grassTipAutumn: '#e39a3f', // Var sjunde tuva har orange toppar.
  grassShimmer: '#ffe9a8',   // Skimret som drar över topparna med vinden.
  fireflies: ['#ffd36b', '#8fefff', '#ffa8e0'],
  bulbs: '#ffd98a',          // Glödlamporna runt skärmarna hemma (de andra världarna får sin egen färg).
  smoke: '#cbbfd6',          // Röken ur skorstenen: ljust lila-grå.
  tireDust: '#e2d3c0',
  matcha: '#3f6e1a',         // Teet i kopparna: djupt matchagrönt.
  matchaCold: '#4c5a22',     // Kallt te som stått länge: mörkare och gråare grönt.
  steam: '#f6f1e8',          // Ångan ur tekoppen: nästan vit.       // Dammet bakom bilens hjul: varmt grå, som gruset. // Eldflugorna: mest guld, ibland turkos eller rosa.
  speckle: '#f79824',    // Play-symbolen och laddningssnurran på skärmarna: orange.
  carPaint: '#d8261a',   // Bilens lack: klarröd.
  glass: '#25323d',      // Rutor/hytt: mörkt blågrått glas.
  tire: '#1e1e20',       // Däck: nästan svart gummi.
  rim: '#cfd2d6',        // Fälgar: silver.
  headlight: '#fff4c2',  // Strålkastare fram: varmvitt.
  taillight: '#ff2a1a',  // Baklysen: klarrött.
  trunk: '#6b4226',      // Trädstammar och skyltstolpar: brunt trä.
  leaves: ['#c1121f', '#e85d04', '#f48c06'], // Lönnlöv: rött, orange, gulorange. [ ] = en lista.
  // Löven som faller och ligger på marken, och löven i markens textur. Hälften röda,
  // hälften orange. Lite mörkare än trädens, eftersom de ritas utan ljus (se leaves.js).
  fallenLeaves: ['#d61a24', '#e8301f', '#f56a10', '#ff8a14', '#f5a623'],
  frame: '#2b2d33',      // Ramen runt skyltarnas skärm: mörkgrå.
  sign: '#fff3d6',       // Textskyltens bakgrund: grädde.
  signText: '#25323d',   // Textens färg.
  signGlow: '#f0561a',   // Textens färg när bilen står i rutan: "tänd" orange.
  gravel: '#b7a08a',      // Vägarnas grus: varmt grått.
  gravelLight: '#d6c4b0', // Ljusa småstenar.
  gravelDark: '#8f7a66',  // Mörka småstenar och kantlinje.
  garageWall: '#a9a39b',   // Garagets väggar: betonggrå.
  garageRoof: '#4b4642',   // Garagets platta tak: mörk takpapp.
  garageDoor: '#e8e4dc',   // Garageporten: ljust plåtgrå.
  asphalt: '#4b4642',      // Parkeringsfickornas asfalt: mörkt varmgrå.
  asphaltLight: '#5f5954', // Ljusare korn i asfalten.
  // Tech Art-världen: mörkblå "ritning", som rutnätet i ett 3D-program.
  techBackground: '#1e2a3b', // Det som syns utanför marken där.
  techGround: '#2c3e55',     // Marken.
  techGrid: '#3f5878',       // De tunna rutnätslinjerna.
  techGridMain: '#6f93c4',   // De tjocka linjerna, och trådmodellen på provbänken.
  // Programming-världen: ett kretskort – mörkgrönt med ledningar i neongrönt.
  progBackground: '#0c1a14',
  progGround: '#13301f',
  progTraceDim: '#1f5a3b',
  progTrace: '#3ddc84',
  // Art-världen: en målares skyddsduk – gräddvit väv med färgstänk.
  artBackground: '#2a1630',
  artGround: '#efe2cc',
  artPaints: ['#ff5d8f', '#2ec4b6', '#ffbe0b', '#3a86ff'], // Färgstänken: rosa, turkos, gul, blå.
  artAccent: '#ff5d8f',
  lampPost: '#3a3540',       // Gatlyktornas stolpar: mörk järngrå.
  rock: '#7d7280',           // Grottornas berg: gråviolett sten.
  rockDark: '#5d5462',       // Mörkare stenar.
  caveMouth: '#120e18',      // Grottöppningen: nästan svart.
};
scene.background = new THREE.Color(PALETTE.background);

// DIMMA – Fog(färg, nära, långt): allt längre bort än "nära" tonas mot färgen, och vid
// "långt" syns bara färgen. Kameran står ca 42–64 enheter från marken (nederkant–överkant),
// så överst i bilden blir det lite disigt. Det ger djup nästan gratis.
// main.js gångrar talen med kamerans zoom. ÄNDRA FOG_NEAR/FOG_FAR för mer/mindre dis.
export const FOG_NEAR = 46;
export const FOG_FAR = 120;
scene.fog = new THREE.Fog(PALETTE.background, FOG_NEAR, FOG_FAR);

// ---------------------------------------------------------------------------
// KAMERA
// ---------------------------------------------------------------------------
// PerspectiveCamera(synfält, bildförhållande, nära, långt):
//   30     – synfält i grader på höjden. Litet synfält långt bort = platt "Diablo-look".
//   5      – saker närmare än så ritas inte. (Inte 0.1: då flimrar ytor som ligger
//            tätt ihop långt bort, eftersom grafikkortets noggrannhet räcker sämre.)
//   400    – saker längre bort än så ritas inte. Därför syns aldrig de andra världarna.
export const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 5, 400);

// Var kameran sitter i förhållande till bilen: snett uppifrån OCH snett från sidan.
// Gångra alla tre med samma tal för att zooma ut/in utan att ändra vinkeln.
export const cameraOffset = new THREE.Vector3(-21, 39, -21);
// Kameran siktar en bit "uppåt på skärmen" från bilen, så att man ser mer framåt.
export const cameraLead = new THREE.Vector3(4, 0, 4);
// Kamerans lutning nedåt: atan2(höjd, avstånd i sidled). Används för att vända saker rakt mot kameran.
export const CAMERA_PITCH = Math.atan2(cameraOffset.y, Math.hypot(cameraOffset.x, cameraOffset.z));

// Alla skyltar vrids så att de vetter mot kameran. Kameran står alltid åt
// samma håll från bilen, så samma vinkel fungerar överallt.
// Math.atan2(x, z) gör om en riktning till en vinkel runt Y-axeln.
export const BILLBOARD_FACING = Math.atan2(cameraOffset.x, cameraOffset.z);

// Flyttar en punkt { x, z } mot kameran (nedåt på skärmen) så många enheter.
export function towardCamera(point, distance) {
  return {
    x: point.x + Math.sin(BILLBOARD_FACING) * distance,
    z: point.z + Math.cos(BILLBOARD_FACING) * distance,
  };
}
// Flyttar en punkt åt höger på skärmen (minus = åt vänster).
export function toTheRight(point, distance) {
  return {
    x: point.x + Math.cos(BILLBOARD_FACING) * distance,
    z: point.z - Math.sin(BILLBOARD_FACING) * distance,
  };
}

// ---------------------------------------------------------------------------
// LJUS
// ---------------------------------------------------------------------------
// HemisphereLight(himmelsfärg, markfärg, styrka): ytor som vetter uppåt får himlens
// färg, ytor som vetter nedåt får markens. Den blålila himlen gör skuggorna svala.
// ÄNDRA styrkan (1.1) för mörkare eller ljusare kväll.
scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.1));

// DirectionalLight: parallella strålar som från solen. ÄNDRA 2.6 för starkare/svagare sol.
export const keyLight = new THREE.DirectionalLight(PALETTE.sun, 2.6);
// Åt vilket håll solen står, sett från marken: lågt till vänster, lite åt kamerans håll.
export const SUN_DIRECTION = new THREE.Vector3(0.35, 0.6, -1.06).normalize();
export const SUN_DISTANCE = 60; // Hur långt bort från bilen lampan hålls.

// --- Skuggor ---
// Lampan "fotograferar" scenen från sitt håll till en bild (skuggkartan). Bilden täcker
// bara en ruta runt bilen, så lampan flyttas med bilen hela tiden (se main.js).
keyLight.castShadow = true;
// Rutans halva sida i enheter. Det man ser runt bilen är ungefär ±30, så 34 räcker.
const SHADOW_AREA = 34;
keyLight.shadow.camera.left = -SHADOW_AREA;
keyLight.shadow.camera.right = SHADOW_AREA;
keyLight.shadow.camera.top = SHADOW_AREA;
keyLight.shadow.camera.bottom = -SHADOW_AREA;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = SUN_DISTANCE * 2.5;
export const SUN_SHADOW_SIZE = 1536; // Skuggkartans upplösning. quality.js kan sänka den.
keyLight.shadow.mapSize.set(SUN_SHADOW_SIZE, SUN_SHADOW_SIZE);
// Små förskjutningar som tar bort randiga "skuggfläckar" på ytor som borde vara belysta.
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.03;
keyLight.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
scene.add(keyLight, keyLight.target);

// Byter storlek på solens skuggkarta. Den gamla måste kastas för att den nya ska användas.
export function setSunShadowSize(size) {
  keyLight.shadow.mapSize.set(size, size);
  if (keyLight.shadow.map) {
    keyLight.shadow.map.dispose();
    keyLight.shadow.map = null;
  }
}

// ---------------------------------------------------------------------------
// MARK – mått som alla världar delar
// ---------------------------------------------------------------------------
export const GROUND_SIZE = 160; // Markens sida i enheter.
export const TILE_PIXELS = 512; // Markmönstrets bild i pixlar (512 x 512).
export const TILE_UNITS = 16;   // Hur stor en kopia av bilden blir på marken, i enheter.
// Hemvärldens mitt. Den ligger mitt i allt som byggs där (garaget, skyltraden,
// grottorna), så att inget hamnar ute i kanttoningen.
export const HUB_X = -9;
export const HUB_Z = -2;

// --- Mjuk kant ---
// I stället för att marken tar tvärt slut tonas den ut i bakgrundsfärgen. Det är en
// RING (RingGeometry) som bara täcker kanten, så att mitten av marken inte ritas två gånger.
const FADE_START = 0.7; // Var toningen börjar: 70 % av vägen från mitten till kanten.
const FADE_INNER = (GROUND_SIZE / 2) * FADE_START;      // Ringens innerkant.
const FADE_OUTER = (GROUND_SIZE / 2) * Math.SQRT2 + 1;  // Ytterkant: når ut till markens hörn.
// Så långt från mitten bilen får köra: fram till där toningen börjar.
export const DRIVE_RADIUS = FADE_INNER;

// Gör en kanttoning för en värld och lägger den i världens grupp.
export function makeEdgeFade(world) {
  const fadeImage = document.createElement('canvas');
  fadeImage.width = 512;
  fadeImage.height = 512;
  const fadePen = fadeImage.getContext('2d');
  // Ringens bild täcker en kvadrat lika stor som ringens ytterkant (RingGeometry gör så),
  // så toningens cirklar räknas om till pixlar: radie / FADE_OUTER * 256.
  const gradient = fadePen.createRadialGradient(
    256, 256, 256 * (FADE_INNER / FADE_OUTER),
    256, 256, 256 * ((GROUND_SIZE / 2) / FADE_OUTER)
  );
  // color + '00' = färgen helt genomskinlig, + 'ff' = helt täckande.
  gradient.addColorStop(0, world.background + '00');
  gradient.addColorStop(1, world.background + 'ff');
  fadePen.fillStyle = gradient;
  fadePen.fillRect(0, 0, 512, 512);
  const fadeTexture = new THREE.CanvasTexture(fadeImage);
  fadeTexture.colorSpace = THREE.SRGBColorSpace;
  const fade = new THREE.Mesh(
    new THREE.RingGeometry(FADE_INNER, FADE_OUTER, 96),
    // transparent: genomskinliga delar syns igenom. depthWrite: false = skymmer inget.
    new THREE.MeshBasicMaterial({ map: fadeTexture, transparent: true, depthWrite: false })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.set(world.x, 0.07, world.z); // Strax ovanför marken, vägarna och fickorna.
  worldGroup(world).add(fade);
}

// ---------------------------------------------------------------------------
// VÄRLDAR – hemvärlden och de världar man kan köra till.
// ---------------------------------------------------------------------------
// Alla världar ligger i samma scen, 1000 enheter ifrån varandra. Kameran ser bara
// 400 enheter bort, så från en värld syns aldrig någon annan. Att "resa" är bara att
// flytta bilen dit – bakom en toning, så att hoppet inte syns.
//   title      – namnet på skylten vid ingången som leder dit.
//   x, z       – världens mitt.
//   background – färgen runt marken (och toningen när man reser dit).
//   accent     – världens "lysande" färg: grottljuset dit, teleportplattan och lyktornas sken.
//   rowStart   – (bara hemma) var första projektskylten står.
//   display    – hur projekten visas där: 'cinema' (drive-in-duk), 'viewport' (3D-programfönster),
//                'arcade' (arkadmaskin) eller 'easel' (tavla på staffli). Se billboards.js.
//   module     – (andra världar) filen som bygger världen. Den hämtas och byggs först när
//                man reser dit första gången (se portals.js och worlds/).
export const WORLDS = {
  hub: { title: 'Home', x: HUB_X, z: HUB_Z, background: PALETTE.background, accent: PALETTE.warmLamp, display: 'cinema', rowStart: { x: 20, z: -10 } },
  techart: { title: 'Tech Art', x: 1000, z: 0, background: PALETTE.techBackground, accent: PALETTE.techGridMain, display: 'viewport', module: './worlds/techart.js' },
  prog: { title: 'Programming', x: 0, z: 1000, background: PALETTE.progBackground, accent: PALETTE.progTrace, display: 'arcade', module: './worlds/prog.js' },
  art: { title: 'Art', x: -1000, z: 0, background: PALETTE.artBackground, accent: PALETTE.artAccent, display: 'easel', module: './worlds/art.js' },
};

// Världen bilen är i just nu. Andra filer läser den direkt, men ändrar den med setCurrentWorld.
export let currentWorld = WORLDS.hub;
export function setCurrentWorld(world) {
  currentWorld = world;
  scene.background.set(world.background);
  scene.fog.color.set(world.background); // Dimman får världens färg.
  showWorld(world);
}

// En grupp per värld. Allt som byggs i en värld läggs i dess grupp, och bara gruppen
// för världen bilen är i syns. Osynliga grupper hoppar three.js över helt.
// Map = en uppslagstabell: värld → grupp.
const worldGroups = new Map();
for (const world of Object.values(WORLDS)) { // Object.values = alla världar som en lista.
  const group = new THREE.Group();
  group.name = world.title; // Bara för felsökning.
  group.visible = world === currentWorld;
  worldGroups.set(world, group);
  scene.add(group);
}
export function worldGroup(world) {
  return worldGroups.get(world);
}
// Tänder en värld och släcker de andra.
export function showWorld(world) {
  for (const [groupWorld, group] of worldGroups) group.visible = groupWorld === world;
}
// Vilken värld en plats hör till: den vars mitt ligger närmast (inom 300 enheter).
export function worldAt(position) {
  return Object.values(WORLDS).find((world) => Math.hypot(position.x - world.x, position.z - world.z) < 300) || null;
}

// ---------------------------------------------------------------------------
// HACKDETEKTIVENS ANTECKNINGAR (se stats.js)
// ---------------------------------------------------------------------------
// Koden skriver en "anteckning" när den gör något som kan vara dyrt. Tar en bild
// ovanligt lång tid visar stats.js vad som antecknades just då.
export const frameNotes = new Set();
export function note(what) {
  frameNotes.add(what);
}

// ---------------------------------------------------------------------------
// GEMENSAMMA MATERIAL OCH TEXTURER
// ---------------------------------------------------------------------------
// roughness: 0 = blank som en spegel, 1 = helt matt. metalness: 0 = plast, 1 = metall.
export const postMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });  // Trä: stolpar, stammar.
export const frameMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.8 }); // Mörkgrå ramar, socklar, rack.
export const paintMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.carPaint, roughness: 0.35, metalness: 0.3 }); // Bilens lack (och brevlådan).
export const glassMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.2 });

// Skyltarnas mått, som flera filer behöver (skyltar, grottornas och plattornas namnskyltar).
export const SCREEN_WIDTH = 8;  // Projektskärmens bredd.
export const SIGN_HEIGHT = 1.1; // Textskyltens höjd (vid bredden SCREEN_WIDTH).
export const SCREEN_TILT = 0.3; // Hur mycket skyltar lutar bakåt mot kameran, i radianer (ca 17°).

// Gör en textur med en text på grädde bakgrund, till skyltar.
// lit = true ger samma skylt men med tänd (orange) text.
export function makeTitleTexture(title, lit = false) {
  const image = document.createElement('canvas');
  image.width = 1024;
  image.height = 140; // Samma proportioner som skylten (8 x 1.1), annars blir texten utdragen.
  const brush = image.getContext('2d');
  brush.fillStyle = PALETTE.sign;
  brush.fillRect(0, 0, image.width, image.height);
  // Börja med stor text och krymp tills hela titeln får plats på bredden.
  let fontSize = 84;
  brush.font = `bold ${fontSize}px system-ui, sans-serif`; // ${...} stoppar in ett värde i texten.
  while (brush.measureText(title).width > image.width - 60) {
    fontSize -= 4;
    brush.font = `bold ${fontSize}px system-ui, sans-serif`;
  }
  brush.fillStyle = lit ? PALETTE.signGlow : PALETTE.signText;
  brush.textAlign = 'center';
  brush.textBaseline = 'middle';
  brush.fillText(title, image.width / 2, image.height / 2);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISOTROPY; // Skarpare text sedd snett.
  return texture;
}

// En mjuk, rund ljusfläck (vit; färgen läggs på materialet eller per kopia).
export function makeGlowTexture(centerOpacity) {
  const image = document.createElement('canvas');
  image.width = 128;
  image.height = 128;
  const pen = image.getContext('2d');
  const glow = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, `rgba(255, 255, 255, ${centerOpacity})`);
  glow.addColorStop(0.5, `rgba(255, 255, 255, ${centerOpacity * 0.35})`);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  pen.fillStyle = glow;
  pen.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// Material som "lägger till" ljus (AdditiveBlending) – fejkat ljus, ingen riktig lampa.
// En riktig lampa kostar arbete för VARJE pixel på skärmen, hela tiden.
export function makeGlowMaterial(centerOpacity) {
  return new THREE.MeshBasicMaterial({
    map: makeGlowTexture(centerOpacity),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Gör en textur av en canvas med ett mönster som upprepas som kakelplattor.
export function makeTileTexture(image, repeat) {
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = MAX_ANISOTROPY;
  return texture;
}
