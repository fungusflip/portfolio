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
import { setParkedAt, leaveParking } from './ui.js';
import { PROJECTS } from './projects.js'; // Projektlistan (ÄNDRA projekten där).
import { makeGravelImage } from './gravel.js';
import { makeBulbs, rectanglePoints, makeSearchlight, makePadGlow, burstAt } from './magic.js';
import { markMoving } from './optimize.js';

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
// Snurran visas minst så här länge innan klippet får ta över, även om det är klart snabbare.
// Annars hinner man knappt se den - en blink i stället för en tydlig övergång.
const MIN_LOADING_MS = 450;

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

// Det som visas när skärmen är avstängd: en stillbild ur projektet (affischen), precis som
// den är. Innan affischen har laddats (eller om den saknas): en play-symbol.
// Affischerna ligger i assets/posters och är en bild ur varje klipp.
function drawPlaceholder(brush, poster) {
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  const cx = width / 2; // Mitten, så att symbolen hamnar rätt oavsett skärmens form.
  const cy = height / 2;
  if (hasPoster(poster)) {
    drawPosterFill(brush, poster, width, height);
  } else {
    brush.fillStyle = PALETTE.glass;
    brush.fillRect(0, 0, width, height);
    drawPlayTriangle(brush, cx, cy, 1);
  }
}
// Är affischen klar att ritas?
function hasPoster(poster) {
  return !!(poster && poster.complete && poster.naturalWidth > 0);
}
// Ritar affischen "fyll skärmen": skalar så att bilden täcker allt och beskär kanterna.
function drawPosterFill(brush, poster, width, height) {
  const scale = Math.max(width / poster.naturalWidth, height / poster.naturalHeight);
  const drawWidth = poster.naturalWidth * scale;
  const drawHeight = poster.naturalHeight * scale;
  brush.drawImage(poster, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}
// Play-symbolen: en triangel runt (cx, cy). size 1 = full storlek.
function drawPlayTriangle(brush, cx, cy, size) {
  brush.fillStyle = PALETTE.speckle;
  brush.beginPath();
  brush.moveTo(cx - 50 * size, cy - 80 * size);
  brush.lineTo(cx - 50 * size, cy + 80 * size);
  brush.lineTo(cx + 80 * size, cy);
  brush.fill();
}

// Var affischen till ett projekt ligger: samma namn som klippet, fast .jpg i assets/posters.
function posterPath(media) {
  const name = media.split('/').pop().replace(/\.[^.]+$/, ''); // "assets/videos/x.mp4" → "x"
  return `assets/posters/${name}.jpg`;
}

// Laddningssnurran: en båge som snurrar runt mitten, lite mer vriden varje bild.
// Affischen ligger kvar under snurran (med en mörk slöja) i stället för att försvinna till
// en tom ruta - annars hinner man bara se en blink innan klippet tar över.
function drawLoading(billboard) {
  const brush = billboard.brush;
  const width = brush.canvas.width;
  const height = brush.canvas.height;
  if (hasPoster(billboard.poster)) {
    drawPosterFill(brush, billboard.poster, width, height);
    brush.fillStyle = 'rgba(10, 8, 6, 0.55)';
    brush.fillRect(0, 0, width, height);
  } else {
    brush.fillStyle = PALETTE.glass;
    brush.fillRect(0, 0, width, height);
  }
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
// i minnet åt gången. sample() ger en bild att läsa skärmens färg från (se sken nedan), och
// ready() säger om klippet har börjat synas (innan dess visas laddningssnurran).

// Video: varje bild ritas på samma 2D-canvas som affischen/gif:en använder, och skickas
// därifrån till grafikkortet (samma väg som är bevisat färgriktig för de andra typerna).
// (Ett tag gick videon direkt till grafikkortet som en VideoTexture - snabbare, men
// webbläsarens egen färghantering av <video>-element gjorde bilden för ljus där.)
function drawVideoFrame(billboard, video) {
  const brush = billboard.brush;
  const screenWidth = brush.canvas.width;
  const screenHeight = brush.canvas.height;
  const screenAspect = screenWidth / screenHeight;
  const videoAspect = video.videoWidth / video.videoHeight;
  // "Fyll skärmen": beskär videons kortaste kant så att den täcker hela ytan utan att töjas.
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (videoAspect > screenAspect) {
    sw = video.videoHeight * screenAspect; // Videon är bredare: beskär sidorna.
    sx = (video.videoWidth - sw) / 2;
  } else {
    sh = video.videoWidth / screenAspect;  // Videon är högre: beskär upptill/nedtill.
    sy = (video.videoHeight - sh) / 2;
  }
  brush.drawImage(video, sx, sy, sw, sh, 0, 0, screenWidth, screenHeight);
  billboard.texture.needsUpdate = true;
}
function makeVideoPlayer(billboard) {
  const video = document.createElement('video');
  video.src = billboard.project.media;
  video.loop = true;        // Börja om när den tar slut.
  video.muted = true;       // Webbläsare tillåter bara automatisk start om ljudet är av.
  video.playsInline = true; // Hindrar mobiler från att öppna videon i helskärm.
  let started = false;      // true när första bilden har ritats.
  const createdAt = performance.now();
  return {
    play() { video.play().catch(() => {}); }, // play() kan nekas; .catch gör att det inte blir ett fel.
    stop() {
      video.pause();
      // Ta bort filen och be elementet ladda om (utan fil) = släpp videon ur minnet.
      video.removeAttribute('src');
      video.load();
      started = false;
    },
    update() {
      // Innan första bilden finns (currentTime 0), eller innan snurran hunnit synas en stund: visa den.
      if (video.currentTime <= 0 || !video.videoWidth || performance.now() - createdAt < MIN_LOADING_MS) {
        drawLoading(billboard);
        return;
      }
      if (!started) note('video starts');
      started = true;
      drawVideoFrame(billboard, video);
    },
    sample() { return billboard.brush.canvas; },
    ready() { return started; },
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
  const createdAt = performance.now();
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
      // Vänta med den FÖRSTA bilden tills snurran hunnit synas en stund. Bilderna därefter
      // ska fortsätta i sin egen takt, så gränsen gäller bara innan något alls visats (index -1).
      if (frames.length === 0 || (index < 0 && performance.now() - createdAt < MIN_LOADING_MS)) {
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
    ready() { return index >= 0; }, // Första gif-bilden är ritad.
  };
}

// Stillbild: laddas och ritas en enda gång.
function makeImagePlayer(billboard) {
  const image = new Image();
  let loaded = false;
  let shown = false;
  const createdAt = performance.now();
  image.onload = () => { loaded = true; };
  image.src = billboard.project.media;
  return {
    play() {},
    update() {
      if (!loaded || performance.now() - createdAt < MIN_LOADING_MS) {
        drawLoading(billboard);
        return;
      }
      if (!shown) {
        shown = true;
        drawOnScreen(billboard, image, image.width, image.height);
      }
    },
    stop() {
      image.onload = null;
      image.src = '';
    },
    sample() { return billboard.brush.canvas; },
    ready() { return shown; },
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
  brush.font = 'bold 96px system-ui, sans-serif';
  brush.textAlign = 'center';
  brush.textBaseline = 'middle';
  brush.lineJoin = 'round';
  // Fickan är samma ljusa grus som vägen: mörkt varmbrunt (tänd: orange) med en krämfärgad kontur, så att orden syns.
  brush.lineWidth = 14;
  brush.strokeStyle = 'rgba(255, 243, 214, 0.9)';
  brush.strokeText('ENTER', 256, 134);
  brush.fillStyle = lit ? PALETTE.signGlow : '#4a3224';
  brush.fillText('ENTER', 256, 134);
  const texture = new THREE.CanvasTexture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISOTROPY;
  return texture;
}
export const padTexture = makePadTexture(false);
export const padTextureActive = makePadTexture(true);

// Parkeringsfickan: samma grus som vägen (samma bild, se gravel.js), så att fickan och uppfarten flyter ihop utan
// färgsteg, brus eller kant mot vägen. Ytterkanten blandas mot marken (inte mot vägen): ett SKÖRT av grus
// i mjuka, oregelbundna fläckar som tonar över i gräsets färg och glesnar utåt. Det läses som en mjuk
// övergång, men är ändå ogenomskinligt (alphaTest), så att det inte ritas över bilen.
export const BAY_WIDTH = 5.4; // Samma som en väg inklusive kantlinjer.
export const BAY_LENGTH = 6.5;
export const BAY_SKIRT = 0.9;          // Hur långt skörtet når utanför fickan (inte mot vägen), i enheter.
const BAY_PIXELS_PER_UNIT = 64;        // Samma skala som vägens grus (256 bildpunkter = 4 enheter), så att stenarna är lika stora.
const SKIRT_PX = Math.round(BAY_SKIRT * BAY_PIXELS_PER_UNIT);
const bayW = Math.round(BAY_WIDTH * BAY_PIXELS_PER_UNIT);
const bayH = Math.round(BAY_LENGTH * BAY_PIXELS_PER_UNIT);
const bayImage = document.createElement('canvas');
bayImage.width = bayW + SKIRT_PX * 2;
bayImage.height = bayH + SKIRT_PX; // Skört på sidorna och bakom, inte mot vägen.
const bayPen = bayImage.getContext('2d');
// I bilden är y = 0 änden mot skylten och y = bayH + SKIRT_PX änden mot vägen.
// 1. Underlaget: vägens grus, kakelplatta vid kakelplatta.
bayPen.fillStyle = bayPen.createPattern(makeGravelImage(256), 'repeat');
bayPen.fillRect(0, 0, bayImage.width, bayImage.height);
// 2. Målade linjer, öppna mot vägen: tunna och mjuka, så att de inte blir brus på gruset.
bayPen.save();
bayPen.translate(SKIRT_PX, SKIRT_PX); // Fickan ritas innanför skörtet.
bayPen.strokeStyle = 'rgba(255, 243, 214, 0.45)';
bayPen.lineWidth = 4;
bayPen.lineCap = 'round';
bayPen.lineJoin = 'round';
bayPen.beginPath();
bayPen.moveTo(26, bayH * 0.72);
bayPen.lineTo(26, 26);
bayPen.lineTo(bayW - 26, 26);
bayPen.lineTo(bayW - 26, bayH * 0.72);
bayPen.stroke();
bayPen.restore();
// 3. Kanten: bildpunkt för bildpunkt. d = avstånd (i bildpunkter) utanför fickans rundade rektangel
// (minus = innanför). Rektangeln är öppen mot vägen (sträcker sig långt nedåt), så där blir ingen kant.
{
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const groundMix = hexToRgb(PALETTE.ground);
  const corner = 64;                  // Rundade hörn bort från vägen (1 enhet).
  const reach = bayH + 2000;          // "Öppen mot vägen".
  // Mjukt värdebrus (fläckar ~10 bildpunkter): bilinjärt över ett slumpat rutnät.
  const CELL = 10;
  const gridW = Math.ceil(bayImage.width / CELL) + 2;
  const grid = Array.from({ length: gridW * (Math.ceil(bayImage.height / CELL) + 2) }, () => Math.random());
  const blob = (x, y) => {
    const gx = x / CELL;
    const gy = y / CELL;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => grid[(y0 + b) * gridW + x0 + a];
    return (g(0, 0) * (1 - sx) + g(1, 0) * sx) * (1 - sy) + (g(0, 1) * (1 - sx) + g(1, 1) * sx) * sy;
  };
  const image = bayPen.getImageData(0, 0, bayImage.width, bayImage.height);
  const data = image.data;
  for (let y = 0; y < bayImage.height; y++) {
    for (let x = 0; x < bayImage.width; x++) {
      const ix = x - SKIRT_PX + 0.5;
      const iy = y - SKIRT_PX + 0.5;
      const qx = Math.abs(ix - bayW / 2) - (bayW / 2 - corner);
      const qy = Math.abs(iy - reach / 2) - (reach / 2 - corner);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
      const i = (y * bayImage.width + x) * 4;
      if (d <= 0) {
        data[i + 3] = 255; // Innanför: ren väggrus.
      } else if (d < SKIRT_PX) {
        // Skörtet: fläckar av grus som glesnar utåt, mest vid hörnen mot vägen. Färgen tonas mot gräset.
        const reachK = d / SKIRT_PX;
        const mouth = Math.max(0, (y - SKIRT_PX - bayH * 0.7) / (bayH * 0.3)); // 0 -> 1 mot infarten.
        const n = blob(x, y);
        if (1 - reachK + (n - 0.5) * 0.9 + mouth * 0.35 > 0.55) {
          const t = Math.min(1, Math.max(0, reachK * 0.75 + (n - 0.5) * 0.3));
          for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - t) + groundMix[c] * t;
          data[i + 3] = 255;
        } else {
          data[i + 3] = 0;
        }
      } else {
        data[i + 3] = 0;
      }
    }
  }
  bayPen.putImageData(image, 0, 0);
}
const bayTexture = new THREE.CanvasTexture(bayImage);
bayTexture.colorSpace = THREE.SRGBColorSpace;
bayTexture.anisotropy = MAX_ANISOTROPY;
// depthTest/depthWrite: false = ett "lager på marken" (se renderOrder i hub.js).
// alphaTest (inte transparent): ett genomskinligt lager ritas efter bilen och hamnar över den.
const bayMaterial = new THREE.MeshLambertMaterial({ map: bayTexture, depthTest: false, depthWrite: false, alphaTest: 0.5, alphaToCoverage: true });

// Ger en ny parkeringsficka med ENTER-text, liggande på marken z enheter framför
// gruppens mitt. Returnerar ENTER-textens material, så att den kan tändas.
// Glödande pollare vid fickans infart: en mörk stolpe med en lysande topp.
const bollardGeometry = new THREE.BoxGeometry(0.28, 0.8, 0.28);
const bollardTopGeometry = new THREE.BoxGeometry(0.34, 0.22, 0.34);

export function addParkingBay(group, z, color = PALETTE.bulbs) {
  // Planet är större än fickan: skörtet ligger på sidorna och bakom (inte mot vägen), så mitten flyttas bakåt.
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(BAY_WIDTH + BAY_SKIRT * 2, BAY_LENGTH + BAY_SKIRT), bayMaterial);
  bay.rotation.x = -Math.PI / 2; // Lägg planet ner på marken.
  bay.position.set(0, 0.035, z - BAY_SKIRT / 2); // Över grusvägarna, under ENTER-texten.
  bay.renderOrder = -5;          // Ritas efter mark och grus, före allt som står på marken.
  group.add(bay);
  // opacity: 0.85 = nästan full styrka redan innan bilen är där, så att ENTER syns.
  const padMaterial = new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, opacity: 0.85 });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), padMaterial);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.05, z); // 0.05 upp, annars flimrar den mot asfalten.
  group.add(pad);
  // En mjuk, lugn glöd innanför fickans kant (se magic.js). Starkare ju närmare bilen kommer.
  const padGlow = makePadGlow(BAY_WIDTH, BAY_LENGTH, color);
  padGlow.mesh.position.set(0, 0.06, z);
  group.add(padGlow.mesh);
  padMaterial.userData.near = padGlow.near; // Så att updateBillboards/updateHome kan nå den.
  // Två pollare vid infarten (mot vägen), med ett litet sken på marken runt foten.
  for (const side of [-1, 1]) {
    const x = side * (BAY_WIDTH / 2 + 0.35);
    const zEnd = z + BAY_LENGTH / 2 - 0.4;
    const post = new THREE.Mesh(bollardGeometry, frameMaterial);
    post.position.set(x, 0.4, zEnd);
    group.add(post);
    const top = new THREE.Mesh(bollardTopGeometry, bollardGlow(color));
    top.position.set(x, 0.9, zEnd);
    group.add(top);
    const shine = new THREE.Mesh(bollardShineGeometry, bollardShine(color));
    shine.position.set(x, 0.08, zEnd);
    group.add(shine);
  }
  return padMaterial;
}
const bollardShineGeometry = new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2);
const bollardGlows = {};
function bollardGlow(color) {
  if (!bollardGlows[color]) bollardGlows[color] = new THREE.MeshBasicMaterial({ color });
  return bollardGlows[color];
}
const bollardShines = {};
function bollardShine(color) {
  if (!bollardShines[color]) {
    bollardShines[color] = makeGlowMaterial(0.7);
    bollardShines[color].color.set(color).multiplyScalar(0.6);
  }
  return bollardShines[color];
}
// Tänder eller släcker en ENTER-text.
export function lightPad(padMaterial, lit) {
  padMaterial.opacity = lit ? 1 : 0.85;
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
//   signZ          – (valfri) hur långt fram titelskylten flyttas, i panelens z. Standard 0.
//   build(parts)   – bygger huset. parts = { group, panel, width, height, border, baseY, isPhone }.
//     group = hela skylten (står på marken, +z mot kameran).
//     panel = det som lutar bakåt med skärmen (y = uppåt längs skärmen, z = ut ur skärmen).
// Material som bara skyltarna använder:
// Vitt lackerat stål: stolpar och ram på skyltarna hemma (drive-in-bio).
const whiteMetal = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.4, metalness: 0.1 });
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

