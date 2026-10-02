// ============================================================================
// main.js — hela 3D-scenen: mark, träd, projektskyltar, bil, tangentbord, kamera och renderloop.
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
// ============================================================================

// Hämtar allt i three.js och samlar det under namnet THREE.
// 'three' är inget filnamn – webbläsaren slår upp det i import-kartan i index.html.
import * as THREE from 'three';
// Två funktioner ur biblioteket gifuct-js, som kan packa upp gif-filer.
// { a, b } hämtar bara just de namngivna delarna i stället för allt.
import { parseGIF, decompressFrame } from 'gifuct-js';

// Letar upp <canvas id="scene"> i index.html. '#scene' betyder "elementet med id scene".
const canvas = document.querySelector('#scene');

// ---------------------------------------------------------------------------
// RENDERER – pratar med grafikkortet (via WebGL) och ritar pixlarna.
// ---------------------------------------------------------------------------
// { canvas } är kortform för { canvas: canvas }: "rita i just den här canvasen".
// antialias: true jämnar ut taggiga kanter.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

// devicePixelRatio = hur många riktiga pixlar skärmen har per "CSS-pixel"
// (2 på en retina-skärm). Math.min(..., 1) sätter ett tak på 1: på en
// retina-skärm ritas då en fjärdedel så många pixlar som vid 2 (hälften på
// bredden gånger hälften på höjden). Det är det som avlastar grafikkortet mest.
// Bilden blir lite mjukare i kanterna. Höj till 1.5 eller 2 för skarpare bild
// på en snabb dator.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));

// Ritytan ska vara lika stor som webbläsarfönstrets insida.
renderer.setSize(window.innerWidth, window.innerHeight);

// Skuggor är avstängda från början, eftersom de kostar en del. PCFSoftShadowMap
// ger mjuka kanter på skuggorna i stället för hårda, taggiga.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------------------
// SCEN – behållaren. Allt som ska synas måste läggas till med scene.add(...).
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();

// PALETT – sidans alla färger på ett ställe. Höstfärger: gult, orange, rött.
// Hex-kod: #RRGGBB, två tecken var för rött, grönt, blått (00 = inget, ff = max).
// Mycket rött + lagom grönt + lite blått = varm ton. Ju mindre grönt, desto rödare.
const PALETTE = {
  background: '#3d3358', // Skymningslila: det som syns utanför marken.
  sun: '#ffb37a',        // Den låga kvällssolen: varmt orange.
  skyLight: '#b9b4ff',   // Ljuset från himlen: svalt blålila. Det färgar skuggorna.
  groundLight: '#ff9d6b', // Ljus som studsar upp från marken: varmt.
  headlightBeam: '#fff1c4', // Ljuskäglorna från bilens strålkastare.
  screenGlow: '#cfe0ff',    // Skenet från en projektskärm som är igång: svalt vitt, som en bioduk.
  warmLamp: '#ffb45e',      // Lampan över garageporten och ljuset ur stugfönstret: varmt gult.
  windowGlow: '#ffd27a',    // Själva fönsterrutan när det lyser inne.
  ground: '#ffd166',     // Marken: gyllengul.
  speckle: '#f79824',    // Prickarna på marken: orange.
  carPaint: '#c8321e',   // Bilens lack: djupröd.
  glass: '#25323d',      // Rutor/hytt: mörkt blågrått glas.
  tire: '#1e1e20',       // Däck: nästan svart gummi.
  rim: '#cfd2d6',        // Fälgar: silver.
  headlight: '#fff4c2',  // Strålkastare fram: varmvitt.
  taillight: '#ff2a1a',  // Baklysen: klarrött.
  trunk: '#6b4226',      // Trädstammar och skyltstolpar: brunt trä.
  leaves: ['#c1121f', '#e85d04', '#f48c06'], // Lönnlöv: rött, orange, gulorange. [ ] = en lista.
  // Löven som faller och ligger på marken, och löven i markens textur. Hälften röda,
  // hälften orange (färgerna står två gånger var för att bli lika vanliga som den gula).
  // De är lite mörkare än trädens, eftersom de ritas utan ljus (se LÖV OCH VIND) och
  // annars skulle lysa starkare än allt annat i skymningen.
  fallenLeaves: ['#c4262e', '#d93a2b', '#e8701e', '#f08a24', '#e8a53a'],
  frame: '#2b2d33',      // Ramen runt skyltarnas skärm: mörkgrå.
  sign: '#fff3d6',       // Textskyltens bakgrund: grädde.
  signText: '#25323d',   // Textens färg.
  signGlow: '#f0561a',   // Textens färg när bilen står i rutan: "tänd" orange.
  gravel: '#b7a08a',      // Uppfartens grus: varmt grått.
  gravelLight: '#d6c4b0', // Ljusa småstenar.
  gravelDark: '#8f7a66',  // Mörka småstenar och kantlinje.
  garageWall: '#a9a39b',   // Garagets väggar: betonggrå.
  garageRoof: '#4b4642',   // Garagets platta tak: mörk takpapp.
  garageDoor: '#e8e4dc',   // Garageporten: ljust plåtgrå.
  asphalt: '#4b4642',      // Parkeringsfickornas asfalt: mörkt varmgrå.
  asphaltLight: '#5f5954', // Ljusare korn i asfalten.
  // Tech Art-världen (se VÄRLDAR): mörkblå "ritning", som rutnätet i ett 3D-program.
  techBackground: '#1e2a3b', // Det som syns utanför marken där.
  techGround: '#2c3e55',     // Marken.
  techGrid: '#3f5878',       // De tunna rutnätslinjerna.
  techGridMain: '#6f93c4',   // De tjocka linjerna, och trådmodellen på provbänken.
  // Programming-världen: ett kretskort – mörkgrönt med ledningar i neongrönt.
  progBackground: '#0c1a14', // Det som syns utanför marken där.
  progGround: '#13301f',     // Kretskortet.
  progTraceDim: '#1f5a3b',   // Ledningarna på kortet.
  progTrace: '#3ddc84',      // Lödpunkterna, portalringen och lysdioderna: neongrönt.
  // Art-världen: en målares skyddsduk – gräddvit väv med färgstänk.
  artBackground: '#2a1630',  // Det som syns utanför marken där: djup plommon.
  artGround: '#efe2cc',      // Väven.
  artPaints: ['#ff5d8f', '#2ec4b6', '#ffbe0b', '#3a86ff'], // Färgstänken: rosa, turkos, gul, blå.
  artAccent: '#ff5d8f',      // Grottljuset dit och teleportplattan där: rosa.
  lampPost: '#3a3540',       // Gatlyktornas stolpar: mörk järngrå.
  rock: '#7d7280',           // Grottornas berg: gråviolett sten.
  rockDark: '#5d5462',       // Mörkare stenar.
  caveMouth: '#120e18',      // Grottöppningen: nästan svart.
};
// PALETTE.background betyder "värdet som heter background i PALETTE".
scene.background = new THREE.Color(PALETTE.background);

// ---------------------------------------------------------------------------
// KAMERA
// ---------------------------------------------------------------------------
// PerspectiveCamera(synfält, bildförhållande, nära, långt):
//   30     – synfält i grader på höjden. Större = vidvinkel, mindre = zoom.
//            Ett litet synfält långt bort ger den platta "isometriska" Diablo-looken.
//   aspect – fönstrets bredd / höjd, annars blir bilden utdragen.
//   5      – saker närmare än så ritas inte.
//   400    – saker längre bort än så ritas inte.
// Varför inte 0.1 som "nära"? Grafikkortet har begränsad noggrannhet när det avgör
// vad som ligger framför vad, och den noggrannheten fördelas mellan nära och långt.
// Ju mindre "nära" är, desto sämre blir den långt bort – och då börjar ytor som
// ligger tätt ihop (mark, väg, asfalt) flimra. Kameran är alltid minst ca 40 enheter
// från allt, så 5 är gott om marginal.
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 5, 400);

// Var kameran sitter i förhållande till bilen: (x, y, z) = (21 åt sidan, 39 upp, 21 bakom).
// Diablo-kamera = snett uppifrån OCH snett från sidan (diagonalt), alltid samma vinkel.
//   x och z lika stora = kameran står på diagonalen, 45° vriden.
//   y större än x/z    = brantare, mer ovanifrån. Mindre y = flackare.
//   Gångra alla tre med samma tal för att zooma ut/in utan att ändra vinkeln.
// Vector3 är bara tre tal (x, y, z) i ett paket.
const cameraOffset = new THREE.Vector3(-21, 39, -21);

// Kameran siktar inte exakt på bilen utan på en punkt en bit "uppåt på skärmen"
// från den (4 enheter åt x och z). Då hamnar bilen lite nedanför mitten och man
// ser mer av det som finns framför, t.ex. de höga skyltarna.
const cameraLead = new THREE.Vector3(4, 0, 4);

// ---------------------------------------------------------------------------
// LJUS – utan lampor blir MeshStandardMaterial helt svart.
// ---------------------------------------------------------------------------
// AmbientLight(färg, styrka): lyser lika mycket överallt, från alla håll.
// Ger inga skuggsidor, men ser till att inget blir kolsvart.
// (Skymning: i stället för ett vitt AmbientLight används ett HemisphereLight.)
// HemisphereLight(himmelsfärg, markfärg, styrka): ytor som vetter uppåt får himlens
// färg, ytor som vetter nedåt får markens. Det är det här ljuset som syns i
// skuggorna, så den blålila himlen gör skuggorna svala medan solen är varm.
// ÄNDRA styrkan (1.1) för mörkare eller ljusare skuggor och kväll.
scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.1));

// DirectionalLight: parallella strålar som från solen. Ytor som vetter mot
// ljuset blir ljusa, andra mörkare – det är det som ger form åt objekten.
// ÄNDRA styrkan (2.6) för starkare eller svagare sol.
const keyLight = new THREE.DirectionalLight(PALETTE.sun, 2.6);

// SUN_DIRECTION = åt vilket håll solen står, sett från marken. Den står lågt till
// vänster på skärmen och lite åt kamerans håll, så att sidorna vi ser blir belysta
// och skuggorna faller långa åt höger.
//   y (0.6) = solens höjd. Mindre = lägre sol och längre skuggor. Större = mer mitt på dagen.
// .normalize() gör pilen exakt 1 lång, så att bara riktningen spelar roll.
const SUN_DIRECTION = new THREE.Vector3(0.35, 0.6, -1.06).normalize();
const SUN_DISTANCE = 60; // Hur långt bort från bilen lampan hålls.

// --- Skuggor ---
// Lampan "fotograferar" scenen från sitt håll till en bild (skuggkartan). Det som
// inte syns från lampan ligger i skugga. Bilden täcker bara en ruta runt bilen,
// så lampan flyttas med bilen hela tiden (se renderloopen längst ner).
keyLight.castShadow = true;
const SHADOW_AREA = 48; // Rutans halva sida i enheter. Större = skuggor längre bort, men suddigare.
keyLight.shadow.camera.left = -SHADOW_AREA;
keyLight.shadow.camera.right = SHADOW_AREA;
keyLight.shadow.camera.top = SHADOW_AREA;
keyLight.shadow.camera.bottom = -SHADOW_AREA;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = SUN_DISTANCE * 2.5;
// Skuggkartans upplösning. 2048 är skarpt; sänk till 1024 om det hackar.
keyLight.shadow.mapSize.set(2048, 2048);
// Små förskjutningar som tar bort randiga "skuggfläckar" på ytor som borde vara belysta.
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.03;
keyLight.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
scene.add(keyLight);
// En riktad lampa lyser mot sitt "target". Det måste ligga i scenen för att kunna flyttas.
scene.add(keyLight.target);

// ---------------------------------------------------------------------------
// MARK
// ---------------------------------------------------------------------------
// Ett synligt objekt (Mesh) = GEOMETRI (formen) + MATERIAL (ytans utseende).
// Markens sida i enheter. (Var 120 – höjd till 160 när hemvärlden fick fem skyltar och tre grottor.)
const GROUND_SIZE = 160;
// Hemvärldens mitt. Den ligger inte på (0, 0) utan mitt i allt som byggs där
// (garaget, skyltraden, grottorna), så att inget hamnar ute i kanttoningen.
const HUB_X = -9;
const HUB_Z = -2;

// --- Prickig textur till marken, så att man ser att bilen rör sig. ---
// En textur är en bild som klistras på en yta. I stället för att ladda en bildfil
// ritar vi bilden själva, i en osynlig canvas som aldrig läggs in på sidan.
const TILE_PIXELS = 512; // Bildens storlek i pixlar (512 x 512).
const TILE_UNITS = 16;   // Hur stor en kopia av bilden blir på marken, i enheter.
const tile = document.createElement('canvas');
tile.width = TILE_PIXELS;
tile.height = TILE_PIXELS;
// getContext('2d') ger "pennan" man ritar 2D med.
const pen = tile.getContext('2d');

// Fyll hela bilden med markfärgen. fillRect(x, y, bredd, höjd), (0, 0) är övre vänstra hörnet.
pen.fillStyle = PALETTE.ground;
pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);

// Rita 160 små löv på slumpade platser, i rött och orange. Det är hela "bruset" (noise)
// som gör att man ser att bilen rör sig – och marken ser ut som en höstgräsmatta.
for (let i = 0; i < 160; i++) {
  const size = 7 + Math.random() * 9; // Lövets halva längd: 7 till 16 pixlar.
  // Håll lövet helt innanför bilden, annars klipps det av i skarven mellan kopiorna.
  const x = size + Math.random() * (TILE_PIXELS - size * 2);
  const y = size + Math.random() * (TILE_PIXELS - size * 2);
  pen.fillStyle = PALETTE.fallenLeaves[i % PALETTE.fallenLeaves.length];
  // save/restore: spara pennans läge, vrid den för just det här lövet, och återställ sedan.
  pen.save();
  pen.translate(x, y);                    // Flytta "nollpunkten" till lövets mitt...
  pen.rotate(Math.random() * Math.PI * 2); // ...och vrid allt som ritas efter det.
  // Ett löv: två bågar (quadraticCurveTo) från spets till spets = en spetsig oval.
  pen.beginPath();
  pen.moveTo(0, -size);
  pen.quadraticCurveTo(size * 0.75, 0, 0, size);
  pen.quadraticCurveTo(-size * 0.75, 0, 0, -size);
  pen.fill();
  // Mittnerven: en tunn mörkare linje längs lövet.
  pen.strokeStyle = 'rgba(80, 20, 10, 0.35)';
  pen.lineWidth = 1.5;
  pen.beginPath();
  pen.moveTo(0, -size * 0.8);
  pen.lineTo(0, size * 1.2); // Sticker ut lite nedtill = skaftet.
  pen.stroke();
  pen.restore();
}

// Gör om canvasen till en textur som three.js kan använda.
const groundTexture = new THREE.CanvasTexture(tile);
// Talar om att färgerna i bilden är vanliga skärmfärger (sRGB), annars blir de för bleka.
groundTexture.colorSpace = THREE.SRGBColorSpace;
// RepeatWrapping = upprepa bilden som kakelplattor. S och T är texturens två riktningar.
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
// Hur många kopior som får plats över marken: 160 / 16 = 10 åt varje håll.
groundTexture.repeat.set(GROUND_SIZE / TILE_UNITS, GROUND_SIZE / TILE_UNITS);
// Gör texturen skarpare när man ser ytan snett från sidan, som vår kamera gör.
groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), // En platt fyrkant.
  // MeshBasicMaterial bryr sig inte om lamporna: ytan får exakt färgerna i texturen.
  // (Bilen använder MeshStandardMaterial, som blir ljusare/mörkare av ljuset.)
  // map = texturen som ska klistras på ytan.
  // (Skymning: marken använder nu MeshLambertMaterial, ett enkelt och snabbt material
  // som blir ljusare och mörkare av lamporna och kan ta emot skuggor.)
  new THREE.MeshLambertMaterial({ map: groundTexture })
);
// Ett plan skapas stående, som en vägg. Vrid det -90° runt X-axeln så det lägger sig ner.
ground.rotation.x = -Math.PI / 2;
// --- Lager på marken (mot flimmer) ---
// Mark, vägar och parkeringsfickor ligger nästan på samma höjd. Då kan grafikkortet
// inte avgöra vilken som är överst, och de flimrar ("z-fighting"). Lösningen:
//   renderOrder = i vilken ordning saker ritas. Lägre tal ritas först.
//   depthTest: false på lagren ovanpå = "rita alltid över det som redan finns".
// Marken ritas allra först (-10), sedan vägkanter (-9), grus (-8) och asfalt (-5),
// var och en rakt över den förra. Allt annat (bil, träd, hus) har renderOrder 0,
// ritas efteråt och hamnar därför ovanpå som vanligt.
ground.renderOrder = -10;
ground.position.set(HUB_X, 0, HUB_Z);
scene.add(ground);

// --- Mjuk kant ---
// I stället för att marken tar tvärt slut tonas den ut i bakgrundsfärgen, i en
// cirkel. Det görs med ett andra plan precis ovanpå marken: genomskinligt i
// mitten och gradvis mer täckande (i bakgrundens färg) utåt kanten.
// Det är en funktion eftersom varje värld (se VÄRLDAR) har en egen mark med egen
// bakgrundsfärg: x, z = markens mitt, color = färgen kanten tonas ut i.
const FADE_START = 0.7; // Var toningen börjar: 0.7 = 70 % av vägen från mitten till kanten.
function makeEdgeFade(x, z, color) {
  const fadeImage = document.createElement('canvas');
  fadeImage.width = 512;
  fadeImage.height = 512;
  const fadePen = fadeImage.getContext('2d');
  // En rund toning (gradient) mellan två cirklar med samma mitt (256, 256):
  // den inre med radie 256 * 0.7 och den yttre med radie 256 (bildens kant).
  const gradient = fadePen.createRadialGradient(256, 256, 256 * FADE_START, 256, 256, 256);
  // En färgkod kan ha två extra tecken för täckning: 00 = helt genomskinlig, ff = helt täckande.
  // color + '00' blir alltså färgen, men genomskinlig.
  gradient.addColorStop(0, color + '00');
  gradient.addColorStop(1, color + 'ff');
  fadePen.fillStyle = gradient;
  // Utanför den yttre cirkeln (bildens hörn) fortsätter sista färgen, alltså helt täckande.
  fadePen.fillRect(0, 0, 512, 512);
  const fadeTexture = new THREE.CanvasTexture(fadeImage);
  fadeTexture.colorSpace = THREE.SRGBColorSpace;

  const fade = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    // transparent: true behövs för att genomskinliga delar ska synas igenom.
    // depthWrite: false gör att planet inte "skymmer" saker som ritas efter det.
    new THREE.MeshBasicMaterial({ map: fadeTexture, transparent: true, depthWrite: false })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.set(x, 0.07, z); // Strax ovanför marken, vägarna och parkeringsfickorna.
  scene.add(fade);
}
makeEdgeFade(HUB_X, HUB_Z, PALETTE.background); // Hemvärldens kant.

// Så långt från mitten bilen får köra: fram till där toningen börjar.
// GROUND_SIZE / 2 = avståndet från mitten till kanten.
const DRIVE_RADIUS = (GROUND_SIZE / 2) * FADE_START;

// ---------------------------------------------------------------------------
// VÄRLDAR – hemvärlden och de världar man kan köra till.
// ---------------------------------------------------------------------------
// Alla världar ligger i samma scen, bara väldigt långt ifrån varandra (1000 enheter).
// Kameran ser bara 400 enheter bort (se KAMERA), så från en värld syns aldrig någon
// annan. Att "resa" är alltså bara att flytta bilen dit – bakom en toning, så att
// hoppet inte syns.
//   title      – namnet på skylten vid ingången som leder dit.
//   x, z       – världens mitt.
//   background – färgen runt marken (och toningen när man reser dit).
//   accent     – världens "lysande" färg: ljuset längst in i grottan dit, teleportplattan
//                där och gatlyktornas sken.
//   rowStart   – (bara hemma) var första projektskylten står. I de andra världarna
//                räknas raden ut automatiskt, centrerad ovanför teleportplattan.
// (Definieras här uppe, före PROJEKT, eftersom varje projekt talar om vilken värld det står i.)
const WORLDS = {
  hub: { title: 'Home', x: HUB_X, z: HUB_Z, background: PALETTE.background, accent: PALETTE.warmLamp, rowStart: { x: 20, z: -10 } },
  techart: { title: 'Tech Art', x: 1000, z: 0, background: PALETTE.techBackground, accent: PALETTE.techGridMain },
  prog: { title: 'Programming', x: 0, z: 1000, background: PALETTE.progBackground, accent: PALETTE.progTrace },
  art: { title: 'Art', x: -1000, z: 0, background: PALETTE.artBackground, accent: PALETTE.artAccent },
};

