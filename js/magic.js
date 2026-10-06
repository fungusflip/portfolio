// ============================================================================
// magic.js — rörelse i världen: gräs som vajar, eldflugor och träd som gungar.
// ============================================================================
// Allt här rör sig på GRAFIKKORTET, inte i JavaScript. Varje strå och varje eldfluga
// räknar själv ut var den ska vara, utifrån tiden, vinden och var bilen är. Datorn
// skickar bara upp tre värden per bild (tid, vind, bilens plats), hur många strån
// det än finns. Därför är det billigt, även på en svag dator.
//
// Gräset och eldflugorna finns bara i en låda runt bilen (som löven i leaves.js).
// När bilen kör vidare "hoppar" det som hamnar utanför lådan till andra sidan.
// Det sker i skuggningsprogrammet (shadern) med mod(), "rest vid division".
import * as THREE from 'three';
import { scene, renderer, PALETTE, WORLDS, BILLBOARD_FACING, currentWorld, worldGroup } from './core.js';
// Fickans mått (samma som i billboards.js): ramen i smällen ska bli exakt lika stor.
const BAY_HALF_WIDTH = 5.4 / 2;
const BAY_HALF_LENGTH = 6.5 / 2;
import { markMoving } from './optimize.js';

// Värden som delas av alla shaders här. { value: ... } är så three.js vill ha dem:
// ändrar vi .value så ser alla shaders som använder dem det nya värdet.
export const shared = {
  uTime: { value: 0 },                     // Sekunder sedan start.
  uCar: { value: new THREE.Vector3() },    // Bilens plats.
  uWind: { value: new THREE.Vector3() },   // Vindbyn just nu (x, z = fart, y = styrka 0..1).
  // Grundbrisens riktning: från vänster till höger på skärmen, som vindbyarna i leaves.js.
  uBreeze: { value: new THREE.Vector2(Math.sin(BILLBOARD_FACING + Math.PI / 2), Math.cos(BILLBOARD_FACING + Math.PI / 2)) },
};

// ---------------------------------------------------------------------------
// GRÄS
// ---------------------------------------------------------------------------
const GRASS_AREA = 34;     // Lådans halva bredd runt bilen. Lite större än det som syns.
export const GRASS_TUFTS = 7000; // Antal tuvor. ÄNDRA för tätare/glesare gräs.
const BLADES_PER_TUFT = 4;

