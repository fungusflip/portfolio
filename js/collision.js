// ============================================================================
// collision.js — mjuk kollision: bilen puttas ut ur fasta saker och glider längs dem.
// ============================================================================
// Hindren är cirklar { x, z, radius } (träd, lyktor, stolpar, berg ...). Bilen är två
// cirklar, en vid nosen och en vid aktern, så att den fyller sin 1.2 x 2.4 stora kaross.
// Den här filen behöver varken THREE eller sidan, så den går att köra i vanliga Node.
// car.js äger fart och riktning; det här ändrar dem bara när bilen träffar något.

export const CAR_RADIUS = 0.6;      // Varje bilcirkels radie (halva bredden).
export const CAR_HALF_LENGTH = 0.6; // Cirklarnas avstånd från bilens mitt (nos + akter täcker 2.4).
const CELL = 4;                     // Hindren sorteras in i rutor, så att vi slipper testa alla.
const ITERATIONS = 3;               // Hur många gånger bilen putsas ut per steg (flera hinder nära varandra).
const MAX_STEP = 0.35;              // Längsta sträckan bilen flyttas åt gången: annars far den igenom smala hinder.
const MAX_STEPS = 24;
const EPSILON = 0.002;              // Lite extra utanför hindret, så att bilen inte darrar på kanten.
const HARD_HIT = 12;                // Fart in i hindret som räknas som en full smäll.
const MAX_LOSS = 0.25;              // Så stor del av farten som går förlorad vid en full smäll.

const grid = new Map(); // ruta → lista med hinder som når in i rutan.

function cellKey(i, j) {
  return (i * 73856093) ^ (j * 19349663); // Två heltal blir ett nummer.
}

// Lägger till hinder: [{ x, z, radius }, ...]. Kan anropas flera gånger.
export function addObstacles(list) {
  for (const obstacle of list) {
    const reach = obstacle.radius + CAR_RADIUS + CAR_HALF_LENGTH; // Så långt ut kan en bilcirkel vara och nudda.
    const i0 = Math.floor((obstacle.x - reach) / CELL);
    const i1 = Math.floor((obstacle.x + reach) / CELL);
    const j0 = Math.floor((obstacle.z - reach) / CELL);
    const j1 = Math.floor((obstacle.z + reach) / CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = cellKey(i, j);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(obstacle);
      }
    }
  }
}

export function clearObstacles() {
  grid.clear();
}

// Senaste smällen, så att ljud eller skakning kan läsa den senare.
// strength 0–1 (1 = full fart rakt in), x/z = var, time = performance.now() då.
export const lastImpact = { strength: 0, x: 0, z: 0, time: 0 };

// Putsar ut en cirkel (mitt centerX/centerZ) ur hindren genom att flytta `position`.
// Returnerar antal träffar. Normalerna (från hindret ut mot bilen) läggs i `normals`.
function pushOutOfCircles(position, centerX, centerZ, radius, normals, fallbackX, fallbackZ) {
  const list = grid.get(cellKey(Math.floor(centerX / CELL), Math.floor(centerZ / CELL)));
  if (!list) return 0;
  let hits = 0;
  for (const obstacle of list) {
    const dx = centerX - obstacle.x;
    const dz = centerZ - obstacle.z;
    const minimum = obstacle.radius + radius;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= minimum * minimum) continue;
    const distance = Math.sqrt(distanceSquared);
    // Exakt i hindrets mitt finns ingen riktning: välj bakåt längs bilen.
    const nx = distance > 1e-6 ? dx / distance : fallbackX;
    const nz = distance > 1e-6 ? dz / distance : fallbackZ;
    const push = minimum - distance + EPSILON;
    position.x += nx * push;
    position.z += nz * push;
    centerX += nx * push; // Cirkelns mitt flyttade med, så nästa hinder ser rätt läge.
    centerZ += nz * push;
    if (normals && normals.length < 16) normals.push(nx, nz);
    hits++;
  }
  return hits;
}

// Puttar ut bilen (position { x, z }) ur hindren. Utan heading testas en cirkel med
// radien carRadius; med heading (bilens nos, radianer) två cirklar, nos och akter.
// Returnerar antal träffar. normals (valfri lista) fylls med [nx, nz, nx, nz ...].
export function resolveCollisions(position, carRadius = CAR_RADIUS, heading = null, normals = null) {
  let total = 0;
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    let hits = 0;
    if (heading === null) {
      hits = pushOutOfCircles(position, position.x, position.z, carRadius, normals, 1, 0);
    } else {
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      for (const sign of [1, -1]) {
        hits += pushOutOfCircles(
          position,
          position.x + fx * CAR_HALF_LENGTH * sign, position.z + fz * CAR_HALF_LENGTH * sign,
          carRadius, normals, -fx * sign, -fz * sign
        );
      }
    }
    total += hits;
    if (hits === 0) break; // Ren bil: klart.
  }
  return total;
}

const normalList = [];

// Flyttar bilen (position { x, z }) dx, dz och krockar med hindren på vägen.
// state = { speed, slide, heading } ändras vid träff: farten in i hindret tas bort och
// farten längs det blir kvar (bilen glider), minus en liten förlust vid hårda smällar.
// Flyttar i små steg så att en snabb bil inte tunnlar genom smala hinder.
// Returnerar smällens styrka 0–1.
export function moveWithCollision(position, dx, dz, state, carRadius = CAR_RADIUS) {
  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP)));
  let strongest = 0;
  for (let step = 0; step < steps; step++) {
    const remaining = steps - step;
    const stepX = dx / remaining;
    const stepZ = dz / remaining;
    dx -= stepX;
    dz -= stepZ;
    position.x += stepX;
    position.z += stepZ;
    normalList.length = 0;
    if (resolveCollisions(position, carRadius, state.heading, normalList) === 0) continue;
    // Ta bort den del av farten som pekar in i hindret, för varje träffad yta.
    let vx = Math.sin(state.slide) * state.speed;
    let vz = Math.cos(state.slide) * state.speed;
    const oldSpeed = state.speed;
    let loss = 0;
    for (let i = 0; i < normalList.length; i += 2) {
      const into = vx * normalList[i] + vz * normalList[i + 1];
      if (into >= 0) continue; // Redan på väg bort.
      vx -= into * normalList[i];
      vz -= into * normalList[i + 1];
      const hardness = Math.min(1, -into / HARD_HIT);
      loss = Math.max(loss, MAX_LOSS * hardness);
      strongest = Math.max(strongest, hardness);
    }
    if (oldSpeed === 0) continue;
    const newSpeed = Math.hypot(vx, vz) * (1 - loss);
    const sign = oldSpeed > 0 ? 1 : -1; // Backar bilen pekar rörelsen åt andra hållet än slide.
    if (newSpeed > 1e-4) {
      state.slide = Math.atan2(vx * sign, vz * sign);
      state.speed = newSpeed * sign;
    } else {
      state.speed = 0;
    }
    // Resten av sträckan följer den nya riktningen och farten.
    const left = Math.hypot(dx, dz) * (Math.abs(state.speed) / Math.abs(oldSpeed));
    dx = Math.sin(state.slide) * sign * left;
    dz = Math.cos(state.slide) * sign * left;
  }
  if (strongest > 0.05) {
    lastImpact.strength = strongest;
    lastImpact.x = position.x;
    lastImpact.z = position.z;
    lastImpact.time = performance.now();
  }
  return strongest;
}