// ---------------------------------------------------------------------------
// PROJEKT – listan som bestämmer vilka skyltar som finns. ÄNDRA HÄR.
// ---------------------------------------------------------------------------
// Alla projekt från filip.renemark.se. Texterna i assets/content/ är hämtade från
// sidans egna inlägg, och korta klipp till skärmarna ligger i assets/videos och assets/images.
// Varje { ... } är ett projekt = en skylt i världen.
//   world – vilken värld skylten står i (se VÄRLDAR). Skyltarna i en värld ställs
//           på rad i samma ordning som i listan, så ÄNDRA ORDNINGEN här för att flytta dem.
//   title – texten ovanför skärmen.
//   media – filen som visas på skärmen när bilen står framför skylten:
//           .mp4 / .webm = video, .gif = animerad gif, .png / .jpg = stillbild,
//           null = ingen fil än (en "play"-symbol visas).
//           Video är att föredra: mycket mindre filer än gif och lättare för datorn.
//   url   – projektets egen sida på filip.renemark.se. Länkas längst ner i infopanelen. null = ingen länk.
//   category – liten etikett överst i infopanelen.
//   content  – textfilen (HTML) som visas i infopanelen när man trycker Enter/Tab på parkeringsrutan.
//   phone – true = klippet är filmat på höjden (mobilformat). Skylten byggs då
//           som en jättelik mobiltelefon i stället för en liggande bioduk.
//   linkText – texten på länken längst ner i infopanelen. Utelämnad = "Open the full page →".
// Lägg till en rad för en ny skylt, ta bort en rad för att ta bort en.
// (Var skylten står, x och z, räknas ut automatiskt nedan.)
const PROJECTS = [
  // --- Hemma: de fem främsta, längs huvudvägen från garaget (vänster) mot Tech Art-grottan (höger). ---
  { world: WORLDS.hub, title: 'Camilla — Procedural Robot', media: 'assets/videos/camilla-robots.mp4', url: 'https://filip.renemark.se/misc/1544', category: '★ Freelance · Houdini · Procedural · VFX', content: 'assets/content/camilla.html' },
  { world: WORLDS.hub, title: 'Foliage Generator', media: 'assets/videos/foliage-generator.mp4', url: 'https://filip.renemark.se/misc/folliage-generator', category: 'Houdini · Procedural · Unreal', content: 'assets/content/foliage-generator.html' },
  { world: WORLDS.hub, title: 'Water Shader', media: 'assets/videos/water-shader.mp4', url: 'https://filip.renemark.se/shaders-rendering/project-water-shader', category: 'Shaders · Real-Time Rendering', content: 'assets/content/water-shader.html' },
  { world: WORLDS.hub, title: 'SpookChester — Pixelart Render', media: 'assets/videos/spookchester.mp4', url: 'https://filip.renemark.se/misc/spookchester-pixelart-render', category: 'Houdini · Procedural · Pipeline', content: 'assets/content/spookchester.html' },
  { world: WORLDS.hub, title: 'Mutation Protocol', media: 'assets/videos/mutation-protocol.mp4', url: 'https://filip.renemark.se/misc/mutation-protocol', category: '★ Freelance · Houdini · Rigging · Animation', content: 'assets/content/mutation-protocol.html', phone: true },

  // --- Tech Art-världen ---
  { world: WORLDS.techart, title: 'VAT Fluid Pipeline', media: 'assets/videos/vat-fluid.mp4', url: 'https://filip.renemark.se/misc/bar-fluid', category: 'Houdini · VAT · VFX · Simulation', content: 'assets/content/vat-fluid.html' },
  { world: WORLDS.techart, title: 'Humanoid Rig', media: 'assets/videos/humanoid-rig.mp4', url: 'https://filip.renemark.se/misc/humanoid-rigg', category: 'Rigging · Animation · Pipeline', content: 'assets/content/humanoid-rig.html' },
  { world: WORLDS.techart, title: 'Spite: Catharsis', media: 'assets/images/spite-rubble.gif', url: 'https://filip.renemark.se/misc/spite-catharsis', category: 'VFX · HLSL · Pipeline · Tools', content: 'assets/content/spite-catharsis.html' },
  { world: WORLDS.techart, title: 'Modular Farming Toolkit', media: 'assets/videos/farming-toolkit.mp4', url: 'https://filip.renemark.se/misc/farming-pack', category: 'Environment · Shaders · VFX', content: 'assets/content/farming-toolkit.html' },

  // --- Programming-världen ---
  { world: WORLDS.prog, title: 'Idle Village', media: 'assets/images/idle-village.gif', url: 'https://filip.renemark.se/misc/idle-village', category: 'C# · Unity · AI · Tools', content: 'assets/content/idle-village.html', phone: true },
  { world: WORLDS.prog, title: 'Harmonies Ascendent', media: 'assets/images/harmonies-ascendent.gif', url: 'https://filip.renemark.se/c-programming-unity/project-harmonies-ascendent-reflection', category: 'C# · Unity · HLSL', content: 'assets/content/harmonies-ascendent.html' },
  { world: WORLDS.prog, title: 'OpenGL Foundation', media: 'assets/images/opengl-foundation.gif', url: 'https://filip.renemark.se/shaders-rendering/project-opengl-foundation', category: 'C++ · OpenGL · GLSL', content: 'assets/content/opengl-foundation.html' },

  // --- Art-världen ---
  { world: WORLDS.art, title: 'Cat Jam', media: 'assets/videos/cat-jam.mp4', url: 'https://filip.renemark.se/misc/cat-jam', category: 'Character · Animation', content: 'assets/content/cat-jam.html' },
  { world: WORLDS.art, title: 'Realistic Sword', media: 'assets/videos/sword-turntable.mp4', url: 'https://filip.renemark.se/misc/sword', category: 'Props · Realistic · Textures', content: 'assets/content/realistic-sword.html' },
  { world: WORLDS.art, title: 'Last Year’s Bones', media: 'assets/videos/last-years-bones.mp4', url: 'https://filip.renemark.se/misc/last-years-bones', category: 'Character · Lighting · Mood', content: 'assets/content/last-years-bones.html' },
  { world: WORLDS.art, title: 'Procedural Material', media: 'assets/videos/material.mp4', url: 'https://filip.renemark.se/misc/material', category: 'Substance Designer · Materials', content: 'assets/content/procedural-material.html' },
];

// ---------------------------------------------------------------------------
// SKYLTAR – en "drive-in-bio" per projekt: stolpar, skärm, textskylt och en
// parkeringsruta på marken framför. Kör in i rutan så startar skärmen.
// ---------------------------------------------------------------------------
const SCREEN_WIDTH = 8;    // Skärmens bredd i enheter.
const SCREEN_HEIGHT = 4.5; // 8 x 4.5 = formatet 16:9, samma som vanlig video.
const POST_HEIGHT = 2.5;   // Hur högt över marken skärmens underkant sitter.
const SIGN_HEIGHT = 1.1;   // Textskyltens höjd.
const SCREEN_TILT = 0.3;   // Hur mycket skärmen lutar bakåt, i radianer (ca 17°).
const PAD_DISTANCE = 6;    // Hur långt framför skylten parkeringsrutan ligger.
const PAD_RADIUS = 4;      // Hur nära rutans mitt bilen måste vara för att skärmen ska starta.

const PHONE_WIDTH = 4;     // Mobilskyltens skärm: 4 x 7.1 = formatet 9:16 (stående).
const PHONE_HEIGHT = 7.1;

// Skärmens bild i pixlar: 960 på långsidan, 540 på kortsidan.
// Större = skarpare men tyngre för datorn.
const SCREEN_PIXELS_LONG = 960;
const SCREEN_PIXELS_SHORT = 540;

// Alla skyltar vrids så att de vetter mot kameran. Kameran står alltid åt
// samma håll från bilen (cameraOffset), så samma vinkel fungerar överallt.
// Math.atan2(x, z) gör om en riktning till en vinkel runt Y-axeln.
const BILLBOARD_FACING = Math.atan2(cameraOffset.x, cameraOffset.z);

// --- Var skyltarna står ---
// I varje värld står skyltarna på en rad, från vänster till höger på skärmen, i
// samma ordning som i PROJECTS. (towardCamera och toTheRight finns längre ner, vid
// HEMMA. En "function" går att använda redan innan raden där den skrivs.)
const BILLBOARD_SPACING = 14.14; // Avstånd mellan två skyltar längs raden.
const ROW_UP = 14;               // I de andra världarna: hur långt uppåt på skärmen från mitten raden står.
for (const world of Object.values(WORLDS)) { // Object.values = alla världar i WORLDS som en lista.
  const row = PROJECTS.filter((project) => project.world === world);
  // Hemma står första skylten på en bestämd plats. I de andra världarna centreras
  // raden ovanför mitten: första skylten flyttas halva radens längd åt vänster.
  const start = world.rowStart || toTheRight(towardCamera(world, -ROW_UP), (-(row.length - 1) / 2) * BILLBOARD_SPACING);
  row.forEach((project, i) => {
    const spot = toTheRight(start, i * BILLBOARD_SPACING);
    project.x = spot.x;
    project.z = spot.z;
  });
}

const postMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.trunk, roughness: 1 });
const frameMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.8 });

// --- Att rita på en skärm ---
// Varje skylt har en egen osynlig canvas som är skärmens bild (960 x 540 pixlar,
// eller 540 x 960 för en mobilskylt). Allt som ska visas – play-symbol,
// laddningssnurra, video, gif, stillbild – ritas i den, och canvasen används
// som textur. Då fungerar alla filtyper på samma sätt.
// brush.canvas är canvasen som pennan hör till; därifrån läses bredd och höjd.

// Play-symbolen som visas när skärmen är avstängd.
function drawPlaceholder(brush) {
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  brush.fillStyle = PALETTE.glass;
  brush.fillRect(0, 0, width, height); // fillRect(x, y, bredd, höjd).
  // En triangel ritas som en "stig" (path) mellan tre punkter som sedan fylls.
  // Punkterna räknas från mitten (cx, cy), så symbolen hamnar rätt oavsett skärmens form.
  const cx = width / 2;
  const cy = height / 2;
  brush.fillStyle = PALETTE.speckle;
  brush.beginPath();
  brush.moveTo(cx - 50, cy - 80); // Övre vänstra hörnet.
  brush.lineTo(cx - 50, cy + 80); // Nedre vänstra hörnet.
  brush.lineTo(cx + 80, cy);      // Spetsen till höger.
  brush.fill();
}

// Laddningssnurran som visas medan klippet hämtas: en båge som snurrar runt mitten.
// Den ritas om varje bild, lite mer vriden varje gång.
function drawLoading(billboard) {
  const brush = billboard.brush;
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  brush.fillStyle = PALETTE.glass; // Samma bakgrund som play-symbolen, så bytet inte blinkar.
  brush.fillRect(0, 0, width, height);
  // performance.now() = millisekunder sedan sidan laddades. Gånger 0.006 ger
  // en vinkel som ökar med ungefär ett varv per sekund.
  const angle = performance.now() * 0.006;
  brush.strokeStyle = PALETTE.speckle;
  brush.lineWidth = 16;
  brush.lineCap = 'round'; // Runda ändar på linjen.
  brush.beginPath();
  // arc(mitt x, mitt y, radie, startvinkel, slutvinkel): en bit av en cirkel,
  // här tre fjärdedels varv (1.5 * PI).
  brush.arc(width / 2, height / 2, 60, angle, angle + Math.PI * 1.5);
  brush.stroke();
  billboard.texture.needsUpdate = true;
}

// Ritar en bild (video, gif-bild eller stillbild) på en skylts skärm.
// Bilden förminskas så att HELA får plats, med mörka kanter om formatet inte stämmer.
//   source = det som ska ritas, width/height = dess storlek i pixlar.
function drawOnScreen(billboard, source, width, height) {
  const brush = billboard.brush;
  const screenWidth = brush.canvas.width;
  const screenHeight = brush.canvas.height;
  brush.fillStyle = PALETTE.frame;
  brush.fillRect(0, 0, screenWidth, screenHeight);
  // Hur mycket bilden måste krympas för att få plats på bredden och på höjden.
  // Math.min väljer den minsta av de två, så att den får plats åt båda hållen.
  const scale = Math.min(screenWidth / width, screenHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  // drawImage(bild, x, y, bredd, höjd). x och y räknas ut så att bilden hamnar i mitten.
  brush.drawImage(source, (screenWidth - drawWidth) / 2, (screenHeight - drawHeight) / 2, drawWidth, drawHeight);
  // Säger till three.js att canvasen har ändrats och måste skickas till grafikkortet igen.
  billboard.texture.needsUpdate = true;
}

// --- Spelare ---
// En "spelare" är ett objekt med tre funktioner:
//   play()        – starta uppspelningen.
//   update(delta) – körs varje bild medan bilen står i rutan.
//   stop()        – sluta spela OCH släpp filen ur minnet.
// En spelare lever bara medan bilen står i rutan. När bilen kör därifrån stoppas
// den och kastas bort, och en ny skapas nästa gång. Då ligger aldrig mer än ett
// klipp i minnet åt gången.
// Det finns en sort per filtyp, men resten av koden behöver inte veta vilken
// sort det är – den anropar bara samma tre funktioner.

// Video: ett osynligt <video>-element spelar filen, och varje bild kopieras till skärmen.
function makeVideoPlayer(billboard) {
  const video = document.createElement('video');
  video.src = billboard.project.media;
  video.loop = true;        // Börja om när den tar slut.
  video.muted = true;       // Webbläsare tillåter bara automatisk start om ljudet är av.
  video.playsInline = true; // Hindrar mobiler från att öppna videon i helskärm.
  let started = false;      // Blir true när videon faktiskt har börjat visa bilder.
  return {
    // play() kan nekas av webbläsaren; .catch gör att det inte blir ett fel i så fall.
    play() { video.play().catch(() => {}); },
    stop() {
      video.pause();
      // Ta bort filen från video-elementet och be det ladda om (nu utan fil).
      // Det är så man får webbläsaren att släppa en video ur minnet.
      video.removeAttribute('src');
      video.load();
    },
    update() {
      // Videon räknas som igång när tiden har börjat gå (currentTime över 0).
      // Innan dess finns ingen riktig bild att visa, bara svart.
      if (video.currentTime > 0) started = true;
      if (started) {
        drawOnScreen(billboard, video, video.videoWidth, video.videoHeight);
      } else {
        drawLoading(billboard); // Visa snurran tills första bilden finns.
      }
    },
  };
}

// Gif: webbläsaren kan inte spela en gif på en 3D-yta, så vi spelar den själva.
// En gif är en lista av bilder med en väntetid efter varje. Biblioteket gifuct-js
// packar upp bilderna, och vi ritar nästa bild när väntetiden har gått.
function makeGifPlayer(billboard) {
  let gif = null;   // Den inlästa filen. null tills den har laddats klart.
  let frames = [];  // Gif-filens bilder (fortfarande hoppackade).
  let index = -1;   // Vilken bild som visas nu. -1 = ingen än.
  let wait = 0;     // Sekunder kvar tills nästa bild ska visas.
  let stopped = false; // Blir true när bilen har kört därifrån.

  // "full" är hela gif-bilden i sin riktiga storlek. "patch" är en liten bit:
  // många gif-bilder innehåller bara den del som ändrats sedan förra bilden.
  const full = document.createElement('canvas');
  const fullBrush = full.getContext('2d');
  const patch = document.createElement('canvas');
  const patchBrush = patch.getContext('2d');

  // fetch hämtar filen i bakgrunden. .then(...) körs när förra steget är klart,
  // så resten av programmet fortsätter under tiden.
  fetch(billboard.project.media)
    .then((response) => response.arrayBuffer()) // Filens innehåll som råa bytes.
    .then((buffer) => {
      // Hann bilen köra därifrån innan filen laddats klart? Strunta då i den.
      if (stopped) return;
      gif = parseGIF(buffer);
      frames = gif.frames.filter((frame) => frame.image); // Behåll bara delarna som är bilder.
      full.width = gif.lsd.width;   // lsd = gif-filens huvud, där storleken står.
      full.height = gif.lsd.height;
    });

  function showNextFrame() {
    const previous = frames[index]; // Bilden som visas just nu (saknas första gången).
    index = (index + 1) % frames.length; // % = rest vid division: efter sista bilden blir det 0 igen.

    if (index === 0) {
      // Ny runda: börja med en tom bild.
      fullBrush.clearRect(0, 0, full.width, full.height);
    } else if (previous.gce && previous.gce.extras.disposal === 2) {
      // Vissa gif-bilder säger "sudda ut mig innan nästa ritas" (disposal 2).
      const d = previous.image.descriptor;
      fullBrush.clearRect(d.left, d.top, d.width, d.height);
    }

    // Packa upp den här bildens pixlar och rita biten på rätt plats i hela bilden.
    const frame = decompressFrame(frames[index], gif.gct, true);
    patch.width = frame.dims.width;
    patch.height = frame.dims.height;
    patchBrush.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
    fullBrush.drawImage(patch, frame.dims.left, frame.dims.top);

    wait += frame.delay / 1000; // Väntetiden står i millisekunder; / 1000 ger sekunder.
    drawOnScreen(billboard, full, full.width, full.height);
  }

  return {
    play() {}, // Inget att starta: gif-filen går framåt varje gång update anropas.
    stop() {
      stopped = true;
      // Släpp filen och bilderna. När inget längre pekar på dem städar
      // webbläsaren själv bort dem ur minnet ("garbage collection").
      gif = null;
      frames = [];
      // En canvas utan storlek tar inget minne.
      full.width = 0;
      full.height = 0;
      patch.width = 0;
      patch.height = 0;
    },
    update(delta) {
      if (frames.length === 0) {
        drawLoading(billboard); // Filen har inte laddats klart än: visa snurran.
        return;
      }
      wait -= delta;
      if (wait <= 0) {
        wait = Math.max(wait, -0.1); // Försök inte "ta igen" tid efter ett långt hack.
        showNextFrame();
      }
    },
  };
}

// Stillbild: laddas och ritas en enda gång.
function makeImagePlayer(billboard) {
  const image = new Image();
  let loaded = false;
  // onload körs när bilden har laddats klart.
  image.onload = () => {
    loaded = true;
    drawOnScreen(billboard, image, image.width, image.height);
  };
  image.src = billboard.project.media;
  return {
    play() {},
    update() {
      if (!loaded) drawLoading(billboard); // Visa snurran tills bilden är laddad.
    },
    stop() {
      image.onload = null; // Rita inte om bilden hinner laddas efter att vi lämnat.
      image.src = '';
    },
  };
}

// Väljer rätt sorts spelare utifrån filnamnets slut.
function makePlayer(billboard) {
  const media = billboard.project.media.toLowerCase(); // Små bokstäver, så att .MP4 också fungerar.
  if (media.endsWith('.mp4') || media.endsWith('.webm')) return makeVideoPlayer(billboard);
  if (media.endsWith('.gif')) return makeGifPlayer(billboard);
  return makeImagePlayer(billboard);
}

// Gör en textur med projektets namn, till skylten ovanför skärmen.
// lit = true ger samma skylt men med tänd (orange) text, när bilen står i rutan.
function makeTitleTexture(title, lit = false) {
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
  brush.textAlign = 'center';     // x nedan betyder textens mitt...
  brush.textBaseline = 'middle';  // ...och y betyder textens mitt på höjden.
  brush.fillText(title, image.width / 2, image.height / 2);

  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Skarpare text sedd snett.
  return texture;
}

// Parkeringsrutans text: ordet ENTER på genomskinlig bakgrund. Den ligger ovanpå
// asfalten i en parkeringsficka (se makeParkingBay nedan).
// lit = true ger samma text i tänd orange, när bilen står i fickan.
// Samma två texturer delas av alla fickor.
function makePadTexture(lit) {
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 256;
  const brush = image.getContext('2d');
  // Inget fillRect över hela bilden = bakgrunden förblir genomskinlig.
  brush.fillStyle = lit ? PALETTE.signGlow : PALETTE.sign; // Grädde på mörk asfalt, orange när den är tänd.
  brush.font = 'bold 96px system-ui, sans-serif';
  brush.textAlign = 'center';
  brush.textBaseline = 'middle';
  brush.fillText('ENTER', 256, 134);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
const padTexture = makePadTexture(false);
const padTextureActive = makePadTexture(true);

// --- Parkeringsfickan ---
// En mörk asfaltsruta med målade linjer, stor nog för en bil. Den skiljer sig
// tydligt från grusvägarna: grus = här kör man, asfalt = här parkerar man och
// trycker Enter. Linjerna är öppna i änden mot vägen, som en riktig parkeringsplats.
//
// För att fickan ska smälta ihop med infarten tonas asfalten över i grus i änden
// mot vägen, och fickan har samma bredd och samma mörka kantlinje som vägarna.
const BAY_WIDTH = 5.4; // Samma som en väg inklusive kantlinjer (ROAD_WIDTH + 2 * ROAD_EDGE).
const BAY_LENGTH = 6.5;
const bayImage = document.createElement('canvas');
bayImage.width = 270;  // 50 pixlar per enhet: 5.4 x 6.5 enheter.
bayImage.height = 325;
const bayPen = bayImage.getContext('2d');
const bayW = bayImage.width;  // Korta namn, de används många gånger nedan.
const bayH = bayImage.height;
// I bilden är y = 0 änden mot skylten och y = bayH änden mot vägen (infarten).
const BLEND_START = bayH * 0.6; // Härifrån och ner till infarten tonas asfalten över i grus.

// 1. Asfalt över hela ytan, med små ljusa korn.
bayPen.fillStyle = PALETTE.asphalt;
bayPen.fillRect(0, 0, bayW, bayH);
bayPen.fillStyle = PALETTE.asphaltLight;
for (let i = 0; i < 350; i++) {
  bayPen.fillRect(Math.random() * bayW, Math.random() * bayH, 3, 3);
}

// 2. Toning mot grus: en gradient (mjuk övergång) från genomskinlig till grusfärg.
// createLinearGradient(x1, y1, x2, y2) tonar längs linjen mellan de två punkterna.
const bayBlend = bayPen.createLinearGradient(0, BLEND_START, 0, bayH);
bayBlend.addColorStop(0, 'rgba(183, 160, 138, 0)'); // 183, 160, 138 = grusfärgen #b7a08a, helt genomskinlig.
bayBlend.addColorStop(1, 'rgba(183, 160, 138, 1)'); // Samma färg, helt täckande.
bayPen.fillStyle = bayBlend;
bayPen.fillRect(0, BLEND_START, bayW, bayH - BLEND_START);

// 3. Småsten som "spiller in" från vägen: tätt vid infarten, glesare längre in.
// Math.random() gånger sig själv ger oftare små tal än stora, så de flesta
// stenarna hamnar nära nederkanten.
for (let i = 0; i < 320; i++) {
  bayPen.fillStyle = i % 2 === 0 ? PALETTE.gravelLight : PALETTE.gravelDark;
  const size = 2.5 + Math.random() * 4.5;
  const y = bayH - Math.random() * Math.random() * (bayH - BLEND_START) * 1.3;
  bayPen.fillRect(Math.random() * bayW, y, size, size);
}

// 4. Tre målade linjer: vänster, överkant (mot skylten) och höger. De slutar där
// toningen börjar, så att infarten är öppen – som en riktig parkeringsplats.
bayPen.strokeStyle = PALETTE.sign;
bayPen.lineWidth = 8;
bayPen.lineCap = 'round'; // Runda ändar på linjerna.
bayPen.beginPath();
bayPen.moveTo(24, BLEND_START);        // Nere till vänster...
bayPen.lineTo(24, 24);                 // ...upp...
bayPen.lineTo(bayW - 24, 24);          // ...tvärs över...
bayPen.lineTo(bayW - 24, BLEND_START); // ...och ner till höger.
bayPen.stroke();

// 5. Mörk kantlinje till vänster, höger och upptill – samma som vägarnas kant
// (10 pixlar = 0.2 enheter), så att fickan ser ut som en fortsättning på vägen.
bayPen.fillStyle = PALETTE.gravelDark;
bayPen.fillRect(0, 0, 10, bayH);
bayPen.fillRect(bayW - 10, 0, 10, bayH);
bayPen.fillRect(0, 0, bayW, 10);
const bayTexture = new THREE.CanvasTexture(bayImage);
bayTexture.colorSpace = THREE.SRGBColorSpace;
bayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
// depthTest/depthWrite: false = ett "lager på marken", se förklaringen vid MARK.
const bayMaterial = new THREE.MeshLambertMaterial({ map: bayTexture, depthTest: false, depthWrite: false });

// Ger en ny parkeringsficka, liggande på marken. Den som anropar bestämmer var den hamnar.
function makeParkingBay() {
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(BAY_WIDTH, BAY_LENGTH), bayMaterial);
  bay.rotation.x = -Math.PI / 2; // Lägg planet ner på marken.
  bay.position.y = 0.035;        // Över grusvägarna, under ENTER-texten.
  bay.renderOrder = -5;          // Ritas efter mark och grus, före allt som står på marken.
  return bay;
}

// Här sparas allt som behövs om varje skylt medan programmet kör.
const billboards = [];

// Bygg en skylt för varje projekt i listan.
for (const project of PROJECTS) {
  const group = new THREE.Group();

  // Skyltens mått beror på om den är en liggande bioduk eller en stående mobil.
  // "villkor ? a : b" = a om sant, annars b.
  const isPhone = project.phone === true;
  const width = isPhone ? PHONE_WIDTH : SCREEN_WIDTH;
  const height = isPhone ? PHONE_HEIGHT : SCREEN_HEIGHT;
  const border = isPhone ? 0.25 : 0.2;        // Ramens bredd runt skärmen. Mobilen har lite tjockare kant.
  const baseY = isPhone ? 0.1 : POST_HEIGHT;  // Panelens underkant: mobilen står direkt på marken.

  // Bioduken står på två stolpar, en på var sida. Mobilen har inga.
  if (!isPhone) {
    for (const x of [-3, 3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, POST_HEIGHT, 0.3), postMaterial);
      post.position.set(x, POST_HEIGHT / 2, -0.16); // Mitten = halva höjden, så botten står på marken.
      group.add(post);
    }
  }

  // Panelen = allt som lutar: ram, skärm och textskylt. Gruppen sitter vid
  // panelens underkant, så lutningen sker runt den kanten som ett gångjärn.
  const panel = new THREE.Group();
  panel.position.y = baseY;
  panel.rotation.x = -SCREEN_TILT; // Minus = överkanten lutar bakåt, skärmen vänds uppåt mot kameran.
  group.add(panel);

  // Ram: en platt låda lite större än skärmen, precis bakom den.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + border * 2, height + border * 2, 0.3),
    frameMaterial
  );
  frame.position.set(0, height / 2 + border, -0.16);
  panel.add(frame);

  // Skärmens bild: en egen canvas per skylt, med play-symbolen från början.
  // Mobilen får en stående canvas (540 x 960), bioduken en liggande (960 x 540).
  const screenImage = document.createElement('canvas');
  screenImage.width = isPhone ? SCREEN_PIXELS_SHORT : SCREEN_PIXELS_LONG;
  screenImage.height = isPhone ? SCREEN_PIXELS_LONG : SCREEN_PIXELS_SHORT;
  const brush = screenImage.getContext('2d');
  drawPlaceholder(brush);
  const texture = new THREE.CanvasTexture(screenImage);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps är förminskade kopior av texturen. De räknas om varje gång bilden
  // ändras, vilket är onödigt arbete för en video. LinearFilter klarar sig utan dem.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  // Skärm: ett plan med canvasen som textur. MeshBasicMaterial = alltid full
  // ljusstyrka, som en riktig skärm. Färgen gångras med texturen: grå = nedtonad
  // (avstängd), vit = full styrka (påslagen).
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, color: '#777777' });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial);
  screen.position.set(0, height / 2 + border, 0);
  panel.add(screen);

  // Textskylt ovanför skärmen. Över mobilen är den lite smalare (6 i stället för 8),
  // och höjden krymper lika mycket så att texten inte blir utdragen.
  const signWidth = isPhone ? 6 : SCREEN_WIDTH;
  const signHeight = SIGN_HEIGHT * (signWidth / SCREEN_WIDTH);
  // Två texturer per skylt: vanlig och markerad (när bilen står i rutan). Byts i updateBillboards.
  const titleTexture = makeTitleTexture(project.title);
  const titleTextureActive = makeTitleTexture(project.title, true);
  const signMaterial = new THREE.MeshBasicMaterial({ map: titleTexture });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), signMaterial);
  sign.position.set(0, height + border * 2 + 0.2 + signHeight / 2, 0);
  panel.add(sign);

  // Parkeringsficka på marken framför skylten, med ENTER-texten ovanpå.
  const bay = makeParkingBay();
  bay.position.z = PAD_DISTANCE;
  group.add(bay);
  // transparent: true behövs för att genomskinliga delar av texturen ska synas igenom.
  // opacity: 0.6 = lite nedtonad tills bilen står i fickan.
  const padMaterial = new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.6 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), padMaterial);
  pad.rotation.x = -Math.PI / 2;          // Lägg planet ner på marken.
  pad.position.set(0, 0.05, PAD_DISTANCE); // 0.05 upp, annars flimrar den mot asfalten.
  group.add(pad);

  group.position.set(project.x, 0, project.z);
  group.rotation.y = BILLBOARD_FACING;
  scene.add(group);

  billboards.push({
    project,        // Kortform för project: project.
    brush,          // Pennan till skärmens canvas.
    texture,        // Skärmens textur.
    screenMaterial,
    padMaterial,
    signMaterial,
    titleTexture,
    titleTextureActive,
    // Parkeringsrutans mitt i VÄRLDEN. Rutan ligger PAD_DISTANCE framför skylten,
    // åt det håll skylten vetter. sin/cos gör om vinkeln till en riktning (som för bilen).
    padX: project.x + Math.sin(BILLBOARD_FACING) * PAD_DISTANCE,
    padZ: project.z + Math.cos(BILLBOARD_FACING) * PAD_DISTANCE,
    glowY: baseY + height / 2, // Skärmens mitt i höjdled. Därifrån lyser skenet (se screenGlow).
    player: null,   // Spelaren. Finns bara medan bilen står i rutan, annars null.
    active: false,  // Står bilen i rutan just nu?
  });
}

