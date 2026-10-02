// ============================================================================
// billboards.js — projekten och deras "drive-in-bio"-skyltar: stolpar, skärm,
// textskylt och en parkeringsficka framför. Kör in i fickan så startar skärmen.
// ============================================================================
import * as THREE from 'three';
// Två funktioner ur biblioteket gifuct-js, som kan packa upp gif-filer.
import { parseGIF, decompressFrame } from 'gifuct-js';
import {
  scene, PALETTE, WORLDS, BILLBOARD_FACING, MAX_ANISOTROPY, SCREEN_WIDTH, SIGN_HEIGHT, SCREEN_TILT,
  towardCamera, toTheRight, worldGroup, currentWorld, note, postMaterial, frameMaterial,
  makeTitleTexture, makeGlowMaterial,
} from './core.js';
import { setParkedAt } from './ui.js';

// ---------------------------------------------------------------------------
// PROJEKT – listan som bestämmer vilka skyltar som finns. ÄNDRA HÄR.
// ---------------------------------------------------------------------------
// Alla projekt från filip.renemark.se. Texterna i assets/content/ är hämtade från
// sidans egna inlägg, och korta klipp till skärmarna ligger i assets/videos och assets/images.
//   world – vilken värld skylten står i. Skyltarna i en värld ställs på rad i samma
//           ordning som i listan, så ÄNDRA ORDNINGEN här för att flytta dem.
//   title – texten ovanför skärmen.
//   media – .mp4 / .webm = video, .gif = animerad gif, .png / .jpg = stillbild, null = ingen fil.
//           Video är att föredra: mycket mindre filer än gif och lättare för datorn.
//   url   – projektets egen sida. Länkas längst ner i infopanelen.
//   category – liten etikett överst i infopanelen.
//   content  – textfilen (HTML) som visas i infopanelen när man trycker Enter/Tab.
//   phone – true = klippet är filmat på höjden. Skylten blir en jättelik mobiltelefon.
//   linkText – texten på länken i infopanelen. Utelämnad = "Open the full page →".
export const PROJECTS = [
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
// MÅTT
// ---------------------------------------------------------------------------
const SCREEN_HEIGHT = 4.5; // 8 x 4.5 = formatet 16:9, samma som vanlig video.
const POST_HEIGHT = 2.5;   // Hur högt över marken skärmens underkant sitter.
export const PAD_DISTANCE = 6; // Hur långt framför skylten parkeringsfickan ligger.
export const PAD_RADIUS = 4;   // Hur nära fickans mitt bilen måste vara för att skärmen ska starta.
const PHONE_WIDTH = 4;     // Mobilskyltens skärm: 4 x 7.1 = formatet 9:16 (stående).
const PHONE_HEIGHT = 7.1;
// Skärmens bild i pixlar: 960 på långsidan, 540 på kortsidan. Större = skarpare men tyngre.
const SCREEN_PIXELS_LONG = 960;
const SCREEN_PIXELS_SHORT = 540;

// --- Var skyltarna står ---
// I varje värld står skyltarna på en rad, från vänster till höger på skärmen, i
// samma ordning som i PROJECTS.
export const BILLBOARD_SPACING = 14.14; // Avstånd mellan två skyltar längs raden.
export const ROW_UP = 14;               // I de andra världarna: hur långt uppåt från mitten raden står.
for (const world of Object.values(WORLDS)) {
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

// ---------------------------------------------------------------------------
// ATT RITA PÅ EN SKÄRM
// ---------------------------------------------------------------------------
// Varje skylt har en egen osynlig canvas: play-symbolen, laddningssnurran, gif-bilder
// och stillbilder ritas i den. (Video går en snabbare väg direkt till grafikkortet,
// se makeVideoPlayer.) brush.canvas är canvasen som pennan hör till.

// Play-symbolen som visas när skärmen är avstängd.
function drawPlaceholder(brush) {
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  brush.fillStyle = PALETTE.glass;
  brush.fillRect(0, 0, width, height);
  // En triangel räknad från mitten (cx, cy), så symbolen hamnar rätt oavsett skärmens form.
  const cx = width / 2;
  const cy = height / 2;
  brush.fillStyle = PALETTE.speckle;
  brush.beginPath();
  brush.moveTo(cx - 50, cy - 80);
  brush.lineTo(cx - 50, cy + 80);
  brush.lineTo(cx + 80, cy);
  brush.fill();
}

// Laddningssnurran: en båge som snurrar runt mitten, lite mer vriden varje bild.
function drawLoading(billboard) {
  const brush = billboard.brush;
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  brush.fillStyle = PALETTE.glass;
  brush.fillRect(0, 0, width, height);
  const angle = performance.now() * 0.006; // Ungefär ett varv per sekund.
  brush.strokeStyle = PALETTE.speckle;
  brush.lineWidth = 16;
  brush.lineCap = 'round';
  brush.beginPath();
  brush.arc(width / 2, height / 2, 60, angle, angle + Math.PI * 1.5); // Tre fjärdedels varv.
  brush.stroke();
  billboard.texture.needsUpdate = true;
}

// Ritar en bild (gif-bild eller stillbild) på skärmen, förminskad så att HELA får plats.
function drawOnScreen(billboard, source, width, height) {
  const brush = billboard.brush;
  const screenWidth = brush.canvas.width;
  const screenHeight = brush.canvas.height;
  brush.fillStyle = PALETTE.frame;
  brush.fillRect(0, 0, screenWidth, screenHeight);
  // Math.min väljer den minsta skalan, så att bilden får plats åt båda hållen.
  const scale = Math.min(screenWidth / width, screenHeight / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  brush.drawImage(source, (screenWidth - drawWidth) / 2, (screenHeight - drawHeight) / 2, drawWidth, drawHeight);
  // Säger till three.js att canvasen har ändrats och måste skickas till grafikkortet igen.
  billboard.texture.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// SPELARE – en per filtyp, med samma tre funktioner: play(), update(delta), stop().
// ---------------------------------------------------------------------------
// En spelare lever bara medan bilen står i fickan. Då ligger aldrig mer än ett klipp
// i minnet åt gången. sample() ger en bild att läsa skärmens färg från (se sken nedan).

// Video: <video>-elementet blir en VideoTexture som grafikkortet läser direkt.
// (Förut ritades varje videobild först på en 2D-canvas och skickades sedan till
// grafikkortet – en omväg som tvingade webbläsaren att vänta på grafikkortet, ett hack.)
function makeVideoPlayer(billboard) {
  const video = document.createElement('video');
  video.src = billboard.project.media;
  video.loop = true;        // Börja om när den tar slut.
  video.muted = true;       // Webbläsare tillåter bara automatisk start om ljudet är av.
  video.playsInline = true; // Hindrar mobiler från att öppna videon i helskärm.
  let videoTexture = null;  // Skapas när första bilden finns.
  return {
    play() { video.play().catch(() => {}); }, // play() kan nekas; .catch gör att det inte blir ett fel.
    stop() {
      video.pause();
      // Ta bort filen och be elementet ladda om (utan fil) = släpp videon ur minnet.
      video.removeAttribute('src');
      video.load();
      if (videoTexture) videoTexture.dispose();
      billboard.screenMaterial.map = billboard.texture; // Tillbaka till canvasen (play-symbolen).
    },
    update() {
      if (videoTexture) return; // Grafikkortet hämtar själv nya bilder ur videon.
      // Innan första bilden finns (currentTime 0): visa snurran.
      if (video.currentTime <= 0 || !video.videoWidth) {
        drawLoading(billboard);
        return;
      }
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      // "Fyll skärmen": skala texturen så att den täcker hela skärmen och beskär kanterna
      // om formaten inte stämmer. repeat < 1 = visa bara en del av bilden, offset = vilken del.
      const screenAspect = billboard.width / billboard.height;
      const videoAspect = video.videoWidth / video.videoHeight;
      if (videoAspect > screenAspect) {
        videoTexture.repeat.set(screenAspect / videoAspect, 1);         // Videon är bredare: beskär sidorna.
      } else {
        videoTexture.repeat.set(1, videoAspect / screenAspect);         // Videon är högre: beskär upptill/nedtill.
      }
      videoTexture.offset.set((1 - videoTexture.repeat.x) / 2, (1 - videoTexture.repeat.y) / 2); // Mitten.
      billboard.screenMaterial.map = videoTexture;
      note('video starts');
    },
    sample() { return videoTexture ? video : billboard.brush.canvas; },
  };
}

// Gif: webbläsaren kan inte spela en gif på en 3D-yta, så vi spelar den själva.
// Biblioteket gifuct-js packar upp bilderna, och vi ritar nästa när väntetiden har gått.
function makeGifPlayer(billboard) {
  let gif = null;      // Den inlästa filen. null tills den har laddats klart.
  let frames = [];     // Gif-filens bilder (fortfarande hoppackade).
  let index = -1;      // Vilken bild som visas nu. -1 = ingen än.
  let wait = 0;        // Sekunder kvar tills nästa bild ska visas.
  let stopped = false; // Blir true när bilen har kört därifrån.
  // "full" är hela gif-bilden. "patch" är den bit som ändrats sedan förra bilden.
  const full = document.createElement('canvas');
  const fullBrush = full.getContext('2d');
  const patch = document.createElement('canvas');
  const patchBrush = patch.getContext('2d');

  fetch(billboard.project.media)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      if (stopped) return; // Hann bilen köra därifrån? Strunta då i filen.
      gif = parseGIF(buffer);
      frames = gif.frames.filter((frame) => frame.image);
      full.width = gif.lsd.width;
      full.height = gif.lsd.height;
    });

  function showNextFrame() {
    note('gif frame');
    const previous = frames[index];
    index = (index + 1) % frames.length; // Efter sista bilden blir det 0 igen.
    if (index === 0) {
      fullBrush.clearRect(0, 0, full.width, full.height);
    } else if (previous.gce && previous.gce.extras.disposal === 2) {
      // Vissa gif-bilder säger "sudda ut mig innan nästa ritas" (disposal 2).
      const d = previous.image.descriptor;
      fullBrush.clearRect(d.left, d.top, d.width, d.height);
    }
    const frame = decompressFrame(frames[index], gif.gct, true);
    patch.width = frame.dims.width;
    patch.height = frame.dims.height;
    patchBrush.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
    fullBrush.drawImage(patch, frame.dims.left, frame.dims.top);
    wait += frame.delay / 1000; // Väntetiden står i millisekunder.
    drawOnScreen(billboard, full, full.width, full.height);
  }

  return {
    play() {},
    stop() {
      stopped = true;
      gif = null;
      frames = [];
      full.width = 0; // En canvas utan storlek tar inget minne.
      full.height = 0;
      patch.width = 0;
      patch.height = 0;
    },
    update(delta) {
      if (frames.length === 0) {
        drawLoading(billboard);
        return;
      }
      wait -= delta;
      if (wait <= 0) {
        wait = Math.max(wait, -0.1); // Försök inte "ta igen" tid efter ett långt hack.
        showNextFrame();
      }
    },
    sample() { return billboard.brush.canvas; },
  };
}

// Stillbild: laddas och ritas en enda gång.
function makeImagePlayer(billboard) {
  const image = new Image();
  let loaded = false;
  image.onload = () => {
    loaded = true;
    drawOnScreen(billboard, image, image.width, image.height);
  };
  image.src = billboard.project.media;
  return {
    play() {},
    update() {
      if (!loaded) drawLoading(billboard);
    },
    stop() {
      image.onload = null;
      image.src = '';
    },
    sample() { return billboard.brush.canvas; },
  };
}

// Väljer rätt sorts spelare utifrån filnamnets slut.
function makePlayer(billboard) {
  const media = billboard.project.media.toLowerCase();
  if (media.endsWith('.mp4') || media.endsWith('.webm')) return makeVideoPlayer(billboard);
  if (media.endsWith('.gif')) return makeGifPlayer(billboard);
  return makeImagePlayer(billboard);
}

// ---------------------------------------------------------------------------
// PARKERINGSFICKAN OCH ENTER-TEXTEN (används även av garaget, se home.js)
// ---------------------------------------------------------------------------
// Ordet ENTER på genomskinlig bakgrund. lit = tänd orange när bilen står i fickan.
function makePadTexture(lit) {
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 256;
  const brush = image.getContext('2d');
  brush.fillStyle = lit ? PALETTE.signGlow : PALETTE.sign;
  brush.font = 'bold 96px system-ui, sans-serif';
  brush.textAlign = 'center';
  brush.textBaseline = 'middle';
  brush.fillText('ENTER', 256, 134);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISOTROPY;
  return texture;
}
export const padTexture = makePadTexture(false);
export const padTextureActive = makePadTexture(true);

// En mörk asfaltsruta med målade linjer. grus = här kör man, asfalt = här parkerar man.
// Asfalten tonas över i grus i änden mot vägen, så att fickan smälter ihop med infarten.
const BAY_WIDTH = 5.4; // Samma som en väg inklusive kantlinjer.
const BAY_LENGTH = 6.5;
const bayImage = document.createElement('canvas');
bayImage.width = 270;  // 50 pixlar per enhet: 5.4 x 6.5 enheter.
bayImage.height = 325;
const bayPen = bayImage.getContext('2d');
const bayW = bayImage.width;
const bayH = bayImage.height;
// I bilden är y = 0 änden mot skylten och y = bayH änden mot vägen.
const BLEND_START = bayH * 0.6; // Härifrån och ner till infarten tonas asfalten över i grus.
// 1. Asfalt med små ljusa korn.
bayPen.fillStyle = PALETTE.asphalt;
bayPen.fillRect(0, 0, bayW, bayH);
bayPen.fillStyle = PALETTE.asphaltLight;
for (let i = 0; i < 350; i++) bayPen.fillRect(Math.random() * bayW, Math.random() * bayH, 3, 3);
// 2. Toning mot grusets färg (#b7a08a = 183, 160, 138).
const bayBlend = bayPen.createLinearGradient(0, BLEND_START, 0, bayH);
bayBlend.addColorStop(0, 'rgba(183, 160, 138, 0)');
bayBlend.addColorStop(1, 'rgba(183, 160, 138, 1)');
bayPen.fillStyle = bayBlend;
bayPen.fillRect(0, BLEND_START, bayW, bayH - BLEND_START);
// 3. Småsten som "spiller in" från vägen, tätast vid infarten.
for (let i = 0; i < 320; i++) {
  bayPen.fillStyle = i % 2 === 0 ? PALETTE.gravelLight : PALETTE.gravelDark;
  const size = 2.5 + Math.random() * 4.5;
  const y = bayH - Math.random() * Math.random() * (bayH - BLEND_START) * 1.3;
  bayPen.fillRect(Math.random() * bayW, y, size, size);
}
// 4. Tre målade linjer, öppna mot vägen.
bayPen.strokeStyle = PALETTE.sign;
bayPen.lineWidth = 8;
bayPen.lineCap = 'round';
bayPen.beginPath();
bayPen.moveTo(24, BLEND_START);
bayPen.lineTo(24, 24);
bayPen.lineTo(bayW - 24, 24);
bayPen.lineTo(bayW - 24, BLEND_START);
bayPen.stroke();
// 5. Mörk kantlinje, samma som vägarnas.
bayPen.fillStyle = PALETTE.gravelDark;
bayPen.fillRect(0, 0, 10, bayH);
bayPen.fillRect(bayW - 10, 0, 10, bayH);
bayPen.fillRect(0, 0, bayW, 10);
const bayTexture = new THREE.CanvasTexture(bayImage);
bayTexture.colorSpace = THREE.SRGBColorSpace;
bayTexture.anisotropy = MAX_ANISOTROPY;
// depthTest/depthWrite: false = ett "lager på marken" (se renderOrder i hub.js).
const bayMaterial = new THREE.MeshLambertMaterial({ map: bayTexture, depthTest: false, depthWrite: false });

// Ger en ny parkeringsficka med ENTER-text, liggande på marken z enheter framför
// gruppens mitt. Returnerar ENTER-textens material, så att den kan tändas.
export function addParkingBay(group, z) {
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(BAY_WIDTH, BAY_LENGTH), bayMaterial);
  bay.rotation.x = -Math.PI / 2; // Lägg planet ner på marken.
  bay.position.set(0, 0.035, z); // Över grusvägarna, under ENTER-texten.
  bay.renderOrder = -5;          // Ritas efter mark och grus, före allt som står på marken.
  group.add(bay);
  // opacity: 0.6 = lite nedtonad tills bilen står i fickan.
  const padMaterial = new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.6 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), padMaterial);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.05, z); // 0.05 upp, annars flimrar den mot asfalten.
  group.add(pad);
  return padMaterial;
}
// Tänder eller släcker en ENTER-text.
export function lightPad(padMaterial, lit) {
  padMaterial.opacity = lit ? 1 : 0.6;
  padMaterial.map = lit ? padTextureActive : padTexture;
}

