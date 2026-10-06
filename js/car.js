// ============================================================================
// car.js — bilen: modellen, körningen och autopiloten (när den kör av sig själv).
// ============================================================================
import * as THREE from 'three';
import { scene, PALETTE, DRIVE_RADIUS, currentWorld, paintMaterial, glassMaterial } from './core.js';
import { keys } from './ui.js';
import { moveWithCollision, contact } from './collision.js';

// ---------------------------------------------------------------------------
// MODELLEN – byggd av lådor och cylindrar. Fronten pekar längs +Z.
// ---------------------------------------------------------------------------
// Det är en funktion, så att laddningsscenen (loading-scene.js) kan bygga en egen bil.
const tireMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.tire, roughness: 0.9 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.rim, roughness: 0.4, metalness: 0.6 });
// MeshBasicMaterial påverkas inte av ljuset, så lamporna ser ut att lysa själva.
const headlightMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.headlight });
const taillightMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.taillight });
const lampGeometry = new THREE.BoxGeometry(0.28, 0.14, 0.06); // Samma form till alla fyra lampor.

export const WHEEL_RADIUS = 0.3;
// Ett slätt hjul ser likadant ut hur det än snurrar, så varje hjul har däck + fälg +
// två ekrar i kors. Ekrarna är det som ögat kan följa.
const tireGeometry = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.25, 20);
tireGeometry.rotateZ(Math.PI / 2); // Ligg ner med axeln längs X, som ett hjul.
const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 20); // Lite bredare än däcket, så den syns.
rimGeometry.rotateZ(Math.PI / 2);
const spokeGeometry = new THREE.BoxGeometry(0.29, 0.08, 0.4);

// Ger { model, spinners, frontWheels }: hela bilen, hjulens snurrande delar och framhjulen.
export function makeCarModel() {
  const model = new THREE.Group(); // Alla delar läggs i en grupp; delarnas platser är relativa gruppen.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 2.4), paintMaterial); // Kaross.
  body.position.y = 0.5;
  model.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 1.1), glassMaterial); // Hytt.
  cabin.position.set(0, 0.9, -0.2);
  model.add(cabin);
  for (const x of [-0.4, 0.4]) {
    const headlight = new THREE.Mesh(lampGeometry, headlightMaterial);
    headlight.position.set(x, 0.55, 1.2); // Fronten ligger på z = 1.2.
    model.add(headlight);
    const taillight = new THREE.Mesh(lampGeometry, taillightMaterial);
    taillight.position.set(x, 0.55, -1.2);
    model.add(taillight);
  }
  const spinners = [];
  const frontWheels = [];
  for (const x of [-0.65, 0.65]) {
    for (const z of [-0.75, 0.75]) {
      // Hjulet SVÄNGER (runt Y) och SNURRAR (runt X): en grupp för varje.
      const wheel = new THREE.Group();   // Yttre: plats på bilen + sväng.
      const spinner = new THREE.Group(); // Inre: snurr.
      wheel.add(spinner);
      spinner.add(new THREE.Mesh(tireGeometry, tireMaterial));
      spinner.add(new THREE.Mesh(rimGeometry, rimMaterial));
      const spokeA = new THREE.Mesh(spokeGeometry, tireMaterial);
      const spokeB = new THREE.Mesh(spokeGeometry, tireMaterial);
      spokeB.rotation.x = Math.PI / 2;
      spinner.add(spokeA, spokeB);
      wheel.position.set(x, WHEEL_RADIUS, z); // y = hjulets radie, så det precis nuddar marken.
      model.add(wheel);
      spinners.push(spinner);
      if (z > 0) frontWheels.push(wheel);
    }
  }
  return { model, spinners, frontWheels };
}

// Spelets bil.
const built = makeCarModel();
export const car = built.model;
const spinners = built.spinners;
const frontWheels = built.frontWheels;
scene.add(car);

