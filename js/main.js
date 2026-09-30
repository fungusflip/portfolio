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
// (2 på en retina-skärm). Math.min(..., 1.5) sätter ett tak på 1.5: på en
// retina-skärm ritas då ungefär hälften så många pixlar som vid 2, vilket är
// det som avlastar grafikkortet mest. Sänk till 1 om det fortfarande hackar,
// höj till 2 för skarpast möjliga bild.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

// Ritytan ska vara lika stor som webbläsarfönstrets insida.
renderer.setSize(window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------------------
// SCEN – behållaren. Allt som ska synas måste läggas till med scene.add(...).
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();

// PALETT – sidans alla färger på ett ställe. Höstfärger: gult, orange, rött.
// Hex-kod: #RRGGBB, två tecken var för rött, grönt, blått (00 = inget, ff = max).
// Mycket rött + lagom grönt + lite blått = varm ton. Ju mindre grönt, desto rödare.
const PALETTE = {
  background: '#fff3d6', // Ljus grädde: det som syns utanför marken.
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
scene.add(new THREE.AmbientLight('#ffffff', 0.7));

// DirectionalLight: parallella strålar som från solen. Ytor som vetter mot
// ljuset blir ljusa, andra mörkare – det är det som ger form åt objekten.
const keyLight = new THREE.DirectionalLight('#ffffff', 1.5);
// Positionen bestämmer RIKTNINGEN: ljuset lyser från den här punkten mot origo (0, 0, 0).
keyLight.position.set(3, 8, 5);
scene.add(keyLight);

// ---------------------------------------------------------------------------
// MARK
// ---------------------------------------------------------------------------
// Ett synligt objekt (Mesh) = GEOMETRI (formen) + MATERIAL (ytans utseende).
// Markens sida i enheter.
const GROUND_SIZE = 120;

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

// Rita 220 små prickar på slumpade platser. Det är hela "bruset" (noise).
pen.fillStyle = PALETTE.speckle;
for (let i = 0; i < 220; i++) {
  const size = 4 + Math.random() * 8; // Mellan 4 och 12 pixlar.
  // Håll pricken helt innanför bilden, annars klipps den av i skarven mellan kopiorna.
  const x = Math.random() * (TILE_PIXELS - size);
  const y = Math.random() * (TILE_PIXELS - size);
  pen.fillRect(x, y, size, size);
}

// Gör om canvasen till en textur som three.js kan använda.
const groundTexture = new THREE.CanvasTexture(tile);
// Talar om att färgerna i bilden är vanliga skärmfärger (sRGB), annars blir de för bleka.
groundTexture.colorSpace = THREE.SRGBColorSpace;
// RepeatWrapping = upprepa bilden som kakelplattor. S och T är texturens två riktningar.
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
// Hur många kopior som får plats över marken: 120 / 16 = 7.5 åt varje håll.
groundTexture.repeat.set(GROUND_SIZE / TILE_UNITS, GROUND_SIZE / TILE_UNITS);
// Gör texturen skarpare när man ser ytan snett från sidan, som vår kamera gör.
groundTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), // En platt fyrkant.
  // MeshBasicMaterial bryr sig inte om lamporna: ytan får exakt färgerna i texturen.
  // (Bilen använder MeshStandardMaterial, som blir ljusare/mörkare av ljuset.)
  // map = texturen som ska klistras på ytan.
  new THREE.MeshBasicMaterial({ map: groundTexture })
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
scene.add(ground);

// --- Mjuk kant ---
// I stället för att marken tar tvärt slut tonas den ut i bakgrundsfärgen, i en
// cirkel. Det görs med ett andra plan precis ovanpå marken: genomskinligt i
// mitten och gradvis mer täckande (i bakgrundens färg) utåt kanten.
const FADE_START = 0.7; // Var toningen börjar: 0.7 = 70 % av vägen från mitten till kanten.
const fadeImage = document.createElement('canvas');
fadeImage.width = 512;
fadeImage.height = 512;
const fadePen = fadeImage.getContext('2d');
// En rund toning (gradient) mellan två cirklar med samma mitt (256, 256):
// den inre med radie 256 * 0.7 och den yttre med radie 256 (bildens kant).
const gradient = fadePen.createRadialGradient(256, 256, 256 * FADE_START, 256, 256, 256);
// rgba(rött, grönt, blått, täckning). 255, 243, 214 är bakgrundsfärgen #fff3d6.
// Täckning 0 = helt genomskinlig, 1 = helt täckande.
gradient.addColorStop(0, 'rgba(255, 243, 214, 0)');
gradient.addColorStop(1, 'rgba(255, 243, 214, 1)');
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
fade.position.y = 0.07; // Strax ovanför marken, vägarna och parkeringsfickorna.
scene.add(fade);

// Så långt från mitten bilen får köra: fram till där toningen börjar.
// GROUND_SIZE / 2 = avståndet från mitten till kanten.
const DRIVE_RADIUS = (GROUND_SIZE / 2) * FADE_START;

// ---------------------------------------------------------------------------
// PROJEKT – listan som bestämmer vilka skyltar som finns. ÄNDRA HÄR.
// ---------------------------------------------------------------------------
// Varje { ... } är ett projekt = en skylt i världen.
//   title – texten ovanför skärmen.
//   media – filen som visas på skärmen när bilen står framför skylten:
//           .mp4 / .webm = video, .gif = animerad gif, .png / .jpg = stillbild,
//           null = ingen fil än (en "play"-symbol visas).
//           Video är att föredra: mycket mindre filer än gif och lättare för datorn.
//   url   – projektets egen sida på filip.renemark.se. Länkas längst ner i infopanelen. null = ingen länk.
//   category – liten etikett överst i infopanelen.
//   content  – textfilen (HTML) som visas i infopanelen när man trycker Enter/Tab på parkeringsrutan.
//   x, z  – var skylten står på marken.
//   phone – true = klippet är filmat på höjden (mobilformat). Skylten byggs då
//           som en jättelik mobiltelefon i stället för en liggande bioduk.
//   linkText – texten på länken längst ner i infopanelen. Utelämnad = "Open the full page →".
// Lägg till en rad för en ny skylt, ta bort en rad för att ta bort en.
const PROJECTS = [
  { title: 'Foliage Generator', media: 'assets/videos/foliage-generator.mp4', url: 'https://filip.renemark.se/misc/folliage-generator', category: 'Misc', content: 'assets/content/foliage-generator.html', x: 20, z: -10 },
  { title: 'Water Shader', media: 'assets/videos/water-shader.mp4', url: 'https://filip.renemark.se/shaders-rendering/project-water-shader', category: 'Shaders & Rendering', content: 'assets/content/water-shader.html', x: 10, z: 0 },
  { title: 'SpookChester — Pixelart Render', media: 'assets/videos/spookchester.mp4', url: 'https://filip.renemark.se/misc/spookchester-pixelart-render', category: 'Misc', content: 'assets/content/spookchester.html', x: 0, z: 10 },
  { title: 'Mutation Protocol', media: 'assets/videos/mutation-protocol.mp4', url: 'https://filip.renemark.se/misc/mutation-protocol', category: 'Misc', content: 'assets/content/mutation-protocol.html', x: -10, z: 20, phone: true },
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
const bayMaterial = new THREE.MeshBasicMaterial({ map: bayTexture, depthTest: false, depthWrite: false });

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
const cabinWindow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.1), glassMaterial);
cabinWindow.position.set(CABIN_X - 1, 1.6, CABIN_Z + CABIN_SIZE / 2);
homeGroup.add(cabinWindow);

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