// ---------------------------------------------------------------------------
// BYGG SKYLTARNA I EN VÄRLD
// ---------------------------------------------------------------------------
export const billboards = []; // Allt som behövs om varje byggd skylt medan programmet kör.

// ---------------------------------------------------------------------------
// VISNINGSSÄTT – varje värld visar sina projekt på sitt eget sätt (WORLDS.display).
// ---------------------------------------------------------------------------
// Skärmen, titelskylten och parkeringsfickan är likadana överallt. Det som skiljer är
// "huset" runt skärmen. Varje visningssätt har:
//   baseY(isPhone) – hur högt över marken skärmens underkant sitter.
//   border         – ramens bredd runt skärmen.
//   signGap        – extra luft mellan ramen och titelskylten.
//   build(parts)   – bygger huset. parts = { group, panel, width, height, border, baseY, isPhone }.
//     group = hela skylten (står på marken, +z mot kameran).
//     panel = det som lutar bakåt med skärmen (y = uppåt längs skärmen, z = ut ur skärmen).
// Material som bara skyltarna använder:
const goldMaterial = new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.45, metalness: 0.5, emissive: '#3a2a05' });
const viewportMaterial = new THREE.MeshStandardMaterial({ color: '#33414f', roughness: 0.6 });   // 3D-programmets gråblå.
const arcadeMaterial = new THREE.MeshStandardMaterial({ color: '#16241c', roughness: 0.8 });     // Arkadmaskinens mörkgröna lack.
const glowMaterials = {}; // Lysande färger (MeshBasicMaterial), skapas när de behövs och delas.
function glow(color) {
  if (!glowMaterials[color]) glowMaterials[color] = new THREE.MeshBasicMaterial({ color });
  return glowMaterials[color];
}
// En låda med mått (b, h, d) på plats (x, y, z) i förälder. Sparar många rader nedan.
function box(parent, material, b, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const DISPLAYS = {
  // --- Hemma: drive-in-bio. En duk på två stolpar (mobilen står direkt på marken). ---
  cinema: {
    baseY: (isPhone) => (isPhone ? 0.1 : POST_HEIGHT),
    border: 0.2,
    signGap: 0,
    build({ group, panel, width, height, border, isPhone }) {
      if (!isPhone) {
        for (const x of [-3, 3]) box(group, postMaterial, 0.3, POST_HEIGHT, 0.3, x, POST_HEIGHT / 2, -0.16);
      }
      box(panel, frameMaterial, width + border * 2, height + border * 2, 0.3, 0, height / 2 + border, -0.16);
    },
  },

  // --- Tech Art: ett fönster ur ett 3D-program på ett skärmstativ. ---
  // Titelrad med fönsterknappar upptill, och en axel-"gizmo" (röd X, grön Y, blå Z) i
  // hörnet – som i Blender, Maya och Houdini.
  viewport: {
    baseY: (isPhone) => (isPhone ? 1 : 2.2),
    border: 0.18,
    signGap: 0.5, // Plats för titelraden.
    build({ group, panel, width, height, border, baseY }) {
      const outerWidth = width + border * 2;
      const top = height + border * 2;
      box(panel, viewportMaterial, outerWidth, top, 0.25, 0, height / 2 + border, -0.15);       // Ramen.
      box(panel, viewportMaterial, outerWidth, 0.45, 0.27, 0, top + 0.22, -0.15);               // Titelraden.
      box(panel, glow(PALETTE.techGridMain), outerWidth, 0.05, 0.29, 0, top, -0.15);            // Lysande linje under den.
      ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {                                 // Fönsterknapparna.
        box(panel, glow(color), 0.2, 0.2, 0.05, -outerWidth / 2 + 0.35 + i * 0.32, top + 0.22, 0);
      });
      // Gizmon i nedre vänstra hörnet: tre pinnar från samma punkt.
      const corner = { x: -width / 2 + 0.5, y: 0.5 + border };
      box(panel, glow('#ff4d4d'), 0.7, 0.07, 0.07, corner.x + 0.35, corner.y, 0.06);  // X åt höger.
      box(panel, glow('#5dde6a'), 0.07, 0.7, 0.07, corner.x, corner.y + 0.35, 0.06);  // Y uppåt.
      box(panel, glow('#4d8bff'), 0.07, 0.07, 0.7, corner.x, corner.y, 0.06 + 0.35);  // Z ut ur skärmen.
      // Stativet: en fot och en stolpe upp till skärmen.
      box(group, viewportMaterial, 2.6, 0.15, 1.4, 0, 0.075, -0.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, baseY, 10), viewportMaterial);
      pole.position.set(0, baseY / 2, -0.4);
      group.add(pole);
    },
  },

  // --- Programming: en jättelik arkadmaskin. ---
  // Skärmen sitter mellan två sidogavlar, titeln lyser upptill som en "marquee", och
  // framför skärmen finns en kontrollpanel med joystick och knappar.
  arcade: {
    baseY: () => 1.5,
    border: 0.25,
    signGap: 0.15,
    build({ group, panel, width, height, border, baseY }) {
      const outerWidth = width + border * 2;
      const lean = Math.sin(SCREEN_TILT) * (height + border * 2);       // Hur långt bakåt skärmens överkant lutar.
      const topY = baseY + Math.cos(SCREEN_TILT) * (height + border * 2) + 1.7; // Maskinens höjd, inklusive titeln.
      box(panel, arcadeMaterial, outerWidth, height + border * 2, 0.3, 0, height / 2 + border, -0.16); // Skärmens kant.
      // Sidogavlarna, med en lysande neonlist längs framkanten.
      const depth = lean + 1.8;
      for (const side of [-1, 1]) {
        const x = side * (outerWidth / 2 + 0.2);
        box(group, arcadeMaterial, 0.4, topY, depth, x, topY / 2, 0.4 - depth / 2);
        box(group, glow(PALETTE.progTrace), 0.08, topY, 0.08, x + side * 0.05, topY / 2, 0.42);
      }
      box(group, arcadeMaterial, outerWidth, topY, 0.8, 0, topY / 2, -lean - 0.6);    // Baksidan.
      box(group, arcadeMaterial, outerWidth, 0.3, depth, 0, topY - 0.15, 0.4 - depth / 2); // Taket, lika djupt som gavlarna.
      // Nedre fronten och kontrollpanelen.
      box(group, arcadeMaterial, outerWidth, baseY - 0.45, 0.3, 0, (baseY - 0.45) / 2, 0.35);
      box(group, arcadeMaterial, outerWidth, 0.3, 1.1, 0, baseY - 0.3, 0.55);
      box(group, glow(PALETTE.progTrace), outerWidth, 0.05, 0.05, 0, baseY - 0.15, 1.1); // Neonkant.
      // Joysticken: en pinne med en röd kula, och två knappar.
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), frameMaterial);
      stick.position.set(-outerWidth * 0.25, baseY + 0.07, 0.6);
      group.add(stick);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow('#ff4d6d'));
      knob.position.set(-outerWidth * 0.25, baseY + 0.32, 0.6);
      group.add(knob);
      ['#ffd23f', '#4dc3ff'].forEach((color, i) => {
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), glow(color));
        button.position.set(outerWidth * (0.1 + i * 0.15), baseY - 0.1, 0.6);
        group.add(button);
      });
    },
  },

  // --- Art: en tavla i guldram på ett stort staffli. ---
  easel: {
    baseY: (isPhone) => (isPhone ? 1 : 1.7),
    border: 0.45, // Bred guldram.
    signGap: 0.2,
    build({ group, panel, width, height, border, baseY }) {
      const frameWidth = width + border * 2;
      const frameHeight = height + border * 2;
      box(panel, goldMaterial, frameWidth, frameHeight, 0.3, 0, height / 2 + border, -0.18);       // Guldramen.
      box(panel, frameMaterial, width + 0.16, height + 0.16, 0.34, 0, height / 2 + border, -0.18); // Mörk innerkant.
      // Hörnornament: små guldklossar som sticker ut i ramens hörn.
      for (const x of [-1, 1]) {
        for (const y of [0, 1]) box(panel, goldMaterial, 0.7, 0.7, 0.4, x * (frameWidth / 2 - 0.2), 0.2 + y * (frameHeight - 0.4), -0.15);
      }
      box(panel, postMaterial, frameWidth + 0.6, 0.18, 0.6, 0, -0.1, 0.1); // Hyllan tavlan står på.
      // Staffliet: två ben fram som lutar som tavlan och står BAKOM den (tavlan vilar mot
      // dem), och ett ben bak som går från toppen snett bakåt ner till marken.
      const legLength = baseY + frameHeight + 1.6;
      const LEG_Z = -0.5; // Benens fot: en bit bakom tavlans framsida.
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, legLength, 0.25), postMaterial);
        leg.rotation.x = -SCREEN_TILT; // Lutar bakåt, precis som tavlan.
        leg.position.set(side * (frameWidth / 2 - 0.4), (legLength / 2) * Math.cos(SCREEN_TILT), LEG_Z - (legLength / 2) * Math.sin(SCREEN_TILT));
        group.add(leg);
      }
      // Bakbenet: från frambenens topp och 3 enheter bakåt ner till marken.
      const topY = legLength * Math.cos(SCREEN_TILT);
      const topZ = LEG_Z - legLength * Math.sin(SCREEN_TILT);
      const BACK_SPREAD = 3;
      const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, Math.hypot(topY, BACK_SPREAD), 0.25), postMaterial);
      backLeg.rotation.x = Math.atan2(BACK_SPREAD, topY); // Toppen framåt, foten bakåt.
      backLeg.position.set(0, topY / 2, topZ - BACK_SPREAD / 2);
      group.add(backLeg);
    },
  },
};