// --- Strålkastarnas ljus ---
// EN SpotLight (ljuskägla) mitt i fronten, eftersom den kastar skuggor – och varje lampa
// med skuggor kostar lika mycket som att rita scenen en extra gång.
// SpotLight(färg, styrka, räckvidd, vinkel, mjuk kant). Släckt tills introt är klart.
export const HEADLIGHT_STRENGTH = 600; // ÄNDRA för starkare/svagare ljus.
export const beam = new THREE.SpotLight(PALETTE.headlightBeam, 0, 30, 0.55, 0.7);
// Fusk: lampan sitter en bit OVANFÖR bilen, så att ljuset blir en tydlig pöl framför den.
beam.position.set(0, 2.2, 1.3);
beam.target.position.set(0, 0, 8); // Siktar på marken 8 enheter framför bilen.
// Skuggor: utan dem lyser ljuset rakt igenom hus och träd.
beam.castShadow = true;
beam.shadow.mapSize.set(1024, 1024);
beam.shadow.camera.near = 0.5;
beam.shadow.camera.far = 30;
beam.shadow.bias = -0.002;
beam.shadow.normalBias = 0.03;
car.add(beam, beam.target);

// ---------------------------------------------------------------------------
// KÖRNING – ändra de här talen för att ändra känslan.
// ---------------------------------------------------------------------------
const MAX_SPEED = 12;      // Toppfart, enheter per sekund.
const ACCELERATION = 14;   // Hur snabbt farten ökar.
const FRICTION = 6;        // Hur snabbt bilen saktar in när man släpper gasen.
const TURN_RATE = 2.4;     // Hur snabbt bilen svänger vid toppfart, radianer per sekund.
const MAX_STEER = 0.5;     // Hur mycket framhjulen vrids, radianer (ca 29°).

// --- DRIFT (Space) och NITRO (Shift) ---
const GRIP = 14;               // Hur snabbt rörelseriktningen hakar i nosen vid vanlig körning (högt = ingen sladd).
const DRIFT_GRIP = 2.0;       // ...och under drift (lågt = bilen glider åt sidan).
const DRIFT_MIN_SPEED = 5;     // Under den här farten går det inte att drifta.
const DRIFT_TURN_BOOST = 1.7;  // Bilen svänger snabbare i drift.
const DRIFT_DRAG = 3;          // Farten som går förlorad per sekund i drift.
const SLIDE_SPEED = 12.5;      // Över den här farten (strax över vanlig toppfart, alltså bara med nitro) börjar bilen slira på riktigt.
const SLIDE_GRIP = 4;          // Greppet vid full slirning (full nitro-fart och full rattutslag).
const SLIDE_DRAG = 1;          // Farten som går förlorad per sekund vid full slirning.
const CRUISE_SLIP = 0.1;       // Den lilla slirningen vid vanlig toppfart i full sväng (ett lätt släpp, inte en sladd).
const GRIP_RECOVERY = 3.5;    // Hur mjukt greppet kommer tillbaka när driften släpps (lågt = längre utglidning).
const NITRO_MAX_SPEED = 15.5;  // Toppfart med nitro.
const NITRO_ACCELERATION = 20; // Acceleration med nitro.
const NITRO_DRAIN = 0.4;       // Nitrotanken töms så här mycket per sekund (1 = full tank).
const NITRO_REGEN = 0.12;      // Fylls på så här mycket per sekund när den inte används.
const NITRO_DRIFT_REGEN = 0.35; // Fylls på mycket snabbare medan man driftar.

export let speed = 0;  // Nuvarande fart. Negativ = backar.
export let nitro = 1;  // Nitrotanken, 0–1.
export let drifting = false; // true medan bilen driftar (magic.js ger då mer damm).
export let boosting = false; // true medan nitron används.
export let sliding = false;  // true när bilen slirar av sig själv (för fort i en sväng).
const PINNED_TURN = 0.3; // Hur stor del av full svängförmåga man har när bilen är fastkörd mot ett hinder.
let heading = Math.PI / 4; // Åt vilket håll bilen pekar. PI / 4 = rakt uppåt på skärmen.
let grip = GRIP;           // Nuvarande grepp (glider mellan DRIFT_GRIP och GRIP).
let slide = heading;       // Åt vilket håll bilen RÖR sig. Samma som heading utom i drift.
const crash = { speed: 0, slide: 0, heading: 0 }; // Lånas ut till kollisionen varje bild (collision.js).