const SIGN_Z = 1.5; // Arkadens titelskylt flyttas så här långt fram (panel-z), framför bakväggen.

const DISPLAYS = {
  // --- Hemma: drive-in-bio. En duk på två stolpar (mobilen står direkt på marken). ---
  cinema: {
    baseY: (isPhone) => (isPhone ? 0.1 : POST_HEIGHT),
    border: 0.14,
    signGap: 0,
    build({ group, panel, width, height, border, isPhone }) {
      if (!isPhone) {
        // Två slanka vita stålstolpar, närmare mitten (förut svarta/bruna och längst ut), med en fotplatta.
        for (const x of [-2.3, 2.3]) {
          box(group, whiteMetal, 0.2, POST_HEIGHT, 0.2, x, POST_HEIGHT / 2, -0.16);
          box(group, whiteMetal, 0.7, 0.08, 0.7, x, 0.04, -0.16);
        }
      }
      box(panel, whiteMetal, width + border * 2, height + border * 2, 0.22, 0, height / 2 + border, -0.12);
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
    // Panelen lutar bakåt, så skylten vid z = 0 hamnade bakom maskinens bakvägg och göms. Flytta fram den.
    signZ: SIGN_Z,
    build({ group, panel, width, height, border, baseY }) {
      const outerWidth = width + border * 2;
      const lean = Math.sin(SCREEN_TILT) * (height + border * 2);       // Hur långt bakåt skärmens överkant lutar.
      const topY = baseY + Math.cos(SCREEN_TILT) * (height + border * 2) + 2.3; // Maskinens höjd, inklusive titeln.
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
      // Neonlister över och under titeln (skylten sitter 5.35–6.45 över panelens underkant, se buildBillboards).
      const marqueeBottom = height + border * 2 + 0.2 + 0.15;
      for (const y of [marqueeBottom - 0.05, marqueeBottom + SIGN_HEIGHT + 0.05]) {
        box(panel, glow(PALETTE.progTrace), outerWidth - 0.4, 0.06, 0.06, 0, y, SIGN_Z);
      }
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

const stageLightGeometry = new THREE.PlaneGeometry(11, 7).rotateX(-Math.PI / 2);
// När bilen parkerar växer skärmen (med ram, lampor och titel) till så här många gånger
// sin storlek, med en liten studs. ÄNDRA för större/mindre.
const POP_SCALE = 1.3;
// Fjädern som gör studsen: STIFFNESS = hur hårt den drar mot målet, DAMPING = hur fort
// gungningen dör ut. Mindre DAMPING = mer studs.
const POP_STIFFNESS = 140;
const POP_DAMPING = 11;
// Skylten bilen står vid, eller null. Kameran i main.js lutar sig mot den.
let focusedBillboard = null;
export function getFocus() {
  return focusedBillboard ? focusedBillboard.project : null;
}
const screenColor = new THREE.Color();
const WHITE = new THREE.Color('#ffffff');
const tintHSL = {}; // Återanvänds varje bild.

// En slank LED-list runt skärmen (hemma, som en modern drive-in-duk) i stället för glödlampor. Samma
// gränssnitt som makeBulbs (active, tint), plus update(time) som färgar listen: kallvit när ingen tittar,
// i skärmens färg medan bilen står i fickan.
function makeLedFrame(width, height, border, color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const outerWidth = width + border * 2;
  const outerHeight = height + border * 2;
  const inset = border / 2; // Listen ligger mitt i ramen.
  const thickness = 0.05;
  const add = (w, h, x, y) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), material);
    bar.position.set(x, y, 0.02);
    bar.userData.noShadow = true;
    group.add(bar);
  };
  add(outerWidth - inset, thickness, 0, inset);                                // Nederkant.
  add(outerWidth - inset, thickness, 0, outerHeight - inset);                  // Överkant.
  add(thickness, outerHeight - inset, -(outerWidth / 2 - inset), outerHeight / 2); // Vänster.
  add(thickness, outerHeight - inset, outerWidth / 2 - inset, outerHeight / 2);    // Höger.
  const active = { value: 0 };
  const tint = { value: new THREE.Color(color) };
  const idle = new THREE.Color('#e6f0ff');
  const lit = new THREE.Color();
  markMoving(group); // Färgen ändras hela tiden: får inte slås ihop eller frysas.
  return {
    mesh: group,
    active,
    tint,
    update(time) {
      lit.copy(idle).lerp(tint.value, 0.85 * active.value);
      lit.multiplyScalar(0.8 + 0.1 * Math.sin(time * 1.1) + 0.35 * active.value);
      material.color.copy(lit);
    },
  };
}

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
    // Hela visningen (skärm, ram, stativ/ben/gavlar, skylt, lampor) ligger i `display`, som växer när bilen
    // parkerar. Den skalas runt gruppens mittpunkt på marken (y = 0), så att fötterna stannar kvar i marken.
    // Parkeringsfickan, pollarna, strålkastaren och ENTER-texten ligger direkt i `group` och skalas inte.
    const display3d = new THREE.Group();
    group.add(display3d);
    markMoving(display3d); // Växer (se POP_SCALE): varken sammanslagen eller fryst, och inte heller något i den.
    const panel = new THREE.Group();
    panel.position.y = baseY;
    panel.rotation.x = -SCREEN_TILT;
    display3d.add(panel);
    markMoving(panel);
    display.build({ group: display3d, panel, width, height, border, baseY, isPhone });

    // Skärmens canvas, med play-symbolen från början. Mobilen får en stående canvas.
    const screenImage = document.createElement('canvas');
    screenImage.width = isPhone ? SCREEN_PIXELS_SHORT : SCREEN_PIXELS_LONG;
    screenImage.height = isPhone ? SCREEN_PIXELS_LONG : SCREEN_PIXELS_SHORT;
    const brush = screenImage.getContext('2d');
    drawPlaceholder(brush);
    const poster = new Image(); // Laddas klart nedan; då ritas skärmen om.
    const texture = new THREE.CanvasTexture(screenImage);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Inga mipmaps (förminskade kopior): de skulle räknas om varje gång bilden ändras.
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    // MeshBasicMaterial = alltid full ljusstyrka, som en riktig skärm: bilden visas precis som den är.
    const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, fog: false }); // fog: false = ingen dimma.
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial);
    screen.position.set(0, height / 2 + border, 0);
    panel.add(screen);

    // Textskylt ovanför skärmen. Över mobilen är den lite smalare.
    const signWidth = isPhone ? 6 : SCREEN_WIDTH;
    const signHeight = SIGN_HEIGHT * (signWidth / SCREEN_WIDTH);
    const titleTexture = makeTitleTexture(project.title);
    const titleTextureActive = makeTitleTexture(project.title, true);
    const signMaterial = new THREE.MeshBasicMaterial({ map: titleTexture, fog: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(signWidth, signHeight), signMaterial);
    sign.position.set(0, height + border * 2 + 0.2 + display.signGap + signHeight / 2, display.signZ || 0);
    panel.add(sign);
    markMoving(sign); // Skylten gungar lite (se updateBillboards).

    // Ljusslingan runt ramen: varma glödlampor hemma, världens färg i de andra världarna.
    const bulbs = world === WORLDS.hub
      ? makeLedFrame(width, height, border, PALETTE.bulbs) // Hemma: en modern LED-list.
      : makeBulbs(
        rectanglePoints(width / 2 + border + 0.18, -0.12, height + border * 2 + display.signGap + 0.12, 0.06, 0.5),
        world.accent
      );
    panel.add(bulbs.mesh);

    // Skenet runt skärmen: ett mjukt ljus bakom ramen, i affischens medelfärg (sätts när
    // affischen laddats). Gör att skärmen ser ut att lysa ut i kvällen.
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(width + 5, height + 4), makeGlowMaterial(0.9));
    halo.position.set(0, height / 2 + border, -0.4);
    halo.material.color.set(world === WORLDS.hub ? PALETTE.bulbs : world.accent).multiplyScalar(0.4);
    halo.userData.noShadow = true;
    markMoving(halo);
    panel.add(halo);

    // Strålkastaren bakom skylten, och en ljuspöl på marken under skärmen som alltid lyser.
    const searchlight = makeSearchlight(world === WORLDS.hub ? PALETTE.bulbs : world.accent, Math.random());
    searchlight.position.set((Math.random() < 0.5 ? -1 : 1) * width * 0.35, 0, -2);
    group.add(searchlight); // Skalas inte.
    const stageLight = new THREE.Mesh(stageLightGeometry, makeGlowMaterial(0.8));
    stageLight.position.set(0, 0.08, 2.4);
    stageLight.userData.noShadow = true;
    markMoving(stageLight); // Byter styrka med bilens avstånd.
    group.add(stageLight);

    const accent = world === WORLDS.hub ? PALETTE.bulbs : world.accent;
    const padMaterial = addParkingBay(group, PAD_DISTANCE, accent);
    group.position.set(project.x, 0, project.z);
    group.rotation.y = BILLBOARD_FACING;
    worldGroup(world).add(group);

    const padSpot = towardCamera(project, PAD_DISTANCE); // Fickans mitt i världen.
    billboards.push({
      project, brush, texture, screenMaterial, padMaterial, signMaterial, titleTexture, titleTextureActive,
      bulbs: bulbs.active, bulbTint: bulbs.tint, ledUpdate: bulbs.update || null, sign, signY: sign.position.y, swing: Math.random() * 10, // Rörelserna.
      halo, haloColor: halo.material.color.clone(),
      posterColor: new THREE.Color(world === WORLDS.hub ? PALETTE.bulbs : world.accent), // Byts mot affischens färg.
      panel, display: display3d, popScale: 1, popSpeed: 0, // Hur stor visningen är just nu, och hur fort den växer.
      stageLight, stageColor: new THREE.Color(world === WORLDS.hub ? PALETTE.bulbs : world.accent),
      poster,
      width, height,  // Skärmens mått, för videons beskärning.
      padX: padSpot.x,
      padZ: padSpot.z,
      player: null,   // Finns bara medan bilen står i fickan.
      active: false,  // Står bilen i fickan just nu?
    });
    // Affischen: när den laddats ritas skärmen om (om inte klippet redan spelar).
    const billboard = billboards[billboards.length - 1];
    if (project.media) {
      poster.onload = () => {
        // Skenets färg = affischens medelfärg: bilden ritas ihoptryckt till en enda pixel.
        glowSamplerPen.drawImage(poster, 0, 0, 1, 1);
        const [red, green, blue] = glowSamplerPen.getImageData(0, 0, 1, 1).data;
        billboard.haloColor.setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
        billboard.posterColor.copy(billboard.haloColor); // Affischens färg som den är (lamporna börjar i den).
        // Mer färg i skenet än i bilden: dra bort från grått och gör det ljusare.
        const hsl = {};
        billboard.haloColor.getHSL(hsl);
        billboard.haloColor.setHSL(hsl.h, Math.min(1, hsl.s * 1.8 + 0.2), 0.5);
        if (billboard.player) return;
        drawPlaceholder(brush, poster);
        texture.needsUpdate = true;
      };
      poster.src = posterPath(project.media);
    }
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
  // Läs bara av skärmen när klippet syns. Innan dess (laddningssnurran) behålls affischens färg.
  if (glowSampleWait <= 0 && glowingBillboard.player && glowingBillboard.player.ready()) {
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
      lightPad(billboard.padMaterial, near);
      billboard.signMaterial.map = near ? billboard.titleTextureActive : billboard.titleTexture;
      if (near) setParkedAt(billboard.project);
      else leaveParking(billboard.project);

      if (near) {
        focusedBillboard = billboard;
        // Smällen: gnistor och en ljusring från fickan, i skärmens färg.
        burstAt(billboard.padX, billboard.padZ, screenColor.copy(billboard.haloColor).lerp(WHITE, 0.3));
        // Skenet: lägg ljuspölen på marken mellan skärmen och fickan.
        glowingBillboard = billboard;
        const spot = towardCamera(billboard.project, PAD_DISTANCE * 0.7);
        screenGlow.position.set(spot.x, 0.1, spot.z);
        screenGlow.rotation.y = BILLBOARD_FACING;
        screenGlow.visible = true;
        screenGlowAmount = 0;
        screenGlow.material.color.setRGB(0, 0, 0);
        glowSampleWait = 0;
        // Börja i affischens färg (en bild ur samma klipp), så att skenet och lamporna har
        // rätt färg direkt, i stället för laddningssnurrans blågrå.
        screenGlowColor.copy(billboard.posterColor);
        glowTargetColor.copy(billboard.posterColor);
        glowJustStarted = false;
        // Skapa en spelare. Filen laddas alltså först nu, när den behövs.
        if (billboard.project.media) {
          note('clip starts loading');
          billboard.player = makePlayer(billboard);
          billboard.player.play();
        }
      } else {
        if (focusedBillboard === billboard) focusedBillboard = null;
        if (glowingBillboard === billboard) {
          glowingBillboard = null;
          screenGlow.visible = false;
        }
        if (billboard.player) {
          // Bilen körde ut: stoppa, kasta spelaren och visa play-symbolen igen.
          billboard.player.stop();
          billboard.player = null;
          drawPlaceholder(billboard.brush, billboard.poster);
          billboard.texture.needsUpdate = true;
        }
      }
    }
    if (billboard.active && billboard.player) billboard.player.update(delta);
    // Närhet: 1 när bilen står i fickan, 0 på 18 enheters avstånd. Skylten vaknar när man närmar sig.
    const distance = Math.hypot(carPosition.x - billboard.padX, carPosition.z - billboard.padZ);
    const closeness = 1 - THREE.MathUtils.smoothstep(distance, PAD_RADIUS, 18);
    billboard.padMaterial.userData.near.value = closeness;
    billboard.stageLight.material.color.copy(billboard.stageColor).multiplyScalar(0.35 + 0.45 * closeness);
    billboard.halo.material.color.copy(billboard.haloColor).multiplyScalar(0.45 + 0.4 * closeness + (billboard.active ? 0.2 : 0));
    // Studsen: en fjäder drar panelens storlek mot målet (större när bilen står i fickan).
    const popGoal = billboard.active ? POP_SCALE : 1;
    billboard.popSpeed += ((popGoal - billboard.popScale) * POP_STIFFNESS - billboard.popSpeed * POP_DAMPING) * delta;
    billboard.popScale += billboard.popSpeed * delta;
    billboard.display.scale.setScalar(billboard.popScale); // Hela visningen, inte bara panelen.
    // Lamporna: springer när ingen tittar, lyser lugnt när bilen står i fickan (se magic.js).
    billboard.bulbs.value = THREE.MathUtils.damp(billboard.bulbs.value, billboard.active ? 1 : 0, 3, delta);
    // Lamporna lyser i skärmens färg (samma utjämnade färg som skenet på marken).
    if (billboard === glowingBillboard) {
      // Skärmens färg, men klarare: mer mättad och lagom ljus, så att lamporna verkligen lyser i den.
      billboard.bulbTint.value.copy(screenGlowColor).getHSL(tintHSL);
      billboard.bulbTint.value.setHSL(tintHSL.h, Math.min(1, tintHSL.s * 1.6 + 0.2), THREE.MathUtils.clamp(tintHSL.l, 0.45, 0.65));
    }
    // Titelskylten gungar lätt, men står still medan man tittar (bulbs.value går mot 1).
    const time = performance.now() / 1000 + billboard.swing;
    if (billboard.ledUpdate) billboard.ledUpdate(time); // LED-listen (hemma).
    const sway = 1 - billboard.bulbs.value;
    billboard.sign.position.y = billboard.signY + Math.sin(time * 1.4) * 0.07 * sway;
    billboard.sign.rotation.z = Math.sin(time * 0.9) * 0.02 * sway;
  }
  updateScreenGlow(delta);
}