const firstProject = PROJECTS[0];
const lastProject = PROJECTS[PROJECTS.length - 1];
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
const gravelMaterial = new THREE.MeshBasicMaterial({ map: gravelTexture, depthTest: false, depthWrite: false });
// Kantlinjen: en enfärgad, lite bredare väg som ligger under gruset och sticker ut på sidorna.
const roadEdgeMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.gravelDark, depthTest: false, depthWrite: false });

const ROAD_WIDTH = 5;     // Vägarnas bredd i enheter.
const ROAD_EDGE = 0.2;    // Hur mycket kantlinjen sticker ut på varje sida.

const MAIN_ROAD_RIGHT = 32; // Hur långt huvudvägen fortsätter åt höger från skyltradens mitt.

// Varje rad är en rak väg från en punkt { x, z } till en annan. ÄNDRA HÄR för fler eller färre vägar.
const ROADS = [
  // Huvudvägen: börjar vid uppfarten hemma, går förbi alla skyltar och vidare ut mot högerkanten
  // (plats för fler saker senare).
  { from: homeRoadPoint, to: toTheRight(junction, MAIN_ROAD_RIGHT) },
  // Uppfarten: från garageporten ner till huvudvägen (den runda änden göms under garaget).
  { from: towardCamera({ x: HOME_X, z: HOME_Z }, GARAGE_Z + GARAGE_DEPTH / 2), to: homeRoadPoint },
];
// En kort infart från huvudvägen in till varje skylts parkeringsficka.
// "..." packar upp en lista; .map gör en ny lista med en väg per skylt.
ROADS.push(...billboards.map((billboard) => ({
  from: towardCamera({ x: billboard.project.x, z: billboard.project.z }, ROAD_DISTANCE),
  to: { x: billboard.padX, z: billboard.padZ },
})));

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
//   arrow – åt vilket håll pilen pekar på skärmen: 'up', 'left' eller 'right'.
//   at    – var skylten står, { x, z }.
const SIGNPOSTS = [
  // Mitt emot uppfarten, på andra sidan huvudvägen: åt höger ligger tech art-projekten.
  { text: 'Tech Art', arrow: 'right', at: towardCamera(homeRoadPoint, 4.2) },
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
  brush.font = 'bold 110px system-ui, sans-serif';
  brush.textAlign = 'center';
  brush.textBaseline = 'middle';
  // Pilen är ett vanligt tecken. Vänsterpil står före texten, de andra efter.
  // ← = ←, → = →, ↑ = ↑.
  let label = `${signpost.text} ↑`;
  if (signpost.arrow === 'left') label = `← ${signpost.text}`;
  if (signpost.arrow === 'right') label = `${signpost.text} →`;
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
const TREE_TRIES = 150; // Fler försök än förut, eftersom de som hamnar utanför cirkeln hoppas över.
const trees = [];
for (let i = 0; i < TREE_TRIES; i++) {
  // Math.random() ger ett slumptal mellan 0 och 1.
  // (tal - 0.5) ger -0.5..0.5, gånger markens storlek ger en plats någonstans på marken.
  const x = (Math.random() - 0.5) * GROUND_SIZE;
  const z = (Math.random() - 0.5) * GROUND_SIZE;

  // Math.hypot(x, z) = avståndet från mitten (Pythagoras).
  // "continue" avbryter det här varvet och går vidare till nästa.
  // Inga träd på tomten runt stugan (där bilen startar).
  if (Math.hypot(x - HOME_X, z - HOME_Z) < 12) continue;
  // Inga träd långt ute i toningen heller, där marken håller på att försvinna.
  if (Math.hypot(x, z) > DRIVE_RADIUS + 5) continue;
  // Inga träd på eller precis intill en väg.
  if (ROADS.some((road) => distanceToRoad(x, z, road) < ROAD_WIDTH / 2 + 2)) continue;
  // Inga träd nära en skylt heller, så att de inte skymmer skärmen.
  // .some(...) svarar "stämmer det här för minst ett projekt i listan?".
  if (PROJECTS.some((project) => Math.hypot(x - project.x, z - project.z) < 12)) continue;

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
  if (panelOpen) return; // Infopanelen är öppen: bilen står still.
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
    if (panelOpen) return;
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

// --- INTRO: bilen backar ut ur garaget av sig själv när sidan laddas ---
const INTRO_SPEED = 4; // Hur fort den backar, enheter per sekund.
// Hur långt den ska backa: från garagets mitt till parkeringsfickans mitt.
let introLeft = HOME_PAD_Z - GARAGE_Z;
// Porten är "öppen" (gömd) tills bilen är ute. Bakom den syns det mörka hålet.
garageDoor.visible = false;

// Körs en gång per bild. delta = sekunder sedan förra bilden (ca 0.016 vid 60 bilder/s).
// Allt som ändras över tid gångras med delta. Då går bilen lika fort på en
// snabb och en långsam dator: fart * tid = sträcka.
function updateCar(delta) {
  // INTRO: så länge det finns sträcka kvar backar bilen själv och tangenterna ignoreras.
  if (introLeft > 0) {
    // Hur långt bilen flyttas den här bilden. Math.min gör att den aldrig backar
    // längre än det som är kvar, så den stannar exakt mitt i fickan.
    const step = Math.min(INTRO_SPEED * delta, introLeft);
    introLeft -= step;
    // Backa = flytta MOT riktningen bilen pekar, därav minustecknen.
    car.position.x -= Math.sin(heading) * step;
    car.position.z -= Math.cos(heading) * step;
    car.rotation.y = heading;
    // Hjulen snurrar baklänges, lika fort som marken passerar (se längst ner i funktionen).
    for (const spinner of spinners) {
      spinner.rotation.x -= step / WHEEL_RADIUS;
    }
    // Framme: stäng porten. Från nästa bild styr tangenterna som vanligt.
    if (introLeft <= 0) garageDoor.visible = true;
    return; // Hoppa över resten av funktionen.
  }

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
  // Håll kvar bilen innanför cirkeln. Om avståndet från mitten är större än
  // radien krymps positionen tillbaka till cirkelns kant. Att gångra både x och z
  // med samma tal flyttar punkten rakt mot mitten, så bilen glider längs kanten
  // i stället för att tvärstanna.
  const distance = Math.hypot(car.position.x, car.position.z);
  if (distance > DRIVE_RADIUS) {
    car.position.x *= DRIVE_RADIUS / distance;
    car.position.z *= DRIVE_RADIUS / distance;
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
  const delta = Math.min(timer.getDelta(), 0.1);

  updateCar(delta);
  updateBillboards(delta);
  updateHome();

  // Kameran följer bilen. Först räknas siktpunkten ut: bilens position + försprånget.
  // .clone() gör en kopia först, annars skulle .add ändra bilens riktiga position.
  const target = car.position.clone().add(cameraLead);
  // Kameran sätts på siktpunkten + förskjutningen. Förskjutningen vrids inte
  // med bilen, så kameran tittar alltid från samma håll.
  camera.position.copy(target).addScaledVector(cameraOffset, cameraZoom); // addScaledVector = lägg till offset gånger zoom.
  camera.lookAt(target);

  // Rita scenen sedd från kameran. Utan den här raden syns ingenting.
  renderer.render(scene, camera);
});