export function buildBillboards(world) {
  const display = DISPLAYS[world.display || 'cinema'];
  for (const project of PROJECTS) {
    if (project.world !== world) continue;
    const group = new THREE.Group();
    const isPhone = project.phone === true;
    const width = isPhone ? PHONE_WIDTH : SCREEN_WIDTH;
    const height = isPhone ? PHONE_HEIGHT : SCREEN_HEIGHT;
    const border = display.border;
    const baseY = display.baseY(isPhone); // Skärmens underkant över marken.
    // Panelen = allt som lutar (ram, skärm, textskylt). Den lutar runt sin underkant som ett gångjärn.
    const panel = new THREE.Group();
    panel.position.y = baseY;
    panel.rotation.x = -SCREEN_TILT;
    group.add(panel);
    display.build({ group, panel, width, height, border, baseY, isPhone });

    // Skärmens canvas, med play-symbolen från början. Mobilen får en stående canvas.
    const screenImage = document.createElement('canvas');
    screenImage.width = isPhone ? SCREEN_PIXELS_SHORT : SCREEN_PIXELS_LONG;
    screenImage.height = isPhone ? SCREEN_PIXELS_LONG : SCREEN_PIXELS_SHORT;
    const brush = screenImage.getContext('2d');
    drawPlaceholder(brush);
    const texture = new THREE.CanvasTexture(screenImage);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Inga mipmaps (förminskade kopior): de skulle räknas om varje gång bilden ändras.
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    // MeshBasicMaterial = alltid full ljusstyrka, som en riktig skärm. Grå = nedtonad (avstängd).
    const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, color: '#777777' });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial);
    screen.position.set(0, height / 2 + border, 0);
    panel.add(screen);

    // Textskylt ovanför skärmen. Över mobilen är den lite smalare.
    const signWidth = isPhone ? 6 : SCREEN_WIDTH;
    const signHeight = SIGN_HEIGHT * (signWidth / SCREEN_WIDTH);
    const titleTexture = makeTitleTexture(project.title);
    const titleTextureActive = makeTitleTexture(project.title, true);
    const signMaterial = new THREE.MeshBasicMaterial({ map: titleTexture });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), signMaterial);
    sign.position.set(0, height + border * 2 + 0.2 + display.signGap + signHeight / 2, 0);
    panel.add(sign);

    const padMaterial = addParkingBay(group, PAD_DISTANCE);
    group.position.set(project.x, 0, project.z);
    group.rotation.y = BILLBOARD_FACING;
    worldGroup(world).add(group);

    const padSpot = towardCamera(project, PAD_DISTANCE); // Fickans mitt i världen.
    billboards.push({
      project, brush, texture, screenMaterial, padMaterial, signMaterial, titleTexture, titleTextureActive,
      width, height,  // Skärmens mått, för videons beskärning.
      padX: padSpot.x,
      padZ: padSpot.z,
      player: null,   // Finns bara medan bilen står i fickan.
      active: false,  // Står bilen i fickan just nu?
    });
  }
}

