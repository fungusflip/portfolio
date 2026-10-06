// ============================================================================
// teacups.js — rena tal (ingen three.js, ingen DOM) för var tekopparna får stå runt huset.
// ============================================================================
// Alla mått är i hemgruppens led (x = åt höger på skärmen, z = nedåt mot kameran, y = upp), samma som home.js.
// En kopp (storlek 1, mitt på tefatets undersida): tefatet är en skiva med radie 1.35 och höjd 0.14, koppen 1.35 hög
// (totalt 1.49), och handtaget (en torus) sticker ut åt +x i koppens eget led, 0.52 .. 1.44 från mitten.
// Koppens yaw (rotation.y) vrider handtaget: yaw = atan2(-dz, dx) pekar det åt (dx, dz).
// Reglerna: tefatet håller GAP till alla väggar, lister, stolpar och steg; handtaget pekar bort från väggen (eller längs
// kanten om det finns plats); en kopp som inte får plats krymper, men aldrig under MIN_SIZE (då är ok = false).
export const SAUCER = 1.35;
export const HANDLE_FROM = 0.52;
export const HANDLE_REACH = 1.44;
export const HANDLE_TUBE = 0.1;
export const CUP_HEIGHT = 1.49;
export const MIN_SIZE = 0.18;  // Mindre än så blir koppen en prick: hellre en större bräda.
export const GAP = 0.03;       // Luft mellan kopp och vägg/list/kant.
export const OVERHANG = 0.05;  // Hur mycket tefatet får hänga ut över en bräda.
export const LIFT = 0.005;     // Tefatets undersida ligger så här mycket över underlaget (ingen z-fight).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const yawFor = (dx, dz) => Math.atan2(-dz, dx);

// --- Avstånd till hinder -----------------------------------------------------------------------------------------------
// Hinder: { type: 'box', x0, x1, z0, z1, y0, y1 } | { type: 'circle', x, z, r, y0, y1 } | { type: 'path', pts: [[x, z], ...], w }.
// ground: true = gäller bara koppar som står på marken (parkeringsfickan, gångvägen), inte koppar uppe på hyllor.
// Returnerar { d, nx, nz }: d = avstånd till ytan (negativt = innanför) och nx, nz = riktningen bort från hindret.
export function obstacleDistance(ob, px, pz) {
  if (ob.type === 'circle') {
    const dx = px - ob.x;
    const dz = pz - ob.z;
    const len = Math.hypot(dx, dz) || 1e-9;
    return { d: len - ob.r, nx: dx / len, nz: dz / len };
  }
  if (ob.type === 'path') {
    let best = { d: Infinity, nx: 0, nz: 1 };
    for (let i = 0; i + 1 < ob.pts.length; i++) {
      const [ax, az] = ob.pts[i];
      const [bx, bz] = ob.pts[i + 1];
      const abx = bx - ax;
      const abz = bz - az;
      const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
      const qx = ax + abx * t;
      const qz = az + abz * t;
      const len = Math.hypot(px - qx, pz - qz) || 1e-9;
      const d = len - ob.w / 2;
      if (d < best.d) best = { d, nx: (px - qx) / len, nz: (pz - qz) / len };
    }
    return best;
  }
  const qx = clamp(px, ob.x0, ob.x1);
  const qz = clamp(pz, ob.z0, ob.z1);
  const outside = Math.hypot(px - qx, pz - qz);
  if (outside > 1e-9) return { d: outside, nx: (px - qx) / outside, nz: (pz - qz) / outside };
  // Innanför: ut åt närmaste sida.
  const sides = [[px - ob.x0, -1, 0], [ob.x1 - px, 1, 0], [pz - ob.z0, 0, -1], [ob.z1 - pz, 0, 1]];
  sides.sort((a, b) => a[0] - b[0]);
  return { d: -sides[0][0], nx: sides[0][1], nz: sides[0][2] };
}
// Är hindret i höjd med en kopp som står på y = base och är height hög?
function inReach(ob, base, height) {
  if (ob.ground) return base < 0.05;
  return base < ob.y1 - 1e-6 && base + height > ob.y0 + 1e-6;
}

