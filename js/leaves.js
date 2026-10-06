// ============================================================================
// leaves.js — löv och vind: lite rörelse i luften och på marken.
// ============================================================================
// Hemma singlar höstlöv ner, landar och blir liggande en stund. På marken ligger
// också ett lövtäcke som bilen sparkar upp, och då och då drar en vindby förbi.
// I de andra världarna svävar i stället små lysande gnistor sakta UPPÅT, i världens
// färg. Det är samma partiklar: bara material, färg och riktning byts när man reser
// (se setWeather).
//
// Löven finns bara i en låda runt bilen. Faller ett löv under marken, eller hamnar
// det utanför lådan när bilen kör vidare, flyttas det till andra sidan lådan. Då ser
// det ut som att det faller löv överallt, fast det bara finns LEAF_COUNT stycken.
// (Löven ligger direkt i scenen, inte i en värld, och kastar inga skuggor – det vore
// onödigt arbete.)
import * as THREE from 'three';
import { scene, PALETTE, WORLDS, BILLBOARD_FACING } from './core.js';
import { car } from './car.js';

const LEAF_COUNT = 260;   // Antal löv. ÄNDRA för tätare/glesare (allt är ett enda ritanrop, så det är billigt).
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
export const fallingLeafMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const fallenLeafColors = PALETTE.fallenLeaves.map((hex) => new THREE.Color(hex));
// Gnistorna: ljus som läggs till (AdditiveBlending), som lyktornas sken.
export const moteMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
export const fallingLeaves = new THREE.InstancedMesh(leafParticleGeometry, fallingLeafMaterial, LEAF_COUNT);
// Löven flyttar runt hela tiden, så three.js kan inte veta i förväg var de är.
// frustumCulled: false = rita alltid, hoppa inte över dem för att de "verkar" vara utanför bild.
fallingLeaves.frustumCulled = false;
scene.add(fallingLeaves);

// --- Löven på marken ---
// Hemma ligger dessutom ett täcke av löv på marken. Det är en egen InstancedMesh med
// samma form. Även de bor i lådan runt bilen, så det ligger alltid löv där man kör.
// (Lådans kanter är utanför bild, så man ser aldrig att löv flyttas till andra sidan.)
const GROUND_LEAF_COUNT = 1000; // ÄNDRA för tätare/glesare lövtäcke.
export const groundLeaves = new THREE.InstancedMesh(leafParticleGeometry, fallingLeafMaterial, GROUND_LEAF_COUNT);
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
    appear: 1,                          // 0 -> 1 när lövet "växer fram" efter att ha flyttats (inget poppar in).
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
  leaf.underTree = Math.random() < 0.8; // Bor under ett träd (se setLeafTrees), annars i en fri hög.
  leaf.reanchor = false;
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

// --- Löven hör till träden ---
// Träden (x, z, scale) som main.js lämnar över. Löven på marken samlas i högar under träden
// (tätast vid stammen), och löven som faller börjar uppe i trädkronorna. Eftersom löven bara
// finns i lådan runt bilen flyttas ett löv som hoppar över lådans kant till ett träd inne i lådan.
let leafTrees = [];
export function setLeafTrees(trees) {
  leafTrees = trees;
  for (const leaf of groundLeafParticles) leaf.reanchor = true; // Placera om alla under träd.
}

// Ett slumpat träd inne i lådan runt center (eller null om inget finns där).
function pickTreeNear(center) {
  let picked = null;
  let seen = 0;
  for (const tree of leafTrees) {
    if (Math.abs(tree.x - center.x) > LEAF_AREA - 3 || Math.abs(tree.z - center.z) > LEAF_AREA - 3) continue;
    seen++;
    if (Math.random() * seen < 1) picked = tree; // Slumpat val bland alla (reservoir sampling).
  }
  return picked;
}

// Lägger ett marklöv i en hög under ett träd: tätast nära stammen, tunnare ut mot kronans kant.
function relocateUnderTree(leaf, center) {
  const tree = pickTreeNear(center);
  if (!tree) return false;
  const angle = Math.random() * Math.PI * 2;
  const distance = tree.scale * (0.45 + Math.pow(Math.random(), 1.6) * 2.0);
  leaf.x = tree.x + Math.cos(angle) * distance;
  leaf.z = tree.z + Math.sin(angle) * distance;
  leaf.yaw = Math.random() * Math.PI * 2;
  leaf.onGround = true;
  leaf.settle = 0;
  leaf.appear = 0; // Växer fram i stället för att poppa upp.
  return true;
}

let weatherDirection = -1; // -1 = faller (löv), +1 = stiger (gnistor).