// Guidens andra rad (se index.html). getElementById letar upp ett element på dess id.
const guideEnter = document.getElementById('guideEnter');
const guideText = document.getElementById('guideText');

// Visar raden "Enter / Tab – Read more: ..." för ett projekt, eller gömmer den om project är null.
// Mobilens "Read more"-knapp (se index.html) följer samma regel som guideraden.
const touchAction = document.getElementById('touchAction');

function showGuide(project) {
  if (project && project.content) {
    guideText.textContent = `Read more: ${project.title}`; // textContent = elementets text.
    guideEnter.hidden = false;
    touchAction.textContent = 'Read more'; // Kort text: titeln syns redan på skylten.
    touchAction.hidden = false;
  } else {
    guideEnter.hidden = true;
    touchAction.hidden = true;
  }
}

// --- Skärmens sken ---
// En skärm som är igång lyser upp marken och bilen framför sig. Bara en skärm kan
// vara igång åt gången, så det räcker med EN lampa som flyttas till den skärmen.
// Styrka 0 = släckt tills bilen står i en ficka.
// Styrkan är högre än övriga lampor eftersom skärmens medelfärg ofta är ganska mörk.
const SCREEN_GLOW_STRENGTH = 450; // ÄNDRA för starkare/svagare sken.
const screenGlow = new THREE.SpotLight(PALETTE.screenGlow, 0, 22, 0.75, 1);
scene.add(screenGlow, screenGlow.target);
let glowingBillboard = null; // Vilken skylt lampan sitter på just nu.

// Skenets färg följer det som visas på skärmen: en grön skog ger grönt sken, ett
// blått hav blått. För att få fram "skärmens färg" ritas hela skärmbilden ihoptryckt
// till en enda pixel – den pixeln blir då medelvärdet av alla färger i bilden.
const glowSampler = document.createElement('canvas');
glowSampler.width = 1;
glowSampler.height = 1;
// willReadFrequently säger till webbläsaren att vi läser av pixlar ofta, så att den väljer det snabbaste sättet.
const glowSamplerPen = glowSampler.getContext('2d', { willReadFrequently: true });
const glowTargetColor = new THREE.Color(PALETTE.screenGlow); // Färgen skenet är på väg mot.
const GLOW_SAMPLE_TIME = 0.15; // Sekunder mellan avläsningarna. Räcker gott och sparar arbete.
let glowSampleWait = 0;
let glowJustStarted = false; // true precis när bilen kört in, fram till första avläsningen.

function updateScreenGlow(delta) {
  if (!glowingBillboard) return; // Ingen skärm är igång.
  glowSampleWait -= delta;
  if (glowSampleWait <= 0) {
    glowSampleWait = GLOW_SAMPLE_TIME;
    // Rita skärmens hela bild i den enda pixeln och läs av den.
    glowSamplerPen.drawImage(glowingBillboard.brush.canvas, 0, 0, 1, 1);
    // getImageData ger pixelns färg som fyra tal 0–255: rött, grönt, blått, täckning.
    const [red, green, blue] = glowSamplerPen.getImageData(0, 0, 1, 1).data;
    // THREE.Color räknar 0–1, därav / 255. SRGBColorSpace = talen är vanliga skärmfärger.
    glowTargetColor.setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
    // Första avläsningen: hoppa direkt till rätt färg. Annars skulle skenet börja i
    // färgen från förra skärmen (eller startfärgen) och synas glida därifrån.
    if (glowJustStarted) {
      screenGlow.color.copy(glowTargetColor);
      glowJustStarted = false;
    }
  }
  // Skenet tonas in mjukt i stället för att slås på tvärt. damp(nu, mål, hastighet, delta)
  // flyttar värdet mjukt mot målet; 4 = ungefär en halv sekund.
  screenGlow.intensity = THREE.MathUtils.damp(screenGlow.intensity, SCREEN_GLOW_STRENGTH, 4, delta);
  // Glid mjukt mot den nya färgen i stället för att hoppa: 8 % av vägen varje bild.
  screenGlow.color.lerp(glowTargetColor, 0.08);
}

// Körs en gång per bild: kollar vilken ruta bilen står i och sköter skärmarna.
function updateBillboards(delta) {
  for (const billboard of billboards) {
    // Avståndet mellan bilen och rutans mitt (Pythagoras).
    const distance = Math.hypot(car.position.x - billboard.padX, car.position.z - billboard.padZ);
    const near = distance < PAD_RADIUS; // true eller false.

    // Bara när läget ÄNDRAS (bilen kör in eller ut) behöver något göras.
    if (near !== billboard.active) {
      billboard.active = near;
      // "villkor ? a : b" = a om sant, annars b.
      billboard.screenMaterial.color.set(near ? '#ffffff' : '#777777');
      billboard.padMaterial.opacity = near ? 1 : 0.6;
      // Tänd texten: rutan och titeln byter färg till orange medan bilen står där.
      billboard.padMaterial.map = near ? padTextureActive : padTexture;
      billboard.signMaterial.map = near ? billboard.titleTextureActive : billboard.titleTexture;
      showGuide(near ? billboard.project : null);
      if (!near && panelProject === billboard.project) closePanel();

      // Skärmens sken: flytta lampan till den här skärmens mitt och sikta på parkeringsfickan.
      if (near) {
        glowingBillboard = billboard;
        screenGlow.position.set(billboard.project.x, billboard.glowY, billboard.project.z);
        screenGlow.target.position.set(billboard.padX, 0, billboard.padZ);
        screenGlow.intensity = 0;  // Börjar släckt och tonas in i updateScreenGlow.
        glowSampleWait = 0;        // Läs av färgen direkt, vänta inte.
        glowJustStarted = true;
      } else if (glowingBillboard === billboard) {
        // Släck bara om det är just den här skärmens sken som lyser.
        glowingBillboard = null;
        screenGlow.intensity = 0;
      }

      if (near) {
        // Bilen körde in: skapa en spelare. Filen laddas alltså först nu, när den behövs.
        if (billboard.project.media) {
          billboard.player = makePlayer(billboard);
          billboard.player.play();
        }
      } else if (billboard.player) {
        // Bilen körde ut: stoppa, kasta spelaren och visa play-symbolen igen.
        billboard.player.stop();
        billboard.player = null;
        drawPlaceholder(billboard.brush);
        billboard.texture.needsUpdate = true;
      }
    }

    // Bara den skärm bilen står framför uppdateras. Resten står stilla och kostar ingenting.
    if (billboard.active && billboard.player) billboard.player.update(delta);
  }
  updateScreenGlow(delta);
}

// ---------------------------------------------------------------------------
// INFOPANELEN – en ruta till vänster med projektets text, bilder och videor.
// ---------------------------------------------------------------------------
// Enter eller Tab på en parkeringsruta öppnar den. Esc, Enter, Tab eller krysset stänger.
// Medan den är öppen står bilen still, så piltangenterna kan rulla texten i stället.
const panel = document.getElementById('panel');
const panelCategory = document.getElementById('panelCategory');
const panelTitle = document.getElementById('panelTitle');
const panelBody = document.getElementById('panelBody');
const panelLink = document.getElementById('panelLink');
let panelOpen = false;
let panelProject = null; // Vilket projekt panelen visar just nu.

// Hämtade textfiler sparas här, så att varje fil bara hämtas en gång.
const contentCache = new Map();

async function openPanel(project) {
  panelOpen = true;
  panelProject = project;
  keys.clear(); // Släpp alla körtangenter så att bilen inte fortsätter själv.
  panelCategory.textContent = project.category || '';
  panelTitle.textContent = project.title;
  panelBody.textContent = 'Loading…';
  panelBody.scrollTop = 0;
  panelLink.hidden = !project.url;
  if (project.url) panelLink.href = project.url;
  // "a || b" = a om det finns, annars b. → är pilen →.
  panelLink.textContent = project.linkText || 'Open the full page →';
  panel.hidden = false;
  document.body.classList.add('panel-open'); // CSS gömmer touchknapparna medan panelen är öppen.

  // fetch hämtar en fil från nätet/servern. await väntar tills den är klar.
  if (!contentCache.has(project.content)) {
    try {
      const response = await fetch(project.content);
      contentCache.set(project.content, response.ok ? await response.text() : null);
    } catch (error) {
      contentCache.set(project.content, null);
    }
  }
  // Användaren kan ha stängt panelen eller bytt projekt medan filen hämtades.
  if (panelProject !== project) return;
  const html = contentCache.get(project.content);
  // innerHTML tolkar texten som HTML. Filerna är våra egna, så det är säkert.
  if (html) panelBody.innerHTML = html;
  else panelBody.textContent = 'Could not load the text. Use the link below instead.';
}

function closePanel() {
  panelOpen = false;
  panelProject = null;
  panel.hidden = true;
  document.body.classList.remove('panel-open');
  panelBody.textContent = ''; // Släpper bilder och videor ur minnet.
  // Tangenter som hölls nedtryckta medan panelen var öppen ska inte styra bilen.
  keys.clear();
}

document.getElementById('panelClose').addEventListener('click', closePanel);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && panelOpen) {
    closePanel();
    return;
  }
  if (e.code !== 'Enter' && e.code !== 'Tab') return;
  if (introOpen) return; // Startskärmen sköter sina egna tangenter (se STARTSKÄRMEN).
  // Tab flyttar annars fokus mellan knappar och länkar. Vi vill använda den själva.
  e.preventDefault();
  if (e.repeat) return; // Håller man tangenten nere ska panelen inte blinka av och på.
  togglePanel();
});

// Öppnar panelen för skylten bilen står vid, eller stänger den om den redan är öppen.
// Används av både tangentbordet (Enter/Tab) och mobilens knapp.
function togglePanel() {
  if (panelOpen) {
    closePanel();
    return;
  }
  // .find ger det första i listan som uppfyller villkoret (eller ingenting).
  const billboard = billboards.find((b) => b.active);
  if (billboard && billboard.project.content) openPanel(billboard.project);
  // Ingen skylt? Står bilen på uppfarten hemma öppnas "About me" i stället.
  else if (home.active) openPanel(ABOUT);
}
touchAction.addEventListener('click', togglePanel);

// ---------------------------------------------------------------------------
// HEMMA – "About me": en stuga med garage, namnskylt på garaget och en brevlåda vid korsningen.
// ---------------------------------------------------------------------------
// Bilen startar på uppfarten utanför garaget. Så länge den står där öppnar
// Enter/Tab infopanelen med texten om mig.

// Det som infopanelen visar. Samma fält som ett projekt i PROJECTS-listan.
const ABOUT = {
  title: 'About me',
  category: 'Hello!',
  content: 'assets/content/about.html',
  url: 'mailto:filip@renemark.me',
  linkText: 'Email me →',
};

// Texten på namnskylten.
const HOME_NAME = 'Filip Renemark';
const HOME_ROLE = 'Technical Artist';

// Var tomten ligger på marken (uppfartens mitt). ÄNDRA HÄR för att flytta allt på en gång.
// Tomten ligger i samma rad som projektskyltarna, längst ut till vänster på skärmen.
// Besökaren startar alltså hemma och kör sedan åt höger längs huvudvägen, förbi projekten.
const HOME_X = 31.5;
const HOME_Z = -21.5;

// Allt läggs i en grupp som vrids mot kameran, precis som skyltarna. Inne i gruppen gäller:
//   +x = åt höger på skärmen, -x = åt vänster
//   +z = nedåt på skärmen (mot kameran), -z = uppåt (bort mot projektskyltarna)
const homeGroup = new THREE.Group();
homeGroup.position.set(HOME_X, 0, HOME_Z);
homeGroup.rotation.y = BILLBOARD_FACING;
scene.add(homeGroup);

// emissive = färg som ytan "lyser" med själv. Väggen mot kameran vetter bort från
// solen och blir annars grå; lite eget ljus håller den ljus.
const wallMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.sign, roughness: 0.9, emissive: PALETTE.sign, emissiveIntensity: 0.4 });
// Lack och glas delas med bilen längre ner: brevlådan har bilens lack, fönstret bilens glas.
// roughness: 0 = blank som en spegel, 1 = helt matt. metalness: 0 = plast, 1 = metall.
const paintMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.carPaint, roughness: 0.35, metalness: 0.3 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.2 });
const roofMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.leaves[0], roughness: 0.8, flatShading: true });

// --- Garaget: står mitt på tomten med porten mot kameran ---
// Bilen står parkerad framför porten, och uppfarten går därifrån nedåt på skärmen
// till huvudvägen – precis som infarten till en projektskylt.
const GARAGE_WIDTH = 5.6;
const GARAGE_DEPTH = 3.6;
const GARAGE_HEIGHT = 2.6;
const GARAGE_Z = 0; // Garagets mitt. Större z = längre ner på skärmen.

// Garaget har egna färger (grå betong, mörkt platt tak) så att det inte ser ut som en del av stugan.
const garageWallMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageWall, roughness: 1, emissive: PALETTE.garageWall, emissiveIntensity: 0.4 });
const garageRoofMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.garageRoof, roughness: 1 });

const garageWalls = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_WIDTH, GARAGE_HEIGHT, GARAGE_DEPTH), garageWallMaterial);
garageWalls.position.set(0, GARAGE_HEIGHT / 2, GARAGE_Z);
homeGroup.add(garageWalls);
// Platt tak: en tunn mörk skiva som sticker ut lite runt om.
const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(GARAGE_WIDTH + 0.5, 0.3, GARAGE_DEPTH + 0.5), garageRoofMaterial);
garageRoof.position.set(0, GARAGE_HEIGHT + 0.15, GARAGE_Z);
homeGroup.add(garageRoof);

// Garageport på väggen mot kameran: en ljus vikport med vågräta paneler och en rad små fönster.
const GARAGE_DOOR_WIDTH = 4.4;
const GARAGE_DOOR_HEIGHT = 2.1;
const doorImage = document.createElement('canvas');
doorImage.width = 440;  // 100 pixlar per enhet.
doorImage.height = 210;
const doorPen = doorImage.getContext('2d');
doorPen.fillStyle = PALETTE.garageDoor;
doorPen.fillRect(0, 0, doorImage.width, doorImage.height);
// Skarvarna mellan panelerna: fyra vågräta linjer.
doorPen.fillStyle = PALETTE.garageWall;
for (const y of [42, 84, 126, 168]) {
  doorPen.fillRect(0, y - 3, doorImage.width, 6);
}
// Fyra små fönster i den översta panelen.
doorPen.fillStyle = PALETTE.glass;
for (const x of [40, 140, 240, 340]) {
  doorPen.fillRect(x, 10, 60, 22);
}
// Handtag längst ner i mitten.
doorPen.fillStyle = PALETTE.frame;
doorPen.fillRect(doorImage.width / 2 - 30, 184, 60, 10);
const doorTexture = new THREE.CanvasTexture(doorImage);
doorTexture.colorSpace = THREE.SRGBColorSpace;
const garageDoor = new THREE.Mesh(
  new THREE.PlaneGeometry(GARAGE_DOOR_WIDTH, GARAGE_DOOR_HEIGHT),
  new THREE.MeshBasicMaterial({ map: doorTexture })
);
// Precis utanpå väggen (0.01), annars flimrar den mot väggen.
garageDoor.position.set(0, GARAGE_DOOR_HEIGHT / 2, GARAGE_Z + GARAGE_DEPTH / 2 + 0.01);
homeGroup.add(garageDoor);

// Det mörka hålet bakom porten. Det syns bara medan porten är "öppen" (gömd), när
// bilen backar ut i början. Ligger en aning närmare väggen (0.005) än porten (0.01).
const garageOpening = new THREE.Mesh(
  new THREE.PlaneGeometry(GARAGE_DOOR_WIDTH, GARAGE_DOOR_HEIGHT),
  new THREE.MeshBasicMaterial({ color: PALETTE.frame })
);
garageOpening.position.set(0, GARAGE_DOOR_HEIGHT / 2, GARAGE_Z + GARAGE_DEPTH / 2 + 0.005);
homeGroup.add(garageOpening);

// Lampa över garageporten: en liten lysande låda på väggen och en ljuskägla
// som lyser ner på parkeringen framför porten.
const garageLampBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 0.18, 0.25),
  new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }) // MeshBasicMaterial = alltid full färg, ser ut att lysa.
);
garageLampBox.position.set(0, GARAGE_DOOR_HEIGHT + 0.22, GARAGE_Z + GARAGE_DEPTH / 2 + 0.12);
homeGroup.add(garageLampBox);
// SpotLight(färg, styrka, räckvidd, vinkel, mjuk kant). ÄNDRA 70 för starkare/svagare lampa.
const garageLamp = new THREE.SpotLight(PALETTE.warmLamp, 70, 14, 0.8, 0.8);
garageLamp.position.set(0, GARAGE_DOOR_HEIGHT + 0.3, GARAGE_Z + GARAGE_DEPTH / 2 + 0.3);
// Siktar på marken 3.5 enheter framför porten.
garageLamp.target.position.set(0, 0, GARAGE_Z + GARAGE_DEPTH / 2 + 3.5);
homeGroup.add(garageLamp, garageLamp.target);

// --- Stugan, till höger om garaget ---
const CABIN_X = 5.6;   // Stugans mitt i sidled.
const CABIN_Z = 0;     // Samma djup som garaget, så att de står i rad.
const CABIN_SIZE = 5;  // Bredd och djup (kvadratisk).
const CABIN_HEIGHT = 3.8; // Högre än garaget (2.6), så att det röda taket reser sig över garagets.

const cabinWalls = new THREE.Mesh(new THREE.BoxGeometry(CABIN_SIZE, CABIN_HEIGHT, CABIN_SIZE), wallMaterial);
cabinWalls.position.set(CABIN_X, CABIN_HEIGHT / 2, CABIN_Z);
homeGroup.add(cabinWalls);

// Tak: en "kon" med bara 4 sidor är en pyramid. Den skapas med ett hörn framåt,
// så den vrids 45° (PI / 4) för att sidorna ska ligga längs väggarna.
// Radie 3.9 ger en sida på ca 5.5, alltså lite takfot utanför väggarna.
const cabinRoof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4), roofMaterial);
cabinRoof.rotation.y = Math.PI / 4;
cabinRoof.position.set(CABIN_X, CABIN_HEIGHT + 1, CABIN_Z); // Konens mitt = halva dess höjd (2 / 2) över väggarna.
homeGroup.add(cabinRoof);

// Skorsten: en liten låda som sticker upp genom taket.
const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), postMaterial);
chimney.position.set(CABIN_X - 1.2, CABIN_HEIGHT + 1, CABIN_Z - 0.8);
homeGroup.add(chimney);

// Dörr och fönster: tunna lådor på väggen som vetter mot kameran (mitten + halva djupet).
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.9, 0.1), postMaterial);
door.position.set(CABIN_X + 1.1, 0.95, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(door);
// Fönstret lyser varmt: någon är hemma. MeshBasicMaterial = alltid full färg.
const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), new THREE.MeshBasicMaterial({ color: PALETTE.windowGlow }));
cabinWindow.position.set(CABIN_X - 1, 1.6, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(cabinWindow);
// Ljuset som faller ut genom fönstret och ner på marken framför stugan.
// ÄNDRA 80 för starkare/svagare sken.
const windowLight = new THREE.SpotLight(PALETTE.warmLamp, 80, 12, 0.85, 0.9);
windowLight.position.set(CABIN_X - 1, 1.6, CABIN_Z + CABIN_SIZE / 2 + 0.2);      // Precis utanför rutan.
windowLight.target.position.set(CABIN_X - 1, 0, CABIN_Z + CABIN_SIZE / 2 + 3.5); // Marken 3.5 enheter framför.
homeGroup.add(windowLight, windowLight.target);

// (Själva uppfarten är en av grusvägarna, se VÄGAR längre ner.)

// Parkeringsfickan utanför garaget, samma som framför skyltarna. Här startar bilen.
const HOME_PAD_Z = PAD_DISTANCE; // Lika långt framför garaget som fickorna ligger framför skyltarna.
const homeBay = makeParkingBay();
homeBay.position.z = HOME_PAD_Z;
homeGroup.add(homeBay);
const homePadMaterial = new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.6 });
const homePad = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), homePadMaterial);
homePad.rotation.x = -Math.PI / 2; // Lägg planet ner på marken.
homePad.position.set(0, 0.05, HOME_PAD_Z);
homeGroup.add(homePad);