// Andra filer ändrar fart och riktning med de här (ett importerat värde går bara att läsa).
export function stopCar() {
  speed = 0;
  drifting = false;
  boosting = false;
  sliding = false;
}
export function setHeading(angle) {
  heading = angle;
  slide = angle;
  car.rotation.y = angle;
}

// --- AUTOPILOT: bilen kör av sig själv till en punkt ---
// Används när bilen backar ut ur garaget, och när den kör in i och ut ur en portal.
//   to – målet { x, z }, reverse – true = backa dit, driveSpeed – enheter per sekund,
//   onDone – körs när bilen är framme (får utelämnas).
export let autoDrive = null; // Pågående körning, eller null.
export function startAutoDrive(to, reverse, driveSpeed, onDone) {
  autoDrive = { to, reverse, speed: driveSpeed, onDone };
}
// Avbryter autopiloten (utan att köra dess onDone), t.ex. när man hoppar direkt till en värld.
export function cancelAutoDrive() {
  autoDrive = null;
}

// Vrider en vinkel mjukt mot en annan, åt det kortaste hållet.
function turnTowards(angle, goal, rate, delta) {
  const difference = Math.atan2(Math.sin(goal - angle), Math.cos(goal - angle));
  return angle + difference * (1 - Math.exp(-rate * delta));
}

function updateAutoDrive(delta) {
  const dx = autoDrive.to.x - car.position.x;
  const dz = autoDrive.to.z - car.position.z;
  const distanceLeft = Math.hypot(dx, dz);
  // Math.min: kör aldrig längre än det som är kvar, så bilen stannar exakt på målet.
  const step = Math.min(autoDrive.speed * delta, distanceLeft);
  if (distanceLeft > 0) {
    car.position.x += (dx / distanceLeft) * step;
    car.position.z += (dz / distanceLeft) * step;
    // Nosen ska peka mot målet – eller bort från det när bilen backar.
    const goal = autoDrive.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
    heading = turnTowards(heading, goal, 10, delta);
  }
  car.rotation.y = heading;
  slide = heading;
  speed = 0;
  drifting = false;
  boosting = false;
  sliding = false;
  for (const spinner of spinners) spinner.rotation.x += (autoDrive.reverse ? -step : step) / WHEEL_RADIUS;
  for (const wheel of frontWheels) wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, 0, 12, delta);
  // Framme? Släpp autopiloten FÖRST, så att onDone kan starta en ny körning.
  if (step >= distanceLeft) {
    const onDone = autoDrive.onDone;
    autoDrive = null;
    if (onDone) onDone();
  }
}