// En tuva: några smala trianglar (strån) som står i en liten klunga.
function makeTuftGeometry() {
  const positions = [];
  const heights = []; // 0 = vid roten, 1 = i toppen. Shadern böjer bara toppen.
  for (let i = 0; i < BLADES_PER_TUFT; i++) {
    const angle = Math.random() * Math.PI * 2;         // Åt vilket håll strået är vänt.
    const spot = Math.random() * 0.35;                 // Hur långt från tuvans mitt.
    const x = Math.cos(angle * 1.7) * spot;
    const z = Math.sin(angle * 1.7) * spot;
    const height = 0.7 + Math.random() * 0.6;
    const width = 0.09 + Math.random() * 0.05;
    const sideX = Math.cos(angle) * width;
    const sideZ = Math.sin(angle) * width;
    const leanX = (Math.random() - 0.5) * 0.3;         // Lite snett, så att det inte ser kammat ut.
    const leanZ = (Math.random() - 0.5) * 0.3;
    positions.push(x - sideX, 0, z - sideZ, x + sideX, 0, z + sideZ, x + leanX, height, z + leanZ);
    heights.push(0, 0, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  // Alla strån får en normal rakt upp: då blir de lika ljusa som marken de står på.
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

// Bygger gräset för en värld. grassAmount(x, z) ska ge 0 (inget gräs, t.ex. på en väg)
// till 1 (fullt gräs). Svaret ritas in i en liten bild ("masken") som shadern läser av.
// area = { x, z, size }: den fyrkant på marken som masken täcker.
const fallbackGround = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
fallbackGround.needsUpdate = true;
export function makeGrass(world, grassAmount, area, grassBurn = () => 0) {
  // --- Masken: 256 x 256 pixlar över hela marken. Varje pixel = hur mycket gräs. ---
  const MASK_SIZE = 256;
  const maskData = new Uint8Array(MASK_SIZE * MASK_SIZE * 4);
  const cell = area.size / MASK_SIZE;
  for (let row = 0; row < MASK_SIZE; row++) {
    for (let column = 0; column < MASK_SIZE; column++) {
      const x = area.x - area.size / 2 + (column + 0.5) * cell;
      const z = area.z - area.size / 2 + (row + 0.5) * cell;
      const amount = Math.round(grassAmount(x, z) * 255);
      const i = (row * MASK_SIZE + column) * 4;
      // r = hur mycket gräs, g = hur bränt/torrt det är (0 = grönt, 1 = brunt).
      maskData[i] = amount;
      maskData[i + 1] = Math.round(grassBurn(x, z) * 255);
      maskData[i + 2] = 0;
      maskData[i + 3] = 255;
    }
  }
  const mask = new THREE.DataTexture(maskData, MASK_SIZE, MASK_SIZE);
  mask.magFilter = THREE.LinearFilter; // Mjuka övergångar mellan pixlarna.
  mask.minFilter = THREE.LinearFilter;
  mask.needsUpdate = true;

  // --- Tuvorna: en InstancedMesh, alltså EN form som ritas på 7000 platser i ett svep. ---
  const geometry = makeTuftGeometry();
  // Varje tuva får tre slumptal: x och z i lådan (0 till 2 * GRASS_AREA) och ett "frö" (0..1)
  // som bestämmer vridning, storlek och färg.
  const spots = new Float32Array(GRASS_TUFTS * 3);
  for (let i = 0; i < GRASS_TUFTS; i++) {
    spots[i * 3] = Math.random() * GRASS_AREA * 2;
    spots[i * 3 + 1] = Math.random() * GRASS_AREA * 2;
    spots[i * 3 + 2] = Math.random();
  }
  geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(spots, 3));

  // MeshLambertMaterial (billigt ljus, skuggor och dimma ingår), men med egna rader i
  // shadern. onBeforeCompile körs precis innan three.js bygger shadern: där byter vi ut
  // några av dess "#include"-rader mot våra egna.
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, {
      uMask: { value: mask },
      uMaskOrigin: { value: new THREE.Vector2(area.x - area.size / 2, area.z - area.size / 2) },
      uMaskSize: { value: area.size },
      uArea: { value: GRASS_AREA },
      // Markens bild: gräset tar färg från marken under sig, så att det läses som en del av terrängen.
      uGround: { value: area.groundMap || fallbackGround },
      uGroundParams: { value: new THREE.Vector3(area.x - area.size / 2, area.z + area.size / 2, area.groundUnits || 16) },
      uGroundMix: { value: area.groundMap ? 1 : 0 },
      // THREE.Color gör om färgen till den "linjära" form som shadern räknar med.
      uRoot: { value: new THREE.Color(PALETTE.grassRoot) },
      uTip: { value: new THREE.Color(PALETTE.grassTip) },
      uTipAutumn: { value: new THREE.Color(PALETTE.grassTipAutumn) },
      uShimmer: { value: new THREE.Color(PALETTE.grassShimmer) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aSpot;
        attribute float aHeight;
        uniform float uTime;
        uniform vec3 uCar;
        uniform vec3 uWind;
        uniform vec2 uBreeze;
        uniform sampler2D uMask;
        uniform vec2 uMaskOrigin;
        uniform float uMaskSize;
        uniform float uArea;
        varying float vHeight;
        varying float vWave;
        varying float vSeed;
        varying float vBurn;
        uniform sampler2D uGround;
        uniform vec3 uGroundParams;
        varying vec3 vGround;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // 1. Vrid tuvan efter sitt frö.
        float turn = aSpot.z * 6.2832;
        transformed.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * transformed.xz;
        // 2. Var i världen står tuvan? Lådan följer bilen; mod() flyttar den runt hörnet.
        vec2 spot = mod(aSpot.xy - uCar.xz + uArea, 2.0 * uArea) + uCar.xz - uArea;
        // 3. Hur stor ska den vara? Masken (0 på vägar) gånger en toning ut mot lådans kant.
        float edge = max(abs(spot.x - uCar.x), abs(spot.y - uCar.z));
        vec4 maskSample = texture2D(uMask, (spot - uMaskOrigin) / uMaskSize);
        float grow = maskSample.r;
        vBurn = maskSample.g;
        // Markens färg precis här (samma kakelbild och uppställning som marken i hub.js).
        vGround = texture2D(uGround, vec2((spot.x - uGroundParams.x) / uGroundParams.z, (uGroundParams.y - spot.y) / uGroundParams.z)).rgb;
        grow *= smoothstep(uArea, uArea - 6.0, edge) * (0.7 + 0.6 * fract(aSpot.z * 13.7));
        transformed *= grow;
        // 4. Vinden. En våg som rullar över fältet i brisens riktning, plus vindbyn.
        float wave = sin(uTime * 1.6 - dot(spot, uBreeze) * 0.35 + aSpot.z * 1.5);
        vec2 bend = uBreeze * (0.15 + 0.25 * wave) + uWind.xz * 0.2;
        // 5. Bilen trycker undan gräset den kör igenom.
        vec2 fromCar = spot - uCar.xz;
        float carDistance = max(length(fromCar), 0.01);
        bend += fromCar / carDistance * (1.0 - smoothstep(0.8, 2.6, carDistance)) * 0.9;
        // Bara toppen böjs (aHeight 1), roten står still (aHeight 0).
        transformed.xz += bend * aHeight * grow;
        transformed.y *= 1.0 - 0.3 * aHeight * min(length(bend), 1.0); // Böjt strå = lite lägre.
        transformed.xz += spot;
        vHeight = aHeight;
        vWave = wave;
        vSeed = aSpot.z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRoot;
        uniform vec3 uTip;
        uniform vec3 uTipAutumn;
        uniform vec3 uShimmer;
        varying float vHeight;
        varying float vWave;
        varying float vSeed;
        varying float vBurn;
        varying vec3 vGround;
        uniform float uGroundMix;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        // Mörkt vid roten, ljust i toppen. Var sjunde tuva har höstgula toppar.
        // Bara enstaka (var tjugonde) tuva har höstgula toppar, och då bara lite: gräset ska vara jämnt.
        vec3 tip = mix(uTip, uTipAutumn, 0.45 * step(0.95, fract(vSeed * 7.3)));
        // Bränt gräs vid vägarna: mörkbrunt vid roten, torrt halmgult i topparna.
        // Först mot markens färg (roten mest, toppen lite), sedan mot brunt där det är bränt.
        float groundMix = uGroundMix * (1.0 - 0.5 * vBurn);
        // Roten har EXAKT markens färg (så att gräset växer ut ur marken utan någon skarv); toppen
        // är bara lite färgad av marken. Det brända gräset vid vägarna är brunt mest i topparna.
        vec3 baseRoot = mix(uRoot, vGround, groundMix);
        tip = mix(tip, vGround * 1.25 + vec3(0.02), groundMix * 0.7);
        vec3 root = mix(baseRoot, vec3(0.30, 0.20, 0.10), vBurn * 0.35);
        tip = mix(tip, vec3(0.62, 0.47, 0.22), vBurn);
        vec4 diffuseColor = vec4(mix(root, tip, vHeight), 1.0);
        // Ett svagt skimmer i topparna när vågen passerar: lite magi.
        diffuseColor.rgb += uShimmer * vHeight * smoothstep(0.75, 1.0, vWave) * 0.15;`);
  };

  addSaturation(material, 1.2);
  const grass = new THREE.InstancedMesh(geometry, material, GRASS_TUFTS);
  // Alla kopior står på samma ställe (0, 0, 0): shadern flyttar dem. Därför vet three.js
  // inte var gräset är, och får inte hoppa över det för att det "verkar" vara utanför bild.
  grass.frustumCulled = false;
  grass.receiveShadow = true;
  grass.renderOrder = -1; // Ett lager på marken: kastar inga skuggor (se optimize.js).
  markMoving(grass);
  grassMeshes.push(grass);
  worldGroup(world).add(grass);
  return grass;
}
const grassMeshes = [];

// Färre tuvor (för perf.js när datorn inte orkar). 1 = alla, 0.5 = hälften.
export function setGrassDensity(share) {
  for (const grass of grassMeshes) grass.count = Math.round(GRASS_TUFTS * share);
}

// ---------------------------------------------------------------------------
// ELDFLUGOR
// ---------------------------------------------------------------------------
// Små lysande prickar som svävar, blinkar och viker undan för bilen. THREE.Points ritar
// en fyrkant per punkt, och shadern målar en mjuk glödande boll i den.
const FIREFLY_COUNT = 110;   // ÄNDRA för fler/färre.
const FIREFLY_AREA = 26;     // Lådans halva bredd runt bilen.
const fireflySeeds = new Float32Array(FIREFLY_COUNT * 4);
const fireflyColors = new Float32Array(FIREFLY_COUNT * 3);
const fireflyPalette = PALETTE.fireflies.map((hex) => new THREE.Color(hex));
for (let i = 0; i < FIREFLY_COUNT; i++) {
  fireflySeeds[i * 4] = Math.random() * FIREFLY_AREA * 2;  // x i lådan
  fireflySeeds[i * 4 + 1] = 0.4 + Math.random() * 3.2;     // höjd
  fireflySeeds[i * 4 + 2] = Math.random() * FIREFLY_AREA * 2; // z i lådan
  fireflySeeds[i * 4 + 3] = Math.random();                 // frö: rörelse och blinkrytm
  // Mest guld, ibland en kall turkos (första färgen är vanligast).
  const color = fireflyPalette[Math.random() < 0.75 ? 0 : 1 + Math.floor(Math.random() * (fireflyPalette.length - 1))];
  color.toArray(fireflyColors, i * 3);
}
const fireflyGeometry = new THREE.BufferGeometry();
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FIREFLY_COUNT * 3), 3)); // Krävs, men används inte.
fireflyGeometry.setAttribute('aSeed', new THREE.BufferAttribute(fireflySeeds, 4));
fireflyGeometry.setAttribute('aColor', new THREE.BufferAttribute(fireflyColors, 3));

const fireflyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    ...shared,
    uArea: { value: FIREFLY_AREA },
    uSize: { value: 480 },        // Hur stora de ser ut. ÄNDRA för större/mindre sken.
    uPixelRatio: { value: 1 },
  },
  vertexShader: `
    attribute vec4 aSeed;
    attribute vec3 aColor;
    uniform float uTime;
    uniform vec3 uCar;
    uniform vec3 uWind;
    uniform float uArea;
    uniform float uSize;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vGlow;
    void main() {
      float seed = aSeed.w * 6.2832;
      // Långsamma slingor åt alla håll, plus lite fladder.
      vec3 p = aSeed.xyz;
      p.x += sin(uTime * 0.35 + seed) * 2.0 + sin(uTime * 1.7 + seed * 3.0) * 0.25;
      p.z += cos(uTime * 0.3 + seed * 1.7) * 2.0 + cos(uTime * 1.5 + seed * 2.0) * 0.25;
      p.y += sin(uTime * 0.6 + seed * 2.3) * 0.5;
      p.xz += uWind.xz * 0.6; // Vindbyn blåser med dem en bit.
      // Lådan runt bilen, som för gräset.
      vec2 spot = mod(p.xz - uCar.xz + uArea, 2.0 * uArea) + uCar.xz - uArea;
      // Vik undan för bilen.
      vec2 fromCar = spot - uCar.xz;
      float carDistance = max(length(fromCar), 0.01);
      spot += fromCar / carDistance * (1.0 - smoothstep(1.0, 4.0, carDistance)) * 2.5;
      vec4 viewPosition = modelViewMatrix * vec4(spot.x, p.y, spot.y, 1.0);
      gl_Position = projectionMatrix * viewPosition;
      // Blinkar: mest svagt, då och då starkt. pow(…, 4) gör topparna korta.
      vGlow = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed.w * 1.5) + seed * 5.0), 4.0);
      // Tona bort mot lådans kant, så att ingen syns hoppa runt hörnet.
      float edge = max(abs(spot.x - uCar.x), abs(spot.y - uCar.z));
      vGlow *= smoothstep(uArea, uArea - 4.0, edge);
      gl_PointSize = uSize * uPixelRatio / -viewPosition.z * (0.6 + 0.6 * vGlow);
      vColor = aColor;
    }`,
  fragmentShader: `
    varying vec3 vColor;
    varying float vGlow;
    void main() {
      // gl_PointCoord = var i punktens fyrkant vi är (0..1). r = 0 i mitten, 1 i kanten.
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float halo = pow(max(1.0 - r, 0.0), 2.5) * 0.9; // Mjukt sken runt om.
      float core = smoothstep(0.22, 0.0, r) * 0.9;     // Liten ljus kärna.
      gl_FragColor = vec4(vColor * (halo + core) * vGlow, 1.0);
      #include <colorspace_fragment> // Samma färgomvandling som resten av scenen.
    }`,
  transparent: true,
  depthWrite: false,                  // Skymmer inget annat.
  blending: THREE.AdditiveBlending,   // Ljus läggs till: blir ljusare, aldrig mörkare.
});
const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
fireflies.frustumCulled = false;
scene.add(fireflies); // Direkt i scenen, som löven. Syns bara hemma (se updateMagic).

// ---------------------------------------------------------------------------
// MÄTTNAD – starkare färger på utvalda material
// ---------------------------------------------------------------------------
// Skymningsljuset (den lila himlen) gör färgerna gråaktiga. Den här lägger till en rad
// sist i materialets shader som skjuter färgen bort från grått. amount 1 = oförändrat,
// 1.3 = 30 % mer färg. Bara för det som ska sticka ut, så slipper vi ett extra steg
// över hela bilden.
export function addSaturation(material, amount) {
  const previous = material.onBeforeCompile; // Behåll det som redan finns (t.ex. gungningen).
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      // Ljusstyrkan (grått) och färgen dras isär: mer än 1 = mer färg.
      outgoingLight = mix(vec3(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722))), outgoingLight, ${amount.toFixed(2)});
      #include <opaque_fragment>`);
  };
  // three.js återanvänder färdiga shaders. Talet måste med i nyckeln, annars kan två
  // material med olika mättnad få samma shader.
  material.customProgramCacheKey = () => previous.toString() + 'saturation' + amount;
}