// --- Namnskylten: står på garagets tak, som skylten på en verkstad ---
const NAME_WIDTH = 5.4;
const NAME_HEIGHT = 1.98;
const nameImage = document.createElement('canvas');
nameImage.width = 960;
nameImage.height = 352; // Samma proportioner som skylten (5.4 x 1.98).
const namePen = nameImage.getContext('2d');
namePen.fillStyle = PALETTE.sign;
namePen.fillRect(0, 0, nameImage.width, nameImage.height);
namePen.textAlign = 'center';
namePen.textBaseline = 'middle';
namePen.fillStyle = PALETTE.signText;
namePen.font = 'bold 124px system-ui, sans-serif';
namePen.fillText(HOME_NAME, nameImage.width / 2, 130); // Namnet: stort och mörkt.
namePen.fillStyle = PALETTE.signGlow;
namePen.font = 'bold 76px system-ui, sans-serif';
namePen.fillText(HOME_ROLE, nameImage.width / 2, 258); // Rollen: orange, under namnet.
const nameTexture = new THREE.CanvasTexture(nameImage);
nameTexture.colorSpace = THREE.SRGBColorSpace;
nameTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

// Brädan sitter vid takets kant närmast kameran och lutar bakåt runt sin underkant,
// som skyltarnas skärmar, så att kameran ser texten rakt.
const nameBoard = new THREE.Group();
nameBoard.position.set(0, GARAGE_HEIGHT + 0.3, GARAGE_Z + GARAGE_DEPTH / 2 - 0.3);
nameBoard.rotation.x = -SCREEN_TILT;
homeGroup.add(nameBoard);
// Träram bakom, lite större än texten.
const nameFrame = new THREE.Mesh(new THREE.BoxGeometry(NAME_WIDTH + 0.3, NAME_HEIGHT + 0.3, 0.2), postMaterial);
nameFrame.position.set(0, NAME_HEIGHT / 2 + 0.15, -0.11);
nameBoard.add(nameFrame);
const nameFace = new THREE.Mesh(
  new THREE.PlaneGeometry(NAME_WIDTH, NAME_HEIGHT),
  new THREE.MeshBasicMaterial({ map: nameTexture })
);
nameFace.position.set(0, NAME_HEIGHT / 2 + 0.15, 0);
nameBoard.add(nameFace);

// --- Huvudvägen och korsningen ---
// Huvudvägen går tvärs över skärmen en bit framför raden av skyltar, nedanför
// parkeringsfickorna. Uppfarten slutar i en korsning mitt på den.
const ROAD_DISTANCE = PAD_DISTANCE + 6.5; // Hur långt framför skyltarna huvudvägens mitt ligger.

// Flyttar en punkt { x, z } mot kameran (nedåt på skärmen) så många enheter.
// sin/cos gör om skyltarnas vinkel till en riktning, som för bilen.
function towardCamera(point, distance) {
  return {
    x: point.x + Math.sin(BILLBOARD_FACING) * distance,
    z: point.z + Math.cos(BILLBOARD_FACING) * distance,
  };
}
// Flyttar en punkt åt höger på skärmen (minus = åt vänster).
function toTheRight(point, distance) {
  return {
    x: point.x + Math.cos(BILLBOARD_FACING) * distance,
    z: point.z - Math.sin(BILLBOARD_FACING) * distance,
  };
}

// Bara hemvärldens skyltar räknas här – de andra världarnas står 1000 enheter bort.
const hubProjects = PROJECTS.filter((project) => project.world === WORLDS.hub);
const firstProject = hubProjects[0];
const lastProject = hubProjects[hubProjects.length - 1];
// Mitt emellan första och sista skylten, flyttat ner till huvudvägen = korsningen.
const junction = towardCamera(
  { x: (firstProject.x + lastProject.x) / 2, z: (firstProject.z + lastProject.z) / 2 },
  ROAD_DISTANCE
);
// Där uppfarten möter huvudvägen: rakt nedanför garaget.
const homeRoadPoint = towardCamera({ x: HOME_X, z: HOME_Z }, ROAD_DISTANCE);

// --- Brevlådan: vid korsningen i slutet av uppfarten ---
const mailbox = new THREE.Group();
// Inne i hem-gruppen ligger korsningen på (0, ROAD_DISTANCE). Brevlådan står i hörnet
// mellan uppfarten och huvudvägen: 3.9 åt höger och 3.9 uppåt därifrån.
mailbox.position.set(3.9, 0, ROAD_DISTANCE - 3.9);
mailbox.scale.setScalar(1.4); // Lite överdrivet stor, så att den syns från kameran långt upp.
homeGroup.add(mailbox);
const mailPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), postMaterial);
mailPost.position.y = 0.6;
mailbox.add(mailPost);
const mailBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.1), paintMaterial); // Samma röda lack som bilen.
mailBox.position.y = 1.5;
mailbox.add(mailBox);
// Flaggan sitter i en egen grupp vid sitt fäste, så att den fälls runt den punkten.
const mailFlag = new THREE.Group();
mailFlag.position.set(-0.4, 1.5, 0.2); // På lådans vänstra sida, mot uppfarten.
mailbox.add(mailFlag);
const flagMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.signText });
const flagArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.12), flagMaterial);
flagArm.position.y = 0.45; // Armen börjar vid fästet och går uppåt.
mailFlag.add(flagArm);
const flagTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.45), flagMaterial);
flagTip.position.set(0, 0.72, -0.2);
mailFlag.add(flagTip);
const FLAG_DOWN = Math.PI / 2; // Vriden 90° = ligger ner längs lådan.
mailFlag.rotation.x = FLAG_DOWN;
const MAILBOX_RADIUS = 6; // Hur nära bilen måste vara för att flaggan ska fällas upp.

// Rutans mitt i VÄRLDEN. localToWorld gör om en punkt inne i gruppen till världens koordinater.
homeGroup.updateMatrixWorld();
const homePadWorld = homeGroup.localToWorld(new THREE.Vector3(0, 0, HOME_PAD_Z));
// Brevlådans plats i världen. getWorldPosition fyller i den nya vektorn med svaret.
const mailboxWorld = mailbox.getWorldPosition(new THREE.Vector3());
const home = {
  padX: homePadWorld.x,
  padZ: homePadWorld.z,
  active: false, // Står bilen på uppfarten just nu?
  mailNear: false, // Är bilen nära brevlådan just nu?
};

// Körs en gång per bild: kollar om bilen är nära brevlådan och om den står på uppfarten.
function updateHome() {
  // Brevlådan: flaggan fälls upp och blir orange när bilen kör förbi. Bara för syns skull.
  const mailNear = Math.hypot(car.position.x - mailboxWorld.x, car.position.z - mailboxWorld.z) < MAILBOX_RADIUS;
  if (mailNear !== home.mailNear) {
    home.mailNear = mailNear;
    mailFlag.rotation.x = mailNear ? 0 : FLAG_DOWN;
    flagMaterial.color.set(mailNear ? PALETTE.signGlow : PALETTE.signText);
  }

  const distance = Math.hypot(car.position.x - home.padX, car.position.z - home.padZ);
  const near = distance < PAD_RADIUS;
  if (near === home.active) return; // Inget har ändrats.
  home.active = near;
  homePadMaterial.opacity = near ? 1 : 0.6;
  homePadMaterial.map = near ? padTextureActive : padTexture;
  showGuide(near ? ABOUT : null);
  if (!near && panelProject === ABOUT) closePanel();
}

// ---------------------------------------------------------------------------
// INGÅNGAR MELLAN VÄRLDARNA (själva WORLDS-listan står längre upp, före PROJEKT)
// ---------------------------------------------------------------------------
let currentWorld = WORLDS.hub; // Världen bilen är i just nu.
// Mittpunkterna som { x, z }, för towardCamera och toTheRight.
const techartCenter = { x: WORLDS.techart.x, z: WORLDS.techart.z };
const progCenter = { x: WORLDS.prog.x, z: WORLDS.prog.z };
const artCenter = { x: WORLDS.art.x, z: WORLDS.art.z };

// En plats i hemvärlden räknad från skyltraden, så att det är lätt att tänka sig på skärmen:
//   right – enheter åt höger från skyltradens mitt (minus = vänster).
//   down  – enheter nedåt på skärmen från skyltraden (huvudvägen ligger på ROAD_DISTANCE).
function hubPoint(right, down) {
  return towardCamera(toTheRight(junction, right), down - ROAD_DISTANCE);
}

// --- Ingångarna ---
// Hemma är ingången till en värld en liten GROTTA som vetter mot kameran: bilen kör
// rakt in "uppåt på skärmen" och göms av berget.
// I den andra världen kommer man upp ur en TELEPORTPLATTA: en lysande ring som ligger
// platt på marken. Bilen stiger upp ur marken med nosen uppåt på skärmen, så att man
// kan köra rakt ut i världen. Kör man upp på plattan sjunker bilen ner och kommer hem
// – ut ur samma grotta.
//   world   – världen ingången står i.
//   leadsTo – världen den leder till.
//   style   – 'cave' (grotta) eller 'pad' (teleportplatta).
//   at      – var grottöppningen/plattans mitt är, { x, z }.
const PORTALS = [
  // Tech Art: i slutet av huvudvägen, i samma rad som projektskyltarna, en bit
  // till höger om den sista skylten.
  { world: WORLDS.hub, leadsTo: WORLDS.techart, style: 'cave', at: hubPoint(42, 0) },
  // Programming: nedanför huvudvägen, mitt under skyltraden. Vägen dit gör en U-sväng
  // runt berget, eftersom öppningen vetter nedåt mot kameran (se VÄGAR).
  { world: WORLDS.hub, leadsTo: WORLDS.prog, style: 'cave', at: hubPoint(0, 28) },
  // Art: bredvid Programming-grottan, längre åt vänster. Samma nedre väg leder dit.
  { world: WORLDS.hub, leadsTo: WORLDS.art, style: 'cave', at: hubPoint(-24, 28) },
  // I de andra världarna ligger plattan hem 8 enheter "nedåt på skärmen" från mitten,
  // så att man kör uppåt in i världen när man kommit fram.
  { world: WORLDS.techart, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(techartCenter, 8) },
  { world: WORLDS.prog, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(progCenter, 8) },
  { world: WORLDS.art, leadsTo: WORLDS.hub, style: 'pad', at: towardCamera(artCenter, 8) },
];
// Grottorna hemma får egna namn, så att vägarna nedan kan peka på dem.
const techartCave = PORTALS[0];
const progCave = PORTALS[1];
const artCave = PORTALS[2];
// Punkterna bilen kör mellan. För en grotta räknas de från öppningen mot kameran
// (minus = bakom/inuti). En platta har bara en punkt: sin mitt.
for (const portal of PORTALS) {
  if (portal.style === 'cave') {
    portal.door = towardCamera(portal.at, 1.5);     // Precis framför öppningen. Kör bilen hit startar resan.
    portal.inside = towardCamera(portal.at, -3.5);  // Bakom öppningen, där bilen är gömd för kameran.
    portal.outside = towardCamera(portal.at, 8);    // Där bilen stannar när den har backat ut.
  } else {
    portal.door = portal.at;    // Kör upp på mitten av plattan så startar resan.
    portal.outside = portal.at; // Bilen stiger upp mitt på plattan.
  }
}
// Ingångarna i hemvärlden (grottorna). .filter ger en ny lista med bara de som stämmer.
const hubPortals = PORTALS.filter((portal) => portal.world === WORLDS.hub);

// ---------------------------------------------------------------------------
// VÄGAR – grusvägar från stugan ut till projektskyltarna.
// ---------------------------------------------------------------------------
// Gruset är en liten bild som upprepas som kakelplattor, precis som markens prickar:
// en gråbrun botten med ljusa och mörka småstenar.
const GRAVEL_PIXELS = 256; // Bildens storlek i pixlar.
const GRAVEL_UNITS = 4;    // Hur stor en kopia av bilden blir på vägen, i enheter.
const gravelImage = document.createElement('canvas');
gravelImage.width = GRAVEL_PIXELS;
gravelImage.height = GRAVEL_PIXELS;
const gravelPen = gravelImage.getContext('2d');
gravelPen.fillStyle = PALETTE.gravel;
gravelPen.fillRect(0, 0, GRAVEL_PIXELS, GRAVEL_PIXELS);
// 260 småstenar, varannan ljus och varannan mörk. i % 2 är 0 för jämna tal och 1 för udda.
for (let i = 0; i < 260; i++) {
  gravelPen.fillStyle = i % 2 === 0 ? PALETTE.gravelLight : PALETTE.gravelDark;
  const size = 3 + Math.random() * 6;
  // Håll stenen helt innanför bilden, annars klipps den av i skarven mellan kopiorna.
  gravelPen.fillRect(Math.random() * (GRAVEL_PIXELS - size), Math.random() * (GRAVEL_PIXELS - size), size, size);
}
const gravelTexture = new THREE.CanvasTexture(gravelImage);
gravelTexture.colorSpace = THREE.SRGBColorSpace;
gravelTexture.wrapS = THREE.RepeatWrapping;
gravelTexture.wrapT = THREE.RepeatWrapping;
gravelTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
// depthTest/depthWrite: false = ett "lager på marken", se förklaringen vid MARK.
const gravelMaterial = new THREE.MeshLambertMaterial({ map: gravelTexture, depthTest: false, depthWrite: false });
// Kantlinjen: en enfärgad, lite bredare väg som ligger under gruset och sticker ut på sidorna.
const roadEdgeMaterial = new THREE.MeshLambertMaterial({ color: PALETTE.gravelDark, depthTest: false, depthWrite: false });

const ROAD_WIDTH = 5;     // Vägarnas bredd i enheter.
const ROAD_EDGE = 0.2;    // Hur mycket kantlinjen sticker ut på varje sida.

// Där huvudvägen slutar: rakt nedanför grottan till Tech Art-världen.
const portalRoadPoint = towardCamera(techartCave.at, ROAD_DISTANCE);

// Den nedre vägen till Programming- och Art-grottan gör en U-sväng: den svänger av
// från huvudvägen en bit till höger, går ner förbi bergen och sedan åt vänster under
// dem. Från den går en kort infart upp i varje grottöppning.
// Talen är "right, down" som i hubPoint (se INGÅNGAR).
const PROG_TURN_RIGHT = 12; // Var vägen svänger av från huvudvägen.
const PROG_LOOP_DOWN = 38;  // Hur långt ner den nedre vägen går (grottöppningarna sitter på 28).
const progTurnOff = hubPoint(PROG_TURN_RIGHT, ROAD_DISTANCE);
const progLoopRight = hubPoint(PROG_TURN_RIGHT, PROG_LOOP_DOWN);
const progLoopLeft = hubPoint(0, PROG_LOOP_DOWN);   // Under Programming-grottan.
const artLoopLeft = hubPoint(-24, PROG_LOOP_DOWN);  // Under Art-grottan, där vägen tar slut.

// Varje rad är en rak väg från en punkt { x, z } till en annan. ÄNDRA HÄR för fler eller färre vägar.
const ROADS = [
  // Huvudvägen: börjar vid uppfarten hemma, går förbi alla skyltar och slutar nedanför grottan.
  { from: homeRoadPoint, to: portalRoadPoint },
  // Infarten till Tech Art-grottan: vägen fortsätter rakt in i öppningen (änden göms i berget).
  { from: portalRoadPoint, to: techartCave.at },
  // Den nedre vägen: ner från huvudvägen och sedan åt vänster under båda grottorna...
  { from: progTurnOff, to: progLoopRight },
  { from: progLoopRight, to: artLoopLeft },
  // ...med en infart upp i varje grotta.
  { from: progLoopLeft, to: progCave.at },
  { from: artLoopLeft, to: artCave.at },
  // Uppfarten: från garageporten ner till huvudvägen (den runda änden göms under garaget).
  { from: towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z + GARAGE_DEPTH / 2), to: homeRoadPoint },
];
// En kort infart från huvudvägen in till varje skylts parkeringsficka.
// "..." packar upp en lista; .map gör en ny lista med en väg per skylt.
ROADS.push(...billboards.map((billboard) => ({
  from: towardCamera({ x: billboard.project.x, z: billboard.project.z }, ROAD_DISTANCE),
  to: { x: billboard.padX, z: billboard.padZ },
})));

// I de andra världarna: en huvudväg längs skyltraden, och en väg från teleportplattan
// (där man kommer upp) rakt upp till den.
for (const portal of PORTALS) {
  if (portal.style !== 'pad') continue; // Bara plattorna, de står en i varje annan värld.
  const row = billboards.filter((billboard) => billboard.project.world === portal.world);
  const first = row[0].project;
  const last = row[row.length - 1].project;
  // Från en bit till vänster om första skylten till en bit till höger om den sista.
  ROADS.push({
    from: toTheRight(towardCamera(first, ROAD_DISTANCE), -6),
    to: toTheRight(towardCamera(last, ROAD_DISTANCE), 6),
  });
  // Huvudvägen ligger ROAD_DISTANCE nedanför skyltraden, som står ROW_UP ovanför mitten.
  ROADS.push({ from: portal.at, to: towardCamera(portal.world, ROAD_DISTANCE - ROW_UP) });
}

// Gångvägen från parkeringen hemma till stugans dörr: två smala bitar i vinkel.
// En väg kan ha en egen bredd (width); utan den gäller ROAD_WIDTH.
// homePoint gör om en plats inne i hem-gruppen (x = sidled, z = nedåt på skärmen) till världen.
function homePoint(x, z) {
  const world = homeGroup.localToWorld(new THREE.Vector3(x, 0, z));
  return { x: world.x, z: world.z };
}
const PATH_WIDTH = 1.3;
const DOOR_X = CABIN_X + 1.1;            // Dörrens plats i sidled (samma som där dörren byggs).
const DOOR_Z = CABIN_Z + CABIN_SIZE / 2; // Väggen med dörren.
const PATH_TURN_Z = DOOR_Z + 2.6;        // Hur långt rakt ut från dörren gången går innan den svänger.
ROADS.push(
  { from: homePoint(DOOR_X, DOOR_Z + 0.3), to: homePoint(DOOR_X, PATH_TURN_Z), width: PATH_WIDTH }, // Rakt ut från dörren...
  { from: homePoint(DOOR_X, PATH_TURN_Z), to: homePoint(2, PATH_TURN_Z), width: PATH_WIDTH }         // ...och åt vänster in till parkeringen.
);

// Bygger en väg. Den består av en rak bit och en rund platta i varje ände, så att
// ändarna blir runda och vägar som möts i en punkt får en mjuk skarv.
// height = höjd över marken. Varje väg får sin egen höjd, annars flimrar de där de korsar varandra.
// order = renderOrder: i vilken ordning lagret ritas (lägre först), se förklaringen vid MARK.
function addRoadLayer(road, width, material, height, order) {
  const dx = road.to.x - road.from.x;
  const dz = road.to.z - road.from.z;
  const length = Math.hypot(dx, dz);

  const strip = new THREE.PlaneGeometry(width, length);
  strip.rotateX(-Math.PI / 2); // Lägg ner formen på marken. Längden går nu längs Z.
  const cap = new THREE.CircleGeometry(width / 2, 24); // CircleGeometry(radie, antal kanter).
  cap.rotateX(-Math.PI / 2);

  // uv = vilken del av texturen varje hörn visar, från 0 till 1. Gångrar man talen
  // upprepas texturen så många gånger, så att stenarna är lika stora på alla vägar.
  for (const [geometry, across, along] of [[strip, width, length], [cap, width, width]]) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (across / GRAVEL_UNITS), uv.getY(i) * (along / GRAVEL_UNITS));
    }
  }

  const stripMesh = new THREE.Mesh(strip, material);
  stripMesh.position.set((road.from.x + road.to.x) / 2, height, (road.from.z + road.to.z) / 2); // Mitt emellan ändarna.
  stripMesh.rotation.y = Math.atan2(dx, dz); // Vrid så att längden pekar från start till mål.
  stripMesh.renderOrder = order;
  scene.add(stripMesh);

  for (const end of [road.from, road.to]) {
    const capMesh = new THREE.Mesh(cap, material);
    capMesh.position.set(end.x, height, end.z);
    // De runda ändarna ritas alltid strax EFTER den raka biten. Med samma nummer
    // får grafikkortet välja ordning själv, och valet ändras när kameran rör sig –
    // då byter änden och vägen plats om vartannat och det flimrar.
    capMesh.renderOrder = order + 0.001;
    scene.add(capMesh);
  }
}

// .forEach ger både vägen och dess nummer i (0, 1, 2, ...).
ROADS.forEach((road, i) => {
  // "a || b" = a om det finns, annars b: vägens egen bredd, eller den vanliga.
  const width = road.width || ROAD_WIDTH;
  // Alla kantlinjer ligger lägst (samma färg, så de får gärna överlappa).
  addRoadLayer(road, width + ROAD_EDGE * 2, roadEdgeMaterial, 0.006, -9);
  // Gruset ovanpå. Varje väg ritas strax efter den förra (-8, -7.99, -7.98, ...),
  // så att det alltid är samma väg som ligger överst där två korsar varandra.
  addRoadLayer(road, width, gravelMaterial, 0.012 + i * 0.003, -8 + i * 0.01);
});

// ---------------------------------------------------------------------------
// VÄGSKYLTAR – små träskyltar med en pil och en text. ÄNDRA HÄR.
// ---------------------------------------------------------------------------
//   text  – det som står på skylten.
//   arrow – åt vilket håll pilen pekar på skärmen: 'up', 'down', 'left', 'right' eller 'none' (ingen pil).
//   at    – var skylten står, { x, z }.
const SIGNPOSTS = [
  // Mitt emot uppfarten, på andra sidan huvudvägen: åt höger ligger tech art-projekten.
  { text: 'Tech Art', arrow: 'right', at: towardCamera(homeRoadPoint, 4.2) },
  // Där den nedre vägen svänger av från huvudvägen: båda grottorna ligger åt det hållet.
  { text: 'Programming · Art', arrow: 'down', at: hubPoint(PROG_TURN_RIGHT + 5.5, ROAD_DISTANCE + 6) },
  // Under den nedre vägen, där infarten till Programming-grottan går av: Art fortsätter åt vänster.
  { text: 'Art', arrow: 'left', at: hubPoint(-6, PROG_LOOP_DOWN + 5.5) },
];

const SIGNPOST_WIDTH = 4.2;
const SIGNPOST_HEIGHT = 1.2;
for (const signpost of SIGNPOSTS) {
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
  // ← = ←, → = →, ↑ = ↑.
  let label = `${signpost.text} ↑`;
  if (signpost.arrow === 'left') label = `← ${signpost.text}`;
  if (signpost.arrow === 'right') label = `${signpost.text} →`;
  if (signpost.arrow === 'down') label = `${signpost.text} ↓`; // ↓ = ↓.
  if (signpost.arrow === 'none') label = signpost.text;
  // Börja med stor text och krymp tills den får plats, som på projektskyltarna.
  let fontSize = 110;
  brush.font = `bold ${fontSize}px system-ui, sans-serif`;
  while (brush.measureText(label).width > image.width - 50) {
    fontSize -= 4;
    brush.font = `bold ${fontSize}px system-ui, sans-serif`;
  }
  brush.fillText(label, image.width / 2, image.height / 2 + 6);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

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
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(SIGNPOST_WIDTH, SIGNPOST_HEIGHT),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  face.position.set(0, SIGNPOST_HEIGHT / 2 + 0.12, 0);
  board.add(face);

  group.position.set(signpost.at.x, 0, signpost.at.z);
  group.rotation.y = BILLBOARD_FACING; // Vänd mot kameran.
  scene.add(group);
}