// Körs en gång per bild. delta = sekunder sedan förra bilden.
// travelling = true medan en resa pågår (då står bilen still när autopiloten är klar).
export function updateCar(delta, travelling) {
  if (autoDrive) {
    updateAutoDrive(delta);
    return;
  }
  if (travelling) return;

  // (framåt) - (bakåt) ger 1, -1 eller 0.
  const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  // 1 = vänster, -1 = höger.
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  // Drift: Space, fart framåt och en sväng. Nitro: Shift, gas framåt och något kvar i tanken.
  drifting = keys.has('Space') && speed > DRIFT_MIN_SPEED && steer !== 0;
  boosting = keys.has('ShiftLeft') || keys.has('ShiftRight') ? throttle > 0 && nitro > 0 : false;
  if (boosting) {
    nitro = Math.max(0, nitro - NITRO_DRAIN * delta);
  } else {
    nitro = Math.min(1, nitro + (drifting ? NITRO_DRIFT_REGEN : NITRO_REGEN) * delta);
  }
  const topSpeed = boosting ? NITRO_MAX_SPEED : MAX_SPEED;
  if (throttle !== 0) {
    speed += throttle * (boosting ? NITRO_ACCELERATION : ACCELERATION) * delta;
  } else {
    // Ingen gas: bromsa mot 0, men aldrig förbi 0 (då skulle bilen darra).
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), FRICTION * delta);
  }
  if (drifting) speed -= DRIFT_DRAG * delta;
  // Över toppfart (nitron slut): sakta ner mjukt i stället för att fastna på en gång.
  if (speed > topSpeed) speed = Math.max(topSpeed, speed - ACCELERATION * delta);
  speed = Math.max(speed, -MAX_SPEED / 2); // Backen går hälften så fort.
  // (speed / MAX_SPEED) = 0 när bilen står still, så den kan inte snurra på stället.
  // Math.min: nitron ska inte göra att bilen svänger snabbare än på vanlig toppfart.
  // Svänghjälp: kör bilen fast mot ett fast hinder (förra bildens kollision) får den svänga
  // lite på stället, så att den kan vända bort utan att backa. Åt samma håll som vanligt
  // (backar man vänder rattens effekt, som i en riktig bil).
  let turnFactor = Math.min(speed / MAX_SPEED, 1);
  if (contact.hard && throttle !== 0 && Math.abs(turnFactor) < PINNED_TURN) turnFactor = PINNED_TURN * throttle;
  heading += steer * TURN_RATE * (drifting ? DRIFT_TURN_BOOST : 1) * turnFactor * delta;
  // Rörelseriktningen hakar efter nosen. I drift hakar den långsamt, så bilen glider.
  // Greppet byts mjukt: snabbt ner när driften börjar, långsamt tillbaka när den släpps,
  // så att bilen glider ut i stället för att tvärstanna i sidled.
  // Kör man för fort och svänger hårt tappar bilen greppet av sig själv: ju fortare och ju
  // hårdare sväng, desto mer slirar den. Man har fortfarande kontroll, men får jobba lite.
  const slip = THREE.MathUtils.clamp((speed - SLIDE_SPEED) / (NITRO_MAX_SPEED - SLIDE_SPEED), 0, 1) * Math.abs(steer);
  sliding = !drifting && slip > 0.35;
  if (slip > 0) speed -= SLIDE_DRAG * slip * delta;
  // Vid vanlig fart (från ca 8 upp till toppfart) bara ett lätt släpp, så bilen känns lite levande utan att sladda.
  const cruise = THREE.MathUtils.clamp((speed - 8) / (MAX_SPEED - 8), 0, 1) * Math.abs(steer) * CRUISE_SLIP;
  const gripGoal = drifting ? DRIFT_GRIP : GRIP - (GRIP - SLIDE_GRIP) * Math.max(slip, cruise);
  // Greppet släpper snabbt och kommer tillbaka långsamt.
  grip = THREE.MathUtils.damp(grip, gripGoal, gripGoal < grip ? 8 : GRIP_RECOVERY, delta);
  slide = turnTowards(slide, heading, grip, delta);
  // sin/cos gör om vinkeln till en riktning.
  // Kollision: träd, lyktor, berg m.m. putsar ut bilen och låter den glida längs hindret
  // (ändrar speed och slide vid en träff, se collision.js). Bara vid manuell körning.
  crash.speed = speed;
  crash.slide = slide;
  crash.heading = heading;
  moveWithCollision(car.position, Math.sin(slide) * speed * delta, Math.cos(slide) * speed * delta, crash);
  speed = crash.speed;
  slide = crash.slide;
  // Håll kvar bilen innanför cirkeln runt världens mitt (den glider längs kanten).
  const fromCenterX = car.position.x - currentWorld.x;
  const fromCenterZ = car.position.z - currentWorld.z;
  const distance = Math.hypot(fromCenterX, fromCenterZ);
  if (distance > DRIVE_RADIUS) {
    car.position.x = currentWorld.x + fromCenterX * (DRIVE_RADIUS / distance);
    car.position.z = currentWorld.z + fromCenterZ * (DRIVE_RADIUS / distance);
  }
  car.rotation.y = heading;
  for (const wheel of frontWheels) wheel.rotation.y = THREE.MathUtils.damp(wheel.rotation.y, steer * MAX_STEER, 12, delta);
  // Ett hjul som rullar sträckan s vrids vinkeln s / radie.
  for (const spinner of spinners) spinner.rotation.x += (speed * delta) / WHEEL_RADIUS;
}