// ---------------------------------------------------------------------------
// TRÄD SOM GUNGAR
// ---------------------------------------------------------------------------
// Lägger till gungning i ett material för trädkronor (trees.js). Varje krona gungar i
// sin egen takt (räknat från var den står), och mer när det blåser.
export function addSway(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec3 uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 treeSpot = instanceMatrix[3].xyz; // Var kronan står (matrisens sista kolumn).
        #else
          vec3 treeSpot = vec3(0.0);
        #endif
        float swayPhase = uTime * 1.3 + treeSpot.x * 0.3 + treeSpot.z * 0.2;
        float swayAmount = (0.08 + 0.22 * uWind.y) * (position.y + 1.3); // Mer upptill.
        transformed.x += sin(swayPhase) * swayAmount;
        transformed.z += cos(swayPhase * 0.8) * swayAmount * 0.7;`);
  };
}

// ---------------------------------------------------------------------------
// PUFFAR – däckens damm/jord/grus, och avgaserna
// ---------------------------------------------------------------------------
// En "ringbuffert" för varje sort puffar: ett antal platser som återanvänds i tur och ordning. Varje
// puff får en plats och en födelsetid (plus underlag och styrka); resten (stiga, växa, tona) gör shadern.
// Underlaget (0 jord, 1 grus, 2 hårdare grus, 3 avgaser) styr färgen. Puffarna börjar små och tonar in
// långsamt, med en ojämn kant (brus), så att de inte ser ut som runda skivor när de föds.
let surfaceSampler = () => 0;
// main.js lämnar en funktion (x, z) => 0 gräs, 1 väg, 2 ficka, som säger vad bilen kör på.
export function setSurfaceSampler(sampler) {
  surfaceSampler = sampler;
}

function makePuffSystem(size, options) {
  const spawns = new Float32Array(size * 4).fill(-100); // x, y, z, födelsetid (-100 = aldrig född).
  const infos = new Float32Array(size * 2);             // underlag, styrka.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size * 3), 3)); // Krävs, men används inte.
  const spawnAttribute = new THREE.BufferAttribute(spawns, 4);
  const infoAttribute = new THREE.BufferAttribute(infos, 2);
  spawnAttribute.setUsage(THREE.DynamicDrawUsage);
  infoAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aSpawn', spawnAttribute);
  geometry.setAttribute('aInfo', infoAttribute);
  const color = (hex) => ({ value: new THREE.Color(hex) });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uLife: { value: options.life },
      uRise: { value: options.rise },
      uSpread: { value: options.spread },
      uSize0: { value: options.size0 },
      uSize1: { value: options.size1 },
      uAlpha: { value: options.alpha },
      uScreenScale: { value: 800 },
      uColor0: color('#6a5338'), // Jord (gräs): mörkbrun.
      uColor1: color('#a8927a'), // Grus (väg): grusets färg, lite mörkare än förut.
      uColor2: color('#8d7e70'), // Fickan: lite mörkare grus.
      uColor3: color(options.smoke), // Avgaser.
    },
    vertexShader: `
      attribute vec4 aSpawn;
      attribute vec2 aInfo;
      uniform float uTime;
      uniform float uLife;
      uniform float uRise;
      uniform float uSpread;
      uniform float uSize0;
      uniform float uSize1;
      uniform float uScreenScale;
      uniform vec3 uColor0;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      varying float vAge;
      varying float vSeed;
      varying float vPower;
      varying vec3 vColor;
      void main() {
        float age = (uTime - aSpawn.w) / uLife; // 0 = ny, 1 = borta.
        vec3 p = aSpawn.xyz;
        float seed = fract(sin(aSpawn.w * 91.7 + aSpawn.x * 12.9 + aSpawn.z * 4.1) * 4375.5); // Ett slumptal per puff.
        p.y += age * uRise * (0.6 + seed * 0.6);                    // Stiger.
        p.x += sin(seed * 30.0 + age * 3.0) * uSpread * age;        // Och sprider sig lite.
        p.z += cos(seed * 20.0 + age * 2.5) * uSpread * age;
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float alive = step(0.0, age) * step(age, 1.0);              // 0 för puffar som inte finns.
        float grow = smoothstep(0.0, 1.0, age);
        gl_PointSize = mix(uSize0, uSize1, grow) * (0.75 + seed * 0.5) * (0.6 + 0.4 * aInfo.y) * alive * uScreenScale / -viewPosition.z;
        vAge = age;
        vSeed = seed;
        vPower = aInfo.y;
        vColor = aInfo.x < 0.5 ? uColor0 : (aInfo.x < 1.5 ? uColor1 : (aInfo.x < 2.5 ? uColor2 : uColor3));
      }`,
    fragmentShader: `
      uniform float uAlpha;
      varying float vAge;
      varying float vSeed;
      varying float vPower;
      varying vec3 vColor;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 pc = gl_PointCoord - 0.5;
        float r = length(pc) * 2.0;
        // Brus i kanten: ingen perfekt cirkel, utan en ojämn, mjuk molnform.
        float n = valueNoise(pc * 4.5 + vSeed * 17.0);
        float shape = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.8);
        // Tonar in långsamt (inte en skiva som dyker upp) och bleknar mjukt.
        float fadeIn = smoothstep(0.0, 0.3, vAge);
        float fadeOut = (1.0 - vAge) * (1.0 - vAge);
        gl_FragColor = vec4(vColor, shape * fadeIn * fadeOut * uAlpha * vPower);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;
  return {
    material,
    // Lägger en ny puff: x, y, z, underlag, styrka (0..1).
    spawn(x, y, z, kind, power) {
      spawns[next * 4] = x;
      spawns[next * 4 + 1] = y;
      spawns[next * 4 + 2] = z;
      spawns[next * 4 + 3] = shared.uTime.value;
      infos[next * 2] = kind;
      infos[next * 2 + 1] = power;
      next = (next + 1) % size;
      spawnAttribute.needsUpdate = true;
      infoAttribute.needsUpdate = true;
    },
  };
}