// ---------------------------------------------------------------------------
// DE ANDRA VÄRLDARNAS MARK
// ---------------------------------------------------------------------------
// Varje värld har en egen mark med ett eget mönster. Mönstret ritas i en osynlig
// canvas, precis som hemvärldens prickar, och upprepas som kakelplattor.
// drawPattern är en funktion som får en penna och ritar mönstret – så kan varje värld
// skicka in sitt eget mönster, medan resten (textur, plan, kanttoning) är likadant.
function makeWorldGround(world, drawPattern) {
  const image = document.createElement('canvas');
  image.width = TILE_PIXELS;
  image.height = TILE_PIXELS;
  drawPattern(image.getContext('2d'));
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GROUND_SIZE / TILE_UNITS, GROUND_SIZE / TILE_UNITS);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ map: texture })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(world.x, 0, world.z);
  mesh.renderOrder = -10; // Samma lager som hemvärldens mark, se MARK.
  scene.add(mesh);
  makeEdgeFade(world.x, world.z, world.background);
}

// --- Tech Art: ett rutnät som i ett 3D-program ---
makeWorldGround(WORLDS.techart, (pen) => {
  pen.fillStyle = PALETTE.techGround;
  pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  // Tunna linjer var 64:e pixel (= varannan enhet på marken), åt båda hållen.
  pen.fillStyle = PALETTE.techGrid;
  for (let i = 0; i < TILE_PIXELS; i += 64) {
    pen.fillRect(i, 0, 3, TILE_PIXELS); // Lodrät linje.
    pen.fillRect(0, i, TILE_PIXELS, 3); // Vågrät linje.
  }
  // En tjock linje längs två kanter. När bilden upprepas blir det en stor ruta var 16:e enhet.
  pen.fillStyle = PALETTE.techGridMain;
  pen.fillRect(0, 0, 6, TILE_PIXELS);
  pen.fillRect(0, 0, TILE_PIXELS, 6);
});

// --- Programming: ett kretskort ---
// Ledningar som går en bit rakt och sedan svänger 90°, med en lödpunkt i varje ände.
makeWorldGround(WORLDS.prog, (pen) => {
  pen.fillStyle = PALETTE.progGround;
  pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  // Slumpar en plats minst 40 pixlar från kanten, så att inget klipps av i skarven mellan kopiorna.
  const spot = () => 40 + Math.random() * (TILE_PIXELS - 80);
  pen.lineWidth = 8;
  pen.lineCap = 'round';
  pen.lineJoin = 'round'; // Rund sväng i hörnet.
  for (let i = 0; i < 14; i++) {
    const [x1, y1, x2, y2] = [spot(), spot(), spot(), spot()];
    // Ledningen: först vågrätt till x2, sedan lodrätt till y2.
    pen.strokeStyle = PALETTE.progTraceDim;
    pen.beginPath();
    pen.moveTo(x1, y1);
    pen.lineTo(x2, y1);
    pen.lineTo(x2, y2);
    pen.stroke();
    // Lödpunkterna: en lysande ring med ett hål i mitten.
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      pen.fillStyle = PALETTE.progTrace;
      pen.beginPath();
      pen.arc(x, y, 10, 0, Math.PI * 2); // En hel cirkel = 2 * PI.
      pen.fill();
      pen.fillStyle = PALETTE.progGround;
      pen.beginPath();
      pen.arc(x, y, 4, 0, Math.PI * 2);
      pen.fill();
    }
  }
});

// --- Art: en målares skyddsduk med färgstänk ---
makeWorldGround(WORLDS.art, (pen) => {
  pen.fillStyle = PALETTE.artGround;
  pen.fillRect(0, 0, TILE_PIXELS, TILE_PIXELS);
  // Vävens trådar: tunna, svaga linjer åt båda hållen. globalAlpha = hur täckande allt som ritas blir.
  pen.globalAlpha = 0.07;
  pen.fillStyle = PALETTE.signText;
  for (let i = 0; i < TILE_PIXELS; i += 6) {
    pen.fillRect(i, 0, 1, TILE_PIXELS);
    pen.fillRect(0, i, TILE_PIXELS, 1);
  }
  pen.globalAlpha = 1;
  // Färgstänk: en stor klick med små droppar runt omkring, i en slumpad färg.
  const spot = () => 50 + Math.random() * (TILE_PIXELS - 100); // Inte för nära kanten (skarven).
  for (let i = 0; i < 9; i++) {
    const x = spot();
    const y = spot();
    pen.fillStyle = PALETTE.artPaints[i % PALETTE.artPaints.length]; // Färgerna i tur och ordning.
    pen.beginPath();
    pen.arc(x, y, 8 + Math.random() * 16, 0, Math.PI * 2); // Klicken.
    pen.fill();
    for (let j = 0; j < 10; j++) {
      // Dropparna: en slumpad riktning och ett slumpat avstånd från klicken.
      const angle = Math.random() * Math.PI * 2;
      const distance = 14 + Math.random() * 30;
      pen.beginPath();
      pen.arc(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, 1.5 + Math.random() * 4, 0, Math.PI * 2);
      pen.fill();
    }
  }
});

// ---------------------------------------------------------------------------
// TECH ART-VÄRLDEN – projektskyltarna plus en provbänk vid teleportplattan.
// ---------------------------------------------------------------------------
// Tre testformer som snurrar på varsin sockel. Det är de klassiska sakerna man testar
// en shader på. De står på båda sidor om plattan, nedanför huvudvägen, så att de inte
// skymmer skyltarna. (toTheRight(..., 14) = 14 åt höger, towardCamera(..., 6) = 6 nedåt.)
// Ett schackrutigt "UV-test", som man lägger på en modell för att se om texturen sträcks ut.
const checkerImage = document.createElement('canvas');
checkerImage.width = 256;
checkerImage.height = 256;
const checkerPen = checkerImage.getContext('2d');
for (let row = 0; row < 8; row++) {
  for (let column = 0; column < 8; column++) {
    // (rad + kolumn) % 2 växlar mellan 0 och 1 = varannan ruta ljus, varannan mörk.
    checkerPen.fillStyle = (row + column) % 2 === 0 ? PALETTE.sign : PALETTE.signGlow;
    checkerPen.fillRect(column * 32, row * 32, 32, 32);
  }
}
const checkerTexture = new THREE.CanvasTexture(checkerImage);
checkerTexture.colorSpace = THREE.SRGBColorSpace;

const LAB_SHAPES = [
  // MeshNormalMaterial färgar varje yta efter åt vilket håll den pekar – ett vanligt felsökningsläge.
  { geometry: new THREE.SphereGeometry(1.1, 32, 16), material: new THREE.MeshNormalMaterial(), at: toTheRight(towardCamera(techartCenter, 6), -14) },
  // wireframe: true ritar bara kanterna mellan trianglarna, så man ser hur formen är byggd.
  { geometry: new THREE.TorusKnotGeometry(0.8, 0.28, 96, 12), material: new THREE.MeshBasicMaterial({ color: PALETTE.techGridMain, wireframe: true }), at: toTheRight(towardCamera(techartCenter, 6), 14) },
  { geometry: new THREE.BoxGeometry(1.6, 1.6, 1.6), material: new THREE.MeshStandardMaterial({ map: checkerTexture, roughness: 0.6 }), at: toTheRight(towardCamera(techartCenter, 13), 14) },
];
const labShapes = []; // Formerna sparas här, så att de kan snurras i renderloopen.
for (const shape of LAB_SHAPES) {
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), frameMaterial);
  plinth.position.set(shape.at.x, 0.5, shape.at.z);
  scene.add(plinth);
  const mesh = new THREE.Mesh(shape.geometry, shape.material);
  mesh.position.set(shape.at.x, 2.4, shape.at.z);
  scene.add(mesh);
  labShapes.push(mesh);
}

// ---------------------------------------------------------------------------
// PROGRAMMING-VÄRLDEN – projektskyltarna plus tre serverrack med blinkande lysdioder.
// ---------------------------------------------------------------------------
// Racken står vid teleportplattan, på samma platser som provbänken i Tech Art.
// Två material som lysdioderna byter mellan: tänd och släckt.
const ledOnMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.progTrace });
const ledOffMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.progTraceDim });
const ledGeometry = new THREE.BoxGeometry(0.22, 0.12, 0.05);
const leds = []; // Alla lysdioder, så att några kan blinka varje bild.
const RACKS = [
  toTheRight(towardCamera(progCenter, 6), -14),
  toTheRight(towardCamera(progCenter, 6), 14),
  toTheRight(towardCamera(progCenter, 13), 14),
];
for (const at of RACKS) {
  const rack = new THREE.Group();
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 1.6), frameMaterial);
  cabinet.position.y = 1.8;
  rack.add(cabinet);
  // Sex rader med fyra lysdioder på framsidan (+z vetter mot kameran efter vridningen nedan).
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 4; column++) {
      // Math.random() < 0.5 = sant ungefär varannan gång: hälften tända från början.
      const led = new THREE.Mesh(ledGeometry, Math.random() < 0.5 ? ledOnMaterial : ledOffMaterial);
      led.position.set(-0.6 + column * 0.4, 0.6 + row * 0.5, 0.81);
      rack.add(led);
      leds.push(led);
    }
  }
  rack.position.set(at.x, 0, at.z);
  rack.rotation.y = BILLBOARD_FACING;
  scene.add(rack);
}

// ---------------------------------------------------------------------------
// ART-VÄRLDEN – projektskyltarna plus två staffli med målningar vid teleportplattan.
// ---------------------------------------------------------------------------
// Varje målning ritas med slumpade penseldrag i Art-världens färger, så de blir
// lite olika varje gång sidan laddas.
function makePaintingTexture() {
  const image = document.createElement('canvas');
  image.width = 256;
  image.height = 320; // Samma proportioner som duken (2 x 2.5).
  const pen = image.getContext('2d');
  pen.fillStyle = PALETTE.sign;
  pen.fillRect(0, 0, image.width, image.height);
  pen.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    // Ett penseldrag: en tjock, böjd linje mellan två slumpade punkter.
    pen.strokeStyle = PALETTE.artPaints[Math.floor(Math.random() * PALETTE.artPaints.length)];
    pen.lineWidth = 10 + Math.random() * 26;
    pen.beginPath();
    pen.moveTo(Math.random() * 256, Math.random() * 320);
    // quadraticCurveTo(böjpunkt x, böjpunkt y, slut x, slut y): linjen dras mot böjpunkten och svänger.
    pen.quadraticCurveTo(Math.random() * 256, Math.random() * 320, Math.random() * 256, Math.random() * 320);
    pen.stroke();
  }
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const EASELS = [
  toTheRight(towardCamera(artCenter, 6), -14),
  toTheRight(towardCamera(artCenter, 6), 14),
];
for (const at of EASELS) {
  const easel = new THREE.Group();
  // Tre ben: två fram som lutar ut åt sidorna, ett bak som lutar bakåt.
  // Varje ben är en lång smal låda som vrids runt sin mitt.
  for (const [x, z, tiltZ, tiltX] of [[-0.6, 0.2, -0.15, 0], [0.6, 0.2, 0.15, 0], [0, -0.7, 0, -0.35]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.4, 0.12), postMaterial);
    leg.position.set(x, 1.6, z);
    leg.rotation.set(tiltX, 0, tiltZ);
    easel.add(leg);
  }
  // Hyllan som duken står på.
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.3), postMaterial);
  ledge.position.set(0, 1.2, 0.35);
  easel.add(ledge);
  // Duken: en tunn låda med målningen på framsidan. Lutar bakåt som skyltarna.
  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2.5),
    new THREE.MeshStandardMaterial({ map: makePaintingTexture(), roughness: 0.9 })
  );
  painting.position.set(0, 2.55, 0.42);
  painting.rotation.x = -0.15;
  easel.add(painting);
  easel.position.set(at.x, 0, at.z);
  easel.rotation.y = BILLBOARD_FACING;
  scene.add(easel);
}

// ---------------------------------------------------------------------------
// INGÅNGAR – grottorna hemma och portalringarna i de andra världarna.
// ---------------------------------------------------------------------------
// Båda byggs i en grupp som vrids mot kameran. Inne i gruppen gäller:
//   +x = åt höger på skärmen, +y = upp, +z = mot kameran, -z = in i berget/bakom portalen.
// Öppningen sitter på z = 0. Bilen kör in längs -z och är gömd när den är förbi.

// --- Grottan ---
// Ett berg av kantiga stenar runt en mörk öppning. Öppningen är en platt valvform i
// nästan svart. När bilen kört förbi den ligger bilen bakom den – och sedan inuti det
// stora berget – så kameran ser den inte längre.
const rockMaterials = [
  new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: PALETTE.rockDark, roughness: 1, flatShading: true }),
];
// En kantig boll med radie 1. Varje sten är samma form, men utdragen olika mycket (scale).
const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
// Varje sten: [x, y, z, bredd, höjd, djup, material (0 = ljus, 1 = mörk)].
// Bredd/höjd/djup är radier, alltså halva måttet.
const CAVE_ROCKS = [
  [0, 1.5, -5, 4.8, 4.5, 4, 0],         // Det stora berget bakom öppningen. Bilen göms inuti det.
  [-3.7, 1.2, -1, 2, 2.4, 2, 1],        // Vänster sida av öppningen.
  [3.7, 1, -1, 2, 2.1, 2, 0],           // Höger sida.
  [0, 4.2, -0.8, 3, 1.4, 2, 1],         // Stenen över öppningen.
  [-2.6, 3.6, -3.2, 2.2, 2, 2.2, 0],    // Toppar ovanpå berget.
  [2.8, 3.2, -3.6, 2, 2.3, 2, 1],
  [-5.4, 0.4, 0.6, 0.9, 0.7, 0.9, 0],   // Småsten framför.
  [5.2, 0.3, 0.9, 0.7, 0.5, 0.7, 1],
];
const CAVE_MOUTH_WIDTH = 4.4;  // Öppningens bredd. Bilen är 1.2 bred.
const CAVE_MOUTH_HEIGHT = 3.4; // Öppningens höjd i mitten (överst är den rund).
const caveMouthMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.caveMouth });

// Öppningens form: ett valv. En Shape ritas som med pennan på en canvas, fast i enheter
// och med y uppåt: rakt upp på vänster sida, en halvcirkel över, rakt ner på höger sida.
const mouthShape = new THREE.Shape();
const archRadius = CAVE_MOUTH_WIDTH / 2;
const archCenterY = CAVE_MOUTH_HEIGHT - archRadius; // Halvcirkelns mitt.
mouthShape.moveTo(-archRadius, 0);
mouthShape.lineTo(-archRadius, archCenterY);
// absarc(mitt x, mitt y, radie, startvinkel, slutvinkel, medsols): från vänster (PI)
// över toppen till höger (0). Medsols = true, annars går bågen runt under.
mouthShape.absarc(0, archCenterY, archRadius, Math.PI, 0, true);
mouthShape.lineTo(archRadius, 0);
const mouthGeometry = new THREE.ShapeGeometry(mouthShape, 24);

// Ljuset längst in i grottan: en mjuk fläck i färgen på världen grottan leder till.
// En canvas med en rund toning, från nästan täckande i mitten till genomskinlig ytterst.
function makeCaveLightTexture(color) {
  const image = document.createElement('canvas');
  image.width = 128;
  image.height = 128;
  const pen = image.getContext('2d');
  const glow = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, color + 'e0');   // e0 = nästan täckande.
  glow.addColorStop(0.4, color + '60'); // 60 = halvgenomskinlig.
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
  const mouth = new THREE.Mesh(mouthGeometry, caveMouthMaterial);
  group.add(mouth);

  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 2.8),
    // transparent + depthWrite: false, som kanttoningen. Står bilen framför öppningen skyms ljuset av den.
    new THREE.MeshBasicMaterial({ map: makeCaveLightTexture(portal.leadsTo.accent), transparent: true, depthWrite: false })
  );
  light.position.set(0, 1.5, 0.02); // En aning framför öppningen, annars flimrar de.
  group.add(light);

  // Skylten med världens namn sitter på stenen över öppningen och lutar som de andra skyltarna.
  addEntranceSign(portal, group, 5.3, 0.3);
}

// Namnskylten vid en ingång: världen den leder till, med tänd text.
// y, z = var skyltens underkant sitter i gruppen. x = sidled (utelämnat = mitten).
function addEntranceSign(portal, group, y, z, x = 0) {
  const ENTRANCE_SIGN_WIDTH = 6;
  const height = SIGN_HEIGHT * (ENTRANCE_SIGN_WIDTH / SCREEN_WIDTH); // Samma proportioner som texturen.
  const board = new THREE.Group();
  board.position.set(x, y, z);
  board.rotation.x = -SCREEN_TILT;
  group.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(ENTRANCE_SIGN_WIDTH + 0.3, height + 0.3, 0.2), postMaterial);
  frame.position.set(0, height / 2 + 0.15, -0.11);
  board.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(ENTRANCE_SIGN_WIDTH, height),
    new THREE.MeshBasicMaterial({ map: makeTitleTexture(portal.leadsTo.title, true) })
  );
  face.position.set(0, height / 2 + 0.15, 0);
  board.add(face);
}

// --- Teleportplattan ---
// En lysande ring som ligger platt på marken, med en LEVANDE bild av hemvärlden i
// mitten – som att titta ner genom ett hål. Bilden kommer från en andra kamera som står
// i hemvärlden, precis där spelkameran kommer att stå när man kommer fram. Den kameran
// ritar inte till skärmen utan till en "render target": en osynlig bild som sedan
// används som textur på skivan – precis som canvasen på projektskyltarna.
const PAD_RADIUS_SIZE = 3;   // Plattans radie. Bilen är 2.4 lång, så den får plats med marginal.
const PAD_RING_THICKNESS = 0.25; // Ringens tjocklek (radien på "röret").
const PAD_BEAM_HEIGHT = 4;   // Hur högt ljuspelaren över plattan når.
const PREVIEW_PIXELS = 256;  // Bildens storlek i pixlar (kvadratisk). Större = skarpare men tyngre. (Var 512.)
const PREVIEW_RADIUS = 30;   // Bilden uppdateras bara när bilen är så här nära plattan.
// Och då högst 15 gånger per sekund. Varje uppdatering ritar HELA scenen en gång till,
// så det här kostade mycket – särskilt i de andra världarna, där man startar bredvid plattan. (Var 30.)
const PREVIEW_TIME = 1 / 15;

// Previewkameran: samma inställningar som spelkameran, men kvadratisk (bildförhållande 1),
// eftersom skivan är rund.
const previewCamera = new THREE.PerspectiveCamera(30, 1, 5, 400);

function buildPad(portal, group) {
  // Render target = en bild som grafikkortet kan rita i i stället för på skärmen.
  portal.renderTarget = new THREE.WebGLRenderTarget(PREVIEW_PIXELS, PREVIEW_PIXELS);
  portal.previewWait = 0;

  // Skivan med den levande bilden. Den är ett "lager på marken" som vägarna (se MARK):
  // den ritas ovanpå marken men skriver inte in något djup. Därför skyms bilen
  // fortfarande av MARKEN när den sjunker ner under plattan – den ser ut att åka ner i hålet.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(PAD_RADIUS_SIZE, 64),
    new THREE.MeshBasicMaterial({ map: portal.renderTarget.texture, depthTest: false, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2; // Lägg ner den på marken.
  disc.position.y = 0.03;
  disc.renderOrder = -5;
  group.add(disc);

  // TorusGeometry(radie, rörets radie, kanter runt röret, kanter runt ringen) = en "munk".
  // Den skapas stående, så den läggs ner som skivan. Halva röret sticker upp ur marken.
  // MeshBasicMaterial = alltid full färg, så ringen ser ut att lysa.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PAD_RADIUS_SIZE, PAD_RING_THICKNESS, 12, 64),
    new THREE.MeshBasicMaterial({ color: portal.world.accent })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  // Ljuspelaren: ett rör utan lock (sista argumentet true = öppna ändar), svagt genomskinligt.
  // AdditiveBlending lägger ihop färgen med det bakom, så det ser ut som ljus i stället för en vägg.
  // DoubleSide = båda sidorna av ytan ritas, så att även rörets baksida syns igenom.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(PAD_RADIUS_SIZE, PAD_RADIUS_SIZE, PAD_BEAM_HEIGHT, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color: portal.world.accent,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.position.y = PAD_BEAM_HEIGHT / 2;
  group.add(beam);

  // Gnistor: små lysande lådor i en cirkel runt plattan. Hela gruppen snurrar (se updateWorlds).
  portal.sparks = new THREE.Group();
  portal.sparks.position.y = 0.6;
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2; // 12 lika stora steg runt ett helt varv.
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), sparkMaterial);
    // cos/sin gör om vinkeln till en punkt på en cirkel (x och z = platt på marken).
    spark.position.set(Math.cos(angle) * (PAD_RADIUS_SIZE + 0.5), 0, Math.sin(angle) * (PAD_RADIUS_SIZE + 0.5));
    portal.sparks.add(spark);
  }
  group.add(portal.sparks);

  // Skylten med världens namn står till vänster om plattan på två stolpar. (Förut stod
  // den bakom plattan, men där går nu vägen upp till skyltraden.)
  const signX = -(PAD_RADIUS_SIZE + 4.2);
  for (const x of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), postMaterial);
    post.position.set(signX + x, 0.7, -0.15);
    group.add(post);
  }
  addEntranceSign(portal, group, 1.2, 0, signX);
}

// Bygg alla ingångar.
for (const portal of PORTALS) {
  const group = new THREE.Group();
  if (portal.style === 'cave') buildCave(portal, group);
  else buildPad(portal, group);
  group.position.set(portal.at.x, 0, portal.at.z);
  group.rotation.y = BILLBOARD_FACING;
  scene.add(group);
}
// Ingången i den andra världen som man kommer ut ur. .find ger den första som står
// i världen vi reser till och leder tillbaka till världen vi kom ifrån.
for (const portal of PORTALS) {
  portal.exit = PORTALS.find((p) => p.world === portal.leadsTo && p.leadsTo === portal.world);
}

// Ritar den levande bilden på en teleportplatta.
const previewTarget = new THREE.Vector3();
function renderPortalPreview(portal) {
  // Ställ previewkameran där spelkameran kommer att stå när bilen kört ut på andra
  // sidan – samma uträkning som i renderloopen.
  const exit = portal.exit;
  previewTarget.set(exit.outside.x, 0, exit.outside.z).add(cameraLead);
  previewCamera.position.copy(previewTarget).add(cameraOffset);
  previewCamera.lookAt(previewTarget);

  // Den andra världen har en annan bakgrundsfärg. Byt tillfälligt.
  scene.background.set(portal.leadsTo.background);
  // Skuggorna räknas inte om för previewbilden: det skulle kosta lika mycket som att
  // rita scenen en gång till, och solens skuggruta följer ändå bilen, inte previewkameran.
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(portal.renderTarget); // Rita i portalens bild...
  renderer.render(scene, previewCamera);
  renderer.setRenderTarget(null);                // ...och sedan på skärmen igen som vanligt.
  renderer.shadowMap.autoUpdate = true;
  scene.background.set(currentWorld.background);
}

// Körs efter att bilden ritats: uppdaterar bilden på plattan bilen är nära.
let previewsDrawn = false; // Varje platta ritas en gång direkt, så att ingen är svart från början.
function updatePortalPreviews(delta) {
  for (const portal of PORTALS) {
    if (!portal.renderTarget) continue; // Grottor har ingen levande bild.
    if (!previewsDrawn) {
      renderPortalPreview(portal);
      continue;
    }
    if (portal.world !== currentWorld) continue; // Plattor i andra världar syns ändå inte.
    if (Math.hypot(car.position.x - portal.at.x, car.position.z - portal.at.z) > PREVIEW_RADIUS) continue;
    portal.previewWait -= delta;
    if (portal.previewWait > 0) continue;
    portal.previewWait = PREVIEW_TIME;
    renderPortalPreview(portal);
  }
  previewsDrawn = true;
}