// Tefatets frihet till alla hinder (negativ = det går in i något). others = [{x, z, size}] andra koppar (tefat mot tefat).
export function saucerClearance(x, z, size, base, obstacles, others = []) {
  const r = SAUCER * size;
  let min = Infinity;
  for (const ob of obstacles) {
    if (!inReach(ob, base, CUP_HEIGHT * size)) continue;
    min = Math.min(min, obstacleDistance(ob, x, z).d - r);
  }
  for (const o of others) min = Math.min(min, Math.hypot(x - o.x, z - o.z) - r - SAUCER * o.size);
  return min;
}
// Handtagets frihet (punkter längs torusen, minus rörets tjocklek). Tefatet räknas inte här.
export function handleClearance(x, z, size, yaw, base, obstacles, others = []) {
  const tube = HANDLE_TUBE * size;
  let min = Infinity;
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  for (let i = 0; i <= 6; i++) {
    const along = (HANDLE_FROM + ((HANDLE_REACH - HANDLE_FROM) * i) / 6) * size;
    const px = x + ax * along;
    const pz = z + az * along;
    for (const ob of obstacles) {
      if (!inReach(ob, base, CUP_HEIGHT * size)) continue;
      min = Math.min(min, obstacleDistance(ob, px, pz).d - tube);
    }
    for (const o of others) min = Math.min(min, Math.hypot(px - o.x, pz - o.z) - SAUCER * o.size - tube);
  }
  return min;
}

// --- Kopp på en hylla (fönsterbräda, bräda, trappsteg) ----------------------------------------------------------------
// Hyllan räknas i väggens led: o = en punkt på väggytan, (nx, nz) = väggens normal (ut från huset, längs en axel),
// u = avstånd ut från väggytan, t = sidled längs väggen (tangent = (nz, -nx), alltså +x för en vägg som vetter mot kameran).
//   backClear = hur långt ut från väggytan det finns saker (lister, karm, nästa trappsteg): tefatet håller sig bakom GAP.
//   uLo, uHi  = hyllans utsträckning ut från väggen; tLo, tHi = hyllans utsträckning i sidled.
//   t         = önskad sidledsplats (klämmas in på hyllan).
export function placeOnLedge({ size, o, nx, nz, backClear, uLo = 0, uHi, tLo, tHi, t = (tLo + tHi) / 2 }) {
  const tx = nz;
  const tz = -nx;
  const lo = Math.max(uLo - OVERHANG, backClear + GAP); // Tefatets bakkant: bakom hyllans kant (OVERHANG) och GAP framför det som sticker ut.
  const availU = uHi + OVERHANG - lo;
  const availT = tHi - tLo - 2 * GAP;
  let s = Math.min(size, availU / (2 * SAUCER), availT / (2 * SAUCER));
  const ok = s >= MIN_SIZE - 1e-9;
  s = Math.max(s, MIN_SIZE);
  const r = SAUCER * s;
  const u = clamp((uLo + uHi) / 2, lo + r, uHi + OVERHANG - r);
  const tt = clamp(t, tLo + GAP + r, Math.max(tLo + GAP + r, tHi - GAP - r));
  // Handtaget: längs kanten åt det håll där det finns mest plats, annars rakt ut från väggen.
  const tip = HANDLE_REACH * s;
  const roomLo = tt - (tLo + GAP);
  const roomHi = tHi - GAP - tt;
  let dirX = nx;
  let dirZ = nz;
  const sign = roomHi >= roomLo ? 1 : -1;
  if (Math.max(roomLo, roomHi) >= tip) {
    dirX = tx * sign;
    dirZ = tz * sign;
  }
  return { x: o.x + nx * u + tx * tt, z: o.z + nz * u + tz * tt, size: s, yaw: yawFor(dirX, dirZ), ok };
}

// --- Kopp på ett runt bord: (dx, dz) från bordets mitt, handtaget radiellt utåt --------------------------------------------
export function placeOnRound({ size, cx, cz, R, dx, dz }) {
  const dist = Math.hypot(dx, dz);
  const roomForSaucer = (R - 0.01 - dist) / SAUCER;
  const s = Math.max(Math.min(size, roomForSaucer), MIN_SIZE);
  const ok = Math.min(size, roomForSaucer) >= MIN_SIZE - 1e-9;
  return { x: cx + dx, z: cz + dz, size: s, yaw: yawFor(dist ? dx : 1, dist ? dz : 0), ok };
}