// Däcken: jord på gräs, grus på väg. Mörkare, lägre och mer ojämna än den gamla ljusa dammen.
const tirePuffs = makePuffSystem(160, { life: 1.1, rise: 0.45, spread: 0.35, size0: 0.22, size1: 1.25, alpha: 0.5, smoke: '#c8c8cc' });
// Avgaserna: den ljusa, mjuka röken, från avgasröret bak på bilen. Stiger och sprider sig.
const exhaustPuffs = makePuffSystem(70, { life: 1.5, rise: 0.9, spread: 0.22, size0: 0.12, size1: 0.7, alpha: 0.3, smoke: '#cfd0d6' });
const puffSystems = [tirePuffs, exhaustPuffs];

let trailRolled = 0;       // Hur långt bilen rullat sedan förra däckspuffen.
let exhaustWait = 0;       // Sekunder tills nästa avgaspuff.
const lastCarSpot = new THREE.Vector3();

function updateTrail(delta, carPosition, carAngle, extra) {
  const moved = carPosition.distanceTo(lastCarSpot);
  lastCarSpot.copy(carPosition);
  if (moved > 2) return; // Ett hopp (en resa), inte körning.
  const speedNow = delta > 0 ? moved / delta : 0;
  const sinA = Math.sin(carAngle);
  const cosA = Math.cos(carAngle);

  // --- Däckspuffar: bakhjulen, tätare i drift och med nitro. Mindre kraft vid låg fart. ---
  trailRolled += moved;
  if (trailRolled >= (extra ? 0.18 : 0.5)) {
    trailRolled = 0;
    const kind = surfaceSampler(carPosition.x, carPosition.z);
    const power = THREE.MathUtils.clamp(0.25 + speedNow / 12, 0.25, 1);
    for (const side of [-1, 1]) {
      tirePuffs.spawn(
        carPosition.x - sinA * 0.9 + cosA * 0.55 * side,
        0.2,
        carPosition.z - cosA * 0.9 - sinA * 0.55 * side,
        kind,
        power
      );
    }
  }

  // --- Avgaser: ett rör bak till höger på bilen. Glesa när den står stilla, tätare ju fortare den kör. ---
  exhaustWait -= delta;
  if (exhaustWait <= 0) {
    const speedShare = THREE.MathUtils.clamp(speedNow / 12, 0, 1);
    exhaustWait = extra ? 0.06 : THREE.MathUtils.lerp(0.5, 0.08, speedShare);
    exhaustPuffs.spawn(
      carPosition.x - sinA * 1.3 + cosA * 0.38,
      0.38,
      carPosition.z - cosA * 1.3 - sinA * 0.38,
      3,
      0.55 + 0.45 * speedShare
    );
  }
}