// --- Resan ---
// Resan sker i steg, som i en film:
//   'in'      – bilen kör av sig själv in i grottan, eller upp på mitten av plattan.
//   'sink'    – (bara platta) bilen sjunker ner genom plattan, under marken.
//   'fadeOut' – bilden tonas till den nya världens färg. När den är helt täckt
//               flyttas bilen till ingången i den nya världen.
//   'fadeIn'  – toningen försvinner medan bilen backar ut ur grottan, eller stiger
//               upp ur plattan.
// Det självkörande (bilen backar ut ur garaget, kör in i grottor) sköts av
// startAutoDrive, se BIL längre ner.
const PORTAL_RADIUS = 3;  // Hur nära öppningen/plattans mitt bilen måste komma.
const PORTAL_SPEED = 7;   // Hur fort bilen kör in och ut, enheter per sekund.
const SINK_DEPTH = 2.5;   // Hur långt under marken bilen sjunker. Bilen är ca 1.1 hög, så den försvinner helt.
const SINK_SPEED = 3;     // Hur fort den sjunker och stiger, enheter per sekund.
const FADE_SPEED = 2.5;   // Hur fort toningen går: 2.5 = 0.4 sekunder.
const fadeElement = document.getElementById('fade'); // Den täckande rutan, se index.html.
let travel = null;        // Pågående resa: { portal, stage }. null = ingen resa.
let fadeAmount = 0;       // 0 = ingen toning, 1 = helt täckt.
// Plattan bilen nyss steg upp ur. Bilen står mitt på den, så utan det här skulle den
// genast resa tillbaka. Plattan fungerar igen först när bilen har kört av den.
let justArrivedOn = null;

function startTravel(portal) {
  travel = { portal, stage: 'in' };
  if (panelOpen) closePanel();
  keys.clear(); // Släpp körtangenterna, bilen kör själv nu.
  // Backade bilen in mot öppningen? Då backar den in också, i stället för att vända.
  const backingIn = speed < 0;
  speed = 0;
  fadeElement.style.background = portal.leadsTo.background;
  if (portal.style === 'cave') {
    startAutoDrive(portal.inside, backingIn, PORTAL_SPEED, () => {
      travel.stage = 'fadeOut';
    });
  } else {
    // Plattan: kör till mitten och sjunk sedan.
    startAutoDrive(portal.at, backingIn, PORTAL_SPEED, () => {
      travel.stage = 'sink';
    });
  }
}

// Flyttar bilen till den nya världen. Körs när toningen är helt täckande.
function arrive() {
  const exit = travel.portal.exit;
  currentWorld = exit.world;
  scene.background.set(currentWorld.background);
  setWeather(currentWorld); // Löv hemma, gnistor i de andra världarna.
  // I båda fallen pekar nosen "uppåt på skärmen" när man får styra själv. Då känns
  // styrningen rätt – kör bilen mot kameran blir vänster och höger omvända för den som tittar.
  // BILLBOARD_FACING är riktningen mot kameran; + Math.PI (180°) vänder den åt andra hållet.
  heading = BILLBOARD_FACING + Math.PI;
  car.rotation.y = heading;
  travel.stage = 'fadeIn';
  if (exit.style === 'cave') {
    // Grottan: bilen står inne i berget och backar ut, precis som ur garaget i början.
    car.position.set(exit.inside.x, 0, exit.inside.z);
    startAutoDrive(exit.outside, true, PORTAL_SPEED);
  } else {
    // Plattan: bilen börjar under marken mitt under plattan och stiger upp (se updateTravel).
    car.position.set(exit.at.x, -SINK_DEPTH, exit.at.z);
    justArrivedOn = exit;
  }
}

// Är bilen nära ingångens "dörr"? extra = lite större radie.
function isAtDoor(portal, extra = 0) {
  return Math.hypot(car.position.x - portal.door.x, car.position.z - portal.door.z) < PORTAL_RADIUS + extra;
}

// Körs en gång per bild.
function updateTravel(delta) {
  if (!travel) {
    // Har bilen kört av plattan den kom upp ur? Då fungerar den igen.
    // (extra 1 = bilen måste köra en bit bortom kanten, så att det inte startar av misstag.)
    if (justArrivedOn && !isAtDoor(justArrivedOn, 1)) justArrivedOn = null;
    // Ingen resa pågår. Kör bilen in i en ingång? (Inte medan den kör själv, t.ex. ut ur garaget.)
    if (autoDrive) return;
    for (const portal of PORTALS) {
      if (portal.world !== currentWorld || portal === justArrivedOn) continue;
      if (isAtDoor(portal)) {
        startTravel(portal);
        break; // Hoppa ur loopen, en resa räcker.
      }
    }
    return;
  }
  if (travel.stage === 'sink') {
    // Math.max: sjunk aldrig djupare än SINK_DEPTH.
    car.position.y = Math.max(-SINK_DEPTH, car.position.y - SINK_SPEED * delta);
    if (car.position.y === -SINK_DEPTH) travel.stage = 'fadeOut';
  } else if (travel.stage === 'fadeOut') {
    fadeAmount = Math.min(1, fadeAmount + FADE_SPEED * delta);
    if (fadeAmount === 1) arrive();
  } else if (travel.stage === 'fadeIn') {
    fadeAmount = Math.max(0, fadeAmount - FADE_SPEED * delta);
    // Stig upp ur marken (gör ingenting om bilen redan står på marken, efter en grotta).
    car.position.y = Math.min(0, car.position.y + SINK_SPEED * delta);
    // Klart när toningen är borta, bilen har kört ut och står på marken.
    if (fadeAmount === 0 && !autoDrive && car.position.y === 0) travel = null;
  }
  fadeElement.style.opacity = fadeAmount;
}

// Det som rör sig i de andra världarna. Körs en gång per bild.
const LED_BLINK_TIME = 0.08; // Sekunder mellan varje gång en lysdiod byter läge.
let ledWait = 0;
function updateWorlds(delta) {
  // Testformerna i Tech Art-världen snurrar långsamt.
  for (const shape of labShapes) {
    shape.rotation.y += 0.6 * delta;
    shape.rotation.x += 0.25 * delta;
  }
  // Gnistorna runt teleportplattorna snurrar runt plattan (y = axeln rakt uppåt).
  for (const portal of PORTALS) {
    if (portal.sparks) portal.sparks.rotation.y += 1.2 * delta;
  }
  // Lysdioderna: med jämna mellanrum byter en slumpad diod mellan tänd och släckt.
  ledWait -= delta;
  if (ledWait <= 0) {
    ledWait = LED_BLINK_TIME;
    const led = leds[Math.floor(Math.random() * leds.length)];
    led.material = led.material === ledOnMaterial ? ledOffMaterial : ledOnMaterial;
  }
}

// Avståndet från en punkt (x, z) till närmaste ställe på en väg. Används för att
// hålla träden borta från vägarna.
function distanceToRoad(x, z, road) {
  const dx = road.to.x - road.from.x;
  const dz = road.to.z - road.from.z;
  // t = hur långt längs vägen den närmaste punkten ligger: 0 = starten, 1 = målet.
  // clamp håller t mellan 0 och 1, så att punkten aldrig hamnar utanför vägens ändar.
  const t = THREE.MathUtils.clamp(((x - road.from.x) * dx + (z - road.from.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (road.from.x + dx * t), z - (road.from.z + dz * t));
}

// ---------------------------------------------------------------------------
// GATLYKTOR – längs vägarna i alla världar.
// ---------------------------------------------------------------------------
// En lykta = stolpe + arm + lykthus + lysande glödlampa + ett mjukt sken runt lampan
// + en ljuspöl på marken under. Det finns INGEN riktig lampa (SpotLight/PointLight)
// i dem: varje riktig lampa gör varenda pixel i scenen dyrare att räkna ut, och 20
// sådana skulle få en laptop att gå varm. Skenet och ljuspölen är i stället
// genomskinliga bilder som "lägger till" ljus på det som ligger under (AdditiveBlending).
// Nackdelen: bilen lyses inte upp när den kör under en lykta – bara marken ser upplyst ut.
//
// Alla lyktor ritas med instancing, som träden: en form per del, utplacerad på alla
// platser på en gång.
const LAMP_SIDE = ROAD_WIDTH / 2 + 1.2; // Hur långt från vägens mitt stolpen står.
const LAMP_HEIGHT = 4;                  // Stolpens höjd.
const LAMP_REACH = 1.3;                 // Hur långt ut över vägen armen når.
const LAMP_POOL_SIZE = 7;               // Ljuspölens bredd på marken. ÄNDRA för större/mindre ljuscirklar.

// Åt vilket håll armen pekar ut över vägen, som vinklar runt Y-axeln (samma som bilens heading).
const ARM_DOWN = BILLBOARD_FACING;               // Nedåt på skärmen, mot kameran.
const ARM_UP = BILLBOARD_FACING + Math.PI;       // Uppåt på skärmen.
const ARM_LEFT = BILLBOARD_FACING - Math.PI / 2; // Åt vänster.

// Varje lykta: at = stolpens plats, arm = armens riktning, color = ljusets färg.
const STREET_LAMPS = [];

// Längs skyltraden i varje värld: en lykta mellan varje par av skyltar, plus en i
// varje ände. De står på den övre sidan av huvudvägen (mellan parkeringsfickorna)
// och armen pekar ner över vägen. Ljuset har världens färg.
for (const world of Object.values(WORLDS)) {
  const row = PROJECTS.filter((project) => project.world === world);
  // Linjen där stolparna står: LAMP_SIDE ovanför huvudvägens mitt.
  const lampLine = towardCamera(row[0], ROAD_DISTANCE - LAMP_SIDE);
  // <= row.length ger en lykta mer än antalet skyltar. (i - 0.5) = mitt emellan två skyltar.
  for (let i = 0; i <= row.length; i++) {
    STREET_LAMPS.push({ at: toTheRight(lampLine, (i - 0.5) * BILLBOARD_SPACING), arm: ARM_DOWN, color: world.accent });
  }
}
// Hemma även längs den nedre vägen till grottorna:
STREET_LAMPS.push(
  // Under vägen, mitt emellan Art- och Programming-grottan. Armen pekar upp över vägen.
  { at: hubPoint(-12, PROG_LOOP_DOWN + LAMP_SIDE), arm: ARM_UP, color: WORLDS.hub.accent },
  // Till höger om backen ner från huvudvägen. Armen pekar åt vänster över den.
  { at: hubPoint(PROG_TURN_RIGHT + LAMP_SIDE, 25), arm: ARM_LEFT, color: WORLDS.hub.accent },
);

// --- Bilderna: en mjuk, rund ljusfläck (vit, färgen läggs på per lykta) ---
function makeGlowTexture(centerOpacity) {
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
// Material som "lägger till" ljus. depthWrite: false = skymmer inget som ritas efter.
function makeGlowMaterial(centerOpacity) {
  return new THREE.MeshBasicMaterial({
    map: makeGlowTexture(centerOpacity),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// --- Formerna. Lyktan byggs med armen längs +z; varje lykta vrids sedan mot sin väg. ---
const lampPostMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.lampPost, roughness: 0.7, metalness: 0.4 });
const lampCount = STREET_LAMPS.length;
const lampPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 8), lampPostMaterial, lampCount);
const lampArms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, LAMP_REACH + 0.1), lampPostMaterial, lampCount);
const lampHeads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.2, 0.7), lampPostMaterial, lampCount);
// Glödlampan: vit, får sin färg per lykta (setColorAt). MeshBasicMaterial = ser ut att lysa.
const lampBulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.38, 0.06, 0.52), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lampCount);
// Skenet runt lampan: en liten fläck som alltid vetter mot kameran.
const lampHalos = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), makeGlowMaterial(0.9), lampCount);
// Ljuspölen: en stor fläck som ligger platt på marken under lampan.
const poolGeometry = new THREE.PlaneGeometry(LAMP_POOL_SIZE, LAMP_POOL_SIZE);
poolGeometry.rotateX(-Math.PI / 2); // Lägg ner den på marken.
const lampPools = new THREE.InstancedMesh(poolGeometry, makeGlowMaterial(0.45), lampCount);

// Två hjälpobjekt: lampBase står där lyktan står och är vriden som den. lampPart är
// ett barn till det, och flyttas till varje dels plats INNE i lyktan. Delens färdiga
// matris (plats + vridning i världen) läses sedan av från lampPart.
const lampBase = new THREE.Object3D();
const lampPart = new THREE.Object3D();
lampBase.add(lampPart);
function placeLampPart(mesh, i, x, y, z) {
  lampPart.position.set(x, y, z);
  lampBase.updateMatrixWorld(true); // Räkna om matriserna för lampBase och dess barn.
  mesh.setMatrixAt(i, lampPart.matrixWorld);
}
// Kamerans lutning nedåt, så att skenet kan vändas rakt mot den: atan2(höjd, avstånd i sidled).
const CAMERA_PITCH = Math.atan2(cameraOffset.y, Math.hypot(cameraOffset.x, cameraOffset.z));
const haloHelper = new THREE.Object3D();
const lampColor = new THREE.Color();

STREET_LAMPS.forEach((lamp, i) => {
  lampBase.position.set(lamp.at.x, 0, lamp.at.z);
  lampBase.rotation.y = lamp.arm;
  placeLampPart(lampPosts, i, 0, LAMP_HEIGHT / 2, 0);
  placeLampPart(lampArms, i, 0, LAMP_HEIGHT - 0.1, LAMP_REACH / 2);
  placeLampPart(lampHeads, i, 0, LAMP_HEIGHT - 0.15, LAMP_REACH);
  placeLampPart(lampBulbs, i, 0, LAMP_HEIGHT - 0.27, LAMP_REACH);
  placeLampPart(lampPools, i, 0, 0.09, LAMP_REACH); // 0.09 = strax över marken och kanttoningen.

  // Skenet: samma plats som glödlampan, men vridet mot kameran i stället för som lyktan.
  // 'YXZ' = vrid först runt Y (mot kameran i sidled), sedan runt X (luta upp mot kameran).
  // Flytta lampPart till glödlampan och läs av var den hamnar i världen.
  lampPart.position.set(0, LAMP_HEIGHT - 0.35, LAMP_REACH);
  lampBase.updateMatrixWorld(true);
  haloHelper.position.setFromMatrixPosition(lampPart.matrixWorld);
  haloHelper.rotation.set(-CAMERA_PITCH, BILLBOARD_FACING, 0, 'YXZ');
  haloHelper.updateMatrix();
  lampHalos.setMatrixAt(i, haloHelper.matrix);

  // Färgen. Glödlampan blandas med vitt (lerp 0.5 = halvvägs), så att den ser ljusare ut än skenet.
  lampColor.set(lamp.color);
  lampHalos.setColorAt(i, lampColor);
  lampPools.setColorAt(i, lampColor);
  lampBulbs.setColorAt(i, lampColor.lerp(new THREE.Color('#ffffff'), 0.5));
  // Spara färgerna, så att flimret (se updateLamps) kan tona ner och tillbaka till dem.
  lamp.glowColor = new THREE.Color(lamp.color);
  lamp.bulbColor = lampColor.clone(); // .clone() = en egen kopia, annars delar alla lyktor samma färg.
  // Var femte lykta är "trasig" och flimrar ibland. % 5 === 2 = nummer 2, 7, 12, 17 ...
  lamp.faulty = i % 5 === 2;
  lamp.flickerLeft = 0; // Sekunder kvar av en pågående flimmerattack. 0 = lyser stadigt.
});

// --- Flimmer ---
// En trasig lykta lyser stadigt det mesta av tiden, men får då och då en kort
// "attack" där den blinkar oregelbundet, som ett glappande lysrör.
const FLICKER_CHANCE = 0.25;   // Chans per sekund att en attack börjar. ÄNDRA för oftare/mer sällan.
const FLICKER_LENGTH = 0.8;    // Hur länge en attack håller på, i sekunder (ungefär).
const flickerColor = new THREE.Color();
function updateLamps(delta) {
  let changed = false;
  STREET_LAMPS.forEach((lamp, i) => {
    if (!lamp.faulty) return;
    let brightness = 1;
    if (lamp.flickerLeft > 0) {
      lamp.flickerLeft -= delta;
      // Under attacken: slumpa varje bild om lampan är nästan släckt eller tänd.
      brightness = Math.random() < 0.45 ? 0.12 : 1;
      if (lamp.flickerLeft <= 0) brightness = 1; // Attacken är slut: tänd igen.
    } else if (Math.random() < FLICKER_CHANCE * delta) {
      // FLICKER_CHANCE * delta = chansen just den här bilden, så att det blir lika ofta på alla datorer.
      lamp.flickerLeft = FLICKER_LENGTH * (0.5 + Math.random());
    } else {
      return; // Lyser stadigt och var redan tänd: inget att ändra.
    }
    // multiplyScalar = gånger ett tal. Svart (0) betyder "lägg inte till något ljus" med AdditiveBlending.
    flickerColor.copy(lamp.glowColor).multiplyScalar(brightness);
    lampHalos.setColorAt(i, flickerColor);
    lampPools.setColorAt(i, flickerColor);
    flickerColor.copy(lamp.bulbColor).multiplyScalar(0.25 + brightness * 0.75); // Glödlampan blir aldrig helt svart.
    lampBulbs.setColorAt(i, flickerColor);
    changed = true;
  });
  // Säg till three.js att skicka de nya färgerna till grafikkortet – bara om något ändrats.
  if (changed) {
    lampHalos.instanceColor.needsUpdate = true;
    lampPools.instanceColor.needsUpdate = true;
    lampBulbs.instanceColor.needsUpdate = true;
  }
}
scene.add(lampPosts, lampArms, lampHeads, lampBulbs, lampHalos, lampPools);

// ---------------------------------------------------------------------------
// LÖNNAR – höstträd utspridda över marken.
// ---------------------------------------------------------------------------
// Alla träd ritas med "instancing": grafikkortet får EN stam-form och EN
// lövboll-form och ritar dem på många platser i ett enda svep. Det är mycket
// snabbare än hundratals separata objekt.
const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 7);
// IcosahedronGeometry(radie, detalj): en boll av 20 trianglar. Detalj 0 = kantig "low poly".
const leafGeometry = new THREE.IcosahedronGeometry(1.3, 0);
// Vitt material: varje lövboll får sin egen färg längre ner (vitt gånger färg = färgen).
// flatShading: varje triangel får en egen jämn nyans, så kanterna syns tydligt.
const leafMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
// .map gör om varje färgkod i paletten till en THREE.Color och ger tillbaka en ny lista.
const leafColors = PALETTE.leaves.map((hex) => new THREE.Color(hex));

// En lönn har en bred, rund krona. Tre kantiga bollar som överlappar ger den formen.
// Varje [x, y, z, storlek] är en boll: en stor i mitten och två mindre på sidorna.
const CROWN_BLOBS = [[0, 2.8, 0, 1], [0.9, 2.3, 0.3, 0.7], [-0.8, 2.4, -0.4, 0.75]];

// Steg 1: bestäm var träden ska stå.
const TREE_TRIES = 270; // Många försök, eftersom de som hamnar utanför cirkeln eller på vägar hoppas över. (Var 150 när marken var 120 stor.)
const trees = [];
for (let i = 0; i < TREE_TRIES; i++) {
  // Math.random() ger ett slumptal mellan 0 och 1.
  // (tal - 0.5) ger -0.5..0.5, gånger markens storlek ger en plats någonstans på marken.
  // + HUB_X / HUB_Z: runt hemvärldens mitt, som inte ligger på (0, 0).
  const x = HUB_X + (Math.random() - 0.5) * GROUND_SIZE;
  const z = HUB_Z + (Math.random() - 0.5) * GROUND_SIZE;

  // Math.hypot(x, z) = avståndet från mitten (Pythagoras).
  // "continue" avbryter det här varvet och går vidare till nästa.
  // Inga träd på tomten runt stugan (där bilen startar).
  if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) continue;
  // Inga träd långt ute i toningen heller, där marken håller på att försvinna.
  if (Math.hypot(x - HUB_X, z - HUB_Z) > DRIVE_RADIUS + 5) continue;
  // Inga träd på eller precis intill en väg.
  if (ROADS.some((road) => distanceToRoad(x, z, road) < ROAD_WIDTH / 2 + 2)) continue;
  // Inga träd nära en skylt heller, så att de inte skymmer skärmen.
  // .some(...) svarar "stämmer det här för minst ett projekt i listan?".
  if (PROJECTS.some((project) => Math.hypot(x - project.x, z - project.z) < 12)) continue;
  // Inte heller vid grottorna, så att träden inte växer genom berget.
  if (hubPortals.some((portal) => Math.hypot(x - portal.at.x, z - portal.at.z) < 12)) continue;
  // Och inte tätt intill en gatlykta, så att kronan inte växer genom lampan.
  if (STREET_LAMPS.some((lamp) => Math.hypot(x - lamp.at.x, z - lamp.at.z) < 3)) continue;

  trees.push({
    x,
    z,
    angle: Math.random() * Math.PI * 2,  // Slumpad vridning, ett helt varv = 2 * PI.
    scale: 0.8 + Math.random() * 0.6,    // Slumpad storlek, 0.8 till 1.4 gånger.
    // Math.floor avrundar nedåt = en slumpad plats i listan med lövfärger.
    color: leafColors[Math.floor(Math.random() * leafColors.length)],
  });
}

// Träd runt stugan. De här står på bestämda platser i stället för slumpade,
// så att tomten ser likadan ut varje gång. [x, z, storlek, färgnummer], räknat
// inne i hem-gruppen (-x = vänster, -z = uppåt på skärmen).
const HOME_TREES = [
  [-3, -5, 1.2, 1], [2.5, -6, 1.0, 0], [7, -5.5, 1.2, 2],   // Bakom garaget och stugan.
  [-6.5, -1, 1.1, 0], [-7, 4, 1.0, 1], [-6, 8, 0.9, 2],     // Till vänster om garaget och uppfarten.
];
for (const [x, z, scale, colorIndex] of HOME_TREES) {
  // localToWorld gör om platsen i hem-gruppen till en plats i världen.
  const spot = homeGroup.localToWorld(new THREE.Vector3(x, 0, z));
  trees.push({ x: spot.x, z: spot.z, angle: Math.random() * Math.PI * 2, scale, color: leafColors[colorIndex] });
}

// Steg 2: skapa två InstancedMesh. Sista talet = hur många kopior som ska ritas.
const trunks = new THREE.InstancedMesh(trunkGeometry, postMaterial, trees.length);
const crowns = new THREE.InstancedMesh(leafGeometry, leafMaterial, trees.length * CROWN_BLOBS.length);

// Steg 3: tala om var varje kopia ska vara. Det görs med en "matris" (position +
// vridning + storlek i ett paket). Enklaste sättet att få en matris är att ställa
// in ett osynligt hjälpobjekt och kopiera dess matris.
const helper = new THREE.Object3D();
// .forEach kör funktionen en gång per träd. i = trädets nummer (0, 1, 2, ...).
trees.forEach((tree, i) => {
  // Stammen. Dess mitt ligger på halva höjden (0.9), gånger trädets storlek.
  helper.position.set(tree.x, 0.9 * tree.scale, tree.z);
  helper.rotation.set(0, tree.angle, 0);
  helper.scale.setScalar(tree.scale);
  helper.updateMatrix(); // Räkna ut matrisen från position, vridning och storlek.
  trunks.setMatrixAt(i, helper.matrix);

  // Kronans tre bollar.
  CROWN_BLOBS.forEach(([bx, by, bz, size], j) => {
    // Bollens plats ska vridas med trädet. Att vrida en punkt runt Y-axeln:
    const cos = Math.cos(tree.angle);
    const sin = Math.sin(tree.angle);
    const turnedX = bx * cos + bz * sin;
    const turnedZ = -bx * sin + bz * cos;
    helper.position.set(tree.x + turnedX * tree.scale, by * tree.scale, tree.z + turnedZ * tree.scale);
    helper.scale.setScalar(size * tree.scale);
    helper.updateMatrix();
    // Varje träd har 3 bollar, så träd nummer i använder plats i*3, i*3+1 och i*3+2.
    const slot = i * CROWN_BLOBS.length + j;
    crowns.setMatrixAt(slot, helper.matrix);
    crowns.setColorAt(slot, tree.color);
  });
});
scene.add(trunks, crowns);