// --- Kopp på marken: skjuts ut ur väggar, sockel, gångväg ... och handtaget vrids så att det inte tar i någonting -----------
// pref = önskad yaw (varierar från kopp till kopp); används om handtaget inte tar i något åt det hållet.
export function placeOnGround({ x, z, size, pref = 0, obstacles, others = [], margin = 0.1 }) {
  const r = SAUCER * size;
  const need = r + GAP + margin;
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 24; pass++) {
    let moved = false;
    for (const ob of obstacles) {
      if (!inReach(ob, 0, CUP_HEIGHT * size)) continue;
      const { d, nx, nz } = obstacleDistance(ob, px, pz);
      if (d < need - 1e-6) {
        px += nx * (need - d);
        pz += nz * (need - d);
        moved = true;
      }
    }
    for (const o of others) {
      const d = Math.hypot(px - o.x, pz - o.z) - SAUCER * o.size;
      if (d < need - 1e-6) {
        const len = Math.hypot(px - o.x, pz - o.z) || 1e-9;
        px += ((px - o.x) / len) * (need - d);
        pz += ((pz - o.z) / len) * (need - d);
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Handtaget: prova önskat håll och sedan varvet runt tills det har GAP luft.
  let yaw = pref;
  let best = -Infinity;
  for (let i = 0; i < 16; i++) {
    const candidate = pref + (i * Math.PI) / 8;
    const room = handleClearance(px, pz, size, candidate, 0, obstacles, others);
    if (room > best + 1e-9) { best = room; yaw = candidate; }
    if (room >= GAP) { yaw = candidate; best = room; break; }
  }
  return { x: px, z: pz, size, yaw, ok: best >= 0 && saucerClearance(px, pz, size, 0, obstacles, others) >= 0 };
}

// --- Hela husets kopplayout ------------------------------------------------------------------------------------------------
// c = måtten från home.js. Returnerar hinder, hyllorna (så att home.js bygger bräderna av samma tal) och alla koppar.
// Kopparna: { x, y, z, size, yaw, ok, ... } i hemgruppens led; table.cups är relativt bordets mitt.
export function computeHomeCups(c) {
  const { GARAGE_FRONT, CABIN_X, CABIN_Z, CABIN_SIZE, WINDOW_X, DOOR_X, SHED_X, FOOTPATH, PAD_Z, PAD_HALF_W, PAD_HALF_L } = c;
  const CABIN_FRONT = CABIN_Z + CABIN_SIZE / 2;
  const GW = c.GARAGE_WIDTH / 2;
  const GD = c.GARAGE_DEPTH / 2;
  const box = (x0, x1, z0, z1, y0, y1, extra) => ({ type: 'box', x0, x1, z0, z1, y0, y1, ...extra });

  // Hyllorna (bygger home.js av de här). y = översta ytan koppen står på.
  const garageSill = { x0: -3.1, x1: -2.4, z0: GARAGE_FRONT, z1: GARAGE_FRONT + 0.7, top: 1.03, thick: 0.06 };
  const cabinSill = { x0: WINDOW_X - 0.8, x1: WINDOW_X + 0.8, z0: CABIN_FRONT - 0.07, z1: CABIN_FRONT + 0.6, top: 1.05, thick: 0.1 };
  const railPad = { cx: DOOR_X - 0.95, cz: CABIN_FRONT + 0.65, w: 0.56, d: 0.56, top: 0.985 + 0.03, thick: 0.03 };
  const step = { x0: DOOR_X - 0.7, x1: DOOR_X + 0.7, z0: CABIN_FRONT + 1.0, z1: CABIN_FRONT + 1.55, top: 0.08 };
  const table = { x: DOOR_X - 1.7, z: CABIN_FRONT + 1.1, R: 0.6, top: 0.695 };

  const obstacles = [
    box(-GW - 0.09, GW + 0.09, -GD - 0.02, GARAGE_FRONT + 0.09, 0, c.GARAGE_HEIGHT),     // Garaget inkl. sockel och lister.
    box(-GW - 0.25, GW + 0.25, -GD - 0.45, GD + 0.45, c.GARAGE_HEIGHT, c.GARAGE_HEIGHT + 1),  // Garagetaket med takfot.
    box(-2.775, -2.425, GARAGE_FRONT, GARAGE_FRONT + 0.09, 1.14, 2.06),                    // Garagefönstrets karm och spröjs.
    box(garageSill.x0, garageSill.x1, garageSill.z0, garageSill.z1, garageSill.top - garageSill.thick, garageSill.top),
    box(CABIN_X - CABIN_SIZE / 2 - 0.08, CABIN_X + CABIN_SIZE / 2 + 0.08, CABIN_Z - CABIN_SIZE / 2 - 0.08, CABIN_FRONT + 0.08, 0, c.CABIN_HEIGHT), // Stugan med sockel, knutbrädor, karmar, luckor.
    box(CABIN_X - CABIN_SIZE / 2 - 0.4, CABIN_X + CABIN_SIZE / 2 + 0.4, CABIN_Z - CABIN_SIZE / 2 - 0.45, CABIN_FRONT + 0.45, c.CABIN_HEIGHT, c.CABIN_HEIGHT + 2), // Stugtaket.
    box(cabinSill.x0, cabinSill.x1, cabinSill.z0, cabinSill.z1, cabinSill.top - cabinSill.thick, cabinSill.top),
    box(DOOR_X - 0.9, DOOR_X + 0.9, CABIN_FRONT, CABIN_FRONT + 1.0, 0, 0.16),              // Verandans platta.
    box(step.x0, step.x1, step.z0, step.z1, 0, step.top),                                  // Trappsteget.
    box(DOOR_X - 1.0, DOOR_X - 0.9, CABIN_FRONT + 0.045, CABIN_FRONT + 1.2, 0.18, railPad.top - railPad.thick), // Ledstång + undre list (ovan: brädan).
    box(DOOR_X - 1.01, DOOR_X - 0.89, CABIN_FRONT + 1.14, CABIN_FRONT + 1.26, 0, 2.35),     // Skärmtakets vänstra stolpe.
    box(DOOR_X + 0.89, DOOR_X + 1.01, CABIN_FRONT + 1.14, CABIN_FRONT + 1.26, 0, 2.35),     // ... och högra.
    box(DOOR_X - 1.1, DOOR_X + 1.1, CABIN_FRONT - 0.07, CABIN_FRONT + 1.27, 2.4, 2.8),      // Skärmtaket.
    box(railPad.cx - railPad.w / 2, railPad.cx + railPad.w / 2, railPad.cz - railPad.d / 2, railPad.cz + railPad.d / 2, railPad.top - railPad.thick, railPad.top), // Brädan på ledstången.
    { type: 'circle', x: table.x, z: table.z, r: table.R, y0: 0.62, y1: table.top },       // Bordet (skivan).
    { type: 'circle', x: table.x, z: table.z, r: 0.3, y0: 0, y1: 0.62 },                   // ... och foten.
    box(CABIN_X + 2.6 - 0.15, CABIN_X + 2.6 + 0.15, CABIN_FRONT + 0.5 - 0.15, CABIN_FRONT + 0.5 + 0.15, 0, 1.46), // Lyktan.
    box(SHED_X, SHED_X + 1.1, CABIN_Z - 2.0, CABIN_Z - 0.2, 0, 2.3),                        // Vedboden: trave, stolpar, tak.
    // Marken (alla höjder): parkeringsfickan och gångvägen.
    box(-PAD_HALF_W, PAD_HALF_W, PAD_Z - PAD_HALF_L, PAD_Z + PAD_HALF_L, 0, 0, { ground: true }),
    { type: 'path', pts: FOOTPATH, w: c.PATH_WIDTH, ground: true },
  ];

  // Kopparna uppe på huset.
  const up = [];
  const garageWall = { o: { x: 0, z: GARAGE_FRONT }, nx: 0, nz: 1 };
  up.push({
    ...placeOnLedge({ size: 0.2, ...garageWall, backClear: 0.09, uHi: garageSill.z1 - GARAGE_FRONT, tLo: garageSill.x0, tHi: garageSill.x1, t: -2.75 }),
    y: garageSill.top + LIFT, fill: 0.7, heat: 'hot',
  });
  const cabinWall = { o: { x: 0, z: CABIN_FRONT }, nx: 0, nz: 1 };
  for (const [dx, size, fill, heat] of [[-0.45, 0.22, 0.8, 'hot'], [0.45, 0.2, 0.4, 'cold']]) {
    up.push({
      ...placeOnLedge({ size, ...cabinWall, backClear: 0.08, uHi: cabinSill.z1 - CABIN_FRONT, tLo: cabinSill.x0, tHi: cabinSill.x1, t: WINDOW_X + dx }),
      y: cabinSill.top + LIFT, fill, heat,
    });
  }
  up.push({
    ...placeOnLedge({ size: 0.18, ...cabinWall, backClear: 0.07, uLo: railPad.cz - railPad.d / 2 - CABIN_FRONT, uHi: railPad.cz + railPad.d / 2 - CABIN_FRONT, tLo: railPad.cx - railPad.w / 2, tHi: railPad.cx + railPad.w / 2, t: railPad.cx }),
    y: railPad.top + LIFT, fill: 0.6, heat: 'hot',
  });
  up.push({
    ...placeOnLedge({ size: 0.18, ...cabinWall, backClear: step.z0 - CABIN_FRONT, uLo: step.z0 - CABIN_FRONT, uHi: step.z1 - CABIN_FRONT, tLo: step.x0, tHi: step.x1, t: DOOR_X + 0.4 }),
    y: step.top + LIFT, fill: 0.3, heat: 'cold',
  });
  const tableCups = [[-0.3, 0, 0.21, 0.75, 'hot'], [0.27, 0, 0.18, 0.2, 'cold']].map(([dx, dz, size, fill, heat]) => ({
    ...placeOnRound({ size, cx: table.x, cz: table.z, R: table.R, dx, dz }), dx, dz, y: table.top + LIFT, fill, heat,
  }));

  // Kopparna på marken: [x, z, storlek, fylld, värme]. Skjuts ut ur väggar m.m. om de står för nära.
  const ground = [];
  c.GROUND_CUPS.forEach(([x, z, size, fill, heat], i) => {
    const placed = placeOnGround({ x, z, size, pref: 1.3 + i * 2.1, obstacles, others: ground });
    ground.push({ ...placed, y: 0, fill, heat });
  });
  return { obstacles, garageSill, cabinSill, railPad, step, table, up, tableCups, ground };
}