// ---------------------------------------------------------------------------
// SKRÄP – jordklumpar och grusflingor som slungas upp av bakhjulen
// ---------------------------------------------------------------------------
// Samma ringbuffert-trick som puffarna: CPU:n skriver bara vid födseln (plats, födelsetid, startfart),
// banan (kast + tyngdkraft, sedan liggande på marken) räknar shadern ut. Ogenomskinliga kantiga punkter;
// de växer fram och krymper bort, så inget poppar.
const DEBRIS_SIZE = 120;
const DEBRIS_GRAVITY = 14;
const debrisSpawns = new Float32Array(DEBRIS_SIZE * 4).fill(-100); // x, y, z, födelsetid.
const debrisVels = new Float32Array(DEBRIS_SIZE * 4);              // startfart x, y, z + livslängd.
const debrisInfos = new Float32Array(DEBRIS_SIZE * 2);             // underlag, storlek.
const debrisGeometry = new THREE.BufferGeometry();
debrisGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS_SIZE * 3), 3)); // Krävs, men används inte.
const debrisAttributes = [['aSpawn', debrisSpawns, 4], ['aVel', debrisVels, 4], ['aInfo', debrisInfos, 2]].map(([name, array, count]) => {
  const attribute = new THREE.BufferAttribute(array, count);
  attribute.setUsage(THREE.DynamicDrawUsage);
  debrisGeometry.setAttribute(name, attribute);
  return attribute;
});
const debrisMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: shared.uTime,
    uGravity: { value: DEBRIS_GRAVITY },
    uScreenScale: { value: 800 },
    uColor0: { value: new THREE.Color('#6a5338') }, // Jord (gräs).
    uColor1: { value: new THREE.Color('#a8927a') }, // Grus (väg).
    uColor2: { value: new THREE.Color('#8d7e70') }, // Fickan: lite mörkare grus.
  },
  vertexShader: `
    attribute vec4 aSpawn;
    attribute vec4 aVel;
    attribute vec2 aInfo;
    uniform float uTime;
    uniform float uGravity;
    uniform float uScreenScale;
    uniform vec3 uColor0;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying vec3 vColor;
    void main() {
      float t = uTime - aSpawn.w;
      float age = t / aVel.w; // 0 = ny, 1 = borta.
      float seed = fract(sin(aSpawn.w * 91.7 + aSpawn.x * 12.9 + aSpawn.z * 4.1) * 4375.5);
      // Flyger tills den når marken och blir sedan liggande där.
      float landed = (aVel.y + sqrt(aVel.y * aVel.y + 2.0 * uGravity * max(aSpawn.y - 0.04, 0.0))) / uGravity;
      float fly = clamp(t, 0.0, landed);
      vec3 p = aSpawn.xyz + aVel.xyz * fly;
      p.y = max(aSpawn.y + aVel.y * fly - 0.5 * uGravity * fly * fly, 0.04);
      vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * viewPosition;
      float alive = step(0.0, age) * step(age, 1.0);                                  // 0 för bitar som inte finns.
      float scale = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age));    // In och ut mjukt.
      gl_PointSize = aInfo.y * (0.7 + seed * 0.6) * scale * alive * uScreenScale / -viewPosition.z;
      vec3 base = aInfo.x < 0.5 ? uColor0 : (aInfo.x < 1.5 ? uColor1 : uColor2);
      vColor = base * (0.65 + seed * 0.7);                                            // Mörkare och ljusare klumpar.
    }`,
  fragmentShader: `
    varying vec3 vColor;
    void main() {
      vec2 pc = gl_PointCoord - 0.5;
      if (abs(pc.x) + abs(pc.y) > 0.62) discard; // Kantig klump: fyrkant med hörnen bortskurna.
      gl_FragColor = vec4(vColor * (0.8 + 0.4 * (0.5 - pc.y)), 1.0); // Undersidan lite mörkare.
      #include <colorspace_fragment>
    }`,
});
const debris = new THREE.Points(debrisGeometry, debrisMaterial);
debris.frustumCulled = false;
scene.add(debris);
let debrisNext = 0;
let debrisBudget = 0;        // Bitar som "ska" ha kastats (bråkdelar sparas till nästa bild).
let debrisFirst = true;
let lastDebrisAngle = 0;
let lastDebrisSpeed = 0;
const lastDebrisSpot = new THREE.Vector3();

function updateDebris(delta, carPosition, carAngle, extra) {
  const dx = carPosition.x - lastDebrisSpot.x;
  const dz = carPosition.z - lastDebrisSpot.z;
  lastDebrisSpot.copy(carPosition);
  const turned = carAngle - lastDebrisAngle;
  lastDebrisAngle = carAngle;
  const moved = Math.hypot(dx, dz);
  if (debrisFirst || delta <= 0 || moved > 2) { debrisFirst = false; return; } // Första bilden eller ett hopp (en resa).
  const speedNow = moved / delta;
  const turnRate = Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) / delta;
  const accel = Math.max(speedNow - lastDebrisSpeed, 0) / delta; // Hård gas.
  lastDebrisSpeed = speedNow;
  if (speedNow < 1.5) return;
  // Bitar per sekund: några vid vanlig fart, många i drift/slirning/nitro, fler ju fortare man kör.
  let rate = speedNow * 0.9;
  if (extra) rate = rate * 3.5 + 8;
  else if (turnRate > 1.2 || accel > 8) rate *= 2;
  debrisBudget += Math.min(rate, 70) * delta;
  const count = Math.min(Math.floor(debrisBudget), 12);
  debrisBudget -= Math.floor(debrisBudget);
  if (count === 0) return;
  const kind = surfaceSampler(carPosition.x, carPosition.z);
  const sinA = Math.sin(carAngle);
  const cosA = Math.cos(carAngle);
  // Färdriktningen (i drift pekar den inte åt nosen): bitarna flyger bakåt längs den och åt sidan.
  const dirX = dx / moved;
  const dirZ = dz / moved;
  for (let n = 0; n < count; n++) {
    const i = debrisNext;
    debrisNext = (debrisNext + 1) % DEBRIS_SIZE;
    const side = Math.random() < 0.5 ? -1 : 1;
    const back = 0.8 + Math.random() * 0.2;
    const along = (1 + Math.random() * 2.5 + speedNow * 0.12) * (extra ? 1.3 : 1); // Bakåt.
    const out = side * (0.4 + Math.random() * 1.6) * (extra ? 1.8 : 1);           // Åt sidan.
    debrisSpawns[i * 4] = carPosition.x - sinA * back + cosA * 0.55 * side;
    debrisSpawns[i * 4 + 1] = 0.2;
    debrisSpawns[i * 4 + 2] = carPosition.z - cosA * back - sinA * 0.55 * side;
    debrisSpawns[i * 4 + 3] = shared.uTime.value;
    debrisVels[i * 4] = -dirX * along + cosA * out;
    debrisVels[i * 4 + 1] = 1.8 + Math.random() * 2.4 + (extra ? 1 : 0);
    debrisVels[i * 4 + 2] = -dirZ * along - sinA * out;
    debrisVels[i * 4 + 3] = 0.5 + Math.random() * 0.4; // Livslängd.
    debrisInfos[i * 2] = kind;
    debrisInfos[i * 2 + 1] = 0.1 + Math.random() * 0.1;
  }
  for (const attribute of debrisAttributes) attribute.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// NATTFJÄRILAR – små ljusprickar som fladdrar runt lyktorna