// ---------------------------------------------------------------------------
// BIL – byggd av lådor och cylindrar. Fronten pekar längs +Z.
// ---------------------------------------------------------------------------
// Alla delar läggs i en grupp. Sedan räcker det att flytta/vrida gruppen.
// Delarnas positioner nedan är RELATIVA gruppen, inte världen.
const car = new THREE.Group();

// Fyra material = fyra sorters ytor.
// roughness: 0 = blank som en spegel, 1 = helt matt.
// metalness: 0 = plast/gummi, 1 = metall.
// (paintMaterial och glassMaterial skapas längre upp, vid HEMMA, eftersom stugan också använder dem.)
const tireMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.tire, roughness: 0.9 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.rim, roughness: 0.4, metalness: 0.6 });

// Kaross: BoxGeometry(bredd X, höjd Y, längd Z).
const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.4), paintMaterial);
body.position.y = 0.5; // Lyft upp så att hjulen får plats under.
car.add(body);

// Hytt: en mindre låda ovanpå, lite bakom mitten (z = -0.2).
const cabin = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1.1), glassMaterial);
cabin.position.set(0, 0.9, -0.2);
car.add(cabin);

// --- Lampor ---
// MeshBasicMaterial påverkas inte av scenens ljus eller skuggsidor, så ytan har
// alltid full färg. Det får lamporna att se ut som om de lyser själva.
// (De kastar inget riktigt ljus på omgivningen – det är bara färgade lådor.)
const headlightMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.headlight });
const taillightMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.taillight });
// En liten platt låda: 0.28 bred, 0.14 hög, 0.06 tjock. Samma form till alla fyra lampor.
const lampGeometry = new THREE.BoxGeometry(0.28, 0.14, 0.06);

// Strålkastarnas ljuskäglor sparas här, så att de kan tändas när bilen har backat ut ur garaget.
const HEADLIGHT_STRENGTH = 600; // ÄNDRA för starkare/svagare ljus.
const headlightBeams = [];

// x = vänster och höger sida.
for (const x of [-0.4, 0.4]) {
  // Karossen är 2.4 lång, så fronten ligger på z = 1.2 och baken på z = -1.2.
  // Lampans mitt sätts precis där, så att halva lådan sticker ut ur karossen.
  const headlight = new THREE.Mesh(lampGeometry, headlightMaterial);
  headlight.position.set(x, 0.55, 1.2);
  car.add(headlight);

  const taillight = new THREE.Mesh(lampGeometry, taillightMaterial);
  taillight.position.set(x, 0.55, -1.2);
  car.add(taillight);

}

// --- Strålkastarnas ljus ---
// En SpotLight är en ljuskägla, som en ficklampa. Det finns EN kägla mitt i fronten
// (inte en per lampa), eftersom den kastar skuggor – och varje lampa med skuggor
// kostar lika mycket som att rita scenen en extra gång.
// SpotLight(färg, styrka, räckvidd, vinkel, mjuk kant):
//   0    – styrka. Släckt från början; tänds med HEADLIGHT_STRENGTH efter introt (se updateCar).
//   30   – hur långt ljuset når, i enheter.
//   0.55 – käglans halva bredd i radianer (ca 32°).
//   0.7  – hur mjuk käglans kant är: 0 = knivskarp, 1 = helt mjuk.
const beam = new THREE.SpotLight(PALETTE.headlightBeam, 0, 30, 0.55, 0.7);
headlightBeams.push(beam);
// Fusk: lampan sitter en bit OVANFÖR bilen (y = 2.2) i stället för i själva
// strålkastarna. Ljus som stryker nästan platt längs marken lyser knappt upp
// den alls; snett uppifrån blir det en tydlig ljuspöl framför bilen.
beam.position.set(0, 2.2, 1.3);
// Käglan siktar på en punkt på marken 8 enheter framför bilen. Både lampan och
// siktpunkten sitter på bilen, så ljuset följer med när bilen svänger.
beam.target.position.set(0, 0, 8);
// Skuggor: utan dem lyser ljuset rakt igenom hus och träd. Med skuggor stoppas
// det av det första det träffar, och det som står bakom hamnar i skugga.
beam.castShadow = true;
beam.shadow.mapSize.set(1024, 1024); // Skuggkartans upplösning. Sänk till 512 om det hackar.
beam.shadow.camera.near = 0.5;
beam.shadow.camera.far = 30;
beam.shadow.bias = -0.002;
beam.shadow.normalBias = 0.03;
car.add(beam, beam.target);

// --- Hjul ---
// Ett slätt runt hjul ser likadant ut hur det än snurrar. För att snurret ska
// synas byggs varje hjul av tre delar: däck + fälg + ekrar. Ekrarna är det
// som ögat kan följa.
const WHEEL_RADIUS = 0.3;

// Däck: en kort cylinder. CylinderGeometry(radie uppe, radie nere, höjd, antal sidor).
const tireGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.25, 20);
// En cylinder skapas stående som en burk. Vrid själva formen 90° runt Z
// så att den ligger ner med axeln längs X, som ett hjul.
tireGeometry.rotateZ(Math.PI / 2);

// Fälg: en mindre cylinder som är lite bredare (0.27) än däcket (0.25),
// så att den sticker ut en aning på båda sidor och syns.
const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 20);
rimGeometry.rotateZ(Math.PI / 2);

// Eker: en smal mörk list tvärs över fälgen, ännu lite bredare (0.29) så den syns utanpå.
const spokeGeometry = new THREE.BoxGeometry(0.29, 0.08, 0.4);

const frontWheels = []; // Framhjulen sparas här eftersom de ska kunna svänga.
const spinners = [];    // Alla fyra hjulens snurrande del sparas här.

// Två loopar i varandra ger alla fyra kombinationer:
// x = vänster/höger sida, z = bak/fram.
for (const x of [-0.65, 0.65]) {
  for (const z of [-0.75, 0.75]) {
    // Ett hjul gör två olika vridningar: det SVÄNGER (runt Y) och det SNURRAR (runt X).
    // Enklast är en grupp för varje: den yttre svänger, den inre snurrar.
    // Den inre följer med när den yttre svänger, men inte tvärtom.
    const wheel = new THREE.Group();   // Yttre: plats på bilen + sväng.
    const spinner = new THREE.Group(); // Inre: snurr.
    wheel.add(spinner);

    spinner.add(new THREE.Mesh(tireGeometry, tireMaterial));
    spinner.add(new THREE.Mesh(rimGeometry, rimMaterial));
    // Två ekrar i kors. Den andra vrids 90° runt hjulaxeln (X).
    const spokeA = new THREE.Mesh(spokeGeometry, tireMaterial);
    const spokeB = new THREE.Mesh(spokeGeometry, tireMaterial);
    spokeB.rotation.x = Math.PI / 2;
    spinner.add(spokeA, spokeB);

    wheel.position.set(x, WHEEL_RADIUS, z); // y = hjulets radie, så det precis nuddar marken.
    car.add(wheel);
    spinners.push(spinner); // push lägger till sist i listan.
    if (z > 0) frontWheels.push(wheel); // Positivt z = fram.
  }
}
// Bilen startar inne i garaget och backar ut av sig själv (se INTRO i updateCar).
const carStart = towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z); // Garagets mitt, i världen.
car.position.set(carStart.x, 0, carStart.z);
scene.add(car);

// ---------------------------------------------------------------------------
// TANGENTBORD
// ---------------------------------------------------------------------------
// Webbläsaren säger bara till i ögonblicket en tangent trycks ner eller släpps.
// Vi behöver veta vilka som är nere JUST NU, så vi håller själva reda på det.
// Ett Set är en lista där varje värde bara kan finnas en gång.
const keys = new Set();

// e.code är tangentens PLATS på tangentbordet ('KeyW'), inte bokstaven som skrivs.
// Då fungerar WASD likadant oavsett språk/layout.
const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

// addEventListener(händelse, funktion): "kör den här funktionen varje gång händelsen sker".
// (e) => { ... } är en funktion; e är information om händelsen.
window.addEventListener('keydown', (e) => {
  if (!DRIVE_KEYS.includes(e.code)) return; // Inte en körtangent? Gör ingenting.
  if (panelOpen || introOpen) return; // Infopanelen eller startskärmen är öppen: bilen står still.
  e.preventDefault(); // Stoppar webbläsarens egna beteende, t.ex. att pilarna scrollar sidan.
  keys.add(e.code);
});
// När tangenten släpps tas den bort ur listan.
window.addEventListener('keyup', (e) => keys.delete(e.code));
// 'blur' = fönstret tappar fokus (t.ex. man byter flik). Då kommer aldrig något
// 'keyup', så vi tömmer listan – annars fortsätter bilen köra av sig själv.
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------------------
// TOUCHKNAPPAR – mobilens version av tangentbordet.
// ---------------------------------------------------------------------------
// Varje knapp (se index.html) lägger in sin tangent i samma lista `keys` som
// tangentbordet använder. Då behöver updateCar ingenting veta om touch.
// Pointer events fungerar för både finger och mus, och varje finger har sitt eget
// id, så man kan hålla gas med en tumme och styra med den andra.
for (const button of document.querySelectorAll('.touch-btn')) {
  const code = button.dataset.key; // data-key="KeyW" i HTML blir button.dataset.key här.
  const press = (e) => {
    e.preventDefault();
    if (panelOpen || introOpen) return;
    // Fingret "fastnar" på knappen även om det glider utanför den, så man släpper aldrig av misstag.
    button.setPointerCapture(e.pointerId);
    keys.add(code);
    button.classList.add('pressed'); // CSS ger den nedtryckta knappen en annan färg.
  };
  const release = () => {
    keys.delete(code);
    button.classList.remove('pressed');
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release); // Systemet avbröt touchen (t.ex. en notis).
}

// ---------------------------------------------------------------------------
// KÖRNING – ändra de här talen för att ändra känslan.
// ---------------------------------------------------------------------------
const MAX_SPEED = 12;      // Toppfart, enheter per sekund.
const ACCELERATION = 14;   // Hur snabbt farten ökar, enheter per sekund per sekund.
const FRICTION = 6;        // Hur snabbt bilen saktar in när man släpper gasen.
const TURN_RATE = 2.4;     // Hur snabbt bilen svänger vid toppfart, radianer per sekund.
const MAX_STEER = 0.5;     // Hur mycket framhjulen vrids, radianer (ca 29°).

// "let" i stället för "const" eftersom de här värdena ändras hela tiden.
let speed = 0;   // Nuvarande fart. Negativ = backar.
// Åt vilket håll bilen pekar, i radianer. 0 = längs +Z.
// Startvärdet PI / 4 (45°) pekar rakt uppåt på skärmen: bilen står med nosen in i garaget.
let heading = Math.PI / 4;

// --- AUTOPILOT: bilen kör av sig själv till en punkt ---
// Används när bilen backar ut ur garaget i början, och när den kör in i och ut ur
// en portal. Medan den kör själv ignoreras tangenterna.
//   to       – målet, { x, z }.
//   reverse  – true = backa dit (nosen pekar bort från målet).
//   speed    – enheter per sekund.
//   onDone   – funktion som körs när bilen är framme. Får utelämnas.
let autoDrive = null; // Pågående körning, eller null.
function startAutoDrive(to, reverse, driveSpeed, onDone) {
  autoDrive = { to, reverse, speed: driveSpeed, onDone };
}

// Vrider en vinkel mjukt mot en annan, åt det kortaste hållet. (Från 350° till 10°
// ska den vrida 20° framåt, inte 340° bakåt.) atan2(sin, cos) gör om skillnaden till
// ett tal mellan -PI och PI, alltså det kortaste vridet.
function turnTowards(angle, goal, rate, delta) {
  const difference = Math.atan2(Math.sin(goal - angle), Math.cos(goal - angle));
  // 1 - exp(...) är samma mjuka inbromsning som THREE.MathUtils.damp.
  return angle + difference * (1 - Math.exp(-rate * delta));
}

function updateAutoDrive(delta) {
  const dx = autoDrive.to.x - car.position.x;
  const dz = autoDrive.to.z - car.position.z;
  const distanceLeft = Math.hypot(dx, dz);
  // Hur långt bilen flyttas den här bilden. Math.min gör att den aldrig kör
  // längre än det som är kvar, så den stannar exakt på målet.
  const step = Math.min(autoDrive.speed * delta, distanceLeft);
  if (distanceLeft > 0) {
    // dx / distanceLeft = en riktning som är exakt 1 lång. Gånger step = den här bildens sträcka.
    car.position.x += (dx / distanceLeft) * step;
    car.position.z += (dz / distanceLeft) * step;
    // Nosen ska peka mot målet – eller bort från det när bilen backar.
    const goal = autoDrive.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    heading = turnTowards(heading, goal, 10, delta);
  }
  car.rotation.y = heading;
  speed = 0; // När autopiloten släpper står bilen still.
  // Hjulen snurrar lika fort som marken passerar, baklänges när bilen backar.
  for (const spinner of spinners) {
    spinner.rotation.x += (autoDrive.reverse ? -step : step) / WHEEL_RADIUS;
  }
  // Framhjulen rätas upp.
  for (const wheel of frontWheels) {
    wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, 0, 12, delta);
  }
  // Framme? Släpp autopiloten FÖRST och kör sedan onDone, så att onDone kan starta en ny körning.
  if (step >= distanceLeft) {
    const onDone = autoDrive.onDone;
    autoDrive = null;
    if (onDone) onDone();
  }
}

// --- STARTSKÄRMEN och INTRO ---
// När sidan laddas syns startskärmen (se index.html) ovanpå scenen. Bilen står
// parkerad inne i garaget med porten öppen, så man ser baklysena i mörkret.
// När besökaren trycker Start (eller valfri tangent) tonas skärmen bort och bilen
// backar ut ur garaget av sig själv.
const INTRO_SPEED = 4; // Hur fort den backar, enheter per sekund.
// Porten är "öppen" (gömd) tills bilen är ute. Bakom den syns det mörka hålet.
garageDoor.visible = false;

const introElement = document.getElementById('intro');
let introOpen = true; // Medan den är true kan bilen inte köras och Enter öppnar ingen panel.
// Hur mycket kameran är förskjuten för startskärmen: 1 = helt, 0 = inte alls (vanligt läge).
// Förskjutningen gör att bilen hamnar BREDVID texten i stället för bakom den.
let introShift = 1;
const INTRO_SHIFT_SIDE = 9; // Dator: siktpunkten flyttas så här långt åt vänster = bilen hamnar till höger.
const INTRO_SHIFT_UP = 7;   // Mobil: siktpunkten flyttas uppåt = bilen hamnar längre ner, under texten.

// Hur kameran ska förskjutas just nu, som { x, z }. Räknas om varje bild, så att det
// stämmer även om fönstret ändrar storlek (t.ex. om mobilen vrids).
function introCameraShift() {
  const origin = { x: 0, z: 0 };
  const shift = window.innerWidth <= 600
    ? towardCamera(origin, -INTRO_SHIFT_UP * introShift)
    : toTheRight(origin, -INTRO_SHIFT_SIDE * introShift);
  return shift;
}

function startGame() {
  if (!introOpen) return; // Redan startad (t.ex. både klick och tangent).
  introOpen = false;
  keys.clear();
  introElement.classList.add('leaving'); // CSS tonar bort skärmen.
  document.body.classList.remove('intro-open'); // Guiden och touchknapparna kommer fram.
  // När toningen är klar (0.6 s) tas skärmen bort helt.
  setTimeout(() => { introElement.hidden = true; }, 700);
  // Backa från garaget till parkeringsfickans mitt. Framme: stäng porten och tänd strålkastarna.
  startAutoDrive({ x: home.padX, z: home.padZ }, true, INTRO_SPEED, () => {
    garageDoor.visible = true;
    for (const beam of headlightBeams) beam.intensity = HEADLIGHT_STRENGTH;
  });
}
document.getElementById('introStart').addEventListener('click', startGame);
window.addEventListener('keydown', (e) => {
  if (!introOpen) return;
  // Kortkommandon (t.ex. Cmd+R för att ladda om) och ensamma Shift/Alt/... ska inte starta.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
  e.preventDefault();
  startGame();
});

// Körs en gång per bild. delta = sekunder sedan förra bilden (ca 0.016 vid 60 bilder/s).
// Allt som ändras över tid gångras med delta. Då går bilen lika fort på en
// snabb och en långsam dator: fart * tid = sträcka.
function updateCar(delta) {
  // Autopiloten kör: tangenterna ignoreras.
  if (autoDrive) {
    updateAutoDrive(delta);
    return; // Hoppa över resten av funktionen.
  }
  // Mitt i en resa men autopiloten är klar (bilen står gömd bakom öppningen medan
  // bilden tonas): stå still.
  if (travel) return;

  // "villkor ? 1 : 0" betyder: 1 om villkoret är sant, annars 0.  || betyder "eller".
  // (framåt) - (bakåt) ger 1, -1 eller 0. Båda samtidigt tar ut varandra.
  const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  // Samma sak för styrning: 1 = vänster, -1 = höger.
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);

  if (throttle !== 0) {
    // Gas eller back: ändra farten lite åt det hållet.
    speed += throttle * ACCELERATION * delta;
  } else {
    // Ingen gas: bromsa mot 0. Math.sign(speed) är 1, -1 eller 0 = åt vilket håll vi rör oss.
    // Math.min ser till att vi aldrig drar bort mer än farten vi har kvar,
    // annars skulle bilen börja darra fram och tillbaka runt 0.
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), FRICTION * delta);
  }
  // clamp(värde, min, max) håller värdet inom gränserna. Backen går hälften så fort.
  speed = THREE.MathUtils.clamp(speed, -MAX_SPEED / 2, MAX_SPEED);

  // Sväng. (speed / MAX_SPEED) är 0 när bilen står still och 1 vid toppfart,
  // så bilen kan inte snurra på stället. När speed är negativ (backar) byter
  // svängen håll av sig själv, precis som en riktig bil.
  heading += steer * TURN_RATE * (speed / MAX_SPEED) * delta;

  // Flytta bilen åt det håll den pekar. sin och cos gör om en vinkel till en
  // riktning: sin(heading) = hur mycket åt X, cos(heading) = hur mycket åt Z.
  // Vid heading 0 är sin = 0 och cos = 1, alltså rakt längs +Z.
  car.position.x += Math.sin(heading) * speed * delta;
  car.position.z += Math.cos(heading) * speed * delta;
  // Håll kvar bilen innanför cirkeln runt världens mitt. Om avståndet från mitten är
  // större än radien krymps det tillbaka till cirkelns kant. Att gångra både x och z
  // med samma tal flyttar punkten rakt mot mitten, så bilen glider längs kanten
  // i stället för att tvärstanna.
  const fromCenterX = car.position.x - currentWorld.x;
  const fromCenterZ = car.position.z - currentWorld.z;
  const distance = Math.hypot(fromCenterX, fromCenterZ);
  if (distance > DRIVE_RADIUS) {
    car.position.x = currentWorld.x + fromCenterX * (DRIVE_RADIUS / distance);
    car.position.z = currentWorld.z + fromCenterZ * (DRIVE_RADIUS / distance);
  }
  // Vrid själva modellen runt Y-axeln (den som pekar uppåt) så att den pekar dit den åker.
  car.rotation.y = heading;

  // Vrid framhjulen mot styrvinkeln. damp(nu, mål, hastighet, delta) flyttar
  // värdet mjukt mot målet i stället för att hoppa direkt.
  for (const wheel of frontWheels) {
    wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, steer * MAX_STEER, 12, delta);
  }

  // Snurra hjulen. Sträckan bilen rullat den här bilden är speed * delta.
  // Ett hjul som rullar sträckan s vrids vinkeln s / radie (i radianer).
  // Därför snurrar hjulen exakt så fort som marken passerar, och baklänges vid back.
  for (const spinner of spinners) {
    spinner.rotation.x += (speed * delta) / WHEEL_RADIUS;
  }
}

// ---------------------------------------------------------------------------
// FÖNSTRET ÄNDRAR STORLEK
// ---------------------------------------------------------------------------
// På en smal skärm (mobil i stående läge) ryms inte världen i bredd. Då flyttas
// kameran längre bort: zoom 1 = vanliga avståndet, 2 = dubbelt så långt.
// 1.6 är ungefär bildförhållandet på en vanlig dator. Ändra 2.2 för att begränsa hur långt bort den får gå.
let cameraZoom = 1;
function updateCameraZoom() {
  const aspect = window.innerWidth / window.innerHeight;
  cameraZoom = THREE.MathUtils.clamp(1.6 / aspect, 1, 2.2);
}
updateCameraZoom();

window.addEventListener('resize', () => {
  updateCameraZoom();
  camera.aspect = window.innerWidth / window.innerHeight; // Nytt bildförhållande.
  camera.updateProjectionMatrix(); // Måste anropas efter att kamerans inställningar ändrats.
  renderer.setSize(window.innerWidth, window.innerHeight); // Ny storlek på ritytan.
});

// ---------------------------------------------------------------------------
// SKUGGOR – vilka objekt som kastar och tar emot skuggor.
// ---------------------------------------------------------------------------
// scene.traverse kör funktionen en gång för varje objekt i hela scenen.
// Regeln: allt TAR EMOT skuggor, och allt utom lagren på marken (mark, vägar,
// asfalt – de med renderOrder under 0) KASTAR också skuggor.
scene.traverse((object) => {
  if (!object.isMesh) return;              // Grupper och lampor har inget att skugga.
  if (object.material.transparent) return; // Genomskinliga plan (ENTER-text, kanttoningen) är inte med.
  object.receiveShadow = true;
  if (object.renderOrder >= 0) object.castShadow = true; // >= betyder "större än eller lika med".
});

// ---------------------------------------------------------------------------
// LÖV OCH VIND – lite rörelse i luften och på marken.
// ---------------------------------------------------------------------------
// Hemma singlar höstlöv ner, landar och blir liggande en stund. På marken ligger
// också ett lövtäcke som bilen sparkar upp, och då och då drar en vindby förbi. I de andra världarna svävar i stället små lysande
// gnistor sakta UPPÅT, i världens färg. Det är samma partiklar: bara material,
// färg och riktning byts när man reser (se setWeather).
//
// Löven finns bara i en låda runt bilen. Faller ett löv under marken, eller hamnar
// det utanför lådan när bilen kör vidare, flyttas det till andra sidan lådan. Då ser
// det ut som att det faller löv överallt, fast det bara finns LEAF_COUNT stycken.
const LEAF_COUNT = 140;   // Antal löv. ÄNDRA för tätare/glesare (allt är ett enda ritanrop, så det är billigt).
const LEAF_AREA = 24;     // Lådans halva bredd runt bilen, i enheter.
const LEAF_TOP = 16;      // Hur högt upp löven börjar.