// ---------------------------------------------------------------------------
// SKÄRMENS SKEN – en ljuspöl på marken framför skärmen som är igång.
// ---------------------------------------------------------------------------
// Ingen riktig lampa (de kostar för varje pixel på skärmen), utan en genomskinlig
// fläck som "lägger till" ljus. Färgen följer det som visas på skärmen.
const SCREEN_GLOW_STRENGTH = 1.6; // ÄNDRA för starkare/svagare sken.
const screenGlowGeometry = new THREE.PlaneGeometry(10, 9);
screenGlowGeometry.rotateX(-Math.PI / 2);
export const screenGlow = new THREE.Mesh(screenGlowGeometry, makeGlowMaterial(0.8));
screenGlow.visible = false;
scene.add(screenGlow); // Direkt i scenen (inte i en värld): den flyttas mellan världarna.
let screenGlowAmount = 0;
const screenGlowColor = new THREE.Color(PALETTE.screenGlow);
let glowingBillboard = null;
// "Skärmens färg": hela bilden ritas ihoptryckt till en enda pixel = medelfärgen.
const glowSampler = document.createElement('canvas');
glowSampler.width = 1;
glowSampler.height = 1;
const glowSamplerPen = glowSampler.getContext('2d', { willReadFrequently: true });
const glowTargetColor = new THREE.Color(PALETTE.screenGlow);
const GLOW_SAMPLE_TIME = 0.3; // Sekunder mellan avläsningarna (varje avläsning kostar lite).
let glowSampleWait = 0;
let glowJustStarted = false;