// ---------------------------------------------------------------------------
// centers = lyktornas glödlampor i världen. color = ljusets färg.
const MOTHS_PER_LAMP = 4;
const mothScreenScale = { value: 800 };
export function makeMoths(centers, color) {
  const count = centers.length * MOTHS_PER_LAMP;
  const centerData = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  centers.forEach((center, lamp) => {
    for (let j = 0; j < MOTHS_PER_LAMP; j++) {
      const i = lamp * MOTHS_PER_LAMP + j;
      center.toArray(centerData, i * 3);
      seeds[i] = Math.random();
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // Krävs, men används inte.
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(centerData, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color(color).multiplyScalar(0.3) }, // Lampans färg, svag: ser genomskinliga ut.
      uScreenScale: mothScreenScale,
    },
    vertexShader: `
      attribute vec3 aCenter;
      attribute float aSeed;
      uniform float uTime;
      uniform float uScreenScale;
      void main() {
        // Varje fjäril flyger i en egen, lite ojämn cirkel runt lampan: åt olika håll,
        // i olika fart, och fladdrar upp och ner.
        float direction = aSeed > 0.5 ? 1.0 : -1.0;
        float angle = uTime * (1.5 + aSeed * 2.5) * direction + aSeed * 40.0;
        float radius = 0.45 + 0.35 * sin(uTime * 1.3 + aSeed * 20.0);
        vec3 p = aCenter + vec3(cos(angle) * radius, sin(uTime * 4.0 + aSeed * 30.0) * 0.25 - 0.1, sin(angle) * radius);
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = 0.16 * uScreenScale / -viewPosition.z;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(uColor * pow(smoothstep(1.0, 0.0, r), 2.0), 1.0); // Mjuk kant, ingen hård prick.
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const moths = new THREE.Points(geometry, material);
  moths.frustumCulled = false;
  moths.userData.noShadow = true;
  markMoving(moths);
  return moths;
}

// ---------------------------------------------------------------------------
// STRÅLKASTARE – en ljuskägla bakom varje skylt som sveper fram och tillbaka
// ---------------------------------------------------------------------------
// Som på en filmpremiär. Den rör sig, och blicken följer strålen ner till skylten.
// En öppen kon (smal nere, bred uppe) som "lägger till" ljus och bleknar uppåt.
// Svepet räknas ut i shadern, så den kostar inget för datorn.
const BEAM_HEIGHT = 16;
const beamGeometry = new THREE.CylinderGeometry(1.6, 0.25, BEAM_HEIGHT, 20, 1, true);
beamGeometry.translate(0, BEAM_HEIGHT / 2, 0); // Vridpunkten nere vid foten.
export function makeSearchlight(color, seed) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color(color) },
      uSeed: { value: seed },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSeed;
      varying float vUp;
      void main() {
        vUp = uv.y; // 0 nere vid lampan, 1 högst upp.
        // Svep: luta konen åt sidan (runt z) fram och tillbaka, och lite bakåt (runt x).
        float sweep = sin(uTime * 0.35 + uSeed * 6.28) * 0.45;
        float lean = -0.35;
        vec3 p = position;
        p = vec3(p.x, p.y * cos(lean) - p.z * sin(lean), p.y * sin(lean) + p.z * cos(lean));
        p = vec3(p.x * cos(sweep) - p.y * sin(sweep), p.x * sin(sweep) + p.y * cos(sweep), p.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vUp;
      void main() {
        float strength = pow(1.0 - vUp, 1.6) * 0.22; // Starkast vid lampan, bleknar uppåt.
        gl_FragColor = vec4(uColor * strength, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeometry, material);
  beam.frustumCulled = false; // Konen flyttas i shadern; three.js vet inte var den hamnar.
  beam.userData.noShadow = true;
  markMoving(beam);
  return beam;
}

// ---------------------------------------------------------------------------
// FICKANS GLÖD – en lysande kant runt parkeringsfickan som pulserar
// ---------------------------------------------------------------------------
// Ett plan lika stort som fickan. Shadern lyser bara nära kanterna. near (0..1) = hur
// nära bilen är: kanten lyser starkare ju närmare man kommer.
export function makePadGlow(width, length, color) {
  const near = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uNear: near,
      uColor: { value: new THREE.Color(color) },
      uSize: { value: new THREE.Vector2(width, length) },
    },
    vertexShader: `
      varying vec2 vSpot;
      uniform vec2 uSize;
      void main() {
        vSpot = (uv - 0.5) * uSize; // Plats i fickan, i enheter från mitten.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uNear;
      uniform vec3 uColor;
      uniform vec2 uSize;
      varying vec2 vSpot;
      void main() {
        // En mjuk, rund sken runt ENTER-texten (ingen ram och inga kanter): ett varmt ljus som lägger sig
        // på marken och tonar ut långt innan fickans kant. Tonas också bort mot vägen.
        vec2 p = vec2(vSpot.x / 2.9, vSpot.y / 1.7);
        float halo = exp(-dot(p, p) * 1.3);                 // Stor, jämn klocka.
        float core = exp(-dot(p, p) * 4.5) * 0.35;          // Lite tätare precis kring texten.
        float roadFade = smoothstep(-uSize.y * 0.5, -uSize.y * 0.15, vSpot.y);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.2);       // Andas långsamt.
        float strength = (halo * 0.22 + core) * pulse * (0.45 + 0.55 * uNear) * roadFade;
        gl_FragColor = vec4(uColor * strength, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
  glow.rotation.x = -Math.PI / 2;
  glow.userData.noShadow = true;
  return { mesh: glow, near };
}

// ---------------------------------------------------------------------------
// SMÄLL – gnistor och en ljusring när bilen parkerar i en ficka
// ---------------------------------------------------------------------------
// En enda uppsättning som återanvänds: burstAt() flyttar den och nollställer klockan.
// Gnistorna skjuts ut och upp och faller tillbaka; ringen vidgas över marken och bleknar.
const BURST_COUNT = 80;
const BURST_LIFE = 1.4; // Sekunder.
const burst = {
  uStart: { value: -100 },                 // När smällen började (uTime). -100 = aldrig.
  uOrigin: { value: new THREE.Vector3() }, // Var.
  uColor: { value: new THREE.Color() },    // Vilken färg.
  uLife: { value: BURST_LIFE },
  uScreenScale: smokeScreenScaleProxy(),
};
function smokeScreenScaleProxy() { return { value: 800 }; } // Fylls i varje bild (se updateMagic).
const burstSeeds = new Float32Array(BURST_COUNT * 3);
for (let i = 0; i < BURST_COUNT; i++) {
  burstSeeds[i * 3] = Math.random() * Math.PI * 2; // Åt vilket håll.
  burstSeeds[i * 3 + 1] = 2 + Math.random() * 5;   // Hur fort utåt.
  burstSeeds[i * 3 + 2] = 3 + Math.random() * 6;   // Hur fort uppåt.
}
const burstGeometry = new THREE.BufferGeometry();
burstGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3)); // Krävs, men används inte.
burstGeometry.setAttribute('aSeed', new THREE.BufferAttribute(burstSeeds, 3));
const burstSparks = new THREE.Points(burstGeometry, new THREE.ShaderMaterial({
  uniforms: { ...burst, uTime: shared.uTime },
  vertexShader: `
    attribute vec3 aSeed;
    uniform float uTime;
    uniform float uStart;
    uniform float uLife;
    uniform vec3 uOrigin;
    uniform float uScreenScale;
    varying float vAge;
    void main() {
      float t = uTime - uStart;
      float age = t / uLife;
      vec2 direction = vec2(cos(aSeed.x), sin(aSeed.x));
      float out_ = aSeed.y * t * (1.0 - 0.35 * t);     // Bromsar in.
      float up = aSeed.z * t - 6.0 * t * t;            // Uppåt, sedan ner (tyngdkraft).
      vec3 p = uOrigin + vec3(direction.x * out_, max(up, 0.0) + 0.15, direction.y * out_);
      vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * viewPosition;
      float alive = step(0.0, age) * step(age, 1.0);
      gl_PointSize = 0.4 * (1.0 - age) * alive * uScreenScale / -viewPosition.z;
      vAge = age;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAge;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      gl_FragColor = vec4(uColor * pow(smoothstep(1.0, 0.0, r), 2.0) * (1.0 - vAge) * 1.3, 1.0);
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
burstSparks.frustumCulled = false;
scene.add(burstSparks);
// Ramen: ett plan på marken där shadern ritar en skarp rektangel som växer ut till
// fickans kant och sedan bleknar.
const RING_SIZE = 13; // Planet: rymmer ramen när den vuxit till sin största storlek.
const burstRing = new THREE.Mesh(new THREE.PlaneGeometry(RING_SIZE, RING_SIZE).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: {
    ...burst, uTime: shared.uTime, uSize: { value: RING_SIZE },
    uHalf: { value: new THREE.Vector2(BAY_HALF_WIDTH, BAY_HALF_LENGTH) },
  },
  vertexShader: `
    varying vec2 vSpot;
    uniform float uSize;
    void main() {
      vSpot = (uv - 0.5) * uSize;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform float uStart;
    uniform float uLife;
    uniform vec3 uColor;
    uniform vec2 uHalf;
    varying vec2 vSpot;
    void main() {
      float age = clamp((uTime - uStart) / uLife, 0.0, 1.0);
      // Börjar exakt på fickans kant och växer utåt, snabbt först och sedan långsammare (1 - (1-t)^3).
      float grow = 1.0 - pow(1.0 - age, 3.0);
      vec2 half_ = uHalf * mix(1.0, 1.6, grow);
      // Avstånd till rektangelns kant (0 på kanten). abs() = samma för alla fyra sidor.
      vec2 q = abs(vSpot) - half_;
      float edge = abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
      float line = 1.0 - smoothstep(0.04, 0.12, edge);  // Skarp linje, ca 0.1 enheter bred.
      float fade = 1.0 - smoothstep(0.3, 1.0, age);      // Bleknar medan den växer.
      gl_FragColor = vec4(uColor * line * fade * 1.2, 1.0);
      #include <colorspace_fragment>
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
burstRing.frustumCulled = false;
scene.add(burstRing);

// Startar en smäll på platsen (x, z) i färgen color.
export function burstAt(x, z, color) {
  burst.uStart.value = shared.uTime.value;
  burst.uOrigin.value.set(x, 0, z);
  burst.uColor.value.set(color);
  burstRing.position.set(x, 0.07, z);
  burstRing.rotation.y = BILLBOARD_FACING; // Vänd som fickan.
}

// ---------------------------------------------------------------------------
// MATCHA – teets yta i kopparna
// ---------------------------------------------------------------------------
// Djupgrönt te med ett ljusare skum som virvlar sakta (i varmt te), en mörkare kant där
// teet möter koppen, en tunn skumring längs kanten och en mjuk glans. Kallt te är
// mörkare, står helt still och har en svag ring där det torkat.
// Ingen riktig belysning: färgerna är valda för skymningen, så det blir billigt.
export function makeMatchaMaterial(hot) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uWind: shared.uWind,     // Samma vind som gräset och träden.
      uBreeze: shared.uBreeze,
      uHot: { value: hot ? 1 : 0 },
      uDeep: { value: new THREE.Color(hot ? PALETTE.matcha : PALETTE.matchaCold) },
      uFoam: { value: new THREE.Color(hot ? PALETTE.matchaFoam : PALETTE.matchaCold).multiplyScalar(hot ? 1 : 1.25) },
    },
    vertexShader: `
      varying vec2 vSpot;
      varying vec2 vWorld;
      void main() {
        vSpot = uv * 2.0 - 1.0; // -1..1 över skivan, 0 i mitten.
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xz;      // Ger varje kopp sitt eget mönster.
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uWind;
      uniform vec2 uBreeze;
      uniform float uHot;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying vec2 vSpot;
      varying vec2 vWorld;
      // Enkelt "brus": mjuka slumpade fläckar (value noise).
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float r = length(vSpot);
        // Rörelsen: varmt te virvlar och skummet driver; kallt te rör sig bara knappt.
        float motion = mix(0.15, 1.0, uHot);
        // Virveln: vrid koordinaterna mer nära mitten, och hela tiden lite till.
        float turn = (1.0 - r) * 1.6 + uTime * 0.08 * motion;
        vec2 p = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * vSpot;
        // Vinden: samma våg som får gräset att böja sig (se gräset ovan), så att teet rör sig i
        // takt med gräset och träden. Skummet driver med brisen och knuffas av vindbyarna.
        float windWave = sin(uTime * 1.6 - dot(vWorld, uBreeze) * 0.35);
        p += vWorld * 1.7 + uBreeze * (uTime * 0.05 + windWave * 0.03) * motion + uWind.xz * 0.04;
        // Skummet: två lager brus, ett grovt och ett fint.
        float foam = noise(p * 3.0) * 0.65 + noise(p * 9.0 + uTime * 0.08 * motion) * 0.35;
        vec3 color = mix(uDeep, uFoam, smoothstep(0.5, 0.9, foam) * 0.4);
        // Små ringar som vandrar utåt över ytan, som när någon nyss rört i koppen.
        float ripple = sin(r * 26.0 - uTime * 1.2) * 0.5 + 0.5;
        color *= 1.0 + (ripple - 0.5) * 0.025 * motion * (1.0 - r);
        // Krusningar i vindens riktning, starkare när det blåser (uWind.y = vindbyns styrka).
        float windRipple = sin(dot(vWorld, uBreeze) * 30.0 - uTime * 1.5 + noise(vWorld * 6.0) * 2.0);
        color *= 1.0 + windRipple * (0.008 + 0.025 * uWind.y);
        // Mörkare kant där teet möter koppen (skugga), och en tunn skumring precis vid kanten.
        color *= 1.0 - smoothstep(0.7, 1.0, r) * 0.35;
        color = mix(color, uFoam, smoothstep(0.88, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r)) * 0.35);
        // Kallt te: en svag torkad ring en bit in.
        color = mix(color, uDeep * 0.6, (1.0 - uHot) * smoothstep(0.02, 0.0, abs(r - 0.8)) * 0.6);
        // Glansen: en svag ljus fläck snett uppe till vänster som gungar lite med ytan.
        vec2 shineSpot = vec2(-0.35, 0.3) + vec2(sin(uTime * 0.6), cos(uTime * 0.5)) * 0.015 * motion;
        float shine = smoothstep(0.3, 0.0, length(vSpot - shineSpot));
        color += vec3(1.0, 0.97, 0.85) * shine * mix(0.05, 0.025, 1.0 - uHot);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------
// VARJE BILD
// ---------------------------------------------------------------------------
// wind = vinden från leaves.js { x, z, strength }.
export function updateMagic(delta, carPosition, wind, carAngle = 0, extraDust = false) {
  shared.uTime.value += delta;
  shared.uCar.value.copy(carPosition);
  // Mjuk vind: shadern får en utjämnad version, så att gräset inte rycker till.
  const smooth = 1 - Math.exp(-4 * delta);
  shared.uWind.value.x += (wind.x - shared.uWind.value.x) * smooth;
  shared.uWind.value.z += (wind.z - shared.uWind.value.z) * smooth;
  shared.uWind.value.y += (wind.strength - shared.uWind.value.y) * smooth;
  fireflyMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  // Kamerans synfält är 30 grader: tan(15°) ≈ 0.268.
  smokeScreenScale.value = renderer.domElement.height / (2 * 0.268);
  for (const system of puffSystems) system.material.uniforms.uScreenScale.value = smokeScreenScale.value;
  mothScreenScale.value = smokeScreenScale.value;
  burst.uScreenScale.value = smokeScreenScale.value;
  updateTrail(delta, carPosition, carAngle, extraDust);
  updateDebris(delta, carPosition, carAngle, extraDust);
  debrisMaterial.uniforms.uScreenScale.value = smokeScreenScale.value;
  fireflies.visible = currentWorld === WORLDS.hub;
}

// ---------------------------------------------------------------------------
// LJUSSLINGOR – glödlampor runt skärmarna, som på en gammal biograf
// ---------------------------------------------------------------------------
// Var tredje lampa lyser starkt, och mönstret "springer" runt ramen. När bilen står i
// fickan slutar de springa och lyser lugnt och jämnt (så att de inte stör klippet), med en
// svag ton av skärmens färg (tint). points = lampornas platser.
const bulbGeometry = new THREE.IcosahedronGeometry(0.19, 1);
export function makeBulbs(points, color) {
  const geometry = bulbGeometry.clone(); // Egen kopia: varje slinga har sina egna nummer.
  geometry.setAttribute('aChase', new THREE.InstancedBufferAttribute(new Float32Array(points.map((_, i) => i)), 1));
  const material = new THREE.MeshBasicMaterial({ color });
  const active = { value: 0 }; // 0 = vanlig, 1 = bilen står i fickan. Glider mjukt (se updateBillboards).
  const tint = { value: new THREE.Color(color) }; // Skärmens färg medan klippet spelar.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uActive = active;
    shader.uniforms.uTint = tint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aChase;
        uniform float uTime;
        uniform float uActive;
        varying float vLit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Hur många steg mönstret har flyttat sig: 3 per sekund.
        float steps = floor(uTime * 3.0);
        vLit = 1.0 - min(mod(aChase + steps, 3.0), 1.0); // 1 för var tredje lampa, annars 0.`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uActive;
        uniform vec3 uTint;
        varying float vLit;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        // Springande mönster när ingen tittar; lugnt och jämnt sken när bilen står där.
        float chase = 0.45 + 0.8 * vLit;
        float brightness = mix(chase, 1.25, uActive);
        // Medan man tittar lyser lamporna i skärmens färg (85 %).
        vec3 bulbColor = mix(diffuse, uTint, 0.85 * uActive);
        vec4 diffuseColor = vec4( bulbColor * brightness, opacity );`);
  };
  const bulbs = new THREE.InstancedMesh(geometry, material, points.length);
  const helper = new THREE.Object3D();
  points.forEach((point, i) => {
    helper.position.copy(point);
    helper.updateMatrix();
    bulbs.setMatrixAt(i, helper.matrix);
  });
  bulbs.userData.noShadow = true; // Små lampor behöver inga skuggor (se optimize.js).
  return { mesh: bulbs, active, tint };
}

// Platser runt en rektangel: mitten på (0, centerY), halva bredden halfWidth osv.
// spacing = ungefärligt avstånd mellan lamporna.
export function rectanglePoints(halfWidth, bottom, top, z, spacing) {
  const points = [];
  const corners = [[-halfWidth, bottom], [halfWidth, bottom], [halfWidth, top], [-halfWidth, top]];
  corners.forEach(([x1, y1], i) => {
    const [x2, y2] = corners[(i + 1) % 4];
    const count = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / spacing));
    for (let j = 0; j < count; j++) {
      const t = j / count;
      points.push(new THREE.Vector3(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z));
    }
  });
  return points;
}

// ---------------------------------------------------------------------------
// GROTTANS VIRVEL – en snurrande spiral av ljus i grottöppningen
// ---------------------------------------------------------------------------
// geometry = öppningens form. center = virvelns mitt i formen. color = världens färg.
export function makeSwirl(geometry, center, color) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uColor: { value: new THREE.Color(color) },
      uCenter: { value: new THREE.Vector2(center.x, center.y) },
    },
    vertexShader: `
      varying vec2 vSpot;
      void main() {
        vSpot = position.xy; // Formen ligger platt i x/y, så det här är platsen i öppningen.
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec2 uCenter;
      varying vec2 vSpot;
      void main() {
        vec2 p = vSpot - uCenter;
        float r = length(p);
        float angle = atan(p.y, p.x);
        // Spiralen: tre armar som vrids mer längre ut och snurrar inåt med tiden.
        float spiral = 0.5 + 0.5 * sin(angle * 3.0 + r * 4.5 - uTime * 2.2);
        // Ringar som dras in mot mitten.
        float rings = 0.5 + 0.5 * sin(r * 7.0 + uTime * 3.0);
        float fade = 0.35 + 0.65 * smoothstep(3.0, 0.2, r); // Starkast i mitten, men fyller hela öppningen.
        vec3 light = uColor * (spiral * 0.75 + rings * 0.25) * fade + uColor * fade * fade * 0.6;
        gl_FragColor = vec4(light, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const swirl = new THREE.Mesh(geometry, material);
  swirl.userData.noShadow = true;
  return swirl;
}

// ---------------------------------------------------------------------------
// RÖK UR SKORSTENEN
// ---------------------------------------------------------------------------
// Mjuka rökpuffar som stiger, växer och bleknar. Varje puff börjar om när den bleknat.
// origin = där röken kommer ut, i världen (skorstenens topp). Inställningar (alla valfria):
//   color   – rökens färg.
//   scale   – storlek: 1 = skorstensrök, mindre för ånga ur en liten kopp.
//   spread  – hur utspritt pufferna börjar (0 = alla från samma punkt, som ur en skorsten).
//   opacity – hur synlig (1 = som skorstensröken, mindre = mer genomskinlig).
//   speed   – hur fort en puff lever sitt liv (0.16 = skorstenen, högre = försvinner fortare).
//   rise    – hur högt den hinner stiga (5.5 = skorstenen).
//   fade    – hur snabbt den bleknar (1 = jämnt, högre = mest synlig precis i början).
export function makeSmoke(origin, {
  color = PALETTE.smoke, scale = 1, spread = 0, opacity = 1, speed = 0.16, rise = 5.5, fade = 1,
} = {}) {
  const PUFFS = 14;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3)); // Krävs, men används inte.
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([...Array(PUFFS).keys()].map((i) => i / PUFFS)), 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uWind: shared.uWind,
      uBreeze: shared.uBreeze,
      uOrigin: { value: origin.clone() },
      uColor: { value: new THREE.Color(color) },
      uScale: { value: scale },
      uSpread: { value: spread },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uRise: { value: rise },
      uFade: { value: fade },
      uScreenScale: smokeScreenScale,
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uWind;
      uniform vec2 uBreeze;
      uniform vec3 uOrigin;
      uniform float uScreenScale;
      uniform float uScale;
      uniform float uSpread;
      uniform float uSpeed;
      uniform float uRise;
      varying float vAge;
      void main() {
        float age = fract(uTime * uSpeed + aSeed); // 0 = nyss ute, 1 = borta.
        vec3 p = uOrigin;
        // Varje puff börjar på sin egen plats inom en cirkel (spread), i stället för i en punkt.
        float spot = aSeed * 6.2832 * 7.0 + floor(uTime * uSpeed + aSeed) * 2.4; // Ny plats varje varv.
        p.xz += vec2(cos(spot), sin(spot)) * uSpread * fract(sin(spot) * 43758.5);
        p.y += age * uRise * uScale;
        p.xz += (uBreeze * 1.5 + uWind.xz * 0.4) * age * age * 2.0 * uScale; // Böjer av med vinden.
        p.x += sin(aSeed * 40.0 + uTime * 0.8) * 0.3 * age * uScale;           // Lite slingrigt.
        vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float size = (0.7 + age * 2.4) * uScale; // Pufferna växer när de stiger.
        gl_PointSize = size * uScreenScale / -viewPosition.z;
        vAge = age;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uFade;
      varying float vAge;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        // Tona in snabbt, ut långsamt (uFade > 1: ut ännu fortare).
        float alpha = smoothstep(1.0, 0.2, r) * smoothstep(0.0, 0.1, vAge) * pow(1.0 - vAge, uFade) * 0.5 * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const smoke = new THREE.Points(geometry, material);
  smoke.frustumCulled = false;
  smoke.userData.noShadow = true;
  markMoving(smoke);
  return smoke;
}
// Hur många pixlar en enhet blir på 1 enhets avstånd. Räknas om varje bild (fönstret kan ändras).
const smokeScreenScale = { value: 800 };