// Lövets form: en romb (fyrkant på högkant), lite längre än bred.
const leafShape = new THREE.Shape();
leafShape.moveTo(0, -0.22);
leafShape.lineTo(0.14, 0);
leafShape.lineTo(0, 0.22);
leafShape.lineTo(-0.14, 0);
const leafParticleGeometry = new THREE.ShapeGeometry(leafShape);
// DoubleSide = båda sidorna syns, eftersom lövet snurrar.
// MeshBasicMaterial = ingen belysning: löven får exakt sina färger (PALETTE.fallenLeaves).
// Med belysning blev de orange löven mörka och rödaktiga i skymningsljuset, så allt såg rött ut.
const fallingLeafMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const fallenLeafColors = PALETTE.fallenLeaves.map((hex) => new THREE.Color(hex));
// Gnistorna: ljus som läggs till (AdditiveBlending), som lyktornas sken.
const moteMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const fallingLeaves = new THREE.InstancedMesh(leafParticleGeometry, fallingLeafMaterial, LEAF_COUNT);
// Löven flyttar runt hela tiden, så three.js kan inte veta i förväg var de är.
// frustumCulled: false = rita alltid, hoppa inte över dem för att de "verkar" vara utanför bild.
fallingLeaves.frustumCulled = false;
scene.add(fallingLeaves); // Läggs till EFTER skuggregeln ovan, så de kastar inga skuggor (det vore onödigt arbete).

// --- Löven på marken ---
// Hemma ligger dessutom ett täcke av löv på marken. Det är en egen InstancedMesh med
// samma form. Även de bor i lådan runt bilen, så det ligger alltid löv där man kör.
// (Lådans kanter är utanför bild, så man ser aldrig att löv flyttas till andra sidan.)
const GROUND_LEAF_COUNT = 420; // ÄNDRA för tätare/glesare lövtäcke.
const groundLeaves = new THREE.InstancedMesh(leafParticleGeometry, fallingLeafMaterial, GROUND_LEAF_COUNT);
groundLeaves.frustumCulled = false;
scene.add(groundLeaves);

// --- Lövens fysik ---
// Alla löv – både de som faller från himlen och de som ligger på marken – är i ett
// av två lägen: I LUFTEN eller PÅ MARKEN. Samma regler gäller för alla:
//   i luften  – dras nedåt, men faller aldrig fortare än sin "fallfart" (ett löv
//               bromsas av luften). Fart åt sidan bromsas mjukt mot vindens fart.
//               Nära marken vänds lövet mjukt platt, så att det "landar".
//   på marken – ligger still, efter en liten gungning när det just landat. Kör bilen
//               förbi sparkas det upp i luften. Blåser det kan det hoppa iväg en bit.
const LEAF_REST_Y = 0.08;   // Lägsta höjden ett liggande löv har: strax över vägar och fickor.
// Varje löv får en egen höjd mellan LEAF_REST_Y och LEAF_REST_Y + LEAF_LAYERS. Då kan löv
// ligga i lager ovanpå varandra utan att flimra (två löv på exakt samma höjd "slåss" om
// vilket som syns, som vägarna gjorde innan de fick egna lager).
const LEAF_LAYERS = 0.04;
const LEAF_GRAVITY = 5;     // Hur fort ett löv som sparkats upp vänder neråt igen. Mindre = svävar längre.
const LEAF_LAND_HEIGHT = 1.2; // Under den här höjden börjar lövet vändas platt inför landningen.
const LEAF_SETTLE_TIME = 0.7; // Hur länge ett löv gungar efter att det landat, i sekunder.
const KICK_RADIUS = 2.4;    // Hur nära bilen ett löv måste ligga för att sparkas upp.
const KICK_MIN_SPEED = 1.5; // Bilen måste köra minst så här fort för att sparka upp löv.

// Gör ett nytt löv. onGround = true för lövtäcket, false för de som faller från himlen.
function makeLeaf(onGround) {
  return {
    x: (Math.random() - 0.5) * 2 * LEAF_AREA,
    restY: LEAF_REST_Y + Math.random() * LEAF_LAYERS, // Höjden just det här lövet ligger på.
    y: onGround ? LEAF_REST_Y : Math.random() * LEAF_TOP,
    z: (Math.random() - 0.5) * 2 * LEAF_AREA,
    vx: 0, vz: 0,                       // Fart åt sidan (x och z), enheter per sekund.
    fall: 1 + Math.random() * 1.2,      // Fallfart: hur fort lövet singlar ner som mest.
    vy: 0,                              // Fart uppåt (minus = nedåt).
    sway: Math.random() * Math.PI * 2,  // Var i gungningen lövet börjar.
    spin: (Math.random() - 0.5) * 6,    // Hur fort det snurrar i luften (minus = åt andra hållet).
    angle: Math.random() * Math.PI * 2, // Snurrvinkeln i luften. Blir vridningen när det landar.
    onGround,
    settle: 0,                          // Sekunder kvar av gungningen efter en landning.
    groundTime: 0,                      // (Bara himmelslöv) sekunder kvar att ligga innan det försvinner.
    scale: onGround ? 0.8 + Math.random() * 0.5 : 1,
  };
}
const leafParticles = [];   // Löven som faller från himlen (eller gnistorna i de andra världarna).
for (let i = 0; i < LEAF_COUNT; i++) {
  const leaf = makeLeaf(false);
  leaf.vy = -leaf.fall;
  // Var tredje löv har redan landat när sidan laddas, och har olika lång tid kvar att
  // ligga. Annars ligger inga nyfallna löv på marken förrän efter en stund.
  if (i % 3 === 0) {
    leaf.onGround = true;
    leaf.y = leaf.restY;
    leaf.yaw = leaf.angle;
    leaf.groundTime = 1 + Math.random() * 15;
  }
  leafParticles.push(leaf);
}

// Lövtäcket ligger i HÖGAR, inte jämnt utspritt: löv samlas i klungor på riktigt
// (i hörn, längs kanter). 70 % av löven läggs i högar, resten strös ut var för sig.
const LEAF_PILES = 28;       // Antal högar i lådan runt bilen.
const LEAF_PILE_RADIUS = 1.8; // Hur stor en hög är.
const pileCenters = [];
for (let i = 0; i < LEAF_PILES; i++) {
  pileCenters.push({ x: (Math.random() - 0.5) * 2 * LEAF_AREA, z: (Math.random() - 0.5) * 2 * LEAF_AREA });
}
const groundLeafParticles = []; // Lövtäcket.
for (let i = 0; i < GROUND_LEAF_COUNT; i++) {
  const leaf = makeLeaf(true);
  leaf.y = leaf.restY;
  leaf.yaw = leaf.angle;
  if (Math.random() < 0.7) {
    // I en hög: en slumpad plats inom högens radie. Math.sqrt gör att löven sprids
    // jämnt över hela cirkeln (utan den skulle de klumpa ihop sig i mitten).
    const pile = pileCenters[i % LEAF_PILES];
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * LEAF_PILE_RADIUS;
    leaf.x = pile.x + Math.cos(angle) * distance;
    leaf.z = pile.z + Math.sin(angle) * distance;
  }
  groundLeafParticles.push(leaf);
  // Samma färger som löven som faller, så att de ser ut att höra ihop.
  groundLeaves.setColorAt(i, fallenLeafColors[i % fallenLeafColors.length]); // Färgerna i tur och ordning = jämn blandning.
}

let weatherDirection = -1; // -1 = faller (löv), +1 = stiger (gnistor).

// Byter väder efter världen: löv hemma, gnistor i världens färg på andra ställen.
function setWeather(world) {
  const isHome = world === WORLDS.hub;
  weatherDirection = isHome ? -1 : 1;
  fallingLeaves.material = isHome ? fallingLeafMaterial : moteMaterial;
  groundLeaves.visible = isHome; // Lövtäcket finns bara hemma.
  const color = new THREE.Color();
  for (let i = 0; i < LEAF_COUNT; i++) {
    // Hemma: en slumpad lövfärg. Annars: världens färg, lite svagare (0.6) så gnistorna inte bländar.
    if (isHome) color.copy(fallenLeafColors[i % fallenLeafColors.length]);
    else color.set(world.accent).multiplyScalar(0.6);
    fallingLeaves.setColorAt(i, color);
  }
  fallingLeaves.instanceColor.needsUpdate = true;
}
setWeather(WORLDS.hub);

// --- Vindbyar ---
// Med 8–12 sekunders mellanrum drar en vindby förbi i ett par sekunder. Styrkan växer
// mjukt och avtar igen (en halv sinusvåg), och under tiden driver fallande löv åt
// sidan och löv på marken hoppar iväg en bit.
const GUST_SPEED = 3.5;     // Vindens fart när byn är som starkast. ÄNDRA för stormigare/lugnare.
const GUST_SKITTER = 0.6;   // Hur många av marklöven som hoppar under en by (chans per sekund).
const wind = { x: 0, z: 0, strength: 0 }; // Vinden just nu. strength = 0..1.
let gustLeft = 0;           // Sekunder kvar av pågående vindby.
let gustLength = 1;
let gustAngle = 0;          // Åt vilket håll det blåser.
let nextGust = 5;           // Sekunder tills nästa vindby. Den första kommer efter 5 sekunder.

function updateWind(delta) {
  if (gustLeft > 0) {
    gustLeft -= delta;
    // 1 - kvar/längd går från 0 till 1 under byn; sin(PI * det) går 0 → 1 → 0.
    wind.strength = Math.max(0, Math.sin(Math.PI * (1 - gustLeft / gustLength)));
  } else {
    wind.strength = 0;
    nextGust -= delta;
    if (nextGust <= 0) {
      gustLength = 2 + Math.random() * 1.5;
      gustLeft = gustLength;
      // Blås ungefär från vänster till höger på skärmen, med lite variation (±0.6 radianer).
      gustAngle = BILLBOARD_FACING + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      nextGust = 8 + Math.random() * 4;
    }
  }
  wind.x = Math.sin(gustAngle) * GUST_SPEED * wind.strength;
  wind.z = Math.cos(gustAngle) * GUST_SPEED * wind.strength;
}

// Skickar upp ett löv i luften. vx, vz = fart åt sidan, vy = fart uppåt.
function launchLeaf(leaf, vx, vz, vy) {
  leaf.onGround = false;
  leaf.vx = vx;
  leaf.vz = vz;
  leaf.vy = vy;
  leaf.spin = (Math.random() - 0.5) * 12; // Snurra vilt när det flyger.
}

// Flyttar ett tal till intervallet -LEAF_AREA..LEAF_AREA runt center, "runt hörnet" som i ett gammalt
// datorspel där man går ut på ena sidan och kommer in på den andra.
function wrapAround(value, center) {
  const size = LEAF_AREA * 2;
  // ((a % b) + b) % b ger alltid ett positivt svar, även för negativa tal.
  return center - LEAF_AREA + ((((value - center + LEAF_AREA) % size) + size) % size);
}

// Bilens fart räknas ut från hur långt den flyttat sig sedan förra bilden. Då
// fungerar det också när autopiloten kör (då är `speed` 0).
const lastCarPosition = new THREE.Vector3().copy(car.position);
const carVelocity = { x: 0, z: 0, speed: 0 };

// Ett steg av fysiken för ett löv. center = mitten av lådan runt bilen.
function stepLeaf(leaf, delta, center) {
  leaf.x = wrapAround(leaf.x, center.x);
  leaf.z = wrapAround(leaf.z, center.z);

  if (leaf.onGround) {
    leaf.settle = Math.max(0, leaf.settle - delta);
    const dx = leaf.x - car.position.x;
    const dz = leaf.z - car.position.z;
    const distance = Math.hypot(dx, dz);
    if (carVelocity.speed > KICK_MIN_SPEED && distance < KICK_RADIUS && distance > 0) {
      // Sparkas upp: bort från bilen (dx / distance = riktningen ut från bilen),
      // plus en del av bilens egen fart. Ju fortare bilen kör, desto högre flyger lövet.
      const push = 1.5 + carVelocity.speed * 0.35;
      launchLeaf(
        leaf,
        (dx / distance) * push + carVelocity.x * 0.5,
        (dz / distance) * push + carVelocity.z * 0.5,
        1.5 + carVelocity.speed * 0.25 + Math.random()
      );
    } else if (wind.strength > 0 && Math.random() < GUST_SKITTER * wind.strength * delta) {
      // Vindbyn tar tag i lövet: ett litet hopp i vindens riktning.
      launchLeaf(leaf, wind.x * 0.8, wind.z * 0.8, 0.6 + Math.random() * 0.8);
    }
    return;
  }

  // I luften. Math.max: falla fortare än fallfarten går inte.
  leaf.vy = Math.max(leaf.vy - LEAF_GRAVITY * delta, -leaf.fall);
  // Farten åt sidan närmar sig vindens fart mjukt (luftmotstånd). Utan vind bromsas lövet till stillastående.
  const drag = 1 - Math.exp(-1.5 * delta);
  leaf.vx += (wind.x - leaf.vx) * drag;
  leaf.vz += (wind.z - leaf.vz) * drag;
  leaf.x += leaf.vx * delta;
  leaf.z += leaf.vz * delta;
  leaf.y += leaf.vy * delta;
  leaf.angle += leaf.spin * delta;
  if (leaf.y <= leaf.restY) {
    // Landat!
    leaf.y = leaf.restY;
    leaf.onGround = true;
    leaf.yaw = leaf.angle; // Ligger kvar vridet åt det håll det snurrat sist – då blir det inget ryck.
    leaf.settle = LEAF_SETTLE_TIME;
    leaf.spin = (Math.random() - 0.5) * 6;
  }
}

// Räknar ut lövets plats och vridning och lägger dem i InstancedMesh-listan.
const leafHelper = new THREE.Object3D();
const tumbleRotation = new THREE.Quaternion();
const flatRotation = new THREE.Quaternion();
const leafEuler = new THREE.Euler();
function placeLeaf(mesh, i, leaf, time) {
  if (leaf.onGround) {
    // Platt på marken (-PI / 2 = vänd upp mot himlen). Precis efter landningen gungar det:
    // sin svänger fram och tillbaka, och (settle / LEAF_SETTLE_TIME) gör svängningen mindre och mindre.
    const wobble = Math.sin(leaf.settle * 18) * 0.35 * (leaf.settle / LEAF_SETTLE_TIME);
    leafHelper.position.set(leaf.x, leaf.restY, leaf.z);
    leafHelper.rotation.set(-Math.PI / 2 + wobble, leaf.yaw, 0, 'YXZ');
  } else {
    const height = leaf.y - leaf.restY;
    // Gungningen åt sidan (som förut), men den dör ut nära marken så att lövet landar
    // där det faktiskt är, utan att hoppa i sidled.
    const swayAmount = Math.min(1, height / 1.5) * 0.8;
    leafHelper.position.set(
      leaf.x + Math.sin(time * 1.3 + leaf.sway) * swayAmount,
      leaf.y,
      leaf.z + Math.cos(time * 0.9 + leaf.sway) * swayAmount
    );
    // Två vridningar: "fladdra" (snurra runt två axlar) och "ligga platt". Nära marken
    // blandas de mjukt från fladder till platt. Ett Quaternion är ett sätt att lagra en
    // vridning som går att blanda jämnt (slerp), vilket vanliga vinklar inte gör.
    tumbleRotation.setFromEuler(leafEuler.set(leaf.angle, leaf.angle * 0.7, leaf.sway, 'XYZ')); // Ordningen måste anges: annars ärvs 'YXZ' från raden under.
    flatRotation.setFromEuler(leafEuler.set(-Math.PI / 2, leaf.angle, 0, 'YXZ'));
    const flatness = THREE.MathUtils.clamp(1 - height / LEAF_LAND_HEIGHT, 0, 1);
    leafHelper.quaternion.slerpQuaternions(tumbleRotation, flatRotation, flatness);
  }
  leafHelper.scale.setScalar(leaf.scale);
  leafHelper.updateMatrix();
  mesh.setMatrixAt(i, leafHelper.matrix);
}

function updateLeaves(delta, center) {
  const time = performance.now() / 1000; // Sekunder, till gungningen.
  updateWind(delta);

  // Bilens fart den här bilden. Hoppar bilen långt på en gång (en resa) räknas det inte som fart.
  const movedX = car.position.x - lastCarPosition.x;
  const movedZ = car.position.z - lastCarPosition.z;
  if (delta > 0 && Math.hypot(movedX, movedZ) < 2) {
    carVelocity.x = movedX / delta;
    carVelocity.z = movedZ / delta;
  } else {
    carVelocity.x = 0;
    carVelocity.z = 0;
  }
  carVelocity.speed = Math.hypot(carVelocity.x, carVelocity.z);
  lastCarPosition.copy(car.position);

  if (weatherDirection > 0) {
    // Gnistorna i de andra världarna: stiger sakta och driver med vinden. Ingen landning.
    leafParticles.forEach((leaf, i) => {
      leaf.y += leaf.fall * 0.5 * delta;
      if (leaf.y > LEAF_TOP) leaf.y -= LEAF_TOP; // Högst upp: börja om vid marken.
      leaf.x = wrapAround(leaf.x + wind.x * delta, center.x);
      leaf.z = wrapAround(leaf.z + wind.z * delta, center.z);
      leaf.angle += leaf.spin * delta;
      leafHelper.position.set(leaf.x, leaf.y, leaf.z);
      leafHelper.rotation.set(leaf.angle, leaf.angle * 0.7, leaf.sway);
      leafHelper.scale.setScalar(1);
      leafHelper.updateMatrix();
      fallingLeaves.setMatrixAt(i, leafHelper.matrix);
    });
    fallingLeaves.instanceMatrix.needsUpdate = true;
    return;
  }

  // Hemma: löven från himlen.
  leafParticles.forEach((leaf, i) => {
    const wasInAir = !leaf.onGround;
    stepLeaf(leaf, delta, center);
    // Nyss landat: ligg kvar en stund (8–16 sekunder).
    if (wasInAir && leaf.onGround && leaf.groundTime <= 0) leaf.groundTime = 8 + Math.random() * 8;
    if (leaf.onGround) {
      leaf.groundTime -= delta;
      // Sista sekunden krymper lövet bort, och börjar sedan om högst upp som ett nytt löv.
      leaf.scale = THREE.MathUtils.clamp(leaf.groundTime, 0, 1);
      if (leaf.groundTime <= 0) {
        Object.assign(leaf, makeLeaf(false), { y: LEAF_TOP }); // Object.assign skriver över alla fält med det nya lövets.
        leaf.vy = -leaf.fall;
      }
    }
    placeLeaf(fallingLeaves, i, leaf, time);
  });
  fallingLeaves.instanceMatrix.needsUpdate = true;

  // Hemma: lövtäcket på marken.
  groundLeafParticles.forEach((leaf, i) => {
    stepLeaf(leaf, delta, center);
    placeLeaf(groundLeaves, i, leaf, time);
  });
  groundLeaves.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// AUTOMATISK KVALITET – sänker de dyraste effekterna om datorn inte hinner med.
// ---------------------------------------------------------------------------
// Sidan mäter hur många bilder per sekund (FPS) den hinner rita. Är det för få
// under en stund tas en dyr effekt bort, en i taget, tills det flyter.
// Snabba datorer märker ingenting – de har aldrig för låg FPS.
// Nivån skrivs i konsolen (Brave: Cmd+Alt+J) så att du kan se vad som hände.
const TARGET_FPS = 45;     // Under det här sänks kvaliteten. ÄNDRA om du vill vara snällare/strängare.
const QUALITY_WINDOW = 2;  // Sekunder som mäts åt gången.
let qualityLevel = 0;
let qualityWait = 3;       // Mät inte de första sekunderna: då laddas filer och sidan hackar ändå.
let measuredTime = 0;
let measuredFrames = 0;

// Varje steg = en effekt som tas bort, i ordning från "kostar mest, syns minst".
const QUALITY_STEPS = [
  {
    name: 'headlight shadows off',
    // Strålkastarens skuggor ritar hela scenen en extra gång varje bild. Utan dem lyser
    // ljuset igenom hus och träd, men det märks knappt.
    apply() { beam.castShadow = false; },
  },
  {
    name: 'smaller, simpler sun shadows',
    apply() {
      keyLight.shadow.mapSize.set(1024, 1024);
      // Den gamla skuggkartan måste kastas för att den nya storleken ska användas.
      if (keyLight.shadow.map) {
        keyLight.shadow.map.dispose();
        keyLight.shadow.map = null;
      }
      renderer.shadowMap.type = THREE.PCFShadowMap; // Hårdare skuggkanter, men billigare än PCFSoft.
    },
  },
  {
    name: 'lower resolution',
    // Sista utvägen: färre pixlar. Bilden blir lite suddigare.
    apply() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * 0.8);
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
  },
];

function updateQuality(rawDelta) {
  if (qualityLevel >= QUALITY_STEPS.length) return; // Redan lägsta nivån.
  // Väldigt långa bilder (fliken låg i bakgrunden, eller en resa laddade något) räknas inte.
  if (rawDelta > 0.25) return;
  if (qualityWait > 0) {
    qualityWait -= rawDelta;
    return;
  }
  measuredTime += rawDelta;
  measuredFrames += 1;
  if (measuredTime < QUALITY_WINDOW) return;
  const fps = measuredFrames / measuredTime;
  measuredTime = 0;
  measuredFrames = 0;
  if (fps >= TARGET_FPS) return; // Det flyter, gör ingenting.
  const step = QUALITY_STEPS[qualityLevel];
  step.apply();
  qualityLevel += 1;
  console.log(`[quality] ${Math.round(fps)} fps → ${step.name} (level ${qualityLevel}/${QUALITY_STEPS.length})`);
  qualityWait = 1; // Ge den nya inställningen en sekund att sätta sig innan nästa mätning.
}

// ---------------------------------------------------------------------------
// RENDERLOOP – hjärtat i programmet.
// ---------------------------------------------------------------------------
// Timer mäter hur lång tid som gått mellan bilderna.
const timer = new THREE.Timer();

// setAnimationLoop kör funktionen en gång per skärmuppdatering (oftast 60 ggr/s).
// time = millisekunder sedan sidan laddades.
renderer.setAnimationLoop((time) => {
  timer.update(time);
  // Sekunder sedan förra bilden. Taket på 0.1 behövs för att fliken pausas när
  // den ligger i bakgrunden – utan det skulle bilen göra ett jättehopp efteråt.
  const rawDelta = timer.getDelta(); // Den verkliga tiden, utan tak – den behövs för att mäta FPS.
  const delta = Math.min(rawDelta, 0.1);

  updateCar(delta);
  updateTravel(delta);
  updateBillboards(delta);
  updateHome();
  updateWorlds(delta);
  updateLamps(delta);
  updateQuality(rawDelta);

  // Kameran följer bilen. Först räknas siktpunkten ut: bilens position + försprånget.
  // .clone() gör en kopia först, annars skulle .add ändra bilens riktiga position.
  const target = car.position.clone().add(cameraLead);
  // Startskärmen: förskjut siktpunkten så att bilen syns bredvid texten. När spelet
  // startat glider förskjutningen mjukt till 0 (damp, som framhjulens sväng).
  if (!introOpen) introShift = THREE.MathUtils.damp(introShift, 0, 2.5, delta);
  if (introShift > 0.001) {
    const shift = introCameraShift();
    target.x += shift.x;
    target.z += shift.z;
  }
  // Kameran sätts på siktpunkten + förskjutningen. Förskjutningen vrids inte
  // med bilen, så kameran tittar alltid från samma håll.
  camera.position.copy(target).addScaledVector(cameraOffset, cameraZoom); // addScaledVector = lägg till offset gånger zoom.
  camera.lookAt(target);
  // Löven/gnistorna hålls i en låda runt samma punkt som kameran tittar på.
  updateLeaves(delta, target);

  // Solen (och därmed rutan där skuggor räknas ut) följer med bilen: lampan hålls
  // alltid på samma avstånd och åt samma håll från siktpunkten, och lyser mot den.
  keyLight.position.copy(target).addScaledVector(SUN_DIRECTION, SUN_DISTANCE);
  keyLight.target.position.copy(target);

  // Rita scenen sedd från kameran. Utan den här raden syns ingenting.
  renderer.render(scene, camera);

  // Portalernas levande bilder ritas efteråt, när skuggorna redan är uträknade för den här bilden.
  updatePortalPreviews(delta);
});