// Byter väder efter världen: löv hemma, gnistor i världens färg på andra ställen.
export function setWeather(world) {
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
export const wind = { x: 0, z: 0, strength: 0 }; // Vinden just nu. strength = 0..1.
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
  const wrappedX = wrapAround(leaf.x, center.x);
  const wrappedZ = wrapAround(leaf.z, center.z);
  // Ett riktigt hopp till andra sidan lådan (inte bara avrundning): löv bundna till träd flyttas om.
  if (Math.abs(wrappedX - leaf.x) > 0.5 || Math.abs(wrappedZ - leaf.z) > 0.5) leaf.reanchor = true;
  leaf.x = wrappedX;
  leaf.z = wrappedZ;

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

// Löven finns bara i lådan runt bilen. På en bred skärm syns lådans kant, så löven tonas ut (de
// krymper) de sista EDGE_FADE enheterna innan kanten, och växer fram på andra sidan. Då ser man
// aldrig ett löv försvinna eller dyka upp.
const EDGE_FADE = 7;
function edgeFade(leaf, center) {
  const room = LEAF_AREA - Math.max(Math.abs(leaf.x - center.x), Math.abs(leaf.z - center.z));
  const t = THREE.MathUtils.clamp(room / EDGE_FADE, 0, 1);
  return t * t * (3 - 2 * t); // Mjuk S-kurva.
}
// Hur mycket av lövets storlek som syns: fram-växten gånger kanttoningen.
function visibility(leaf, center) {
  const grow = leaf.appear;
  return grow * grow * (3 - 2 * grow) * edgeFade(leaf, center);
}

// Räknar ut lövets plats och vridning och lägger dem i InstancedMesh-listan.
const leafHelper = new THREE.Object3D();
const tumbleRotation = new THREE.Quaternion();
const flatRotation = new THREE.Quaternion();
const leafEuler = new THREE.Euler();
function placeLeaf(mesh, i, leaf, time, center) {
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
  leafHelper.scale.setScalar(Math.max(leaf.scale * visibility(leaf, center), 0.0001)); // 0 ger ogiltig matris: lite över.
  leafHelper.updateMatrix();
  mesh.setMatrixAt(i, leafHelper.matrix);
}

let groundLeavesPlaced = false; // Har alla marklöv placerats minst en gång?
const lastGroundCenter = new THREE.Vector2(Infinity, Infinity);
export function updateLeaves(delta, center) {
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
        leaf.appear = 0; // Växer fram (poppar inte upp mitt i luften).
        // Oftast börjar det fall från ett träds krona (resten singlar ner utifrån, som förut).
        const tree = Math.random() < 0.85 ? pickTreeNear(center) : null;
        if (tree) {
          const angle = Math.random() * Math.PI * 2;
          const reach = Math.sqrt(Math.random()) * 1.7 * tree.scale;
          leaf.x = tree.x + Math.cos(angle) * reach;
          leaf.z = tree.z + Math.sin(angle) * reach;
          leaf.y = (2.2 + Math.random() * 1.8) * tree.scale; // Kronans höjd.
        }
      }
    }
    if (leaf.appear < 1) leaf.appear = Math.min(1, leaf.appear + delta * 2.5); // Ca 0.4 s.
    placeLeaf(fallingLeaves, i, leaf, time, center);
  });
  fallingLeaves.instanceMatrix.needsUpdate = true;

  // Hemma: lövtäcket på marken.
  // Bara löv som faktiskt rört sig räknas om och skickas till grafikkortet. De flesta
  // ligger still, och då slipper vi skicka alla 420 varje bild.
  let groundChanged = false;
  // Första bilden, och varje bild lådan flyttar sig (kanttoningen ändras då för alla löv).
  const boxMoved = Math.hypot(center.x - lastGroundCenter.x, center.z - lastGroundCenter.z) > 0.001;
  lastGroundCenter.set(center.x, center.z);
  const placeAll = !groundLeavesPlaced || boxMoved;
  groundLeavesPlaced = true;
  groundLeafParticles.forEach((leaf, i) => {
    const oldX = leaf.x;
    const oldZ = leaf.z;
    const wasInAir = !leaf.onGround;
    stepLeaf(leaf, delta, center);
    // Hoppade över lådans kant (eller första bilden): bundna löv flyttas till en hög under ett träd.
    let relocated = false;
    if (leaf.reanchor && leaf.onGround) {
      if (leaf.underTree && leafTrees.length > 0) relocated = relocateUnderTree(leaf, center);
      leaf.reanchor = false;
    }
    const growing = leaf.appear < 1;
    if (growing) leaf.appear = Math.min(1, leaf.appear + delta * 2.5);
    if (placeAll || growing || relocated || wasInAir || !leaf.onGround || leaf.settle > 0 || leaf.x !== oldX || leaf.z !== oldZ) {
      placeLeaf(groundLeaves, i, leaf, time, center);
      groundChanged = true;
    }
  });
  if (groundChanged) groundLeaves.instanceMatrix.needsUpdate = true;
}