function updateScreenGlow(delta) {
  if (!glowingBillboard) return;
  glowSampleWait -= delta;
  if (glowSampleWait <= 0 && glowingBillboard.player) {
    glowSampleWait = GLOW_SAMPLE_TIME;
    note('screen colour sample');
    glowSamplerPen.drawImage(glowingBillboard.player.sample(), 0, 0, 1, 1);
    const [red, green, blue] = glowSamplerPen.getImageData(0, 0, 1, 1).data;
    glowTargetColor.setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
    if (glowJustStarted) {
      screenGlowColor.copy(glowTargetColor); // Första gången: hoppa direkt till rätt färg.
      glowJustStarted = false;
    }
  }
  screenGlowAmount = THREE.MathUtils.damp(screenGlowAmount, 1, 4, delta); // Tona in mjukt.
  screenGlowColor.lerp(glowTargetColor, 0.08); // Glid mjukt mot den nya färgen.
  screenGlow.material.color.copy(screenGlowColor).multiplyScalar(screenGlowAmount * SCREEN_GLOW_STRENGTH);
}

// Körs en gång per bild: kollar vilken ficka bilen står i och sköter skärmarna.
// carPosition = bilens plats. Bara skyltarna i världen bilen är i kollas.
export function updateBillboards(delta, carPosition) {
  for (const billboard of billboards) {
    if (billboard.project.world !== currentWorld && !billboard.active) continue;
    const near = billboard.project.world === currentWorld
      && Math.hypot(carPosition.x - billboard.padX, carPosition.z - billboard.padZ) < PAD_RADIUS;

    // Bara när läget ÄNDRAS (bilen kör in eller ut) behöver något göras.
    if (near !== billboard.active) {
      billboard.active = near;
      billboard.screenMaterial.color.set(near ? '#ffffff' : '#777777');
      lightPad(billboard.padMaterial, near);
      billboard.signMaterial.map = near ? billboard.titleTextureActive : billboard.titleTexture;
      setParkedAt(near ? billboard.project : null);

      if (near) {
        // Skenet: lägg ljuspölen på marken mellan skärmen och fickan.
        glowingBillboard = billboard;
        const spot = towardCamera(billboard.project, PAD_DISTANCE * 0.7);
        screenGlow.position.set(spot.x, 0.1, spot.z);
        screenGlow.rotation.y = BILLBOARD_FACING;
        screenGlow.visible = true;
        screenGlowAmount = 0;
        screenGlow.material.color.setRGB(0, 0, 0);
        glowSampleWait = 0;
        glowJustStarted = true;
        // Skapa en spelare. Filen laddas alltså först nu, när den behövs.
        if (billboard.project.media) {
          note('clip starts loading');
          billboard.player = makePlayer(billboard);
          billboard.player.play();
        }
      } else {
        if (glowingBillboard === billboard) {
          glowingBillboard = null;
          screenGlow.visible = false;
        }
        if (billboard.player) {
          // Bilen körde ut: stoppa, kasta spelaren och visa play-symbolen igen.
          billboard.player.stop();
          billboard.player = null;
          drawPlaceholder(billboard.brush);
          billboard.texture.needsUpdate = true;
        }
      }
    }
    if (billboard.active && billboard.player) billboard.player.update(delta);
  }
  updateScreenGlow(delta);
}
